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

import { Vec3, MeshData, SkelData, SkinnedMeshData } from '@/interface';
import { skinnedMeshFromData, skinnedMeshToData } from '@/utils/skinnedMesh';
import * as THREE from 'three';
import * as geo3d from '@/utils/geo3d';
import * as skin from '@/core/skin';

var graphlib = require("graphlib");

/**
 * Check if a point is inside a THREE mesh using raycasting (odd-even rule).
 * Casts a ray in a fixed direction and counts intersections with the mesh.
 */
function isPointInsideMesh(point: Vec3, targetMesh: THREE.Mesh): boolean {
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(point.x, point.y, point.z);
    const direction = new THREE.Vector3(0.57735, 0.57735, 0.57735); // normalized (1,1,1)

    raycaster.set(origin, direction);
    const intersections = raycaster.intersectObject(targetMesh, false);
    return intersections.length % 2 === 1;
}

/**
 * Classify which vertices of a skinned mesh are inside another mesh.
 * Uses THREE.Raycaster against the target mesh for robust intersection.
 * Returns a boolean array, one per vertex.
 */
function classifyVerticesInsideMesh(
    vertices: Vec3[],
    targetMesh: THREE.Mesh
): boolean[] {
    const raycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3(0.57735, 0.57735, 0.57735);
    const inside = new Array<boolean>(vertices.length);

    for (let i = 0; i < vertices.length; i++) {
        const origin = new THREE.Vector3(vertices[i].x, vertices[i].y, vertices[i].z);
        raycaster.set(origin, direction);
        const hits = raycaster.intersectObject(targetMesh, false);
        inside[i] = hits.length % 2 === 1;
    }
    return inside;
}

/**
 * Build a temporary THREE.Mesh from vertex/face data for raycasting.
 */
function buildTempMesh(vertices: Vec3[], faces: number[][]): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i++) {
        positions[i * 3]     = vertices[i].x;
        positions[i * 3 + 1] = vertices[i].y;
        positions[i * 3 + 2] = vertices[i].z;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(faces.flat());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

/**
 * Mark faces for removal: a face is removed if any of its vertices are inside the other mesh.
 */
function findFacesToRemove(
    faces: number[][],
    vertexInside: boolean[]
): Set<number> {
    const removed = new Set<number>();
    faces.forEach((face, idx) => {
        for (const v of face) {
            if (vertexInside[v]) {
                removed.add(idx);
                break;
            }
        }
    });
    return removed;
}

/**
 * Generate a triangulated slice connecting two boundary loops.
 * Adapted from MeshGen.generateSlice in meshgen.ts.
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
 * Extract boundary loops from a mesh with some faces removed.
 * Returns array of vertex indices forming each boundary loop.
 */
function extractBoundaryLoops(
    vertices: Vec3[],
    faces: number[][],
    removedFaces: Set<number>
): number[][] {
    // Build edge-to-face map for remaining faces only
    const edgeToFaces = new Map<string, number[]>();

    faces.forEach((face, faceIdx) => {
        if (removedFaces.has(faceIdx)) return;

        for (let i = 0; i < face.length; i++) {
            const a = face[i];
            const b = face[(i + 1) % face.length];
            const key = a < b ? `${a},${b}` : `${b},${a}`;

            if (!edgeToFaces.has(key)) {
                edgeToFaces.set(key, []);
            }
            edgeToFaces.get(key)!.push(faceIdx);
        }
    });

    // Boundary edges are those with only one adjacent face
    const boundaryEdges = new Map<number, number[]>();

    edgeToFaces.forEach((faceList, key) => {
        if (faceList.length === 1) {
            const [a, b] = key.split(',').map(Number);
            // Get the face and determine edge direction
            const faceIdx = faceList[0];
            const face = faces[faceIdx];

            // Find edge in face to get correct orientation
            for (let i = 0; i < face.length; i++) {
                const fa = face[i];
                const fb = face[(i + 1) % face.length];
                if ((fa === a && fb === b) || (fa === b && fb === a)) {
                    // Store directed edge (boundary should go opposite to face winding)
                    if (!boundaryEdges.has(fb)) boundaryEdges.set(fb, []);
                    boundaryEdges.get(fb)!.push(fa);
                    break;
                }
            }
        }
    });

    // Extract loops by following boundary edges
    const loops: number[][] = [];
    const visited = new Set<number>();

    for (const startVertex of boundaryEdges.keys()) {
        if (visited.has(startVertex)) continue;

        const loop: number[] = [];
        let current = startVertex;

        while (!visited.has(current) && boundaryEdges.has(current)) {
            visited.add(current);
            loop.push(current);

            const neighbors = boundaryEdges.get(current)!;
            let nextVertex = -1;
            for (const n of neighbors) {
                if (!visited.has(n)) {
                    nextVertex = n;
                    break;
                }
            }

            if (nextVertex === -1) {
                // Check if we've completed the loop back to start
                if (neighbors.includes(startVertex)) {
                    break;
                }
                break;
            }
            current = nextVertex;
        }

        if (loop.length >= 3) {
            loops.push(loop);
        }
    }

    return loops;
}

/**
 * Compact mesh by removing unreferenced vertices and remapping face indices.
 */
function compactMesh(
    vertices: Vec3[],
    faces: number[][]
): { vertices: Vec3[], faces: number[][], indexMap: Map<number, number> } {
    // Find which vertices are actually used
    const usedVertices = new Set<number>();
    for (const face of faces) {
        for (const v of face) {
            usedVertices.add(v);
        }
    }

    // Create mapping from old indices to new indices
    const indexMap = new Map<number, number>();
    const newVertices: Vec3[] = [];

    for (let i = 0; i < vertices.length; i++) {
        if (usedVertices.has(i)) {
            indexMap.set(i, newVertices.length);
            newVertices.push(vertices[i]);
        }
    }

    // Remap face indices
    const newFaces = faces.map(face => face.map(v => indexMap.get(v)!));

    return { vertices: newVertices, faces: newFaces, indexMap };
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

/**
 * Merge two skinned meshes.
 * @param mesh1 First skinned mesh
 * @param mesh2 Second skinned mesh
 * @param smoothingFactor Factor for mesh smoothing (default 0.1)
 * @returns Merged skinned mesh
 */
export function runMeshMerge(
    mesh1: THREE.SkinnedMesh,
    mesh2: THREE.SkinnedMesh,
    smoothingFactor: number = 0.1
): THREE.SkinnedMesh | null {
    const data1 = skinnedMeshToData(mesh1);
    const data2 = skinnedMeshToData(mesh2);

    const V1 = data1.mesh[0];
    const F1 = data1.mesh[1];
    const V2 = data2.mesh[0];
    const F2 = data2.mesh[1];

    // Build temporary THREE.Mesh objects for raycasting
    const tempMesh1 = buildTempMesh(V1, F1);
    const tempMesh2 = buildTempMesh(V2, F2);

    // Step 1: Per-vertex inside classification using THREE.Raycaster
    const v1Inside = classifyVerticesInsideMesh(V1, tempMesh2);
    const v2Inside = classifyVerticesInsideMesh(V2, tempMesh1);

    // Remove face if any of its vertices are inside the other mesh
    const removedFromMesh1 = findFacesToRemove(F1, v1Inside);
    const removedFromMesh2 = findFacesToRemove(F2, v2Inside);

    // Dispose temp geometry
    tempMesh1.geometry.dispose();
    tempMesh2.geometry.dispose();

    // If no triangles were removed, meshes might not intersect
    if (removedFromMesh1.size === 0 && removedFromMesh2.size === 0) {
        console.warn("Meshes do not appear to intersect");
        return null;
    }

    // Step 2: Extract boundary loops from remaining triangles
    const loops1Indices = extractBoundaryLoops(V1, F1, removedFromMesh1);
    const loops2Indices = extractBoundaryLoops(V2, F2, removedFromMesh2);

    if (loops1Indices.length === 0 || loops2Indices.length === 0) {
        console.warn("Could not find boundary loops after removing interior triangles");
        return null;
    }

    // Convert to vertex positions and keep track of indices
    const loops1 = loops1Indices.map(indices => ({
        vertices: indices.map(i => V1[i]),
        indices
    }));
    const loops2 = loops2Indices.map(indices => ({
        vertices: indices.map(i => V2[i]),
        indices
    }));

    // Find the closest pair of loops to connect
    const [loop1Idx, loop2Idx] = findClosestLoopPair(loops1, loops2);

    // Step 3: Build the merged mesh
    // Start with vertices from mesh1
    const mergedVertices: Vec3[] = [...V1];
    const mergedFaces: number[][] = [];

    // Index offset for mesh2 vertices
    const mesh2VertexOffset = V1.length;

    // Add vertices from mesh2
    for (const v of V2) {
        mergedVertices.push(v);
    }

    // Add remaining faces from mesh1
    F1.forEach((face, idx) => {
        if (!removedFromMesh1.has(idx)) {
            mergedFaces.push([...face]);
        }
    });

    // Add remaining faces from mesh2 (with offset)
    F2.forEach((face, idx) => {
        if (!removedFromMesh2.has(idx)) {
            mergedFaces.push(face.map(v => v + mesh2VertexOffset));
        }
    });

    // Step 4: Connect the boundary loops
    const selectedLoop1 = loops1[loop1Idx];
    const selectedLoop2 = loops2[loop2Idx];

    // Generate slice faces connecting the two loops
    const sliceFaces = generateSlice(selectedLoop1.vertices, selectedLoop2.vertices);

    // Map slice face indices to actual vertex indices
    const n1 = selectedLoop1.indices.length;
    for (const face of sliceFaces) {
        const mappedFace = face.map(v => {
            if (v < n1) {
                return selectedLoop1.indices[v];
            } else {
                return selectedLoop2.indices[v - n1] + mesh2VertexOffset;
            }
        });
        mergedFaces.push(mappedFace);
    }

    // Step 5: Compact the mesh to remove isolated vertices
    const compacted = compactMesh(mergedVertices, mergedFaces);
    const finalVertices = compacted.vertices;
    const finalFaces = compacted.faces;

    // Remap connection vertices through the compaction
    const connectionVerticesOld = new Set<number>();
    for (const idx of selectedLoop1.indices) {
        connectionVerticesOld.add(idx);
    }
    for (const idx of selectedLoop2.indices) {
        connectionVerticesOld.add(idx + mesh2VertexOffset);
    }

    const connectionVertices = new Set<number>();
    connectionVerticesOld.forEach(oldIdx => {
        const newIdx = compacted.indexMap.get(oldIdx);
        if (newIdx !== undefined) {
            connectionVertices.add(newIdx);
        }
    });

    // Step 6: Merge skeletons
    const skel1Joints = data1.skel[0] as Vec3[];
    const skel2Joints = data2.skel[0] as Vec3[];
    const skel1Bones = data1.skel[1];
    const skel2Bones = data2.skel[1];

    const jointOffset = skel1Joints.length;

    const mergedJoints: Vec3[] = [...skel1Joints, ...skel2Joints];
    const mergedBones: [number, number][] = [
        ...skel1Bones,
        ...skel2Bones.map(([a, b]) => [a + jointOffset, b + jointOffset] as [number, number])
    ];

    // Try to connect skeletons if they're close enough
    let minJointDist = Infinity;
    let connectJoints: [number, number] | null = null;

    for (let i = 0; i < skel1Joints.length; i++) {
        for (let j = 0; j < skel2Joints.length; j++) {
            const dist = skel1Joints[i].minus(skel2Joints[j]).norm();
            if (dist < minJointDist) {
                minJointDist = dist;
                connectJoints = [i, j + jointOffset];
            }
        }
    }

    // Connect skeletons if joints are close enough
    const connectionThreshold = 50;
    if (connectJoints && minJointDist < connectionThreshold) {
        mergedBones.push(connectJoints);
    }

    // Step 7: Smooth the mesh around the connection region
    // Create constraints: all vertices except those in the connection region
    const constraints: number[] = [];
    for (let i = 0; i < finalVertices.length; i++) {
        if (!connectionVertices.has(i)) {
            constraints.push(i);
        }
    }

    // Apply smoothing (only if we have enough constraints)
    if (constraints.length > 0 && finalFaces.length > 0) {
        try {
            geo3d.runLeastSquaresMesh(finalVertices, finalFaces, constraints, smoothingFactor);
        } catch (e) {
            console.warn("Smoothing failed, continuing without smoothing:", e);
        }
    }

    // Try to fix face orientation (may fail for non-manifold meshes)
    try {
        geo3d.runFaceOrientation(finalVertices, finalFaces);
    } catch (e) {
        console.warn("Face orientation failed, mesh may have inconsistent normals:", e);
    }

    // Step 8: Compute skin weights for merged mesh
    const mergedSkinWeights = skin.computeSkinWeightsGlobal(
        [finalVertices, finalFaces],
        [mergedJoints, mergedBones]
    );

    // Create and return the merged skinned mesh
    return skinnedMeshFromData({
        mesh: [finalVertices, finalFaces],
        skel: [mergedJoints, mergedBones],
        skinWeights: mergedSkinWeights,
        skinIndices: null
    });
}

/**
 * Alternative merge that preserves original skin weights where possible.
 */
export function runMeshMergePreserveSkin(
    mesh1: THREE.SkinnedMesh,
    mesh2: THREE.SkinnedMesh,
    smoothingFactor: number = 0.1
): THREE.SkinnedMesh | null {
    const data1 = skinnedMeshToData(mesh1);
    const data2 = skinnedMeshToData(mesh2);

    const V1 = data1.mesh[0];
    const F1 = data1.mesh[1];
    const V2 = data2.mesh[0];
    const F2 = data2.mesh[1];

    // Build temporary THREE.Mesh objects for raycasting
    const tempMesh1 = buildTempMesh(V1, F1);
    const tempMesh2 = buildTempMesh(V2, F2);

    // Step 1: Per-vertex inside classification using THREE.Raycaster
    const v1Inside = classifyVerticesInsideMesh(V1, tempMesh2);
    const v2Inside = classifyVerticesInsideMesh(V2, tempMesh1);

    // Remove face if any of its vertices are inside the other mesh
    const removedFromMesh1 = findFacesToRemove(F1, v1Inside);
    const removedFromMesh2 = findFacesToRemove(F2, v2Inside);

    // Dispose temp geometry
    tempMesh1.geometry.dispose();
    tempMesh2.geometry.dispose();

    if (removedFromMesh1.size === 0 && removedFromMesh2.size === 0) {
        console.warn("Meshes do not appear to intersect");
        return null;
    }

    // Step 2: Extract boundary loops
    const loops1Indices = extractBoundaryLoops(V1, F1, removedFromMesh1);
    const loops2Indices = extractBoundaryLoops(V2, F2, removedFromMesh2);

    if (loops1Indices.length === 0 || loops2Indices.length === 0) {
        console.warn("Could not find boundary loops after removing interior triangles");
        return null;
    }

    const loops1 = loops1Indices.map(indices => ({
        vertices: indices.map(i => V1[i]),
        indices
    }));
    const loops2 = loops2Indices.map(indices => ({
        vertices: indices.map(i => V2[i]),
        indices
    }));

    const [loop1Idx, loop2Idx] = findClosestLoopPair(loops1, loops2);

    // Build merged mesh
    const mergedVertices: Vec3[] = [...V1];
    const mergedFaces: number[][] = [];
    const mesh2VertexOffset = V1.length;

    for (const v of V2) {
        mergedVertices.push(v);
    }

    F1.forEach((face, idx) => {
        if (!removedFromMesh1.has(idx)) {
            mergedFaces.push([...face]);
        }
    });

    F2.forEach((face, idx) => {
        if (!removedFromMesh2.has(idx)) {
            mergedFaces.push(face.map(v => v + mesh2VertexOffset));
        }
    });

    // Connect boundary loops
    const selectedLoop1 = loops1[loop1Idx];
    const selectedLoop2 = loops2[loop2Idx];
    const sliceFaces = generateSlice(selectedLoop1.vertices, selectedLoop2.vertices);

    const n1 = selectedLoop1.indices.length;
    for (const face of sliceFaces) {
        const mappedFace = face.map(v => {
            if (v < n1) return selectedLoop1.indices[v];
            else return selectedLoop2.indices[v - n1] + mesh2VertexOffset;
        });
        mergedFaces.push(mappedFace);
    }

    // Compact mesh to remove isolated vertices
    const compacted = compactMesh(mergedVertices, mergedFaces);
    const finalVertices = compacted.vertices;
    const finalFaces = compacted.faces;

    // Remap connection vertices
    const connectionVerticesOld = new Set<number>();
    for (const idx of selectedLoop1.indices) connectionVerticesOld.add(idx);
    for (const idx of selectedLoop2.indices) connectionVerticesOld.add(idx + mesh2VertexOffset);

    const connectionVertices = new Set<number>();
    connectionVerticesOld.forEach(oldIdx => {
        const newIdx = compacted.indexMap.get(oldIdx);
        if (newIdx !== undefined) {
            connectionVertices.add(newIdx);
        }
    });

    // Merge skeletons with bone index remapping
    const skel1Joints = data1.skel[0] as Vec3[];
    const skel2Joints = data2.skel[0] as Vec3[];
    const skel1Bones = data1.skel[1];
    const skel2Bones = data2.skel[1];

    const jointOffset = skel1Joints.length;
    const boneOffset = skel1Bones.length;

    const mergedJoints: Vec3[] = [...skel1Joints, ...skel2Joints];
    const mergedBones: [number, number][] = [
        ...skel1Bones,
        ...skel2Bones.map(([a, b]) => [a + jointOffset, b + jointOffset] as [number, number])
    ];

    // Build skin weights for compacted mesh (preserve original where possible)
    const mergedSkinWeights: number[][] = [];
    const mergedSkinIndices: number[][] = [];

    // We need to map from new vertex indices back to old vertex indices
    // Create reverse map
    const reverseMap = new Map<number, number>();
    compacted.indexMap.forEach((newIdx, oldIdx) => {
        reverseMap.set(newIdx, oldIdx);
    });

    for (let newIdx = 0; newIdx < finalVertices.length; newIdx++) {
        const oldIdx = reverseMap.get(newIdx)!;
        
        if (oldIdx < V1.length) {
            // Vertex from mesh1
            const weights = data1.skinWeights[oldIdx] || [];
            const indices = data1.skinIndices ? data1.skinIndices[oldIdx] : null;

            if (indices) {
                mergedSkinWeights.push([...weights]);
                mergedSkinIndices.push([...indices]);
            } else {
                mergedSkinWeights.push([...weights]);
                mergedSkinIndices.push(weights.map((_, idx) => idx));
            }
        } else {
            // Vertex from mesh2
            const mesh2Idx = oldIdx - V1.length;
            const weights = data2.skinWeights[mesh2Idx] || [];
            const indices = data2.skinIndices ? data2.skinIndices[mesh2Idx] : null;

            if (indices) {
                mergedSkinWeights.push([...weights]);
                mergedSkinIndices.push(indices.map(idx => idx + boneOffset));
            } else {
                mergedSkinWeights.push([...weights]);
                mergedSkinIndices.push(weights.map((_, idx) => idx + boneOffset));
            }
        }
    }

    // Connection region smoothing
    const constraints: number[] = [];
    for (let i = 0; i < finalVertices.length; i++) {
        if (!connectionVertices.has(i)) constraints.push(i);
    }

    if (constraints.length > 0 && finalFaces.length > 0) {
        try {
            geo3d.runLeastSquaresMesh(finalVertices, finalFaces, constraints, smoothingFactor);
        } catch (e) {
            console.warn("Smoothing failed, continuing without smoothing:", e);
        }
    }

    try {
        geo3d.runFaceOrientation(finalVertices, finalFaces);
    } catch (e) {
        console.warn("Face orientation failed, mesh may have inconsistent normals:", e);
    }

    // Try to connect skeletons
    let minJointDist = Infinity;
    let connectJoints: [number, number] | null = null;

    for (let i = 0; i < skel1Joints.length; i++) {
        for (let j = 0; j < skel2Joints.length; j++) {
            const dist = skel1Joints[i].minus(skel2Joints[j]).norm();
            if (dist < minJointDist) {
                minJointDist = dist;
                connectJoints = [i, j + jointOffset];
            }
        }
    }

    const connectionThreshold = 50;
    if (connectJoints && minJointDist < connectionThreshold) {
        mergedBones.push(connectJoints);
    }

    return skinnedMeshFromData({
        mesh: [finalVertices, finalFaces],
        skel: [mergedJoints, mergedBones],
        skinWeights: mergedSkinWeights,
        skinIndices: mergedSkinIndices
    });
}
