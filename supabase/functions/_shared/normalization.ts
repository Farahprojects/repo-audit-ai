// @ts-ignore - Deno types are available at runtime in Supabase Edge Functions
// Shared normalization utilities - centralized LLM output processing
// Prevents code duplication across audit functions

// Normalize LLM output for consistent frontend consumption
export function normalizeStrengthsOrIssues(items: any[]): { title: string; detail: string }[] {
  if (!items || !Array.isArray(items)) return [];
  return items.map(item => {
    if (typeof item === 'string') {
      const colonIndex = item.indexOf(':');
      if (colonIndex > 0) {
        return {
          title: item.substring(0, colonIndex).trim(),
          detail: item.substring(colonIndex + 1).trim()
        };
      }
      return { title: item, detail: '' };
    }
    if (item && typeof item === 'object') {
      // Handle title/detail structure
      if (item.title) {
        return { title: item.title, detail: item.detail || item.description || '' };
      }
      // Handle area/description structure (from LLM output)
      if (item.area) {
        return { title: item.area, detail: item.description || '' };
      }
    }
    return { title: String(item), detail: '' };
  });
}

export function normalizeRiskLevel(level: any): 'critical' | 'high' | 'medium' | 'low' | null {
  if (!level) return null;
  const normalized = String(level).toLowerCase();
  if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
    return normalized as 'critical' | 'high' | 'medium' | 'low';
  }
  return null;
}
