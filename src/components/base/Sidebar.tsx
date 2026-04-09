'use client';

import SceneGraph, { SceneGraphProps } from '@/components/base/SceneGraph';

export interface SidebarProps extends SceneGraphProps {}

export default function Sidebar({ scene, onSelect }: SidebarProps) {
    return (
        <div className="flex flex-col h-full bg-[#252525] text-gray-300">
            <SceneGraph scene={scene} onSelect={onSelect} />
            {/* Future panels (properties, materials, etc.) go here */}
        </div>
    );
}
