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
import { extractMeshData } from '@/utils/threeMesh';
import { extractSkelData } from '@/utils/threeMesh';
import { setSkinWeights } from '@/utils/threeMesh';
import * as THREE from 'three';
import * as geo3d from '@/utils/geo3d';
import * as geo2d from '@/utils/geo2d';
import * as skin from '@/core/skin';
import * as topo from '@/utils/topo';

import { buildLaplacianTopology, smooth } from '@/utils/solver';
import { buildLaplacianGeometry, diffuse } from '@/utils/solver';

var Graph = require("graphlib").Graph;
var cdt2d = require('cdt2d');

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

        const g1 = new Graph();
        const g2 = new Graph();

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
            const n1 = loop1V.length;
            const n2 = loop2V.length;

            const centroid = new Vec3(0, 0, 0);
            centroid.incrementBy(centroids1[i].times(n1));
            centroid.incrementBy(centroids2[j].times(n2));
            centroid.divideBy(n1 + n2);

            const normal = geo3d.runNormalEstimation([...loop1V, ...loop2V]);
            const bases = geo3d.computePlaneBasis(normal);
            const frame = { origin: centroid, basisU: bases[0], basisV: bases[1] };
            const plane = { normal, offset: centroid.dot(normal) };

            const loop1V2D = loop1V.map(v => geo3d.projectTo2D(v, plane, frame));
            const loop2V2D = loop2V.map(v => geo3d.projectTo2D(v, plane, frame));

            const clockWise1 = geo2d.isClockwise(loop1V2D);
            const clockWise2 = geo2d.isClockwise(loop2V2D);

            console.log(...loop1V2D, ...loop2V2D);

            if (clockWise1 === clockWise2) {
                console.error("Loops are not supposed to be oriented the same direction");
                return;
            }
            if (clockWise1) for (let i = 0; i < n2; i++)    loop2V2D[i].scaleBy(1.5);
            else            for (let i = 0; i < n1; i++)    loop1V2D[i].scaleBy(1.5);

            const points = [];
            const edges = [];
            loop1V2D.forEach(p => points.push([p.x, p.y]));
            loop2V2D.forEach(p => points.push([p.x, p.y]));
            loop1V2D.forEach((_, i) => edges.push([i, (i + 1) % n1]));
            loop2V2D.forEach((_, i) => edges.push([i + n1, (i + 1) % n2 + n1]));

            const faces_patch = cdt2d(points, edges, {exterior: false});
            const faces_final = [];
            faces_patch.forEach(f => {
                const face: number[] = [];
                for (const v of f) {
                    if (v < n1) face.push(loops1[i][v]);
                    else        face.push(loops2[j][v - n1]);
                }
                faces_final.push(face);
            });

            const patch = buildMesh([[...loop1V, ...loop2V], faces_patch], false);
            patch.userData.faces = faces_final;
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
            topoG = new Graph();

            for (let i = 0; i < posAttr.count; i++)
                topoG.setNode(i, new Vec3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
            
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

        const hardX = boundary.map((i) => [i, topoG.node(i).x] as [number, number]);
        const hardY = boundary.map((i) => [i, topoG.node(i).y] as [number, number]);
        const hardZ = boundary.map((i) => [i, topoG.node(i).z] as [number, number]);
        const weakX = interior.map((i) => [i, topoG.node(i).x] as [number, number]);
        const weakY = interior.map((i) => [i, topoG.node(i).y] as [number, number]);
        const weakZ = interior.map((i) => [i, topoG.node(i).z] as [number, number]);

        const resX = smooth(local_lap, weakX, hardX, smoothFactor);
        const resY = smooth(local_lap, weakY, hardY, smoothFactor);
        const resZ = smooth(local_lap, weakZ, hardZ, smoothFactor);

        for (const i of local_region) {
            posAttr.setXYZ(i, resX.get(i)!, resY.get(i)!, resZ.get(i)!);
        }
        posAttr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
    }
    public computeSkinWeights(mesh: THREE.SkinnedMesh) {
        const skinWeights = skin.computeSkinWeightsGlobal(
            extractMeshData(mesh),
            extractSkelData(mesh)
        );
        setSkinWeights(mesh, skinWeights, null);
    }
}