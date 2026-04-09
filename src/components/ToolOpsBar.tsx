'use client';

import { useCallback } from 'react';
import { Tooltip } from '@mantine/core';
import { Pencil, Scissors, Link, Copy, Trash2, Bone } from 'lucide-react';
import * as THREE from 'three';

export interface ToolOpsBarProps {
    selectedMeshes: THREE.SkinnedMesh[];
    onDraw: () => void;
    onCut: (mesh: THREE.SkinnedMesh) => void;
    onMerge: (meshes: THREE.SkinnedMesh[]) => void;
    onDuplicate: (mesh: THREE.SkinnedMesh) => void;
    onDelete: (meshes: THREE.SkinnedMesh[]) => void;
    onEditSkeleton: (mesh: THREE.SkinnedMesh) => void;
}

interface OpButtonProps {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
}

function OpButton({ label, icon, onClick, disabled = false, danger = false }: OpButtonProps) {
    return (
        <Tooltip label={label} position="left" withArrow>
            <button
                onClick={onClick}
                disabled={disabled}
                className={`p-2 rounded-lg transition-all duration-150 ${
                    disabled
                        ? 'text-gray-600 cursor-not-allowed'
                        : danger
                        ? 'text-gray-300 hover:text-red-400 hover:bg-gray-800'
                        : 'text-gray-300 hover:text-blue-400 hover:bg-gray-800'
                }`}
            >
                {icon}
            </button>
        </Tooltip>
    );
}

export default function ToolOpsBar({
    selectedMeshes,
    onDraw,
    onCut,
    onMerge,
    onDuplicate,
    onDelete,
    onEditSkeleton,
}: ToolOpsBarProps) {
    const hasSelection = selectedMeshes.length > 0;
    const hasSingle = selectedMeshes.length === 1;
    const hasDouble = selectedMeshes.length === 2;

    const handleCut = useCallback(() => {
        if (hasSingle) onCut(selectedMeshes[0]);
    }, [hasSingle, selectedMeshes, onCut]);

    const handleMerge = useCallback(() => {
        if (hasDouble) onMerge(selectedMeshes);
    }, [hasDouble, selectedMeshes, onMerge]);

    const handleDuplicate = useCallback(() => {
        if (hasSingle) onDuplicate(selectedMeshes[0]);
    }, [hasSingle, selectedMeshes, onDuplicate]);

    const handleDelete = useCallback(() => {
        if (hasSelection) onDelete(selectedMeshes);
    }, [hasSelection, selectedMeshes, onDelete]);

    const handleEditSkeleton = useCallback(() => {
        if (hasSingle) onEditSkeleton(selectedMeshes[0]);
    }, [hasSingle, selectedMeshes, onEditSkeleton]);

    return (
        <div className="flex flex-col items-center gap-1 px-2 py-3 rounded-2xl bg-gray-900/85 backdrop-blur-sm border border-gray-700 shadow-lg">
            <OpButton label="Draw"          icon={<Pencil size={20} />}   onClick={onDraw}              disabled={hasSelection} />
            <OpButton label="Cut"           icon={<Scissors size={20} />} onClick={handleCut}           disabled={!hasSingle} />
            <OpButton label="Merge"         icon={<Link size={20} />}     onClick={handleMerge}         disabled={!hasDouble} />
            <OpButton label="Duplicate"     icon={<Copy size={20} />}     onClick={handleDuplicate}     disabled={!hasSingle} />
            <OpButton label="Edit Skeleton" icon={<Bone size={20} />}     onClick={handleEditSkeleton}  disabled={!hasSingle} />
            <div className="w-full h-px bg-gray-700 my-0.5" />
            <OpButton label="Delete"        icon={<Trash2 size={20} />}   onClick={handleDelete}        disabled={!hasSelection} danger />
        </div>
    );
}
