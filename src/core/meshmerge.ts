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
import { skinnedMeshFromData } from '@/utils/threeMesh';
import { skinnedMeshToData } from '@/utils/threeMesh';
import { buildMesh } from '@/utils/threeMesh';
import * as THREE from 'three';
import * as geo3d from '@/utils/geo3d';
import * as skin from '@/core/skin';
import * as topo from '@/utils/topo';

import { buildLaplacianTopology, smooth } from '@/utils/solver';
import { buildLaplacianGeometry, diffuse } from '@/utils/solver';

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

        const g1 = new graphlib.Graph();
        const g2 = new graphlib.Graph();

        this.data1.mesh[1].forEach(([i0, i1, i2], _) => {
            if (toRemove1[i0]) return;
            if (toRemove1[i1]) return;
            if (toRemove1[i2]) return;
            F.push([idxMap1.get(i0), idxMap1.get(i1), idxMap1.get(i2)]);
            g1.setEdge(idxMap1.get(i0), idxMap1.get(i1));
            g1.setEdge(idxMap1.get(i1), idxMap1.get(i2));
            g1.setEdge(idxMap1.get(i2), idxMap1.get(i0));
        });
        this.data2.mesh[1].forEach(([i0, i1, i2], _) => {
            if (toRemove2[i0]) return;
            if (toRemove2[i1]) return;
            if (toRemove2[i2]) return;
            F.push([idxMap2.get(i0), idxMap2.get(i1), idxMap2.get(i2)]);
            g2.setEdge(idxMap2.get(i0), idxMap2.get(i1));
            g2.setEdge(idxMap2.get(i1), idxMap2.get(i2));
            g2.setEdge(idxMap2.get(i2), idxMap2.get(i0));
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

        const mesh = skinnedMeshFromData({
            mesh: [V, F],
            skel: [J, B],
            skinWeights: mergedSkinWeights,
            skinIndices: mergedSkinIndices
        });

        mesh.userData.loops1 = topo.extraceBoundaryLoops(g1);
        mesh.userData.loops2 = topo.extraceBoundaryLoops(g2);

        return mesh;
    }
    public runMeshStitch(mesh: THREE.SkinnedMesh) {
        const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const posArray: Vec3[] = [];

        for (let i = 0; i < posAttr.count; i++) {
            let pos = new THREE.Vector3();
    
            pos.fromBufferAttribute(posAttr, i);
            posArray.push(new Vec3(pos.x, pos.y, pos.z));
        }
        
        const loops1: number[][] = mesh.userData.loops1;
        const loops2: number[][] = mesh.userData.loops2;

        if (loops1.length !== loops2.length) {
            console.warn("Number of boundary loops are not equal");
            return;
        }
        const n = loops1.length;
        const centroids1 = loops1.map(loop => loop.reduce((acc, i) => acc.plus(posArray[i]), new Vec3(0, 0, 0)).over(loop.length));
        const centroids2 = loops2.map(loop => loop.reduce((acc, i) => acc.plus(posArray[i]), new Vec3(0, 0, 0)).over(loop.length));
        
        const pairs: [number, number][] = [];
        const paired1 = new Array(n).fill(false);
        const paired2 = new Array(n).fill(false);

        while (pairs.length < n) {
            let minDist = Infinity;
            let bestPair: [number, number] = [0, 0];
            for (let i = 0; i < n; i++) if (!paired1[i])
            for (let j = 0; j < n; j++) if (!paired2[j]) {
                const c1 = centroids1[i];
                const c2 = centroids2[j];
                const dist = c1.minus(c2).norm();
                if (minDist > dist) {
                    minDist = dist;
                    bestPair = [i, j];
                }
            }
            pairs.push(bestPair);
            paired1[bestPair[0]] = true;
            paired2[bestPair[1]] = true;
        }

        for (const [i, j] of pairs) {
            const loop1V = loops1[i].map(idx => posArray[idx]);
            const loop2V = loops2[j].map(idx => posArray[idx]);
            const face_patch = generateSlice(loop1V, loop2V);
            const face_final: number[][] = [];
            face_patch.forEach(f => {
                const face: number[] = [];
                for (const v of f) {
                    if (v < loop1V.length)  face.push(loops1[i][v]);
                    else                    face.push(loops2[j][v - loop1V.length]);
                }
                face_final.push(face);
            });

            const patch = buildMesh([[...loop1V, ...loop2V], face_patch], false);
            patch.userData.faces = face_final;
            patch.userData.isPatch = true;
            patch.material.color.set(0x008800);
            mesh.add(patch);
        }
    }
    public runMeshSmooth(mesh: THREE.SkinnedMesh, smoothLayers: number, smoothFactor: number) {
        const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const idxAttr = mesh.geometry.getIndex();
        let topoG = null;
        let source = [];

        if (!mesh.userData?.patched) {
            mesh.userData.patched = true;
            const patches = mesh.children.filter(child => child.userData?.isPatch);
            const faces = [];
            const sourceSet = new Set<number>();
            topoG = new graphlib.Graph();
            
            for (let i = 0; i < idxAttr.count; i += 3) {
                const i0 = idxAttr.getX(i);
                const i1 = idxAttr.getX(i + 1);
                const i2 = idxAttr.getX(i + 2);
                faces.push([i0, i1, i2]);
            }
            for (const patch of patches) {
                patch.userData.faces.forEach(([i0, i1, i2]) => {
                    sourceSet.add(i0);
                    sourceSet.add(i1);
                    sourceSet.add(i2);
                    faces.push([i0, i1, i2]);
                });
                patch.geometry?.dispose();
                patch.material?.dispose();
                mesh.remove(patch);
            }
            source = [...sourceSet];
            faces.forEach(([i0, i1, i2]) => {
                topoG.setEdge(i0, i1, i2);
                topoG.setEdge(i1, i2, i0);
                topoG.setEdge(i2, i0, i1);
            });
            mesh.userData.topoG = topoG;
            mesh.userData.source = source;
            mesh.geometry.setIndex(faces.flat());
        } else {
            topoG = mesh.userData.topoG;
            source = mesh.userData.source;
        }
        const [interior, boundary] = topo.expand(topoG, source, smoothLayers);

        const local_region = new Set<number>([...boundary, ...interior]);
        const local_faces = [];

        local_region.forEach(x => {
            for (const e of topoG.outEdges(x)) {
                const y = Number(e.w);
                const z = topoG.edge(x, y);

                if (!local_region.has(y))   continue;
                if (!local_region.has(z))   continue;

                if (x < y && x < z)
                    local_faces.push([x, y, z]);
            }
        });
        const local_lap = buildLaplacianTopology([[], local_faces]);

        const hardX = boundary.map((i) => [i, posAttr.getX(i)] as [number, number]);
        const hardY = boundary.map((i) => [i, posAttr.getY(i)] as [number, number]);
        const hardZ = boundary.map((i) => [i, posAttr.getZ(i)] as [number, number]);
        const weakX = interior.map((i) => [i, posAttr.getX(i)] as [number, number]);
        const weakY = interior.map((i) => [i, posAttr.getY(i)] as [number, number]);
        const weakZ = interior.map((i) => [i, posAttr.getZ(i)] as [number, number]);

        const resX = smooth(local_lap, weakX, hardX, smoothFactor);
        const resY = smooth(local_lap, weakY, hardY, smoothFactor);
        const resZ = smooth(local_lap, weakZ, hardZ, smoothFactor);

        for (const i of local_region) {
            posAttr.setXYZ(i, resX.get(i)!, resY.get(i)!, resZ.get(i)!);
        }
        posAttr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
    }
}