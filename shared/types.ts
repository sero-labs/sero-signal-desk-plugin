export type SourceKind =
  | 'rss'
  | 'atom'
  | 'google_news'
  | 'github_releases'
  | 'hacker_news'
  | 'blog'
  | 'custom';

export type WatchlistType = 'topic' | 'company' | 'repo' | 'person' | 'keyword';
export type Priority = 'low' | 'normal' | 'high';
export type ItemStatus = 'new' | 'seen' | 'saved' | 'dismissed';
export type ActionStatus = 'open' | 'done' | 'dismissed';
export type BriefingStyle = 'brief' | 'executive' | 'technical' | 'founder';
export type ActiveView = 'stream' | 'briefing' | 'insights' | 'actions' | 'settings';

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  category?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastFetchedAt?: string;
  lastError?: string;
}

export interface Watchlist {
  id: string;
  name: string;
  type: WatchlistType;
  keywords: string[];
  sourceIds: string[];
  priority: Priority;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Article {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  author?: string;
  publishedAt?: string;
  fetchedAt: string;
  snippet?: string;
  contentHash?: string;
  matchedWatchlistIds: string[];
  tags: string[];
  status: ItemStatus;
  importance: number;
}

export interface StoryCluster {
  id: string;
  headline: string;
  articleIds: string[];
  matchedWatchlistIds: string[];
  tags: string[];
  importance: number;
  firstSeenAt: string;
  latestSeenAt: string;
  status: ItemStatus;
  summary?: {
    text: string;
    generatedAt: string;
    style: BriefingStyle;
  };
  suggestedActions?: string[];
}

export interface SavedInsight {
  id: string;
  title: string;
  body: string;
  articleIds: string[];
  clusterIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SignalAction {
  id: string;
  title: string;
  description?: string;
  articleIds: string[];
  clusterIds: string[];
  insightIds: string[];
  priority: Priority;
  status: ActionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BriefingRecord {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface RefreshRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'partial' | 'error';
  sourceIds: string[];
  articlesAdded: number;
  clustersAdded: number;
  sourcesFetched?: number;
  sourcesFailed?: number;
  errors?: string[];
  error?: string;
}

export interface SignalDeskState {
  version: number;
  nextId: number;
  settings: {
    refreshIntervalMinutes: number | null;
    defaultBriefingStyle: BriefingStyle;
    autoCluster: boolean;
    maxArticlesPerSource: number;
  };
  sources: FeedSource[];
  watchlists: Watchlist[];
  articles: Article[];
  clusters: StoryCluster[];
  insights: SavedInsight[];
  actions: SignalAction[];
  briefings: BriefingRecord[];
  runs: RefreshRun[];
  ui: {
    selectedWatchlistId?: string;
    selectedClusterId?: string;
    selectedArticleId?: string;
    activeView: ActiveView;
    searchQuery: string;
  };
}

export const DEFAULT_STATE: SignalDeskState = {
  version: 1,
  nextId: 1,
  settings: {
    refreshIntervalMinutes: null,
    defaultBriefingStyle: 'executive',
    autoCluster: true,
    maxArticlesPerSource: 20,
  },
  sources: [],
  watchlists: [],
  articles: [],
  clusters: [],
  insights: [],
  actions: [],
  briefings: [],
  runs: [],
  ui: {
    activeView: 'stream',
    searchQuery: '',
  },
};

export function normaliseState(input: Partial<SignalDeskState> | null | undefined): SignalDeskState {
  return {
    ...DEFAULT_STATE,
    ...(input ?? {}),
    settings: { ...DEFAULT_STATE.settings, ...(input?.settings ?? {}) },
    ui: { ...DEFAULT_STATE.ui, ...(input?.ui ?? {}) },
    sources: [...(input?.sources ?? [])],
    watchlists: [...(input?.watchlists ?? [])],
    articles: [...(input?.articles ?? [])],
    clusters: [...(input?.clusters ?? [])],
    insights: [...(input?.insights ?? [])],
    actions: [...(input?.actions ?? [])],
    briefings: [...(input?.briefings ?? [])],
    runs: [...(input?.runs ?? [])],
    nextId: Math.max(input?.nextId ?? 1, 1),
  };
}

export function createId(state: SignalDeskState, prefix: string): string {
  const id = `${prefix}_${state.nextId}`;
  state.nextId += 1;
  return id;
}
