'use client';

import { useState, useEffect, useCallback } from 'react';
import Canvas, { Point } from './canvas';
import Viewport from './viewport';
import Viewport3D from './viewport3d';
import { MeshGen } from './meshgen';

// Bezier curve: array of control points [x, y]
type Bezier = number[][];

interface Mesh3DData {
  vertices: { x: number; y: number; z: number }[];
  faces: number[][];
}

interface SkeletonData {
  nodes: { x: number; y: number; z: number }[];
  edges: [number, number][];
}

export default function RigMeshPage() {
  const [exportedPaths, setExportedPaths] = useState<Point[][]>([]);
  const [currentTriangulation, setCurrentTriangulation] = useState<{
    vertices: Point[];
    faces: number[][];
  } | null>(null);
  const [mesh3D, setMesh3D] = useState<Mesh3DData | null>(null);
  const [skeleton, setSkeleton] = useState<SkeletonData | null>(null);
  const [latestPath, setLatestPath] = useState<Point[] | null>(null);
  const [isodistance, setIsodistance] = useState<number>(10);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d');

  const processMesh = useCallback((path: Point[], iso: number) => {
    try {
      console.log('Processing mesh with isodistance:', iso);
      
      // Create MeshGen instance - mesh is generated in constructor
      const meshGen = new MeshGen(path, iso);
      
      // Get 2D triangulation for preview
      const points = meshGen.getPoints();
      const faces = meshGen.getFaces();
      
      setCurrentTriangulation({
        vertices: points,
        faces: faces
      });
      
      // Get generated 3D mesh from getters
      const vertices3D = meshGen.getVertices3D();
      const faces3D = meshGen.getFaces3D();
      
      if (vertices3D.length > 0 && faces3D.length > 0) {
        // Convert Vector to plain objects
        const mesh3DData: Mesh3DData = {
          vertices: vertices3D.map(v => ({
            x: v.x,
            y: v.y,
            z: v.z
          })),
          faces: faces3D
        };
        setMesh3D(mesh3DData);
        console.log('3D Mesh generated:', {
          vertices: mesh3DData.vertices.length,
          faces: mesh3DData.faces.length
        });

        // Generate skeleton
        try {
          const skeletonGraph = meshGen.generateSkeleton(50, 50);
          const skeletonNodes: { x: number; y: number; z: number }[] = [];
          const skeletonEdges: [number, number][] = [];
          
          // Extract nodes from graph
          const nodeMap = new Map<number, number>();
          let nodeIndex = 0;
          
          skeletonGraph.nodes().forEach((nodeId) => {
            const nodeData = skeletonGraph.node(nodeId);
            // Handle both Vector and array formats (graphlib may store as array)
            let pos: any = nodeData;
            if (Array.isArray(nodeData) && nodeData.length > 0) {
              pos = nodeData[0];
            }
            
            // Extract x, y, z from Vector object
            skeletonNodes.push({
              x: pos?.x ?? 0,
              y: pos?.y ?? 0,
              z: pos?.z ?? 0
            });
            nodeMap.set(nodeId, nodeIndex);
            nodeIndex++;
          });
          
          // Extract edges from graph
          skeletonGraph.edges().forEach((edge) => {
            const startIdx = nodeMap.get(edge.v);
            const endIdx = nodeMap.get(edge.w);
            if (startIdx !== undefined && endIdx !== undefined) {
              skeletonEdges.push([startIdx, endIdx]);
            }
          });
          
          if (skeletonNodes.length > 0) {
            setSkeleton({
              nodes: skeletonNodes,
              edges: skeletonEdges
            });
            console.log('Skeleton generated:', {
              nodes: skeletonNodes.length,
              edges: skeletonEdges.length
            });
          } else {
            setSkeleton(null);
          }
        } catch (error) {
          console.error('Error generating skeleton:', error);
          setSkeleton(null);
        }
      } else {
        console.warn('Empty 3D mesh generated');
        setMesh3D(null);
        setSkeleton(null);
      }
    } catch (error) {
      console.error('Error processing mesh:', error);
    }
  }, []);

  const handlePathComplete = (path: Point[]) => {
    console.log('Path received in handlePathComplete:', path);
    console.log('Path length:', path.length);
    
    setExportedPaths((prev) => {
      const newPaths = [...prev, path];
      console.log('Total paths exported:', newPaths.length);
      return newPaths;
    });

    setLatestPath(path);
    processMesh(path, isodistance);
  };

  // Reprocess when parameters change
  useEffect(() => {
    if (latestPath) {
      processMesh(latestPath, isodistance);
    }
  }, [isodistance, latestPath, processMesh]);

  const exportAllPaths = () => {
    const dataStr = JSON.stringify(exportedPaths, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `paths-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-screen overflow-hidden flex">
      {/* Left sidebar - Canvas */}
      <div className="w-1/2 border-r border-gray-300 dark:border-gray-700 flex flex-col">
        <div className="flex-1 relative">
          <Canvas onPathComplete={handlePathComplete} />
        </div>
        {exportedPaths.length > 0 && (
          <div className="bg-gray-100 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 p-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {exportedPaths.length} path{exportedPaths.length !== 1 ? 's' : ''} exported
              </span>
              <button
                onClick={exportAllPaths}
                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded"
              >
                Export All as JSON
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar - Viewport */}
      <div className="w-1/2 flex flex-col">
        <div className="flex-1 relative">
          {viewMode === '2d' ? (
            <Viewport triangulation={currentTriangulation} />
          ) : (
            <Viewport3D mesh={mesh3D} mesh2d={currentTriangulation} skeleton={skeleton} />
          )}
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 p-3 space-y-3">
          {/* View mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('2d')}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === '2d'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              2D View
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1 text-sm rounded ${
                viewMode === '3d'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              3D View
            </button>
          </div>

          {/* Controls */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Isodistance: {isodistance}
              </label>
              <input
                type="range"
                min="2"
                max="50"
                step="1"
                value={isodistance}
                onChange={(e) => setIsodistance(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
          
          {/* Stats */}
          <div className="text-sm text-gray-600 dark:text-gray-400 border-t border-gray-300 dark:border-gray-700 pt-2">
            {currentTriangulation && (
              <>
                <div>2D Vertices: {currentTriangulation.vertices.length}</div>
                <div>2D Triangles: {currentTriangulation.faces.length}</div>
              </>
            )}
            {mesh3D && (
              <>
                <div>3D Vertices: {mesh3D.vertices.length}</div>
                <div>3D Triangles: {mesh3D.faces.length}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
