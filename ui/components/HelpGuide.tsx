import actionsScreenshot from '../guide-assets/actions.png';
import briefingScreenshot from '../guide-assets/briefing.png';
import insightsScreenshot from '../guide-assets/insights.png';
import settingsScreenshot from '../guide-assets/settings.png';
import streamScreenshot from '../guide-assets/stream.png';
import { Button } from './Button';

const guideScreenshots = [
  { src: streamScreenshot, title: 'Stream and briefing desk', caption: 'Triage clustered stories, filter noise, and use the briefing desk to summarise, save, or turn a story into an action.' },
  { src: briefingScreenshot, title: 'Briefing presets', caption: 'Generate repeatable briefings such as Today’s Signal, Launch Watch, Competitor Radar, Security, and Repo Releases.' },
  { src: insightsScreenshot, title: 'Saved insights', caption: 'Keep durable conclusions separate from raw articles, then export the ones that should become long-term Sero context.' },
  { src: actionsScreenshot, title: 'Follow-up actions', caption: 'Convert stories and briefings into tasks, then hand them to Kanban or Reminders through the Sero agent.' },
  { src: settingsScreenshot, title: 'Sources and imports', caption: 'Maintain RSS/Atom sources, use Google News/GitHub/Hacker News helpers, refresh failed feeds, and copy or import OPML.' },
];

export function HelpGuide({ onBack }: { onBack: () => void }) {
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
