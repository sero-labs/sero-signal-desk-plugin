import type { FeedSource } from './types';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportOpml(sources: FeedSource[]): string {
  const outlines = sources.map((source) => `    <outline text="${escapeXml(source.name)}" title="${escapeXml(source.name)}" type="rss" xmlUrl="${escapeXml(source.url)}" category="${escapeXml(source.category ?? source.kind)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Signal Desk Sources</title></head>\n  <body>\n${outlines}\n  </body>\n</opml>`;
}

export function parseOpmlSources(opml: string): Array<{ name: string; url: string; category?: string }> {
  const matches = [...opml.matchAll(/<outline\b[^>]*>/gi)];
  return matches.flatMap((match) => {
    const tag = match[0];
    const url = attr(tag, 'xmlUrl') ?? attr(tag, 'xmlurl') ?? attr(tag, 'url');
    if (!url) return [];
    return [{ name: attr(tag, 'title') ?? attr(tag, 'text') ?? url, url, category: attr(tag, 'category') }];
  });
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));
  return match?.[1]
    ?.replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}
