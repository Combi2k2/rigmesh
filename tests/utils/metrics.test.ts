import { iou2DSilhouettes } from '@/utils/metrics';

jest.mock('martinez-polygon-clipping', () => {
  const ringArea = (ring: [number, number][]) => {
    if (ring.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  };
  type Polygon = [number, number][][];
  return {
    intersection: (a: Polygon, b: Polygon) => {
      const ra = a[0];
      const rb = b[0];
      const same = ra.length === rb.length && ra.every((p, i) => p[0] === rb[i][0] && p[1] === rb[i][1]);
      if (same) return a;
      const ax = ra.map((p) => p[0]);
      const bx = rb.map((p) => p[0]);
      if (Math.max(...ax) < Math.min(...bx) || Math.max(...bx) < Math.min(...ax)) return null;
      const ay = ra.map((p) => p[1]);
      const by = rb.map((p) => p[1]);
      if (Math.max(...ay) < Math.min(...by) || Math.max(...by) < Math.min(...ay)) return null;
      const x1 = Math.max(Math.min(...ax), Math.min(...bx));
      const x2 = Math.min(Math.max(...ax), Math.max(...bx));
      const y1 = Math.max(Math.min(...ay), Math.min(...by));
      const y2 = Math.min(Math.max(...ay), Math.max(...by));
      return [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]];
    },
    union: (a: Polygon, b: Polygon) => {
      const ringA = a[0];
      const ringB = b[0];
      const same = ringA.length === ringB.length && ringA.every((p: [number, number], i: number) => p[0] === ringB[i][0] && p[1] === ringB[i][1]);
      if (same) return a;
      const ax = ringA.map((p) => p[0]);
      const bx = ringB.map((p) => p[0]);
      if (Math.max(...ax) < Math.min(...bx) || Math.max(...bx) < Math.min(...ax)) return [[a[0]], [b[0]]];
      const ay = ringA.map((p) => p[1]);
      const by = ringB.map((p) => p[1]);
      if (Math.max(...ay) < Math.min(...by) || Math.max(...by) < Math.min(...ay)) return [[a[0]], [b[0]]];
      const x1 = Math.max(Math.min(...ax), Math.min(...bx));
      const x2 = Math.min(Math.max(...ax), Math.max(...bx));
      const y1 = Math.max(Math.min(...ay), Math.min(...by));
      const y2 = Math.min(Math.max(...ay), Math.max(...by));
      const interArea = (x2 - x1) * (y2 - y1);
      const areaA = ringArea(ringA);
      const areaB = ringArea(ringB);
      const u = Math.sqrt(areaA + areaB - interArea);
      return [[[0, 0], [u, 0], [u, u], [0, u], [0, 0]]];
    },
  };
});

describe('metrics', () => {
  describe('iou2DSilhouettes', () => {
    it('returns 1 for identical rectangles', () => {
      const rect = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 0, y: 1 },
      ];
      const iou = iou2DSilhouettes(rect, rect);
      expect(iou).toBeCloseTo(1, 5);
    });

    it('returns 0 for non-overlapping polygons', () => {
      const poly1 = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const poly2 = [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 1 },
        { x: 2, y: 1 },
      ];
      const iou = iou2DSilhouettes(poly1, poly2);
      expect(iou).toBe(0);
    });

    it('returns ~0.33 for half-overlapping unit squares', () => {
      const poly1 = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const poly2 = [
        { x: 0.5, y: 0 },
        { x: 1.5, y: 0 },
        { x: 1.5, y: 1 },
        { x: 0.5, y: 1 },
      ];
      const iou = iou2DSilhouettes(poly1, poly2);
      expect(iou).toBeGreaterThan(0.2);
      expect(iou).toBeLessThan(0.5);
    });

    it('returns 0 for degenerate polygons', () => {
      expect(iou2DSilhouettes([], [])).toBe(0);
      expect(iou2DSilhouettes([{ x: 0, y: 0 }], [{ x: 1, y: 1 }])).toBe(0);
    });
  });
});
