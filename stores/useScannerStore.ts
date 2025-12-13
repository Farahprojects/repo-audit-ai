import { create } from 'zustand';
import { LogEntry } from '../types';

export type ScannerStatus = 'idle' | 'running' | 'completed' | 'failed';

interface ScannerStore {
    // Volatile state - IDs and progress only
    status: ScannerStatus;
    progress: number;
    activeJobId: string | null;

    // Scanner logs - moved from component state to prevent parent re-renders
    logs: LogEntry[];

    // Actions
    setStatus: (status: ScannerStatus) => void;
    setProgress: (progress: number) => void;
    setActiveJobId: (id: string | null) => void;
    setLogs: (logs: LogEntry[]) => void;
    addLog: (log: LogEntry) => void;
    reset: () => void;
}

export const useScannerStore = create<ScannerStore>((set) => ({
    // Initial state
    status: 'idle',
    progress: 0,
    activeJobId: null,
    logs: [],

    // Actions
    setStatus: (status) => set({ status }),
    setProgress: (progress) => set({ progress }),
    setActiveJobId: (id) => set({ activeJobId: id }),
    setLogs: (logs) => set({ logs }),
    addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
    reset: () => set({
        status: 'idle',
        progress: 0,
        activeJobId: null,
        logs: [],
    }),
}));
