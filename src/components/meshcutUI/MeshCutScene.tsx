'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useViewSpace } from '@/hooks/useViewSpace';
import { useViewSpaceMesh } from '@/hooks/useViewSpaceMesh';
import type { ScreenLine } from '@/core/meshcut';

const COLORS = {
    BACKGROUND: 0x1a1a2e,
    CUT_LINE: 'cyan',
    CUT_LINE_PREVIEW: 'rgba(0, 255, 255, 0.5)',
    RESULT_COLORS: [0x22c55e, 0xf59e0b, 0x8b5cf6, 0xef4444],
} as const;

type DrawMode = 'camera' | 'draw';

export interface MeshCutSceneProps {
    skinnedMesh: THREE.SkinnedMesh;
    currentStep: number;
    resultMeshes: THREE.SkinnedMesh[] | null;
    onLineComplete: (line: ScreenLine) => void;
    onCameraRef?: (camera: THREE.PerspectiveCamera | null) => void;
}

export default function MeshCutScene({
    skinnedMesh,
    currentStep,
    resultMeshes,
    onLineComplete,
    onCameraRef,
}: MeshCutSceneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const vs = useViewSpace(containerRef);
    const vsMesh = useViewSpaceMesh(vs.sceneRef);
    
    const cloneRef = useRef<THREE.SkinnedMesh | null>(null);
    const resultMeshRefs = useRef<THREE.SkinnedMesh[]>([]);
    
    const [ready, setReady] = useState(false);
    const [drawMode, setDrawMode] = useState<DrawMode>('camera');
    const [point1, setPoint1] = useState<{ x: number; y: number } | null>(null);
    const [point2, setPoint2] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
    const [pendingLine, setPendingLine] = useState<ScreenLine | null>(null);

    // Pass camera ref to parent
    useEffect(() => {
        onCameraRef?.(vs.cameraRef.current);
    }, [vs.cameraRef.current, onCameraRef]);

    // Setup scene with cloned mesh - only run once when scene is ready
    const sceneInitializedRef = useRef(false);
    useEffect(() => {
        if (sceneInitializedRef.current) return;
        
        const scene = vs.sceneRef.current;
        const camera = vs.cameraRef.current;
        const renderer = vs.rendererRef.current;
        if (!scene || !camera || !renderer || !skinnedMesh) return;

        sceneInitializedRef.current = true;

        scene.background = new THREE.Color(COLORS.BACKGROUND);
        camera.position.set(0, 0, 150);
        camera.lookAt(new THREE.Vector3(0, 0, 0));

        const cloned = SkeletonUtils.clone(skinnedMesh) as THREE.SkinnedMesh;
        cloned.position.set(0, 0, 0);
        cloneRef.current = cloned;
        vsMesh.addSkinnedMesh(cloned);

        setReady(true);

        return () => {
            if (cloneRef.current) {
                vsMesh.delSkinnedMesh(cloneRef.current);
                cloneRef.current = null;
            }
            sceneInitializedRef.current = false;
        };
    }, [vs.sceneRef, vs.cameraRef, vs.rendererRef, skinnedMesh, vsMesh.addSkinnedMesh, vsMesh.delSkinnedMesh]);

    // Remove original clone when results are shown
    useEffect(() => {
        if (currentStep >= 2 && resultMeshes && resultMeshes.length > 0 && cloneRef.current) {
            vsMesh.delSkinnedMesh(cloneRef.current);
            cloneRef.current = null;
        }
    }, [currentStep, resultMeshes, vsMesh.delSkinnedMesh]);

    // Display result meshes when available (step 2)
    useEffect(() => {
        const scene = vs.sceneRef.current;
        if (!scene) return;

        // Clean up old result meshes from scene (don't dispose - they're managed by the hook)
        resultMeshRefs.current.forEach(mesh => {
            vsMesh.delSkinnedMesh(mesh);
        });
        resultMeshRefs.current = [];

        // Add new result meshes if in step 2
        if (currentStep >= 2 && resultMeshes && resultMeshes.length > 0) {
            console.log("Adding result meshes:", resultMeshes.length);
            resultMeshes.forEach((m, i) => {
                const pos = m.geometry.getAttribute('position');
                const idx = m.geometry.getIndex();
                console.log(`  Mesh ${i}: ${pos?.count ?? 0} vertices, ${(idx?.count ?? 0) / 3} faces, ${m.skeleton?.bones?.length ?? 0} bones`);
            });
            resultMeshes.forEach((mesh, index) => {
                // Set color based on index
                (mesh.material as THREE.MeshStandardMaterial).color.setHex(
                    COLORS.RESULT_COLORS[index % COLORS.RESULT_COLORS.length]
                );
                
                vsMesh.addSkinnedMesh(mesh);
                resultMeshRefs.current.push(mesh);
            });
        }

        return () => {
            // Only remove from scene, don't dispose (meshes are managed by hook)
            resultMeshRefs.current.forEach(mesh => vsMesh.delSkinnedMesh(mesh));
            resultMeshRefs.current = [];
        };
    }, [currentStep, resultMeshes, vs.sceneRef, vsMesh.addSkinnedMesh, vsMesh.delSkinnedMesh]);

    // Track canvas rect
    useEffect(() => {
        const canvas = vs.rendererRef.current?.domElement;
        if (!canvas || !ready) return;
        setCanvasRect(canvas.getBoundingClientRect());
        const ro = new ResizeObserver(() => {
            setCanvasRect(canvas.getBoundingClientRect());
        });
        ro.observe(canvas);
        return () => ro.disconnect();
    }, [vs.rendererRef, ready]);

    // Reset drawing state when step changes
    useEffect(() => {
        if (currentStep === 1) {
            setDrawMode('camera');
            setPoint1(null);
            setPoint2(null);
            setPendingLine(null);
            setIsDragging(false);
        }
    }, [currentStep]);

    // Keyboard handling
    useEffect(() => {
        if (currentStep !== 1) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'c' || e.key === 'C') {
                if (drawMode === 'camera') {
                    // Enter draw mode
                    setDrawMode('draw');
                    setPoint1(null);
                    setPoint2(null);
                    setPendingLine(null);
                } else {
                    // Cancel drawing, return to camera mode
                    setDrawMode('camera');
                    setPoint1(null);
                    setPoint2(null);
                    setPendingLine(null);
                    setIsDragging(false);
                }
            } else if (e.key === 'Enter') {
                if (pendingLine) {
                    // Confirm the line and proceed
                    onLineComplete(pendingLine);
                    setDrawMode('camera');
                    setPoint1(null);
                    setPoint2(null);
                    setPendingLine(null);
                }
            } else if (e.key === 'Escape') {
                // Cancel current drawing
                setPoint1(null);
                setPoint2(null);
                setPendingLine(null);
                setIsDragging(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentStep, drawMode, pendingLine, onLineComplete]);

    const clientToLocal = useCallback(
        (clientX: number, clientY: number) => {
            const rect = canvasRect ?? vs.rendererRef.current?.domElement?.getBoundingClientRect();
            if (!rect) return { x: 0, y: 0 };
            return { x: clientX - rect.left, y: clientY - rect.top };
        },
        [canvasRect, vs.rendererRef]
    );

    const localToNDC = useCallback(
        (x: number, y: number): [number, number] => {
            const rect = canvasRect ?? vs.rendererRef.current?.domElement?.getBoundingClientRect();
            if (!rect || rect.width === 0 || rect.height === 0) return [0, 0];
            const ndcX = (x / rect.width) * 2 - 1;
            const ndcY = -((y / rect.height) * 2 - 1);
            return [ndcX, ndcY];
        },
        [canvasRect, vs.rendererRef]
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (currentStep !== 1 || drawMode !== 'draw') return;
            e.preventDefault();
            e.stopPropagation();
            
            const local = clientToLocal(e.clientX, e.clientY);
            
            if (!point1) {
                // First point - start drawing
                setPoint1(local);
                setPoint2(null);
                setIsDragging(true);
                setPendingLine(null);
            } else if (!isDragging) {
                // Click-and-click mode: second click completes the line
                setPoint2(local);
                const line: ScreenLine = [
                    localToNDC(point1.x, point1.y),
                    localToNDC(local.x, local.y),
                ];
                setPendingLine(line);
            }
        },
        [currentStep, drawMode, point1, isDragging, clientToLocal, localToNDC]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (currentStep !== 1 || drawMode !== 'draw') return;
            
            const local = clientToLocal(e.clientX, e.clientY);
            setMousePos(local);
            
            if (isDragging && point1) {
                // Drag mode: update point2 as user drags
                setPoint2(local);
            }
        },
        [currentStep, drawMode, isDragging, point1, clientToLocal]
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (currentStep !== 1 || drawMode !== 'draw' || !isDragging || !point1) return;
            
            const local = clientToLocal(e.clientX, e.clientY);
            
            // Check if it was a drag (moved significantly) or just a click
            const dx = local.x - point1.x;
            const dy = local.y - point1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 10) {
                // Drag-and-drop: complete the line
                setPoint2(local);
                const line: ScreenLine = [
                    localToNDC(point1.x, point1.y),
                    localToNDC(local.x, local.y),
                ];
                setPendingLine(line);
                setIsDragging(false);
            } else {
                // Was just a click, switch to click-and-click mode
                setIsDragging(false);
            }
        },
        [currentStep, drawMode, isDragging, point1, clientToLocal, localToNDC]
    );

    const rect = canvasRect;
    const w = rect?.width ?? 1;
    const h = rect?.height ?? 1;

    // Determine what line to show
    const showLine = point1 && (point2 || (isDragging && mousePos));
    const lineEnd = point2 || mousePos;

    return (
        <div className="w-2/3 border-r border-gray-300 dark:border-gray-700 relative">
            {/* 3D Canvas container */}
            <div ref={containerRef} className="absolute inset-0" />
            
            {/* Step 1: Drawing mode */}
            {currentStep === 1 && ready && (
                <>
                    {/* Transparent overlay that freezes the canvas - only in draw mode */}
                    {drawMode === 'draw' && (
                        <div
                            className="absolute inset-0 z-10 cursor-crosshair bg-black/10 transition-colors duration-200"
                            style={{ 
                                boxShadow: 'inset 0 0 0 3px rgba(0, 255, 255, 0.3)'
                            }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                        />
                    )}
                    
                    {/* SVG overlay for line visualization */}
                    {drawMode === 'draw' && rect && (
                        <svg
                            width={w}
                            height={h}
                            className="absolute left-0 top-0 pointer-events-none z-20"
                            viewBox={`0 0 ${w} ${h}`}
                            preserveAspectRatio="none"
                        >
                            {showLine && lineEnd && (
                                <line
                                    x1={point1!.x}
                                    y1={point1!.y}
                                    x2={lineEnd.x}
                                    y2={lineEnd.y}
                                    stroke={pendingLine ? COLORS.CUT_LINE : COLORS.CUT_LINE_PREVIEW}
                                    strokeWidth={pendingLine ? 3 : 2}
                                    strokeDasharray={pendingLine ? undefined : '5,5'}
                                />
                            )}
                            {point1 && !point2 && (
                                <circle 
                                    cx={point1.x} 
                                    cy={point1.y} 
                                    r={6} 
                                    fill={COLORS.CUT_LINE} 
                                    opacity={0.8} 
                                />
                            )}
                            {pendingLine && point1 && point2 && (
                                <>
                                    <circle cx={point1.x} cy={point1.y} r={6} fill={COLORS.CUT_LINE} />
                                    <circle cx={point2.x} cy={point2.y} r={6} fill={COLORS.CUT_LINE} />
                                </>
                            )}
                        </svg>
                    )}
                    
                    {/* Mode indicator and instructions */}
                    <div className="absolute bottom-4 left-4 bg-black/70 text-white px-4 py-3 rounded-lg z-30 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${drawMode === 'draw' ? 'bg-cyan-400 animate-pulse' : 'bg-green-400'}`} />
                            <span className="font-medium">
                                {drawMode === 'camera' ? 'Camera Mode' : 'Draw Mode (Canvas Frozen)'}
                            </span>
                        </div>
                        <div className="text-sm text-gray-300">
                            {drawMode === 'camera' ? (
                                'Pan/zoom to position. Press [C] to freeze & draw.'
                            ) : pendingLine ? (
                                'Press [Enter] to confirm, [C] to unfreeze, [Esc] to redraw.'
                            ) : point1 ? (
                                'Click or drag to set end point. [Esc] to restart.'
                            ) : (
                                'Click or drag to draw cut line. [C] to unfreeze.'
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Step 2: Result info overlay */}
            {currentStep >= 2 && resultMeshes && resultMeshes.length > 0 && (
                <div className="absolute top-4 left-4 bg-black/70 text-white px-4 py-3 rounded-lg z-10">
                    <div className="font-medium">Cut Complete</div>
                    <div className="text-sm text-gray-300">
                        {resultMeshes.length} piece{resultMeshes.length > 1 ? 's' : ''} created
                    </div>
                </div>
            )}
        </div>
    );
}
