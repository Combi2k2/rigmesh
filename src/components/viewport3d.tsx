'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Point } from '../interface';
import Vector from '@/lib/linalg/vector';

interface Viewport3DProps {
  mesh2d?: [Point[], number[][]] | null;
  mesh3d?: [Vector[], number[][]] | null;
  chordData?: [Vector[], Vector[], number[]] | null;
  currentStep: number;
  vertices2d?: { x: number; y: number }[] | null; // 2D vertices from Step 1 for polygon rendering
  capOffset?: number;
  junctionOffset?: number;
}

export default function Viewport3D({ mesh2d, mesh3d, chordData, currentStep, vertices2d, capOffset = 0, junctionOffset = 0 }: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const polygon2dRef = useRef<THREE.Line | null>(null);
  const mesh2dRef = useRef<THREE.Mesh | null>(null);
  const wireframe2dRef = useRef<THREE.LineSegments | null>(null);
  const mesh3dRef = useRef<THREE.Group | null>(null);
  const chordRef = useRef<THREE.Group | null>(null);
  const centerRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const lastStepRef = useRef<number>(0);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      100000
    );
    camera.position.set(0, 0, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Helper to clean up mesh
  const cleanupMesh = (mesh: THREE.Mesh | null, wireframe: THREE.LineSegments | null, scene: THREE.Scene) => {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }
    if (wireframe) {
      scene.remove(wireframe);
      wireframe.geometry.dispose();
      if (wireframe.material) {
        wireframe.material.dispose();
      }
    }
  };

  // Helper to clean up group
  const cleanupGroup = (group: THREE.Group | null, scene: THREE.Scene) => {
    if (group) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
          child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      scene.remove(group);
    }
  };

  // Helper to clean up line
  const cleanupLine = (line: THREE.Line | null, scene: THREE.Scene) => {
    if (line) {
      scene.remove(line);
      line.geometry.dispose();
      if (line.material) {
        line.material.dispose();
      }
    }
  };

  // Clean all rendering when step changes, then render polygon and current step content
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // Clean up all previous rendering
    cleanupLine(polygon2dRef.current, scene);
    polygon2dRef.current = null;
    cleanupMesh(mesh2dRef.current, wireframe2dRef.current, scene);
    mesh2dRef.current = null;
    wireframe2dRef.current = null;
    cleanupGroup(chordRef.current, scene);
    chordRef.current = null;
    cleanupGroup(mesh3dRef.current, scene);
    mesh3dRef.current = null;

    // Always render polygon from Step 1 vertices (from step 2 onwards)
    if (currentStep >= 2 && vertices2d && vertices2d.length >= 3) {
      const points = vertices2d.map(v => new THREE.Vector3(v.x, v.y, 0));
      points.push(points[0]); // Close the polygon

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 2,
      });
      const line = new THREE.Line(geometry, material);
      scene.add(line);
      polygon2dRef.current = line;
    }

    // Render Step 1: 2D triangulation
    if (currentStep === 1 && mesh2d && mesh2d[0].length > 0 && mesh2d[1].length > 0) {
      const [vertices, faces] = mesh2d;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(vertices.length * 3);
      vertices.forEach((v, i) => {
        positions[i * 3] = v.x;
        positions[i * 3 + 1] = v.y;
        positions[i * 3 + 2] = 0;
      });
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const indices: number[] = [];
      faces.forEach(face => {
        if (face.length === 3) {
          indices.push(face[0], face[1], face[2]);
        }
      });
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const material = new THREE.MeshPhongMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide,
        flatShading: true,
        transparent: true,
        opacity: 0.5,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      mesh2dRef.current = mesh;

      const wireframeGeometry = new THREE.WireframeGeometry(geometry);
      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: 0x059669,
        linewidth: 1,
      });
      const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
      scene.add(wireframe);
      wireframe2dRef.current = wireframe;

      // Center camera only when step changes
      if (lastStepRef.current !== currentStep) {
        geometry.computeBoundingBox();
        if (geometry.boundingBox && cameraRef.current) {
          const center = new THREE.Vector3();
          geometry.boundingBox.getCenter(center);
          centerRef.current.copy(center);
          const size = new THREE.Vector3();
          geometry.boundingBox.getSize(size);
          const maxDim = Math.max(size.x, size.y);
          cameraRef.current.position.set(0, 0, maxDim * 2);
          cameraRef.current.lookAt(0, 0, 0);
          if (controlsRef.current) {
            controlsRef.current.target.set(0, 0, 0);
            controlsRef.current.update();
          }
        }
      }
    }

    // Render Step 2: Chords
    if (currentStep === 2 && chordData && chordData[0].length > 0) {
      const [chordAxis, chordDirs, chordLengths] = chordData;
      const chordGroup = new THREE.Group();

      for (let i = 0; i < chordAxis.length; i++) {
        const axis = chordAxis[i];
        const dir = chordDirs[i];
        const length = chordLengths[i];

        const midpoint = new THREE.Vector3(axis.x, axis.y, axis.z);
        const direction = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
        const halfLength = length / 2;

        const start = midpoint.clone().sub(direction.clone().multiplyScalar(halfLength));
        const end = midpoint.clone().add(direction.clone().multiplyScalar(halfLength));

        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const material = new THREE.LineBasicMaterial({
          color: 0xffd93d,
          linewidth: 2,
        });
        const line = new THREE.Line(geometry, material);
        chordGroup.add(line);
      }

      scene.add(chordGroup);
      chordRef.current = chordGroup;
    }

    // Render Step 3 & 4: 3D mesh
    if ((currentStep === 3 || currentStep === 4) && mesh3d && mesh3d[0].length > 0 && mesh3d[1].length > 0) {
      const [vertices, faces] = mesh3d;
      const group = new THREE.Group();
      const actualJunctionOffset = junctionOffset || faces.length;

      if (currentStep === 4) {
        // Step 4: All faces grey
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(vertices.length * 3);
        vertices.forEach((v, i) => {
          positions[i * 3] = v.x;
          positions[i * 3 + 1] = v.y;
          positions[i * 3 + 2] = v.z;
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const indices: number[] = [];
        faces.forEach(face => {
          if (face.length >= 3) {
            for (let i = 1; i < face.length - 1; i++) {
              indices.push(face[0], face[i], face[i + 1]);
            }
          }
        });
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshPhongMaterial({
          color: 0x808080,
          side: THREE.DoubleSide,
          flatShading: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
      } else {
        // Step 3: Color-coded faces
        const blueFaces: number[][] = [];
        const greenFaces: number[][] = [];
        const yellowFaces: number[][] = [];

        faces.forEach((face, idx) => {
          if (idx < capOffset) {
            blueFaces.push(face);
          } else if (idx < actualJunctionOffset) {
            greenFaces.push(face);
          } else {
            yellowFaces.push(face);
          }
        });

        const createMeshForFaces = (faceList: number[][], color: number) => {
          if (faceList.length === 0) return null;

          const geometry = new THREE.BufferGeometry();
          const positions = new Float32Array(vertices.length * 3);
          vertices.forEach((v, i) => {
            positions[i * 3] = v.x;
            positions[i * 3 + 1] = v.y;
            positions[i * 3 + 2] = v.z;
          });
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

          const indices: number[] = [];
          faceList.forEach(face => {
            if (face.length >= 3) {
              for (let i = 1; i < face.length - 1; i++) {
                indices.push(face[0], face[i], face[i + 1]);
              }
            }
          });
          geometry.setIndex(indices);
          geometry.computeVertexNormals();

          const material = new THREE.MeshPhongMaterial({
            color: color,
            side: THREE.DoubleSide,
            flatShading: true,
          });
          return new THREE.Mesh(geometry, material);
        };

        const blueMesh = createMeshForFaces(blueFaces, 0x3b82f6);
        if (blueMesh) group.add(blueMesh);

        const greenMesh = createMeshForFaces(greenFaces, 0x10b981);
        if (greenMesh) group.add(greenMesh);

        const yellowMesh = createMeshForFaces(yellowFaces, 0xfbbf24);
        if (yellowMesh) group.add(yellowMesh);
      }

      scene.add(group);
      mesh3dRef.current = group;

      // Center camera only when step changes
      if (lastStepRef.current !== currentStep && cameraRef.current && vertices.length > 0) {
        const box = new THREE.Box3();
        vertices.forEach(v => {
          box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z));
        });
        const center = new THREE.Vector3();
        box.getCenter(center);
        centerRef.current.copy(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        cameraRef.current.position.set(0, 0, maxDim * 2);
        cameraRef.current.lookAt(0, 0, 0);
        if (controlsRef.current) {
          controlsRef.current.target.set(0, 0, 0);
          controlsRef.current.update();
        }
      }
    }
    
    // Update last step ref after rendering
    lastStepRef.current = currentStep;
  }, [currentStep, mesh2d, mesh3d, chordData, vertices2d, capOffset, junctionOffset]);

  return <div ref={containerRef} className="w-full h-full" />;
}
