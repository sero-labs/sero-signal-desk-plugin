import type { FeedSource } from '../../shared/types';

export function sourceName(source: FeedSource | undefined): string {
  return source?.name ?? 'Unknown source';
}

export function formatDate(value: string | undefined): string {
  if (!value) return 'undated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
