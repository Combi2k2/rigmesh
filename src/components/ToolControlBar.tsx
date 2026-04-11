'use client';

import { useEffect } from 'react';
import { Tooltip } from '@mantine/core';
import { MousePointer2, Move, RefreshCcw, Expand, Lock, Unlock } from 'lucide-react';

export type ToolMode = 'select' | 'translate' | 'rotate' | 'scale';

export interface ToolControlBarProps {
    activeTool: ToolMode;
    cameraLocked: boolean;
    onToolChange: (tool: ToolMode) => void;
    onLockToggle: () => void;
}

const tools: { mode: ToolMode; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { mode: 'select',    label: 'Select',    icon: <MousePointer2 size={20} />, shortcut: '' },
    { mode: 'translate', label: 'Translate', icon: <Move size={20} />,          shortcut: 'G' },
    { mode: 'rotate',    label: 'Rotate',    icon: <RefreshCcw size={20} />,    shortcut: 'R' },
    { mode: 'scale',     label: 'Scale',     icon: <Expand size={20} />,        shortcut: 'S' },
];

export default function ToolControlBar({
    activeTool,
    cameraLocked,
    onToolChange,
    onLockToggle,
}: ToolControlBarProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const key = e.key.toLowerCase();
            if (key === 'g') onToolChange('translate');
            if (key === 'r') onToolChange('rotate');
            if (key === 's') onToolChange('scale');
            if (key === 'l') onLockToggle();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onToolChange, onLockToggle]);

    return (
        <div className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-gray-900/85 backdrop-blur-sm border border-gray-700 shadow-lg">
            <Tooltip label="Select" position="top" withArrow>
                <button
                    onClick={() => onToolChange('select')}
                    className={`p-2 rounded-lg transition-all duration-150 ${
                        activeTool === 'select'
                            ? 'text-blue-400 bg-gray-800'
                            : 'text-gray-300 hover:text-blue-400 hover:bg-gray-800'
                    }`}
                >
                    <MousePointer2 size={20} />
                </button>
            </Tooltip>
            <div className="w-px h-6 bg-gray-700 mx-1" />
            {tools.filter(t => t.mode !== 'select').map(({ mode, label, icon, shortcut }) => {
                const isActive = activeTool === mode;
                return (
                    <Tooltip key={mode} label={`${label} (${shortcut})`} position="top" withArrow>
                        <button
                            onClick={() => onToolChange(mode)}
                            className={`p-2 rounded-lg transition-all duration-150 ${
                                isActive
                                    ? 'text-blue-400 bg-gray-800'
                                    : 'text-gray-300 hover:text-blue-400 hover:bg-gray-800'
                            }`}
                        >
                            {icon}
                        </button>
                    </Tooltip>
                );
            })}
            <div className="w-px h-6 bg-gray-700 mx-1" />
            <Tooltip label={cameraLocked ? 'Unlock Camera (L)' : 'Lock Camera (L)'} position="top" withArrow>
                <button
                    onClick={onLockToggle}
                    className={`p-2 rounded-lg transition-all duration-150 ${
                        cameraLocked
                            ? 'text-amber-400 bg-gray-800'
                            : 'text-gray-300 hover:text-amber-400 hover:bg-gray-800'
                    }`}
                >
                    {cameraLocked ? <Lock size={20} /> : <Unlock size={20} />}
                </button>
            </Tooltip>
        </div>
    );
}
