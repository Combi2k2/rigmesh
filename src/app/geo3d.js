import * as LinearAlgebra from '@/lib/linalg/linear-algebra.js';
import Queue from './queue';
let Vector = LinearAlgebra.Vector;
let DenseMatrix = LinearAlgebra.DenseMatrix;
let SparseMatrix = LinearAlgebra.SparseMatrix;
let Triplet = LinearAlgebra.Triplet;

var Graph = require("graphlib").Graph;

export function runLaplacianSmooth(quantity, fixedIndices, connectivity, alpha) {
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
export function runFaceOrientation(vertices, faces) {
    let a = vertices[faces[0][0]];
    let b = vertices[faces[0][1]];
    let c = vertices[faces[0][2]];
    let raydir = b.minus(a).cross(c.minus(a)).unit();
    let origin = a.plus(raydir.times(1e-6));
    let inward = false;
    for (let i = 1; i < faces.length; i++) {
        let v0 = vertices[faces[i][0]];
        let v1 = vertices[faces[i][1]];
        let v2 = vertices[faces[i][2]];
        
        // Moller-Trumbore ray-triangle intersection
        let edge1 = v1.minus(v0);
        let edge2 = v2.minus(v0);
        let s = origin.minus(v0);
        let r_cross_e2 = raydir.cross(edge2);
        let s_cross_e1 = s.cross(edge1);

        let det = edge1.dot(r_cross_e2);
        if (Math.abs(det) < 1e-6)
            continue;

        let u = r_cross_e2.dot(s) / det;
        let v = s_cross_e1.dot(raydir) / det;
        let t = edge2.dot(s_cross_e1) / det;

        if (u < -1e-6)  continue;
        if (v < -1e-6)  continue;
        if (u + v > 1 + 1e-6)
            continue;

        if (t > 1e-6) {
            inward = !inward;
        }
    }
    if (inward) {
        faces[0] = faces[0].reverse();
        raydir = raydir.times(-1);
    }
    
    let edge2faces = new Map();

    for (let i = 0; i < faces.length; i++)
    for (let j = 0; j < faces[i].length; j++) {
        let x = faces[i][j];
        let y = faces[i][(j+1)%faces[i].length];
        if (x > y) [x, y] = [y, x];
        let key = `${x}-${y}`;
        if (!edge2faces.has(key))
            edge2faces.set(key, []);
        edge2faces.get(key).push(i);
    }
    let Q = new Queue();
    let visited = new Array(faces.length).fill(false);
    Q.push(0);
    visited[0] = true;

    while (!Q.empty()) {
        let i = Q.pop();

        for (let j = 0; j < faces[i].length; j++) {
            let x = faces[i][j];
            let y = faces[i][(j+1)%faces[i].length];
            let key = `${Math.min(x, y)}-${Math.max(x, y)}`;
            if (!edge2faces.has(key))
                continue;

            if (edge2faces.get(key).length !== 2) {
                console.error(`Invalid edge: ${key}`);
                continue;
            }
            for (let k of edge2faces.get(key)) {
                if (visited[k]) continue;
                let f = faces[k];
                let u = f[f.length-1];
                for (let v of f) {
                    if (u === x && v === y) {
                        faces[k] = f.reverse();
                        break;
                    }
                    if (u === y && v === x)
                        break;
                    u = v;
                }
                Q.push(k);
                visited[k] = true;
            }
        }
    }
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
            g.setNode(i, {pos: new Vector(
                vertices[i].x,
                vertices[i].y,
                vertices[i].z
            )});
        
        function addFace(a, b, c) {
            if (!g.hasNode(a) || !g.hasNode(b) || !g.hasNode(c)) {
                console.log("Trying to add face with non-existent vertices", a, b, c);
                return;
            }
            if (!g.hasEdge(a, b))   g.setEdge(a, b, {corners: new Set()});
            if (!g.hasEdge(b, c))   g.setEdge(b, c, {corners: new Set()});
            if (!g.hasEdge(c, a))   g.setEdge(c, a, {corners: new Set()});

            g.edge(a, b).corners.add(String(c));
            g.edge(b, c).corners.add(String(a));
            g.edge(c, a).corners.add(String(b));
        }
        function delFace(a, b, c) {
            if (!g.hasEdge(a, b) || !g.edge(a, b).corners.has(String(c)) ||
                !g.hasEdge(b, c) || !g.edge(b, c).corners.has(String(a)) ||
                !g.hasEdge(c, a) || !g.edge(c, a).corners.has(String(b))) {
                console.error(`Face ${a}-${b}-${c} is destroyed inproperly`);
                return;
            }
            g.edge(a, b).corners.delete(String(c));
            g.edge(b, c).corners.delete(String(a));
            g.edge(c, a).corners.delete(String(b));
        }
        function removeNode(u) {
            if (!g.hasNode(u)) {
                console.error(`Node ${u} was removed before`);
                return;
            }
            for (let e of g.outEdges(u))
            for (let c of g.edge(u, e.w).corners) {
                delFace(u, e.w, c);
                if (g.edge(e.w, c).corners.size === 0)
                    g.removeEdge(e.w, c);
            }
            g.removeNode(u);
        }
        function removeEdge(u, v) {
            if (g.hasEdge(u, v)) {
                for (let c of g.edge(u, v).corners)
                    delFace(u, v, c);
                g.removeEdge(u, v);
            }
        }
        for (let f of faces)
            addFace(f[0], f[1], f[2]);
    
        let L = 0;
        let Q = new Queue();

        for (let e of g.edges()) {
            L += g.node(e.v).pos.minus(g.node(e.w).pos).norm();
            Q.push([e.v, e.w]);
        }
        
        L /= g.edgeCount();

        let lowerBound = L*4/5;
        let upperBound = L*4/3;
        let vertIdx = g.nodes().length;

        while (Q.size() > 0) {
            let [u, v] = Q.pop();
            if (!g.hasEdge(u, v))
                continue;
            
            let p0 = g.node(u).pos;
            let p1 = g.node(v).pos;
            let d = p0.minus(p1).norm();
            if (d > upperBound) {
                let x = String(vertIdx++);
                g.setNode(x, {pos: p0.plus(p1).times(0.5)});
                let upperCorners = g.edge(u, v).corners;
                let lowerCorners = g.edge(v, u).corners;
                for (let c of upperCorners) {
                    addFace(u, x, c);
                    addFace(x, v, c);
                    Q.push([x, c]);
                }
                for (let c of lowerCorners) {
                    addFace(u, c, x);
                    addFace(x, c, v);
                    Q.push([x, c]);
                }
                Q.push([x, u]);
                Q.push([x, v]);
                removeEdge(u, v);
                removeEdge(v, u);
            }
        }
        for (let e of g.edges()) if (e.v < e.w)
            Q.push([e.v, e.w]);

        while (Q.size() > 0) {
            let [u, v] = Q.pop();
            if (!g.hasNode(u))  continue;
            if (!g.hasNode(v))  continue;

            let p0 = g.node(u).pos;
            let p1 = g.node(v).pos;
            let d = p0.minus(p1).norm();

            if (d < lowerBound) {
                for (let e of g.outEdges(v)) if (e.w != u)
                for (let c of g.edge(v, e.w).corners) if (c != u)
                    addFace(u, e.w, c);

                removeNode(v);
                g.setNode(u, {pos: p0.plus(p1).times(0.5)});

                for (let e of g.outEdges(u))
                    Q.push([u, e.w]);
            }
        }
        // // valence optimization
        let deg = new Map();
        Q.data = []
        Q.head = Q.tail = 0;

        for (let e of g.edges()) if (e.v < e.w) {
            Q.push([e.v, e.w]);
            deg.set(e.v, (deg.get(e.v) || 0) + 1);
            deg.set(e.w, (deg.get(e.w) || 0) + 1);
        }

        while (!Q.empty()) {
            let [u, v] = Q.pop();

            let upperCorners = g.hasEdge(u, v) ? g.edge(u, v).corners : new Set();
            let lowerCorners = g.hasEdge(v, u) ? g.edge(v, u).corners : new Set();

            if (upperCorners.size !== 1)    continue;
            if (lowerCorners.size !== 1)    continue;

            let x = upperCorners.values().next().value;
            let y = lowerCorners.values().next().value;

            let dev = (
                (deg.get(u) > 6 ? 1 : -1) +
                (deg.get(v) > 6 ? 1 : -1) +
                (deg.get(x) < 6 ? 1 : -1) +
                (deg.get(y) < 6 ? 1 : -1)
            );
            if (dev <= 0)
                continue;

            removeEdge(u, v);
            removeEdge(v, u);

            deg.set(u, deg.get(u) - 1);
            deg.set(v, deg.get(v) - 1);

            if (x === y)
                continue;

            addFace(u, y, x);
            addFace(v, x, y);

            let nodes = [u, v, x, y];
            for (let n of nodes)
            for (let e of g.outEdges(n))
                if (!nodes.includes(e.w))
                    Q.push([n, e.w]);
            
            deg.set(x, deg.get(x) + 1);
            deg.set(y, deg.get(y) + 1);
            
            Q.push([x, y]);
            Q.push([u, y]);
            Q.push([y, v]);
            Q.push([v, x]);
            Q.push([x, u]);
        }
        let idxMap = new Map();
        vertices.length = 0;
        faces.length = 0;

        for (let u of g.nodes()) {
            idxMap.set(u, vertices.length);
            let outDeg = 0;

            let p = g.node(u).pos;
            let C = new Vector(0, 0, 0);
            let N = new Vector(0, 0, 0);

            for (let e of g.outEdges(u))
            for (let c of g.edge(u, e.w).corners) {
                let a = g.node(c).pos;
                let b = g.node(e.w).pos;

                N.incrementBy(a.minus(p).cross(b.minus(p)));
                C.incrementBy(a);
                outDeg++;
            }
            if (outDeg > 0) {
                N.normalize();
                C.divideBy(outDeg);
                let v = C.minus(p);
                v = v.minus(N.times(v.dot(N)));
                p = p.plus(v);
            }
            vertices.push(p);
        }
        for (let u of g.nodes())
        for (let e of g.outEdges(u))
        for (let c of g.edge(u, e.w).corners)
            if (u < e.w && u < c)
                faces.push([
                    idxMap.get(u),
                    idxMap.get(e.w),
                    idxMap.get(c)
                ]);
    }
}
