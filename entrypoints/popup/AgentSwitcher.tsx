// SPDX-License-Identifier: MIT
/**
 * AgentSwitcher -- brand-mark + active-agent trigger that opens a custom
 * popover menu for switching between registered agents. Mirrors the web
 * app's `src/components/shared/AgentSwitcher.tsx` pattern (logo + label +
 * caret trigger, menu with per-agent icon + checkmark on active) adapted
 * to the extension popup surface (no next-intl, smaller AGENT_REGISTRY).
 *
 * Keyboard: ArrowDown/ArrowUp navigate, Home/End jump, Enter activates,
 * Escape closes. Closes on outside mousedown.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AgentId, AgentRegistryEntry } from '@/src/background/agents';
import { t } from '@/src/shared/i18n';

export interface AgentSwitcherProps {
  readonly agents: readonly AgentRegistryEntry[];
  readonly activeAgentId: AgentId | null;
  readonly onChange: (id: AgentId) => void;
  readonly disabled?: boolean;
}

export function AgentSwitcher({
  agents,
  activeAgentId,
  onChange,
  disabled = false,
}: AgentSwitcherProps): React.ReactElement | null {
  const [open, setOpen] = useState<boolean>(false);
  const [focusIndex, setFocusIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const activeAgent = useMemo<AgentRegistryEntry | null>(() => {
    if (agents.length === 0) return null;
    const found = agents.find((a) => a.id === activeAgentId);
    return found ?? agents[0] ?? null;
  }, [agents, activeAgentId]);

  const close = useCallback((): void => {
    setOpen(false);
    setFocusIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || focusIndex < 0) return;
    const el = itemsRef.current[focusIndex];
    el?.focus();
  }, [open, focusIndex]);

  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      if (disabled) return;
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
        setFocusIndex(0);
      }
    },
    [disabled],
  );

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!open) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setFocusIndex((prev) => (prev + 1) % Math.max(agents.length, 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusIndex(
            (prev) =>
              (prev - 1 + Math.max(agents.length, 1)) % Math.max(agents.length, 1),
          );
          break;
        case 'Home':
          event.preventDefault();
          setFocusIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setFocusIndex(Math.max(agents.length - 1, 0));
          break;
        case 'Escape':
          event.preventDefault();
          close();
          triggerRef.current?.focus();
          break;
        default:
          break;
      }
    },
    [open, agents.length, close],
  );

  const selectAgent = useCallback(
    (id: AgentId): void => {
      onChange(id);
      close();
      triggerRef.current?.focus();
    },
    [onChange, close],
  );

  if (agents.length === 0 || activeAgent === null) return null;

  const toggle = (): void => {
    if (disabled) return;
    setOpen((prev) => {
      if (!prev) {
        setFocusIndex(
          Math.max(
            agents.findIndex((a) => a.id === activeAgent.id),
            0,
          ),
        );
      }
      return !prev;
    });
  };

  return (
    <div className="relative" ref={rootRef} onKeyDown={handleMenuKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        data-testid="agent-switcher"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('agentSwitcher_label')}
        aria-disabled={disabled || undefined}
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-[180px] items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-left text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 ${
          disabled ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <img
          src="/icon/llmc-logo.png"
          alt=""
          aria-hidden="true"
          width={20}
          height={20}
          className="h-5 w-5 shrink-0 rounded"
        />
        <span className="flex-1 truncate">{activeAgent.label}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open ? (
        <div
          data-testid="agent-switcher-popover"
          role="menu"
          aria-label={t('agentSwitcher_label')}
          className="absolute left-0 top-full z-30 mt-1 w-[220px] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          {agents.map((agent, index) => {
            const isActive = agent.id === activeAgent.id;
            return (
              <button
                key={agent.id}
                ref={(el) => {
                  itemsRef.current[index] = el;
                }}
                type="button"
                role="menuitem"
                data-testid={`agent-switcher-item-${agent.id}`}
                data-active={isActive || undefined}
                tabIndex={focusIndex === index ? 0 : -1}
                onClick={() => selectAgent(agent.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                  isActive
                    ? 'bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60'
                }`}
              >
                <svg
                  className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={agent.iconSvg} />
                </svg>
                <span className="flex-1 truncate">{agent.label}</span>
                {isActive ? (
                  <svg
                    className="h-4 w-4 shrink-0 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
