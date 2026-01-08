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
    showSkeleton?: boolean;
}

export default function Viewport3D({ mesh, mesh2d, skeleton, skinWeights, showSkeleton = false }: Viewport3DProps) {
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
    const jointSpheresRef = useRef<THREE.Mesh[]>([]);
    const raycasterRef = useRef<THREE.Raycaster | null>(null);
    const selectedJointRef = useRef<number | null>(null);
    const isDraggingRef = useRef<boolean>(false);
    const dragStartRef = useRef<THREE.Vector3 | null>(null);
    const originalJointPositionsRef = useRef<THREE.Vector3[]>([]);
    const originalMeshPositionsRef = useRef<Float32Array | null>(null);

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
            100000  // Much larger far plane
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

        // Raycaster for joint selection
        const raycaster = new THREE.Raycaster();
        raycasterRef.current = raycaster;

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
        
        // Reset original positions when mesh changes
        originalJointPositionsRef.current = [];
        originalMeshPositionsRef.current = null;

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
        jointSpheresRef.current = [];

        if (!skeleton || skeleton.joints.length === 0) {
            return;
        }

        // Create skeleton group
        const skeletonGroup = new THREE.Group();

        // Create joints (spheres) - make them larger and more visible
        const jointGeometry = new THREE.SphereGeometry(5, 16, 16);
        const jointMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff6b6b,
            depthTest: false, // Render on top
            depthWrite: false
        });
        
        const jointSpheres: THREE.Mesh[] = [];
        skeleton.joints.forEach((joint, index) => {
            const sphere = new THREE.Mesh(jointGeometry, jointMaterial.clone());
            sphere.position.set(
                joint.x - centerRef.current.x,
                joint.y - centerRef.current.y,
                joint.z - centerRef.current.z
            );
            sphere.userData.jointIndex = index;
            sphere.renderOrder = 1000; // Render on top
            skeletonGroup.add(sphere);
            jointSpheres.push(sphere);
        });
        jointSpheresRef.current = jointSpheres;

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
                linewidth: 3,
                depthTest: false, // Render on top
                depthWrite: false
            });
            
            const bones = new THREE.LineSegments(boneGeometry, boneMaterial);
            bones.renderOrder = 999; // Render on top
            skeletonGroup.add(bones);
        }

        // Set visibility based on showSkeleton prop
        skeletonGroup.visible = showSkeleton;
        scene.add(skeletonGroup);
        skeletonRef.current = skeletonGroup;

        console.log('Viewport3D: Skeleton created', {
            joints: skeleton.joints.length,
            bones: skeleton.bones.length,
            visible: showSkeleton
        });
    }, [skeleton, showSkeleton]);

    // Reset original positions when skeleton visibility changes
    useEffect(() => {
        if (showSkeleton && skeleton && skinnedMeshRef.current) {
            // Store original joint positions
            originalJointPositionsRef.current = [];
            skeleton.joints.forEach((joint) => {
                originalJointPositionsRef.current.push(new THREE.Vector3(
                    joint.x - centerRef.current.x,
                    joint.y - centerRef.current.y,
                    joint.z - centerRef.current.z
                ));
            });

            // Store original mesh positions
            if (skinnedMeshRef.current) {
                const geometry = skinnedMeshRef.current.geometry;
                const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
                originalMeshPositionsRef.current = new Float32Array(positionAttribute.array);
            }
        } else {
            // Reset when skeleton is hidden
            originalJointPositionsRef.current = [];
            originalMeshPositionsRef.current = null;
        }
    }, [showSkeleton, skeleton]);

    // Joint selection and dragging
    useEffect(() => {
        if (!containerRef.current || !rendererRef.current || !cameraRef.current || !sceneRef.current) return;
        if (!showSkeleton || !skeleton || !skinWeights || !skinnedMeshRef.current) return;

        const container = containerRef.current;
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        const scene = sceneRef.current;
        const raycaster = raycasterRef.current;
        if (!raycaster) return;

        const updateMeshVertices = (jointIndex: number, newPosition: THREE.Vector3) => {
            if (!skeleton || !skinWeights || !skinnedMeshRef.current || !originalMeshPositionsRef.current) {
                console.log('updateMeshVertices: Missing dependencies', {
                    hasSkeleton: !!skeleton,
                    hasSkinWeights: !!skinWeights,
                    hasSkinnedMesh: !!skinnedMeshRef.current,
                    hasOriginalPositions: !!originalMeshPositionsRef.current
                });
                return;
            }
            if (originalJointPositionsRef.current.length === 0) {
                console.log('updateMeshVertices: No original joint positions');
                return;
            }

            const skinnedMesh = skinnedMeshRef.current;
            const geometry = skinnedMesh.geometry;
            const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
            const positions = positionAttribute.array as Float32Array;
            const originalPositions = originalMeshPositionsRef.current;

            // Get original joint position
            const originalJointPos = originalJointPositionsRef.current[jointIndex];
            if (!originalJointPos) {
                console.log('updateMeshVertices: No original position for joint', jointIndex);
                return;
            }

            // Calculate displacement
            const displacement = newPosition.clone().sub(originalJointPos);
            console.log('updateMeshVertices: Joint', jointIndex, 'displacement:', displacement);

            // Find all bones connected to this joint
            const connectedBoneIndices: number[] = [];
            skeleton.bones.forEach(([startIdx, endIdx], boneIdx) => {
                if (startIdx === jointIndex || endIdx === jointIndex) {
                    connectedBoneIndices.push(boneIdx);
                }
            });

            console.log('updateMeshVertices: Connected bones:', connectedBoneIndices);

            if (connectedBoneIndices.length === 0) {
                console.log('updateMeshVertices: No connected bones for joint', jointIndex);
                return;
            }

            // Reset to original positions first
            for (let i = 0; i < positions.length; i++) {
                positions[i] = originalPositions[i];
            }

            let verticesUpdated = 0;
            // Update vertices based on skin weights for bones connected to this joint
            for (let i = 0; i < positions.length / 3; i++) {
                const vertexBoneIndices = skinWeights.indices[i] || [];
                const vertexBoneWeights = skinWeights.weights[i] || [];

                // Calculate total weight for this vertex from all connected bones
                let totalWeight = 0;
                let totalWeightedDisplacement = new THREE.Vector3(0, 0, 0);

                for (let k = 0; k < vertexBoneIndices.length; k++) {
                    const boneIdx = vertexBoneIndices[k];
                    if (connectedBoneIndices.includes(boneIdx)) {
                        const weight = vertexBoneWeights[k];
                        totalWeight += weight;
                        totalWeightedDisplacement.add(displacement.clone().multiplyScalar(weight));
                    }
                }

                // Apply the weighted displacement
                if (totalWeight > 0) {
                    positions[i * 3] += totalWeightedDisplacement.x;
                    positions[i * 3 + 1] += totalWeightedDisplacement.y;
                    positions[i * 3 + 2] += totalWeightedDisplacement.z;
                    verticesUpdated++;
                }
            }

            console.log('updateMeshVertices: Updated', verticesUpdated, 'vertices');

            positionAttribute.needsUpdate = true;
            // Force update of the buffer
            positionAttribute.updateRange = { offset: 0, count: positions.length };
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            
            // Force renderer to update
            if (rendererRef.current) {
                rendererRef.current.render(sceneRef.current!, cameraRef.current!);
            }
        };

        const getMousePosition = (event: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            return {
                x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
                y: -((event.clientY - rect.top) / rect.height) * 2 + 1
            };
        };

        const intersectJoint = (mouse: { x: number; y: number }): number | null => {
            raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), camera);
            const intersects = raycaster.intersectObjects(jointSpheresRef.current, false);
            
            if (intersects.length > 0) {
                const intersected = intersects[0].object as THREE.Mesh;
                return intersected.userData.jointIndex as number;
            }
            return null;
        };

        const projectToPlane = (point: THREE.Vector3, planeNormal: THREE.Vector3, planePoint: THREE.Vector3): THREE.Vector3 => {
            const d = point.clone().sub(planePoint);
            const distance = d.dot(planeNormal);
            return point.clone().sub(planeNormal.clone().multiplyScalar(distance));
        };

        const handleMouseDown = (event: MouseEvent) => {
            if (!showSkeleton || !controlsRef.current || !skeleton || !skinnedMeshRef.current) return;
            
            const mouse = getMousePosition(event);
            const jointIndex = intersectJoint(mouse);
            
            if (jointIndex !== null) {
                selectedJointRef.current = jointIndex;
                isDraggingRef.current = true;
                
                // Store initial joint position
                dragStartRef.current = originalJointPositionsRef.current[jointIndex].clone();
                
                // Disable automatic skinning so we can manually control vertex positions
                if (skinnedMeshRef.current.material instanceof THREE.Material) {
                    (skinnedMeshRef.current.material as any).skinning = false;
                }
                
                // Disable orbit controls while dragging
                controlsRef.current.enabled = false;
                
                // Highlight selected joint
                if (jointSpheresRef.current[jointIndex]) {
                    (jointSpheresRef.current[jointIndex].material as THREE.MeshBasicMaterial).color.setHex(0x00ff00);
                }
                
                event.preventDefault();
            }
        };

        const handleMouseMove = (event: MouseEvent) => {
            if (!isDraggingRef.current || selectedJointRef.current === null || !camera || !skeleton) return;

            const mouse = getMousePosition(event);
            raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), camera);

            // Get camera direction (normal to the plane)
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);

            // Create a plane orthogonal to camera direction at the joint's original depth
            const planePoint = dragStartRef.current!.clone();
            
            // Project mouse ray onto the plane
            const ray = raycaster.ray;
            const t = planePoint.clone().sub(ray.origin).dot(cameraDirection) / ray.direction.dot(cameraDirection);
            const newPosition = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));

            // Update joint position
            const jointIndex = selectedJointRef.current;
            const jointSphere = jointSpheresRef.current[jointIndex];
            if (jointSphere) {
                jointSphere.position.copy(newPosition);
                
                // Update bone positions
                if (skeletonRef.current) {
                    const boneLines = skeletonRef.current.children.find(
                        child => child instanceof THREE.LineSegments
                    ) as THREE.LineSegments | undefined;
                    
                    if (boneLines) {
                        const positions = (boneLines.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
                        
                        skeleton.bones.forEach(([startIdx, endIdx], boneIdx) => {
                            const startPos = startIdx === jointIndex ? 
                                newPosition :
                                (originalJointPositionsRef.current[startIdx] || new THREE.Vector3(
                                    skeleton.joints[startIdx].x - centerRef.current.x,
                                    skeleton.joints[startIdx].y - centerRef.current.y,
                                    skeleton.joints[startIdx].z - centerRef.current.z
                                ));
                            
                            const endPos = endIdx === jointIndex ?
                                newPosition :
                                (originalJointPositionsRef.current[endIdx] || new THREE.Vector3(
                                    skeleton.joints[endIdx].x - centerRef.current.x,
                                    skeleton.joints[endIdx].y - centerRef.current.y,
                                    skeleton.joints[endIdx].z - centerRef.current.z
                                ));
                            
                            const idx = boneIdx * 6;
                            positions[idx] = startPos.x;
                            positions[idx + 1] = startPos.y;
                            positions[idx + 2] = startPos.z;
                            positions[idx + 3] = endPos.x;
                            positions[idx + 4] = endPos.y;
                            positions[idx + 5] = endPos.z;
                        });
                        
                        boneLines.geometry.getAttribute('position').needsUpdate = true;
                    }
                }
                
                // Update mesh vertices
                updateMeshVertices(jointIndex, newPosition);
            }
        };

        const handleMouseUp = () => {
            if (isDraggingRef.current && selectedJointRef.current !== null) {
                // Update original joint position for future edits
                const jointSphere = jointSpheresRef.current[selectedJointRef.current];
                if (jointSphere && originalJointPositionsRef.current[selectedJointRef.current]) {
                    originalJointPositionsRef.current[selectedJointRef.current].copy(jointSphere.position);
                }

                // Update skeleton data with new joint position
                if (skeleton && selectedJointRef.current !== null) {
                    const jointSphere = jointSpheresRef.current[selectedJointRef.current];
                    if (jointSphere) {
                        const newPos = jointSphere.position.clone().add(centerRef.current);
                        // Update the joint in skeleton (assuming it's mutable or we need to update parent state)
                        const joint = skeleton.joints[selectedJointRef.current];
                        if (joint && typeof joint === 'object' && 'x' in joint) {
                            joint.x = newPos.x;
                            joint.y = newPos.y;
                            joint.z = newPos.z;
                        }
                    }
                }

                // Update original mesh positions to current state
                if (skinnedMeshRef.current && originalMeshPositionsRef.current) {
                    const geometry = skinnedMeshRef.current.geometry;
                    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
                    originalMeshPositionsRef.current.set(positionAttribute.array as Float32Array);
                }
                
                // Reset joint color
                if (selectedJointRef.current !== null && jointSpheresRef.current[selectedJointRef.current]) {
                    (jointSpheresRef.current[selectedJointRef.current].material as THREE.MeshBasicMaterial).color.setHex(0xff6b6b);
                }
            }
            
            isDraggingRef.current = false;
            selectedJointRef.current = null;
            dragStartRef.current = null;
            
            if (controlsRef.current) {
                controlsRef.current.enabled = true;
            }
        };

        container.addEventListener('mousedown', handleMouseDown);
        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('mouseup', handleMouseUp);
        container.addEventListener('mouseleave', handleMouseUp);

        return () => {
            container.removeEventListener('mousedown', handleMouseDown);
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('mouseup', handleMouseUp);
            container.removeEventListener('mouseleave', handleMouseUp);
        };
    }, [showSkeleton, skeleton, skinWeights]);

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



