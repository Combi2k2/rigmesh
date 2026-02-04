var cdt2d = require('cdt2d');
import { findMats, CpNodeFs } from 'flo-mat';
import Queue from './queue';

const { traverseEdges, isTerminating, getMatCurveToNext } = CpNodeFs;

/**
 * Constrained Delaunay Triangulation
 * @param {Array<{x: number, y: number}>} polygon - Array of points forming a closed polygon
 * @returns {Array<number[]>} Array of faces (triangles)
 */
export function CDT(polygon) {
    let points = polygon.map(point => [point.x, point.y]);
    let edges = polygon.map((_, index) => [index, (index+1)%polygon.length]);
    let faces = cdt2d(points, edges, {exterior: false});

    return faces;
}

/**
 * Medial Axis Transform
 * @param {Array<{x: number, y: number}>} polygon - Array of points forming a closed polygon
 * @returns {Array<Array<number[]>>} Array of curves (beziers)
 */
export function MAT(polygon) {
    let loop = polygon.map((point, index) => [point, polygon[(index+1)%polygon.length]]);
    let mat = findMats([loop])[0];
    let cpNode = mat.cpNode;

    let curves = [];

    try {
        traverseEdges(cpNode, function(node) {
            if (isTerminating(node)) { return; }
            
            let bezier = getMatCurveToNext(node);
            if (bezier) {
                console.log('bezier:', bezier);
                curves.push(bezier);
            }
        });
    } catch (e) {
        console.log('traverseEdges error:', e.message);
    }

    return curves;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param {{x: number, y: number}} point - Point to test
 * @param {Array<{x: number, y: number}>} polygon - Polygon vertices
 * @returns {boolean} True if point is inside polygon
 */
function isPointInPolygon(point, polygon) {
    let inside = false;
    const n = polygon.length;
    
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        
        if (((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    
    return inside;
}

/**
 * 
 * @param {Array<{x: number, y: number}>} polygon - Array of points forming a closed polygon
 * @param {number} spacing - spacing between grid points
 * @returns {Array<{x: number, y: number}>} Array of points forming a grid
 */
export function generateTriangleGrid(polygon, spacing) {
    let centroid = polygon.reduce((acc, point) => {
        acc.x += point.x;
        acc.y += point.y;
        return acc;
    }, {x: 0, y: 0});
    centroid.x /= polygon.length;
    centroid.y /= polygon.length;

    let gridPoints = [];
    let visited = new Map();
    let queue = new Queue();
    queue.push([centroid, [0, 0]]);
    visited.set("0,0", true);

    let dx = [ 2,  1, -1, -2, -1,  1];
    let dy = [ 0,  1,  1,  0, -1, -1];

    while (!queue.empty()) {
        let [point, pos] = queue.pop();
        
        if (isPointInPolygon(point, polygon)) {
            gridPoints.push(point);
            
            for (let i = 0; i < 6; i++) {
                let x = point.x + dx[i] * spacing * 0.5;
                let y = point.y + dy[i] * spacing * Math.sqrt(3) / 2;
                let newPos = [pos[0] + dx[i], pos[1] + dy[i]];
                let newKey = newPos.join(',');

                if (!visited.has(newKey)) {
                    visited.set(newKey, true);
                    queue.push([{x, y}, newPos]);
                }
            }
        }
    }

    return gridPoints;
}

/**
 * 
 * @param {{x: number, y: number}} a 
 * @param {{x: number, y: number}} b 
 * @param {{x: number, y: number}} c 
 * @returns {boolean} True if points are in counter-clockwise order
 */
export function ccw(a, b, c) {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

/**
 * Check if polygon vertices are in clockwise order using shoelace formula
 * @param {Array<{x: number, y: number}>} points - Polygon vertices
 * @returns {boolean} True if points are in clockwise order
 */
export function isClockwise(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        sum += (points[j].x - points[i].x) * (points[j].y + points[i].y);
    }
    return sum > 0;
}