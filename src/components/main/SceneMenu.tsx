'use client';

import { useEffect, useRef, useCallback } from 'react';
import { MenuAction } from '@/interface';
import * as THREE from 'three';

export interface MenuPosition {
    x: number;
    y: number;
}

export interface SceneMenuProps {
    isOpen: boolean;
    position: MenuPosition | null;
    selectedMeshes: THREE.SkinnedMesh[];
    hasMergeTarget: boolean;
    onAction: (action: MenuAction, meshes: THREE.SkinnedMesh[]) => void;
    onSelectForMerge?: (meshes: THREE.SkinnedMesh[]) => void;
    onClose: () => void;
}

interface MenuOption {
    label: string;
    action: MenuAction;
    icon?: string;
    disabled: boolean;
    divider?: boolean;
}

/**
 * SceneMenu component for handling context menu interactions
 * 
 * A modern, accessible context menu with proper state management,
 * click-outside-to-close functionality, and keyboard support.
 */
export default function SceneMenu({
    isOpen,
    position,
    selectedMeshes,
    hasMergeTarget,
    onAction,
    onSelectForMerge,
    onClose
}: SceneMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle click outside to close menu
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        // Use capture phase to catch events before they bubble
        document.addEventListener('mousedown', handleClickOutside, true);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Adjust menu position to stay within viewport
    useEffect(() => {
        if (!isOpen || !position || !menuRef.current) return;

        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let x = position.x;
        let y = position.y;

        // Adjust horizontal position if menu would overflow
        if (x + rect.width > viewportWidth) {
            x = viewportWidth - rect.width - 8;
        }
        if (x < 8) {
            x = 8;
        }

        // Adjust vertical position if menu would overflow
        if (y + rect.height > viewportHeight) {
            y = viewportHeight - rect.height - 8;
        }
        if (y < 8) {
            y = 8;
        }

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }, [isOpen, position]);

    const handleAction = useCallback((action: MenuAction) => {
        onAction(action, selectedMeshes);
        onClose();
    }, [onAction, onClose, selectedMeshes]);

    const handleSelectForMerge = useCallback(() => {
        if (onSelectForMerge) {
            onSelectForMerge(selectedMeshes);
        }
        onClose();
    }, [onSelectForMerge, onClose, selectedMeshes]);

    const handleMergeWithSelected = useCallback(() => {
        onAction('merge', selectedMeshes);
        onClose();
    }, [onAction, onClose, selectedMeshes]);

    const menuOptions: MenuOption[] = [
        { label: 'Copy', action: 'copy', disabled: false },
        { label: 'Cut', action: 'cut', disabled: false },
        { label: 'Delete', action: 'delete', disabled: false },
        { label: 'Edit Skeleton', action: 'editSkeleton', disabled: selectedMeshes.length !== 1 },
    ];

    if (!isOpen || !position) {
        return null;
    }

    const meshCount = selectedMeshes.length;
    const meshLabel = meshCount === 1 ? 'Mesh' : 'Meshes';

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50"
            style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
            onClick={(e) => {
                // Close when clicking the backdrop
                if (e.target === containerRef.current) {
                    onClose();
                }
            }}
        >
            <div
                ref={menuRef}
                className="absolute bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 py-1.5 min-w-[180px] backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95"
                style={{
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    opacity: isOpen ? 1 : 0,
                    transform: isOpen ? 'scale(1)' : 'scale(0.95)',
                    transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
                }}
                onClick={(e) => e.stopPropagation()}
                role="menu"
                aria-label="Mesh context menu"
            >
                {/* Header */}
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {meshCount} {meshLabel} Selected
                    </div>
                </div>

                {/* Menu Items */}
                <div className="py-1">
                    {menuOptions.map((option, index) => {
                        if (option.divider && index > 0) {
                            return (
                                <div key={`divider-${index}`}>
                                    <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                                    <button
                                        className="w-full text-left text-sm px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150 flex items-center gap-2"
                                        onClick={() => !option.disabled && handleAction(option.action)}
                                        disabled={option.disabled}
                                        role="menuitem"
                                    >
                                        {option.label}
                                    </button>
                                </div>
                            );
                        }

                        return (
                            <button
                                key={option.label}
                                className="w-full text-left text-sm px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150 flex items-center gap-2"
                                onClick={() => !option.disabled && handleAction(option.action)}
                                disabled={option.disabled}
                                role="menuitem"
                            >
                                {option.label}
                            </button>
                        );
                    })}
                    
                    {/* Merge options */}
                    <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                    <button
                        className="w-full text-left text-sm px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150 flex items-center gap-2"
                        onClick={handleSelectForMerge}
                        role="menuitem"
                    >
                        Select for Merge
                    </button>
                    <button
                        className="w-full text-left text-sm px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150 flex items-center gap-2"
                        onClick={handleMergeWithSelected}
                        disabled={!hasMergeTarget}
                        role="menuitem"
                    >
                        Merge with Selected
                    </button>
                </div>
            </div>
        </div>
    );
}
