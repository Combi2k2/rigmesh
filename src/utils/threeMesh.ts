import * as THREE from 'three';
import { Vec3, SkinnedMeshData } from '@/interface';
import { MeshData } from '@/interface';
import { SkelData } from '@/interface';
import { deepCopy } from '@/utils/misc';

/**
 * Build a Three.js mesh from vertex/face data.
 * @param mesh - [vertices, faces] tuple
 * @param skin - if true returns a SkinnedMesh, otherwise a plain Mesh
 */
export const buildMesh = (mesh: MeshData, skin: boolean = true): THREE.SkinnedMesh | THREE.Mesh => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
    });
    const positions = new Float32Array(mesh[0].length * 3);
    mesh[0].forEach((v, i) => {
        positions[i * 3] = v.x;
        positions[i * 3 + 1] = v.y;
        positions[i * 3 + 2] = v.z;
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(mesh[1].flat());
    geometry.computeVertexNormals();

    if (skin)   return new THREE.SkinnedMesh(geometry, material);
    else        return new THREE.Mesh(geometry, material);
}
/**
 * Build a Three.js Skeleton from joint positions and bone connectivity.
 * Constructs a bone hierarchy via DFS starting from the root bone.
 * @param skel - [joints, bones] tuple
 * @param root - index of the root bone (default 0)
 */
export const buildSkel = (skel: SkelData, root: number = 0): THREE.Skeleton => {
    const joints = skel[0];
    const adjList = new Array(joints.length).fill(0).map(() => new Array<number>());
    const bonesArray: THREE.Bone[] = [];
    skel[0].forEach((joint, i) => {
        bonesArray.push(new THREE.Bone());
        bonesArray[i].position.set(joint.x, joint.y, joint.z);
    });
    skel[1].forEach(([x, y]) => {
        adjList[x].push(y);
        adjList[y].push(x);
    });
    let stack: [number, number][] = [];
    if (root >= 0 && root < bonesArray.length)
        stack.push([root, -1]);

    while (stack.length > 0) {
        let [u, p] = stack.pop();
        for (let v of adjList[u])
            if (v !== p) {
                stack.push([v, u]);
                bonesArray[u].attach(bonesArray[v]);
            }
    }
    return new THREE.Skeleton(bonesArray);
}
/**
 * Assign skin weights to a SkinnedMesh.
 * Converts per-bone-segment weights into per-joint weights by projecting each
 * vertex onto its influencing bone segments and distributing weight to the
 * endpoint joints based on the projection parameter t.
 * Results are stored as `skinWeight` / `skinIndex` buffer attributes (top 4 joints)
 * and as `boneSkinWeights` / `boneSkinIndices` attributes (original per-bone values).
 * @param mesh - target SkinnedMesh (must already have a bound skeleton and a `bone` attribute)
 * @param skinWeights - per-vertex array of bone-segment weights
 * @param skinIndices - per-vertex array of bone-segment indices (null = identity mapping)
 */
export const setSkinWeights = (
    mesh: THREE.SkinnedMesh,
    skinWeights: number[][],
    skinIndices: number[][] | null
) => {
    mesh.updateMatrixWorld(true);
    const geometry = mesh.geometry;
    const skeleton = mesh.skeleton;
    const bones = mesh.userData.bones || [];
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nV = skinWeights.length;

    if (!skinIndices)
        skinIndices = new Array(nV).fill(null);
    
    const localWeights: number[][] = new Array(nV);
    const localIndices: number[][] = new Array(nV);

    let jointWeights = new Array(nV).fill(0).map(() => new Array(skeleton.bones.length).fill(0));
    let jointIndices = new Array(nV);

    for (let i = 0; i < nV; i++) {
        let weights = skinWeights[i];
        let indices = skinIndices[i];

        if (!indices)
            indices = Array.from({ length: weights.length }, (_, i) => i);
        
        localWeights[i] = deepCopy(weights);
        localIndices[i] = deepCopy(indices);

        for (let j = 0; j < weights.length; j++) {
            const k = localIndices[i][j];
            const w = localWeights[i][j];
            const [i0, i1] = bones[k];

            let v0 = new THREE.Vector3();
            let v1 = new THREE.Vector3();
            let v = new THREE.Vector3();

            v.fromBufferAttribute(posAttr, i);
            v.applyMatrix4(mesh.matrixWorld);
            skeleton.bones[i0].getWorldPosition(v0);
            skeleton.bones[i1].getWorldPosition(v1);

            const bone = v1.sub(v0);
            const boneLenSq = bone.lengthSq();
            const t = boneLenSq < 1e-6 ? 0.5 : Math.max(0, Math.min(1, v.sub(v0).dot(bone) / boneLenSq));

            jointWeights[i][i0] += w * (1 - t);
            jointWeights[i][i1] += w * t;
        }
        weights = jointWeights[i];
        indices = new Array(weights.length).fill(0).map((_, i) => i);
        indices.sort((a, b) => weights[b] - weights[a]);
        indices.splice(Math.min(4, indices.length));
        weights = indices.map(idx => weights[idx]);
        while (weights.length < 4) {
            weights.push(0);
            indices.push(0);
        }
        jointWeights[i] = weights;
        jointIndices[i] = indices;
    }
    mesh.userData.boneSkinWeights = localWeights;
    mesh.userData.boneSkinIndices = localIndices;
    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(jointWeights.flat(), 4));
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(jointIndices.flat(), 4));
    mesh.normalizeSkinWeights();
}
/**
 * Read back the per-bone-segment skin weights previously stored by {@link setSkinWeights}.
 * @returns per-vertex skinWeights and skinIndices (bone-segment space, not joint space)
 */
export const getSkinWeights = (mesh: THREE.SkinnedMesh): { skinWeights: number[][], skinIndices: number[][] } => {
    const skinWeights = deepCopy(mesh.userData.boneSkinWeights);
    const skinIndices = deepCopy(mesh.userData.boneSkinIndices);
    return { skinWeights, skinIndices };
}
export const extractMeshData = (mesh: THREE.SkinnedMesh | THREE.Mesh): MeshData => {
    const meshData: MeshData = [[], []];
    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const idxAttr = mesh.geometry.getIndex()!;
    for (let i = 0; i < posAttr.count; i++) {
        let v = new THREE.Vector3();

        v.fromBufferAttribute(posAttr, i);
        v.applyMatrix4(mesh.matrixWorld);
        meshData[0].push(new Vec3(v.x, v.y, v.z));
    }
    for (let i = 0; i < idxAttr.count; i += 3)
        meshData[1].push([
            idxAttr.getX(i),
            idxAttr.getX(i+1),
            idxAttr.getX(i+2)
        ]);
    return meshData;
}
/**
 * Extract skeleton data (joint world positions and bone-pair connectivity)
 * from a SkinnedMesh.
 * @returns [joints, bones] tuple
 */
export const extractSkelData = (mesh: THREE.SkinnedMesh): SkelData => {
    mesh.updateMatrixWorld(true);
    const bones: [number, number][] = deepCopy(mesh.userData.bones || []);
    const joints: Vec3[] = [];

    for (let i = 0; i < mesh.skeleton.bones.length; i++) {
        let pos = new THREE.Vector3();
        mesh.skeleton.bones[i].getWorldPosition(pos);
        joints.push(new Vec3(pos.x, pos.y, pos.z));
    }
    return [ joints, bones ];
}
/**
 * Construct a fully rigged SkinnedMesh from plain data.
 * Centers the geometry and skeleton around the mesh centroid (stored as the
 * mesh's world position), builds the bone hierarchy, binds the skeleton,
 * and applies skin weights.
 * @param data - mesh geometry, skeleton topology, and skin weight data
 */
export const skinnedMeshFromData = (data: SkinnedMeshData): THREE.SkinnedMesh => {
    let [V, F] = data.mesh;
    let [J, B] = data.skel;
    let cx = 0, cy = 0, cz = 0;

    V.forEach(v => {
        cx += v.x;
        cy += v.y;
        cz += v.z;
    });
    cx /= V.length; cy /= V.length; cz /= V.length;

    if (B.length === 0)
        J = [new Vec3(cx, cy, cz)];

    V = V.map(v => new Vec3(v.x - cx, v.y - cy, v.z - cz));
    J = J.map(j => new Vec3(j.x - cx, j.y - cy, j.z - cz));
    
    const mesh = buildMesh([V, F]);
    const skel = buildSkel([J, B]);

    mesh.userData.bones = deepCopy(B);
    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(V.length).fill(1), 4));
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(V.length).fill(0), 4));
    mesh.add(skel.bones[0]);
    mesh.bind(skel);
    mesh.position.set(cx, cy, cz);
    mesh.updateMatrixWorld(true);
    setSkinWeights(mesh, data.skinWeights, data.skinIndices);

    return mesh;
}
/**
 * Serialize a SkinnedMesh back into plain data (inverse of {@link skinnedMeshFromData}).
 * Extracts world-space mesh geometry, skeleton, and per-bone skin weights.
 */
export const skinnedMeshToData = (skinnedMesh: THREE.SkinnedMesh): SkinnedMeshData => {
    skinnedMesh.updateMatrixWorld(true);

    let mesh = extractMeshData(skinnedMesh);
    let skel = extractSkelData(skinnedMesh);
    let { skinWeights, skinIndices } = getSkinWeights(skinnedMesh);

    return { mesh, skel, skinWeights, skinIndices };
}