/**
 * Stitch two ordered closed rings into a triangle strip.
 *
 * Works for arbitrary loops (not just procedural circles).
 * Returns faces as index triples where indices [0..n1-1] refer to ring1
 * and [n1..n1+n2-1] refer to ring2.
 *
 * Algorithm:
 *   1. Normalize winding so both rings traverse in the same rotational direction
 *   2. Find best seam alignment by sampling offsets on ring2
 *   3. Greedy two-pointer advance: at each step pick the shorter diagonal
 *   4. Orient faces outward (away from combined centroid)
 */

import Vector from '@/lib/linalg/vector.js';

/** Compute approximate normal of a ring via Newell's method. */
function ringNormal(ring: Vector[]): Vector {
    let nx = 0, ny = 0, nz = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const cur = ring[i];
        const nxt = ring[(i + 1) % n];
        nx += (cur.y - nxt.y) * (cur.z + nxt.z);
        ny += (cur.z - nxt.z) * (cur.x + nxt.x);
        nz += (cur.x - nxt.x) * (cur.y + nxt.y);
    }
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return len > 1e-12 ? new Vector(nx / len, ny / len, nz / len) : new Vector(0, 0, 1);
}

/** Centroid of a ring. */
function ringCentroid(ring: Vector[]): Vector {
    let sx = 0, sy = 0, sz = 0;
    for (const v of ring) { sx += v.x; sy += v.y; sz += v.z; }
    const n = ring.length;
    return new Vector(sx / n, sy / n, sz / n);
}

/**
 * Cost of aligning ring2 at offset `k`: sum of distances from ring1[i] to
 * ring2[(i * n2 / n1 + k) % n2] for sampled i values.
 */
function alignmentCost(ring1: Vector[], ring2: Vector[], k: number): number {
    const n1 = ring1.length, n2 = ring2.length;
    let cost = 0;
    // Sample min(n1, 8) points from ring1 for efficiency
    const step = Math.max(1, Math.floor(n1 / 8));
    for (let i = 0; i < n1; i += step) {
        const j = (Math.floor(i * n2 / n1) + k) % n2;
        cost += ring1[i].minus(ring2[j]).norm();
    }
    return cost;
}

/**
 * Triangle fan: connect a single-vertex ring to every edge of the other ring.
 * Handles both cases: ring1 is the point, or ring2 is the point.
 */
function stitchFan(ring1: Vector[], ring2: Vector[]): number[][] {
    const n1 = ring1.length;
    const n2 = ring2.length;
    const faces: number[][] = [];

    if (n1 === 1) {
        // ring1 is the apex (index 0), fan around ring2 (indices n1..n1+n2-1)
        for (let j = 0; j < n2; j++) {
            faces.push([0, n1 + j, n1 + (j + 1) % n2]);
        }
    } else {
        // ring2 is the apex (index n1), fan around ring1 (indices 0..n1-1)
        for (let i = 0; i < n1; i++) {
            faces.push([i, (i + 1) % n1, n1]);
        }
    }
    return faces;
}

/**
 * Stitch two ordered closed loops into a triangle strip.
 *
 * @param ring1 First ring (ordered loop, length n1)
 * @param ring2 Second ring (ordered loop, length n2)
 * @returns Array of triangle index triples [a, b, c].
 *          Indices 0..n1-1 correspond to ring1, n1..n1+n2-1 to ring2.
 */
export function stitchRings(ring1: Vector[], ring2: Vector[]): number[][] {
    const n1 = ring1.length;
    const n2 = ring2.length;
    if (n1 === 0 || n2 === 0) return [];

    // --- Degenerate case: one ring is a single vertex (triangle fan) ---
    if (n1 === 1 || n2 === 1) {
        return stitchFan(ring1, ring2);
    }

    // --- 1. Normalize winding direction ---
    // If normals point in opposite directions, reverse ring2
    const normal1 = ringNormal(ring1);
    const normal2 = ringNormal(ring2);
    let r2 = ring2;
    let reversed = false;
    if (normal1.dot(normal2) < 0) {
        r2 = ring2.slice().reverse();
        reversed = true;
    }

    // --- 2. Find best alignment offset ---
    // Sample min(n2, 16) offsets
    const nSamples = Math.min(n2, 16);
    const sampleStep = Math.max(1, Math.floor(n2 / nSamples));
    let bestOffset = 0;
    let bestCost = Infinity;
    for (let s = 0; s < nSamples; s++) {
        const k = s * sampleStep;
        const c = alignmentCost(ring1, r2, k);
        if (c < bestCost) {
            bestCost = c;
            bestOffset = k;
        }
    }

    // --- 3. Greedy two-pointer triangle strip ---
    const faces: number[][] = [];
    let i = 0, j = 0;

    // We need to go around both rings completely: n1 + n2 triangles total
    while (i < n1 || j < n2) {
        const ci = i % n1;
        const ni = (i + 1) % n1;
        const cj = (j + bestOffset) % n2;
        const nj = ((j + 1) + bestOffset) % n2;

        if (i >= n1) {
            // ring1 exhausted, advance ring2
            faces.push([ci, n1 + nj, n1 + cj]);
            j++;
        } else if (j >= n2) {
            // ring2 exhausted, advance ring1
            faces.push([ci, ni, n1 + cj]);
            i++;
        } else {
            // Choose shorter diagonal
            const advI = ring1[(i + 1) % n1].minus(r2[(j + bestOffset) % n2]).norm();
            const advJ = ring1[i % n1].minus(r2[((j + 1) + bestOffset) % n2]).norm();
            if (advI <= advJ) {
                faces.push([ci, ni, n1 + cj]);
                i++;
            } else {
                faces.push([ci, n1 + nj, n1 + cj]);
                j++;
            }
        }
    }

    // --- 4. Orient faces outward ---
    // Compute combined centroid direction
    const c1 = ringCentroid(ring1);
    const c2 = ringCentroid(r2);
    const center = c1.plus(c2).times(0.5);

    if (faces.length > 0) {
        // Get the vertices of the first triangle
        const getV = (idx: number) => idx < n1 ? ring1[idx] : r2[idx - n1];
        const [a, b, c] = faces[0];
        const va = getV(a), vb = getV(b), vc = getV(c);
        const faceNormal = vb.minus(va).cross(vc.minus(va));
        const faceMid = va.plus(vb).plus(vc).times(1 / 3);
        const outward = faceMid.minus(center);

        // If face normal points inward, flip all faces
        if (faceNormal.dot(outward) < 0) {
            for (const f of faces) {
                const tmp = f[1];
                f[1] = f[2];
                f[2] = tmp;
            }
        }
    }

    // --- 5. If we reversed ring2, remap indices back ---
    if (reversed) {
        for (const f of faces) {
            for (let k = 0; k < 3; k++) {
                if (f[k] >= n1) {
                    f[k] = n1 + (n2 - 1 - (f[k] - n1));
                }
            }
        }
    }

    return faces;
}
