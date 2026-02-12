import * as LinearAlgebra from '@/lib/linalg/linear-algebra.js';
import { MeshData } from '@/interface';

var Graph = require("graphlib").Graph;
const DenseMatrix = LinearAlgebra.DenseMatrix;
const SparseMatrix = LinearAlgebra.SparseMatrix;
const Triplet = LinearAlgebra.Triplet;

export function buildLaplacianTopology(mesh: MeshData): [number, number, number][] {
    const [_, F] = mesh;
    const g = new Graph({ directed: false });
    const deg = new Map<number, number>();

    for (let f of F)
    for (let i = 0; i < f.length; i++) {
        let u = f[i];
        let v = f[(i+1)%f.length];
        g.setEdge(u, v);
        deg.set(u, (deg.get(u) || 0) + 1);
        deg.set(v, (deg.get(v) || 0) + 1);
    }
    let T = [];
    for (let x of g.nodes()) T.push([1, Number(x), Number(x)]);
    for (let e of g.edges()) {
        let u = Number(e.v);
        let v = Number(e.w);
        T.push([-2/deg.get(u), u, v]);
        T.push([-2/deg.get(v), v, u]);
    }
    return T;
}
export function buildLaplacianGeometry(mesh: MeshData): [number, number, number][] {
    const [V, F] = mesh;
    const g = new Graph();
    const T = [];

    function vector(x: number, y: number) {
        return V[y].minus(V[x]);
    }
    function cotan(x: number, y: number) {
        let z = g.edge(x, y);
        let u = vector(z, x);
        let v = vector(z, y);

        return u.dot(v) / u.cross(v).norm();
    }

    V.forEach((v, i) => g.setNode(i, v));
    F.forEach((f, _) => {
        g.setEdge(f[0], f[1], f[2]);
        g.setEdge(f[1], f[2], f[0]);
        g.setEdge(f[2], f[0], f[1]);
    });
    for (let e of g.edges()) if (g.hasEdge(e.w, e.v)) {
        let x = Number(e.v);
        let y = Number(e.w);
        let w = (cotan(x, y) + cotan(y, x))/2;

        T.push([-w, x, y]);
        T.push([w, x, x]);
    }
    return T;
}

export function smooth(lap: [number, number, number][],
    weak_constraints: [number, number][],
    hard_constraints: [number, number][],
    smoothness: number
): Map<number, number> {
    const value = new Map<number, number | null>();
    const fixed = new Map<number, boolean>();

    for (let [_, i, j] of lap)  {
        value.set(i, null); fixed.set(i, false);
        value.set(j, null); fixed.set(j, false);
    }
    for (let [i, v] of weak_constraints)    value.set(i, v);
    for (let [i, v] of hard_constraints)    value.set(i, v), fixed.set(i, true);

    let idxMap = new Map<number, number>();

    for (let [i, fix] of fixed) if (!fix)   idxMap.set(i, idxMap.size);
    for (let [i, fix] of fixed) if (fix)    idxMap.set(i, idxMap.size);

    let row = 0;
    let col = 0;

    for (let [i, fix] of fixed) if (!fix) {
        row++;
        col++;
        if (value.get(i) !== null)
            row++;
    }

    let T = new Triplet(row, col);
    let b = DenseMatrix.zeros(row, 1);

    for (let [w, i, j] of lap) {
        const fixI = fixed.get(i);
        const fixJ = fixed.get(j), v = value.get(j);
        const idxI = idxMap.get(i);
        const idxJ = idxMap.get(j);
        if (fixI)   continue;
        if (fixJ)   b.set(b.get(idxI) - smoothness * w * v, idxI);
        else        T.addEntry(w * smoothness, idxI, idxJ);
    }
    let weakRow = col;
    for (let [i, v] of value)   if (v !== null) {
        const fix = fixed.get(i);
        const idx = idxMap.get(i);
        if (!fix) {;
            T.addEntry(1, weakRow, idx);
            b.set(v, weakRow);
            weakRow++;
        }
    }

    let A = SparseMatrix.fromTriplet(T);

    b = A.transpose().timesDense(b);
    A = A.transpose().timesSparse(A);

    let llt = A.chol();
    let u = llt.solvePositiveDefinite(b);

    let result = new Map<number, number>();

    for (let [i, fix] of fixed) {
        if (fix)    result.set(i, value.get(i));
        else        result.set(i, u.get(idxMap.get(i)));
    }

    return result;
}
export function diffuse(lap: [number, number, number][],
    weak_constraints: [number, number][],
    hard_constraints: [number, number][],
    smoothness: number
): Map<number, number> {
    const g = new Graph();

    for (let [_, i, j] of lap)  g.setEdge(i, j);
    for (let x of g.nodes())    g.setNode(x, [null, false]);
    for (let [i, v] of weak_constraints)    g.setNode(i, [v, false]);
    for (let [i, v] of hard_constraints)    g.setNode(i, [v, true]);

    let idxMap = new Map<number, number>();
    let n = 0;
    
    for (let x of g.nodes())    if (!g.node(x)[1])  idxMap.set(Number(x), idxMap.size), n++;
    for (let x of g.nodes())    if (g.node(x)[1])   idxMap.set(Number(x), idxMap.size);

    let T = new Triplet(n, n);
    let b = DenseMatrix.zeros(n, 1);

    for (let [w, i, j] of lap) {
        const [_, fixI] = g.node(i);
        const [v, fixJ] = g.node(j);
        const idxI = idxMap.get(i);
        const idxJ = idxMap.get(j);

        if (fixI)   continue;
        if (fixJ)   b.set(b.get(idxI) - smoothness * w * v, idxI);
        else        T.addEntry(smoothness * w, idxI, idxJ);
    }
    for (let x of g.nodes()) {
        let [v, fix] = g.node(x);
        let idx = idxMap.get(Number(x));
        if (v === null || fix)
            continue;

        T.addEntry(1, idx, idx);
        b.set(b.get(idx) + v, idx);
    }
    let A = SparseMatrix.fromTriplet(T);

    b = A.transpose().timesDense(b);
    A = A.transpose().timesSparse(A);

    let llt = A.chol();
    let u = llt.solvePositiveDefinite(b);

    let result = new Map<number, number>();

    for (let x of g.nodes()) {
        let [v, fix] = g.node(x);
        if (fix)   result.set(Number(x), v);
        else       result.set(Number(x), u.get(idxMap.get(Number(x))));
    }
    return result;
}