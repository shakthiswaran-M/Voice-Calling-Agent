const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

/** Convert Markdown responses into readable text for voice mode. */
export function cleanVoiceText(text: string): string {
  if (!text) return '';

  return text
    .replace(/```(?:[\w+-]+)?\s*\n?/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(MARKDOWN_LINK_PATTERN, '$1 ($2)')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
