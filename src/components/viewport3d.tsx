'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Mesh3DData, Mesh2DData, SkeletonData, SkinWeightData } from '../interface';

interface Viewport3DProps {
    mesh: Mesh3DData | null;
    mesh2d?: Mesh2DData | null;
    skeleton?: SkeletonData | null;
    skinWeights?: SkinWeightData | null;
}

export default function Viewport3D({ mesh, mesh2d, skeleton, skinWeights }: Viewport3DProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const skinnedMeshRef = useRef<THREE.SkinnedMesh | null>(null);
    const wireframeRef = useRef<THREE.LineSegments | null>(null);
    const mesh2dRef = useRef<THREE.Mesh | null>(null);
    const wireframe2dRef = useRef<THREE.LineSegments | null>(null);
    const skeletonRef = useRef<THREE.Group | null>(null);
    const bonesRef = useRef<THREE.Bone[]>([]);
    const skeletonObjRef = useRef<THREE.Skeleton | null>(null);
    const centerRef = useRef<THREE.Vector3>(new THREE.Vector3());
    const keysPressed = useRef<Set<string>>(new Set());
    const selectedBoneRef = useRef<number | null>(null);

    // Initialize Three.js scene
    useEffect(() => {
        if (!containerRef.current) return;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);
        sceneRef.current = scene;

        // Camera
        const camera = new THREE.PerspectiveCamera(
            75,
            containerRef.current.clientWidth / containerRef.current.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 0, 300);
        cameraRef.current = camera;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controlsRef.current = controls;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-1, -1, -1);
        scene.add(directionalLight2);

        // Keyboard controls for panning
        const baseMoveSpeed = 5;

        const handleKeyDown = (e: KeyboardEvent) => {
            keysPressed.current.add(e.key.toLowerCase());
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            keysPressed.current.delete(e.key.toLowerCase());
        };

        // Animation loop with keyboard handling
        const animate = () => {
            requestAnimationFrame(animate);

            // Handle keyboard movement (orthogonal to view direction)
            const keys = keysPressed.current;
            if (keys.size > 0 && camera && controls) {
                // Scale move speed based on distance from z=0 plane
                // Closer to z=0 = slower movement for finer control
                const distanceFromZ0 = Math.abs(camera.position.z);
                const minSpeed = 0.5;  // Minimum speed when very close
                const speedScale = 100; // Distance at which we get full speed
                const moveSpeed = Math.max(minSpeed, baseMoveSpeed * (distanceFromZ0 / speedScale));

                // Get camera's right and up vectors (orthogonal to view direction)
                const right = new THREE.Vector3();
                const up = new THREE.Vector3();
                camera.getWorldDirection(new THREE.Vector3());
                right.setFromMatrixColumn(camera.matrixWorld, 0); // Right vector
                up.setFromMatrixColumn(camera.matrixWorld, 1);    // Up vector

                const panOffset = new THREE.Vector3();

                // WASD and Arrow keys
                if (keys.has('a') || keys.has('arrowleft')) {
                    panOffset.add(right.clone().multiplyScalar(-moveSpeed));
                }
                if (keys.has('d') || keys.has('arrowright')) {
                    panOffset.add(right.clone().multiplyScalar(moveSpeed));
                }
                if (keys.has('w') || keys.has('arrowup')) {
                    panOffset.add(up.clone().multiplyScalar(moveSpeed));
                }
                if (keys.has('s') || keys.has('arrowdown')) {
                    panOffset.add(up.clone().multiplyScalar(-moveSpeed));
                }

                // Move both camera and target together (panning)
                camera.position.add(panOffset);
                controls.target.add(panOffset);
            }

            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Handle resize
        const handleResize = () => {
            if (!containerRef.current || !camera || !renderer) return;
            camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(containerRef.current);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            resizeObserver.disconnect();
            renderer.dispose();
            if (containerRef.current && renderer.domElement) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, []);

    // Helper function to clean up mesh objects
    const cleanupMesh = (meshObj: THREE.Mesh | null, wireframeObj: THREE.LineSegments | null, scene: THREE.Scene) => {
        if (meshObj) {
            scene.remove(meshObj);
            meshObj.geometry.dispose();
            (meshObj.material as THREE.Material).dispose();
        }
        if (wireframeObj) {
            scene.remove(wireframeObj);
            wireframeObj.geometry.dispose();
            (wireframeObj.material as THREE.Material).dispose();
        }
    };

    // Helper function to clean up skeleton
    const cleanupSkeleton = (skeletonGroup: THREE.Group | null, scene: THREE.Scene) => {
        if (skeletonGroup) {
            scene.remove(skeletonGroup);
            skeletonGroup.traverse((child) => {
                if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
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
        }
    };

    // Update 2D mesh when data changes
    useEffect(() => {
        if (!sceneRef.current) return;
        const scene = sceneRef.current;

        // Remove old 2D mesh
        cleanupMesh(mesh2dRef.current, wireframe2dRef.current, scene);
        mesh2dRef.current = null;
        wireframe2dRef.current = null;

        if (!mesh2d || mesh2d.vertices.length === 0 || mesh2d.faces.length === 0) {
            return;
        }

        // Create geometry for 2D triangulation (z = 0)
        const geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(mesh2d.vertices.length * 3);
        mesh2d.vertices.forEach((v, i) => {
            positions[i * 3] = v.x - centerRef.current.x;
            positions[i * 3 + 1] = v.y - centerRef.current.y;
            positions[i * 3 + 2] = 0; // Flat on z=0 plane
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const indices: number[] = [];
        mesh2d.faces.forEach(face => {
            if (face.length === 3) {
                indices.push(face[0], face[1], face[2]);
            }
        });
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        // Create semi-transparent mesh for 2D triangulation
        const material = new THREE.MeshPhongMaterial({
            color: 0x10b981, // Green
            side: THREE.DoubleSide,
            flatShading: true,
            transparent: true,
            opacity: 0.5,
        });
        const threeMesh = new THREE.Mesh(geometry, material);
        scene.add(threeMesh);
        mesh2dRef.current = threeMesh;

        // Create wireframe for 2D mesh
        const wireframeGeometry = new THREE.WireframeGeometry(geometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x059669, // Darker green
            linewidth: 1,
        });
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        scene.add(wireframe);
        wireframe2dRef.current = wireframe;

        console.log('Viewport3D: 2D Mesh created', {
            vertices: mesh2d.vertices.length,
            faces: mesh2d.faces.length
        });
    }, [mesh2d]);

    // Update 3D mesh when data changes
    useEffect(() => {
        if (!sceneRef.current) return;
        const scene = sceneRef.current;

        // Remove old 3D mesh and skinned mesh
        cleanupMesh(meshRef.current, wireframeRef.current, scene);
        if (skinnedMeshRef.current) {
            scene.remove(skinnedMeshRef.current);
            skinnedMeshRef.current.geometry.dispose();
            (skinnedMeshRef.current.material as THREE.Material).dispose();
            skinnedMeshRef.current = null;
        }
        if (skeletonObjRef.current) {
            skeletonObjRef.current = null;
        }
        bonesRef.current = [];
        meshRef.current = null;
        wireframeRef.current = null;

        if (!mesh || mesh.vertices.length === 0 || mesh.faces.length === 0) {
            console.log('Viewport3D: Empty 3D mesh data');
            return;
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();

        // Vertices
        const positions = new Float32Array(mesh.vertices.length * 3);
        mesh.vertices.forEach((v, i) => {
            positions[i * 3] = v.x;
            positions[i * 3 + 1] = v.y;
            positions[i * 3 + 2] = v.z;
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Faces (indices) - reverse winding order to fix inverted mesh
        const indices: number[] = [];
        mesh.faces.forEach(face => {
            if (face.length === 3) {
                // Reverse the order to fix inverted mesh (Three.js expects CCW winding)
                indices.push(face[0], face[2], face[1]);
            }
        });
        geometry.setIndex(indices);

        // Calculate center and store it for 2D mesh alignment
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox?.getCenter(center);
        centerRef.current.copy(center);
        geometry.translate(-center.x, -center.y, -center.z);

        // Check if we have skeleton and skin weights for SkinnedMesh
        if (skeleton && skinWeights && skeleton.joints.length > 0 && skinWeights.indices.length > 0) {
            // Create bones from skeleton
            const bones: THREE.Bone[] = [];
            const boneMap = new Map<number, THREE.Bone>();

            // Create all bones first
            skeleton.joints.forEach((joint, i) => {
                const bone = new THREE.Bone();
                bone.position.set(
                    joint.x - center.x,
                    joint.y - center.y,
                    joint.z - center.z
                );
                bone.userData.index = i;
                bones.push(bone);
                boneMap.set(i, bone);
            });

            // Build bone hierarchy from bones array (parent to child pairs)
            skeleton.bones.forEach(([parentIdx, childIdx]) => {
                const parentBone = boneMap.get(parentIdx);
                const childBone = boneMap.get(childIdx);
                if (parentBone && childBone) {
                    parentBone.add(childBone);
                }
            });

            // Find root bones (bones without parents)
            const rootBones: THREE.Bone[] = [];
            bones.forEach(bone => {
                if (bone.parent === null || !(bone.parent instanceof THREE.Bone)) {
                    rootBones.push(bone);
                }
            });

            // Create skeleton
            const skeletonObj = new THREE.Skeleton(bones);
            skeletonObjRef.current = skeletonObj;

            // Prepare skin indices and weights
            const maxBonesPerVertex = 4;
            const skinIndicesArray = new Uint16Array(mesh.vertices.length * maxBonesPerVertex);
            const skinWeightsArray = new Float32Array(mesh.vertices.length * maxBonesPerVertex);

            for (let i = 0; i < mesh.vertices.length; i++) {
                const vertexIndices = skinWeights.indices[i] || [];
                const vertexWeights = skinWeights.weights[i] || [];
                
                // Normalize weights
                let totalWeight = 0;
                for (let j = 0; j < Math.min(vertexWeights.length, maxBonesPerVertex); j++) {
                    totalWeight += vertexWeights[j];
                }
                
                for (let j = 0; j < maxBonesPerVertex; j++) {
                    const idx = i * maxBonesPerVertex + j;
                    if (j < vertexIndices.length && j < vertexWeights.length) {
                        skinIndicesArray[idx] = vertexIndices[j];
                        skinWeightsArray[idx] = totalWeight > 0 ? vertexWeights[j] / totalWeight : 0;
                    } else {
                        skinIndicesArray[idx] = 0;
                        skinWeightsArray[idx] = 0;
                    }
                }
            }

            geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndicesArray, maxBonesPerVertex));
            geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeightsArray, maxBonesPerVertex));

            // Compute normals
            geometry.computeVertexNormals();

            // Create SkinnedMesh
            const material = new THREE.MeshPhongMaterial({
                color: 0x4a90d9,
                side: THREE.DoubleSide,
                flatShading: true,
                skinning: true
            });
            const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
            skinnedMesh.bind(skeletonObj);
            skinnedMesh.castShadow = true;
            skinnedMesh.receiveShadow = true;
            
            scene.add(skinnedMesh);
            skinnedMeshRef.current = skinnedMesh;
            bonesRef.current = bones;

            console.log('Viewport3D: SkinnedMesh created', {
                vertices: mesh.vertices.length,
                faces: mesh.faces.length,
                bones: bones.length
            });
        } else {
            // Fallback to regular mesh
            geometry.computeVertexNormals();

            const material = new THREE.MeshPhongMaterial({
                color: 0x4a90d9,
                side: THREE.DoubleSide,
                flatShading: true,
            });
            const threeMesh = new THREE.Mesh(geometry, material);
            scene.add(threeMesh);
            meshRef.current = threeMesh;

            console.log('Viewport3D: Regular 3D Mesh created', {
                vertices: mesh.vertices.length,
                faces: mesh.faces.length
            });
        }

        // Create wireframe
        const wireframeGeometry = new THREE.WireframeGeometry(geometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
            linewidth: 1,
            opacity: 0.3,
            transparent: true
        });
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        scene.add(wireframe);
        wireframeRef.current = wireframe;

        // Adjust camera to fit mesh
        if (cameraRef.current && geometry.boundingBox) {
            const size = new THREE.Vector3();
            geometry.boundingBox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            cameraRef.current.position.set(0, 0, maxDim * 2);
            cameraRef.current.lookAt(0, 0, 0);
            if (controlsRef.current) {
                controlsRef.current.target.set(0, 0, 0);
                controlsRef.current.update();
            }
        }

    }, [mesh, skeleton, skinWeights]);

    // Update skeleton when data changes
    useEffect(() => {
        if (!sceneRef.current) return;
        const scene = sceneRef.current;

        // Remove old skeleton
        cleanupSkeleton(skeletonRef.current, scene);
        skeletonRef.current = null;

        if (!skeleton || skeleton.joints.length === 0) {
            return;
        }

        // Create skeleton group
        const skeletonGroup = new THREE.Group();

        // Create joints (spheres)
        const jointGeometry = new THREE.SphereGeometry(2, 8, 8);
        const jointMaterial = new THREE.MeshBasicMaterial({ color: 0xff6b6b });
        
        skeleton.joints.forEach((joint) => {
            const sphere = new THREE.Mesh(jointGeometry, jointMaterial);
            sphere.position.set(
                joint.x - centerRef.current.x,
                joint.y - centerRef.current.y,
                joint.z - centerRef.current.z
            );
            skeletonGroup.add(sphere);
        });

        // Create bones (lines)
        if (skeleton.bones.length > 0) {
            const bonePositions = new Float32Array(skeleton.bones.length * 2 * 3);
            let index = 0;
            
            skeleton.bones.forEach(([startIdx, endIdx]) => {
                const start = skeleton.joints[startIdx];
                const end = skeleton.joints[endIdx];
                
                bonePositions[index++] = start.x - centerRef.current.x;
                bonePositions[index++] = start.y - centerRef.current.y;
                bonePositions[index++] = start.z - centerRef.current.z;
                
                bonePositions[index++] = end.x - centerRef.current.x;
                bonePositions[index++] = end.y - centerRef.current.y;
                bonePositions[index++] = end.z - centerRef.current.z;
            });

            const boneGeometry = new THREE.BufferGeometry();
            boneGeometry.setAttribute('position', new THREE.BufferAttribute(bonePositions, 3));
            
            const boneMaterial = new THREE.LineBasicMaterial({
                color: 0xffd93d,
                linewidth: 2
            });
            
            const bones = new THREE.LineSegments(boneGeometry, boneMaterial);
            skeletonGroup.add(bones);
        }

        scene.add(skeletonGroup);
        skeletonRef.current = skeletonGroup;

        console.log('Viewport3D: Skeleton created', {
            joints: skeleton.joints.length,
            bones: skeleton.bones.length
        });
    }, [skeleton]);

    // Rig controls - bone manipulation
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            // Don't interfere with existing pan controls when shift/ctrl is not pressed
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
                e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                // Only handle if we have a selected bone (shift modifier for rigging)
                if (selectedBoneRef.current === null || !e.shiftKey) {
                    return; // Let pan controls handle it
                }
            }

            if (!skinnedMeshRef.current || bonesRef.current.length === 0) return;

            // Number keys 1-9 to select bones
            const boneIndex = parseInt(e.key) - 1;
            if (boneIndex >= 0 && boneIndex < bonesRef.current.length) {
                selectedBoneRef.current = boneIndex;
                console.log(`Selected bone ${boneIndex}`);
                e.preventDefault();
                return;
            }

            // Arrow keys with Shift to rotate selected bone
            if (selectedBoneRef.current !== null && e.shiftKey) {
                const bone = bonesRef.current[selectedBoneRef.current];
                const rotationSpeed = 0.1;

                switch (e.key) {
                    case 'ArrowUp':
                        bone.rotation.x += rotationSpeed;
                        e.preventDefault();
                        break;
                    case 'ArrowDown':
                        bone.rotation.x -= rotationSpeed;
                        e.preventDefault();
                        break;
                    case 'ArrowLeft':
                        bone.rotation.z += rotationSpeed;
                        e.preventDefault();
                        break;
                    case 'ArrowRight':
                        bone.rotation.z -= rotationSpeed;
                        e.preventDefault();
                        break;
                }
            }

            // Q/E to rotate Y axis
            if (selectedBoneRef.current !== null) {
                const bone = bonesRef.current[selectedBoneRef.current];
                const rotationSpeed = 0.1;

                switch (e.key) {
                    case 'q':
                    case 'Q':
                        bone.rotation.y += rotationSpeed;
                        e.preventDefault();
                        break;
                    case 'e':
                    case 'E':
                        bone.rotation.y -= rotationSpeed;
                        e.preventDefault();
                        break;
                    case 'r':
                    case 'R':
                        // Reset bone rotation
                        bone.rotation.set(0, 0, 0);
                        e.preventDefault();
                        break;
                }

                // Update skeleton if any rotation happened
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'q', 'Q', 'e', 'E', 'r', 'R'].includes(e.key)) {
                    if (skeletonObjRef.current) {
                        skeletonObjRef.current.update();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, []);

    return (
        <div className="w-full h-full relative">
            <div ref={containerRef} className="w-full h-full" />
            {!mesh && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500 pointer-events-none">
                    Draw a path to see 3D mesh
                </div>
            )}
            {mesh && (
                <div className="absolute bottom-2 left-2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none bg-black/30 px-2 py-1 rounded space-y-1">
                    <div>WASD / Arrow keys to pan • Mouse to orbit</div>
                    {bonesRef.current.length > 0 && (
                        <div className="border-t border-gray-600 pt-1 mt-1">
                            <div className="font-semibold">Rig Controls:</div>
                            <div>1-9: Select bone</div>
                            <div>Shift+↑↓←→: Rotate bone (X/Z)</div>
                            <div>Q/E: Rotate bone (Y)</div>
                            <div>R: Reset bone rotation</div>
                            {selectedBoneRef.current !== null && (
                                <div className="text-yellow-400">Selected: Bone {selectedBoneRef.current}</div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}



