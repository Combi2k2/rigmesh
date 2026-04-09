'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Point, Vec2 } from '../interface/point';

interface CanvasProps {
    onPathComplete?: (path: Point[]) => void;
}

const CLOSE_THRESHOLD = 10;

export default function Canvas({ onPathComplete }: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [currentPath, setCurrentPath] = useState<Point[]>([]);
    const hasLeftStartRef = useRef(false);

    // Get mouse position relative to canvas
    const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): Vec2 => {
        const canvas = canvasRef.current;
        if (!canvas) return new Vec2(0, 0);
        const rect = canvas.getBoundingClientRect();
        return new Vec2(e.clientX - rect.left, e.clientY - rect.top);
    }, []);

    // Check if point is close enough to start point to close the path
    const isCloseToStart = useCallback((point: Point, start: Point): boolean => {
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        return Math.sqrt(dx * dx + dy * dy) < CLOSE_THRESHOLD;
    }, []);

    // Get canvas context helper
    const getContext = useCallback(() => {
        return canvasRef.current?.getContext('2d');
    }, []);

    // Draw the current path on canvas
    const drawPath = useCallback(() => {
        const ctx = getContext();
        if (!ctx || currentPath.length < 2) return;

        const canvas = canvasRef.current!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw main path
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x, currentPath[0].y);
        currentPath.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();

        // Draw preview line to start if close
        if (startPoint && currentPath.length > 2 && hasLeftStartRef.current) {
            const lastPoint = currentPath[currentPath.length - 1];
            if (isCloseToStart(lastPoint, startPoint)) {
                ctx.strokeStyle = '#10b981';
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(startPoint.x, startPoint.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }, [currentPath, startPoint, getContext, isCloseToStart]);

    // Close and export the path
    const closePath = useCallback(() => {
        if (!startPoint || currentPath.length < 2) return;
        const closedPath = [...currentPath, startPoint];
        onPathComplete?.(closedPath);
        resetDrawing();
    }, [startPoint, currentPath, onPathComplete]);

    // Reset drawing state
    const resetDrawing = useCallback(() => {
        setCurrentPath([]);
        setIsDrawing(false);
        setStartPoint(null);
        hasLeftStartRef.current = false;
        getContext()?.clearRect(0, 0, canvasRef.current?.width || 0, canvasRef.current?.height || 0);
    }, [getContext]);

    // Redraw when path changes
    useEffect(() => {
        drawPath();
    }, [drawPath]);

    // Setup canvas size and resize handler
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            drawPath();
        };

        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [drawPath]);

    // Mouse event handlers
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const point = getMousePos(e);
        setIsDrawing(true);
        setStartPoint(point);
        setCurrentPath([point]);
        hasLeftStartRef.current = false;
    }, [getMousePos]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !startPoint) return;

        const point = getMousePos(e);
        const newPath = [...currentPath, point];
        setCurrentPath(newPath);

        // Track if we've left the start neighborhood
        if (!hasLeftStartRef.current && !isCloseToStart(point, startPoint)) {
            hasLeftStartRef.current = true;
        }

        // Auto-close if back near start
        if (newPath.length > 2 && hasLeftStartRef.current && isCloseToStart(point, startPoint)) {
            closePath();
        }
    }, [isDrawing, startPoint, currentPath, getMousePos, isCloseToStart, closePath]);

    const handleMouseUp = useCallback(() => {
        if (isDrawing) closePath();
    }, [isDrawing, closePath]);

    const handleMouseLeave = useCallback(() => {
        if (isDrawing) resetDrawing();
    }, [isDrawing, resetDrawing]);

    // Check if showing close hint
    const showCloseHint = isDrawing && 
        currentPath.length > 2 && 
        hasLeftStartRef.current && 
        startPoint && 
        isCloseToStart(currentPath[currentPath.length - 1], startPoint);

    return (
        <div className="w-full h-full relative">
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                className="w-full h-full border border-gray-300 dark:border-gray-700 cursor-crosshair"
            />
            {isDrawing && (
                <div className="absolute top-2 left-2 text-sm text-gray-600 dark:text-gray-400">
                    Drawing... {showCloseHint && (
                        <span className="text-green-600 dark:text-green-400">(Close to start - release to close)</span>
                    )}
                </div>
            )}
        </div>
    );
}

