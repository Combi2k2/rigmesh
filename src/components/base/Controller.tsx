'use client';

import { Stepper, Slider, Button, Stack, Group, Paper, Text, Box } from '@mantine/core';

export interface ControllerParamProps {
    name: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
};
export interface ControllerStepProps {
    name: string;
    desc: string;
    params: ControllerParamProps[];
};
export interface ControllerProps {
    currentStep: number;
    onNext: () => void;
    onCancel: () => void;
    steps: ControllerStepProps[];
};

export default function Controller({ currentStep, onNext, onCancel, steps }: ControllerProps) {
    if (currentStep === 0)
        return null;

    const step = steps[currentStep - 1];
    const params = step?.params ?? [];

    return (
        <Stack gap="lg" style={{ height: '100%' }}>
            <Paper p="sm" radius="md" withBorder>
                <Stepper active={currentStep - 1} size="xs">
                    {steps.map((s, i) => (
                        <Stepper.Step key={i}>
                            <Text size="sm" fw={600} c="dark">Step {i+1}: {s.name}</Text>
                            <Text size="xs" c="dimmed" mt="xs" lineClamp={5}>{s.desc}</Text>
                        </Stepper.Step>
                    ))}
                </Stepper>                
            </Paper>

            {params.length > 0 && (
                <Paper p="md" radius="md" withBorder>
                    <Stack gap="md">
                        {params.map((p) => (
                            <Stack key={p.name} gap="xs">
                                <Text size="md" fw={700} c="var(--mantine-color-text)">
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
                </Paper>
            )}

            <Box style={{ flex: 1, minHeight: 24 }} />

            <Group justify="center" gap="sm">
                <Button onClick={onCancel}>Cancel</Button>
                <Button onClick={onNext}>Next</Button>
            </Group>
        </Stack>
    );
}