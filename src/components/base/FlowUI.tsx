'use client';

import { ReactNode } from 'react';
import FlowSidebar, { FlowSidebarProps } from '@/components/base/FlowSidebar';

export interface FlowUIProps extends FlowSidebarProps {
    children: ReactNode;
}

export default function FlowUI({ children, ...sidebarProps }: FlowUIProps) {
    return (
        <div className="h-full w-full flex flex-col sm:flex-row bg-gray-900">
            <div className="flex-1 min-w-0 min-h-0 relative">
                {children}
            </div>
            <div
                role="complementary"
                className="flex-shrink-0 w-full sm:w-80 border-l border-gray-700 bg-gray-900 overflow-auto shadow-xl flex flex-col"
                data-mantine-color-scheme="dark"
            >
                <div className="p-4 flex-1 min-h-0">
                    <FlowSidebar {...sidebarProps} />
                </div>
            </div>
        </div>
    );
}
