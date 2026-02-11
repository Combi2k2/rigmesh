/**
 * Mesh merge operator: merge two skinned meshes by removing interior triangles and connecting boundary loops.
 *
 * Flow:
 * 1. Detect triangles from mesh A inside mesh B and vice versa
 * 2. Remove those triangles
 * 3. Extract boundary loops from each mesh
 * 4. Connect boundary loops using generateSlice logic
 * 5. Smooth the merged region
 */

import { Vec3, SkinnedMeshData } from '@/interface';
import { MeshData } from '@/interface';
import { SkelData } from '@/interface';
import { skinnedMeshFromData, skinnedMeshToData } from '@/utils/threeMesh';
import * as THREE from 'three';
import * as geo3d from '@/utils/geo3d';
import * as skin from '@/core/skin';

var graphlib = require("graphlib");

// --- Helper Functions (kept module-scope for simplicity) ---

/**
 * Check if a point is inside a mesh using raycasting (odd-even rule).
 */
function isPointInsideMesh(point: Vec3, mesh: MeshData): boolean {
    const [vertices, faces] = mesh;
    const direction = new Vec3(0.57735, 0.57735, 0.57735); // normalized (1,1,1)
    let intersections = 0;

    for (const face of faces) {
        const v0 = vertices[face[0]];
        const v1 = vertices[face[1]];
        const v2 = vertices[face[2]];

        if (geo3d.rayTriangleIntersect(point, direction, v0, v1, v2)) {
            intersections++;
        }
    }

    return intersections % 2 === 1;
}

/**
 * Generate a triangulated slice connecting two boundary loops.
 */
function generateSlice(loop1: Vec3[], loop2: Vec3[]): number[][] {
    const n1 = loop1.length;
    const n2 = loop2.length;

    if (n1 === 0 || n2 === 0) return [];

    let offset = 0;
    const faces: number[][] = [];
    let sameDir = true;

    // Find the best alignment offset by finding closest vertex pair
    if (n1 <= n2) {
        for (let i = 0; i < n2; i++) {
            const d0 = loop2[offset].minus(loop1[0]).norm();
            const d1 = loop2[i].minus(loop1[0]).norm();
            if (d0 > d1) offset = i;
        }

        // Check if loops are oriented the same direction
        const dir1 = loop1[1 % n1].minus(loop1[0]);
        const dir2 = loop2[(offset + 1) % n2].minus(loop2[offset]);
        sameDir = dir1.dot(dir2) >= 0;

        for (let i = 0; i < n2; i++) {
            faces.push([
                n1 + (offset + i) % n2,
                n1 + (offset + i + 1) % n2,
                Math.floor((i + 1) * n1 / n2) % n1
            ]);
            if (Math.floor(i * n1 / n2) !== Math.floor((i + 1) * n1 / n2) % n1) {
                faces.push([
                    n1 + (offset + i) % n2,
                    Math.floor(i * n1 / n2),
                    Math.floor((i + 1) * n1 / n2) % n1
                ]);
            }
        }
    } else {
        for (let i = 0; i < n1; i++) {
            const d0 = loop1[offset].minus(loop2[0]).norm();
            const d1 = loop1[i].minus(loop2[0]).norm();
            if (d0 > d1) offset = i;
        }

        const dir1 = loop2[1 % n2].minus(loop2[0]);
        const dir2 = loop1[(offset + 1) % n1].minus(loop1[offset]);
        sameDir = dir1.dot(dir2) > 0;

        for (let i = 0; i < n1; i++) {
            faces.push([
                (offset + i) % n1,
                (offset + i + 1) % n1,
                n1 + Math.floor((i + 1) * n2 / n1) % n2
            ]);
            if (Math.floor(i * n2 / n1) !== Math.floor((i + 1) * n2 / n1) % n2) {
                faces.push([
                    (offset + i) % n1,
                    n1 + Math.floor(i * n2 / n1) % n2,
                    n1 + Math.floor((i + 1) * n2 / n1) % n2
                ]);
            }
        }
    }

    // Flip faces if loops are oriented differently
    if (!sameDir) {
        for (let i = 0; i < faces.length; i++) {
            const newFace: number[] = [];
            for (const v of faces[i]) {
                if (v < n1) newFace.push((n1 - v) % n1);
                else newFace.push(v);
            }
            faces[i] = newFace;
        }
    }

    return faces;
}

/**
 * Find the closest pair of boundary loops between two meshes.
 */
function findClosestLoopPair(
    loops1: { vertices: Vec3[], indices: number[] }[],
    loops2: { vertices: Vec3[], indices: number[] }[]
): [number, number] {
    let minDist = Infinity;
    let bestPair: [number, number] = [0, 0];

    for (let i = 0; i < loops1.length; i++) {
        const centroid1 = loops1[i].vertices.reduce(
            (acc, v) => acc.plus(v),
            new Vec3(0, 0, 0)
        ).over(loops1[i].vertices.length);

        for (let j = 0; j < loops2.length; j++) {
            const centroid2 = loops2[j].vertices.reduce(
                (acc, v) => acc.plus(v),
                new Vec3(0, 0, 0)
            ).over(loops2[j].vertices.length);

            const dist = centroid1.minus(centroid2).norm();
            if (dist < minDist) {
                minDist = dist;
                bestPair = [i, j];
            }
        }
    }

    return bestPair;
}

export type MergeType = 'snap' | 'split' | 'connect';
export interface MergeParams {
    type: 'snap' | 'split' | 'connect';
    src: number;
    tgt: number | [number, number];
}

export class MeshMerge {
    private data1: SkinnedMeshData;
    private data2: SkinnedMeshData;

    constructor(mesh1: THREE.SkinnedMesh, mesh2: THREE.SkinnedMesh, private params: MergeParams) {
        this.data1 = skinnedMeshToData(mesh1);
        this.data2 = skinnedMeshToData(mesh2);

        if (this.params.type === 'snap')    this.preSnap();
        if (this.params.type === 'split')   this.preSplit();
    }
    private preSnap() {
        const sourceV = this.data1.skel[0][this.params.src];
        const targetV = this.data2.skel[0][this.params.tgt as number];
        const translation = targetV.minus(sourceV);

        for (let i = 0; i < this.data1.skel[0].length; i++) this.data1.skel[0][i].incrementBy(translation);
        for (let i = 0; i < this.data1.mesh[0].length; i++) this.data1.mesh[0][i].incrementBy(translation);
    }
    private preSplit() {
        const [i0, i1] = this.params.tgt as [number, number];
        const index = this.data2.skel[1].findIndex(([a, b]) => a === i0 || b === i0);
        const targetV0 = this.data2.skel[0][i0];
        const targetV1 = this.data2.skel[0][i1];
        const sourceV = this.data1.skel[0][this.params.src];
        const d = targetV1.minus(targetV0);
        const t = sourceV.minus(targetV0).dot(d) / d.norm2();

        if (t < 0.05) { this.params.tgt = i0; return; }
        if (t > 0.95) { this.params.tgt = i1; return; }

        const newPos = targetV0.plus(d.times(t));
        const newIdx = this.data2.skel[0].length;

        this.data2.skel[0].push(newPos);
        this.data2.skel[1].push([i1, newIdx]);
        this.data2.skel[1][index] = [i0, newIdx];
        this.data2.skinWeights.push([...this.data2.skinWeights[index]]);
        this.data2.skinIndices.push([...this.data2.skinIndices[index]]);
        this.params.tgt = newIdx;
    }
    public runTriangleRemoval(): THREE.SkinnedMesh {
        const toRemove1 = this.data1.mesh[0].map(v => isPointInsideMesh(v, this.data2.mesh));
        const toRemove2 = this.data2.mesh[0].map(v => isPointInsideMesh(v, this.data1.mesh));

        const idxMap1 = new Map<number, number>();
        const idxMap2 = new Map<number, number>();
        const V = [], F = [];
        const J = [...this.data1.skel[0]];
        const B = [...this.data1.skel[1].map(([a, b]) => [a, b] as [number, number])];
        let offset = 0;

        this.data1.mesh[0].forEach((v, i) => { if (!toRemove1[i]) V.push(v), idxMap1.set(i, offset++); });
        this.data2.mesh[0].forEach((v, i) => { if (!toRemove2[i]) V.push(v), idxMap2.set(i, offset++); });

        this.data1.mesh[1].forEach(([i0, i1, i2], _) => {
            if (toRemove1[i0]) return;
            if (toRemove1[i1]) return;
            if (toRemove1[i2]) return;
            F.push([idxMap1.get(i0), idxMap1.get(i1), idxMap1.get(i2)]);
        });
        this.data2.mesh[1].forEach(([i0, i1, i2], _) => {
            if (toRemove2[i0]) return;
            if (toRemove2[i1]) return;
            if (toRemove2[i2]) return;
            F.push([idxMap2.get(i0), idxMap2.get(i1), idxMap2.get(i2)]);
        });

        const n1 = this.data1.skel[0].length;
        const src = this.params.src;
        const tgt = this.params.tgt as number;
        const boneOffset = this.data1.skel[1].length;

        if (this.params.type === 'snap') {
            J.push(...this.data2.skel[0].filter((_, i) => i !== tgt));
            B.push(...this.data2.skel[1].map(([a, b]) => {
                const x = a === tgt ? src : ((a < tgt ? a : a - 1) + n1);
                const y = b === tgt ? src : ((b < tgt ? b : b - 1) + n1);
                return [x, y] as [number, number];
            }));
        } else {
            J.push(...this.data2.skel[0]);
            B.push(...this.data2.skel[1].map(([a, b]) => [a + n1, b + n1] as [number, number]));
            B.push([src, n1 + tgt]);
        }

        // Merge skin weights / indices from both meshes into the new vertex layout.
        const mergedSkinWeights: number[][] = new Array(V.length);
        const mergedSkinIndices: number[][] = new Array(V.length);

        // Map vertices from mesh 1 (no bone index offset needed).
        for (const [oldIdx, newIdx] of idxMap1.entries()) {
            mergedSkinWeights[newIdx] = [...this.data1.skinWeights[oldIdx]];
            mergedSkinIndices[newIdx] = [...this.data1.skinIndices[oldIdx]];
        }

        // Map vertices from mesh 2, with bone indices offset by boneOffset.
        for (const [oldIdx, newIdx] of idxMap2.entries()) {
            const w = this.data2.skinWeights[oldIdx] || [];
            const k = this.data2.skinIndices[oldIdx] || [];
            mergedSkinWeights[newIdx] = [...w];
            mergedSkinIndices[newIdx] = k.map(b => b + boneOffset);
        }

        return skinnedMeshFromData({
            mesh: [V, F],
            skel: [J, B],
            skinWeights: mergedSkinWeights,
            skinIndices: mergedSkinIndices
        });
    }
}