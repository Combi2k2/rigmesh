/**
 * Mesh cut operator: cut mesh + skeleton by a plane, extract boundary, patch with CDT, smooth.
 *
 * Plane: normal·x + offset = 0 (normal unit Vec3, offset number). No THREE.Plane.
 * Flow is split into phases: runClassification, runBoundaryExtraction, runPatchTriangulation, runLocalizedSmoothing.
 */

import { Vec3, Plane } from '@/interface';
import { skinnedMeshFromData } from '@/utils/skinnedMesh';
import { skinnedMeshToData } from '@/utils/skinnedMesh';
import * as THREE from 'three';
const cdt2d = require('cdt2d');
import * as geo2d from '@/utils/geo2d';

var graphlib = require("graphlib");

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

export function runMeshSplitting(mesh: THREE.SkinnedMesh, plane: Plane): THREE.SkinnedMesh[] {
    const geometry = mesh.geometry;
    const skeleton = mesh.skeleton;

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const idxAttr = geometry.getIndex()!;
    const skinWeightsAttr = geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
    const skinIndicesAttr = geometry.getAttribute('skinIndex') as THREE.BufferAttribute;

    let nV = posAttr.count;
    let nF = idxAttr.count / 3;
    let nJ = skeleton.bones.length;
    var g = new graphlib.Graph();
    let vertexDist = new Array(nV).fill(0);
    let jointDist = new Array(nJ).fill(0);

    for (let i = 0; i < nV; i++) {
        g.setNode(i, new Vec3(
            posAttr.getX(i),
            posAttr.getY(i),
            posAttr.getZ(i)
        ));
        vertexDist[i] = plane.normal.dot(g.node(i)) + plane.offset;
    }
    for (let i = 0; i < nJ; i++) {
        let bone = new THREE.Bone();
        let pos = new THREE.Vector3();

        bone.position.setFromMatrixPosition(skeleton.bones[i].matrixWorld);
        bone.quaternion.setFromRotationMatrix(skeleton.bones[i].matrixWorld);
        bone.scale.setFromMatrixScale(skeleton.bones[i].matrixWorld);
        bone.getWorldPosition(pos);

        g.setNode(i + nV, bone);
        jointDist[i] = plane.normal.dot(pos) + plane.offset;
    }
    for (let i = 0; i < nF; i++) {
        let v0 = idxAttr.getX(i * 3);
        let v1 = idxAttr.getX(i * 3 + 1);
        let v2 = idxAttr.getX(i * 3 + 2);
        if ((vertexDist[v0] >= 0 && vertexDist[v1] >= 0 && vertexDist[v2] >= 0) ||
            (vertexDist[v0] <  0 && vertexDist[v1] <  0 && vertexDist[v2] <  0)
        ) {
            g.setEdge(v0, v1, v2);
            g.setEdge(v1, v2, v0);
            g.setEdge(v2, v0, v1);
        }
    }
    for (let i = 0; i < nJ; i++)
    for (let c of skeleton.bones[i].children) {
        let j = skeleton.bones.indexOf(c);
        if (j < 0) continue;
        if ((jointDist[i] >= 0 && jointDist[j] >= 0) ||
            (jointDist[i] <  0 && jointDist[j] <  0)
        ) {
            g.setEdge(i + nV, j + nV);
            g.setEdge(j + nV, i + nV);
        }
    }
    for (let i = 0; i < nV; i++)
    for (let j = 0; j < 4; j++) {
        let k = skinIndicesAttr.getComponent(i, j);
        let w = skinWeightsAttr.getComponent(i, j);
        if ((vertexDist[i] >= 0 && jointDist[k] >= 0) ||
            (vertexDist[i] <  0 && jointDist[k] <  0)
        ) {
            g.setEdge(i, k+nV, w);
            g.setEdge(k+nV, i, w);
        }
    }
    let components = graphlib.alg.components(g);
    let newMeshes = [];
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
                } else {
                    weights.push(w);
                    indices.push(jIdxMap.get(v));
                }
            }
            let sum = weights.reduce((a, b) => a + b, 0);
            weights = weights.map(w => w / sum);

            skinWeights[i] = weights;
            skinIndices[i] = indices;
        });
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
        }
        console.log("new mesh: ", V.length, F.length, J.length, B.length);
        console.log("new bone: ", B);
        newMeshes.push(skinnedMeshFromData({
            mesh: [V, F],
            skel: [J, B],
            skinWeights,
            skinIndices
        }));
    });
    return newMeshes;
}