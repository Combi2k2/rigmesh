import * as THREE from 'three';
import { SkelData } from '@/interface';

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
class SkeletonJoint extends THREE.Mesh {
    joint: THREE.Bone;
    isHelperJoint: boolean = true;

    constructor(bone: THREE.Bone, radius: number = 5) {
        const [geometry, material] = createSphere(radius);
        super(geometry, material);

        this.joint = bone;
        (this as any).renderOrder = 1000;
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
class SkeletonBone extends THREE.Mesh {
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

export function createSkeleton(data: THREE.SkinnedMesh | THREE.Skeleton | SkelData): THREE.Group {
    const group = new THREE.Group();
    group.userData.isHelper = true;

    if (data instanceof THREE.SkinnedMesh)  return createSkeleton(data.skeleton);
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
            group.add(sphere);
        });
        data[1].forEach(([i0, i1]) => {
            const [geometry, material] = createCylinder(1);
            const cylinder = new THREE.Mesh(geometry, material);
            updateCylinder(cylinder, data[0][i0], data[0][i1]);
            group.add(cylinder);
        });
    }
    return group;
}