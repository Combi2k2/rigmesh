'use client';

import {
    useRef,
    useEffect,
    useState,
    useCallback
} from 'react';
import { Point, Vec2 } from '../interface/point';

interface CanvasProps {
    onPathComplete?: (path: Point[]) => void;
}

export default function Canvas({ onPathComplete }: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [currentPath, setCurrentPath] = useState<Point[]>([]);
    const hasLeftStartNeighborhoodRef = useRef(false);
    const exportedPathsRef = useRef<Point[][]>([]);

    const CLOSE_THRESHOLD = 10;

    const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): Vec2 => {
        const canvas = canvasRef.current;
        if (!canvas) return new Vec2(0, 0);
        
        const rect = canvas.getBoundingClientRect();
        return new Vec2(
            e.clientX - rect.left,
            e.clientY - rect.top
        );
    }, []);

    const isCloseToStart = useCallback((point: Point, start: Point) => {
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < CLOSE_THRESHOLD;
    }, []);

    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, []);

    const drawCurrentPath = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        clearCanvas();
        
        if (currentPath.length < 2) return;
        
        ctx.strokeStyle = '#3b82f6'; // blue-500
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length; i++)
            ctx.lineTo(currentPath[i].x, currentPath[i].y);
        
        ctx.stroke();

        // If close to start and has left the neighborhood, draw a preview line
        if (startPoint && currentPath.length > 2 && hasLeftStartNeighborhoodRef.current) {
            const lastPoint = currentPath[currentPath.length - 1];
            if (isCloseToStart(lastPoint, startPoint)) {
                ctx.strokeStyle = '#10b981'; // green-500 for preview
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(startPoint.x, startPoint.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }, [currentPath, startPoint, isCloseToStart, clearCanvas]);

    // Redraw when current path changes
    useEffect(() => {
        drawCurrentPath();
    }, [drawCurrentPath]);

    // Handle mouse down - start drawing
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const point = getMousePos(e);
        setIsDrawing(true);
        setStartPoint(point);
        setCurrentPath([point]);
        hasLeftStartNeighborhoodRef.current = false; // Reset when starting new drawing
    }, [getMousePos]);

    // Handle mouse move - continue drawing
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !startPoint) return;

        const point = getMousePos(e);
        const newPath = [...currentPath, point];
        setCurrentPath(newPath);

        if (!hasLeftStartNeighborhoodRef.current && !isCloseToStart(point, startPoint))
            hasLeftStartNeighborhoodRef.current = true;

        if (newPath.length > 2 && hasLeftStartNeighborhoodRef.current && isCloseToStart(point, startPoint)) {
            const closedPath = [...newPath, startPoint];
            
            // Export the path
            exportedPathsRef.current.push(closedPath);
            if (onPathComplete) {
                onPathComplete(closedPath);
            }
            
            // Clear canvas and reset state
            clearCanvas();
            setCurrentPath([]);
            setIsDrawing(false);
            setStartPoint(null);
            hasLeftStartNeighborhoodRef.current = false;
        }
    }, [isDrawing, startPoint, currentPath, getMousePos, isCloseToStart]);

    // Handle mouse up - finish drawing
    const handleMouseUp = useCallback(() => {
        if (!isDrawing || !startPoint || currentPath.length < 2) {
            setIsDrawing(false);
            setStartPoint(null);
            setCurrentPath([]);
            hasLeftStartNeighborhoodRef.current = false;
            return;
        }

        // Close the path by connecting to start
        const closedPath = [...currentPath, startPoint];
        
        // Export the path
        exportedPathsRef.current.push(closedPath);
        if (onPathComplete) {
            onPathComplete(closedPath);
        }
        
        // Clear canvas and reset state
        clearCanvas();
        setCurrentPath([]);
        setIsDrawing(false);
        setStartPoint(null);
        hasLeftStartNeighborhoodRef.current = false;
    }, [isDrawing, startPoint, currentPath, onPathComplete, clearCanvas]);
    
    const handleMouseLeave = useCallback(() => {
        if (isDrawing) {
            setCurrentPath([]);
            setIsDrawing(false);
            setStartPoint(null);
            hasLeftStartNeighborhoodRef.current = false;
        }
    }, [isDrawing]);

  // Set canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

        const resizeCanvas = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            drawCurrentPath();
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [drawCurrentPath]);

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
          Drawing... {currentPath.length > 2 && hasLeftStartNeighborhoodRef.current && isCloseToStart(currentPath[currentPath.length - 1], startPoint!) && (
            <span className="text-green-600 dark:text-green-400">(Close to start - release to close)</span>
          )}
        </div>
      )}
    </div>
  );
}

