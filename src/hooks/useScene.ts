'use client';

import { useRef, useCallback, useState, RefObject } from 'react';
import * as THREE from 'three';
import { Vec3 } from '@/interface';
import { useViewSpace } from './useViewSpace';

export type SkelData = [Vec3[], [number, number][]];
export type MeshData = [Vec3[], number[][]];

export type MenuAction = 'copy' | 'delete' | 'rig' | 'cut' | 'merge';

export interface SceneMenuContext {
    selectedMeshes: THREE.SkinnedMesh[];
    selectedAction: MenuAction | null;
}

export interface SceneHooks {
    createSkinnedMesh: (mesh: MeshData, skel: SkelData, skinWeights: number[][], skinIndices: number[][]) => THREE.SkinnedMesh | null;
    addSkinnedMesh: (mesh: THREE.SkinnedMesh) => void;
    delSkinnedMesh: (mesh: THREE.SkinnedMesh) => void;
    menuContext: SceneMenuContext | null;
    setMenuContext: (context: SceneMenuContext | null) => void;
}
/**
 * Hook for managing skinned meshes in a 3D scene
 * 
 * Provides functions to create, add, and remove skinned meshes from the scene.
 */
export function useScene(sceneRef: RefObject<THREE.Scene>): SceneHooks {
    const [menuContext, setMenuContext] = useState<SceneMenuContext | null>(null);

    const createSkinnedMesh = useCallback((
        mesh: MeshData,
        skel: SkelData,
        skinWeights: number[][],
        skinIndices: number[][]
    ): THREE.SkinnedMesh | null => {
        if (!sceneRef.current) return null;

        for (let i = 0; i < skinWeights.length; i++) {
            let weights = skinWeights[i];
            let indices = skinIndices[i];

            indices.sort((a, b) => weights[b] - weights[a]);
            indices.splice(4);
            weights = indices.map(idx => weights[idx]);

            let sum = weights.reduce((sum, w) => sum + w, 0) || 1;

            skinWeights[i] = weights.map(w => w / sum);
            skinIndices[i] = indices;
        }
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(mesh[0].length * 3);
        mesh[0].forEach((v, i) => {
            positions[i * 3] = v.x;
            positions[i * 3 + 1] = v.y;
            positions[i * 3 + 2] = v.z;
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(mesh[1].flat());
        geometry.computeVertexNormals();

        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights.flat(), 4));
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices.flat(), 4));

        const skinnedMesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({
            color: 0xffffff,
            skinning: true,
            side: THREE.DoubleSide
        }));

        const bonesArray: THREE.Bone[] = [];
        const joints = skel[0];

        skel[0].forEach(_ => bonesArray.push(new THREE.Bone()));
        skel[1].forEach(([x, y]) => {
            if (x > y) [x, y] = [y, x];

            bonesArray[x].add(bonesArray[y]);
            bonesArray[y].position.set(
                joints[y].x - joints[x].x,
                joints[y].y - joints[x].y,
                joints[y].z - joints[x].z
            );
        });
        bonesArray[0].position.set(joints[0].x, joints[0].y, joints[0].z);
        bonesArray[0].updateMatrixWorld();
        bonesArray.forEach(bone => {
            skinnedMesh.add(bone);
            bone.updateMatrix();
        });

        skinnedMesh.bind(new THREE.Skeleton(bonesArray));

        return skinnedMesh;
    }, []);

    const addSkinnedMesh = useCallback((mesh: THREE.SkinnedMesh) => {
        if (!sceneRef.current) return;
        
        mesh.geometry.computeBoundingBox();
        const boundingBox = mesh.geometry.boundingBox;
        
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);

        const box = new THREE.Mesh(
            new THREE.BoxGeometry(
                boundingBox.max.x - boundingBox.min.x,
                boundingBox.max.y - boundingBox.min.y,
                boundingBox.max.z - boundingBox.min.z
            ),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        box.position.copy(center);
        mesh.position.sub(center);

        // Initialize box matrices before adding mesh
        box.updateMatrix();
        box.updateMatrixWorld(true);

        box.add(mesh);

        sceneRef.current.add(box);
    }, [sceneRef]);

    const delSkinnedMesh = useCallback((mesh: THREE.SkinnedMesh) => {
        if (!sceneRef.current) return;
        
        sceneRef.current.remove(mesh.parent);
        sceneRef.current.remove(mesh);

        mesh.geometry.dispose();
        mesh.material.dispose();

        mesh.parent.material.dispose();
        mesh.parent.geometry.dispose();
    }, [sceneRef]);

    return {
        createSkinnedMesh,
        addSkinnedMesh,
        delSkinnedMesh,
        menuContext,
        setMenuContext,
    };
}
