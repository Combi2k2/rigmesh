const { Mesh } = require('@/lib/geometry/mesh');
import { MeshData } from '@/interface';
import { SkelData } from '@/interface';
import * as LinearAlgebra from '@/lib/linalg/linear-algebra.js';

const DenseMatrix = LinearAlgebra.DenseMatrix;
const SparseMatrix = LinearAlgebra.SparseMatrix;
const Triplet = LinearAlgebra.Triplet;

export function computeSkinWeightsGlobal(mesh: MeshData, skel: SkelData): number[][] {
    function vector(h) {
        let a = mesh[0][h.vertex];
        let b = mesh[0][h.next.vertex];

        return b.minus(a);
    }
    function cotan(h) {
        let u = vector(h.prev);
        let v = vector(h.next).negated();

        return u.dot(v) / u.cross(v).norm();
    }
    let nV = mesh[0].length;
    let meshObj = new Mesh();
    meshObj.build({
        v: mesh[0],
        f: mesh[1].flat()
    });

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

    skel[1].forEach(([i0, i1], idx) => {
        let T = new Triplet(nV, nV);
        let B = DenseMatrix.zeros(nV, 1);

        for (let j = 0; j < nV; j++) {
            let coeff = 100 / closest_dist[j]**2;
            T.addEntry(coeff, j, j);
            B.set(closest_bone[j] === idx ? coeff : 0, j, 0);

            for (let h of meshObj.vertices[j].adjacentHalfedges()) {
                let k = h.next.vertex.index;
                let w = (cotan(h) + cotan(h.twin))/2;

                T.addEntry(-w, j, k);
                T.addEntry(w, j, j);
            }
        }
        let A = SparseMatrix.fromTriplet(T);
        let w = A.chol().solvePositiveDefinite(B);

        for (let j = 0; j < nV; j++)
            skin_weights[j][idx] = w.get(j, 0);
    });
    return skin_weights;
}