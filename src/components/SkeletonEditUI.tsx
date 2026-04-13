'use client';

import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Vec3 } from '@/interface';
import { SceneHooks } from '@/hooks/useScene';
import { SkeletonBone } from '@/utils/threeSkel';
import { SkeletonJoint } from '@/utils/threeSkel';
import { useScene } from '@/hooks/useScene';
import ToolControlBar, { ToolMode } from '@/components/ToolControlBar';
import FlowUI from '@/components/base/FlowUI';

import { computeSkinWeightsGlobal } from '@/core/skin';
import { skinnedMeshFromData } from '@/utils/threeMesh';
import { skinnedMeshToData } from '@/utils/threeMesh';
import { buildMesh } from '@/utils/threeMesh';

const JOINT_DEFAULT_COLOR  = 0x00ff00;
const JOINT_SELECTED_COLOR = 0xffaa00;
const BONE_DEFAULT_COLOR   = 0x0000ff;
const BONE_SELECTED_COLOR  = 0xffaa00;

export interface SkelOpsUIProps {
    skinnedMesh: THREE.SkinnedMesh;
    onComplete?: (meshes: THREE.SkinnedMesh[]) => void;
    onCancel?: () => void;
}

export default function SkelOpsUI({
    skinnedMesh,
    onComplete,
    onCancel,
}: SkelOpsUIProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneApi = useScene(containerRef);
    const apiRef = useRef<SceneHooks>(null);
    apiRef.current = sceneApi;

    const meshRef = useRef<THREE.Mesh | null>(null);
    const helperRef = useRef<THREE.Group | null>(null);
    const selectedBoneRef = useRef<[THREE.Bone, THREE.Bone] | null>(null);
    const selectedJointRef = useRef<THREE.Bone | null>(null);

    const [activeTool, setActiveTool] = useState<ToolMode>('select');
    const [cameraLocked, setCameraLocked] = useState(false);
    const activeToolRef = useRef(activeTool);
    activeToolRef.current = activeTool;

    // --- Helpers ---

    const findBoneHelper = useCallback((boneA: THREE.Bone, boneB: THREE.Bone) => {
        return helperRef.current.children.find(child => {
            if (!child?.isHelperBone)   return false;
            if (child.jointA !== boneA && child.jointB !== boneA) return false;
            if (child.jointA !== boneB && child.jointB !== boneB) return false;
            return true;
        });
    }, []);

    const findJointHelper = useCallback((bone: THREE.Bone) => {
        return helperRef.current.children.find(child => {
            if (!child?.isHelperJoint) return false;
            if (child.joint !== bone) return false;
            return true;
        });
    }, []);

    const removeHelper = useCallback((helper: SkeletonBone | SkeletonJoint | null) => {
        if (helper) {
            helper.dispose();
            helperRef.current.remove(helper);
        }
    }, []);

    const clearSelection = useCallback(() => {
        // Unhighlight bone segment
        if (selectedBoneRef.current) {
            const helper = findBoneHelper(selectedBoneRef.current[0], selectedBoneRef.current[1]);
            if (helper) {
                helper.material.color.set(BONE_DEFAULT_COLOR);
                helper.material.needsUpdate = true;
            }
            selectedBoneRef.current = null;
        }
        // Unhighlight joint
        if (selectedJointRef.current) {
            const helper = findJointHelper(selectedJointRef.current);
            if (helper) {
                helper.material.color.set(JOINT_DEFAULT_COLOR);
                helper.material.needsUpdate = true;
            }
            selectedJointRef.current = null;
        }
        apiRef.current?.detach();
    }, [findBoneHelper, findJointHelper]);

    const selectJoint = useCallback((bone: THREE.Bone) => {
        clearSelection();
        selectedJointRef.current = bone;
        const helper = findJointHelper(bone);
        if (helper) {
            helper.material.color.set(JOINT_SELECTED_COLOR);
            helper.material.needsUpdate = true;
        }
        // If a transform tool is active, attach immediately
        if (activeToolRef.current !== 'select') {
            apiRef.current?.setMode(activeToolRef.current);
            apiRef.current?.setSpace('world');
            apiRef.current?.attach(bone);
        }
    }, [clearSelection, findJointHelper]);

    const selectBoneSegment = useCallback((boneA: THREE.Bone, boneB: THREE.Bone) => {
        clearSelection();
        selectedBoneRef.current = [boneA, boneB];
        const helper = findBoneHelper(boneA, boneB);
        if (helper) {
            helper.material.color.set(BONE_SELECTED_COLOR);
            helper.material.needsUpdate = true;
        }
    }, [clearSelection, findBoneHelper]);

    // --- Tool control ---

    const handleToolChange = useCallback((tool: ToolMode) => {
        setActiveTool(tool);
        activeToolRef.current = tool;
        if (tool === 'select') {
            apiRef.current?.detach();
        } else if (selectedJointRef.current) {
            apiRef.current?.setMode(tool);
            apiRef.current?.setSpace('world');
            apiRef.current?.attach(selectedJointRef.current);
        }
    }, []);

    const handleLockToggle = useCallback(() => {
        setCameraLocked(prev => {
            const next = !prev;
            apiRef.current?.setOrbitEnabled(!next);
            return next;
        });
    }, []);

    // --- Setup scene objects ---

    useEffect(() => {
        const { mesh, skel } = skinnedMeshToData(skinnedMesh);

        meshRef.current = buildMesh(mesh, false);
        helperRef.current = new THREE.Group();
        helperRef.current.userData.isHelper = true;

        const tmpBones = [];

        skel[0].forEach((joint, _) => {
            const newBone = new THREE.Bone();
            newBone.position.set(joint.x, joint.y, joint.z);
            tmpBones.push(newBone);
            helperRef.current.add(new SkeletonJoint(newBone));
            apiRef.current?.insertObject(newBone);
        });
        skel[1].forEach(([i0, i1], _) => {
            helperRef.current.add(new SkeletonBone(
                tmpBones[i0],
                tmpBones[i1]
            ));
        });
        apiRef.current?.insertObject(helperRef.current);
        apiRef.current?.insertObject(meshRef.current);

        return () => {
            if (helperRef.current) {
                helperRef.current.children.forEach(child => (child as any).dispose?.());
                apiRef.current?.removeObject(helperRef.current);
                helperRef.current = null;
            }
            if (meshRef.current) {
                apiRef.current?.removeObject(meshRef.current);
                meshRef.current = null;
            }
        };
    }, [skinnedMesh]);

    // --- Event handlers ---

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();

            if (key !== 'x' && key !== ' ') return;
            if (selectedBoneRef.current === null) return;

            apiRef.current?.detach();

            let [boneA, boneB] = selectedBoneRef.current;

            const posA = new THREE.Vector3();
            const posB = new THREE.Vector3();
            boneA.getWorldPosition(posA);
            boneB.getWorldPosition(posB);
            const posC = (new THREE.Vector3()).addVectors(posA, posB).multiplyScalar(0.5);

            if (key === 'x') {
                // Merge: move boneA to midpoint, remove boneB
                boneA.position.copy(posC);

                removeHelper(findBoneHelper(boneA, boneB));
                removeHelper(findJointHelper(boneB));

                for (const child of helperRef.current.children) if (child?.isHelperBone) {
                    if (child.jointA === boneB) child.jointA = boneA;
                    if (child.jointB === boneB) child.jointB = boneA;
                }
                selectedBoneRef.current = null;
                selectJoint(boneA);
            } else {
                // Split: insert new bone at midpoint
                const boneC = new THREE.Bone();
                boneC.position.copy(posC);
                apiRef.current.insertObject(boneC);

                removeHelper(findBoneHelper(boneA, boneB));
                helperRef.current.add(new SkeletonJoint(boneC));
                helperRef.current.add(new SkeletonBone(boneA, boneC));
                helperRef.current.add(new SkeletonBone(boneC, boneB));
                selectedBoneRef.current = null;
                selectJoint(boneC);
            }
        };

        const handleMouseUp = (event: MouseEvent) => {
            if (event.button !== 0) return;

            const result = apiRef.current.raycast(event.clientX, event.clientY);

            if (result?.isBone) {
                selectJoint(result as THREE.Bone);
            } else if (Array.isArray(result)) {
                selectBoneSegment(result[0], result[1]);
            } else {
                clearSelection();
            }
        };

        canvas.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            canvas.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [clearSelection, selectJoint, selectBoneSegment, findBoneHelper, findJointHelper, removeHelper]);

    // --- Complete ---

    const onNext = useCallback(() => {
        const V = [], F = [];
        const J = [], B = [];

        const posAttr = meshRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
        const idxAttr = meshRef.current.geometry.getIndex()!;

        for (let i = 0; i < posAttr.count; i++) {
            const v = new THREE.Vector3();
            v.fromBufferAttribute(posAttr, i);
            V.push(new Vec3(v.x, v.y, v.z));
        }
        for (let i = 0; i < idxAttr.count; i += 3) {
            F.push([
                idxAttr.getX(i),
                idxAttr.getX(i+1),
                idxAttr.getX(i+2),
            ]);
        }
        const joints = helperRef.current.children.filter(child => child?.isHelperJoint).map(child => child.joint);
        const bones = helperRef.current.children.filter(child => child?.isHelperBone).map(child => [child.jointA, child.jointB]);

        joints.forEach((joint: THREE.Bone) => {
            const pos = new THREE.Vector3();
            joint.getWorldPosition(pos);
            J.push(new Vec3(pos.x, pos.y, pos.z));
        });
        bones.forEach((bone: [THREE.Bone, THREE.Bone]) => {
            const x = joints.indexOf(bone[0]);
            const y = joints.indexOf(bone[1]);
            B.push([x, y]);
        });

        const skinWeights = computeSkinWeightsGlobal([V, F], [J, B]);
        const mesh = skinnedMeshFromData({
            mesh: [V, F],
            skel: [J, B],
            skinWeights,
            skinIndices: null,
        });
        onComplete?.(mesh);
    }, []);

    const steps = useMemo(() => [
        { name: 'Skeleton Refinement', desc: 'Edit joints and bones interactively.', params: [] },
    ], []);

    const handleWireframeToggle = useCallback((enabled: boolean) => {
        apiRef.current?.setViewWireframe(enabled);
    }, []);
    const handleSkeletonToggle = useCallback((enabled: boolean) => {
        apiRef.current?.setViewSkeleton(enabled);
    }, []);

    return (
        <FlowUI
            instructions="Click a bone segment to select it. Press X to merge endpoints, Space to split. Click a joint to select it, then use G/R/S to transform."
            steps={steps}
            currentStep={1}
            onNext={onNext}
            onBack={() => {}}
            onCancel={onCancel}
            onFinish={onNext}
            onWireframeToggle={handleWireframeToggle}
            onSkeletonToggle={handleSkeletonToggle}
        >
            <div ref={containerRef} className="w-full h-full" />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40">
                <ToolControlBar
                    activeTool={activeTool}
                    cameraLocked={cameraLocked}
                    onToolChange={handleToolChange}
                    onLockToggle={handleLockToggle}
                />
            </div>
        </FlowUI>
    );
}