// let LinearAlgebra = require('../lib/linalg/linear-algebra.js');
let Vector = require('@/lib/linalg/vector.js');
// let DenseMatrix = LinearAlgebra.DenseMatrix;
// let SparseMatrix = LinearAlgebra.SparseMatrix;
// let Triplet = LinearAlgebra.Triplet;

/**
 * @param {Vector[]} quantity 
 * @param {number[]} fixedIndices 
 * @param {Graph} connectivity 
 * @param {number} alpha 
 * @returns 
 */
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

// /**
//  * @param {Vector[]} vertices 
//  * @param {number[][]} faces 
//  * @param {number[]} constraints 
//  * @returns 
//  */
// export function runLSMesh(vertices, faces, constraints) {
//     let n = vertices.length;
//     let m = constraints.length;
//     let T = new Triplet(n, n);

//     let deg = new Array(n).fill(0);

//     for (let f of faces) {
//         deg[f[0]] += 2;
//         deg[f[1]] += 2;
//         deg[f[2]] += 2;
//     }
//     for (let i = 0; i < n; i++)
//         T.addEntry(1, i, i);

//     for (let f of faces) {
//         T.addEntry(-1/deg[f[0]], f[0], f[1]);
//         T.addEntry(-1/deg[f[0]], f[0], f[2]);
//         T.addEntry(-1/deg[f[1]], f[1], f[0]);
//         T.addEntry(-1/deg[f[1]], f[1], f[2]);
//         T.addEntry(-1/deg[f[2]], f[2], f[0]);
//         T.addEntry(-1/deg[f[2]], f[2], f[1]);
//     }
//     for (let i = 0; i < m; i++)
//         T.addEntry(1, n+i, constraints[i]);

//     let A = SparseMatrix.fromTriplet(T);
//     let b = DenseMatrix.zeros(n+m, 3);
    
//     for (let i = 0; i < m; i++) {
//         let j = constraints[i];
//         b.set(n+i, 0, vertices[j].x);
//         b.set(n+i, 1, vertices[j].y);
//         b.set(n+i, 2, vertices[j].z);
//     }
//     b = A.transpose().timesDense(b);
//     A = A.transpose().timesSparse(A);

//     let llt = A.chol();
//     let u = llt.solvePositiveDefinite(b);
//     for (let i = 0; i < n; i++) {
//         vertices[i].x = u.get(i, 0);
//         vertices[i].y = u.get(i, 1);
//         vertices[i].z = u.get(i, 2);
//     }
// }
