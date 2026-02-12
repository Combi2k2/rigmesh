import { MeshData } from '@/interface';
import { SkelData } from '@/interface';
import { buildLaplacianGeometry } from '@/utils/solver';

import * as LinearAlgebra from '@/lib/linalg/linear-algebra.js';
const DenseMatrix = LinearAlgebra.DenseMatrix;
const SparseMatrix = LinearAlgebra.SparseMatrix;
const Triplet = LinearAlgebra.Triplet;

export function computeSkinWeightsGlobal(mesh: MeshData, skel: SkelData): number[][] {
    let nV = mesh[0].length;
    let lap = buildLaplacianGeometry(mesh);

    let closest_dist = new Array(nV).fill(Infinity);
    let closest_bone = new Array(nV).fill(-1);
    let skin_weights = new Array(nV).fill(0).map(() => new Array(skel[1].length).fill(0));

    skel[1].forEach(([i0, i1], i) => {
        const v0 = skel[0][i0];
        const v1 = skel[0][i1];
        const bone = v1.minus(v0);

        mesh[0].forEach((v, j) => {
            const t = Math.max(0, Math.min(1, v.minus(v0).dot(bone) / bone.norm2()));
            const d = v.minus(v0.plus(bone.times(t))).norm();

            if (d < closest_dist[j]) {
                closest_dist[j] = d;
                closest_bone[j] = i;
            }
        });
    });
    let T = new Triplet(nV, nV);
    let b = DenseMatrix.zeros(nV, 1);

    for (let [w, i, j] of lap)  T.addEntry(w, i, j);
    for (let i = 0; i < nV; i++)    {
        let coeff = 100 / closest_dist[i]**2;
        T.addEntry(coeff, i, i);
    }
    let A = SparseMatrix.fromTriplet(T);
    let F = A.chol();

    skel[1].forEach((_, idx) => {
        for (let i = 0; i < nV; i++) {
            let coeff = 100 / closest_dist[i]**2;
            b.set(closest_bone[i] === idx ? coeff : 0, i);
        }
        let w = F.solvePositiveDefinite(b);
        for (let i = 0; i < nV; i++)
            skin_weights[i][idx] = w.get(i);
    });
    return skin_weights;
}