import * as THREE from 'three';
import { SkelData } from '@/interface';

export function traceMesh(result: THREE.SkinnedMesh | THREE.Bone | [THREE.Bone, THREE.Bone] | null): THREE.SkinnedMesh | null {
    if (!result) return null;
    if (result instanceof THREE.SkinnedMesh)
        return result;

    let obj = Array.isArray(result) ? result[0] : result;
    while (obj.parent && obj.isBone)
        obj = obj.parent;

    return obj instanceof THREE.SkinnedMesh ? obj : null;
}

const _worldPosA = new THREE.Vector3();
const _worldPosB = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

function createSphere(radius: number = 5): [THREE.SphereGeometry, THREE.MeshBasicMaterial] {
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    return [geometry, material];
}
function createCylinder(radius: number = 2): [THREE.CylinderGeometry, THREE.MeshBasicMaterial] {
    const geometry = new THREE.CylinderGeometry(radius, radius, 1, 8);
    const material = new THREE.MeshBasicMaterial({
        color: 0x0000ff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    return [geometry, material];
}
function updateCylinder(cylinder: THREE.Mesh, jointA, jointB) {
    const mid = new THREE.Vector3(jointA.x + jointB.x, jointA.y + jointB.y, jointA.z + jointB.z).multiplyScalar(0.5);
    const dir = new THREE.Vector3(jointB.x - jointA.x, jointB.y - jointA.y, jointB.z - jointA.z);
    const length = dir.length();
    if (length > 1e-6) {
        cylinder.position.set(mid.x, mid.y, mid.z);
        cylinder.scale.set(1, length, 1);
        cylinder.quaternion.setFromUnitVectors(_worldUp, dir.clone().normalize());
        cylinder.visible = true;
    } else {
        cylinder.visible = false;
    }
}
export class SkeletonJoint extends THREE.Mesh {
    joint: THREE.Bone;
    isHelperJoint: boolean = true;

    constructor(bone: THREE.Bone, radius: number = 5) {
        const [geometry, material] = createSphere(radius);
        super(geometry, material);

        this.joint = bone;
        (this as any).renderOrder = 1001;
    }

    updateMatrixWorld(force?: boolean) {
        this.joint.getWorldPosition(_worldPosA);
        (this as any).position.copy(_worldPosA);

        super.updateMatrixWorld(force);
    }

    dispose() {
        (this as any).geometry?.dispose();
        (this as any).material?.dispose();
    }
}
export class SkeletonBone extends THREE.Mesh {
    jointA: THREE.Bone;
    jointB: THREE.Bone;
    isHelperBone: boolean = true;

    constructor(jointA: THREE.Bone, jointB: THREE.Bone, radius: number = 2) {
        const [geometry, material] = createCylinder(radius);
        super(geometry, material);

        this.jointA = jointA;
        this.jointB = jointB;
        (this as any).renderOrder = 1000;
    }

    updateMatrixWorld(force?: boolean) {
        this.jointA.getWorldPosition(_worldPosA);
        this.jointB.getWorldPosition(_worldPosB);
        updateCylinder(this as THREE.Mesh, _worldPosA, _worldPosB);
        super.updateMatrixWorld(force);
    }

    dispose() {
        (this as any).geometry?.dispose();
        (this as any).material?.dispose();
    }
}
export class SkeletonConnector extends THREE.Group {
    skelA: THREE.Skeleton;
    skelB: THREE.Skeleton;
    mode: 'snap' | 'split' | 'connect' = 'snap';
    source: number;
    target: number | [number, number];
    isHelperConnector: boolean = true;

    jointHelper: THREE.Mesh;
    boneHelper: THREE.Mesh;

    constructor(A: THREE.Skeleton | THREE.SkinnedMesh, B: THREE.Skeleton | THREE.SkinnedMesh) {
        super();

        this.skelA = A instanceof THREE.SkinnedMesh ? A.skeleton : A;
        this.skelB = B instanceof THREE.SkinnedMesh ? B.skeleton : B;

        this.boneHelper = new THREE.Mesh(...createCylinder(2));
        this.jointHelper = new THREE.Mesh(...createSphere(6));
        this.jointHelper.renderOrder = 1002;

        (this as THREE.Group).add(this.jointHelper);
        (this as THREE.Group).add(this.boneHelper);
    }
    updateMatrixWorld(force?: boolean) {
        let minDist = Infinity;
        const n1 = this.skelA.bones.length;
        const n2 = this.skelB.bones.length;
        const posA = new Array(n1).fill(0).map(() => new THREE.Vector3());
        const posB = new Array(n2).fill(0).map(() => new THREE.Vector3());
        const parent = new Array(n2).fill(-1);
        const srcV = new THREE.Vector3();
        const tgtV = new THREE.Vector3();

        for (let i = 0; i < n1; i++)    this.skelA.bones[i].getWorldPosition(posA[i]);
        for (let i = 0; i < n2; i++)    this.skelB.bones[i].getWorldPosition(posB[i]);
        for (let i = 0; i < n2; i++)
            if (this.skelB.bones[i].parent?.isBone)
                parent[i] = this.skelB.bones.indexOf(this.skelB.bones[i].parent);

        for (let i = 0; i < n1; i++)
        for (let j = 0; j < n2; j++) {
            let k = parent[j];
            if (this.mode === 'split') {
                if (k < 0) continue;

                const e = new THREE.Vector3().subVectors(posB[j], posB[k]);
                const x = new THREE.Vector3().subVectors(posA[i], posB[k]);
                const t = Math.max(0, Math.min(1, x.dot(e) / e.lengthSq()));
                const y = e.multiplyScalar(t);
                const dist = (x.sub(y)).length();

                if (minDist > dist) {
                    minDist = dist;
                    this.source = i;
                    this.target = [j, k];

                    srcV.copy(posA[i]);
                    tgtV.addVectors(posB[k], y);
                }
            } else {
                const dist = posA[i].distanceTo(posB[j]);
                if (minDist > dist) {
                    minDist = dist;
                    this.source = i;
                    this.target = j;

                    srcV.copy(posA[i]);
                    tgtV.copy(posB[j]);
                }
            }
        }
        this.jointHelper.position.copy(tgtV);
        updateCylinder(this.boneHelper, srcV, tgtV);

        const color = this.mode === 'snap' ? 0x8b3a3a : this.mode === 'split' ? 0x5c4a7a : 0x3a5a8b;
        const matJ = this.jointHelper.material as THREE.MeshBasicMaterial;
        const matB = this.boneHelper.material as THREE.MeshBasicMaterial;
        if (matJ.color.getHex() !== color) matJ.color.setHex(color);
        if (matB.color.getHex() !== color) matB.color.setHex(color);

        super.updateMatrixWorld(force);
    }

    dispose() {
        this.jointHelper.geometry?.dispose();
        this.jointHelper.material?.dispose();
        this.boneHelper.geometry?.dispose();
        this.boneHelper.material?.dispose();
    }
};

export function createSkeleton(data: THREE.SkinnedMesh | THREE.Skeleton | SkelData): THREE.Group {
    const group = new THREE.Group();
    group.userData.isHelper = true;

    if (data instanceof THREE.SkinnedMesh) return createSkeleton(data.skeleton);
    if (data instanceof THREE.Skeleton) {
        data.bones.forEach(bone => {
            group.add(new SkeletonJoint(bone));
            if (bone.parent?.isBone)
                group.add(new SkeletonBone(
                    bone.parent as THREE.Bone,
                    bone,
                ));
        });
    } else {
        data[0].forEach(joint => {
            const [geometry, material] = createSphere(5);
            const sphere = new THREE.Mesh(geometry, material);
            sphere.position.set(joint.x, joint.y, joint.z);
            sphere.renderOrder = 1001;
            group.add(sphere);
        });
        data[1].forEach(([i0, i1]) => {
            const [geometry, material] = createCylinder(1);
            const cylinder = new THREE.Mesh(geometry, material);
            updateCylinder(cylinder, data[0][i0], data[0][i1]);
            cylinder.renderOrder = 1000;
            group.add(cylinder);
        });
    }
    return group;
}