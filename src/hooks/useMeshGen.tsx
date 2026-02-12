'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MeshGen } from '@/core/meshgen';
import { Vec2, Vec3 } from '@/interface';
import * as geo3d from '@/utils/geo3d';

export interface MeshGenState {
    currentStep: number;
    mesh2D: [Vec2[], number[][]] | null;
    mesh3D: [Vec3[], number[][]] | null;
    chordData: [Vec3[], Vec3[], number[]] | null;
    capOffset: number;
    junctionOffset: number;
    skeleton: [Vec3[], [number, number][]] | null;
}

export interface MeshGenParams {
    isodistance: number;
    branchMinLength: number;
    laplacianIterations: number;
    laplacianAlpha: number;
    smoothFactor: number;
    isometricIterations: number;
    isometricLength: number;
    isometricLengthAuto: boolean;
    boneDevThreshold: number;
    boneLenThreshold: number;
    skelAlgo: 'chord' | 'mat';
}

export function useMeshGen(onMeshComplete?: (mesh: [Vec3[], number[][]]) => void) {
    const [latestPath, setLatestPath] = useState<Vec2[] | null>(null);
    const [currentStep, setCurrentStep] = useState<number>(0);
    
    const [isodistance, setIsodistance] = useState<number>(10);
    const [branchMinLength, setBranchMinLength] = useState<number>(5);
    const [mesh2D, setMesh2D] = useState<[Vec2[], number[][]] | null>(null);
    const [mesh3D, setMesh3D] = useState<[Vec3[], number[][]] | null>(null);
    
    const [laplacianIterations, setLaplacianIterations] = useState<number>(50);
    const [laplacianAlpha, setLaplacianAlpha] = useState<number>(0.5);
    const [chordData, setChordData] = useState<[Vec3[], Vec3[], number[]] | null>(null);
    
    const [init3, setInit3] = useState<boolean>(false);
    const [smoothFactor, setSmoothFactor] = useState<number>(0.1);
    const [capOffset, setCapOffset] = useState<number>(0);
    const [junctionOffset, setJunctionOffset] = useState<number>(0);
    
    const [init4, setInit4] = useState<boolean>(false);
    const [isometricIterations, setIsometricIterations] = useState<number>(6);
    const [isometricLength, setIsometricLength] = useState<number>(5);
    const [isometricLengthAuto, setIsometricLengthAuto] = useState<boolean>(true);
    const [V_mock3, setV_mock3] = useState<Vec3[]>([]);
    const [F_mock3, setF_mock3] = useState<number[][]>([]);
    const [V_mock4, setV_mock4] = useState<Vec3[]>([]);
    const [F_mock4, setF_mock4] = useState<number[][]>([]);

    const [skeleton, setSkeleton] = useState<[Vec3[], [number, number][]] | null>(null);
    const [boneDevThreshold, setBoneDevThreshold] = useState<number>(0.1);
    const [boneLenThreshold, setBoneLenThreshold] = useState<number>(5);
    const [skelAlgo, setSkelAlgo] = useState<'chord' | 'mat'>('chord');
  
    const meshGenRef = useRef<MeshGen | null>(null);

    const processStep1 = useCallback((path: Vec2[]) => {
        const meshGen = new MeshGen(path, isodistance, branchMinLength);
        meshGenRef.current = meshGen;
        const mesh2DData = meshGen.getMesh2D() as [Vec2[], number[][]];
        setMesh2D(mesh2DData);
    }, [isodistance, branchMinLength]);

    const processStep2 = useCallback(() => {
        if (!meshGenRef.current) return;

        const meshGen = meshGenRef.current;
        meshGen.runChordSmoothing(laplacianIterations, laplacianAlpha);
        const chords = meshGen.getChords() as [Vec3[], Vec3[], number[]];
        setChordData(chords);
        setInit3(false);
    }, [laplacianIterations, laplacianAlpha]);

    const preprocessStep3 = useCallback(() => {
        if (!meshGenRef.current) return;

        const meshGen = meshGenRef.current;
        meshGen.generatePipes();    setCapOffset(meshGen.faceCount());
        meshGen.stitchCaps();       setJunctionOffset(meshGen.faceCount());
        meshGen.stitchJunctions();

        const mesh3DData = meshGen.getMesh3D() as [Vec3[], number[][]];
        setInit3(true);
        setMesh3D(mesh3DData);
        setV_mock3(mesh3DData[0].map(v => new Vec3(v.x, v.y, v.z)));
        setF_mock3(mesh3DData[1].map(f => [...f]));
    }, []);
    
    const processStep3 = useCallback(() => {
        const V = V_mock3.map(v => new Vec3(v.x, v.y, v.z));
        const F = F_mock3.map(f => [...f]);
        if (!meshGenRef.current) return;
        meshGenRef.current.runMeshSmoothing(V, F, smoothFactor);
        setMesh3D([V, F]);
        setInit4(false);
    }, [smoothFactor, V_mock3, F_mock3]);

    const preprocessStep4 = useCallback(() => {
        if (!mesh3D) return;
        setV_mock4(mesh3D[0].map(v => new Vec3(v.x, v.y, v.z)));
        setF_mock4(mesh3D[1].map(f => [...f]));
        setInit4(true);
    }, [mesh3D]);
    
    const processStep4 = useCallback(() => {
        const V = V_mock4.map(v => new Vec3(v.x, v.y, v.z));
        const F = F_mock4.map(f => [...f]);

        const length = isometricLengthAuto ? -1 : isometricLength;
        geo3d.runIsometricRemesh(V, F, isometricIterations, length);
        setMesh3D([V, F]);
    }, [isometricIterations, isometricLength, isometricLengthAuto, V_mock4, F_mock4]);
    
    const processStep5 = useCallback(() => {
        if (!meshGenRef.current) return;

        setSkeleton(meshGenRef.current.generateSkeleton(
            boneDevThreshold,
            boneLenThreshold,
            skelAlgo) as [Vec3[], [number, number][]]
        );
    }, [boneDevThreshold, boneLenThreshold, skelAlgo]);
    
    const handlePathComplete = useCallback((path: Vec2[]) => {
        setLatestPath(path);
        setCurrentStep(1);
        processStep1(path);
    }, [processStep1]);

    const handleNext = useCallback(() => {
        setCurrentStep(prev => prev + 1);
    }, []);

    const handleBack = useCallback(() => {
        setCurrentStep(prev => Math.max(1, prev - 1));
    }, []);

    const handleReset = useCallback(() => {
        setCurrentStep(0);
        setLatestPath(null);
        setMesh2D(null);
        setMesh3D(null);
        setChordData(null);
        setSkeleton(null);
    }, []);

    useEffect(() => {
        if (!latestPath) return;
        
        if (currentStep === 3 && !init3)    preprocessStep3();
        if (currentStep === 4 && !init4)    preprocessStep4();
    }, [currentStep, latestPath, init3, init4, preprocessStep3, preprocessStep4]);

    // Process steps when currentStep changes
    useEffect(() => {
        if (!latestPath) return;

        if (currentStep === 1) processStep1(latestPath);
        if (currentStep === 2) processStep2();
        if (currentStep === 3 && init3) processStep3();
        if (currentStep === 4 && init4) processStep4();
        if (currentStep === 5) processStep5();
    }, [currentStep, latestPath,
        processStep1,
        processStep2,
        processStep3, init3,
        processStep4, init4,
        processStep5,
    ]);
    
    useEffect(() => {
        if (currentStep > 5 && mesh3D && onMeshComplete) {
            onMeshComplete(mesh3D);
            handleReset();
        }
    }, [currentStep, mesh3D, onMeshComplete]);

    const state: MeshGenState = {
        currentStep,
        mesh2D,
        mesh3D,
        chordData,
        capOffset,
        junctionOffset,
        skeleton,
    };

    const params: MeshGenParams = {
        isodistance,
        branchMinLength,
        laplacianIterations,
        laplacianAlpha,
        smoothFactor,
        isometricIterations,
        isometricLength,
        isometricLengthAuto,
        boneDevThreshold,
        boneLenThreshold,
        skelAlgo,
    };

    return {
        state,
        params,
        onPathComplete: handlePathComplete,
        onNext: handleNext,
        onBack: handleBack,
        onReset: handleReset,
        onParamChange: {
            setIsodistance,
            setBranchMinLength,
            setLaplacianIterations,
            setLaplacianAlpha,
            setSmoothFactor,
            setIsometricIterations,
            setIsometricLength,
            setIsometricLengthAuto,
            setBoneDevThreshold,
            setBoneLenThreshold,
            setSkelAlgo,
        },
    };
}
