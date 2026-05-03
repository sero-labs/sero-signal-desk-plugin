import type { SignalDeskState } from '../../shared/types';
import { Button } from './Button';

export function InsightsPanel({
  state,
  createInsight,
  editInsight,
  deleteInsight,
  exportInsightToMemory,
}: {
  state: SignalDeskState;
  createInsight: () => void;
  editInsight: (id: string) => void;
  deleteInsight: (id: string) => void;
  exportInsightToMemory: (id: string) => void;
}) {
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
