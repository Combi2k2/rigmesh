import polygonClipping from 'polygon-clipping';

export type Vec2Like = { x: number; y: number };
export type Vec3Like = { x: number; y: number; z: number };

type Ring = [number, number][];
type Polygon = Ring[];

function toRing(poly: Vec2Like[]): Ring {
    if (poly.length === 0) return [];
    const ring: Ring = poly.map((p) => [p.x, p.y]);
    const [x0, y0] = ring[0];
    const [xl, yl] = ring[ring.length - 1];
    if (x0 !== xl || y0 !== yl)
        ring.push([x0, y0]);
    return ring;
}

function ringArea(ring: Ring): number {
    if (ring.length < 3) return 0;
    let area = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % n];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
}

function polygonArea(poly: Polygon): number {
    let a = ringArea(poly[0]);
    for (let i = 1; i < poly.length; i++) a -= ringArea(poly[i]);
    return a;
}

function geometryArea(geom: Polygon | Polygon[] | null): number {
    if (!geom || geom.length === 0) return 0;
    const inner = geom[0][0];
    const isPolygon = Array.isArray(inner) && inner.length === 2 && typeof inner[0] === 'number';
    if (isPolygon) {
        return polygonArea(geom as Polygon);
    }
    return (geom as Polygon[]).reduce((sum, p) => sum + polygonArea(p), 0);
}

/**
 * Returns area(intersection) / area(union) in [0, 1].
 */
export function iou2DSilhouettes(poly1: Vec2Like[], poly2: Vec2Like[]): number {
    if (poly1.length < 3 || poly2.length < 3) return 0;

    const subject: Polygon = [toRing(poly1)];
    const clipping: Polygon = [toRing(poly2)];

    const inter = polygonClipping.intersection(subject, clipping);
    const union = polygonClipping.union(subject, clipping);

    const interArea = geometryArea(inter);
    const unionArea = geometryArea(union);

    if (unionArea <= 0) return 0;
    return interArea / unionArea;
}

export function laplacian(V: Vec3Like[], F: number[][]) {
    const n = V.length;
    const lap = new Array(n).fill(0).map(() => ({ x: 0, y: 0, z: 0 }));
    const adj = new Array(n).fill(0).map(() => new Set<number>());
    for (let [i0, i1, i2] of F) {
        adj[i0].add(i1);
        adj[i0].add(i2);
        adj[i1].add(i0);
        adj[i1].add(i2);
        adj[i2].add(i0);
        adj[i2].add(i1);
    }
    for (let i = 0; i < n; i++)
    for (let j of adj[i]) {
        lap[i].x += (V[i].x - V[j].x) / adj[i].size;
        lap[i].y += (V[i].y - V[j].y) / adj[i].size;
        lap[i].z += (V[i].z - V[j].z) / adj[i].size;
    }
    let lapSum = 0;
    for (let i = 0; i < n; i++) {
        lapSum += lap[i].x * lap[i].x;
        lapSum += lap[i].y * lap[i].y;
        lapSum += lap[i].z * lap[i].z;
    }
    return lapSum / n;
}