'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { SceneHooks } from '@/hooks/useScene';
import { MenuAction } from '@/interface';
import SceneMenu, { MenuPosition } from './SceneMenu';
import TemplateScene from '@/components/template/Scene';
import { traceMesh } from '@/utils/threeSkel';
import * as THREE from 'three';

export interface SceneProps {
    onSceneReady?: (api: SceneHooks) => void;
    onMenuAction?: (action: MenuAction, meshes: THREE.SkinnedMesh[]) => void;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Main 3D Scene component for the main viewport.
 * Uses the template Scene for the 3D view and adds context menu (SceneMenu) and menu action handling.
 */
export default function Scene({
    onSceneReady,
    onMenuAction,
    className = 'w-full h-full',
    style,
}: SceneProps) {
    const sceneApiRef = useRef<SceneHooks | null>(null);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
    const [selectedMeshes, setSelectedMeshes] = useState<THREE.SkinnedMesh[]>([]);
    const [mergeTargetMesh, setMergeTargetMesh] = useState<THREE.SkinnedMesh | null>(null);

    const handleSceneReady = useCallback(
        (api: SceneHooks) => {
            sceneApiRef.current = api;
            onSceneReady?.(api);
        },
        [onSceneReady]
    );

    const handleContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const api = sceneApiRef.current;
        if (!api) return;

        const result = api.raycast(event.clientX, event.clientY);
        const mesh = traceMesh(result);

        if (mesh) {
            setSelectedMeshes([mesh]);
            setMenuPosition({ x: event.clientX, y: event.clientY });
            setIsMenuOpen(true);
        } else {
            setIsMenuOpen(false);
            setMenuPosition(null);
            setSelectedMeshes([]);
        }
    }, []);

    const handleMenuAction = useCallback((action: MenuAction, meshes: THREE.SkinnedMesh[]) => {
        if (action === 'merge' && mergeTargetMesh && meshes.length > 0) {
            onMenuAction?.(action, [mergeTargetMesh, meshes[0]]);
            setMergeTargetMesh(null);
        } else {
            onMenuAction?.(action, meshes);
            if (action !== 'merge') setMergeTargetMesh(null);
        }
    }, [onMenuAction, mergeTargetMesh]);

    const handleSelectForMerge = useCallback((meshes: THREE.SkinnedMesh[]) => {
        if (meshes.length > 0) setMergeTargetMesh(meshes[0]);
    }, []);

    const handleMenuClose = useCallback(() => {
        setIsMenuOpen(false);
        setMenuPosition(null);
    }, []);

    const handlePointerDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 0) {
            setIsMenuOpen(false);
            setMenuPosition(null);
        }
    }, []);

    return (
        <>
            <div className={className} style={style} onContextMenu={handleContextMenu} onMouseDown={handlePointerDown}>
                <TemplateScene
                    enableRig
                    enableTransform
                    onSceneReady={handleSceneReady}
                />
            </div>
            <SceneMenu
                isOpen={isMenuOpen}
                position={menuPosition}
                selectedMeshes={selectedMeshes}
                hasMergeTarget={mergeTargetMesh !== null}
                onAction={handleMenuAction}
                onSelectForMerge={handleSelectForMerge}
                onClose={handleMenuClose}
            />
        </>
    );
}
