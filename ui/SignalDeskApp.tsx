import { Component, type ButtonHTMLAttributes, type Context, type ReactNode } from 'react';
import { dailyDigest, highSignalNotifications } from '../shared/advanced-intelligence';
import { exportOpml } from '../shared/opml';
import actionsScreenshot from './guide-assets/actions.png';
import briefingScreenshot from './guide-assets/briefing.png';
import insightsScreenshot from './guide-assets/insights.png';
import settingsScreenshot from './guide-assets/settings.png';
import streamScreenshot from './guide-assets/stream.png';
import { createGithubReleasesSource, createGoogleNewsSource, createHackerNewsNewestSource, inferSourceKind } from '../shared/source-helpers';
import type { ActiveView, FeedSource, SignalDeskState, Watchlist } from '../shared/types';
import { createId, DEFAULT_STATE, normaliseState } from '../shared/types';
import './styles.css';

type AppContextValue = {
  appId?: string;
  workspaceId?: string;
  stateFilePath: string;
  promptAgent?: (prompt: string) => void;
};

type SeroGlobal = {
  appState: {
    read<T>(path: string): Promise<T | null>;
    write<T>(path: string, state: T): Promise<void>;
    watch(path: string): Promise<unknown>;
    unwatch(path: string): void;
    onChange(callback: (path: string, state: unknown) => void): () => void;
  };
  appAgent: {
    invokeTool?(appId: string, workspaceId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  };
};

declare global {
  var __sero_app_context__: Context<AppContextValue | null> | undefined;
  interface Window { sero?: SeroGlobal; }
}

const appContext = globalThis.__sero_app_context__;

function getSero(): SeroGlobal {
  if (!window.sero) throw new Error('[Signal Desk] window.sero not available — must run inside Sero');
  return window.sero;
}

function currentTime(): string {
  return new Date().toISOString();
}

function sourceName(source: FeedSource | undefined): string {
  return source?.name ?? 'Unknown source';
}

function formatDate(value: string | undefined): string {
  if (!value) return 'undated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function watchlistNames(ids: string[], state: SignalDeskState): string {
  return ids.map((id) => state.watchlists.find((watchlist) => watchlist.id === id)?.name).filter(Boolean).join(', ') || 'No watchlist match';
}

function Button({ children, className = '', size = 'default', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; size?: 'default' | 'sm'; variant?: 'primary' | 'secondary' | 'ghost'; }) {
  return <button className={`sd-button ${size} ${variant} ${className}`.trim()} {...props}>{children}</button>;
}

type SignalDeskComponentState = {
  rawState: SignalDeskState;
  busy: string | null;
  briefing: string;
  sourceDraft: { name: string; url: string };
  watchDraft: { name: string; keywords: string };
  streamFilter: 'active' | 'saved' | 'dismissed' | 'all';
  showAdvancedSources: boolean;
  showAddWatchlist: boolean;
  showGuide: boolean;
};

export class SignalDeskApp extends Component<Record<string, never>, SignalDeskComponentState> {
  static contextType = appContext;
  declare context: AppContextValue | null;

  private unsubscribe: (() => void) | undefined;
  private active = false;
  private writeId = 0;

  state: SignalDeskComponentState = {
    rawState: DEFAULT_STATE,
    busy: null,
    briefing: '',
    sourceDraft: { name: '', url: '' },
    watchDraft: { name: '', keywords: '' },
    streamFilter: 'active',
    showAdvancedSources: false,
    showAddWatchlist: false,
    showGuide: false,
  };

  componentDidMount(): void {
    const ctx = this.context;
    if (!ctx?.stateFilePath) return;
    const sero = getSero();
    this.active = true;
    this.unsubscribe = sero.appState.onChange((path, next) => {
      if (path === ctx.stateFilePath && next != null && this.active) this.setState({ rawState: normaliseState(next as Partial<SignalDeskState>) });
    });
    sero.appState.watch(ctx.stateFilePath).then((next) => {
      if (next != null && this.active) this.setState({ rawState: normaliseState(next as Partial<SignalDeskState>) });
    });
  }

  componentWillUnmount(): void {
    const ctx = this.context;
    this.active = false;
    this.unsubscribe?.();
    if (ctx?.stateFilePath && window.sero) window.sero.appState.unwatch(ctx.stateFilePath);
  }

  private updateAppState = (updater: (previous: SignalDeskState) => SignalDeskState): void => {
    const ctx = this.context;
    if (!ctx?.stateFilePath) return;
    const previous = normaliseState(this.state.rawState);
    const next = updater(previous);
    const writeId = this.writeId + 1;
    this.writeId = writeId;
    this.setState({ rawState: next });
    const sero = getSero();
    sero.appState.write(ctx.stateFilePath, next).catch((error) => {
      if (writeId === this.writeId) {
        console.warn(`[Signal Desk] Failed to persist app state for ${ctx.stateFilePath}`, error);
        this.setState({ rawState: previous });
      }
    });
  };

  private prompt = (message: string): void => {
    if (!this.context?.promptAgent) {
      console.warn('[Signal Desk] No promptAgent in context — prompt dropped');
      return;
    }
    this.context.promptAgent(message);
  };

  private runTool = async (label: string, args: Record<string, unknown>): Promise<void> => {
    const ctx = this.context;
    if (!ctx?.appId || !ctx.workspaceId) throw new Error('[Signal Desk] No app context — must run inside Sero');
    const invokeTool = getSero().appAgent.invokeTool;
    if (!invokeTool) throw new Error('[Signal Desk] App tool bridge unavailable');

    this.setState({ busy: label });
    try {
      const result = await invokeTool(ctx.appId, ctx.workspaceId, 'signal_desk', args) as { content?: Array<{ type: string; text?: string }> } | undefined;
      const text = result?.content?.[0]?.type === 'text' ? result.content[0].text ?? '' : '';
      if (args.action === 'briefing') {
        this.setState({ briefing: text });
        this.updateAppState((prev) => ({
          ...prev,
          briefings: [{ id: createId(prev, 'brief'), type: String(args.briefingType ?? 'today'), title: `Briefing: ${String(args.briefingType ?? 'today')}`, body: text, createdAt: currentTime() }, ...prev.briefings].slice(0, 25),
        }));
      }
    } finally {
      this.setState({ busy: null });
    }
  };

  private setView = (activeView: ActiveView): void => this.updateAppState((prev) => ({ ...prev, ui: { ...prev.ui, activeView } }));
  private setSelectedWatchlist = (id?: string): void => this.updateAppState((prev) => ({ ...prev, ui: { ...prev.ui, selectedWatchlistId: id, selectedClusterId: undefined } }));
  private setSelectedCluster = (id: string): void => this.updateAppState((prev) => ({ ...prev, ui: { ...prev.ui, selectedClusterId: id } }));
  private setSearch = (searchQuery: string): void => this.updateAppState((prev) => ({ ...prev, ui: { ...prev.ui, searchQuery } }));

  private addSource = (): void => {
    const name = this.state.sourceDraft.name.trim();
    const url = this.state.sourceDraft.url.trim();
    if (!name || !url) return;
    this.addSourceRecord(name, url);
    this.setState({ sourceDraft: { name: '', url: '' } });
  };

  private addSourceRecord = (name: string, url: string, category?: string): void => {
    this.updateAppState((previous) => {
      const next = normaliseState(previous);
      if (next.sources.some((source) => source.url === url)) return next;
      const stamp = currentTime();
      next.sources = [...next.sources, { id: createId(next, 'src'), name, url, kind: inferSourceKind(url), category, enabled: true, createdAt: stamp, updatedAt: stamp }];
      return { ...next };
    });
  };

  private addGoogleNewsSource = (): void => {
    const source = createGoogleNewsSource(this.state.sourceDraft.name.trim() || this.state.sourceDraft.url.trim());
    this.addSourceRecord(source.name, source.url, source.category);
    this.setState({ sourceDraft: { name: '', url: '' } });
  };

  private addGithubReleaseSource = (): void => {
    const source = createGithubReleasesSource(this.state.sourceDraft.name.trim() || this.state.sourceDraft.url.trim());
    if (!source) return;
    this.addSourceRecord(source.name, source.url, source.category);
    this.setState({ sourceDraft: { name: '', url: '' } });
  };

  private addHackerNewsSource = (): void => {
    const source = createHackerNewsNewestSource();
    this.addSourceRecord(source.name, source.url, source.category);
  };

  private addWatchlist = (): void => {
    const name = this.state.watchDraft.name.trim();
    const keywords = this.state.watchDraft.keywords.split(',').map((item) => item.trim()).filter(Boolean);
    if (!name || !keywords.length) return;
    this.updateAppState((previous) => {
      const next = normaliseState(previous);
      const stamp = currentTime();
      const watchlist: Watchlist = { id: createId(next, 'watch'), name, type: 'topic', keywords, sourceIds: [], priority: 'normal', enabled: true, createdAt: stamp, updatedAt: stamp };
      next.watchlists = [...next.watchlists, watchlist];
      return { ...next };
    });
    this.setState({ watchDraft: { name: '', keywords: '' } });
  };

  private toggleWatchlist = (id: string): void => this.updateAppState((prev) => ({ ...prev, watchlists: prev.watchlists.map((item) => item.id === id ? { ...item, enabled: !item.enabled, updatedAt: currentTime() } : item) }));
  private removeWatchlist = (id: string): void => this.updateAppState((prev) => ({ ...prev, watchlists: prev.watchlists.filter((item) => item.id !== id), articles: prev.articles.map((article) => ({ ...article, matchedWatchlistIds: article.matchedWatchlistIds.filter((watchId) => watchId !== id) })), ui: { ...prev.ui, selectedWatchlistId: prev.ui.selectedWatchlistId === id ? undefined : prev.ui.selectedWatchlistId } }));
  private editWatchlist = (id: string): void => this.updateAppState((prev) => {
    const watchlist = prev.watchlists.find((item) => item.id === id);
    if (!watchlist) return prev;
    const name = window.prompt('Watchlist name', watchlist.name)?.trim() || watchlist.name;
    const keywordsRaw = window.prompt('Keywords, comma separated', watchlist.keywords.join(', ')) ?? watchlist.keywords.join(', ');
    const type = (window.prompt('Type: topic, company, repo, person, keyword', watchlist.type) || watchlist.type) as Watchlist['type'];
    const priority = (window.prompt('Priority: low, normal, high', watchlist.priority) || watchlist.priority) as Watchlist['priority'];
    return { ...prev, watchlists: prev.watchlists.map((item) => item.id === id ? { ...item, name, type, priority, keywords: keywordsRaw.split(',').map((keyword) => keyword.trim()).filter(Boolean), updatedAt: currentTime() } : item) };
  });
  private toggleSource = (id: string): void => this.updateAppState((prev) => ({ ...prev, sources: prev.sources.map((item) => item.id === id ? { ...item, enabled: !item.enabled, updatedAt: currentTime() } : item) }));
  private removeSource = (id: string): void => this.updateAppState((prev) => ({ ...prev, sources: prev.sources.filter((item) => item.id !== id), articles: prev.articles.filter((article) => article.sourceId !== id), clusters: prev.clusters.filter((cluster) => cluster.articleIds.some((articleId) => prev.articles.some((article) => article.id === articleId && article.sourceId !== id))) }));
  private editSource = (id: string): void => this.updateAppState((prev) => {
    const source = prev.sources.find((item) => item.id === id);
    if (!source) return prev;
    const name = window.prompt('Source name', source.name)?.trim() || source.name;
    const url = window.prompt('Source URL', source.url)?.trim() || source.url;
    const category = window.prompt('Source category', source.category ?? '')?.trim() || source.category;
    return { ...prev, sources: prev.sources.map((item) => item.id === id ? { ...item, name, url, category, kind: inferSourceKind(url), updatedAt: currentTime() } : item) };
  });
  private markArticle = (id: string, status: 'new' | 'seen' | 'saved' | 'dismissed'): void => this.updateAppState((prev) => ({ ...prev, articles: prev.articles.map((article) => article.id === id ? { ...article, status } : article) }));
  private markCluster = (id: string, status: 'new' | 'seen' | 'saved' | 'dismissed'): void => this.updateAppState((prev) => {
    const cluster = prev.clusters.find((item) => item.id === id);
    if (!cluster) return prev;
    return { ...prev, clusters: prev.clusters.map((item) => item.id === id ? { ...item, status } : item), articles: prev.articles.map((article) => cluster.articleIds.includes(article.id) ? { ...article, status } : article) };
  });
  private markAllSeen = (): void => this.updateAppState((prev) => ({ ...prev, clusters: prev.clusters.map((cluster) => cluster.status === 'dismissed' ? cluster : { ...cluster, status: 'seen' }), articles: prev.articles.map((article) => article.status === 'dismissed' ? article : { ...article, status: 'seen' }) }));
  private updateActionStatus = (id: string, status: 'open' | 'done' | 'dismissed'): void => this.updateAppState((prev) => ({ ...prev, actions: prev.actions.map((action) => action.id === id ? { ...action, status, updatedAt: currentTime() } : action) }));
  private editAction = (id: string): void => this.updateAppState((prev) => {
    const action = prev.actions.find((item) => item.id === id);
    if (!action) return prev;
    const title = window.prompt('Action title', action.title)?.trim() || action.title;
    const description = window.prompt('Action description', action.description ?? '') ?? action.description;
    const priority = (window.prompt('Priority: low, normal, high', action.priority) || action.priority) as 'low' | 'normal' | 'high';
    return { ...prev, actions: prev.actions.map((item) => item.id === id ? { ...item, title, description, priority, updatedAt: currentTime() } : item) };
  });
  private createInsight = (): void => this.updateAppState((prev) => {
    const title = window.prompt('Insight title')?.trim();
    const body = window.prompt('Insight body')?.trim();
    if (!title || !body) return prev;
    return { ...prev, insights: [{ id: createId(prev, 'ins'), title, body, articleIds: [], clusterIds: prev.ui.selectedClusterId ? [prev.ui.selectedClusterId] : [], tags: [], createdAt: currentTime(), updatedAt: currentTime() }, ...prev.insights] };
  });
  private editInsight = (id: string): void => this.updateAppState((prev) => {
    const insight = prev.insights.find((item) => item.id === id);
    if (!insight) return prev;
    const title = window.prompt('Insight title', insight.title)?.trim() || insight.title;
    const body = window.prompt('Insight body', insight.body)?.trim() || insight.body;
    return { ...prev, insights: prev.insights.map((item) => item.id === id ? { ...item, title, body, updatedAt: currentTime() } : item) };
  });
  private deleteInsight = (id: string): void => this.updateAppState((prev) => ({ ...prev, insights: prev.insights.filter((insight) => insight.id !== id) }));
  private refreshSource = (id: string): void => { void this.runTool('refresh', { action: 'refresh', sourceIds: [id] }); };
  private refreshFailedSources = (): void => { const ids = normaliseState(this.state.rawState).sources.filter((source) => source.lastError).map((source) => source.id); if (ids.length) void this.runTool('refresh', { action: 'refresh', sourceIds: ids }); };
  private copyOpml = (): void => { void navigator.clipboard?.writeText(exportOpml(normaliseState(this.state.rawState).sources)); };
  private importOpml = (): void => { this.prompt('Import OPML into Signal Desk by extracting feed names and xmlUrl values, then call signal_desk add_source for each feed.'); };
  private sendActionToKanban = (id: string): void => this.prompt(`Create a Kanban card from Signal Desk action ${id}.`);
  private createReminderFromAction = (id: string): void => this.prompt(`Create a reminder from Signal Desk action ${id}.`);
  private exportInsightToMemory = (id: string): void => this.prompt(`Save Signal Desk insight ${id} to durable memory or notes if available.`);

  render() {
    const state = normaliseState(this.state.rawState);
    const selectedWatchlist = state.ui.selectedWatchlistId;
    const query = state.ui.searchQuery.toLowerCase();
    const filteredClusters = state.clusters
      .filter((cluster) => this.state.streamFilter === 'all' || (this.state.streamFilter === 'active' ? cluster.status !== 'dismissed' : cluster.status === this.state.streamFilter))
      .filter((cluster) => !selectedWatchlist || cluster.matchedWatchlistIds.includes(selectedWatchlist))
      .filter((cluster) => !query || cluster.headline.toLowerCase().includes(query) || cluster.tags.join(' ').includes(query))
      .sort((a, b) => b.importance - a.importance);
    const selectedCluster = state.clusters.find((cluster) => cluster.id === state.ui.selectedClusterId) ?? filteredClusters[0];
    const highSignal = state.clusters.filter((cluster) => cluster.importance >= 75).length;
    const latestRun = state.runs[0];

    const failedCount = state.sources.filter((source) => source.lastError).length;

    return (
      <div className="signal-desk-shell" tabIndex={0}>
        <header className="signal-header">
          <div className="brand-block">
            <div className="brand-mark">SD</div>
            <div>
              <h1>Signal Desk</h1>
              <p>{state.clusters.length} stories · {highSignal} high signal · {highSignalNotifications(state.clusters).length} alerts</p>
            </div>
          </div>
          <div className="header-actions">
            <input value={state.ui.searchQuery} onChange={(event) => this.setSearch(event.target.value)} placeholder="Search signal..." />
            <Button size="sm" onClick={() => this.runTool('refresh', { action: 'refresh' })} disabled={!!this.state.busy} title="Refresh all sources">{this.state.busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</Button>
            <button className={this.state.showGuide ? 'help-button active' : 'help-button'} type="button" onClick={() => this.setState({ showGuide: !this.state.showGuide })} title={this.state.showGuide ? 'Back to Signal Desk' : 'Open Signal Desk guide'} aria-label={this.state.showGuide ? 'Back to Signal Desk' : 'Open Signal Desk guide'} aria-pressed={this.state.showGuide}>?</button>
          </div>
        </header>

        {this.state.showGuide ? (
          <HelpGuide onBack={() => this.setState({ showGuide: false })} />
        ) : (
        <main className="desk-grid">
          <aside className="watch-rail">
            <div className="rail-head">
              <div className="rail-title">Watchlists</div>
              <button className="rail-add" onClick={() => this.setState({ showAddWatchlist: !this.state.showAddWatchlist })} title="Add watchlist">{this.state.showAddWatchlist ? '×' : '+'}</button>
            </div>
            {this.state.showAddWatchlist ? (
              <div className="quick-add">
                <input value={this.state.watchDraft.name} onChange={(event) => this.setState({ watchDraft: { ...this.state.watchDraft, name: event.target.value } })} placeholder="Name (e.g. AI Agents)" />
                <input value={this.state.watchDraft.keywords} onChange={(event) => this.setState({ watchDraft: { ...this.state.watchDraft, keywords: event.target.value } })} placeholder="Keywords, comma separated" />
                <Button size="sm" variant="secondary" onClick={() => { this.addWatchlist(); this.setState({ showAddWatchlist: false }); }}>Add radar</Button>
              </div>
            ) : null}
            <div className="watch-rail-scroll">
              <button className={!selectedWatchlist ? 'watch-item active' : 'watch-item'} onClick={() => this.setSelectedWatchlist(undefined)}><span>All Signal</span><b>{state.clusters.length}</b></button>
              {state.watchlists.map((watchlist) => {
                const count = state.clusters.filter((cluster) => cluster.matchedWatchlistIds.includes(watchlist.id)).length;
                return (
                  <div key={watchlist.id} className={selectedWatchlist === watchlist.id ? 'watch-row active' : 'watch-row'}>
                    <button className="watch-item" onClick={() => this.setSelectedWatchlist(watchlist.id)}>
                      <span><i className={`dot ${watchlist.priority}${watchlist.enabled ? '' : ' off'}`} />{watchlist.name}</span>
                      <b>{count}</b>
                    </button>
                    <div className="watch-row-actions">
                      <button className="mini-action" title="Edit" onClick={() => this.editWatchlist(watchlist.id)}>✎</button>
                      <button className="mini-action" title={watchlist.enabled ? 'Disable' : 'Enable'} onClick={() => this.toggleWatchlist(watchlist.id)}>{watchlist.enabled ? '◉' : '○'}</button>
                      <button className="mini-action danger" title="Remove" onClick={() => this.removeWatchlist(watchlist.id)}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="story-stream">
            <div className="stream-tabs">{(['stream', 'briefing', 'insights', 'actions', 'settings'] as ActiveView[]).map((view) => <button key={view} className={state.ui.activeView === view ? 'active' : ''} onClick={() => this.setView(view)}>{view}</button>)}</div>
            {state.clusters.length === 0 && state.ui.activeView !== 'settings' ? <EmptyState onSeed={() => this.runTool('seed', { action: 'seed_demo', profile: 'ai_tools' })} /> : null}
            {state.ui.activeView === 'stream' && state.clusters.length > 0 ? <ClusterList clusters={filteredClusters} state={state} selectedId={state.ui.selectedClusterId} filter={this.state.streamFilter} setFilter={(streamFilter) => this.setState({ streamFilter })} onSelect={this.setSelectedCluster} onMarkAllSeen={this.markAllSeen} /> : null}
            {state.ui.activeView === 'briefing' ? <BriefingPanel briefing={this.state.briefing} busy={this.state.busy === 'brief'} onBrief={(briefingType) => this.runTool('brief', { action: 'briefing', briefingType, limit: 8 })} onSaveInsight={() => this.state.briefing && this.runTool('save-insight', { action: 'save_insight', title: 'Saved briefing', body: this.state.briefing, tags: ['briefing'] })} onCreateAction={() => this.state.briefing && this.runTool('create-action', { action: 'create_action', title: 'Review Signal Desk briefing', description: this.state.briefing.slice(0, 500), priority: 'normal' })} /> : null}
            {state.ui.activeView === 'insights' ? <InsightsPanel state={state} createInsight={this.createInsight} editInsight={this.editInsight} deleteInsight={this.deleteInsight} exportInsightToMemory={this.exportInsightToMemory} /> : null}
            {state.ui.activeView === 'actions' ? <ActionsPanel state={state} updateActionStatus={this.updateActionStatus} editAction={this.editAction} sendActionToKanban={this.sendActionToKanban} createReminderFromAction={this.createReminderFromAction} /> : null}
            {state.ui.activeView === 'settings' ? <SettingsPanel sourceDraft={this.state.sourceDraft} setSourceDraft={(sourceDraft) => this.setState({ sourceDraft })} addSource={this.addSource} addGoogleNewsSource={this.addGoogleNewsSource} addGithubReleaseSource={this.addGithubReleaseSource} addHackerNewsSource={this.addHackerNewsSource} toggleSource={this.toggleSource} editSource={this.editSource} removeSource={this.removeSource} refreshSource={this.refreshSource} refreshFailedSources={this.refreshFailedSources} refreshEnabledSources={() => this.runTool('refresh', { action: 'refresh' })} copyOpml={this.copyOpml} importOpml={this.importOpml} seedDemo={() => this.runTool('seed', { action: 'seed_demo', profile: 'ai_tools' })} state={state} latestRun={latestRun} failedCount={failedCount} showAdvanced={this.state.showAdvancedSources} setShowAdvanced={(showAdvancedSources) => this.setState({ showAdvancedSources })} /> : null}
          </section>

          <aside className="briefing-desk">
            <div className="panel-label">Briefing desk</div>
            <div className="briefing-body">
              {selectedCluster ? <SelectedStory cluster={selectedCluster} state={state} prompt={this.prompt} markArticle={this.markArticle} markCluster={this.markCluster} /> : <p className="muted">Select a story to brief, save, or turn into action.</p>}
            </div>
          </aside>
        </main>
        )}
      </div>
    );
  }
}

const guideScreenshots = [
  { src: streamScreenshot, title: 'Stream and briefing desk', caption: 'Triage clustered stories, filter noise, and use the briefing desk to summarise, save, or turn a story into an action.' },
  { src: briefingScreenshot, title: 'Briefing presets', caption: 'Generate repeatable briefings such as Today’s Signal, Launch Watch, Competitor Radar, Security, and Repo Releases.' },
  { src: insightsScreenshot, title: 'Saved insights', caption: 'Keep durable conclusions separate from raw articles, then export the ones that should become long-term Sero context.' },
  { src: actionsScreenshot, title: 'Follow-up actions', caption: 'Convert stories and briefings into tasks, then hand them to Kanban or Reminders through the Sero agent.' },
  { src: settingsScreenshot, title: 'Sources and imports', caption: 'Maintain RSS/Atom sources, use Google News/GitHub/Hacker News helpers, refresh failed feeds, and copy or import OPML.' },
];

function HelpGuide({ onBack }: { onBack: () => void }) {
  return (
    <main className="guide-page" aria-labelledby="signal-desk-guide-title">
      <section className="guide-hero">
        <div>
          <p className="guide-kicker">End-user workflow</p>
          <h2 id="signal-desk-guide-title">Using Signal Desk with Sero</h2>
          <p>Signal Desk is an RSS-first intelligence desk. Add feeds and watchlists, refresh them into story clusters, then use Sero to turn the important signals into briefings, saved insights, actions, Kanban cards, reminders, or deeper research.</p>
        </div>
        <Button variant="secondary" onClick={onBack}>Back to desk</Button>
      </section>

      <section className="guide-quickstart" aria-label="Recommended daily workflow">
        {['Refresh enabled sources', 'Triage the stream', 'Summarise high-signal stories', 'Save durable insights', 'Create follow-up actions', 'Send tasks to Kanban or Reminders'].map((step, index) => (
          <article key={step}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{step}</strong>
          </article>
        ))}
      </section>

      <section className="guide-section guide-workflow">
        <div className="guide-section-head">
          <p className="guide-kicker">Core concepts</p>
          <h3>The Signal Desk loop</h3>
        </div>
        <div className="guide-cards">
          <article><h4>Sources</h4><p>RSS or Atom feeds from blogs, changelogs, security feeds, GitHub releases, Hacker News, Google News searches, or company sites.</p></article>
          <article><h4>Watchlists</h4><p>Named radars with keywords and priority. Keep them specific: companies, repos, product categories, security issues, or people.</p></article>
          <article><h4>Stories</h4><p>Signal Desk clusters related articles into stories, scores them, and sorts the stream by importance so you can work top-down.</p></article>
          <article><h4>Briefings</h4><p>Briefings turn clusters into judgement: what changed, why it matters, evidence, and recommended next steps.</p></article>
          <article><h4>Insights</h4><p>Insights are durable conclusions worth keeping. Save judgement, not raw article lists.</p></article>
          <article><h4>Actions</h4><p>Actions are the operational follow-ups: review a release, compare a competitor, investigate an incident, or schedule a check-in.</p></article>
        </div>
      </section>

      <section className="guide-section guide-screenshots">
        <div className="guide-section-head">
          <p className="guide-kicker">Application tour</p>
          <h3>What each area is for</h3>
        </div>
        <div className="guide-shot-grid">
          {guideScreenshots.map((shot) => (
            <figure key={shot.title}>
              <img src={shot.src} alt={`${shot.title} screenshot`} loading="lazy" />
              <figcaption><strong>{shot.title}</strong><span>{shot.caption}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="guide-section guide-tools">
        <div className="guide-section-head">
          <p className="guide-kicker">Sero hand-offs</p>
          <h3>Use Signal Desk with the rest of Sero</h3>
        </div>
        <div className="guide-tool-list">
          <article><h4>Agent prompts</h4><p>Ask: “Give me today’s Signal Desk briefing”, “Summarise the top story in founder style”, or “Turn the top three stories into actions”.</p></article>
          <article><h4>Memory</h4><p>Use <b>To memory</b> for durable insights: market direction, competitor positioning, repeated technical signals, or strategic implications.</p></article>
          <article><h4>Kanban</h4><p>Use <b>→ Kanban</b> on actions when follow-up becomes real work. Briefing → action → Kanban is the recommended execution path.</p></article>
          <article><h4>Reminders</h4><p>Create reminders for time-sensitive intelligence: release dates, security follow-ups, competitor launches, or “check again next week”.</p></article>
          <article><h4>Browser and web tools</h4><p>Use Signal Desk for discovery, then ask Sero to fetch original articles, compare announcements, or open sources for deeper research.</p></article>
          <article><h4>Repo workflows</h4><p>For GitHub release sources, ask Sero to check whether this workspace depends on affected packages or needs migration work.</p></article>
        </div>
      </section>

      <section className="guide-section guide-reference">
        <div>
          <h3>Useful commands and prompts</h3>
          <pre>{`sero signal_desk status\nsero signal_desk refresh\nsero signal_desk list_clusters --limit 10\nsero signal_desk briefing --briefingType today --limit 5`}</pre>
        </div>
        <div>
          <h3>Best practices</h3>
          <ul>
            <li>Use high priority only for watchlists that genuinely matter.</li>
            <li>Dismiss aggressively so the stream stays useful.</li>
            <li>Save conclusions as insights; do not save raw article dumps.</li>
            <li>Turn only high-signal stories into actions.</li>
            <li>Use OPML export/import in Settings to move or bulk-load sources.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}

function ClusterList({ clusters, state, selectedId, filter, setFilter, onSelect, onMarkAllSeen }: { clusters: SignalDeskState['clusters']; state: SignalDeskState; selectedId?: string; filter: 'active' | 'saved' | 'dismissed' | 'all'; setFilter: (filter: 'active' | 'saved' | 'dismissed' | 'all') => void; onSelect: (id: string) => void; onMarkAllSeen: () => void }) {
  return (
    <div className="stream-body">
      <div className="filter-row">
        <div className="segmented">
          {(['active', 'saved', 'dismissed', 'all'] as const).map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        <button className="text-link" onClick={onMarkAllSeen}>Mark all seen</button>
      </div>
      <div className="cluster-list">
        {clusters.map((cluster) => {
          const articles = cluster.articleIds.flatMap((id) => { const article = state.articles.find((item) => item.id === id); return article ? [article] : []; });
          const isHigh = cluster.importance >= 75;
          return (
            <article key={cluster.id} className={selectedId === cluster.id ? 'cluster-card selected' : 'cluster-card'} onClick={() => onSelect(cluster.id)}>
              <div className="cluster-meta">
                <span className={`pill-signal${isHigh ? ' high' : ''}`}>{isHigh ? '◆ High signal' : '◇ Signal'}</span>
                <span>{cluster.status}</span>
                <span>{articles.length} source{articles.length === 1 ? '' : 's'}</span>
              </div>
              <h2>{cluster.headline}</h2>
              <p>{articles[0]?.snippet ?? 'No summary yet — ask the agent to summarise this story.'}</p>
              {cluster.tags.length ? <div className="chip-row">{cluster.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SelectedStory({ cluster, state, prompt, markArticle, markCluster }: { cluster: SignalDeskState['clusters'][number]; state: SignalDeskState; prompt: (message: string) => void; markArticle: (id: string, status: 'new' | 'seen' | 'saved' | 'dismissed') => void; markCluster: (id: string, status: 'new' | 'seen' | 'saved' | 'dismissed') => void }) {
  const articles = cluster.articleIds.flatMap((id) => { const article = state.articles.find((item) => item.id === id); return article ? [article] : []; });
  const isHigh = cluster.importance >= 75;
  return (
    <div className="selected-story">
      <div className="story-head">
        <div className="story-score">
          <span className={`story-score-num${isHigh ? ' high' : ''}`}>{cluster.importance}</span>
          <span className="story-score-label">{isHigh ? 'High signal' : 'Signal'}</span>
        </div>
        <h3>{cluster.headline}</h3>
        <p className="story-meta">{cluster.matchedWatchlistIds.length || 'No'} watchlist{cluster.matchedWatchlistIds.length === 1 ? '' : 's'} · {cluster.articleIds.length} article{cluster.articleIds.length === 1 ? '' : 's'} · {cluster.status}</p>
      </div>

      {cluster.summary ? (
        <div className="saved-summary">
          <strong>Saved summary</strong>
          <p>{cluster.summary.text}</p>
        </div>
      ) : null}

      <div className="primary-action">
        <Button size="sm" onClick={() => prompt(`Summarise Signal Desk cluster ${cluster.id} in founder style. Explain what matters, why now, and suggested actions. Then save it back with signal_desk action save_summary.`)}>Summarise this story</Button>
        <div className="secondary-actions">
          <Button size="sm" variant="secondary" onClick={() => prompt(`Use Signal Desk to save a concise insight from cluster ${cluster.id}: ${cluster.headline}. Include why it matters and suggested follow-up.`)}>Save insight</Button>
          <Button size="sm" variant="secondary" onClick={() => prompt(`Use Signal Desk to create one practical action from cluster ${cluster.id}: ${cluster.headline}.`)}>Create action</Button>
        </div>
      </div>

      <div className="status-strip">
        <span className="label">Cluster</span>
        <button className={cluster.status === 'seen' ? 'icon-btn active' : 'icon-btn'} onClick={() => markCluster(cluster.id, 'seen')} title="Mark seen">Seen</button>
        <button className={cluster.status === 'saved' ? 'icon-btn active' : 'icon-btn'} onClick={() => markCluster(cluster.id, 'saved')} title="Save">Save</button>
        <button className={cluster.status === 'dismissed' ? 'icon-btn active' : 'icon-btn'} onClick={() => markCluster(cluster.id, 'dismissed')} title="Dismiss">Dismiss</button>
        <button className="icon-btn" onClick={() => markCluster(cluster.id, 'new')} title="Undo">↺</button>
      </div>

      <div className="article-list">
        {articles.map((article) => (
          <div className="article-row" key={article.id}>
            <a href={article.url} target="_blank" rel="noreferrer">{article.title}</a>
            <p className="meta">{sourceName(state.sources.find((source) => source.id === article.sourceId))} · {formatDate(article.publishedAt)} · {article.status}</p>
            {article.snippet ? <p>{article.snippet}</p> : null}
            <div className="article-actions">
              <button className="icon-btn" onClick={() => markArticle(article.id, 'seen')}>Seen</button>
              <button className="icon-btn" onClick={() => markArticle(article.id, 'saved')}>Save</button>
              <button className="icon-btn" onClick={() => markArticle(article.id, 'dismissed')}>Dismiss</button>
              <button className="icon-btn" onClick={() => navigator.clipboard?.writeText(article.url)}>Copy URL</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onSeed }: { onSeed: () => void }) {
  return (
    <div className="empty-state">
      <div className="radar-visual"><span /><span /><span /></div>
      <h2>Your intelligence desk is empty</h2>
      <p>Add RSS sources and watchlists, then let Sero turn the noise into briefings, insights, and actions.</p>
      <Button onClick={onSeed}>Seed AI tools demo</Button>
    </div>
  );
}

function BriefingPanel({ briefing, busy, onBrief, onSaveInsight, onCreateAction }: { briefing: string; busy: boolean; onBrief: (type: string) => void; onSaveInsight: () => void; onCreateAction: () => void }) {
  const presets: Array<[string, string]> = [['today', 'Today’s signal'], ['launch_watch', 'Launch watch'], ['company_radar', 'Competitor radar'], ['security_watch', 'Security'], ['repo_releases', 'Repo releases']];
  return (
    <div className="stream-body briefing-panel">
      <div className="briefing-presets">
        {presets.map(([type, label]) => <button key={type} onClick={() => onBrief(type)} disabled={busy}>{label}</button>)}
      </div>
      <pre className={briefing ? 'briefing-output' : 'briefing-output empty'}>{briefing || 'Generate a briefing to see what changed, why it matters, and what to do next.'}</pre>
      <div className="briefing-footer">
        <Button size="sm" variant="secondary" disabled={!briefing} onClick={onSaveInsight}>Save as insight</Button>
        <Button size="sm" variant="secondary" disabled={!briefing} onClick={onCreateAction}>Create review action</Button>
        <button className="icon-btn" disabled={!briefing} onClick={() => navigator.clipboard?.writeText(briefing)}>Copy</button>
        <button className="icon-btn" disabled={!briefing} onClick={() => navigator.clipboard?.writeText(`# Signal Desk briefing\n\n${briefing}`)}>Copy MD</button>
      </div>
    </div>
  );
}

function InsightsPanel({ state, createInsight, editInsight, deleteInsight, exportInsightToMemory }: { state: SignalDeskState; createInsight: () => void; editInsight: (id: string) => void; deleteInsight: (id: string) => void; exportInsightToMemory: (id: string) => void }) {
  return (
    <div className="stream-body">
      <div className="filter-row">
        <span className="rail-title">Saved insights · {state.insights.length}</span>
        <Button size="sm" variant="secondary" onClick={createInsight}>New insight</Button>
      </div>
      <div className="simple-list">
        {state.insights.length ? state.insights.map((insight) => (
          <article key={insight.id}>
            <h3>{insight.title}</h3>
            <p>{insight.body}</p>
            <p className="list-meta">{[...insight.articleIds, ...insight.clusterIds].length} evidence link(s)</p>
            <div className="list-actions">
              <button className="icon-btn" onClick={() => navigator.clipboard?.writeText(`${insight.title}\n\n${insight.body}`)}>Copy</button>
              <button className="icon-btn" onClick={() => editInsight(insight.id)}>Edit</button>
              <button className="icon-btn" onClick={() => exportInsightToMemory(insight.id)}>To memory</button>
              <button className="icon-btn" onClick={() => deleteInsight(insight.id)}>Delete</button>
            </div>
          </article>
        )) : <p className="muted">No saved insights yet.</p>}
      </div>
    </div>
  );
}

function ActionsPanel({ state, updateActionStatus, editAction, sendActionToKanban, createReminderFromAction }: { state: SignalDeskState; updateActionStatus: (id: string, status: 'open' | 'done' | 'dismissed') => void; editAction: (id: string) => void; sendActionToKanban: (id: string) => void; createReminderFromAction: (id: string) => void }) {
  return (
    <div className="stream-body">
      <div className="filter-row">
        <span className="rail-title">Actions · {state.actions.length}</span>
      </div>
      <div className="simple-list">
        {state.actions.length ? state.actions.map((action) => (
          <article key={action.id}>
            <h3>{action.title}</h3>
            <p>{action.description ?? 'No description'}</p>
            <p className="list-meta">{action.priority} · {action.status} · {[...action.articleIds, ...action.clusterIds, ...action.insightIds].length} link(s)</p>
            <div className="list-actions">
              <button className={action.status === 'open' ? 'icon-btn active' : 'icon-btn'} onClick={() => updateActionStatus(action.id, 'open')}>Open</button>
              <button className={action.status === 'done' ? 'icon-btn active' : 'icon-btn'} onClick={() => updateActionStatus(action.id, 'done')}>Done</button>
              <button className={action.status === 'dismissed' ? 'icon-btn active' : 'icon-btn'} onClick={() => updateActionStatus(action.id, 'dismissed')}>Dismiss</button>
              <button className="icon-btn" onClick={() => editAction(action.id)}>Edit</button>
              <button className="icon-btn" onClick={() => sendActionToKanban(action.id)}>→ Kanban</button>
              <button className="icon-btn" onClick={() => createReminderFromAction(action.id)}>Reminder</button>
            </div>
          </article>
        )) : <p className="muted">No actions yet.</p>}
      </div>
    </div>
  );
}

function SettingsPanel({ sourceDraft, setSourceDraft, addSource, addGoogleNewsSource, addGithubReleaseSource, addHackerNewsSource, toggleSource, editSource, removeSource, refreshSource, refreshFailedSources, refreshEnabledSources, copyOpml, importOpml, seedDemo, state, latestRun, failedCount, showAdvanced, setShowAdvanced }: { sourceDraft: { name: string; url: string }; setSourceDraft: (value: { name: string; url: string }) => void; addSource: () => void; addGoogleNewsSource: () => void; addGithubReleaseSource: () => void; addHackerNewsSource: () => void; toggleSource: (id: string) => void; editSource: (id: string) => void; removeSource: (id: string) => void; refreshSource: (id: string) => void; refreshFailedSources: () => void; refreshEnabledSources: () => void; copyOpml: () => void; importOpml: () => void; seedDemo: () => void; state: SignalDeskState; latestRun: SignalDeskState['runs'][number] | undefined; failedCount: number; showAdvanced: boolean; setShowAdvanced: (value: boolean) => void }) {
  return (
    <div className="stream-body settings-panel">
      <section className="settings-section">
        <div className="section-head">
          <div>
            <h2>Add source</h2>
            <p className="section-sub">RSS / Atom URL · or pick a template below</p>
          </div>
        </div>
        <div className="source-form">
          <input value={sourceDraft.name} onChange={(event) => setSourceDraft({ ...sourceDraft, name: event.target.value })} placeholder="Name or owner/repo" />
          <input value={sourceDraft.url} onChange={(event) => setSourceDraft({ ...sourceDraft, url: event.target.value })} placeholder="https://example.com/feed.xml" />
          <Button size="sm" onClick={addSource}>Add</Button>
        </div>
        <div className="template-row">
          <span className="label">Templates</span>
          <button onClick={addGoogleNewsSource}>Google News topic</button>
          <button onClick={addGithubReleaseSource}>GitHub releases</button>
          <button onClick={addHackerNewsSource}>HN newest</button>
        </div>
      </section>

      <section className="settings-section">
        <div className="section-head">
          <div>
            <h2>Sources · {state.sources.length}</h2>
            <p className="section-sub">{failedCount > 0 ? `${failedCount} failing · hover a row for actions` : 'Hover a row for actions'}</p>
          </div>
          {state.sources.length === 0 ? (
            <Button size="sm" variant="secondary" onClick={seedDemo}>Seed demo</Button>
          ) : null}
        </div>

        {latestRun ? (
          <div className={`run-status ${latestRun.status}`}>
            <strong>{latestRun.status} · {latestRun.sourcesFetched ?? 0}/{latestRun.sourceIds.length} fetched</strong>
            <span>{latestRun.articlesAdded} articles · {latestRun.clustersAdded} clusters · {latestRun.finishedAt ? formatDate(latestRun.finishedAt) : 'in progress'}</span>
            {latestRun.errors?.length ? <p>{latestRun.errors.join(' · ')}</p> : null}
          </div>
        ) : null}

        {state.sources.length > 0 ? (
          <div className="source-table">
            {state.sources.map((source) => (
              <div className="source-row" key={source.id}>
                <div>
                  <div className="source-name">{source.name}</div>
                  <div className={source.lastError ? 'source-meta error' : 'source-meta'}>
                    {source.kind} · {source.lastFetchedAt ? formatDate(source.lastFetchedAt) : 'never fetched'}
                    {source.lastError ? ` · ${source.lastError}` : ''}
                  </div>
                </div>
                <div className="source-status">
                  <i className={`dot ${source.enabled ? 'normal' : 'off'}`} />
                </div>
                <div className="source-actions">
                  <button className="icon-btn" onClick={() => refreshSource(source.id)} title="Refresh">↻</button>
                  <button className="icon-btn" onClick={() => editSource(source.id)} title="Edit">✎</button>
                  <button className="icon-btn" onClick={() => toggleSource(source.id)} title={source.enabled ? 'Disable' : 'Enable'}>{source.enabled ? '◉' : '○'}</button>
                  <button className="icon-btn" onClick={() => removeSource(source.id)} title="Remove">×</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="settings-section">
        <button className={showAdvanced ? 'advanced-toggle open' : 'advanced-toggle'} onClick={() => setShowAdvanced(!showAdvanced)}>
          <span className="chev">›</span> Advanced
        </button>
        {showAdvanced ? (
          <div className="advanced-body">
            <div className="advanced-row">
              <Button size="sm" variant="secondary" onClick={refreshEnabledSources}>Refresh all enabled</Button>
              <Button size="sm" variant="secondary" onClick={refreshFailedSources} disabled={failedCount === 0}>Refresh failed{failedCount ? ` (${failedCount})` : ''}</Button>
            </div>
            <div className="advanced-row">
              <Button size="sm" variant="ghost" onClick={copyOpml}>Copy OPML</Button>
              <Button size="sm" variant="ghost" onClick={importOpml}>Import OPML</Button>
              <Button size="sm" variant="ghost" onClick={seedDemo}>Seed demo</Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default SignalDeskApp;
