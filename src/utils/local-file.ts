/**
 * Convert a local file path to a URL loadable in the renderer process.
 *
 * Uses standard file:// protocol. webSecurity is disabled in the main
 * window to allow loading local files for preview playback.
 */
export function toLocalFileUrl(filePath: string): string {
  if (!filePath) return '';
  // Normalize backslashes to forward slashes for URL
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${normalized.replace(/^\/+/, '')}`;
}
