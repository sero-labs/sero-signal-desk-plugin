import path from 'node:path';
import { StringEnum, Type, type Static } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';

import { parseArticlesFromFeed } from '../shared/feed-parser';
import { reclusterArticles } from '../shared/intelligence';
import { inferSourceKind } from '../shared/source-helpers';
import { readSignalDeskState, SignalDeskStateReadError, writeSignalDeskState } from './state-io';
import type {
  Article,
  BriefingStyle,
  FeedSource,
  ItemStatus,
  Priority,
  RefreshRun,
  SignalAction,
  SignalDeskState,
  SourceKind,
  Watchlist,
  WatchlistType,
} from '../shared/types';
import { createId } from '../shared/types';

const STATE_REL_PATH = path.join('.sero', 'apps', 'signal-desk', 'state.json');
const ACTIONS = [
  'status',
  'add_source',
  'update_source',
  'remove_source',
  'add_watchlist',
  'update_watchlist',
  'remove_watchlist',
  'refresh',
  'list_articles',
  'list_clusters',
  'summarise_cluster',
  'save_summary',
  'recluster',
  'merge_clusters',
  'split_cluster',
  'briefing',
  'save_insight',
  'create_action',
  'mark',
  'seed_demo',
] as const;

const Params = Type.Object({
  action: StringEnum(ACTIONS),
  id: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  category: Type.Optional(Type.String()),
  enabled: Type.Optional(Type.Boolean()),
  kind: Type.Optional(Type.String()),
  type: Type.Optional(Type.String()),
  keywords: Type.Optional(Type.Array(Type.String())),
  sourceIds: Type.Optional(Type.Array(Type.String())),
  watchlistIds: Type.Optional(Type.Array(Type.String())),
  sourceId: Type.Optional(Type.String()),
  watchlistId: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
  minImportance: Type.Optional(Type.Number()),
  clusterId: Type.Optional(Type.String()),
  targetClusterId: Type.Optional(Type.String()),
  style: Type.Optional(Type.String()),
  briefingType: Type.Optional(Type.String()),
  since: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  articleIds: Type.Optional(Type.Array(Type.String())),
  clusterIds: Type.Optional(Type.Array(Type.String())),
  insightIds: Type.Optional(Type.Array(Type.String())),
  tags: Type.Optional(Type.Array(Type.String())),
  priority: Type.Optional(Type.String()),
  profile: Type.Optional(Type.String()),
});

type ParamsValue = Static<typeof Params>;

function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL_PATH);
}

function now(): string {
  return new Date().toISOString();
}

function textResult(text: string, details: Record<string, unknown> = {}, isError = false) {
  return { content: [{ type: 'text' as const, text }], details, isError };
}

function stateReadErrorResult(error: SignalDeskStateReadError) {
  return textResult(
    `Error: ${error.message}. Signal Desk did not write a new state file; repair or restore the existing state before retrying.`,
    { statePath: error.statePath, reason: error.reason },
    true,
  );
}

async function fetchSource(source: FeedSource, state: SignalDeskState): Promise<Article[]> {
  const response = await fetch(source.url, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  return parseArticlesFromFeed(xml, source, state.watchlists, {
    fetchedAt: now(),
    maxItems: state.settings.maxArticlesPerSource,
  });
}

function recluster(state: SignalDeskState): void {
  state.clusters = reclusterArticles(state.articles, state.clusters);
}

function buildBriefing(state: SignalDeskState, params: ParamsValue): string {
  const limit = params.limit ?? 8;
  const query = params.query?.toLowerCase();
  const since = params.since ? Date.parse(params.since) : 0;
  const clusters = state.clusters
    .filter((cluster) => !query || `${cluster.headline} ${cluster.tags.join(' ')}`.toLowerCase().includes(query))
    .filter((cluster) => !since || Date.parse(cluster.latestSeenAt) >= since)
    .slice(0, limit);
  if (!clusters.length) return 'No matching signal yet. Add sources/watchlists or run refresh.';
  const lines = [`Signal Desk briefing (${params.briefingType ?? 'today'})`, '', 'What matters:'];
  clusters.slice(0, 3).forEach((cluster, i) => lines.push(`${i + 1}. ${cluster.headline} (${cluster.importance}/100)`));
  lines.push('', 'Top stories:');
  clusters.forEach((cluster) => {
    const articles = cluster.articleIds.map((id) => state.articles.find((a) => a.id === id)).filter(Boolean) as Article[];
    const sources = [...new Set(articles.map((a) => state.sources.find((s) => s.id === a.sourceId)?.name ?? 'Unknown'))];
    lines.push(`- ${cluster.headline}`);
    lines.push(`  Signal: ${cluster.importance}/100 · Sources: ${sources.join(', ') || 'Unknown'} · Tags: ${cluster.tags.join(', ') || 'general'}`);
    if (articles[0]?.snippet) lines.push(`  Context: ${articles[0].snippet.slice(0, 220)}`);
  });
  lines.push('', 'Suggested actions:');
  lines.push('- Save the strongest implication as an insight.');
  lines.push('- Create follow-up actions for high-signal launch, release, funding, or security stories.');
  lines.push('- Ask for a founder, technical, or competitive read if you need deeper judgement.');
  return lines.join('\n');
}

function seedDemo(state: SignalDeskState): string {
  const t = now();
  if (!state.watchlists.some((w) => w.name === 'AI Agents')) {
    const ai = createId(state, 'watch');
    const dev = createId(state, 'watch');
    const react = createId(state, 'watch');
    state.watchlists.push(
      { id: ai, name: 'AI Agents', type: 'topic', keywords: ['agent', 'agents', 'OpenAI', 'Anthropic', 'tool calling'], sourceIds: [], priority: 'high', enabled: true, createdAt: t, updatedAt: t },
      { id: dev, name: 'Developer Tools', type: 'topic', keywords: ['developer tools', 'SDK', 'API', 'GitHub', 'Vercel'], sourceIds: [], priority: 'normal', enabled: true, createdAt: t, updatedAt: t },
      { id: react, name: 'React / Next.js', type: 'topic', keywords: ['React', 'Next.js', 'RSC', 'compiler'], sourceIds: [], priority: 'normal', enabled: true, createdAt: t, updatedAt: t },
    );
  }
  const sourceDefs: Array<[string, string, SourceKind, string]> = [
    ['Hacker News', 'https://hnrss.org/frontpage', 'hacker_news', 'community'],
    ['GitHub Blog', 'https://github.blog/feed/', 'blog', 'developer-tools'],
    ['Vercel Blog', 'https://vercel.com/atom', 'blog', 'developer-tools'],
    ['Google News: AI agents', 'https://news.google.com/rss/search?q=AI%20agents&hl=en-US&gl=US&ceid=US:en', 'google_news', 'ai'],
  ];
  for (const [name, url, kind, category] of sourceDefs) {
    if (!state.sources.some((s) => s.url === url)) state.sources.push({ id: createId(state, 'src'), name, url, kind, category, enabled: true, createdAt: t, updatedAt: t });
  }
  if (!state.articles.length) {
    const sourceId = state.sources[0]?.id ?? createId(state, 'src');
    const watchIds = state.watchlists.slice(0, 2).map((w) => w.id);
    state.articles.push(
      { id: createId(state, 'art'), sourceId, title: 'OpenAI launches new agent tooling for developers', url: 'https://example.com/openai-agent-tooling', fetchedAt: t, publishedAt: t, snippet: 'New SDK and orchestration primitives suggest agent workflows are moving from demos into infrastructure.', matchedWatchlistIds: watchIds, tags: ['launch', 'release'], status: 'new', importance: 92 },
      { id: createId(state, 'art'), sourceId, title: 'Vercel expands AI SDK with workflow primitives', url: 'https://example.com/vercel-ai-sdk', fetchedAt: t, publishedAt: t, snippet: 'The release targets teams building production agent experiences across web applications.', matchedWatchlistIds: watchIds, tags: ['release'], status: 'new', importance: 78 },
      { id: createId(state, 'art'), sourceId, title: 'React ecosystem discussion focuses on compiler adoption', url: 'https://example.com/react-compiler-adoption', fetchedAt: t, publishedAt: t, snippet: 'Developers are tracking migration paths, RSC patterns, and framework support.', matchedWatchlistIds: state.watchlists.slice(2, 3).map((w) => w.id), tags: ['release'], status: 'new', importance: 64 },
    );
  }
  recluster(state);
  return `Seeded demo radar: ${state.sources.length} sources, ${state.watchlists.length} watchlists, ${state.clusters.length} clusters.`;
}

export default function (pi: ExtensionAPI) {
  let statePath = '';
  pi.on('session_start', async (_event, ctx) => { statePath = resolveStatePath(ctx.cwd); });

  pi.registerTool({
    name: 'signal_desk',
    label: 'Signal Desk',
    description: 'Manage Signal Desk RSS intelligence. Actions include status, add_source, add_watchlist, refresh, list_articles, list_clusters, briefing, save_insight, create_action, mark, seed_demo.',
    parameters: Params,
    async execute(_toolCallId, params: ParamsValue, _signal, _onUpdate, ctx) {
      const resolvedPath = ctx ? resolveStatePath(ctx.cwd) : statePath;
      if (!resolvedPath) return textResult('Error: no workspace cwd');
      statePath = resolvedPath;
      let state: SignalDeskState;
      try {
        state = await readSignalDeskState(statePath);
      } catch (error) {
        if (error instanceof SignalDeskStateReadError) return stateReadErrorResult(error);
        throw error;
      }

      if (params.action === 'status') {
        return textResult(`Signal Desk: ${state.sources.length} sources, ${state.watchlists.length} watchlists, ${state.articles.length} articles, ${state.clusters.length} clusters, ${state.clusters.filter((c) => c.importance >= 75).length} high-signal stories.`, { state });
      }
      if (params.action === 'add_source') {
        if (!params.name || !params.url) return textResult('Error: name and url are required.');
        const source: FeedSource = { id: createId(state, 'src'), name: params.name, url: params.url, kind: (params.kind as SourceKind) ?? inferSourceKind(params.url), category: params.category, enabled: params.enabled ?? true, createdAt: now(), updatedAt: now() };
        state.sources.push(source); await writeSignalDeskState(statePath, state); return textResult(`Added source ${source.name}.`, { source });
      }
      if (params.action === 'update_source') {
        if (!params.id) return textResult('Error: id is required.');
        const source = state.sources.find((item) => item.id === params.id);
        if (!source) return textResult('Error: source not found.');
        if (params.name) source.name = params.name;
        if (params.url) { source.url = params.url; source.kind = (params.kind as SourceKind) ?? inferSourceKind(params.url); }
        if (params.category !== undefined) source.category = params.category;
        if (params.enabled !== undefined) source.enabled = params.enabled;
        source.updatedAt = now(); await writeSignalDeskState(statePath, state); return textResult(`Updated source ${source.name}.`, { source });
      }
      if (params.action === 'remove_source') {
        if (!params.id) return textResult('Error: id is required.');
        state.sources = state.sources.filter((source) => source.id !== params.id);
        state.watchlists = state.watchlists.map((watchlist) => ({ ...watchlist, sourceIds: watchlist.sourceIds.filter((id) => id !== params.id) }));
        state.articles = state.articles.filter((article) => article.sourceId !== params.id);
        recluster(state); await writeSignalDeskState(statePath, state); return textResult(`Removed source ${params.id}.`);
      }
      if (params.action === 'add_watchlist') {
        if (!params.name || !params.keywords?.length) return textResult('Error: name and keywords are required.');
        const watchlist: Watchlist = { id: createId(state, 'watch'), name: params.name, type: (params.type as WatchlistType) ?? 'topic', keywords: params.keywords, sourceIds: params.sourceIds ?? [], priority: (params.priority as Priority) ?? 'normal', enabled: params.enabled ?? true, createdAt: now(), updatedAt: now() };
        state.watchlists.push(watchlist); await writeSignalDeskState(statePath, state); return textResult(`Added watchlist ${watchlist.name}.`, { watchlist });
      }
      if (params.action === 'update_watchlist') {
        if (!params.id) return textResult('Error: id is required.');
        const watchlist = state.watchlists.find((item) => item.id === params.id);
        if (!watchlist) return textResult('Error: watchlist not found.');
        if (params.name) watchlist.name = params.name;
        if (params.type) watchlist.type = params.type as WatchlistType;
        if (params.keywords) watchlist.keywords = params.keywords;
        if (params.sourceIds) watchlist.sourceIds = params.sourceIds;
        if (params.priority) watchlist.priority = params.priority as Priority;
        if (params.enabled !== undefined) watchlist.enabled = params.enabled;
        watchlist.updatedAt = now(); await writeSignalDeskState(statePath, state); return textResult(`Updated watchlist ${watchlist.name}.`, { watchlist });
      }
      if (params.action === 'remove_watchlist') {
        if (!params.id) return textResult('Error: id is required.');
        state.watchlists = state.watchlists.filter((watchlist) => watchlist.id !== params.id);
        state.articles = state.articles.map((article) => ({ ...article, matchedWatchlistIds: article.matchedWatchlistIds.filter((id) => id !== params.id) }));
        recluster(state); await writeSignalDeskState(statePath, state); return textResult(`Removed watchlist ${params.id}.`);
      }
      if (params.action === 'seed_demo') {
        const msg = seedDemo(state); await writeSignalDeskState(statePath, state); return textResult(msg, { state });
      }
      if (params.action === 'refresh') {
        const sourceIds = params.sourceIds?.length ? params.sourceIds : state.sources.filter((s) => s.enabled).map((s) => s.id);
        const run: RefreshRun = { id: createId(state, 'run'), startedAt: now(), status: 'running', sourceIds, articlesAdded: 0, clustersAdded: 0, sourcesFetched: 0, sourcesFailed: 0, errors: [] };
        state.runs.unshift(run);
        const beforeClusters = state.clusters.length;
        for (const source of state.sources.filter((s) => sourceIds.includes(s.id))) {
          try {
            const fetched = await fetchSource(source, state);
            let added = 0;
            for (const article of fetched) {
              if (!state.articles.some((a) => a.url === article.url || a.id === article.id)) { state.articles.push(article); added += 1; }
            }
            source.lastFetchedAt = now(); source.lastError = undefined; run.articlesAdded += added; run.sourcesFetched = (run.sourcesFetched ?? 0) + 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            source.lastError = message; run.sourcesFailed = (run.sourcesFailed ?? 0) + 1; run.errors = [...(run.errors ?? []), `${source.name}: ${message}`];
          }
        }
        recluster(state);
        run.finishedAt = now(); run.clustersAdded = Math.max(0, state.clusters.length - beforeClusters);
        run.status = (run.sourcesFetched ?? 0) === 0 ? 'error' : (run.sourcesFailed ?? 0) > 0 ? 'partial' : 'success';
        run.error = run.status === 'error' ? (run.errors ?? []).join('; ') || 'No sources fetched' : undefined;
        await writeSignalDeskState(statePath, state); return textResult(`Refresh ${run.status}: ${run.articlesAdded} new articles, ${run.clustersAdded} new clusters, ${run.sourcesFetched ?? 0}/${sourceIds.length} sources fetched.`, { run });
      }
      if (params.action === 'list_articles') {
        const items = state.articles.filter((a) => !params.status || a.status === params.status as ItemStatus).filter((a) => !params.query || `${a.title} ${a.snippet ?? ''}`.toLowerCase().includes(params.query.toLowerCase())).slice(0, params.limit ?? 20);
        return textResult(items.map((a) => `- [${a.importance}] ${a.title} — ${a.url}`).join('\n') || 'No matching articles.', { articles: items });
      }
      if (params.action === 'list_clusters') {
        const items = state.clusters.filter((c) => !params.minImportance || c.importance >= params.minImportance).slice(0, params.limit ?? 12);
        return textResult(items.map((c) => `- ${c.id} [${c.importance}] ${c.headline} (${c.articleIds.length} sources)`).join('\n') || 'No clusters yet.', { clusters: items });
      }
      if (params.action === 'summarise_cluster') {
        const cluster = state.clusters.find((c) => c.id === params.clusterId);
        if (!cluster) return textResult('Error: clusterId not found.');
        const articles = cluster.articleIds.map((id) => state.articles.find((a) => a.id === id)).filter(Boolean) as Article[];
        return textResult(`Cluster: ${cluster.headline}\nSignal: ${cluster.importance}/100\nWhy it matters: ${articles[0]?.snippet ?? 'No snippet available.'}\nSources:\n${articles.map((a) => `- ${a.title}: ${a.url}`).join('\n')}`, { cluster, articles });
      }
      if (params.action === 'save_summary') {
        if (!params.clusterId || !params.body) return textResult('Error: clusterId and body are required.');
        const cluster = state.clusters.find((c) => c.id === params.clusterId);
        if (!cluster) return textResult('Error: clusterId not found.');
        cluster.summary = { text: params.body, generatedAt: now(), style: (params.style as BriefingStyle) ?? state.settings.defaultBriefingStyle };
        await writeSignalDeskState(statePath, state); return textResult(`Saved summary for ${cluster.headline}.`, { cluster });
      }
      if (params.action === 'recluster') {
        recluster(state); await writeSignalDeskState(statePath, state); return textResult(`Reclustered ${state.articles.length} articles into ${state.clusters.length} stories.`, { clusters: state.clusters });
      }
      if (params.action === 'merge_clusters') {
        const ids = params.clusterIds ?? [];
        if (ids.length < 2) return textResult('Error: clusterIds must contain at least two cluster IDs.');
        const clusters = state.clusters.filter((cluster) => ids.includes(cluster.id));
        if (clusters.length < 2) return textResult('Error: matching clusters not found.');
        const articleIds = [...new Set(clusters.flatMap((cluster) => cluster.articleIds))];
        const primary = clusters.sort((a, b) => b.importance - a.importance)[0]!;
        primary.articleIds = articleIds; primary.matchedWatchlistIds = [...new Set(clusters.flatMap((cluster) => cluster.matchedWatchlistIds))]; primary.tags = [...new Set(clusters.flatMap((cluster) => cluster.tags))]; primary.importance = Math.max(...clusters.map((cluster) => cluster.importance)); primary.latestSeenAt = clusters.sort((a, b) => b.latestSeenAt.localeCompare(a.latestSeenAt))[0]!.latestSeenAt;
        state.clusters = [primary, ...state.clusters.filter((cluster) => !ids.includes(cluster.id))].sort((a, b) => b.importance - a.importance);
        await writeSignalDeskState(statePath, state); return textResult(`Merged ${ids.length} clusters into ${primary.id}.`, { cluster: primary });
      }
      if (params.action === 'split_cluster') {
        if (!params.clusterId) return textResult('Error: clusterId is required.');
        const cluster = state.clusters.find((item) => item.id === params.clusterId);
        if (!cluster) return textResult('Error: clusterId not found.');
        const articles = cluster.articleIds.map((id) => state.articles.find((article) => article.id === id)).filter(Boolean) as Article[];
        state.clusters = [...state.clusters.filter((item) => item.id !== cluster.id), ...reclusterArticles(articles, [])].sort((a, b) => b.importance - a.importance);
        await writeSignalDeskState(statePath, state); return textResult(`Split ${cluster.id} into ${articles.length} article-level clusters.`, { clusters: state.clusters });
      }
      if (params.action === 'briefing') return textResult(buildBriefing(state, params), { clusters: state.clusters.slice(0, params.limit ?? 8) });
      if (params.action === 'save_insight') {
        if (!params.title || !params.body) return textResult('Error: title and body are required.');
        const insight = { id: createId(state, 'ins'), title: params.title, body: params.body, articleIds: params.articleIds ?? [], clusterIds: params.clusterIds ?? [], tags: params.tags ?? [], createdAt: now(), updatedAt: now() };
        state.insights.unshift(insight); await writeSignalDeskState(statePath, state); return textResult(`Saved insight: ${insight.title}`, { insight });
      }
      if (params.action === 'create_action') {
        if (!params.title) return textResult('Error: title is required.');
        const action: SignalAction = { id: createId(state, 'act'), title: params.title, description: params.description, articleIds: params.articleIds ?? [], clusterIds: params.clusterIds ?? [], insightIds: params.insightIds ?? [], priority: (params.priority as Priority) ?? 'normal', status: 'open', createdAt: now(), updatedAt: now() };
        state.actions.unshift(action); await writeSignalDeskState(statePath, state); return textResult(`Created action: ${action.title}`, { action });
      }
      if (params.action === 'mark') {
        const status = (params.status ?? 'seen') as ItemStatus;
        state.articles = state.articles.map((a) => params.articleIds?.includes(a.id) ? { ...a, status } : a);
        state.clusters = state.clusters.map((c) => params.clusterIds?.includes(c.id) ? { ...c, status } : c);
        await writeSignalDeskState(statePath, state); return textResult(`Marked selected items as ${status}.`);
      }
      return textResult(`Unknown action: ${params.action}`);
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg('toolTitle', theme.bold('signal_desk '))}${theme.fg('muted', args.action)}`, 0, 0);
    },
  });

  pi.registerCommand('open-signal-desk-briefing', {
    description: 'Ask the agent for a Signal Desk briefing',
    handler: async () => pi.sendUserMessage('Use Signal Desk to create a concise briefing for this workspace.'),
  });
}
