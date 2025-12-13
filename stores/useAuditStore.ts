import { create } from 'zustand';

export type AuditPhase = 'idle' | 'scan' | 'analyze' | 'explain' | 'fix' | 'complete';

interface AuditStore {
    // IDs only - no audit data
    auditIds: string[];
    activeAuditId: string | null;
    auditPhase: AuditPhase;

    // Optional flow-only refs (for future fix stage)
    currentAgentId: string | null;
    selectedIssueId: string | null;
    selectedFilePath: string | null;

    // Actions
    setAuditIds: (ids: string[]) => void;
    setActiveAuditId: (id: string | null) => void;
    setAuditPhase: (phase: AuditPhase) => void;
    addAuditId: (id: string) => void;
    removeAuditId: (id: string) => void;
    setSelectedIssueId: (id: string | null) => void;
    setSelectedFilePath: (path: string | null) => void;
    setCurrentAgentId: (id: string | null) => void;
    clear: () => void;
}

export const useAuditStore = create<AuditStore>((set) => ({
    // Initial state
    auditIds: [],
    activeAuditId: null,
    auditPhase: 'idle',
    currentAgentId: null,
    selectedIssueId: null,
    selectedFilePath: null,

    // Actions
    setAuditIds: (ids) => set({ auditIds: ids }),
    setActiveAuditId: (id) => set({ activeAuditId: id }),
    setAuditPhase: (phase) => set({ auditPhase: phase }),
    addAuditId: (id) => set((state) => ({
        auditIds: state.auditIds.includes(id) ? state.auditIds : [...state.auditIds, id],
    })),
    removeAuditId: (id) => set((state) => ({
        auditIds: state.auditIds.filter((aid) => aid !== id),
        activeAuditId: state.activeAuditId === id ? null : state.activeAuditId,
    })),
    setSelectedIssueId: (id) => set({ selectedIssueId: id }),
    setSelectedFilePath: (path) => set({ selectedFilePath: path }),
    setCurrentAgentId: (id) => set({ currentAgentId: id }),
    clear: () => set({
        auditIds: [],
        activeAuditId: null,
        auditPhase: 'idle',
        currentAgentId: null,
        selectedIssueId: null,
        selectedFilePath: null,
    }),
}));
