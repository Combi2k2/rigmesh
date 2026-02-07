import * as LinearAlgebra from '@/lib/linalg/linear-algebra.js';
import Queue from './misc';
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
export function runLeastSquaresMesh(vertices, faces, constraints, factor = 1) {
    let n = vertices.length;
    let m = constraints.length;
    let T = new Triplet(n+m, n);

    let deg = new Array(n).fill(0);

    for (let f of faces)
    for (let v of f)
        deg[v] += 2;

    for (let i = 0; i < n; i++)
        T.addEntry(factor, i, i);

    for (let f of faces)
    for (let i = 0; i < f.length; i++) {
        let u = f[i];
        let v = f[(i+1)%f.length];

        T.addEntry(-factor/deg[u], u, v);
        T.addEntry(-factor/deg[v], v, u);
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
export function runIsometricRemesh(vertices, faces, iterations = 6, length = -1) {
    for (let t = 0; t < iterations; t++) {
        let g = new Graph();

        for (let i = 0; i < vertices.length; i++)
            g.setNode(i, vertices[i]);
        
        function setFace(a, b, c) {
            g.setEdge(a, b, String(c));
            g.setEdge(b, c, String(a));
            g.setEdge(c, a, String(b));
        }
        for (let f of faces)
            setFace(f[0], f[1], f[2]);
    
        let L = 0;
        let Q = new Queue();

        for (let e of g.edges()) {
            L += length < 0 ? g.node(e.v).minus(g.node(e.w)).norm() : length;
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
            
            let p0 = g.node(u);
            let p1 = g.node(v);
            let d = p0.minus(p1).norm();
            if (d > upperBound) {
                let x = String(vertIdx++);
                let y = g.edge(u, v);
                let z = g.edge(v, u);

                setFace(u, x, y);
                setFace(x, v, y);
                setFace(u, z, x);
                setFace(x, z, v);

                g.setNode(x, p0.plus(p1).times(0.5));
                g.removeEdge(u, v);
                g.removeEdge(v, u);

                Q.push([x, u]);
                Q.push([x, v]);
                Q.push([x, y]);
                Q.push([x, z]);
            }
        }
        for (let e of g.edges()) if (e.v < e.w)
            Q.push([e.v, e.w]);

        while (Q.size() > 0) {
            let [u, v] = Q.pop();
            if (!g.hasNode(u))  continue;
            if (!g.hasNode(v))  continue;
            if (!g.hasEdge(u, v))   continue;

            let p0 = g.node(u);
            let p1 = g.node(v);
            let d = p0.minus(p1).norm();

            if (d < lowerBound) {
                let commonNeighborCount = 0;
                let canCollapse = true;

                for (let e of g.outEdges(u))
                    if (g.hasEdge(v, e.w))
                        commonNeighborCount++;
                
                if (commonNeighborCount > 2)
                    continue;
                
                for (let e of g.outEdges(v)) {
                    let x = e.w;
                    let y = g.edge(x, v);
                    if (x === u)    continue;
                    if (y === u)    continue;

                    setFace(x, u, y);
                }
                g.removeNode(v);
                g.setNode(u, p0.plus(p1).times(0.5));

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
            if (!g.hasEdge(u, v))
                continue;

            let x = g.edge(u, v);
            let y = g.edge(v, u);
            let dev = (
                (deg.get(u) > 6 ? 1 : -1) +
                (deg.get(v) > 6 ? 1 : -1) +
                (deg.get(x) < 6 ? 1 : -1) +
                (deg.get(y) < 6 ? 1 : -1)
            );
            if (dev <= 0)
                continue;

            g.removeEdge(u, v);
            g.removeEdge(v, u);

            deg.set(u, deg.get(u) - 1);
            deg.set(v, deg.get(v) - 1);
            deg.set(x, deg.get(x) + 1);
            deg.set(y, deg.get(y) + 1);

            setFace(u, y, x);
            setFace(v, x, y);

            let nodes = [u, v, x, y];
            for (let n of nodes)
            for (let e of g.outEdges(n))
                if (!nodes.includes(e.w))
                    Q.push([n, e.w]);
            
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

            let p = g.node(u);
            let C = new Vector(0, 0, 0);
            let N = new Vector(0, 0, 0);

            for (let e of g.outEdges(u)) {
                let a = g.node(e.w);
                let b = g.node(g.edge(u, e.w));

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
        for (let e of g.outEdges(u)) {
            let v = e.w;
            let w = g.edge(u, v);
            if (u < v && u < w)
                faces.push([
                    idxMap.get(u),
                    idxMap.get(v),
                    idxMap.get(w)
                ]);
        }
    }
}
