import type { Plugin } from 'vite'

/** `pnpm mutate`'s edits, applied to modules as Vite loads them; nothing without a mutation. */
export declare const mutation: () => Plugin
