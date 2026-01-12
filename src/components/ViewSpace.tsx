'use client';

import { useRef, useEffect } from 'react';
import { useViewSpace, ViewSpaceReturn } from '@/hooks/useViewSpace';
export type { ViewSpaceReturn };

export interface ViewSpaceProps {
    onViewSpaceReady?: (refs: ViewSpaceReturn) => void;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * ViewSpace component that creates a 3D view space using the useViewSpace hook
 * 
 * This component provides a reusable 3D viewport with scene, camera, renderer, and controls.
 * Parent components can add objects to the scene via the onViewSpaceReady callback.
 * 
 * @example
 * ```tsx
 * <ViewSpace
 *   onViewSpaceReady={({ sceneRef, cameraRef }) => {
 *     // Add objects to the scene
 *     if (sceneRef.current) {
 *       const cube = new THREE.Mesh(geometry, material);
 *       sceneRef.current.add(cube);
 *     }
 *   }}
 * />
 * ```
 */
export default function ViewSpace({ 
    onViewSpaceReady, 
    className = 'w-full h-full',
    style 
}: ViewSpaceProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewSpaceRefs = useViewSpace(containerRef);

    useEffect(() => {
        if (onViewSpaceReady && viewSpaceRefs.sceneRef.current)
            onViewSpaceReady(viewSpaceRefs);
    }, [onViewSpaceReady, viewSpaceRefs]);

    return <div ref={containerRef} className={className} style={style}/>;
}
