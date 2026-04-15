// SPDX-License-Identifier: MIT
/**
 * ErrorBoundary - React 19 class-based boundary that catches render-time and
 * lifecycle errors in popup children and swaps the sub-tree for an inert
 * error banner. Functional components + hooks cannot own this contract, so
 * this is the single sanctioned class component in the popup tree.
 */

import React from 'react';
import { createLogger } from '@/src/background/log';

const log = createLogger('popup:error-boundary');

export interface ErrorBoundaryProps {
  readonly children: React.ReactNode;
  readonly fallbackMessage?: string;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly message: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  public static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : 'Unexpected popup error';
    return { hasError: true, message };
  }

  public override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    log.error('popup render crashed', error, {
      componentStack: info.componentStack ?? '',
    });
  }

  public override render(): React.ReactNode {
    if (this.state.hasError) {
      const fallback =
        this.props.fallbackMessage ??
        'Something went wrong. Reopen the popup to retry.';
      return (
        <div
          data-testid="popup-error"
          role="alert"
          className="m-3 rounded-card border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-600 dark:bg-red-900 dark:text-red-100"
        >
          <p className="font-semibold">Popup error</p>
          <p className="mt-1 text-xs">{fallback}</p>
          <p
            data-testid="popup-error-message"
            className="mt-1 break-words text-xs opacity-80"
          >
            {this.state.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
