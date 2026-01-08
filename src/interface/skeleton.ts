import { Vec3 } from './point';
/**
 * Skeleton data structure
 */
export interface SkeletonData {
    joints: Vec3[];
    bones: [number, number][];
}

// Compatibility: legacy structure using nodes/edges
export interface SkeletonDataLegacy {
    nodes: { x: number; y: number; z: number }[];
    edges: [number, number][];
}

/**
 * Skin weight data for vertex skinning
 */
export interface SkinWeightInfo {
    indices: number[];
    weights: number[];
}

// Compatibility: legacy structure (array of arrays)
export interface SkinWeightData {
    indices: number[][];
    weights: number[][];
}

