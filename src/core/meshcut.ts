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

export function runMeshCut(mesh: THREE.SkinnedMesh, plane: Plane, smoothFactor: number = 0.5): THREE.SkinnedMesh[] {
    let data = skinnedMeshToData(mesh);

    let nV = data.mesh[0].length;
    let nF = data.mesh[1].length;
    let nJ = data.skel[0].length;
    var g = new graphlib.Graph();
    let vertexDist = new Array(nV).fill(0);
    let jointDist = new Array(nJ).fill(0);

    data.mesh[0].forEach((v, i) => {
        g.setNode(i, v);
        vertexDist[i] = plane.normal.dot(v) + plane.offset;
    });
    data.skel[0].forEach((b, i) => {
        let bone = new THREE.Bone();
        let pos = new THREE.Vector3();

        bone.position.setFromMatrixPosition(b.matrixWorld);
        bone.quaternion.setFromRotationMatrix(b.matrixWorld);
        bone.scale.setFromMatrixScale(b.matrixWorld);
        bone.getWorldPosition(pos);

        g.setNode(i + nV, bone);
        jointDist[i] = plane.normal.dot(pos) + plane.offset;
    });
    data.mesh[1].forEach(([i0, i1, i2], i) => {
        if ((vertexDist[i0] >= 0 && vertexDist[i1] >= 0 && vertexDist[i2] >= 0) ||
            (vertexDist[i0] <  0 && vertexDist[i1] <  0 && vertexDist[i2] <  0)
        ) {
            g.setEdge(i0, i1, i2);
            g.setEdge(i1, i2, i0);
            g.setEdge(i2, i0, i1);
        }
    });
    data.skel[1].forEach(([i0, i1], i) => {
        if ((jointDist[i0] >= 0 && jointDist[i1] >= 0) ||
            (jointDist[i0] <  0 && jointDist[i1] <  0)
        ) {
            g.setEdge(i0+nV, i1+nV);
            g.setEdge(i1+nV, i0+nV);
        }
    });

    for (let i = 0; i < nV; i++)
    for (let j = 0; j < 4; j++) {
        let k = data.skinIndices[i][j];
        let w = data.skinWeights[i][j];
        if ((vertexDist[i] >= 0 && jointDist[k] >= 0) ||
            (vertexDist[i] <  0 && jointDist[k] <  0)
        ) {
            g.setEdge(i, k+nV, w);
            g.setEdge(k+nV, i, w);
        }
    }
    let components = graphlib.alg.components(g);
    let newMeshes = [];
    
    // Compute plane basis for 2D projection
    const [basisU, basisV] = computePlaneBasis(plane.normal);
    const planeOrigin = plane.normal.times(-plane.offset);
    
    components.forEach(comp => {
        let vIdxMap = new Map();
        let jIdxMap = new Map();

        comp.forEach((x, _) => {
            if (x < nV) vIdxMap.set(Number(x), vIdxMap.size);
            else        jIdxMap.set(Number(x), jIdxMap.size);
        });
        let V = new Array(vIdxMap.size), F = [];
        let J = new Array(jIdxMap.size), B = [];
        let skinWeights = new Array(vIdxMap.size);
        let skinIndices = new Array(vIdxMap.size);
        
        // Track edge usage to detect boundary edges\
        let edges = new Map<string, [number, number]>();

        vIdxMap.forEach((i, u) => {
            V[i] = g.node(u);
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
                    indices.push(jIdxMap.get(v));
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
        let polygon2D = boundaryLoop.map(idx => projectTo2D(V[idx], plane, basisU, basisV, planeOrigin));
        let inversed = false;
        if (geo2d.isClockwise(polygon2D)) {
            boundaryLoop.reverse();
            polygon2D.reverse();
            inversed = true;
        }
        const spacing = 10;
        const gridPoints2D = geo2d.generateTriangleGrid(polygon2D, spacing);
        const gridPoints3D = gridPoints2D.map(p => 
            projectTo3D(p, basisU, basisV, planeOrigin)
        );

        let points = [];
        let offset = V.length;
        polygon2D.forEach(p => points.push([p.x, p.y]));
        gridPoints2D.forEach((p, i) => {
            points.push([p.x, p.y]);
            V.push(gridPoints3D[i]);
            skinWeights.push([]);
            skinIndices.push([]);
        });
        let faces = cdt2d(points, polygon2D.map((_, index) => [index, (index+1)%polygon2D.length]), {exterior: false});
        for (let f of faces) {
            let face = [];
            for (let v of f) {
                if (v < polygon2D.length) {
                    face.push(boundaryLoop[v]);
                } else {
                    face.push(offset + v - polygon2D.length);
                }
            }
            if (inversed) face.reverse();
            F.push(face);
        }
        
        jIdxMap.forEach((i, u) => {
            J[i] = g.node(u);
            for (let e of g.outEdges(u)) if (e.w >= V.length) {
                let v = Number(e.w);
                if (u < v)
                    B.push([
                        jIdxMap.get(u),
                        jIdxMap.get(v)
                    ]);
            }
        });
        for (let i = 0; i < V.length; i++) {
            while (skinWeights[i].length < 4) {
                skinWeights[i].push(0);
                skinIndices[i].push(0);
            }

            let sum = skinWeights[i].reduce((a, b) => a + b, 0);
            if (sum === 0) {
                sum = 1;
                skinWeights[i][0] = 1;
            }
            skinWeights[i] = skinWeights[i].map(w => w / sum);
        }
        newMeshes.push(skinnedMeshFromData({
            mesh: [V, F],
            skel: [J, B],
            skinWeights,
            skinIndices
        }));
    });
    return newMeshes;
}