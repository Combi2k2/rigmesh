'use client';

import { useRef, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Vec3 } from '@/interface';
import { SceneHooks } from '@/hooks/useScene';
import { SkeletonBone } from '@/utils/threeSkel';
import { SkeletonJoint } from '@/utils/threeSkel';
import { useScene } from '@/hooks/useScene';
import Controller from '@/components/template/Controller';

import { computeSkinWeightsGlobal } from '@/core/skin';
import { skinnedMeshFromData } from '@/utils/threeMesh';
import { skinnedMeshToData } from '@/utils/threeMesh';
import { buildMesh } from '@/utils/threeMesh';

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
    const selectRef = useRef<[THREE.Bone, THREE.Bone] | null>(null);

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


    useEffect(() => {
        const { mesh, skel, skinWeights, skinIndices } = skinnedMeshToData(skinnedMesh);
        
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
    }, [skinnedMesh]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            apiRef.current.detach();
            const key = event.key.toLowerCase();
            if (selectRef.current === null) return;
            if (selectRef.current instanceof THREE.Bone)
                return;

            if (key !== 'x' && key !== ' ') return;

            let [boneA, boneB] = selectRef.current;
            
            const posA = new THREE.Vector3();
            const posB = new THREE.Vector3();
            boneA.getWorldPosition(posA);
            boneB.getWorldPosition(posB);
            const posC = (new THREE.Vector3()).addVectors(posA, posB).multiplyScalar(0.5);

            if (key === 'x') {
                boneA.position.copy(posC);

                removeHelper(findBoneHelper(boneA, boneB));
                removeHelper(findJointHelper(boneB));

                for (const child of helperRef.current.children) if (child?.isHelperBone) {
                    if (child.jointA === boneB) child.jointA = boneA;
                    if (child.jointB === boneB) child.jointB = boneA;
                }
            } else {
                const boneC = new THREE.Bone();
                boneC.position.copy(posC);

                removeHelper(new SkeletonBone(boneA, boneB));
                helperRef.current.add(new SkeletonJoint(boneC));
                helperRef.current.add(new SkeletonBone(boneA, boneC));
                helperRef.current.add(new SkeletonBone(boneC, boneB));
            }
        };

        const handleLeftClick = (event: MouseEvent) => {
            if (event.button !== 0) return;
            if (selectRef.current !== null) {
                const helper = findBoneHelper(selectRef.current[0], selectRef.current[1]);
                if (helper) {
                    helper.material.color.set(0x0000ff);
                    helper.material.needsUpdate = true;
                }
            }
            const result = apiRef.current.raycast(event.clientX, event.clientY);
            if (result?.isBone) {
                apiRef.current.attach(result);
                apiRef.current.setSpace('world');
                apiRef.current.setMode('translate');
            } else {
                apiRef.current.detach();
            }
            if (!Array.isArray(result)) {
                selectRef.current = null;
            } else {
                selectRef.current = result as [THREE.Bone, THREE.Bone];
                const helper = findBoneHelper(selectRef.current[0], selectRef.current[1]);
                if (helper) {
                    helper.material.color.set(0xffaa00);
                    helper.material.needsUpdate = true;
                }
            }
        };
        canvas.addEventListener('mousedown', handleLeftClick);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            canvas.removeEventListener('mousedown', handleLeftClick);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

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
        {
            name: 'Skeleton Refinement',
            desc: "Click on a bone segment to select it. Press X to split the bone segment, or Space to merge 2 endpoints.",
            params: [],
        },
    ], []);

    return (
        <div className="absolute inset-0 z-50 flex flex-col sm:flex-row bg-white dark:bg-gray-900">
            <div ref={containerRef} className="flex-1 min-w-0 min-h-0 relative"/>
            <div
                role="complementary"
                className="flex-shrink-0 w-full sm:w-80 border-l border-gray-700 bg-gray-900 overflow-auto shadow-xl flex flex-col"
                data-mantine-color-scheme="dark"
            >
                <div className="p-4 flex-1 min-h-0">
                    <Controller
                        currentStep={1}
                        onNext={onNext}
                        onCancel={onCancel}
                        steps={steps}
                    />
                </div>
            </div>
        </div>
    );
}