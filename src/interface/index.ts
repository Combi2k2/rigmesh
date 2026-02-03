import { Vec3 } from './point';
import * as THREE from 'three';
export * from './point';

export type MeshData = [Vec3[], number[][]];
export type SkelData = [Vec3[] | THREE.Bone[], [number, number][]];

export interface SkinnedMeshData {
    mesh: MeshData;
    skel: SkelData;
    skinWeights: number[][];
    skinIndices: number[][] | null;
};

export interface Plane {
    normal: Vec3;
    offset: number;
};

export type MenuAction = 'copy' | 'delete' | 'rig' | 'cut' | 'merge';
