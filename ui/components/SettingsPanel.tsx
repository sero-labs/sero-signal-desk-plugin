import type { SignalDeskState } from '../../shared/types';
import { formatDate } from '../lib/formatting';
import { Button } from './Button';

export function SettingsPanel({
  sourceDraft,
  setSourceDraft,
  addSource,
  addGoogleNewsSource,
  addGithubReleaseSource,
  addHackerNewsSource,
  toggleSource,
  editSource,
  removeSource,
  refreshSource,
  refreshFailedSources,
  refreshEnabledSources,
  copyOpml,
  importOpml,
  seedDemo,
  state,
  latestRun,
  failedCount,
  showAdvanced,
  setShowAdvanced,
}: {
  sourceDraft: { name: string; url: string };
  setSourceDraft: (value: { name: string; url: string }) => void;
  addSource: () => void;
  addGoogleNewsSource: () => void;
  addGithubReleaseSource: () => void;
  addHackerNewsSource: () => void;
  toggleSource: (id: string) => void;
  editSource: (id: string) => void;
  removeSource: (id: string) => void;
  refreshSource: (id: string) => void;
  refreshFailedSources: () => void;
  refreshEnabledSources: () => void;
  copyOpml: () => void;
  importOpml: () => void;
  seedDemo: () => void;
  state: SignalDeskState;
  latestRun: SignalDeskState['runs'][number] | undefined;
  failedCount: number;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
}) {
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
