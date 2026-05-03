import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeModule,
} from '@sero-ai/common';
import type { SignalDeskState } from '../shared/types';
import { normaliseState } from '../shared/types';

class SignalDeskRuntime implements AppRuntime {
  private refreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly ctx: AppRuntimeContext) {}

  async start(): Promise<void> {
    const state = await this.ctx.host.appState.read<SignalDeskState>(this.ctx.stateFilePath);
    await this.handleStateChange(state);
  }

  async handleStateChange(state: unknown): Promise<void> {
    const current = normaliseState(state as Partial<SignalDeskState> | null | undefined);
    const reconciled = {
      ...current,
      runs: current.runs.map((run) => run.status === 'running' ? { ...run, status: 'error' as const, finishedAt: new Date().toISOString(), error: 'Recovered stuck running refresh on startup' } : run),
    };
    if (reconciled.runs.some((run, index) => run !== current.runs[index])) {
      await this.ctx.host.appState.update<SignalDeskState>(this.ctx.stateFilePath, () => reconciled);
    }
    this.configureRefreshTimer(reconciled);
  }

  async dispose(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private configureRefreshTimer(state: SignalDeskState): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;

    const minutes = state.settings.refreshIntervalMinutes;
    if (!minutes || minutes < 5) return;

    this.refreshTimer = setInterval(() => {
      // Runtime keeps the background cadence alive. The actual network refresh
      // remains owned by the Pi-safe signal_desk tool so UI, CLI, and agent paths
      // all share one implementation.
    }, minutes * 60 * 1000);
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new SignalDeskRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;
