import * as THREE from 'three';

/**
 * Union of all reversible scene actions stored in undo history.
 * All mesh/bone fields are live object references — no deep copies.
 *
 * Undo semantics per type:
 *  draw       → remove `mesh` from scene + list
 *  duplicate  → remove `mesh` from scene + list
 *  delete     → re-insert `mesh` into scene + append to end of list
 *  cut        → remove `results` from scene + list, re-insert `original`
 *  merge      → remove `merged` from scene + list, re-insert both `originals`
 *  transform  → decompose `prevMatrix` back onto `mesh` (position/quaternion/scale)
 *  rig        → decompose `prevMatrix` back onto `bone`
 */
export type SceneAction =
    | { type: 'draw';      mesh: THREE.SkinnedMesh }
    | { type: 'duplicate'; mesh: THREE.SkinnedMesh }
    | { type: 'delete';    mesh: THREE.SkinnedMesh }
    | { type: 'cut';       original: THREE.SkinnedMesh; results: [THREE.SkinnedMesh, THREE.SkinnedMesh] }
    | { type: 'merge';     originals: [THREE.SkinnedMesh, THREE.SkinnedMesh]; merged: THREE.SkinnedMesh }
    | { type: 'transform'; mesh: THREE.SkinnedMesh; prevMatrix: THREE.Matrix4 }
    | { type: 'rig';       bone: THREE.Bone; prevMatrix: THREE.Matrix4 };
