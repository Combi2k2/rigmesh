'use client';

import { useRef, useCallback, RefObject } from 'react';
import * as THREE from 'three';

export interface ViewSpaceMeshHooks {
    addSkinnedMesh: (mesh: THREE.SkinnedMesh) => void;
    delSkinnedMesh: (mesh: THREE.SkinnedMesh) => void;
}

export function useViewSpaceMesh(sceneRef: RefObject<THREE.Scene>): ViewSpaceMeshHooks {
    const mesh2Helper = useRef<Map<number, THREE.SkeletonHelper>>(new Map());
    const meshCounter = useRef(0);

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
        meshCounter.current++;
        mesh2Helper.current.set(meshCounter.current, helper);
        mesh.userData.id = meshCounter.current;
        sceneRef.current.add(mesh);
        sceneRef.current.add(helper);
        sceneRef.current.updateMatrixWorld(true);
    }, [sceneRef]);

    const delSkinnedMesh = useCallback((mesh: THREE.SkinnedMesh) => {
        if (!sceneRef.current || !mesh) return;

        // Remove bone spheres
        mesh.skeleton?.bones?.forEach((bone) => {
            const sphere = bone.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh | undefined;
            if (sphere) {
                bone.remove(sphere);
                sphere.geometry?.dispose();
                (sphere.material as THREE.Material)?.dispose();
            }
        });
        const helper = mesh2Helper.current.get(mesh.userData.id);
        if (helper) {
            sceneRef.current.remove(helper);
            helper.geometry?.dispose();
            (helper.material as THREE.Material)?.dispose();
            mesh2Helper.current.delete(mesh.userData.id);
        }

        // Remove mesh
        sceneRef.current.remove(mesh);
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material)?.dispose();
    }, [sceneRef]);

    return {
        addSkinnedMesh,
        delSkinnedMesh,
    };
}