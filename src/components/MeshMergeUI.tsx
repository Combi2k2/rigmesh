'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { Leva, useControls, button } from 'leva';
import * as THREE from 'three';
import { useMeshMerge } from '@/hooks/useMeshMerge';
import { SceneHooks } from '@/hooks/useScene';
import { SkeletonConnector } from '@/utils/threeSkel';
import { traceMesh } from '@/utils/threeSkel';

import Scene from '@/components/template/Scene';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface MeshMergeUIProps {
    mesh1: THREE.SkinnedMesh;
    mesh2: THREE.SkinnedMesh;
    onComplete?: (mesh: THREE.SkinnedMesh) => void;
    onCancel?: () => void;
}

export default function MeshMergeUI({
    mesh1,
    mesh2,
    onComplete,
    onCancel,
}: MeshMergeUIProps) {
    const clone1Ref = useRef<THREE.SkinnedMesh | null>(null);
    const clone2Ref = useRef<THREE.SkinnedMesh | null>(null);
    const connectorRef = useRef<SkeletonConnector | null>(null);
    const sceneRef = useRef<SceneHooks | null>(null);
    const flowApi = useMeshMerge(onComplete);
    const [ready, setReady] = useState(false);

    const handleReady = useCallback((api: SceneHooks) => {
        sceneRef.current = api;
        setReady(true);

        clone1Ref.current = SkeletonUtils.clone(mesh1) as THREE.SkinnedMesh;
        clone2Ref.current = SkeletonUtils.clone(mesh2) as THREE.SkinnedMesh;
        connectorRef.current = new SkeletonConnector(clone1Ref.current, clone2Ref.current);
        connectorRef.current.updateMatrixWorld();

        sceneRef.current.insertObject(clone1Ref.current);
        sceneRef.current.insertObject(clone2Ref.current);
        sceneRef.current.insertObject(connectorRef.current);
        flowApi.onReady(clone1Ref.current, clone2Ref.current);
        flowApi.setParam({
            type: connectorRef.current.mode,
            src: connectorRef.current.source,
            tgt: connectorRef.current.target,
        });
    }, []);

    useEffect(() => {
        if (!ready) return;
        if (flowApi.state.currentStep !== 1)
            return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (flowApi.state.currentStep !== 1 || !ready)    return;
            if (e.key === ' ') {
                const mode = connectorRef.current.mode;

                if (mode === 'snap')    connectorRef.current.mode = 'split';
                if (mode === 'split')   connectorRef.current.mode = 'connect';
                if (mode === 'connect') connectorRef.current.mode = 'snap';

                connectorRef.current.updateMatrixWorld(true);
                flowApi.setParam({
                    type: connectorRef.current.mode,
                    src: connectorRef.current.source,
                    tgt: connectorRef.current.target,
                });
            }
        };
        const handleMouseDown = (e: MouseEvent) => {
            if (flowApi.state.currentStep !== 1 || !ready)    return;
            const mesh = traceMesh(sceneRef.current.raycast(e.clientX, e.clientY));
    
            if (mesh === clone2Ref.current) {
                const tmp = clone1Ref.current;
                clone1Ref.current = clone2Ref.current;
                clone2Ref.current = tmp;
                flowApi.setSwap(prev => !prev);
            }
            if (mesh === clone1Ref.current) {
                connectorRef.current.skelA = clone1Ref.current.skeleton;
                connectorRef.current.skelB = clone2Ref.current.skeleton;
                connectorRef.current.updateMatrixWorld();
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            if (flowApi.state.currentStep !== 1 || !ready)    return;
            flowApi.setParam({
                type: connectorRef.current.mode,
                src: connectorRef.current.source,
                tgt: connectorRef.current.target,
            });
        };
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [ready, flowApi.state.currentStep]);

    useEffect(() => {
        if (!ready) return;
        if (flowApi.state.currentStep === 2) {
            sceneRef.current.detach();
            sceneRef.current.removeObject(clone1Ref.current);
            sceneRef.current.removeObject(clone2Ref.current);
            sceneRef.current.removeObject(connectorRef.current);
            sceneRef.current.insertObject(flowApi.state.resultRef.current);

            clone1Ref.current.geometry.dispose();
            clone1Ref.current.material.dispose();
            clone2Ref.current.geometry.dispose();
            clone2Ref.current.material.dispose();
            connectorRef.current.dispose();

            clone1Ref.current = null;
            clone2Ref.current = null;
            connectorRef.current = null;
        }
    }, [ready, flowApi.state.currentStep]);

    useControls('Step 1: Drag to desired position', {}, {collapsed: flowApi.state.currentStep !== 1});
    useControls('Step 2: Mesh Cleanup', {}, {collapsed: flowApi.state.currentStep !== 2});
    useControls('Step 3: Mesh Stitch', {}, {collapsed: flowApi.state.currentStep !== 3});
    useControls('Step 4: Mesh Smooth', {
        smoothLayers: { value: flowApi.params.smoothLayers, min: 0, max: 10, step:    1, onChange: v => flowApi.onParamChange.setSmoothLayers(v) },
        smoothFactor: { value: flowApi.params.smoothFactor, min: 0, max: 10, step: 0.05, onChange: v => flowApi.onParamChange.setSmoothFactor(v) },
    }, {collapsed: flowApi.state.currentStep !== 4});
    useControls('Step 5: SkinWeight Computation', {}, {collapsed: flowApi.state.currentStep !== 5});

    useControls('Navigation', {
        Back: button(() => flowApi.onBack(), { disabled: flowApi.state.currentStep <= 1 }),
        Next: button(() => flowApi.onNext()),
        Cancel: button(() => {flowApi.onReset(); onCancel?.();}),
    });

    return (
        <div className="absolute inset-0 z-50 flex bg-white dark:bg-gray-900">
            <Scene
                enableRig={false}
                enableTransform={true}
                onSceneReady={handleReady}
            />
            <Leva/>
        </div>
    );
}