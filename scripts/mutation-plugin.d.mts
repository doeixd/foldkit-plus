import type { Plugin as EsbuildPlugin } from 'esbuild'
import type { Plugin } from 'vite'

/** `pnpm mutate`'s edits, applied to modules as Vite loads them; nothing without a mutation. */
export declare const mutation: () => Plugin

/** The same edits, for a Worker esbuild bundles; nothing without a mutation. */
export declare const workerMutation: () => EsbuildPlugin
