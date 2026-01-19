'use client';

import { useRef, useEffect, useCallback, RefObject } from 'react';
import { SceneMenuContext, MenuAction } from '@/hooks/useScene';

export interface SceneMenuProps {
    menuContextRef: RefObject<SceneMenuContext>;
    setMenuContext?: (context: SceneMenuContext | null) => void;
    position?: { x: number; y: number } | null;
}

/**
 * SceneMenu component for handling context menu interactions
 * 
 * Manages the context menu UI and handles menu action selections.
 * Uses internal refs to avoid re-renders during menu interactions.
 */
export default function SceneMenu({
    menuContextRef,
    setMenuContext,
    position
}: SceneMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (menuRef.current) {
            if (position) {
                menuRef.current.style.left = `${position.x}px`;
                menuRef.current.style.top = `${position.y}px`;
                menuRef.current.style.display = 'block';
            } else {
                menuRef.current.style.display = 'none';
            }
        }
    }, [position]);

    const handleMenuAction = useCallback((action: String) => {
        if (action !== 'merge_1' && action !== 'merge_0')
            menuContextRef.current.selectedAction = action as MenuAction;

        if (action === 'merge_0') {
            menuContextRef.current.selectedAction = 'merge';
            menuContextRef.current.selectedMeshes = [menuContextRef.current.selectedMeshes.at(-1)!];
        } else {
            setMenuContext(menuContextRef.current);
            menuContextRef.current.selectedMeshes = [];
            menuContextRef.current.selectedAction = null;
        }
        if (menuRef.current)
            menuRef.current.style.display = 'none';
    }, [setMenuContext]);
    
    const menuRefCallback = (element: HTMLDivElement | null) => {
        menuRef.current = element;
    };

    const options = [
        { label: 'Copy', action: 'copy', disabled: false },
        { label: 'Delete', action: 'delete', disabled: false },
        { label: 'Rig', action: 'rig', disabled: false },
        { label: 'Cut', action: 'cut', disabled: false },
        { label: 'Select to merge', action: 'merge_0', disabled: false },
        { label: 'Merge with selected', action: 'merge_1', disabled: menuContextRef.current === null }
    ];

    return (
        <div
            ref={menuRefCallback}
            className="fixed bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50 py-1 min-w-[150px]"
            style={{ display: 'none' }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1 border-b border-gray-200 dark:border-gray-700">
                Mesh Options
            </div>
            {options.map((option) => (
                <button
                    key={option.label}
                    className="w-full text-left text-xs px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    onClick={() => handleMenuAction(option.action)}
                    disabled={option.disabled}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
