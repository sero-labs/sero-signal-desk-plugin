import type { SignalDeskState } from '../../shared/types';
import { formatDate, sourceName } from '../lib/formatting';
import { Button } from './Button';

export function SelectedStory({
  cluster,
  state,
  prompt,
  markArticle,
  markCluster,
}: {
  cluster: SignalDeskState['clusters'][number];
  state: SignalDeskState;
  prompt: (message: string) => void;
  markArticle: (id: string, status: 'new' | 'seen' | 'saved' | 'dismissed') => void;
  markCluster: (id: string, status: 'new' | 'seen' | 'saved' | 'dismissed') => void;
}) {
  const articles = cluster.articleIds.flatMap((id) => {
    const article = state.articles.find((item) => item.id === id);
    return article ? [article] : [];
  });
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
