/**
 * Mesh cut operator: cut mesh + skeleton by a plane, extract boundary.
 *
 * Plane: normal·x + offset = 0 (normal unit Vec3, offset number). No THREE.Plane.
 */

import { Vec2, Vec3, Plane, Frame } from '@/interface';
import { skinnedMeshFromData } from '@/utils/threeMesh';
import { skinnedMeshToData } from '@/utils/threeMesh';
import { extractMeshData } from '@/utils/threeMesh';
import { setSkinWeights } from '@/utils/threeMesh';
import { getSkinWeights } from '@/utils/threeMesh';
import { buildMesh } from '@/utils/threeMesh';
import { buildLaplacianTopology, smooth } from '@/utils/solver';
import { buildLaplacianGeometry, diffuse } from '@/utils/solver';
import Queue from '@/utils/misc';
import * as geo2d from '@/utils/geo2d';
import * as THREE from 'three';

var graphlib = require("graphlib");
var cdt2d = require('cdt2d');

/**
 * Project a 3D vertex onto a plane and get its 2D coordinates in the frame.
 * @param point The 3D point to project
 * @param plane The plane (normal and offset) used for projection
 * @param frame The frame (origin, basisU, basisV) for 2D coordinates
 * @returns Vec2 coordinates in the frame's local system
 */
export function projectTo2D(point: Vec3, plane: Plane, frame: Frame): Vec2 {
    const { normal, offset } = plane;
    const signedDist = normal.dot(point) + offset;
    const projected = point.minus(normal.times(signedDist));
    const fromOrigin = projected.minus(frame.origin);
    return new Vec2(fromOrigin.dot(frame.basisU), fromOrigin.dot(frame.basisV));
}

/**
 * Convert 2D coordinates back to 3D point in the frame.
 * @param point Vec2 in the frame's local system
 * @param frame The frame (origin, basisU, basisV)
 * @returns The 3D point on the plane
 */
export function projectTo3D(point: Vec2, frame: Frame): Vec3 {
    return frame.origin
        .plus(frame.basisU.times(point.x))
        .plus(frame.basisV.times(point.y));
}

/**
 * Compute orthogonal basis vectors for a plane.
 * @param normal The plane normal (unit vector)
 * @returns [basisU, basisV] two orthogonal unit vectors on the plane
 */
export function computePlaneBasis(normal: Vec3): [Vec3, Vec3] {
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    let tempVec: Vec3;
    if (absX <= absY && absX <= absZ) {
        tempVec = new Vec3(1, 0, 0);
    } else if (absY <= absZ) {
        tempVec = new Vec3(0, 1, 0);
    } else {
        tempVec = new Vec3(0, 0, 1);
    }

    const basisU = tempVec.minus(normal.times(tempVec.dot(normal))).unit();
    const basisV = normal.cross(basisU);
    return [basisU, basisV];
}

/**
 * Build a Frame from a Plane (origin on plane, basisU/basisV from plane normal).
 */
export function planeToFrame(plane: Plane): Frame {
    const [basisU, basisV] = computePlaneBasis(plane.normal);
    const origin = plane.normal.times(-plane.offset);
    return { origin, basisU, basisV };
}

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
        const [basisU, basisV] = computePlaneBasis(plane.normal);
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

        const nextMap = new Map<number, number>();
        const edgeMap = new Map<String, [number, number]>();
        function addEdge(x: number, y: number) {
            const key = x < y ? `${x}-${y}` : `${y}-${x}`;
            if (edgeMap.has(key))
                edgeMap.delete(key);
            else
                edgeMap.set(key, [y, x]);
        }
        F.forEach(([i0, i1, i2], _) => {
            addEdge(i0, i1);
            addEdge(i1, i2);
            addEdge(i2, i0);
        });
        for (let [_, [x, y]] of edgeMap)
            nextMap.set(x, y);

        while (nextMap.size > 0) {
            let start = nextMap.keys().next().value;
            let loop = [];
            let itr = start;
            let offset = 0;

            do {
                loop.push(itr);
                itr = nextMap.get(itr);
            } while (itr !== start);

            loop.forEach(i => {
                nextMap.delete(i)
                offset -= this.normal.dot(V[i]);
            });

            offset /= loop.length;

            const plane = { normal: this.normal, offset };
            const frame = { origin: this.normal.times(-offset), basisU: this.basisU, basisV: this.basisV };

            let polygon = loop.map(i => projectTo2D(V[i], plane, frame));
            let inverse = false;

            if (geo2d.isClockwise(polygon)) {
                loop.reverse();
                polygon.reverse();
                inverse = true;
            }
            const gridPoints = geo2d.generateTriangleGrid(polygon, this.spacing);
            const points = [];
            polygon.forEach(p => points.push([p.x, p.y]));
            gridPoints.forEach(p => points.push([p.x, p.y]));

            const faces = cdt2d(points, polygon.map((_, index) => [index, (index + 1) % polygon.length]), { exterior: false });

            const material = mesh.material.clone();
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(points.length * 3);

            points.forEach((p, i) => {
                const v = i < loop.length ? V[loop[i]] : projectTo3D(new Vec2(...p), frame);
                positions[i*3+0] = v.x;
                positions[i*3+1] = v.y;
                positions[i*3+2] = v.z;
            });
            if (inverse)
                faces.forEach(face => face.reverse());

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setIndex(faces.flat());
            geometry.computeVertexNormals();
            material.color.set(0x008800);

            const patch = new THREE.Mesh(geometry, material);
            patch.userData.loop = loop;
            patch.userData.isPatch = true;
            mesh.add(patch);
        }
    }
    public runMeshSmooth(mesh: THREE.SkinnedMesh, smoothLayers: number, smoothFactor: number) {
        let [V, F] = extractMeshData(mesh);
        const { skinWeights, skinIndices } = getSkinWeights(mesh);
        const g = new graphlib.Graph();
        let baseV = V.length;
        let baseF = F.length;
        const patches = mesh.children.filter(child => child.userData?.isPatch);

        mesh.updateMatrixWorld(true);
        const worldMatrix = mesh.matrixWorld.clone();
        const worldMatrixInverse = worldMatrix.clone().invert();

        const transform = (v: Vec3, matrix: THREE.Matrix4): Vec3 => {
            const vec = new THREE.Vector3(v.x, v.y, v.z);
            vec.applyMatrix4(matrix);
            return new Vec3(vec.x, vec.y, vec.z);
        };

        for (let i = 0; i < baseV; i++) 
            V[i] = transform(V[i], worldMatrixInverse);

        if (!patches[0].visible) {
            V = patches[0].userData.V;
            baseV = patches[0].userData.baseV;
            baseF = patches[0].userData.baseF;
        } else {
            patches[0].userData.V = [...V];
        }

        for (let i = 0; i < baseF; i++) {
            let [i0, i1, i2] = F[i];
            g.setEdge(i0, i1);
            g.setEdge(i1, i2);
            g.setEdge(i2, i0);
        }
        for (let patch of patches) {
            const [Vp, Fp] = extractMeshData(patch);
            for (let i = 0; i < Vp.length; i++) 
                Vp[i] = transform(Vp[i], worldMatrixInverse);

            const layers = [patch.userData.loop];
            const faces = [];

            if (!patch.visible) {
                patch.userData.faces.forEach(f => faces.push(f));
            } else {
                for (let i = 0; i < Vp.length; i++)
                    if (i >= layers[0].length) {
                        V.push(Vp[i]);
                        skinWeights.push([]);
                        skinIndices.push([]);
                    }
                for (let f of Fp) {
                    const face = [];
                    for (let v of f) {
                        if (v < layers[0].length)
                            face.push(layers[0][v]);
                        else
                            face.push(baseV + v - layers[0].length);
                    }
                    F.push(face);
                    faces.push(face);
                }
                patch.userData.baseF = baseF;
                patch.userData.baseV = baseV;
                patch.userData.faces = [...faces];
                patch.visible = false;
            }
            const visit = new Array(baseV).fill(false);
            const queue = new Queue();
            layers[0].forEach(x => {
                queue.push(x)
                visit[x] = true;
            });

            for (let i = 0; i < smoothLayers; i++) {
                let size = queue.size();
                let layer = [];
                while (size > 0) {
                    size--;
                    let x = queue.pop();

                    for (let e of g.outEdges(x)) {
                        let y = Number(e.w);
                        if (y < baseV && !visit[y]) {
                            queue.push(y);
                            layer.push(y);
                            visit[y] = true;
                        }
                    }
                }
                if (layer.length > 0)
                    layers.push(layer);
            }
            for (let i = 0; i < baseF; i++) {
                let [i0, i1, i2] = F[i];
                if (visit[i0] && visit[i1] && visit[i2])
                    faces.push(F[i]);
            }

            const lap = buildLaplacianTopology([[], faces]);

            const outestLayer = layers[layers.length - 1];
            const hard_constraints_x: [number, number][] = outestLayer.map(i => [i, V[i].x]);
            const hard_constraints_y: [number, number][] = outestLayer.map(i => [i, V[i].y]);
            const hard_constraints_z: [number, number][] = outestLayer.map(i => [i, V[i].z]);

            const innerLayers = layers.slice(0, layers.length - 1).flat();
            const weak_constraints_x: [number, number][] = innerLayers.map(i => [i, V[i].x]);
            const weak_constraints_y: [number, number][] = innerLayers.map(i => [i, V[i].y]);
            const weak_constraints_z: [number, number][] = innerLayers.map(i => [i, V[i].z]);

            const resX = smooth(lap, weak_constraints_x, hard_constraints_x, smoothFactor);
            const resY = smooth(lap, weak_constraints_y, hard_constraints_y, smoothFactor);
            const resZ = smooth(lap, weak_constraints_z, hard_constraints_z, smoothFactor);

            for (const [i, _] of resX)
                V[i] = new Vec3(resX.get(i)!, resY.get(i)!, resZ.get(i)!);
        }
        const newMesh = buildMesh([V, F], false);
        newMesh.material.dispose();
        mesh.geometry.dispose();
        mesh.geometry = newMesh.geometry;
        mesh.bind(mesh.skeleton);
        setSkinWeights(mesh, skinWeights, skinIndices);
    }
    public computeSkinWeights(mesh: THREE.SkinnedMesh) {
        const patches = mesh.children.filter(child => child.userData?.isPatch);
        const data = skinnedMeshToData(mesh);

        for (let patch of patches) {
            const lap = buildLaplacianGeometry([data.mesh[0], patch.userData.faces]);
            const loop = patch.userData.loop;

            for (let i = 0; i < data.skel[1].length; i++) {
                const constraints: [number, number][] = loop.map(j => [j, data.skinWeights[j][i]]);
                const result = diffuse(lap, [], constraints, 1);

                for (let [j, w] of result) {
                    data.skinWeights[j].push(w);
                    data.skinIndices[j].push(i);
                }
            }
        }
        setSkinWeights(mesh, data.skinWeights, data.skinIndices);
    }
}