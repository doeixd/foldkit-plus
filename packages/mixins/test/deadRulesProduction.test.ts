// @vitest-environment node
/**
 * The dead-rule and inline-shorthand checks are development diagnostics: Vite
 * folds `import.meta.env.DEV` to false in a production build, so the checks and
 * their message text leave the page whole. Chirp's client was 412 bytes brotli
 * heavier with them kept.
 */
import { fileURLToPath } from 'node:url'
import { build, defaultClientConditions } from 'vite'
import { mutation } from '../../../scripts/mutation-plugin.mjs'
import type { Rollup } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('./fixtures/deadRules/', import.meta.url))

const built = async (mode: 'production' | 'development'): Promise<string> => {
  // Vite reads `import.meta.env.DEV` from NODE_ENV, which Vitest sets to `test`.
  vi.stubEnv('NODE_ENV', mode)
  const result = await build({
    root,
    mode,
    configFile: false,
    logLevel: 'silent',
    plugins: [mutation()],
    resolve: { conditions: ['foldkit-plus:source', ...defaultClientConditions] },
    build: { write: false, minify: false, rollupOptions: { input: `${root}entry.ts` } },
  })
  return [result]
    .flat()
    .flatMap(output => ('output' in output ? output.output : []))
    .flatMap((file: Rollup.OutputChunk | Rollup.OutputAsset) =>
      file.type === 'chunk' ? [file.code] : [],
    )
    .join('\n')
}

describe('a browser build', { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs())

  it('in development keeps the definition-time checks (the control)', async () => {
    const code = await built('development')
    expect(code).toContain('dead-conditional-rule')
    expect(code).toContain('inline-shorthand-conflict')
  })

  it('in production holds neither check nor its text', async () => {
    const code = await built('production')
    expect(code).toContain('compose')
    expect(code).not.toContain('dead-conditional-rule')
    expect(code).not.toContain('inline-shorthand-conflict')
  })
})
