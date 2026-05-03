import { Button } from './Button';

export function EmptyState({ onSeed }: { onSeed: () => void }) {
  return (
    <div className="empty-state">
      <div className="radar-visual"><span /><span /><span /></div>
      <h2>Your intelligence desk is empty</h2>
      <p>Add RSS sources and watchlists, then let Sero turn the noise into briefings, insights, and actions.</p>
      <Button onClick={onSeed}>Seed AI tools demo</Button>
    </div>
  );
}

export function BriefingPanel({
  briefing,
  busy,
  onBrief,
  onSaveInsight,
  onCreateAction,
}: {
  briefing: string;
  busy: boolean;
  onBrief: (type: string) => void;
  onSaveInsight: () => void;
  onCreateAction: () => void;
}) {
  const presets: Array<[string, string]> = [
    ['today', 'Today’s signal'],
    ['launch_watch', 'Launch watch'],
    ['company_radar', 'Competitor radar'],
    ['security_watch', 'Security'],
    ['repo_releases', 'Repo releases'],
  ];
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
