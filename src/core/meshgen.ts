import * as geo2d from '../utils/geo2d';
import * as geo3d from '../utils/geo3d';
import Queue from '../utils/queue';
import Vector from '@/lib/linalg/vector';
import { Point, Vec2 } from '../interface/point';

const { Mesh } = require('@/lib/geometry/mesh');

// @ts-ignore - CommonJS module
var Graph = require("graphlib").Graph;
var cdt2d = require('cdt2d');

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
        length += points[i].minus(points[j]).norm();
    }
    let nSegments = Math.floor(length / isodistance);
    let newPath = [];

    isodistance = length / nSegments;

    let currentDistance = 0;
    let currentPtr = 0;

    for (let i = 0; i < nSegments; i++) {
        while (currentDistance < isodistance && currentPtr < points.length - 1) {
            currentDistance += points[currentPtr].minus(points[currentPtr + 1]).norm();
            currentPtr++;
        }
        currentDistance -= isodistance;

        let index = Math.max(1, Math.min(points.length - 1, currentPtr));
        let a = points[index - 1];
        let b = points[index];
        let t = Math.max(0, currentDistance) / a.minus(b).norm();
        
        newPath.push(new Vec2(
            t * a.x + (1-t) * b.x,
            t * a.y + (1-t) * b.y
        ));
    }
    return newPath;
}

class MeshGen {
    private chordAxis: Vector[] = [];
    private chordDirs: Vector[] = [];
    private chordLengths: number[] = [];
    private chordGraph: any;
    private chordMap: Map<string, number> = new Map();
    private chordCaps: number[][] = [];
    private chordJunctions: number[][] = [];
    private chordOffset: number[] = [];
    private chordBufSize: number[] = [];

    private allVertices: Vector[] = [];
    private allFaces: number[][] = [];

    private triangulation: any;

    constructor(private polygon: Point[], private isodistance: number, private branchMinLength: number = 5) {
        this.buildTriangulation();
        this.pruneTriangulation();
    }
    private buildTriangulation() {
        if (geo2d.ccw(this.polygon[0], this.polygon[1], this.polygon[2]))
            this.polygon = this.polygon.reverse();

        let centroid = this.polygon.reduce((acc, p) => acc.plus(p), new Vec2(0, 0));
        centroid.x /= this.polygon.length;
        centroid.y /= this.polygon.length;
        
        this.polygon = this.polygon.map(p => p.minus(centroid));
        this.polygon = reparameterize(this.polygon, 2*this.isodistance);
        this.triangulation = new (Mesh as any)();
        this.triangulation.build({
            v: this.polygon.map(p => new Vector(p.x, p.y, 0)),
            f: geo2d.CDT(this.polygon).flat()
        });
    }
    private pruneTriangulation() {
        let nF = this.triangulation.faces.length;
        let toLeaf = new Array(nF).fill(0);
        let toPrune = new Array(nF).fill(false);
        let visited = new Array(nF).fill(false);
        let queue = new Queue();
        let barycenter = new Array(nF).fill({x: 0, y: 0});

        for (let i = 0; i < nF; i++) {
            let f = this.triangulation.faces[i];

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
            let f = this.triangulation.faces[i];
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
                        toLeaf[ic] + barycenter[i].minus(barycenter[ic]).norm()
                    );
                }
            }
            
            if (adjFaces.length > 2) {
                let pruned = false;
                for (let fc of adjFaces) {
                    let ic = fc.index;
                    if (visited[ic]) {
                        if (toLeaf[ic] < this.branchMinLength) {
                            toPrune[ic] = true;
                            let st = [[ic, i]];
                            while (st.length > 0) {
                                let [u, p] = st.pop() as [number, number];

                                for (let h of this.triangulation.faces[u].adjacentHalfedges()) {
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
                for (let v of this.triangulation.faces[i].adjacentVertices())
                    newFaces.push(v.index);
            }
        this.triangulation.build({
            v: this.polygon.map(p => new Vector(p.x, p.y, 0)),
            f: newFaces
        });
    }
    private buildChordGraph() {
        let chordCount = 0;
        this.chordGraph = new Graph();
        this.chordDirs = [];
        this.chordAxis = [];
        this.chordLengths = [];
        this.chordCaps = [];
        this.chordJunctions = [];
        this.chordOffset = [];
        this.chordBufSize = [];
        
        for (let e of this.triangulation.edges) {
            if (e.onBoundary())
                continue;
            
            this.chordGraph.setNode(chordCount);
            let h = e.halfedge;
            let i0 = h.vertex.index;
            let i1 = h.twin.vertex.index;

            let key = `${Math.min(i0, i1)}-${Math.max(i0, i1)}`;
            this.chordMap.set(key, chordCount);

            let v1 = this.polygon[i0];
            let v2 = this.polygon[i1];

            this.chordLengths.push(v1.minus(v2).norm());
            this.chordAxis.push(new Vector(
                (v1.x + v2.x) / 2,
                (v1.y + v2.y) / 2
            ));
            this.chordDirs.push((new Vector(
                v2.x - v1.x,
                v2.y - v1.y
            )).unit());
            chordCount++;
        }
        for (let f of this.triangulation.faces) {
            let chordIndices = [];
            let chordCorner = null;

            for (let e of f.adjacentEdges()) {
                let h = e.halfedge;
                let i0 = h.vertex.index;
                let i1 = h.next.vertex.index;
                let i2 = h.next.next.vertex.index;
                if (i0 > i1) {
                    [i0, i1] = [i1, i0];
                }
                let key = `${i0}-${i1}`;
                let chordIndex = this.chordMap.get(key);
                if (chordIndex !== undefined) {
                    chordIndices.push(chordIndex);
                    chordCorner = i2;
                }
            }
            if (chordIndices.length === 2) {
                this.chordGraph.setEdge(chordIndices[0], chordIndices[1]);
                this.chordGraph.setEdge(chordIndices[1], chordIndices[0]);
            }
            if (chordIndices.length === 1)  this.chordCaps.push([chordIndices[0], chordCorner]);
            if (chordIndices.length === 3)  this.chordJunctions.push(chordIndices);
        }
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
    generateSkeleton(boneDeviationThreshold: number, boneLengthThreshold: number, algo: 'chord' | 'mat') {
        let g = new Graph();
        let Q = new Queue();

        if (algo === 'chord') {
            let vertIdx = this.chordAxis.length;
            for (let i = 0; i < this.chordAxis.length; i++)
                g.setNode(i, this.chordAxis[i]);

            for (let e of this.chordGraph.edges())
                g.setEdge(e.v, e.w, true);

            for (let [c0, c1, c2] of this.chordJunctions) {
                let p0 = g.node(c0);
                let p1 = g.node(c1);
                let p2 = g.node(c2);
                let barycenter = p0.plus(p1).plus(p2).times(1/3);
                g.setNode(vertIdx, barycenter);
                g.setEdge(c0, vertIdx); g.setEdge(vertIdx, c0);
                g.setEdge(c1, vertIdx); g.setEdge(vertIdx, c1);
                g.setEdge(c2, vertIdx); g.setEdge(vertIdx, c2);

                vertIdx++;
            }
        } else {
        }
        for (let u of g.nodes())
            Q.push(u);

        while (Q.size() > 0) {
            let i = Q.pop();
            let p = g.node(i);
        
            let neighbors = g.outEdges(i).map(e => e.w);
            if (neighbors.length !== 2)
                continue;
        
            let n0 = parseInt(neighbors[0]);
            let n1 = parseInt(neighbors[1]);
        
            let p0 = g.node(n0);
            let p1 = g.node(n1);
        
            let axisDir = p1.minus(p0).unit();
            let baseDir = axisDir.cross(new Vector(0, 0, 1)).unit();
        
            let a1 = p0.plus(baseDir.times(this.chordLengths[n0]/2));
            let b1 = p1.plus(baseDir.times(this.chordLengths[n1]/2));
            let a2 = p0.minus(baseDir.times(this.chordLengths[n0]/2));
            let b2 = p1.minus(baseDir.times(this.chordLengths[n1]/2));
        
            let chordDir = this.chordDirs[i];
            if (chordDir.dot(baseDir) < 0)
                chordDir = chordDir.times(-1);
        
            let c1 = p.plus(chordDir.times(this.chordLengths[i]/2));
            let c2 = p.minus(chordDir.times(this.chordLengths[i]/2));
        
            let side1 = a1.minus(b1).unit();
            let side2 = a2.minus(b2).unit();
        
            let v0 = p.minus(p0);
            let v1 = c1.minus(b1);
            let v2 = c2.minus(b2);
        
            v0 = v0.minus(axisDir.times(v0.dot(axisDir)));
            v1 = v1.minus(side1.times(v1.dot(side1)));
            v2 = v2.minus(side2.times(v2.dot(side2)));
        
            let dev = 0.5 * v0.norm() + 0.25 * (v1.norm() + v2.norm());
            if (dev < boneDeviationThreshold) {
                g.setEdge(n0, n1, true);
                g.setEdge(n1, n0, true);
                g.removeNode(i);
            }
        }
        for (let u of g.nodes())    if (g.outEdges(u).length === 1) {
            let p = null;
            let v = u;

            while (true) {
                let neighbors = g.outEdges(v).map(e => e.w);
                if (neighbors.length !== 2 && p !== null)
                    break;
                
                for (let x of neighbors) if (x !== p) {
                    g.setEdge(v, x, false);
                    g.setEdge(x, v, false);
                    p = v;
                    v = x;
                    break;
                }
            }
        }
        for (let e of g.edges())    if (e.v < e.w)
            Q.push([e.v, e.w]);

        while (Q.size() > 0) {
            let [u, v] = Q.pop();
            if (!g.edge(u, v))
                continue;
    
            let p0 = g.node(u);
            let p1 = g.node(v);
            let dist = p1.minus(p0).norm();
            if (dist < boneLengthThreshold) {
                for (let e of g.outEdges(v))
                    if (e.w !== u) {
                        let tmp = g.edge(v, e.w);
                        g.setEdge(u, e.w, tmp);
                        g.setEdge(e.w, u, tmp);
                    }
                g.setNode(u, p0.plus(p1).times(0.5));
                g.removeNode(v);

                for (let e of g.outEdges(u))
                    Q.push([u, e.w]);
            }
        }
        let idxMap = new Map();
        let joints = [];
        let bones = [];

        for (let u of g.nodes()) {
            idxMap.set(u, joints.length);
            joints.push(g.node(u));
        }
        for (let e of g.edges()) if (e.v < e.w) {
            bones.push([
                idxMap.get(e.v),
                idxMap.get(e.w)
            ]);
        }
        return [joints, bones];
    }
    generatePipes() {
        let nC = this.chordGraph.nodeCount();
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
        for (let [i, o] of this.chordCaps) {
            let d = this.chordDirs[i];
            let ci = this.chordAxis[i];
            let ri = this.chordLengths[i] / 2;
            let co = new Vector(
                this.polygon[o].x,
                this.polygon[o].y,
                0
            );
            let h = co.minus(ci).norm();

            let capOffset = [this.chordOffset[i]];
            let capDisc: Vector[][] = [
                this.allVertices.slice(
                    this.chordOffset[i],
                    this.chordOffset[i] + this.chordBufSize[i]
            )];

            let r = ri;

            while (r > 1.2 * this.isodistance) {
                r -= this.isodistance;
                let disc = this.generateCircle(co.plus(ci.minus(co).times(r/ri)), d, r);
                
                capDisc.push(disc);
                capOffset.push(this.allVertices.length);
                this.chordOffset.push(this.allVertices.length);
                this.chordBufSize.push(disc.length);

                for (let v of disc)
                    this.allVertices.push(v);
            }
            capDisc.push([co]);
            capOffset.push(this.allVertices.length);
            this.allVertices.push(co);
            this.chordOffset.push(this.allVertices.length);
            this.chordBufSize.push(1);
            
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
    runChordSmoothing(iterations: number = 50, alpha: number = 0.5) {
        this.buildChordGraph();
        let nC = this.chordGraph.nodeCount();
        for (let i = 0; i < nC; i++) {
            let dir = this.chordDirs[i];
            this.chordDirs[i] = new Vector(
                dir.x * dir.x - dir.y * dir.y,
                2 * dir.x * dir.y
            );
            this.chordDirs[i].normalize();
        }
        for (let _ = 0; _ < iterations; _++) {
            geo3d.runLaplacianSmooth(this.chordDirs, [], this.chordGraph, alpha);
            geo3d.runLaplacianSmooth(this.chordAxis, [], this.chordGraph, alpha);
            
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
    }
    runMeshSmoothing(V: Vector[], F: number[][], factor: number = 0.1) {
        let nC = this.chordGraph.nodeCount();
        let constraints = [];
        for (let i = 0; i < nC; i++)
        for (let j = 0; j < this.chordBufSize[i]; j++)
            constraints.push(this.chordOffset[i] + j);

        geo3d.runLeastSquaresMesh(V, F, constraints, factor);
        geo3d.runFaceOrientation(V, F);
    }
    getChords() {
        return [this.chordAxis.slice(), this.chordDirs.slice(), this.chordLengths.slice()];
    }
    getMesh2D() {
        const faces: number[][] = [];
        for (const f of this.triangulation.faces) {
            const face: number[] = [];
            for (const v of f.adjacentVertices()) {
                face.push(v.index);
            }
            faces.push(face);
        }
        return [this.polygon.slice(), faces];
    }
    getMesh3D() {
        return [this.allVertices.slice(), this.allFaces.slice()];
    }
    vertCount() {
        return this.allVertices.length;
    }
    faceCount() {
        return this.allFaces.length;
    }
}

export { MeshGen };