'use client';

import { useState } from 'react';
import { Slider, Button, Stack, Group, Paper, Text, Box, Checkbox } from '@mantine/core';

export interface FlowParamProps {
    name: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}

export interface FlowStepProps {
    name: string;
    desc: string;
    params: FlowParamProps[];
}

export interface FlowSidebarProps {
    instructions: string;
    steps: FlowStepProps[];
    currentStep: number;
    onNext: () => void;
    onBack: () => void;
    onCancel: () => void;
    onFinish?: () => void;
    onWireframeToggle?: (enabled: boolean) => void;
    onSkeletonToggle?: (enabled: boolean) => void;
}

function ParamSliders({ params }: { params: FlowParamProps[] }) {
    if (params.length === 0) return null;
    return (
        <Stack gap="md">
            {params.map((p) => (
                <Stack key={p.name} gap="xs">
                    <Text size="xs" fw={600} c="var(--mantine-color-text)">
                        {p.name}
                    </Text>
                    <Group wrap="nowrap" align="center" gap="xs" style={{ width: '100%' }}>
                        <Text size="xs" c="dimmed" style={{ minWidth: 28, textAlign: 'left' }}>
                            {p.step >= 1 ? Math.round(p.min) : p.min.toFixed(2)}
                        </Text>
                        <Slider
                            value={p.value}
                            onChange={p.onChange}
                            min={p.min}
                            max={p.max}
                            step={p.step}
                            size="sm"
                            style={{ flex: 1 }}
                        />
                        <Text size="xs" c="dimmed" style={{ minWidth: 28, textAlign: 'right' }}>
                            {p.step >= 1 ? Math.round(p.max) : p.max.toFixed(2)}
                        </Text>
                    </Group>
                </Stack>
            ))}
        </Stack>
    );
}

export default function FlowSidebar({
    instructions,
    steps,
    currentStep,
    onNext,
    onBack,
    onCancel,
    onFinish,
    onWireframeToggle,
    onSkeletonToggle,
}: FlowSidebarProps) {
    const [wireframe, setWireframe] = useState(false);
    const [skeleton, setSkeleton] = useState(true);

    const step = currentStep > 0 ? steps[currentStep - 1] : null;
    const stepParams = step?.params ?? [];

    return (
        <Stack gap="md" style={{ height: '100%' }}>
            {/* Instructions */}
            <Paper p="sm" radius="md" withBorder>
                <Text size="sm" c="dimmed">{instructions}</Text>
            </Paper>

            {/* Visibility toggles */}
            {(onWireframeToggle || onSkeletonToggle) && (
                <Group gap="md">
                    {onWireframeToggle && (
                        <Checkbox
                            label="Wireframe"
                            checked={wireframe}
                            onChange={(e) => {
                                const v = e.currentTarget.checked;
                                setWireframe(v);
                                onWireframeToggle(v);
                            }}
                            size="xs"
                        />
                    )}
                    {onSkeletonToggle && (
                        <Checkbox
                            label="Skeleton"
                            checked={skeleton}
                            onChange={(e) => {
                                const v = e.currentTarget.checked;
                                setSkeleton(v);
                                onSkeletonToggle(v);
                            }}
                            size="xs"
                        />
                    )}
                </Group>
            )}

            {/* Progress bar + step info + step params */}
            {currentStep > 0 && step && (
                <Paper p="sm" radius="md" withBorder style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <Stack gap="sm">
                        {/* Current step info */}
                        <Box>
                            <Text size="sm" fw={700} c="var(--mantine-color-gray-9)">Step {currentStep}: {step.name}</Text>
                            <Text size="xs" c="dimmed" mt="xs">{step.desc}</Text>
                        </Box>

                        {/* Step-specific params */}
                        {stepParams.length > 0 && <ParamSliders params={stepParams} />}
                    </Stack>
                </Paper>
            )}

            <Box style={{ flex: currentStep > 0 ? 0 : 1, minHeight: 24 }} />

            {/* Action buttons */}
            <Group justify="space-between" gap={6} wrap="nowrap">
                <Button onClick={onCancel} variant="default" size="sm" style={{ flex: '0 0 auto' }}>Cancel</Button>
                <Group gap={2} wrap="nowrap">
                    <Button onClick={onBack} disabled={currentStep <= 1} variant="subtle" size="xs" style={{ width: 28, height: 28, padding: 0 }}>{'<'}</Button>
                    <Text size="xs" fw={600} style={{ minWidth: 24, textAlign: 'center', flex: '0 0 auto' }}>
                        {currentStep}/{steps.length}
                    </Text>
                    <Button onClick={onNext} disabled={currentStep === 0} variant="subtle" size="xs" style={{ width: 28, height: 28, padding: 0 }}>{'>'}</Button>
                </Group>
                <Button onClick={onFinish} disabled={currentStep === 0} variant="filled" size="sm" style={{ flex: '0 0 auto' }}>Finish</Button>
            </Group>
        </Stack>
    );
}
