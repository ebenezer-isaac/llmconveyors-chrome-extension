// SPDX-License-Identifier: MIT
/**
 * Mock backend for integration tests. Intercepts `globalThis.fetch` with a
 * routing table keyed by (method, pathname). Each route returns a canned
 * response. Tests can override routes per-case via `.mockOnce`.
 */

interface RouteHandler {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

interface RouteMatcher {
  readonly method: string;
  readonly pathname: string;
  readonly handler: RouteHandler;
}

class MockBackend {
  private readonly routes: RouteMatcher[] = [];
  private onceQueue: RouteMatcher[] = [];
  private originalFetch: typeof fetch | null = null;

  mount(baseUrl: string): void {
    this.originalFetch = globalThis.fetch;
    const impl = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      const parsed = new URL(url, baseUrl);
      const onceMatcher = this.onceQueue.find(
        (m) => m.method === method && m.pathname === parsed.pathname,
      );
      const matcher =
        onceMatcher ??
        this.routes.find(
          (m) => m.method === method && m.pathname === parsed.pathname,
        );
      if (!matcher) {
        throw new Error(`MockBackend: no route for ${method} ${parsed.pathname}`);
      }
      if (onceMatcher) {
        this.onceQueue = this.onceQueue.filter((m) => m !== onceMatcher);
      }
      return new Response(JSON.stringify(matcher.handler.body), {
        status: matcher.handler.status,
        headers: {
          'content-type': 'application/json',
          ...(matcher.handler.headers ?? {}),
        },
      });
    };
    globalThis.fetch = impl as typeof fetch;
  }

  route(method: string, pathname: string, handler: RouteHandler): void {
    this.routes.push({ method: method.toUpperCase(), pathname, handler });
  }

  mockOnce(method: string, pathname: string, handler: RouteHandler): void {
    this.onceQueue.push({ method: method.toUpperCase(), pathname, handler });
  }

  unmount(): void {
    if (this.originalFetch) globalThis.fetch = this.originalFetch;
    this.originalFetch = null;
    this.routes.length = 0;
    this.onceQueue = [];
  }
}

export function createMockBackend(): MockBackend {
  return new MockBackend();
}

export type { MockBackend };
