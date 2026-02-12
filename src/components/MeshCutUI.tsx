'use client';

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useMeshCut } from '@/hooks/useMeshCut';
import { SceneHooks } from '@/hooks/useScene';

import Scene from '@/components/template/Scene';
import Controller from '@/components/template/Controller';
import { computeCutPlaneFromScreenLine } from '@/core/meshcut';
import { ScreenLine } from '@/core/meshcut';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface MeshCutUIProps {
    skinnedMesh: THREE.SkinnedMesh;
    onComplete?: (meshes: THREE.SkinnedMesh[]) => void;
    onCancel?: () => void;
}

export default function MeshCutUI({
    skinnedMesh,
    onComplete,
    onCancel,
}: MeshCutUIProps) {
    const sceneRef = useRef<SceneHooks | null>(null);
    const cloneRef = useRef<THREE.SkinnedMesh | null>(null);
    const flowApi = useMeshCut(onComplete);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rectRef = useRef<DOMRect | null>(null);

    const [ready, setReady] = useState(false);
    const [point1, setPoint1] = useState<{ x: number; y: number } | null>(null);
    const [point2, setPoint2] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);

    const handleReady = useCallback((api: SceneHooks) => {
        sceneRef.current = api;
        setReady(true);

        cloneRef.current = SkeletonUtils.clone(skinnedMesh) as THREE.SkinnedMesh;
        sceneRef.current.insertObject(cloneRef.current);
        flowApi.onMeshReady(cloneRef.current);

        canvasRef.current = api.getCanvas();
        cameraRef.current = api.getCamera();
        rectRef.current = canvasRef.current.getBoundingClientRect();
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (flowApi.state.currentStep !== 1)    return;
        if (!ready || !isDrawing) return;
        e.preventDefault();
        e.stopPropagation();
        const point = {
            x: e.clientX - rectRef.current.left,
            y: e.clientY - rectRef.current.top
        };
        if (!point1) {
            setPoint1(point);
            setIsDragging(true);
        } else {
            setPoint2(point);
        }
    };
    const handlePointerMove = (e: React.PointerEvent) => {
        if (flowApi.state.currentStep !== 1)        return;
        if (!ready || !isDrawing || !isDragging)    return;
        e.preventDefault();
        e.stopPropagation();
        const point = {
            x: e.clientX - rectRef.current.left,
            y: e.clientY - rectRef.current.top
        };
        setPoint2(point);
    };
    const handlePointerUp = (e: React.PointerEvent) => {
        if (flowApi.state.currentStep !== 1)    return;
        if (!ready || !isDrawing) return;
        if (isDragging)
            setIsDragging(false);
    };

    useEffect(() => {
        if (!ready) return;
        if (flowApi.state.currentStep !== 1)
            return;

        const localToNDC = (x: number, y: number): [number, number] => {
            const ndcX = (x / rectRef.current.width) * 2 - 1;
            const ndcY = -((y / rectRef.current.height) * 2 - 1);
            return [ndcX, ndcY];
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (flowApi.state.currentStep !== 1 || !ready)    return;
            if (e.key === 'c' || e.key === 'C') {
                setIsDrawing(prev => !prev);
                setIsDragging(false);
                setPoint1(null);
                setPoint2(null);
            } else if (e.key === 'Enter') { 
                if (point1 && point2) {
                    const ndc1 = localToNDC(point1.x, point1.y);
                    const ndc2 = localToNDC(point2.x, point2.y);
                    const line: ScreenLine = [ndc1, ndc2];
                    const plane = computeCutPlaneFromScreenLine(line, cameraRef.current);
                    flowApi.onCutReady(plane);
                    flowApi.state.resultRef.current.forEach(mesh => {
                        sceneRef.current.insertObject(mesh);
                    });
                    sceneRef.current.removeObject(cloneRef.current);

                    setIsDrawing(false);
                    setIsDragging(false);
                    setPoint1(null);
                    setPoint2(null);
                }
            } else if (e.key === 'Escape') {
                setIsDrawing(false);
                setIsDragging(false);
                setPoint1(null);
                setPoint2(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [ready, flowApi.state.currentStep, point1, point2]);

    const steps = useMemo(() => [
        { name: 'Draw Cut Line', desc: 'Press C to start/stop drawing, Enter to confirm, Escape to cancel', params: [] },
        { name: 'Mesh Stitch', desc: '', params: [] },
        {
            name: 'Mesh Smooth',
            desc: '',
            params: [
                { name: 'smoothLayers', value: flowApi.params.smoothLayers, min: 0, max: 5, step:    1, onChange: flowApi.onParamChange.setSmoothLayers },
                { name: 'smoothFactor', value: flowApi.params.smoothFactor, min: 0, max: 5, step: 0.05, onChange: flowApi.onParamChange.setSmoothFactor },
            ],
        },
        { name: 'SkinWeight Computation', desc: '', params: [] },
    ], [flowApi.params.smoothLayers, flowApi.params.smoothFactor]);

    return (
        <div className="absolute inset-0 z-50 flex flex-col sm:flex-row bg-white dark:bg-gray-900">
            <div className="flex-1 min-w-0 min-h-0 relative">
                <Scene
                    enableRig={false}
                    enableTransform={true}
                    onSceneReady={handleReady}
                />
                {flowApi.state.currentStep === 1 && ready && (
                    <>
                    {isDrawing && (
                        <div
                            className="absolute inset-0 z-10 cursor-crosshair bg-black/10 transition-colors duration-200"
                            style={{boxShadow: 'inset 0 0 0 3px rgba(0, 255, 255, 0.3)'}}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                        />
                    )}
                    {isDrawing && (
                        <svg
                            width={sceneRef.current?.getCanvas()?.width ?? 0}
                            height={sceneRef.current?.getCanvas()?.height ?? 0}
                            className="absolute left-0 top-0 pointer-events-none z-20"
                            viewBox={`0 0 ${sceneRef.current?.getCanvas()?.width ?? 0} ${sceneRef.current?.getCanvas()?.height ?? 0}`}
                            preserveAspectRatio="none"
                        >
                            {point1 && point2 && (
                                <line
                                    x1={point1.x} y1={point1.y}
                                    x2={point2.x} y2={point2.y}
                                    stroke='cyan'
                                    strokeWidth={3}
                                />
                            )}
                        </svg>
                    )}
                    </>
                )}
            </div>
            <div
                role="complementary"
                className="flex-shrink-0 w-full sm:w-80 border-l border-gray-700 bg-gray-900 overflow-auto shadow-xl flex flex-col"
                data-mantine-color-scheme="dark"
            >
                <div className="p-4 flex-1 min-h-0">
                    <Controller
                        currentStep={flowApi.state.currentStep}
                        onNext={flowApi.onNext}
                        onCancel={() => { flowApi.onReset(); onCancel?.(); }}
                        steps={steps}
                    />
                </div>
            </div>
        </div>
    );
}
