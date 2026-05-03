# Signal Desk

Signal Desk is an external Sero plugin for a Sero-native, RSS-first personal intelligence feed. It tracks topics, companies, repos, people, keywords, and RSS sources, then turns noisy feeds into story clusters, briefings, saved insights, and actions.

## External package

The plugin uses published semver dependencies rather than monorepo `catalog:` or `workspace:` specifiers, so it can be installed and built outside the Sero monorepo.

## Install for development

```bash
cd plugins/sero-signal-desk-plugin
pnpm install
pnpm dev
```

Then add the plugin as a Sero dev plugin from this directory. The app manifest uses dev port `5178`.

## Release / packaging

The package includes a `files` allowlist and publishes the built `dist/` remote. Before packing or publishing, run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm pack
```

`prepack` runs typecheck, tests, and build automatically.

## Visual assets

The plugin includes SVG assets in `assets/`:

- `assets/icon.svg`
- `assets/empty-state.svg`

## Surfaces

- **Pi extension**: `signal_desk` tool for sources, watchlists, refreshes, clusters, briefings, insights, and actions.
- **React UI**: dark intelligence-desk interface with watchlists, signal stream, briefing desk, saved insights, actions, and source settings.
- **Background runtime**: workspace-scoped runtime stub ready for scheduled refresh orchestration.

## Useful tool actions

- `status`
- `seed_demo`
- `add_source`
- `add_watchlist`
- `refresh`
- `list_articles`
- `list_clusters`
- `summarise_cluster`
- `briefing`
- `save_insight`
- `create_action`
- `mark`

## Runtime notes

The UI intentionally avoids React hooks and `@sero-ai/app-runtime` hook imports in the root app component. In external dev-plugin mode, duplicate React resolution can otherwise crash hook calls with `Cannot read properties of null (reading 'useContext')`. Signal Desk uses a class component, Sero's global app context, and `window.sero` directly for state, prompts, and tool calls.

## Troubleshooting

### Dev server fails with an esbuild host/binary mismatch

The `dev` and `build` scripts intentionally clear `ESBUILD_BINARY_PATH` before launching Vite:

```json
"dev": "ESBUILD_BINARY_PATH= vite",
"build": "ESBUILD_BINARY_PATH= vite build"
```

This prevents a Sero/host-level esbuild binary from overriding the plugin-local esbuild package. If the error persists, remove `node_modules` and `pnpm-lock.yaml` for the plugin and run `pnpm install` again on the same machine that starts the dev plugin.

## Demo flow

1. Open Signal Desk.
2. Click **Seed Demo**.
3. Click **Refresh**.
4. Select a high-signal cluster.
5. Ask the agent to summarise it.
6. Save an insight or create an action.
7. Run `/signal-briefing` or ask: “Give me a launch-day briefing from Signal Desk.”

## State

Workspace state is stored at:

```txt
.sero/apps/signal-desk/state.json
```

The state contains sources, watchlists, articles, clusters, saved insights, actions, refresh runs, settings, and UI state.
