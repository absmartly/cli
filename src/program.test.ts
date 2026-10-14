import { describe, it, expect } from 'vitest';
import { program } from './program.js';

describe('root program global options', () => {
  it('registers --dry-run as a root option', () => {
    const flags = program.options.map((o) => o.long);
    expect(flags).toContain('--dry-run');
  });

  it('registers --dry-run alongside the request-debugging flags it composes with', () => {
    const flags = program.options.map((o) => o.long);
    for (const flag of ['--show-request', '--curl', '--show-secrets']) {
      expect(flags).toContain(flag);
    }
  });

  it('does not redeclare --dry-run on any command that now relies on the global flag', () => {
    const experiments = program.commands.find((c) => c.name() === 'experiments')!;
    const names = ['create', 'update', 'clone', 'restart'];
    for (const name of names) {
      const cmd = experiments.commands.find((c) => c.name() === name)!;
      expect(cmd.options.map((o) => o.long)).not.toContain('--dry-run');
    }
    const bulk = experiments.commands.find((c) => c.name() === 'bulk')!;
    for (const sub of bulk.commands) {
      expect(sub.options.map((o) => o.long)).not.toContain('--dry-run');
    }
  });
});
