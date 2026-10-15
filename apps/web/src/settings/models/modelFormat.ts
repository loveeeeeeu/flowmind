/** 128000 -> "128K", 1048576 -> "1M"; context windows are rough capability hints, not exact limits. */
export function formatContextWindow(tokens: number | null) {
  if (tokens === null) {
    return '—';
  }

  if (tokens >= 1_000_000) {
    return `${Number((tokens / 1_000_000).toFixed(1))}M`;
  }

  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K`;
  }

  return String(tokens);
}
