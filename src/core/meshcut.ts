/**
 * Mesh cut operator: cut mesh + skeleton by a plane, extract boundary.
 *
 * Plane: normal·x + offset = 0 (normal unit Vec3, offset number). No THREE.Plane.
 */

import { Vec2, Vec3, Plane, Frame } from '@/interface';
import { skinnedMeshFromData } from '@/utils/threeMesh';
import { skinnedMeshToData } from '@/utils/threeMesh';
import { setSkinWeights } from '@/utils/threeMesh';
import { getSkinWeights } from '@/utils/threeMesh';
import { buildMesh } from '@/utils/threeMesh';
import { buildLaplacianTopology, smooth } from '@/utils/solver';
import { buildLaplacianGeometry, diffuse } from '@/utils/solver';
import * as geo2d from '@/utils/geo2d';
import * as geo3d from '@/utils/geo3d';
import * as THREE from 'three';
import * as topo from '@/utils/topo';

var graphlib = require("graphlib");
var cdt2d = require('cdt2d');

/** Screen-space line: two NDC points (Vec2 or [x,y] tuple) */
export type ScreenLine = [[number, number], [number, number]];

/**
 * Compute a cut plane from a screen-space line and camera.
 * This is a utility function for UI components to convert user-drawn lines into cut planes.
 * @param line Screen-space line (two NDC points)
 * @param camera Perspective camera used for unprojection
 * @returns Plane with normal and offset
 */
export function computeCutPlaneFromScreenLine(
    line: ScreenLine,
    camera: THREE.PerspectiveCamera
): Plane {
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    const viewDirV = new Vec3(viewDir.x, viewDir.y, viewDir.z);

    const unprojectNDCToViewPlane = (ndcX: number, ndcY: number): Vec3 => {
        const near = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);
        const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(camera);
        const dir = new THREE.Vector3().subVectors(far, near).normalize();
        const originV = new Vec3(near.x, near.y, near.z);
        const dirV = new Vec3(dir.x, dir.y, dir.z);
        const denom = viewDirV.dot(dirV);
        if (Math.abs(denom) < 1e-8) return originV;
        const t = -viewDirV.dot(originV) / denom;
        return originV.plus(dirV.times(t));
    };

    const [p1, p2] = line;
    const Q1 = unprojectNDCToViewPlane(p1[0], p1[1]);
    const Q2 = unprojectNDCToViewPlane(p2[0], p2[1]);
    const lineDir = Q2.minus(Q1);

    const pointOnPlane = Q1.plus(Q2).times(0.5);
    const normal = lineDir.norm2() < 1e-12 ? viewDirV.unit() : lineDir.cross(viewDirV).unit();

    return {
        normal,
        offset: -normal.dot(pointOnPlane)
    };
}

export class MeshCut {
    private inputMesh: THREE.SkinnedMesh;
    private normal: Vec3;
    private basisU: Vec3;
    private basisV: Vec3;
    private spacing: number;

    constructor(mesh: THREE.SkinnedMesh) {
        this.inputMesh = mesh;
    }
    public runMeshSplit(plane: Plane): THREE.SkinnedMesh[] {
        const [basisU, basisV] = geo3d.computePlaneBasis(plane.normal);
        this.normal = plane.normal;
        this.basisU = basisU;
        this.basisV = basisV;
        const data = skinnedMeshToData(this.inputMesh);
        const vertexDist = data.mesh[0].map(v => this.normal.dot(v) + plane.offset);
        const jointDist = data.skel[0].map(j => this.normal.dot(j) + plane.offset);

        const n = data.mesh[0].length;
        const g = new graphlib.Graph();
        this.spacing = 0;

        data.mesh[1].forEach(([i0, i1, i2], _) => {
            const d0 = vertexDist[i0];
            const d1 = vertexDist[i1];
            const d2 = vertexDist[i2];

            if ((d0 >= 0 && d1 >= 0 && d2 >= 0) ||
                (d0 < 0 && d1 < 0 && d2 < 0)) {
                g.setEdge(i0, i1, i2);
                g.setEdge(i1, i2, i0);
                g.setEdge(i2, i0, i1);
            }
            this.spacing += data.mesh[0][i1].minus(data.mesh[0][i0]).norm();
            this.spacing += data.mesh[0][i2].minus(data.mesh[0][i1]).norm();
            this.spacing += data.mesh[0][i0].minus(data.mesh[0][i2]).norm();
        });
        this.spacing /= 3 * data.mesh[1].length;

        const newJoints = [...data.skel[0]];
        const newBones: [number, number][] = [];
        const splitMap: number[][] = []

        data.skel[1].forEach(([i0, i1], _) => {
            const d0 = jointDist[i0];
            const d1 = jointDist[i1];

            if ((d0 >= 0 && d1 >= 0) || (d0 < 0 && d1 < 0)) {
                splitMap.push([newBones.length]);
                newBones.push([i0, i1]);
            } else {
                const v0 = newJoints[i0];
                const v1 = newJoints[i1];
                const dir = v1.minus(v0).over(Math.abs(d0) + Math.abs(d1));
                const tmp = [];

                if (Math.abs(d0) >= 2 * this.spacing) {
                    const newPos = v0.plus(dir.times(Math.abs(d0) - this.spacing));
                    tmp.push(newBones.length);
                    newBones.push([i0, newJoints.length]);
                    newJoints.push(newPos);
                    jointDist.push(plane.normal.dot(newPos) + plane.offset);
                }
                if (Math.abs(d1) >= 2 * this.spacing) {
                    const newPos = v1.minus(dir.times(Math.abs(d1) - this.spacing));
                    tmp.push(newBones.length);
                    newBones.push([i1, newJoints.length]);
                    newJoints.push(newPos);
                    jointDist.push(plane.normal.dot(newPos) + plane.offset);
                }
                splitMap.push(tmp);
            }
        });
        const offsetJoint = n;
        const offsetBone = n + newJoints.length;

        newBones.forEach(([i0, i1], idx) => {
            g.setEdge(offsetJoint + i0, offsetBone + idx);
            g.setEdge(offsetJoint + i1, offsetBone + idx);
            g.setEdge(offsetBone + idx, offsetJoint + i0);
            g.setEdge(offsetBone + idx, offsetJoint + i1);
        });

        for (let i = 0; i < n; i++)
        for (let j = 0; j < data.skinWeights[i].length; j++) {
            let k = data.skinIndices[i][j];
            let w = data.skinWeights[i][j];

            for (let idx of splitMap[k]) {
                let [t, _] = newBones[idx];
                if ((vertexDist[i] >= 0 && jointDist[t] >= 0) ||
                    (vertexDist[i] < 0 && jointDist[t] < 0)) {
                    g.setEdge(i, idx + offsetBone, w);
                    g.setEdge(idx + offsetBone, i, w);
                }
            }
        }

        let components = graphlib.alg.components(g);
        let newMeshes = [];

        components.forEach(comp => {
            let vIdxMap = new Map();
            let bIdxMap = new Map();
            let jIdxMap = new Map();

            comp.forEach((x, _) => {
                if (x < n) {
                    vIdxMap.set(Number(x), vIdxMap.size);
                } else if (x < offsetBone) {
                    jIdxMap.set(Number(x), jIdxMap.size);
                } else {
                    bIdxMap.set(Number(x), bIdxMap.size);
                }
            });
            let V = new Array(vIdxMap.size), F = [];
            let J = new Array(jIdxMap.size), B = new Array(bIdxMap.size);
            let skinWeights = new Array(vIdxMap.size);
            let skinIndices = new Array(vIdxMap.size);

            vIdxMap.forEach((i, u) => { V[i] = data.mesh[0][u]; });
            jIdxMap.forEach((i, u) => { J[i] = newJoints[u - offsetJoint]; });
            bIdxMap.forEach((i, k) => {
                let [i0, i1] = newBones[k - offsetBone];
                B[i] = [
                    jIdxMap.get(i0 + offsetJoint),
                    jIdxMap.get(i1 + offsetJoint)
                ];
            });
            vIdxMap.forEach((i, u) => {
                let weights = [];
                let indices = [];

                for (let e of g.outEdges(u)) {
                    let v = Number(e.w);
                    let w = g.edge(u, v);
                    if (v < n) {
                        if (u < v && u < w)
                            F.push([
                                vIdxMap.get(u),
                                vIdxMap.get(v),
                                vIdxMap.get(w)
                            ]);
                    } else {
                        weights.push(w);
                        indices.push(bIdxMap.get(v));
                    }
                }
                skinWeights[i] = weights;
                skinIndices[i] = indices;
            });
            newMeshes.push(skinnedMeshFromData({
                mesh: [V, F],
                skel: [J, B],
                skinWeights,
                skinIndices
            }));
        });
        return newMeshes;
    }
    public runMeshStitch(mesh: THREE.SkinnedMesh) {
        const V = [], F = [];
        const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const idxAttr = mesh.geometry.getIndex();

        for (let i = 0; i < posAttr.count; i++) {
            let v = new THREE.Vector3();
            v.fromBufferAttribute(posAttr, i);
            V.push(new Vec3(v.x, v.y, v.z));
        }
        for (let i = 0; i < idxAttr.count; i += 3)
            F.push([idxAttr.getX(i), idxAttr.getX(i+1), idxAttr.getX(i+2)]);
        
        let topoG = null;
        let loops = null;

        if (!mesh.userData?.stitched) {
            mesh.userData.stitched = true;
            topoG = new graphlib.Graph();

            V.forEach((v, i) => topoG.setNode(i, v));
            F.forEach((f, _) => {
                topoG.setEdge(f[0], f[1], f[2]);
                topoG.setEdge(f[1], f[2], f[0]);
                topoG.setEdge(f[2], f[0], f[1]);
            });
            mesh.userData.topoG = topoG;
            mesh.userData.loops = loops = topo.extraceBoundaryLoops(topoG);
        } else {
            for (let i = 0; i < V.length; i++) {
                V[i] = topoG.node(i);
                posAttr.setXYZ(i, V[i].x, V[i].y, V[i].z);
            }
            topoG = mesh.userData.topoG;
            loops = mesh.userData.loops;
        }

        loops.forEach(loop => {
            const n = loop.length;
            const centroid = loop.reduce((acc, i) => acc.plus(V[i]), new Vec3(0, 0, 0)).over(n);
            const offset = centroid.dot(this.normal);

            const plane = { normal: this.normal, offset };            
            const frame = { origin: centroid, basisU: this.basisU, basisV: this.basisV };

            let polygon = loop.map(i => geo3d.projectTo2D(V[i], plane, frame));
            let inverse = false;

            if (geo2d.isClockwise(polygon)) {
                loop = [...loop]
                loop.reverse();
                polygon.reverse();
                inverse = true;
            }
            const gridPoints = geo2d.generateTriangleGrid(polygon, this.spacing);
            const points = [];
            polygon.forEach(p => points.push([p.x, p.y]));
            gridPoints.forEach(p => points.push([p.x, p.y]));

            const faces = cdt2d(points, polygon.map((_, index) => [index, (index + 1) % polygon.length]), { exterior: false });
            const verts = points.map((p, i) => i < n ? V[loop[i]] : geo3d.projectTo3D(new Vec2(...p), frame));

            if (inverse)
                faces.forEach(face => face.reverse());

            const patch = buildMesh([verts, faces], false);
            patch.userData.isPatch = true;
            patch.userData.loop = loop;
            patch.material.color.set(0x008800);
            mesh.add(patch);
        });
    }
    public runMeshSmooth(mesh: THREE.SkinnedMesh, smoothLayers: number, smoothFactor: number) {
        let posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        let idxAttr = mesh.geometry.getIndex();

        const topoG = mesh.userData.topoG;

        if (!mesh.userData?.patched) {
            const V = [], F = [];
            for (let i = 0; i < posAttr.count; i++) {
                let v = new THREE.Vector3();
                v.fromBufferAttribute(posAttr, i);
                V.push(new Vec3(v.x, v.y, v.z));
            }
            for (let i = 0; i < idxAttr.count; i += 3)
                F.push([idxAttr.getX(i), idxAttr.getX(i+1), idxAttr.getX(i+2)]);
            
            mesh.userData.patched = true;
            mesh.userData.patchBase = V.length;
            const patches = mesh.children.filter(child => child.userData?.isPatch);
            const { skinWeights, skinIndices } = getSkinWeights(mesh);
            patches.forEach(patch => {
                const posAttr = patch.geometry.getAttribute('position') as THREE.BufferAttribute;
                const idxAttr = patch.geometry.getIndex();
                const offset = V.length;
                const base = patch.userData.loop.length;
                const loop = patch.userData.loop;

                for (let i = base; i < posAttr.count; i++) {
                    let v = new THREE.Vector3();
                    let index = i - base + offset;
                    v.fromBufferAttribute(posAttr, i);
                    V.push(new Vec3(v.x, v.y, v.z));
                    skinWeights.push([]);
                    skinIndices.push([]);
                    topoG.setNode(index, V[index]);
                }
                for (let i = 0; i < idxAttr.count; i += 3) {
                    const f = [idxAttr.getX(i), idxAttr.getX(i+1), idxAttr.getX(i+2)];
                    const face = [];
                    f.forEach(i => {
                        if (i < base)   face.push(loop[i]);
                        else            face.push(i - base + offset);
                    });
                    F.push(face);
                    topoG.setEdge(face[0], face[1], face[2]);
                    topoG.setEdge(face[1], face[2], face[0]);
                    topoG.setEdge(face[2], face[0], face[1]);
                }
                patch.geometry?.dispose();
                patch.material?.dispose();
                mesh.remove(patch);
            });
            const newMesh = buildMesh([V, F], false);
            newMesh.material.dispose();
            mesh.geometry.dispose();
            mesh.geometry = newMesh.geometry;
            mesh.bind(mesh.skeleton);
            setSkinWeights(mesh, skinWeights, skinIndices);

            posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
            idxAttr = mesh.geometry.getIndex();
        } else {
            for (let i = 0; i < posAttr.count; i++) {
                let v = topoG.node(i);
                posAttr.setXYZ(i, v.x, v.y, v.z);
            }
        }
        const source = mesh.userData.loops.flat();
        for (let i = mesh.userData.patchBase; i < posAttr.count; i++)
            source.push(i);

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
        const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const posArray = [];
        const { skinWeights, skinIndices } = getSkinWeights(mesh);

        for (let i = 0; i < posAttr.count; i++) {
            let v = new THREE.Vector3();
            v.fromBufferAttribute(posAttr, i);
            posArray.push(new Vec3(v.x, v.y, v.z));
        }
        const boundary = mesh.userData.loops.flat();
        const interior = [];
        const topoG = mesh.userData.topoG;
        for (let i = mesh.userData.patchBase; i < posAttr.count; i++) {
            interior.push(i);
            skinWeights[i] = [];
            skinIndices[i] = [];
        }

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
        const local_lap = buildLaplacianGeometry([posArray, local_faces]);

        for (let j = 0; j < skinWeights[0].length; j++) {
            const constraints: [number, number][] = boundary.map(i => [i, skinWeights[i][j]] as [number, number]);
            const result = diffuse(local_lap, [], constraints, 1);

            for (let [i, w] of result) if (i >= mesh.userData.patchBase) {
                skinWeights[i].push(w);
                skinIndices[i].push(j);
            }
        }
        console.log(skinWeights, skinIndices);
        setSkinWeights(mesh, skinWeights, skinIndices);
    }
}