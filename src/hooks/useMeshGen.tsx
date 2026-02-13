'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MeshGen } from '@/core/meshgen';
import { Vec2, Vec3 } from '@/interface';
import { computeSkinWeightsGlobal } from '@/core/skin';
import { skinnedMeshFromData } from '@/utils/threeMesh';
import * as geo3d from '@/utils/geo3d';
import * as THREE from 'three';
import * as metrics from '@/utils/metrics';

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
    laplacianIters: number;
    laplacianAlpha: number;
    smoothFactor: number;
    isometricIterations: number;
    isometricLength: number;
    boneDevThreshold: number;
    boneLenThreshold: number;
    bonePruningThreshold: number;
}

export function useMeshGen(onComplete?: (mesh: THREE.SkinnedMesh) => void) {
    const [latestPath, setLatestPath] = useState<Vec2[] | null>(null);
    const [currentStep, setCurrentStep] = useState<number>(0);
    
    const [isodistance, setIsodistance] = useState<number>(10);
    const [mesh2D, setMesh2D] = useState<[Vec2[], number[][]] | null>(null);
    const [mesh3D, setMesh3D] = useState<[Vec3[], number[][]] | null>(null);
    
    const [laplacianIters, setLaplacianIters] = useState<number>(50);
    const [laplacianAlpha, setLaplacianAlpha] = useState<number>(0.5);
    const [chordData, setChordData] = useState<[Vec3[], Vec3[], number[]] | null>(null);
    
    const [init3, setInit3] = useState<boolean>(false);
    const [smoothFactor, setSmoothFactor] = useState<number>(0.1);
    const [capOffset, setCapOffset] = useState<number>(0);
    const [junctionOffset, setJunctionOffset] = useState<number>(0);
    
    const [init4, setInit4] = useState<boolean>(false);
    const [isometricIterations, setIsometricIterations] = useState<number>(6);
    const [isometricLength, setIsometricLength] = useState<number>(5);
    const [V_mock3, setV_mock3] = useState<Vec3[]>([]);
    const [F_mock3, setF_mock3] = useState<number[][]>([]);
    const [V_mock4, setV_mock4] = useState<Vec3[]>([]);
    const [F_mock4, setF_mock4] = useState<number[][]>([]);

    const [skeleton, setSkeleton] = useState<[Vec3[], [number, number][]] | null>(null);
    const [boneDevThreshold, setBoneDevThreshold] = useState<number>(0.1);
    const [boneLenThreshold, setBoneLenThreshold] = useState<number>(5);
    const [bonePruningThreshold, setBonePruningThreshold] = useState<number>(5);
  
    const meshGenRef = useRef<MeshGen | null>(null);

    const findBoundary = (V: Vec2[], F: number[][]) => {
        const n = V.length;
        const adjList = new Array(n).fill(0).map(() => new Set<number>());

        for (let [i0, i1, i2] of F) {
            adjList[i0].add(i1);   adjList[i1].add(i0);
            adjList[i0].add(i2);   adjList[i2].add(i0);
            adjList[i1].add(i2);   adjList[i2].add(i1);
        }
        const boundary = [0];
        
        for (let i = 1; i < n; i++)
            if (V[boundary[0]].x > V[i].x)
                boundary[0] = i;
        
        let prev = new Vec2(
            V[boundary[0]].x,
            V[boundary[0]].y + 1
        );
        while (true) {
            const currIdx = boundary[boundary.length - 1];
            const curr = V[currIdx];

            let minAngle = Infinity;
            let minIdx = -1;

            for (const i of adjList[currIdx]) {
                const next = V[i];

                const e0 = curr.minus(prev).unit();
                const e1 = next.minus(curr).unit();
                const sinTheta = e0.cross(e1);
                const cosTheta = e0.dot(e1);
                const angle = Math.atan2(sinTheta, cosTheta);

                if (minAngle > angle) {
                    minAngle = angle;
                    minIdx = i;
                }
            }
            if (minIdx === boundary[0])
                break;
            prev = curr;
            boundary.push(minIdx);
        }
        return boundary.map(i => V[i]);
    };

    const processStep1 = useCallback((path: Vec2[]) => {
        const meshGen = new MeshGen(path, isodistance);
        meshGenRef.current = meshGen;
        const mesh2DData = meshGen.getMesh2D() as [Vec2[], number[][]];

        // console.log("[useMeshGen] Step 1: isodistance =", isodistance);
        // console.log("[useMeshGen] IoU =", metrics.iou2DSilhouettes(mesh2DData[0], path));
        setMesh2D(mesh2DData);
        setIsometricLength(Math.max(5, isodistance));
    }, [isodistance]);

    const processStep2 = useCallback(() => {
        if (!meshGenRef.current) return;

        const meshGen = meshGenRef.current;
        meshGen.runChordSmoothing(laplacianIters, laplacianAlpha);
        const chords = meshGen.getChords() as [Vec3[], Vec3[], number[]];
        setChordData(chords);
        setInit3(false);
    }, [laplacianIters, laplacianAlpha]);

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

        // const boundary = findBoundary(V.map(v => new Vec2(v.x, v.y)), F);
        // console.log("[useMeshGen] Step 3: smoothFactor =", smoothFactor);
        // console.log("[useMeshGen] Lap =", metrics.laplacian(V, F));
        // console.log("[useMeshGen] IoU =", metrics.iou2DSilhouettes(boundary, latestPath));
        setInit3(true);
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

        const length = isometricLength <= 5 ? -1 : isometricLength;
        geo3d.runIsometricRemesh(V, F, isometricIterations, length);

        // const boundary = findBoundary(V.map(v => new Vec2(v.x, v.y)), F);
        // console.log("[useMeshGen] Step 4: isometricIterations =", isometricIterations, "isometricLength =", isometricLength);
        // console.log("[useMeshGen] Lap =", metrics.laplacian(V, F));
        // console.log("[useMeshGen] IoU =", metrics.iou2DSilhouettes(boundary, latestPath));
        setMesh3D([V, F]);
    }, [isometricIterations, isometricLength, V_mock4, F_mock4]);
    
    const processStep5 = useCallback(() => {
        if (!meshGenRef.current) return;

        setSkeleton(meshGenRef.current.generateSkeleton(
            boneDevThreshold,
            boneLenThreshold,
            bonePruningThreshold
        ) as [Vec3[], [number, number][]]
        );
    }, [boneDevThreshold, boneLenThreshold, bonePruningThreshold]);
    
    const handlePathComplete = useCallback((path: Vec2[]) => {
        const centroid = path.reduce((acc, p) => acc.plus(p), new Vec2(0, 0)).over(path.length);
        path = path.map(p => p.minus(centroid));
        path = path.map(p => new Vec2(p.x, -p.y));

        setLatestPath(path);
        setCurrentStep(1);
    }, []);

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
        if (currentStep > 5) {
            if (onComplete && mesh3D && skeleton) {
                const skinWeights = computeSkinWeightsGlobal(mesh3D, skeleton);
                const mesh = skinnedMeshFromData({
                    mesh: mesh3D,
                    skel: skeleton,
                    skinWeights,
                    skinIndices: null,
                });
                onComplete(mesh);
            }
            handleReset();
        }
    }, [currentStep, mesh3D, skeleton, onComplete]);

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
        laplacianIters,
        laplacianAlpha,
        smoothFactor,
        isometricIterations,
        isometricLength,
        boneDevThreshold,
        boneLenThreshold,
        bonePruningThreshold,
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
            setLaplacianIters,
            setLaplacianAlpha,
            setSmoothFactor,
            setIsometricIterations,
            setIsometricLength,
            setBoneDevThreshold,
            setBoneLenThreshold,
            setBonePruningThreshold,
        },
    };
}