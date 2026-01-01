import * as LinearAlgebra from '@/lib/linalg/linear-algebra.js';
let Vector = LinearAlgebra.Vector;
let DenseMatrix = LinearAlgebra.DenseMatrix;
let SparseMatrix = LinearAlgebra.SparseMatrix;
let Triplet = LinearAlgebra.Triplet;

var PriorityQueue = require('priorityqueuejs');
var Graph = require("graphlib").Graph;

export function LaplacianSmooth(quantity, fixedIndices, connectivity, alpha) {
    let n = quantity.length;
    let lap = new Array(n).fill(new Vector(0, 0, 0));
    let fix = new Array(n).fill(false);

    for (let i of fixedIndices)
        fix[i] = true;

    for (let i = 0; i < n; i++) if (!fix[i]) {
        let edges = connectivity.outEdges(i);
        if (edges.length < 2)
            continue;
        
        for (let e of edges) {
            lap[i] = lap[i].plus(quantity[e.w]);
            lap[i] = lap[i].minus(quantity[i]);
        }
        lap[i].divideBy(edges.length);
    }
    for (let i = 0; i < n; i++)
        quantity[i].incrementBy(lap[i].times(alpha));
}

export function runLeastSquaresMesh(vertices, faces, constraints) {
    let n = vertices.length;
    let m = constraints.length;
    let T = new Triplet(n+m, n);

    let deg = new Array(n).fill(0);

    for (let f of faces)
    for (let v of f)
        deg[v] += 2;

    for (let i = 0; i < n; i++)
        T.addEntry(1, i, i);

    for (let f of faces)
    for (let i = 0; i < f.length; i++) {
        let u = f[i];
        let v = f[(i+1)%f.length];

        T.addEntry(-1/deg[u], u, v);
        T.addEntry(-1/deg[v], v, u);
    }
    for (let i = 0; i < m; i++)
        T.addEntry(1, n+i, constraints[i]);

    let A = SparseMatrix.fromTriplet(T);
    let b = DenseMatrix.zeros(n+m, 3);
    
    for (let i = 0; i < m; i++) {
        let j = constraints[i];
        b.set(vertices[j].x, n+i, 0);
        b.set(vertices[j].y, n+i, 1);
        b.set(vertices[j].z, n+i, 2);
    }
    b = A.transpose().timesDense(b);
    A = A.transpose().timesSparse(A);

    console.log("A:", A.toDense());
    console.log("b:", b);

    let llt = A.chol();
    let u = llt.solvePositiveDefinite(b);
    for (let i = 0; i < n; i++) {
        vertices[i].x = u.get(i, 0);
        vertices[i].y = u.get(i, 1);
        vertices[i].z = u.get(i, 2);
    }
}
export function runIsometricRemesh(vertices, faces, iterations = 6) {
    for (let t = 0; t < iterations; t++) {
        let g = new Graph();
        for (let i = 0; i < vertices.length; i++)
            g.setNode(i, vertices[i]);

        let cornerMap = new Map();

        function setFace(a, b, c) {
            if (!g.hasEdge(a, b))   g.setEdge(a, b);
            if (!g.hasEdge(b, c))   g.setEdge(b, c);
            if (!g.hasEdge(c, a))   g.setEdge(c, a);
            cornerMap.set(`${a}-${b}`, c);
            cornerMap.set(`${b}-${c}`, a);
            cornerMap.set(`${c}-${a}`, b);
        }

        for (let f of faces)
            setFace(f[0], f[1], f[2]);

        let L = 0;
        let edges = g.edges();

        for (let e of edges)
            L += g.node(e.v).minus(g.node(e.w)).norm();

        L /= edges.length;

        let lowerBound = L*4/5;
        let upperBound = L*4/3;

        let vertIdx = g.nodes().length;

        // Split edges that are too long
        for (let e of edges) if (e.v < e.w) {
            let v0 = g.node(e.v);
            let v1 = g.node(e.w);
            let d = v0.minus(v1).norm();
            if (d > upperBound) {
                let x = vertIdx++;
                let y = cornerMap.get(`${e.v}-${e.w}`);
                let z = cornerMap.get(`${e.w}-${e.v}`);

                g.setNode(x, v0.plus(v1).times(0.5));
                g.removeEdge(e.v, e.w); cornerMap.delete(`${e.v}-${e.w}`);
                g.removeEdge(e.w, e.v); cornerMap.delete(`${e.w}-${e.v}`);

                setFace(e.v, x, y);
                setFace(e.v, z, x);
                setFace(e.w, y, x);
                setFace(e.w, x, z);
            }
        }

        // Collapse edges that are too short
        edges = g.edges();
        for (let e of edges) if (e.v < e.w) {
            let v0 = g.node(e.v);
            let v1 = g.node(e.w);
            let d = v0.minus(v1).norm();
            if (d < lowerBound) {
                let x = vertIdx++;

                g.setNode(x, v0.plus(v1).times(0.5));

                for (let e0 of g.outEdges(e.v)) if (e0.w !== e.w && cornerMap.get(`${a}-${e.v}`) !== e.w) {
                    let a = e0.w;
                    let b = cornerMap.get(`${a}-${e.v}`);

                    cornerMap.delete(`${a}-${e.v}`);
                    cornerMap.delete(`${e.v}-${b}`);

                    addFace(a, x, b);
                }
                for (let e1 of g.outEdges(e.w)) if (e1.w !== e.v && cornerMap.get(`${e.w}-${a}`) !== e.v) {
                    let a = e1.w;
                    let b = cornerMap.get(`${e.w}-${a}`);

                    cornerMap.delete(`${e.w}-${a}`);
                    cornerMap.delete(`${b}-${e.w}`);

                    addFace(x, a, b);
                }
                g.removeNode(e.v);
                g.removeNode(e.w);
            }
        }

        // valence optimization
        let deg = new Map();
        let pq = new PriorityQueue(function(a, b) {
            return a.deviation - b.deviation;
        });
        for (let e of g.edges()) {
            deg.set(e.v, (deg.get(e.v) || 0) + 1);
            deg.set(e.w, (deg.get(e.w) || 0) + 1);
        }
        function degreeDeviation(x, y) {
            let a0 = deg.get(x);
            let a1 = deg.get(y);
            let b0 = deg.get(cornerMap.get(`${x}-${y}`));
            let b1 = deg.get(cornerMap.get(`${y}-${x}`));

            let deviation = 0;
            deviation += a0>6?1:-1;
            deviation += a1>6?1:-1;
            deviation += b0<6?1:-1;
            deviation += b1<6?1:-1;

            return deviation;
        }
        for (let e of g.edges()) if (e.v < e.w) {
            let dev = degreeDeviation(e.v, e.w);
            if (dev > 0)
                pq.enq({ u: e.v, v: e.w, deviation: dev });
        }
        while (pq.size() > 0) {
            let { u, v, deviation } = pq.deq();
            let x = cornerMap.get(`${u}-${v}`);
            let y = cornerMap.get(`${v}-${u}`);
            let dev = degreeDeviation(u, v);
            if (dev != deviation)
                continue;

            cornerMap.delete(`${u}-${v}`);
            cornerMap.delete(`${v}-${u}`);
            g.removeEdge(u, v);
            g.removeEdge(v, u);

            deg[u]--;
            deg[v]--;
            deg[x]++;
            deg[y]++;

            addFace(x, u, y);
            addFace(y, v, x);

            let nodes = [u, v, x, y];

            for (let x of nodes)
            for (let e of g.outEdges(x)) {
                let a = e.w;
                let b = cornerMap.get(`${x}-${a}`);

                let dev0 = degreeDeviation(x, a);
                let dev1 = degreeDeviation(a, b);

                if (dev0 > 0)   pq.enq({ u: x, v: a, deviation: dev0 });
                if (dev1 > 0)   pq.enq({ u: a, v: b, deviation: dev1 });
            }
        }
        let idxMap = new Map();
        let normals = [];
        let centroids = [];

        for (let u of g.nodes()) {
            idxMap.set(u, normals.length);
            let edges = g.outEdges(u);
            let normal = new Vector(0, 0, 0);
            let centroid = new Vector(0, 0, 0);
            let p = g.node(u);

            for (let e of edges) {
                let a = g.node(e.w);
                let b = g.node(cornerMap.get(`${u}-${e.w}`));
                let tmp = a.minus(p).cross(b.minus(p));
                tmp.normalize();
                normal.incrementBy(tmp);
                centroid.incrementBy(a);
            }
            normal.normalize();
            centroid.divideBy(edges.length);

            normals.push(normal);
            centroids.push(centroid);
        }
        vertices = new Array(normals.length);
        faces = [];

        for (let u of g.nodes()) {
            let idx = idxMap.get(u);
            let p = g.node(u);
            let c = centroids[idx];
            let n = normals[idx];

            let v = p.minus(c);
            v = n.times(v.dot(n));
            v = v.plus(c);

            vertices[idx] = v;

            for (let e of g.outEdges(u)) {
                let v = e.w;
                let w = cornerMap.get(`${u}-${v}`);

                if (w) {
                    faces.push([idx, idxMap.get(v), idxMap.get(w)]);

                    cornerMap.delete(`${u}-${v}`);
                    cornerMap.delete(`${v}-${w}`);
                    cornerMap.delete(`${w}-${v}`);
                }
            }
        }
    }
    return { vertices, faces };
}
