import { Point, Vec3 } from './point';

export interface MeshData {
    V: Point[];
    F: number[][];
}

// Compatibility interfaces for existing code
export interface Mesh3DData {
    vertices: Vec3[];
    faces: number[][];
}

export interface Mesh2DData {
    vertices: { x: number; y: number }[];
    faces: number[][];
}

export interface TriangulationData {
    vertices: Point[];
    faces: number[][];
}