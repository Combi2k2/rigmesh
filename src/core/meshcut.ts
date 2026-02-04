/**
 * Mesh cut operator: cut mesh + skeleton by a plane, extract boundary, patch with CDT, smooth.
 *
 * Plane: normal·x + offset = 0 (normal unit Vec3, offset number). No THREE.Plane.
 * Flow is split into phases: runClassification, runBoundaryExtraction, runPatchTriangulation, runLocalizedSmoothing.
 */

import { Vec2, Vec3, Plane } from '@/interface';
import { skinnedMeshFromData } from '@/utils/skinnedMesh';
import { skinnedMeshToData } from '@/utils/skinnedMesh';
import * as THREE from 'three';
const cdt2d = require('cdt2d');
import * as geo2d from '@/utils/geo2d';
import * as geo3d from '@/utils/geo3d';
import * as skin from '@/core/skin';

var graphlib = require("graphlib");

/**
 * Project a 3D vertex onto a plane and get its 2D coordinates.
 * @param vertex The 3D point to project
 * @param plane The plane (normal and offset)
 * @param basisU First basis vector on the plane
 * @param basisV Second basis vector on the plane (orthogonal to basisU)
 * @param origin Origin point on the plane
 * @returns {x, y} coordinates in the plane's local system
 */
export function projectTo2D(
    vertex: Vec3,
    plane: Plane,
    basisU: Vec3,
    basisV: Vec3,
    origin: Vec3
): { x: number; y: number } {
    const { normal, offset } = plane;
    const signedDist = normal.dot(vertex) + offset;
    const projected = vertex.minus(normal.times(signedDist));
    const fromOrigin = projected.minus(origin);
    return {
        x: fromOrigin.dot(basisU),
        y: fromOrigin.dot(basisV)
    };
}

/**
 * Convert 2D coordinates back to 3D point on the plane.
 * @param point2D The {x, y} coordinates in the plane's local system
 * @param basisU First basis vector on the plane
 * @param basisV Second basis vector on the plane
 * @param origin Origin point on the plane
 * @returns The 3D point on the plane
 */
export function projectTo3D(
    point2D: { x: number; y: number },
    basisU: Vec3,
    basisV: Vec3,
    origin: Vec3
): Vec3 {
    return origin.plus(basisU.times(point2D.x)).plus(basisV.times(point2D.y));
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

export function runMeshCut(mesh: THREE.SkinnedMesh, plane: Plane, sharpFactor: number = 0.5): THREE.SkinnedMesh[] {
    let data = skinnedMeshToData(mesh);

    let nV = data.mesh[0].length;
    var g = new graphlib.Graph();
    let vertexDist = data.mesh[0].map(v => plane.normal.dot(v) + plane.offset);
    let jointDist = data.skel[0].map(b => plane.normal.dot(b) + plane.offset);
    let spacing = 0;

    data.mesh[1].forEach(([i0, i1, i2], _) => {
        if ((vertexDist[i0] >= 0 && vertexDist[i1] >= 0 && vertexDist[i2] >= 0) ||
            (vertexDist[i0] <  0 && vertexDist[i1] <  0 && vertexDist[i2] <  0)
        ) {
            g.setEdge(i0, i1, i2);
            g.setEdge(i1, i2, i0);
            g.setEdge(i2, i0, i1);
        }
        spacing += data.mesh[0][i0].minus(data.mesh[0][i1]).norm();
        spacing += data.mesh[0][i1].minus(data.mesh[0][i2]).norm();
        spacing += data.mesh[0][i2].minus(data.mesh[0][i0]).norm();
    });
    spacing /= 3 * data.mesh[1].length;

    let splitMap = new Map<number, [number, number]>();

    data.skel[1].forEach(([i0, i1], i) => {
        if (jointDist[i0] >= 0 && jointDist[i1] >= 0)   return;
        if (jointDist[i0] <  0 && jointDist[i1] <  0)   return;

        let v0 = data.skel[0][i0];
        let v1 = data.skel[0][i1];
        let dir = v1.minus(v0).over(Math.abs(jointDist[i0]) + Math.abs(jointDist[i1]));
        let newBone0 = -1;
        let newBone1 = -1;

        if (Math.abs(jointDist[i0]) >= 3 * spacing) {
            let newPos = v0.plus(dir.times(Math.abs(jointDist[i0]) - 1.5 * spacing));
            data.skel[0].push(newPos);
            data.skel[1].push([i0, data.skel[0].length - 1]);
            jointDist.push(plane.normal.dot(newPos) + plane.offset);
            newBone0 = data.skel[1].length - 1;
        }
        if (Math.abs(jointDist[i1]) >= 3 * spacing) {
            let newPos = v0.plus(dir.times(Math.abs(jointDist[i0]) + 1.5 * spacing));
            data.skel[0].push(newPos);
            data.skel[1].push([i1, data.skel[0].length - 1]);
            jointDist.push(plane.normal.dot(newPos) + plane.offset);
            newBone1 = data.skel[1].length - 1;
        }
        splitMap.set(i, [newBone0, newBone1]);
    });
    const offsetJoint = nV;
    const offsetBone = nV + data.skel[0].length;

    data.skel[1].forEach(([i0, i1], i) => {
        if (!splitMap.has(i)) {
            g.setEdge(i0 + offsetJoint, i + offsetBone);
            g.setEdge(i1 + offsetJoint, i + offsetBone);
            g.setEdge(i + offsetBone, i0 + offsetJoint);
            g.setEdge(i + offsetBone, i1 + offsetJoint);
        }
    })

    for (let i = 0; i < nV; i++)
    for (let j = 0; j < 4; j++) {
        let k = data.skinIndices[i][j];
        let w = data.skinWeights[i][j];
        if (splitMap.has(k)) {
            let [i0, _]  = data.skel[1][k];
            let [k0, k1] = splitMap.get(k);

            let sameSide = (
                (vertexDist[i] >= 0 && jointDist[i0] >= 0) ||
                (vertexDist[i] <  0 && jointDist[i0] <  0)
            );
            if (k0 >= 0 && sameSide) {
                g.setEdge(i, k0 + offsetBone, w);
                g.setEdge(k0 + offsetBone, i, w);
            }
            if (k1 >= 0 && !sameSide) {
                g.setEdge(i, k1 + offsetBone, w);
                g.setEdge(k1 + offsetBone, i, w);
            }
        } else {
            let [t, _] = data.skel[1][k];
            if ((vertexDist[i] >= 0 && jointDist[t] >= 0) ||
                (vertexDist[i] <  0 && jointDist[t] <  0)
            ) {
                g.setEdge(i, k + offsetBone, w);
                g.setEdge(k + offsetBone, i, w);
            }
        }
    }
    let components = graphlib.alg.components(g);
    let newMeshes = [];
    
    // Compute plane basis for 2D projection
    const [basisU, basisV] = computePlaneBasis(plane.normal);
    const planeOrigin = plane.normal.times(-plane.offset);
    
    components.forEach(comp => {
        let vIdxMap = new Map();
        let bIdxMap = new Map();
        let jIdxMap = new Map();

        comp.forEach((x, _) => {
            if (x < nV) {
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
        
        // Track edge usage to detect boundary edges\
        let edges = new Map<string, [number, number]>();

        vIdxMap.forEach((i, u) => { V[i] = data.mesh[0][u]; });
        jIdxMap.forEach((i, u) => { J[i] = data.skel[0][u - offsetJoint]; });
        bIdxMap.forEach((i, k) => {
            let [i0, i1] = data.skel[1][k - offsetBone];
            B[i] = [
                jIdxMap.get(i0+offsetJoint),
                jIdxMap.get(i1+offsetJoint)
            ];
        });
        vIdxMap.forEach((i, u) => {
            let weights = [];
            let indices = [];

            for (let e of g.outEdges(u)) {
                let v = Number(e.w);
                let w = g.edge(u, v);
                if (v < nV) {
                    if (u < v && u < w)
                        F.push([
                            vIdxMap.get(u),
                            vIdxMap.get(v),
                            vIdxMap.get(w)
                        ]);
                    let key = u < v ? `${u},${v}` : `${v},${u}`;
                    if (edges.has(key))
                        edges.delete(key);
                    else
                        edges.set(key, [v, u]);
                } else {
                    weights.push(w);
                    indices.push(bIdxMap.get(v));
                }
            }
            skinWeights[i] = weights;
            skinIndices[i] = indices;
        });
        
        let boundaryLoop = [];
        let boundaryG = new graphlib.Graph();
        edges.forEach(([a, b]) => {
            boundaryG.setEdge(a, b);
        });
        if (boundaryG.nodeCount() > 0) {
            boundaryLoop = graphlib.alg.preorder(boundaryG, boundaryG.nodes()[0])
            boundaryLoop = boundaryLoop.map(x => vIdxMap.get(Number(x)));
        }
        let polygon = boundaryLoop.map(idx => projectTo2D(V[idx], plane, basisU, basisV, planeOrigin));
        let inverse = false;
        if (geo2d.isClockwise(polygon)) {
            boundaryLoop.reverse();
            polygon.reverse();
            inverse = true;
        }
        const gridPoints = geo2d.generateTriangleGrid(polygon, spacing);
        const points = [];
        const offset = V.length;
        polygon.forEach(p => points.push([p.x, p.y]));
        gridPoints.forEach(p => points.push([p.x, p.y]));

        let faces = cdt2d(points, polygon.map((_, index) => [index, (index+1)%polygon.length]), {exterior: false});
        let verts = points.map(p => projectTo3D(p, basisU, basisV, planeOrigin));
        let constraints = [];

        for (let i = 0; i < boundaryLoop.length; i++) {
            verts[i] = V[boundaryLoop[i]];
            constraints.push(i);
        }
        geo3d.runLeastSquaresMesh(verts, faces, constraints, 0.1/sharpFactor);

        for (let i = polygon.length; i < verts.length; i++) {
            V.push(verts[i]);
            skinWeights.push([]);
            skinIndices.push([]);
        }
        for (let f of faces) {
            let face = [];
            for (let v of f) {
                if (v < polygon.length) {
                    face.push(boundaryLoop[v]);
                } else {
                    face.push(offset + v - polygon.length);
                }
            }
            if (inverse)
                face.reverse();
            
            F.push(face);
        }
        newMeshes.push(skinnedMeshFromData({
            mesh: [V, F],
            skel: [J, B],
            skinWeights: skin.computeSkinWeightsGlobal([V, F], [J, B]),
            skinIndices: null
        }));
    });
    return newMeshes;
}