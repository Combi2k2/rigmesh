'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Canvas from '../components/canvas';
import Viewport3D from '../components/viewport3d';
import MeshGenFlow from '../components/meshgenUI/MeshGenFlow';
import { MeshGen } from '../core/meshgen';
import { Point } from '../interface';
import Vector from '@/lib/linalg/vector';
import * as geo3d from '../utils/geo3d';

export default function RigMeshPage() {
    const [latestPath, setLatestPath] = useState<Point[] | null>(null);
    const [currentStep, setCurrentStep] = useState<number>(1);
    
    // Step 1: Generate + Prune Triangulation
    const [isodistance, setIsodistance] = useState<number>(10);
    const [branchMinLength, setBranchMinLength] = useState<number>(5);
    const [polygon, setPolygon] = useState<Point[] | null>(null);
    const [mesh2D, setMesh2D] = useState<[Point[], number[][]] | null>(null);
    const [mesh3D, setMesh3D] = useState<[Vector[], number[][]] | null>(null);
    
    // Step 2: Chord Smoothing
    const [laplacianIterations, setLaplacianIterations] = useState<number>(50);
    const [laplacianAlpha, setLaplacianAlpha] = useState<number>(0.5);
    const [chordData, setChordData] = useState<[Vector[], Vector[], number[]] | null>(null);
    
    // Step 3: Surface Generation
    const [init3, setInit3] = useState<boolean>(false);
    const [smoothFactor, setSmoothFactor] = useState<number>(0.1);
    const [capOffset, setCapOffset] = useState<number>(0);
    const [junctionOffset, setJunctionOffset] = useState<number>(0);
    
    // Step 4: Isometric Remeshing
    const [init4, setInit4] = useState<boolean>(false);
    const [isometricIterations, setIsometricIterations] = useState<number>(6);
    const [isometricLength, setIsometricLength] = useState<number>(0);
    const [isometricLengthAuto, setIsometricLengthAuto] = useState<boolean>(true);
    const [V_clone, setV_clone] = useState<Vector[]>([]);
    const [F_clone, setF_clone] = useState<number[][]>([]);
  
    const meshGenRef = useRef<MeshGen | null>(null);

    // Step 1: Generate + Prune Triangulation
    const processStep1 = useCallback((path: Point[]) => {
        const meshGen = new MeshGen(path, isodistance, branchMinLength);
        meshGenRef.current = meshGen;
        const mesh2DData = meshGen.getMesh2D() as [Point[], number[][]];
        setMesh2D(mesh2DData);
        setPolygon(mesh2DData[0]);
    }, [isodistance, branchMinLength]);

    // Step 2: Chord Smoothing
    const processStep2 = useCallback(() => {
        if (!meshGenRef.current) return;

        const meshGen = meshGenRef.current;
        meshGen.runChordSmoothing(laplacianIterations, laplacianAlpha);
        const chords = meshGen.getChords() as [Vector[], Vector[], number[]];
        setChordData(chords);
    }, [laplacianIterations, laplacianAlpha]);

    const preprocessStep3 = useCallback(() => {
        if (!meshGenRef.current) return;

        const meshGen = meshGenRef.current;
        meshGen.generatePipes();    setCapOffset(meshGen.faceCount());
        meshGen.stitchCaps();       setJunctionOffset(meshGen.faceCount());
        meshGen.stitchJunctions();

        const mesh3DData = meshGen.getMesh3D() as [Vector[], number[][]];
        setInit3(true);
        setMesh3D(mesh3DData);
        // Deep copy: create new Vector objects to avoid reference issues
        setV_clone(mesh3DData[0].map(v => new Vector(v.x, v.y, v.z)));
        setF_clone(mesh3DData[1].map(f => [...f]));
    }, []);
    
    const processStep3 = useCallback(() => {
        // Deep copy: create new Vector objects to avoid modifying V_clone
        const V = V_clone.map(v => new Vector(v.x, v.y, v.z));
        const F = F_clone.map(f => [...f]);
        if (!meshGenRef.current) return;
        meshGenRef.current.runMeshSmoothing(V, F, smoothFactor);
        setMesh3D([V, F]);
    }, [smoothFactor, V_clone, F_clone]);

    // Step 4: Isometric Remeshing
    const preprocessStep4 = useCallback(() => {
        if (!mesh3D) return;
        // Deep copy: create new Vector objects to avoid reference issues
        setV_clone(mesh3D[0].map(v => new Vector(v.x, v.y, v.z)));
        setF_clone(mesh3D[1].map(f => [...f]));
        setInit4(true);
    }, [mesh3D]);
    
    const processStep4 = useCallback(() => {
        let V = [...V_clone];
        let F = [...F_clone];
        
        const length = isometricLengthAuto ? -1 : isometricLength;
        geo3d.runIsometricRemesh(V, F, isometricIterations, length);
        
        setMesh3D([V, F]);
    }, [isometricIterations, isometricLength, isometricLengthAuto, V_clone, F_clone]);

    // Handle path completion - start Step 1
    const handlePathComplete = useCallback((path: Point[]) => {
        setLatestPath(path);
        setCurrentStep(1);
        processStep1(path);
    }, [processStep1]);

    // Handle step changes - preprocessing only
    useEffect(() => {
        if (!latestPath) return;
        
        if (currentStep === 1) {
            processStep1(latestPath);
        } else if (currentStep === 2) {
            processStep2();
        } else if (currentStep === 3 && !init3) {
            preprocessStep3();
        } else if (currentStep === 4 && !init4) {
            preprocessStep4();
        }
    }, [currentStep,
        processStep1, latestPath, isodistance, branchMinLength,
        processStep2, laplacianIterations, laplacianAlpha,
        preprocessStep3, init3,
        preprocessStep4, init4
    ]);

    // Handle parameter updates for step 3 (smoothFactor changes)
    useEffect(() => {
        if (currentStep === 3 && init3) {
            processStep3();
        }
        if (currentStep === 4 && init4) {
            processStep4();
        }
    }, [currentStep, V_clone, F_clone,
        processStep3, init3, smoothFactor,
        processStep4, init4, isometricIterations, isometricLength, isometricLengthAuto
    ]);
    const handleNext = () => {
        if (currentStep < 4) {
            setCurrentStep(currentStep + 1);
        }
    };

    return (
        <div className="w-full h-screen overflow-hidden flex border border-gray-300 dark:border-gray-700">
        {/* Left: 3D Edit Space (2/3 width) */}
        <div className="w-2/3 border-r border-gray-300 dark:border-gray-700 relative">
            <div className="absolute inset-0">
            <Viewport3D 
                mesh2d={currentStep === 1 ? mesh2D : null}
                mesh3d={currentStep === 3 || currentStep === 4 ? mesh3D : null}
                chordData={currentStep === 2 ? chordData : null}
                currentStep={currentStep}
                vertices2d={polygon ? polygon.map(p => ({ x: p.x, y: p.y })) : null}
                capOffset={capOffset}
                junctionOffset={junctionOffset}
            />
            </div>
        </div>

        {/* Right: Control Panel (1/3 width) */}
        <div className="w-1/3 flex flex-col bg-gray-50 dark:bg-gray-900">
            {/* Canvas Section */}
            <div className="border-b border-gray-300 dark:border-gray-700 p-2">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Canvas</div>
                    <div className="h-64 border border-gray-300 dark:border-gray-700 rounded">
                        <Canvas onPathComplete={handlePathComplete} />
                    </div>
                </div>

                {/* MeshGen Flow Component */}
                <MeshGenFlow
                    currentStep={currentStep}
                    totalSteps={4}
                    isodistance={isodistance}
                    branchMinLength={branchMinLength}
                    onIsodistanceChange={setIsodistance}
                    onBranchMinLengthChange={setBranchMinLength}
                    laplacianIterations={laplacianIterations}
                    laplacianAlpha={laplacianAlpha}
                    onLaplacianIterationsChange={setLaplacianIterations}
                    onLaplacianAlphaChange={setLaplacianAlpha}
                    smoothFactor={smoothFactor}
                    onSmoothFactorChange={setSmoothFactor}
                    isometricIterations={isometricIterations}
                    isometricLength={isometricLength}
                    isometricLengthAuto={isometricLengthAuto}
                    onIsometricIterationsChange={setIsometricIterations}
                    onIsometricLengthChange={setIsometricLength}
                    onIsometricLengthAutoChange={setIsometricLengthAuto}
                    onNext={handleNext}
                />
            </div>
        </div>
    );
}
