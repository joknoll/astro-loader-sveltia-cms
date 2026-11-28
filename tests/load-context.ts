import type { LoaderContext } from "astro/loaders";
import { vi } from "vite-plus/test";

export function mockLoadContext(overrides: Partial<LoaderContext> = {}) {
    const meta = new Map<string, string>();
    const clear = vi.fn();
    const context = {
        generateDigest: JSON.stringify,
        meta,
        store: { clear, keys: () => [] },
        ...overrides,
    } as unknown as LoaderContext;
    return { context, clear };
}
