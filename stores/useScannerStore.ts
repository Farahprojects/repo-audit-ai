import { create } from 'zustand';

export type ScannerStatus = 'idle' | 'running' | 'completed' | 'failed';

interface ScannerStore {
    // Volatile state - IDs and progress only
    status: ScannerStatus;
    progress: number;
    activeJobId: string | null;

    // Actions
    setStatus: (status: ScannerStatus) => void;
    setProgress: (progress: number) => void;
    setActiveJobId: (id: string | null) => void;
    reset: () => void;
}

export const useScannerStore = create<ScannerStore>((set) => ({
    // Initial state
    status: 'idle',
    progress: 0,
    activeJobId: null,

    // Actions
    setStatus: (status) => set({ status }),
    setProgress: (progress) => set({ progress }),
    setActiveJobId: (id) => set({ activeJobId: id }),
    reset: () => set({
        status: 'idle',
        progress: 0,
        activeJobId: null,
    }),
}));
