// @vitest-environment node
/**
 * The build's shared modules are one `boot` chunk (`vite.config.ts`), and the
 * loader, the entry that holds a press made before the runtime is up, does not
 * import it: it must run while `boot` is still arriving, or the press is lost.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'
import { measure } from '../../../scripts/bundle-report.mjs'

const imports = (code: string) =>
  [...code.matchAll(/from"\.\/([^"]+)"/g)].map(match => match[1] ?? '')

test('the loader imports no more than the preload helper, and the shared modules are one chunk', async () => {
  const dump = mkdtempSync(join(tmpdir(), 'auth-boot-'))
  try {
    await measure(resolve(import.meta.dirname, '..'), { dump })
    const assets = join(dump, 'assets')
    const chunks = readdirSync(assets).filter(name => name.endsWith('.js'))
    const html = readFileSync(join(dump, 'index.html'), 'utf8')
    const entry = /<script[^>]*src="\/assets\/([^"]+\.js)"/.exec(html)?.[1]
    expect(entry).toBeDefined()
    expect(
      imports(readFileSync(join(assets, entry ?? ''), 'utf8')).map(name => name.split('-')[0]),
    ).toEqual(['preload'])
    expect(chunks.filter(name => name.startsWith('boot-'))).toHaveLength(1)
  } finally {
    rmSync(dump, { recursive: true, force: true })
  }
}, 300_000)
