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
export const extractMeshData = (mesh: THREE.SkinnedMesh | THREE.Mesh): MeshData => {
    let meshData: MeshData = [[], []];
    let posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    let idxAttr = mesh.geometry.getIndex()!;
    for (let i = 0; i < posAttr.count; i++)
        meshData[0].push(new Vec3(
            posAttr.getX(i),
            posAttr.getY(i),
            posAttr.getZ(i)
        ));
    for (let i = 0; i < idxAttr.count; i += 3)
        meshData[1].push([
            idxAttr.getX(i),
            idxAttr.getX(i+1),
            idxAttr.getX(i+2)
        ]);
    return meshData;
}
export const extractSkelData = (skel: THREE.Skeleton): SkelData => {
    let skelData: SkelData = [[], []];
    for (let i = 0; i < skel.bones.length; i++) {
        skelData[0].push(skel.bones[i].clone(false));
        for (let c of skel.bones[i].children) if (c instanceof THREE.Bone) {
            let j = skel.bones.indexOf(c);
            skelData[1].push([i, j]);
        }
    }
    return skelData;
}
export const skinnedMeshFromData = (data: SkinnedMeshData): THREE.SkinnedMesh => {
    if (data.skel[1].length === 0) {
        let centroid = new Vec3(0, 0, 0);
        data.mesh[0].forEach(v => centroid.incrementBy(v));
        data.skel[0] = [centroid.over(data.mesh[0].length)];
    }
    let skinIndices: number[][] = [];
    let skinWeights: number[][] = [];

    for (let i = 0; i < data.skinWeights.length; i++) {
        let weights = data.skinWeights[i];
        let indices = data.skinIndices?.at(i) ?? null;

        if (indices === null) {
            indices = Array.from({ length: weights.length }, (_, i) => i);
            indices.sort((a, b) => weights[b] - weights[a]);
            indices.splice(Math.min(4, indices.length));
            weights = indices.map(idx => weights[idx]);
        }
        while (weights.length < 4) {
            weights.push(0);
            indices.push(0);
        }

        skinWeights.push(weights);
        skinIndices.push(indices);
    }
    const mesh = buildMesh(data.mesh);
    const skel = buildSkel(data.skel);

    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights.flat(), 4));
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices.flat(), 4));
    mesh.attach(skel.bones[0]);
    mesh.bind(skel);
    mesh.normalizeSkinWeights();

    return mesh;
}
export const skinnedMeshToData = (skinnedMesh: THREE.SkinnedMesh): SkinnedMeshData => {
    skinnedMesh.updateMatrixWorld(true);
    
    const skinWeightsAttr = skinnedMesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
    const skinIndicesAttr = skinnedMesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
    
    let mesh = extractMeshData(skinnedMesh);
    let skel = extractSkelData(skinnedMesh.skeleton);

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

    return { mesh, skel, skinWeights, skinIndices };
}