'use client';

import { Checkbox } from '@mantine/core';
import SceneGraph, { SceneGraphProps } from '@/components/base/SceneGraph';

export interface SidebarProps extends SceneGraphProps {
    viewWireframe: boolean;
    viewSkeleton: boolean;
    onWireframeToggle: (value: boolean) => void;
    onSkeletonToggle: (value: boolean) => void;
}

export default function Sidebar({ scene, onSelect, viewWireframe, viewSkeleton, onWireframeToggle, onSkeletonToggle }: SidebarProps) {
    return (
        <div className="flex flex-col h-full bg-[#252525] text-gray-300">
            <SceneGraph scene={scene} onSelect={onSelect} />
            <div className="px-3 py-3 border-t border-gray-700 flex flex-col gap-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Visibility</div>
                <Checkbox
                    label="Wireframe"
                    checked={viewWireframe}
                    onChange={(e) => onWireframeToggle(e.currentTarget.checked)}
                    size="xs"
                />
                <Checkbox
                    label="Skeleton"
                    checked={viewSkeleton}
                    onChange={(e) => onSkeletonToggle(e.currentTarget.checked)}
                    size="xs"
                />
            </div>
        </div>
    );
}
