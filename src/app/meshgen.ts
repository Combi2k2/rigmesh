import * as geo2d from './geo2d';
import * as geo3d from './geo3d';
import Queue from './queue';
import Vector from '@/lib/linalg/vector';

const { Mesh } = require('@/lib/geometry/mesh');

// @ts-ignore - CommonJS module
var Graph = require("graphlib").Graph;
var cdt2d = require('cdt2d');

interface Point {
    x: number;
    y: number;
}

function distance(a: Point, b: Point) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function isClockwise(points: Point[]) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        sum += (points[j].x - points[i].x) * (points[j].y + points[i].y);
    }
    return sum > 0;
}

function reparameterize(points: Point[], isodistance: number) {
    let length = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        length += distance(points[i], points[j]);
    }
    let nSegments = Math.floor(length / isodistance);
    let newPath = [];

    isodistance = length / nSegments;

    let currentDistance = 0;
    let currentPtr = 0;

    for (let i = 0; i < nSegments; i++) {
        while (currentDistance < isodistance && currentPtr < points.length - 1) {
            currentDistance += distance(points[currentPtr], points[currentPtr + 1]);
            currentPtr++;
        }
        currentDistance -= isodistance;

        let index = Math.max(1, Math.min(points.length - 1, currentPtr));
        let a = points[index - 1];
        let b = points[index];
        let t = Math.max(0, currentDistance) / distance(a, b);
        
        newPath.push({
            x: t * a.x + (1-t) * b.x,
            y: t * a.y + (1-t) * b.y
        });
    }
    return newPath;
}

class MeshGen {
    private chordAxis: Vector[] = [];
    private chordDirs: Vector[] = [];
    private chordLengths: number[] = [];
    private chordGraph: any;
    private chordMap: Map<string, number> = new Map();
    private chordCaps: number[] = [];
    private chordJunctions: number[][] = [];
    private chordOffset: number[] = [];
    private chordBufSize: number[] = [];

    private allVertices: Vector[] = [];
    private allFaces: number[][] = [];

    private mesh2d: any;
    private mesh3d: any;

    constructor(private polygon: Point[], private isodistance: number) {
        this.buildTriangulation();
        this.pruneTriangulation();
        this.buildChordGraph();

        let nC = this.chordGraph.nodes().length;
        for (let i = 0; i < nC; i++) {
            let dir = this.chordDirs[i];
            this.chordDirs[i] = new Vector(
                dir.x * dir.x - dir.y * dir.y,
                2 * dir.x * dir.y
            );
            this.chordDirs[i].normalize();
        }
        for (let i = 0; i < 50; i++) {
            geo3d.LaplacianSmooth(this.chordDirs, [], this.chordGraph, 0.5);
            geo3d.LaplacianSmooth(this.chordAxis, [], this.chordGraph, 0.5);
            
            for (let j = 0; j < nC; j++)
                this.chordDirs[j].normalize();
        }
        for (let i = 0; i < nC; i++) {
            let dir = this.chordDirs[i];
            let nx = Math.sqrt((1 + dir.x) / 2);
            let ny = Math.sqrt((1 - dir.x) / 2);
            if (nx * ny * dir.y < 0) {
                ny = -ny;
            }
            this.chordDirs[i].x = nx;
            this.chordDirs[i].y = ny;
        }
        
        this.generateCylinders();
        this.stitchCaps();
        this.stitchJunctions();

        // NOTE: runLSMesh is disabled due to ES module compatibility issues with Emscripten
        let constraints = [];
        for (let i = 0; i < nC; i++)
        for (let j = 0; j < this.chordBufSize[i]; j++)
            constraints.push(this.chordOffset[i] + j);
        
        geo3d.runLeastSquaresMesh(this.allVertices, this.allFaces, constraints);

        let result = geo3d.runIsometricRemesh(this.allVertices, this.allFaces);
        this.allVertices = result.vertices;
        this.allFaces = result.faces;
    }
    private buildTriangulation() {
        if (isClockwise(this.polygon)) {
            this.polygon = this.polygon.reverse();
        }
        this.polygon = reparameterize(this.polygon, this.isodistance);
        this.mesh2d = new (Mesh as any)();
        this.mesh2d.build({
            v: this.polygon.map(p => new Vector(p.x, p.y, 0)),
            f: geo2d.CDT(this.polygon).flat()
        });
    }
    private pruneTriangulation() {
        let nF = this.mesh2d.faces.length;
        let toLeaf = new Array(nF).fill(0);
        let toPrune = new Array(nF).fill(false);
        let visited = new Array(nF).fill(false);
        let queue = new Queue();
        let barycenter = new Array(nF).fill({x: 0, y: 0});

        for (let i = 0; i < nF; i++) {
            let f = this.mesh2d.faces[i];

            for (let h of f.adjacentHalfedges()) {
                barycenter[i].x += this.polygon[h.vertex.index].x;
                barycenter[i].y += this.polygon[h.vertex.index].y;
            }
            barycenter[i].x /= 3;
            barycenter[i].y /= 3;

            if (f.adjacentFaces().length === 1) {
                toLeaf[i] = 0;
                queue.push(i);
            }
        }
        
        while (!queue.empty()) {
            let i = queue.pop();
            let f = this.mesh2d.faces[i];
            let adjFaces = [];
            visited[i] = true;

            for (let h of f.adjacentHalfedges())
                if (!h.twin.onBoundary)
                    adjFaces.push(h.twin.face);
            
            for (let fc of adjFaces) {
                let ic = fc.index;
                if (visited[ic]) {
                    toLeaf[i] = Math.max(
                        toLeaf[i],
                        toLeaf[ic] + distance(barycenter[i], barycenter[ic])
                    );
                }
            }
            
            if (adjFaces.length > 2) {
                let pruned = false;
                for (let fc of adjFaces) {
                    let ic = fc.index;
                    if (visited[ic]) {
                        if (toLeaf[ic] < 5 * this.isodistance) {
                            toPrune[ic] = true;
                            let st = [[ic, i]];
                            while (st.length > 0) {
                                let [u, p] = st.pop() as [number, number];

                                for (let h of this.mesh2d.faces[u].adjacentHalfedges()) {
                                    let v = h.twin.face.index;
                                    if (v !== p && !toPrune[v]) {
                                        toPrune[v] = true;
                                        st.push([v, u]);
                                    }
                                }
                            }
                            pruned = true;
                            continue;
                        }
                    }
                }
                if (!pruned)
                    continue;
            }
            for (let fc of adjFaces) {
                let ic = fc.index;
                if (!visited[ic])
                    queue.push(ic);
            }
        }
        let newFaces = [];
        for (let i = 0; i < nF; i++)
            if (!toPrune[i]) {
                for (let v of this.mesh2d.faces[i].adjacentVertices())
                    newFaces.push(v.index);
            }
        this.mesh2d.build({
            v: this.polygon.map(p => new Vector(p.x, p.y, 0)),
            f: newFaces
        });
    }
    private buildChordGraph() {
        let chordCount = 0;
        this.chordGraph = new Graph();
        
        for (let e of this.mesh2d.edges) {
            if (e.onBoundary())
                continue;
            
            this.chordGraph.setNode(chordCount);
            let h = e.halfedge;
            let i0 = h.vertex.index;
            let i1 = h.twin.vertex.index;

            if (i0 > i1) {
                [i0, i1] = [i1, i0];
            }

            let key = `${i0}-${i1}`;
            this.chordMap.set(key, chordCount);

            let v1 = this.polygon[h.vertex.index];
            let v2 = this.polygon[h.twin.vertex.index];

            this.chordLengths.push(distance(v1, v2));
            this.chordAxis.push(new Vector(
                (v1.x + v2.x) / 2,
                (v1.y + v2.y) / 2
            ));
            let dir = new Vector(
                v2.x - v1.x,
                v2.y - v1.y
            );
            dir.normalize();

            this.chordDirs.push(dir);
            chordCount++;
        }
        for (let f of this.mesh2d.faces) {
            let chordIndices = [];

            for (let e of f.adjacentEdges()) {
                let h = e.halfedge;
                let i0 = h.vertex.index;
                let i1 = h.twin.vertex.index;
                if (i0 > i1) {
                    [i0, i1] = [i1, i0];
                }
                let key = `${i0}-${i1}`;
                let chordIndex = this.chordMap.get(key);
                if (chordIndex !== undefined)
                    chordIndices.push(chordIndex);
            }
            if (chordIndices.length === 2) {
                this.chordGraph.setEdge(chordIndices[0], chordIndices[1]);
                this.chordGraph.setEdge(chordIndices[1], chordIndices[0]);
            }
            if (chordIndices.length === 1)  this.chordCaps.push(chordIndices[0]);
            if (chordIndices.length === 3)  this.chordJunctions.push(chordIndices);
        }
        console.log(this.chordCaps.length, this.chordJunctions.length);
    }
    private generateCircle(c: Vector, d: Vector, r: number) {
        let z = new Vector(0, 0, 1);
        let n = Math.floor(r * 2 * Math.PI / this.isodistance);
        if (n % 2 === 1) n++;
        let points = [];
        for (let i = 0; i < n; i++) {
            let t = i / n;
            let x = d.times(Math.cos(t * 2 * Math.PI));
            let y = z.times(Math.sin(t * 2 * Math.PI));
            points.push(x.plus(y).times(r).plus(c));
        }
        return points;
    }
    private generateSlice(disc1: Vector[], disc2: Vector[]) {
        let n1 = disc1.length;
        let n2 = disc2.length;

        if (n1 === 0 || n2 === 0)
            return [];

        let offset = 0;
        let faces = [];
        let sameDir = true;

        if (n1 <= n2) {
            for (let i = 0; i < n2; ++i) {
                let d0 = disc2[offset].minus(disc1[0]).norm();
                let d1 = disc2[i].minus(disc1[0]).norm();
    
                if (d0 > d1)
                    offset = i;
            }
            let dir1 = disc1[1%n1].minus(disc1[0]);
            let dir2 = disc2[(offset+1)%n2].minus(disc2[offset]);
            sameDir = (dir1.dot(dir2) >= 0);
            for (let i = 0; i < n2; ++i) {
                faces.push([
                    n1+(offset+i)%n2,
                    n1+(offset+i+1)%n2,
                    Math.floor((i+1)*n1 / n2) % n1
                ]);
                if (Math.floor(i*n1/n2) !== Math.floor((i+1)*n1/n2) % n1) {
                    faces.push([
                        n1+(offset+i)%n2,
                        Math.floor(i*n1/n2),
                        Math.floor((i+1)*n1/n2) % n1
                    ]);
                }
            }
            if (!sameDir) {
                for (let f of faces) {

                }
            }
        } else {
            for (let i = 0; i < n1; ++i) {
                let d0 = disc1[offset].minus(disc2[0]).norm();
                let d1 = disc1[i].minus(disc2[0]).norm();
    
                if (d0 > d1)
                    offset = i;
            }
            let dir1 = disc2[1%n2].minus(disc2[0]);
            let dir2 = disc1[(offset+1)%n1].minus(disc1[offset]);
            sameDir = (dir1.dot(dir2) > 0);
            for (let i = 0; i < n1; ++i) {
                faces.push([
                    (offset+i)%n1,
                    (offset+i+1)%n1,
                    n1 + Math.floor((i+1)*n2 / n1)%n2
                ]);
                if (Math.floor(i*n2/n1) !== Math.floor((i+1)*n2/n1) % n2) {
                    faces.push([
                        (offset+i)%n1,
                        n1 + Math.floor(i*n2/n1) % n2,
                        n1 + Math.floor((i+1)*n2/n1) % n2
                    ]);
                }
            }
        }
        if (!sameDir) {
            for (let i = 0; i < faces.length; i++) {
                let newFace = [];
                for (let v of faces[i]) {
                    if (v < n1)
                        newFace.push((n1-v)%n1);
                    else
                        newFace.push(v)
                }
                faces[i] = newFace;
            }
        }
        return faces;
    }
    private generateCylinders() {
        let nC = this.chordGraph.nodes().length;
        let visited = new Array(nC).fill(false);

        this.chordOffset = new Array(nC).fill(0);
        this.chordBufSize = new Array(nC).fill(0);

        for (let i = 0; i < nC; ++i) {
            let c = this.chordAxis[i];
            let d = this.chordDirs[i];
            let r = this.chordLengths[i] / 2;

            let disc = this.generateCircle(c, d, r);
            this.chordBufSize[i] = disc.length;
            this.chordOffset[i] = this.allVertices.length;

            for (let v of disc)
                this.allVertices.push(v);
        }
        console.log("Number of generated discs: ", nC);

        for (let i = 0; i < nC; ++i) {
            if (this.chordGraph.outEdges(i).length > 1)
                continue;

            let branch: number[] = [];
            let branchDiscs: Vector[][] = [];
            let current = i;

            while (current && !visited[current]) {
                visited[current] = true;
                branch.push(current);
                let edges = this.chordGraph.outEdges(current);
                if (edges.length > 2)
                    break;
                let next = null;
                for (let e of edges) {
                    if (!visited[e.w]) {
                        next = e.w;
                        break;
                    }
                }
                current = next;
            }
            if (branch.length === 0)
                continue;

            for (let chordIdx of branch) {
                branchDiscs.push(this.allVertices.slice(
                    this.chordOffset[chordIdx],
                    this.chordOffset[chordIdx] + this.chordBufSize[chordIdx]
                ));
            }
            for (let i = 1; i < branchDiscs.length; ++i) {
                let slice = this.generateSlice(branchDiscs[i-1], branchDiscs[i]);
                let n1 = branchDiscs[i-1].length;
                let n2 = branchDiscs[i].length;

                for (let f of slice) {
                    let face = [];
                    for (let v of f) {
                        if (v < n1) face.push(v + this.chordOffset[branch[i-1]]);
                        else        face.push(v + this.chordOffset[branch[i]] - n1);
                    }
                    this.allFaces.push(face); 
                }
            }
        }
    }
    
    stitchCaps() {
        for (let i of this.chordCaps) {
            let c = this.chordAxis[i];
            let d = this.chordDirs[i];
            let r = this.chordLengths[i] / 2;

            let capOffset = [this.chordOffset[i]];
            let capDisc: Vector[][] = [
                this.allVertices.slice(
                    this.chordOffset[i],
                    this.chordOffset[i] + this.chordBufSize[i]
            )];

            while (r > 1.2 * this.isodistance) {
                r -= this.isodistance;
                let disc = this.generateCircle(c, d, r);
                
                capDisc.push(disc);
                capOffset.push(this.allVertices.length);

                for (let v of disc)
                    this.allVertices.push(v);
            }
            capDisc.push([c]);
            capOffset.push(this.allVertices.length);
            this.allVertices.push(c);
            
            for (let j = 1; j < capDisc.length; j++) {
                let n1 = capDisc[j-1].length;
                let n2 = capDisc[j].length;
                
                let slice = this.generateSlice(capDisc[j-1], capDisc[j]);

                for (let f of slice) {
                    let face = [];
                    for (let v of f) {
                        if (v < n1) face.push(v + capOffset[j-1]);
                        else        face.push(v - n1 + capOffset[j]);
                    }
                    this.allFaces.push(face);
                }
            }
        }
    }
    stitchJunctions() {
        for (let junction of this.chordJunctions) {
            const [c0, c1, c2] = junction;
            const [e0a, e0b] = [this.allVertices[this.chordOffset[c0]], this.allVertices[this.chordOffset[c0] + (this.chordBufSize[c0]/2)]];
            const [e1a, e1b] = [this.allVertices[this.chordOffset[c1]], this.allVertices[this.chordOffset[c1] + (this.chordBufSize[c1]/2)]];
            const [e2a, e2b] = [this.allVertices[this.chordOffset[c2]], this.allVertices[this.chordOffset[c2] + (this.chordBufSize[c2]/2)]];
            let allPoints = [e0a, e0b, e1a, e1b, e2a, e2b];
            let index2corner = new Array(6).fill(null);
            let corner2index: number[] = [];
            let corners = [e0a, e0b];

            if (e0a.minus(e1a).norm() < 1e-4 || e0b.minus(e1a).norm() < 1e-4) {
                corners.push(e1b);
            } else {
                corners.push(e1a);
            }
            for (let i = 0; i < 3; i++)
            for (let j = 0; j < 6; j++)
                if (corners[i].minus(allPoints[j]).norm() < 1e-4) {
                    index2corner[j] = i;
                    corner2index.push(j);
                }

            function verifyProjection() {
                if (Math.abs(e0a.z) > 1e-6 || Math.abs(e0b.z) > 1e-6 ||
                    Math.abs(e1a.z) > 1e-6 || Math.abs(e1b.z) > 1e-6 ||
                    Math.abs(e2a.z) > 1e-6 || Math.abs(e2b.z) > 1e-6
                ) {
                    return false;
                } else {
                    return true;
                }
            }
            function verifyTriangle() {
                return corner2index.length === 6;
            }
            if (!verifyProjection()) {
                console.warn("Junction has endpoints above the z=0 plane");
                continue;
            }
            if (!verifyTriangle()) {
                console.warn("Junction does not form a triangle");
                continue;
            }
            let points = geo2d.generateTriangleGrid(corners, this.isodistance).map(p => [p.x, p.y]);
            let offset = [points.length];
            let edges: [number, number][] = [];
            
            offset.push(offset[0] + this.chordBufSize[c0]/2-1);
            offset.push(offset[1] + this.chordBufSize[c1]/2-1);
            offset.push(offset[2] + this.chordBufSize[c2]/2-1);

            let chordPointIndices: number[][] = [];

            for (let c of junction) {
                let n = this.chordBufSize[c]/2 - 1; // interior points only
                let indices: number[] = [];
                
                for (let i = 0; i < n; i++) {
                    let v = this.allVertices[this.chordOffset[c] + i + 1];
                    indices.push(points.length);
                    points.push([v.x, v.y]);
                }
                chordPointIndices.push(indices);
            }
            points.push([corners[0].x, corners[0].y]);
            points.push([corners[1].x, corners[1].y]);
            points.push([corners[2].x, corners[2].y]);
            
            function findChordBetweenCorners(c1Idx: number, c2Idx: number): {chordIdx: number, reversed: boolean} | null {
                for (let k = 0; k < 3; k++) {
                    let ea = allPoints[k*2];
                    let eb = allPoints[k*2+1];
                    
                    let matchA1 = corners[c1Idx].minus(ea).norm() < 1e-4;
                    let matchA2 = corners[c2Idx].minus(ea).norm() < 1e-4;
                    let matchB1 = corners[c1Idx].minus(eb).norm() < 1e-4;
                    let matchB2 = corners[c2Idx].minus(eb).norm() < 1e-4;
                    
                    if (matchA1 && matchB2) return {chordIdx: k, reversed: false};
                    if (matchB1 && matchA2) return {chordIdx: k, reversed: true};
                }
                return null;
            }
            
            // Build edges in order around the boundary
            for (let i = 0; i < 3; i++) {
                let nextI = (i + 1) % 3;
                let result = findChordBetweenCorners(i, nextI);
                
                if (!result) {
                    console.warn("Could not find chord between corners", i, nextI);
                    continue;
                }
                
                let {chordIdx, reversed} = result;
                let chordPts = chordPointIndices[chordIdx];
                
                if (chordPts.length === 0) {
                    // No interior points, just connect corners directly
                    edges.push([offset[3]+i, offset[3]+nextI]);
                } else {
                    // Connect: corner[i] -> chord interior -> corner[nextI]
                    if (reversed) {
                        // Traverse chord points in reverse
                        edges.push([offset[3]+i, chordPts[chordPts.length - 1]]);
                        for (let j = chordPts.length - 1; j > 0; j--) {
                            edges.push([chordPts[j], chordPts[j - 1]]);
                        }
                        edges.push([chordPts[0], offset[3]+nextI]);
                    } else {
                        // Traverse chord points forward
                        edges.push([offset[3]+i, chordPts[0]]);
                        for (let j = 0; j < chordPts.length - 1; j++) {
                            edges.push([chordPts[j], chordPts[j + 1]]);
                        }
                        edges.push([chordPts[chordPts.length - 1], offset[3]+nextI]);
                    }
                }
            }
            
            // Check if overall boundary is CCW, flip all if not
            let centroid = {
                x: (corners[0].x + corners[1].x + corners[2].x) / 3,
                y: (corners[0].y + corners[1].y + corners[2].y) / 3
            };
            
            // Check first edge orientation
            if (edges.length > 0) {
                let [i0, i1] = edges[0];
                if (isClockwise([
                    {x: points[i0][0], y: points[i0][1]},
                    {x: points[i1][0], y: points[i1][1]},
                    centroid
                ])) {
                    edges = edges.map(([a, b]) => [b, a] as [number, number]).reverse();
                }
            }
            
            var faces = cdt2d(points, edges, {exterior: false});
            
            let dir0 = this.allVertices[this.chordOffset[c0] + 1].z > 0 ? 1 : -1;
            let dir1 = this.allVertices[this.chordOffset[c1] + 1].z > 0 ? 1 : -1;
            let dir2 = this.allVertices[this.chordOffset[c2] + 1].z > 0 ? 1 : -1;

            let size0 = this.chordBufSize[c0];
            let size1 = this.chordBufSize[c1];
            let size2 = this.chordBufSize[c2];

            for (let f of faces) {
                let facePos = [];
                let faceNeg = [];

                for (let v of f) {
                    if (v < offset[0]) {
                        facePos.push(this.allVertices.length + v*2);
                        faceNeg.push(this.allVertices.length + v*2 + 1);
                    } else if (v < offset[1]) {
                        facePos.push(this.chordOffset[c0] + (size0 + (v-offset[0]+1)*dir0)%size0);
                        faceNeg.push(this.chordOffset[c0] + (size0 - (v-offset[0]+1)*dir0)%size0);
                    } else if (v < offset[2]) {
                        facePos.push(this.chordOffset[c1] + (size1 + (v-offset[1]+1)*dir1)%size1);
                        faceNeg.push(this.chordOffset[c1] + (size1 - (v-offset[1]+1)*dir1)%size1);
                    } else if (v < offset[3]) {
                        facePos.push(this.chordOffset[c2] + (size2 + (v-offset[2]+1)*dir2)%size2);
                        faceNeg.push(this.chordOffset[c2] + (size2 - (v-offset[2]+1)*dir2)%size2);
                    } else {
                        let j = corner2index[(v-offset[3])*2];
                        let c = junction[Math.floor(j/2)];
                        let r = j%2;
                        facePos.push(this.chordOffset[c] + r * this.chordBufSize[c] / 2);
                        faceNeg.push(this.chordOffset[c] + r * this.chordBufSize[c] / 2);
                    }
                }
                this.allFaces.push(facePos);
                this.allFaces.push(faceNeg);
            }
            for (let i = 0; i < 3; i++) {
                let j0 = corner2index[i*2];
                let j1 = corner2index[i*2+1];

                let c0 = junction[Math.floor(j0/2)];
                let c1 = junction[Math.floor(j1/2)];

                let idx0 = this.chordOffset[c0] + (j0%2)*this.chordBufSize[c0]/2;

                let base = this.chordOffset[c1];
                let size = this.chordBufSize[c1];
                let offset = (j1%2)*size/2;

                this.allFaces.push([idx0, base+offset, base+(offset+1)%size]);
                this.allFaces.push([idx0, base+offset, base+(offset+size-1)%size]);
            }
            for (let i = 0; i < offset[0]; i++) {
                let p = points[i];
                this.allVertices.push(new Vector(p[0], p[1], 1));
                this.allVertices.push(new Vector(p[0], p[1], -1));
            }
        }
    }

    getChordAxis() {
        return this.chordAxis;
    }

    getChordDirs() {
        return this.chordDirs;
    }

    getChordLengths() {
        return this.chordLengths;
    }
    getMesh2D() {
        return this.mesh2d;
    }
    getMesh3D() {
        return this.mesh3d;
    }
    getPoints(): Point[] {
        return this.polygon;
    }
    getFaces(): number[][] {
        // Extract faces from the halfedge mesh
        const faces: number[][] = [];
        for (const f of this.mesh2d.faces) {
            const face: number[] = [];
            for (const v of f.adjacentVertices()) {
                face.push(v.index);
            }
            faces.push(face);
        }
        return faces;
    }
    
    // Get generated 3D mesh vertices
    getVertices3D(): Vector[] {
        return this.allVertices;
    }
    
    // Get generated 3D mesh faces
    getFaces3D(): number[][] {
        return this.allFaces;
    }
}

export { MeshGen };
export type { Point };