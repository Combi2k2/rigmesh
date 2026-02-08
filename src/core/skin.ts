import { MeshData } from '@/interface';
import { SkelData } from '@/interface';
import { buildLaplacianGeometry, diffuse } from '@/utils/solver';

export function computeSkinWeightsGlobal(mesh: MeshData, skel: SkelData): number[][] {
    let nV = mesh[0].length;
    let lap = buildLaplacianGeometry(mesh);
    let smoothness = -Math.log(5);

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
        let weak: [number, number][] = [];
        for (let j = 0; j < nV; j++)
            weak.push([j, closest_bone[j] === idx ? 1 : 0]);

        let result = diffuse(lap, weak, [], smoothness);

        for (let j = 0; j < nV; j++)
            skin_weights[j][idx] = result.get(j);
    });
    return skin_weights;
}