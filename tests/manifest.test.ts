import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

describe('package manifest', () => {
  it('is configured as an external Sero plugin', () => {
    expect(pkg.keywords).toContain('pi-package');
    expect(pkg.sero.app.id).toBe('signal-desk');
    expect(pkg.sero.app.ui).toBe('./dist/ui/remoteEntry.js');
    expect(pkg.sero.plugin.bridgeTools).toContain('signal_desk');
    expect(pkg.files).toContain('dist');
    expect(pkg.scripts.prepack).toContain('pnpm typecheck');
  });
});
