import DOMPurify from 'dompurify';

/**
 * Processes and sanitizes legal document content for safe HTML rendering.
 * Converts markdown-like syntax to HTML and sanitizes the result.
 *
 * @param content - The raw content string from the database
 * @returns Sanitized HTML string safe for dangerouslySetInnerHTML
 */
export function sanitizeLegalContent(content: string): string {
  if (!content) return '';

  // First, process the content to convert markdown-like syntax to HTML
  const processedContent = content
    .replace(/\n/g, '<br>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-slate-900 mt-8 mb-4">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-medium text-slate-800 mt-6 mb-3">$1</h3>');

  // Then sanitize the HTML to prevent XSS attacks
  return DOMPurify.sanitize(processedContent, {
    ALLOWED_TAGS: ['br', 'h2', 'h3', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  });
}
