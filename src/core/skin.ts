const { Mesh } = require('@/lib/geometry/mesh');
import { Vec3 } from '@/interface';
import * as LinearAlgebra from '@/lib/linalg/linear-algebra.js';

let DenseMatrix = LinearAlgebra.DenseMatrix;
let SparseMatrix = LinearAlgebra.SparseMatrix;
let Triplet = LinearAlgebra.Triplet;

export type MeshData = [Vec3[], number[][]];
export type SkelData = [Vec3[], [number, number][]];

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
    let skin_weights = new Array(nV).fill([]);

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

    skel[1].forEach(([i0, i1], i) => {
        let fixed = new Array(nV).fill(true);
        let perm = new Array(nV).fill(0);
        let nFree = 0;

        for (let j = 0; j < nV; j++) if (closest_bone[j] !== i) {
            let [i2, i3] = skel[1][closest_bone[j]];

            if (i2 === i0 || i2 === i1)  continue;
            if (i3 === i0 || i3 === i1)  continue;

            fixed[j] = false;
            nFree++;
        }
        let indexFree = 0;
        let indexBound = nFree;

        for (let j = 0; j < nV; j++) {
            if (fixed[j])   perm[j] = indexBound++;
            else            perm[j] = indexFree++;
        }
        let T = new Triplet(nFree, nFree);
        let B = DenseMatrix.zeros(nFree, 1);

        for (let j = 0; j < nV; j++) if (!fixed[j]) {
            let sum = 0;

            for (let h of meshObj.vertices[j].adjacentHalfedges()) {
                let k = h.next.vertex.index;
                let w = (cotan(h) + cotan(h.twin))/2;

                if (fixed[k]) {
                    sum += (closest_bone[k] === i ? w : 0);
                } else {
                    T.addEntry(-w, perm[j], perm[k]);
                    T.addEntry(w, perm[j], perm[j]);
                }
            }
            B.set(sum, perm[j], 0);
        }
        let A = SparseMatrix.fromTriplet(T);
        let w = A.chol().solvePositiveDefinite(B);

        for (let j = 0; j < nV; j++) {
            if (fixed[j])   skin_weights[j].push(closest_bone[j] === i ? 1 : 0);
            else            skin_weights[j].push(w.get(perm[j], 0));
        }
    });
    return skin_weights;
}