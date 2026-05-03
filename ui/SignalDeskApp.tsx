import { Component, type Context } from 'react';
import { highSignalNotifications } from '../shared/advanced-intelligence';
import { exportOpml } from '../shared/opml';
import { createGithubReleasesSource, createGoogleNewsSource, createHackerNewsNewestSource, inferSourceKind } from '../shared/source-helpers';
import type { ActiveView, SignalDeskState, Watchlist } from '../shared/types';
import { createId, DEFAULT_STATE, normaliseState } from '../shared/types';
import { ActionsPanel } from './components/ActionsPanel';
import { BriefingPanel, EmptyState } from './components/BriefingPanel';
import { Button } from './components/Button';
import { ClusterList } from './components/ClusterList';
import { HelpGuide } from './components/HelpGuide';
import { InsightsPanel } from './components/InsightsPanel';
import { SelectedStory } from './components/SelectedStory';
import { SettingsPanel } from './components/SettingsPanel';
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
    getSero().appState.write(ctx.stateFilePath, next).catch((error) => {
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

export default SignalDeskApp;
