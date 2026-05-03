import type { SignalDeskState } from '../../shared/types';

export function ActionsPanel({
  state,
  updateActionStatus,
  editAction,
  sendActionToKanban,
  createReminderFromAction,
}: {
  state: SignalDeskState;
  updateActionStatus: (id: string, status: 'open' | 'done' | 'dismissed') => void;
  editAction: (id: string) => void;
  sendActionToKanban: (id: string) => void;
  createReminderFromAction: (id: string) => void;
}) {
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
