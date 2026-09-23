// Vite's client environment refuses to bundle a Node builtin, so under Vitest a
// static import of `node:sqlite` in a jsdom test resolves here (see
// `vitest.config.ts`). Node and tsx resolve the real builtin, so the same static
// import works in the demo.
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)

export const { DatabaseSync } = require_('node:sqlite') as typeof import('node:sqlite')
