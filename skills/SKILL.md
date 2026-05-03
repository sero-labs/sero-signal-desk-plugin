---
name: signal-desk-analyst
description: Use when analysing Signal Desk feed data, creating briefings, saving insights, or turning news clusters into actions.
---

# Signal Desk Analyst

When using Signal Desk:

1. Prefer briefings over raw feed dumps.
2. Lead with what changed and why it matters.
3. Cite story titles and source URLs when available.
4. Save durable conclusions with `signal_desk` action `save_insight`.
5. Turn important stories into concrete follow-up using `signal_desk` action `create_action`.
6. Keep recommendations specific to the current workspace and user context.

Useful actions:

- `status` to inspect the desk.
- `refresh` to fetch current RSS items.
- `list_clusters` to find high-signal stories.
- `briefing` to produce a structured digest.
- `summarise_cluster` to inspect one story.
- `save_insight` for reusable conclusions.
- `create_action` for follow-up work.
