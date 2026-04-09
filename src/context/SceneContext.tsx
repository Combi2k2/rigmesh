import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSceneState, type SceneState } from './sceneState';

// ─── Context ──────────────────────────────────────────────────────────────────

const SceneContext = createContext<SceneState | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SceneProvider({ children }: { children: ReactNode }) {
    const state = useSceneState();

    // Stable object reference — only changes when `meshes` or `canUndo` change.
    // Callbacks are already stable via useCallback so they're safe to include.
    const value = useMemo<SceneState>(
        () => state,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [state.meshes, state.canUndo]
    );

    return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useScene(): SceneState {
    const ctx = useContext(SceneContext);
    if (!ctx) throw new Error('useScene must be used inside <SceneProvider>');
    return ctx;
}
