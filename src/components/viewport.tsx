'use client';

import { useRef, useEffect } from 'react';
import { TriangulationData, Bezier, Point } from '../interface';

interface ViewportProps {
    triangulation: TriangulationData | null;
    medialAxis?: Bezier[] | null;
}

export default function Viewport({ triangulation, medialAxis }: ViewportProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            console.log('Viewport: Canvas ref not available');
            return;
        }
        
        if (!triangulation) {
            console.log('Viewport: No triangulation data');
            return;
        }
        
        if (triangulation.vertices.length === 0) {
            console.log('Viewport: No vertices in triangulation');
            return;
        }

        // Ensure canvas has valid size
        if (canvas.width === 0 || canvas.height === 0) {
            canvas.width = canvas.offsetWidth || 800;
            canvas.height = canvas.offsetHeight || 600;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.log('Viewport: Could not get 2d context');
            return;
        }

        console.log('Viewport: Drawing triangulation', {
            vertices: triangulation.vertices.length,
            faces: triangulation.faces.length,
            canvasSize: { width: canvas.width, height: canvas.height }
        });

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Calculate bounds
        const vertices = triangulation.vertices;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        vertices.forEach(v => {
            minX = Math.min(minX, v.x);
            minY = Math.min(minY, v.y);
            maxX = Math.max(maxX, v.x);
            maxY = Math.max(maxY, v.y);
        });

        const width = maxX - minX;
        const height = maxY - minY;
        
        // Handle edge case where width or height is 0
        if (width === 0 || height === 0 || !isFinite(width) || !isFinite(height)) {
            console.warn('Viewport: Invalid bounds', { width, height, minX, minY, maxX, maxY });
            return;
        }
        
        const padding = 20;
        const scale = Math.min(
            (canvas.width - 2 * padding) / width,
            (canvas.height - 2 * padding) / height
        );
        
        if (!isFinite(scale) || scale <= 0) {
            console.warn('Viewport: Invalid scale', { scale, width, height, canvasSize: { width: canvas.width, height: canvas.height } });
            return;
        }

        const offsetX = (canvas.width - width * scale) / 2 - minX * scale;
        const offsetY = (canvas.height - height * scale) / 2 - minY * scale;

        // Transform function
        const transform = (p: Point) => ({
            x: p.x * scale + offsetX,
            y: p.y * scale + offsetY
        });

        // Draw triangles
        ctx.strokeStyle = '#3b82f6'; // blue-500
        ctx.lineWidth = 1;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'; // light blue fill

        triangulation.faces.forEach(face => {
            if (face.length !== 3) return;

            const v0 = transform(vertices[face[0]]);
            const v1 = transform(vertices[face[1]]);
            const v2 = transform(vertices[face[2]]);

            ctx.beginPath();
            ctx.moveTo(v0.x, v0.y);
            ctx.lineTo(v1.x, v1.y);
            ctx.lineTo(v2.x, v2.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        });

        // Draw boundary edges with thicker lines
        ctx.strokeStyle = '#1e40af'; // blue-800
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < vertices.length; i++) {
            const next = (i + 1) % vertices.length;
            const p1 = transform(vertices[i]);
            const p2 = transform(vertices[next]);
            
            if (i === 0) {
                ctx.moveTo(p1.x, p1.y);
            }
            ctx.lineTo(p2.x, p2.y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw vertices
        ctx.fillStyle = '#ef4444'; // red-500
        vertices.forEach(v => {
            const p = transform(v);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Draw medial axis if available
        // mats is Array<Bezier> where Bezier is Array<[x, y]>
        if (medialAxis && medialAxis.length > 0) {
            ctx.strokeStyle = '#10b981'; // green-500
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            medialAxis.forEach((bezier) => {
                if (!bezier || bezier.length < 2) return;

                ctx.beginPath();
                
                // Transform first point
                const start = transform({ x: bezier[0][0], y: bezier[0][1] });
                ctx.moveTo(start.x, start.y);

                if (bezier.length === 2) {
                    // Line segment
                    const end = transform({ x: bezier[1][0], y: bezier[1][1] });
                    ctx.lineTo(end.x, end.y);
                } else if (bezier.length === 3) {
                    // Quadratic bezier
                    const cp = transform({ x: bezier[1][0], y: bezier[1][1] });
                    const end = transform({ x: bezier[2][0], y: bezier[2][1] });
                    ctx.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
                } else if (bezier.length === 4) {
                    // Cubic bezier
                    const cp1 = transform({ x: bezier[1][0], y: bezier[1][1] });
                    const cp2 = transform({ x: bezier[2][0], y: bezier[2][1] });
                    const end = transform({ x: bezier[3][0], y: bezier[3][1] });
                    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
                }

                ctx.stroke();
            });

            ctx.setLineDash([]);
        }

    }, [triangulation, medialAxis]);

    // Handle canvas resize and initialization
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resizeCanvas = () => {
            const newWidth = canvas.offsetWidth;
            const newHeight = canvas.offsetHeight;
            if (newWidth > 0 && newHeight > 0) {
                canvas.width = newWidth;
                canvas.height = newHeight;
            }
        };

        // Initial resize
        resizeCanvas();
        
        // Use ResizeObserver for more reliable resize detection
        const resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
        });
        
        resizeObserver.observe(canvas);
        
        window.addEventListener('resize', resizeCanvas);
        return () => {
            window.removeEventListener('resize', resizeCanvas);
            resizeObserver.disconnect();
        };
    }, []);

    return (
        <div className="w-full h-full relative bg-gray-50 dark:bg-gray-900">
            <canvas
                ref={canvasRef}
                className="w-full h-full"
            />
            {!triangulation && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500">
                    Draw a path to see triangulation
                </div>
            )}
        </div>
    );
}

