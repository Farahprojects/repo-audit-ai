import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuditStore } from '../stores';
import { usePreflightStore } from '../stores';
import { AuditService } from '../services/auditService';
import { RepoReport, AuditRecord } from '../types';

/**
 * Hook that bridges Zustand pointer-layer with data fetching.
 * Reads IDs from stores, fetches data by ID, caches in React state.
 */
export const useAuditData = () => {
    const activeAuditId = useAuditStore((state) => state.activeAuditId);
    const auditIds = useAuditStore((state) => state.auditIds);
    const repoUrl = usePreflightStore((state) => state.repoUrl);

    // Cache for fetched reports - keyed by audit ID
    const [reportCache, setReportCache] = useState<Record<string, RepoReport>>({});
    const [auditCache, setAuditCache] = useState<Record<string, AuditRecord>>({});
    const [relatedAudits, setRelatedAudits] = useState<AuditRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track if we're currently fetching to prevent double-fetches
    const [fetchingId, setFetchingId] = useState<string | null>(null);

    // Fetch active audit report by ID
    useEffect(() => {
        if (!activeAuditId) return;

        // Skip if already cached or already fetching this ID
        if (reportCache[activeAuditId] || fetchingId === activeAuditId) return;

        const fetchData = async () => {
            setFetchingId(activeAuditId);
            setLoading(true);
            setError(null);

            try {
                const result = await AuditService.fetchAuditById(activeAuditId);
                if (result) {
                    setReportCache((prev) => ({ ...prev, [activeAuditId]: result.report }));
                    setAuditCache((prev) => ({ ...prev, [activeAuditId]: result.audit }));

                    if (result.audit.repo_url) {
                        const related = await AuditService.fetchAuditsByRepoUrl(result.audit.repo_url);
                        setRelatedAudits(related);
                        useAuditStore.getState().setAuditIds(related.map((a) => a.id));
                    }
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch audit');
            } finally {
                setLoading(false);
                setFetchingId(null);
            }
        };

        fetchData();
    }, [activeAuditId]);  // Remove reportCache from deps

    // Fetch related audits when repoUrl changes
    useEffect(() => {
        if (!repoUrl) return;

        const fetchRelated = async () => {
            try {
                const related = await AuditService.fetchAuditsByRepoUrl(repoUrl);
                setRelatedAudits(related);
                useAuditStore.getState().setAuditIds(related.map((a) => a.id));
            } catch (err) {
                console.error('Failed to fetch related audits:', err);
            }
        };

        fetchRelated();
    }, [repoUrl]);

    // Active report from cache
    const activeReport = useMemo(() => {
        return activeAuditId ? reportCache[activeAuditId] ?? null : null;
    }, [activeAuditId, reportCache]);

    // Active audit record from cache
    const activeAudit = useMemo(() => {
        return activeAuditId ? auditCache[activeAuditId] ?? null : null;
    }, [activeAuditId, auditCache]);

    // Group audits by tier
    const auditsByTier = useMemo(() => {
        const grouped: Record<string, AuditRecord[]> = {};
        relatedAudits.forEach((audit) => {
            if (!grouped[audit.tier]) {
                grouped[audit.tier] = [];
            }
            grouped[audit.tier].push(audit);
        });
        return grouped;
    }, [relatedAudits]);

    // Completed tiers
    const completedTiers = useMemo(() => Object.keys(auditsByTier), [auditsByTier]);

    // Select an audit (updates store, data fetched reactively)
    const selectAudit = useCallback((audit: AuditRecord) => {
        useAuditStore.getState().setActiveAuditId(audit.id);

        // Pre-cache the report if we have the full audit data
        const report = AuditService.processSelectedAudit(audit);
        setReportCache((prev) => ({ ...prev, [audit.id]: report }));
        setAuditCache((prev) => ({ ...prev, [audit.id]: audit }));
    }, []);

    // Delete audit
    const deleteAudit = useCallback(async (auditId: string) => {
        // Remove from cache
        setReportCache((prev) => {
            const { [auditId]: _, ...rest } = prev;
            return rest;
        });
        setAuditCache((prev) => {
            const { [auditId]: _, ...rest } = prev;
            return rest;
        });
        setRelatedAudits((prev) => prev.filter((a) => a.id !== auditId));

        // Update store
        useAuditStore.getState().removeAuditId(auditId);
    }, []);

    // Add a new audit to cache (after scan completes)
    const addAudit = useCallback((report: RepoReport, audit: AuditRecord) => {
        setReportCache((prev) => ({ ...prev, [audit.id]: report }));
        setAuditCache((prev) => ({ ...prev, [audit.id]: audit }));
        setRelatedAudits((prev) => [audit, ...prev.filter((a) => a.id !== audit.id)]);
        useAuditStore.getState().addAuditId(audit.id);
        useAuditStore.getState().setActiveAuditId(audit.id);
    }, []);

    // Clear all cached data
    const clearCache = useCallback(() => {
        setReportCache({});
        setAuditCache({});
        setRelatedAudits([]);
        setError(null);
    }, []);

    return {
        // Data (from cache)
        activeReport,
        activeAudit,
        relatedAudits,
        auditsByTier,
        completedTiers,

        // Loading state
        loading,
        error,

        // Actions
        selectAudit,
        deleteAudit,
        addAudit,
        clearCache,
    };
};
