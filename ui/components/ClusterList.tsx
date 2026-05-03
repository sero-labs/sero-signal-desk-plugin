import type { SignalDeskState } from '../../shared/types';

export function ClusterList({
  clusters,
  state,
  selectedId,
  filter,
  setFilter,
  onSelect,
  onMarkAllSeen,
}: {
  clusters: SignalDeskState['clusters'];
  state: SignalDeskState;
  selectedId?: string;
  filter: 'active' | 'saved' | 'dismissed' | 'all';
  setFilter: (filter: 'active' | 'saved' | 'dismissed' | 'all') => void;
  onSelect: (id: string) => void;
  onMarkAllSeen: () => void;
}) {
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
          const articles = cluster.articleIds.flatMap((id) => {
            const article = state.articles.find((item) => item.id === id);
            return article ? [article] : [];
          });
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
