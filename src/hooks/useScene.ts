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
    const mesh2Helper = useRef<Map<THREE.SkinnedMesh, THREE.SkeletonHelper> | null>(new Map());

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
            side: THREE.DoubleSide,
        }));
        const n = skel[0].length;
        const bonesArray: THREE.Bone[] = [];
        const joints = skel[0];
        const adjList = new Array(n).fill(0).map(() => new Array<number>());
        skel[0].forEach(_ => bonesArray.push(new THREE.Bone()));
        skel[1].forEach(([x, y]) => {
            adjList[x].push(y);
            adjList[y].push(x);
        });
        let stack = [[0, -1]];
        while (stack.length > 0) {
            let [u, p] = stack.pop();
            for (let v of adjList[u])
                if (v !== p) {
                    stack.push([v, u]);
                    bonesArray[u].add(bonesArray[v]);
                    bonesArray[v].position.set(
                        joints[v].x - joints[u].x,
                        joints[v].y - joints[u].y,
                        joints[v].z - joints[u].z
                    );
                }
        }
        bonesArray[0].position.set(joints[0].x, joints[0].y, joints[0].z);
        skinnedMesh.add(bonesArray[0]);
        skinnedMesh.bind(new THREE.Skeleton(bonesArray));

        return skinnedMesh;
    }, []);

    const addSkinnedMesh = useCallback((mesh: THREE.SkinnedMesh) => {
        if (!sceneRef.current) return;

        mesh.skeleton.bones.forEach(bone => {
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(5, 16, 16),
                new THREE.MeshBasicMaterial({
                    color: 0x00ff00,
                    transparent: true,
                    opacity: 0.8,
                    depthTest: false,
                    depthWrite: false
                })
            );
            bone.add(sphere);
            sphere.position.set(0, 0, 0);
            sphere.renderOrder = 1000;
        });
        const helper = new THREE.SkeletonHelper(mesh);
        helper.material = new THREE.LineBasicMaterial({
            color: 0x0000ff,
            depthTest: false,
            depthWrite: false
        });
        helper.renderOrder = 1000;
        mesh2Helper.current.set(mesh, helper);
        sceneRef.current.add(mesh);
        sceneRef.current.add(helper);
        sceneRef.current.updateMatrixWorld(true);
    }, [sceneRef]);

    const delSkinnedMesh = useCallback((mesh: THREE.SkinnedMesh) => {
        if (!sceneRef.current) return;

        mesh.skeleton.bones.forEach((bone) => {
            const sphere = bone.children.find((c) => c instanceof THREE.Mesh);
            sceneRef.current.remove(sphere);
            sphere.geometry.dispose();
            sphere.material.dispose();
        });
        const helper = mesh2Helper.current.get(mesh);
        sceneRef.current.remove(helper);
        helper.geometry.dispose();
        helper.material.dispose();

        sceneRef.current.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    }, [sceneRef]);

    return {
        createSkinnedMesh,
        addSkinnedMesh,
        delSkinnedMesh,
        menuContext,
        setMenuContext,
    };
}
