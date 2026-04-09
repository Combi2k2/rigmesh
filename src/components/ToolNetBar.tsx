'use client';

import { Tooltip } from '@mantine/core';
import { Download, Upload } from 'lucide-react';

export interface ToolNetBarProps {
    onExport: () => void;
    onImport: () => void;
}

function NetButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
    return (
        <Tooltip label={label} position="left" withArrow>
            <button
                onClick={onClick}
                className="p-2 rounded-lg transition-all duration-150 text-gray-300 hover:text-blue-400 hover:bg-gray-800"
            >
                {icon}
            </button>
        </Tooltip>
    );
}

export default function ToolNetBar({ onExport, onImport }: ToolNetBarProps) {
    return (
        <div className="flex flex-col items-center gap-1 px-2 py-3 rounded-2xl bg-gray-900/85 backdrop-blur-sm border border-gray-700 shadow-lg">
            <NetButton label="Export" icon={<Download size={20} />} onClick={onExport} />
            <NetButton label="Import" icon={<Upload size={20} />}   onClick={onImport} />
        </div>
    );
}
