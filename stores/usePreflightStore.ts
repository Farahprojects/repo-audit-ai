import { create } from 'zustand';

export type PreflightStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PreflightStore {
    // IDs only - no data
    preflightId: string | null;
    projectId: string | null;
    repoUrl: string | null;
    status: PreflightStatus;

    // Actions
    setPreflightId: (id: string | null) => void;
    setProjectId: (id: string | null) => void;
    setRepoUrl: (url: string | null) => void;
    setStatus: (status: PreflightStatus) => void;
    clear: () => void;
}

export const usePreflightStore = create<PreflightStore>((set) => ({
    // Initial state
    preflightId: null,
    projectId: null,
    repoUrl: null,
    status: 'idle',

    // Actions
    setPreflightId: (id) => set({ preflightId: id }),
    setProjectId: (id) => set({ projectId: id }),
    setRepoUrl: (url) => set({ repoUrl: url }),
    setStatus: (status) => set({ status }),
    clear: () => set({
        preflightId: null,
        projectId: null,
        repoUrl: null,
        status: 'idle',
    }),
}));
