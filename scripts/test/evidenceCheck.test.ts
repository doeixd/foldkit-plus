// @vitest-environment node
/**
 * `pnpm evidence:check`: an issuer made outside the producer modules is
 * reported, in a fixture tree laid out as this repository is.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, test } from 'vitest'
// @ts-expect-error the checker is plain JavaScript
import { issuerFindings, producers } from '../evidence-check.mjs'

const repository = fileURLToPath(new URL('../..', import.meta.url))
const script = join(repository, 'scripts/evidence-check.mjs')
// Spelled in two parts, so this file is no finding of the real check.
const issuer = (name: string) => `const issuer = Evidence.${'issuer'}('${name}')`

const tree = (files: Readonly<Record<string, string>>) => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-check-'))
  made.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}
const made: Array<string> = []
afterAll(() => {
  for (const root of made) rmSync(root, { recursive: true, force: true })
})

describe('evidence-check', () => {
  test('reports an issuer outside the producers, by file and line, tests included', () => {
    const root = tree({
      'packages/entity/src/laws.ts': issuer('foldkit-entity/laws'),
      'packages/app/src/forge.ts': `import { Evidence } from 'foldkit-metadata'\n${issuer('me')}`,
      'examples/shop/test/walk.test.ts': issuer('foldkit-remote/walk'),
      'scripts/tool.mjs': `Evidence . ${'issuer'} ('spaced')`,
    })
    expect(issuerFindings(root).sort()).toEqual([
      'examples/shop/test/walk.test.ts:1',
      'packages/app/src/forge.ts:2',
      'scripts/tool.mjs:1',
    ])
  })

  test('reads no declaration, build or dependency', () => {
    const root = tree({
      'packages/app/src/types.d.ts': issuer('a'),
      'packages/app/dist/index.js': issuer('b'),
      'packages/app/node_modules/x/index.js': issuer('c'),
      'packages/app/README.md': issuer('d'),
    })
    expect(issuerFindings(root)).toEqual([])
  })

  test('fails the command on a finding, and passes this repository', () => {
    const root = tree({ 'packages/app/src/forge.ts': issuer('me') })
    const failed = spawnSync('node', [script, root], { encoding: 'utf8' })
    expect([failed.status, failed.stdout]).toEqual([1, 'packages/app/src/forge.ts:1\n'])
    expect(spawnSync('node', [script], { encoding: 'utf8' }).status).toBe(0)
  })

  test('allows producers that really make an issuer', () => {
    for (const path of ['packages/entity/src/laws.ts', 'packages/remote/src/walk.ts'])
      expect([path, readFileSync(join(repository, path), 'utf8')]).toEqual([
        path,
        expect.stringContaining(`Evidence.${'issuer'}(`),
      ])
    expect(Object.keys(producers)).toContain('packages/remote/src/scenario.ts')
  })
})
