import { useState, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { SceneAction } from '@/interface/action';
import { SceneHooks } from '@/hooks/useScene';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SceneState {
    /** Ordered list of all SkinnedMeshes currently in the scene. */
    meshes: THREE.SkinnedMesh[];

    /** Wire up the Three.js scene API once the viewport mounts. */
    setSceneApi: (api: SceneHooks) => void;

    /**
     * Append a mesh to the scene + end of the mesh list, record an action.
     * Use for: draw, duplicate.
     */
    addMesh: (mesh: THREE.SkinnedMesh, action: SceneAction) => void;

    /**
     * Remove a specific mesh from the scene + mesh list by reference, record an action.
     * Use for: delete.
     */
    dropMesh: (mesh: THREE.SkinnedMesh, action: SceneAction) => void;

    /**
     * Replace one mesh with another in the same list slot (no history entry).
     * Combine with recordAction when the swap itself needs to be undoable.
     * Use for: rig-edit completion.
     */
    swapMesh: (oldMesh: THREE.SkinnedMesh, newMesh: THREE.SkinnedMesh) => void;

    /**
     * Record an action without mutating the mesh list.
     * Use for: transform, rig (in-place mutations on the object itself).
     */
    recordAction: (action: SceneAction) => void;

    /** Undo the most recent recorded action. */
    undo: () => void;

    /** Reactive: true when the undo stack is non-empty. */
    canUndo: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSceneState(): SceneState {
    const [meshes,  setMeshes]  = useState<THREE.SkinnedMesh[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const historyRef = useRef<SceneAction[]>([]);
    const sceneApiRef = useRef<SceneHooks | null>(null);

    // ── helpers ───────────────────────────────────────────────────────────────

    const api = () => sceneApiRef.current;

    const pushHistory = useCallback((action: SceneAction) => {
        historyRef.current.push(action);
        setCanUndo(true);
    }, []);

    const popHistory = useCallback((): SceneAction | undefined => {
        const action = historyRef.current.pop();
        setCanUndo(historyRef.current.length > 0);
        return action;
    }, []);

    const applyMatrix = (obj: THREE.Object3D, mat: THREE.Matrix4) => {
        mat.decompose(obj.position, obj.quaternion as THREE.Quaternion, obj.scale);
        obj.updateMatrix();
    };

    // ── public API ────────────────────────────────────────────────────────────

    const setSceneApi = useCallback((a: SceneHooks) => {
        sceneApiRef.current = a;
    }, []);

    const addMesh = useCallback((mesh: THREE.SkinnedMesh, action: SceneAction) => {
        api()?.insertObject(mesh);
        setMeshes((prev) => [...prev, mesh]);
        pushHistory(action);
    }, [pushHistory]);

    const dropMesh = useCallback((mesh: THREE.SkinnedMesh, action: SceneAction) => {
        api()?.removeObject(mesh);
        setMeshes((prev) => prev.filter((m) => m !== mesh));
        pushHistory(action);
    }, [pushHistory]);

    const swapMesh = useCallback((oldMesh: THREE.SkinnedMesh, newMesh: THREE.SkinnedMesh) => {
        api()?.removeObject(oldMesh);
        api()?.insertObject(newMesh);
        setMeshes((prev) => prev.map((m) => (m === oldMesh ? newMesh : m)));
    }, []);

    const recordAction = useCallback((action: SceneAction) => {
        pushHistory(action);
    }, [pushHistory]);

    // ── undo ──────────────────────────────────────────────────────────────────

    const undo = useCallback(() => {
        const action = popHistory();
        if (!action) return;

        setMeshes((prev) => {
            const a = api();

            switch (action.type) {
                // draw / duplicate — remove the mesh that was appended
                case 'draw':
                case 'duplicate': {
                    a?.removeObject(action.mesh);
                    return prev.filter((m) => m !== action.mesh);
                }

                // delete — put the mesh back at the end of the list
                case 'delete': {
                    a?.insertObject(action.mesh);
                    return [...prev, action.mesh];
                }

                // cut — remove the 2 results, restore the original
                case 'cut': {
                    action.results.forEach((r) => a?.removeObject(r));
                    a?.insertObject(action.original);
                    return [
                        ...prev.filter((m) => !action.results.includes(m)),
                        action.original,
                    ];
                }

                // merge — remove merged, restore both originals
                case 'merge': {
                    a?.removeObject(action.merged);
                    action.originals.forEach((o) => a?.insertObject(o));
                    return [
                        ...prev.filter((m) => m !== action.merged),
                        ...action.originals,
                    ];
                }

                // transform — restore mesh local matrix (TRS)
                case 'transform': {
                    applyMatrix(action.mesh, action.prevMatrix);
                    return prev;
                }

                // rig — restore bone local matrix, then sync skeleton
                case 'rig': {
                    applyMatrix(action.bone, action.prevMatrix);
                    prev.find((m) => m.skeleton.bones.includes(action.bone))?.skeleton.update();
                    return prev;
                }
            }
        });
    }, [popHistory]);

    return { meshes, setSceneApi, addMesh, dropMesh, swapMesh, recordAction, undo, canUndo };
}
