import * as THREE from 'three';
import { Vec3, SkinnedMeshData } from '@/interface';
import { MeshData } from '@/interface';
import { SkelData } from '@/interface';

export const buildMesh = (mesh: MeshData): THREE.SkinnedMesh => {
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
    
    return new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({
        color: 0xffffff,
        skinning: true,
        side: THREE.DoubleSide,
    }));
}
export const buildSkel = (skel: SkelData): THREE.Skeleton => {
    const joints = skel[0];
    const adjList = new Array(joints.length).fill(0).map(() => new Array<number>());
    const bonesArray: THREE.Bone[] = [];
    skel[0].forEach((joint, i) => {
        if (joint instanceof THREE.Bone) {
            bonesArray.push(joint);
        } else {
            bonesArray.push(new THREE.Bone());
            bonesArray[i].position.set(joint.x, joint.y, joint.z);
        }
    });
    skel[1].forEach(([x, y]) => {
        adjList[x].push(y);
        adjList[y].push(x);
    });
    let stack = [];
    if (bonesArray.length > 0)
        stack.push([0, -1]);

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
export const setSkinWeights = (mesh: THREE.SkinnedMesh, skinWeights: number[][], skinIndices: number[][] | null) => {
    mesh.updateMatrixWorld(true);
    const geometry = mesh.geometry;
    const skeleton = mesh.skeleton;
    const bones = geometry.getAttribute('bone') as THREE.BufferAttribute;
    let posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const nV = skinWeights.length;

    if (!skinIndices)
        skinIndices = new Array(nV).fill(null);

    let jointWeights = new Array(nV).fill(0).map(() => new Array(skeleton.bones.length).fill(0));
    let jointIndices = new Array(nV);

    for (let i = 0; i < nV; i++) {
        let weights = skinWeights[i];
        let indices = skinIndices[i];

        if (!indices) {
            indices = Array.from({ length: weights.length }, (_, i) => i);
            indices.sort((a, b) => weights[b] - weights[a]);
            indices.splice(Math.min(4, indices.length));
            weights = indices.map(idx => weights[idx]);
        }
        while (weights.length < 4) {
            weights.push(0);
            indices.push(0);
        }
        skinWeights[i] = weights;
        skinIndices[i] = indices;

        for (let j = 0; j < weights.length; j++) {
            let k = indices[j];
            let w = weights[j];

            let i0 = bones.getComponent(k, 0);
            let i1 = bones.getComponent(k, 1);

            let v0 = new THREE.Vector3();
            let v1 = new THREE.Vector3();
            let v = new THREE.Vector3();

            v.fromBufferAttribute(posAttr, i);
            v.applyMatrix4(mesh.matrixWorld);
            skeleton.bones[i0].getWorldPosition(v0);
            skeleton.bones[i1].getWorldPosition(v1);

            let bone = v1.sub(v0);
            let t = Math.max(0, Math.min(1, v.sub(v0).dot(bone) / bone.lengthSq()));

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
    mesh.geometry.setAttribute('boneSkinWeights', new THREE.Float32BufferAttribute(skinWeights.flat(), 4));
    mesh.geometry.setAttribute('boneSkinIndices', new THREE.Uint16BufferAttribute(skinIndices.flat(), 4));
    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(jointWeights.flat(), 4));
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(jointIndices.flat(), 4));
    mesh.normalizeSkinWeights();
}
export const getSkinWeights = (mesh: THREE.SkinnedMesh): { skinWeights: number[][], skinIndices: number[][] } => {
    const skinWeightsAttr = mesh.geometry.getAttribute('boneSkinWeights') as THREE.BufferAttribute;
    const skinIndicesAttr = mesh.geometry.getAttribute('boneSkinIndices') as THREE.BufferAttribute;
    let skinWeights: number[][] = [];
    let skinIndices: number[][] = [];

    for (let i = 0; i < skinWeightsAttr.count; i++) {
        let weights = [];
        let indices = [];

        for (let j = 0; j < 4; j++) {
            let k = skinIndicesAttr.getComponent(i, j);
            let w = skinWeightsAttr.getComponent(i, j);
            weights.push(w);
            indices.push(k);
        }
        skinWeights.push(weights);
        skinIndices.push(indices);
    }
    return { skinWeights, skinIndices };
}
export const extractMeshData = (mesh: THREE.SkinnedMesh | THREE.Mesh): MeshData => {
    let meshData: MeshData = [[], []];
    let posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    let idxAttr = mesh.geometry.getIndex()!;
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
export const extractSkelData = (mesh: THREE.SkinnedMesh): SkelData => {
    mesh.updateMatrixWorld(true);
    let bonesAttr = mesh.geometry.getAttribute('bone') as THREE.BufferAttribute;
    let bones = [];
    let joints = [];

    for (let i = 0; i < bonesAttr.count; i++)
        bones.push([
            bonesAttr.getComponent(i, 0),
            bonesAttr.getComponent(i, 1)
        ]);
    for (let i = 0; i < mesh.skeleton.bones.length; i++) {
        let pos = new THREE.Vector3();
        mesh.skeleton.bones[i].getWorldPosition(pos);
        joints.push(new Vec3(pos.x, pos.y, pos.z));
    }
    return [ joints, bones ];
}
export const skinnedMeshFromData = (data: SkinnedMeshData): THREE.SkinnedMesh => {
    let centroid = new Vec3(0, 0, 0);
    data.mesh[0].forEach(v => centroid.incrementBy(v));
    centroid.divideBy(data.mesh[0].length);

    if (data.skel[1].length === 0)
        data.skel[0] = [centroid];

    for (let i = 0; i < data.mesh[0].length; i++)   data.mesh[0][i].decrementBy(centroid);
    for (let i = 0; i < data.skel[0].length; i++)   data.skel[0][i].decrementBy(centroid);
    
    const mesh = buildMesh(data.mesh);
    const skel = buildSkel(data.skel);

    mesh.geometry.setAttribute('bone', new THREE.Uint16BufferAttribute(data.skel[1].flat(), 2));
    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(data.mesh[0].length).fill(1), 4));
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(data.mesh[0].length).fill(0), 4));
    mesh.add(skel.bones[0]);
    mesh.bind(skel);
    mesh.position.set(centroid.x, centroid.y, centroid.z);
    mesh.updateMatrixWorld(true);
    setSkinWeights(mesh, data.skinWeights, data.skinIndices);

    return mesh;
}
export const skinnedMeshToData = (skinnedMesh: THREE.SkinnedMesh): SkinnedMeshData => {
    skinnedMesh.updateMatrixWorld(true);

    let mesh = extractMeshData(skinnedMesh);
    let skel = extractSkelData(skinnedMesh);
    let { skinWeights, skinIndices } = getSkinWeights(skinnedMesh);

    return { mesh, skel, skinWeights, skinIndices };
}