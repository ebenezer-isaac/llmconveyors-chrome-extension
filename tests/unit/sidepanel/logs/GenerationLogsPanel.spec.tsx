// SPDX-License-Identifier: MIT
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GenerationLogsPanel } from '@/entrypoints/sidepanel/logs/GenerationLogsPanel';
import type { SessionLogEntry } from '@/entrypoints/sidepanel/useSessionForCurrentTab';

const baseLogs: readonly SessionLogEntry[] = [
  { phase: 'match', message: 'second', timestamp: 2_000, level: 'info' },
  { phase: 'match', message: 'first', timestamp: 1_000, level: 'info' },
  { phase: 'render', message: 'third', timestamp: 3_000, level: 'warn' },
];

describe('GenerationLogsPanel', () => {
  afterEach(cleanup);

  it('sorts entries in ASC time order regardless of input order', () => {
    render(<GenerationLogsPanel logs={baseLogs} defaultOpen />);
    const items = screen.getAllByTestId('generation-log-entry');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain('first');
    expect(items[1]?.textContent).toContain('second');
    expect(items[2]?.textContent).toContain('third');
  });

  it('defaults open when session is still active', () => {
    render(<GenerationLogsPanel logs={baseLogs} sessionStatus="active" />);
    expect(
      screen.getByTestId('generation-logs-panel').getAttribute('data-open'),
    ).toBe('true');
  });

  it('defaults closed when the session is completed', () => {
    render(<GenerationLogsPanel logs={baseLogs} sessionStatus="completed" />);
    expect(
      screen.getByTestId('generation-logs-panel').getAttribute('data-open'),
    ).toBe('false');
  });

  it('surfaces a phase chip when the entry carries a phase', () => {
    render(<GenerationLogsPanel logs={baseLogs} defaultOpen />);
    const phases = screen.getAllByTestId('generation-log-phase');
    expect(phases.map((p) => p.textContent)).toEqual(['match', 'match', 'render']);
  });

  it('renders the empty state when there are no log entries', () => {
    render(<GenerationLogsPanel logs={[]} defaultOpen />);
    expect(screen.getByTestId('generation-logs-empty')).toBeTruthy();
  });

  it('toggles the collapsed state on header click', () => {
    render(<GenerationLogsPanel logs={baseLogs} defaultOpen={false} />);
    const panel = screen.getByTestId('generation-logs-panel');
    expect(panel.getAttribute('data-open')).toBe('false');
    fireEvent.click(screen.getByTestId('generation-logs-toggle'));
    expect(panel.getAttribute('data-open')).toBe('true');
  });
});
