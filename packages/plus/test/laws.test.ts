// @vitest-environment node
/**
 * `foldkit-plus laws`' loading and printing, run in this process through the
 * workspace's `tsx`. The command's own exit status, and the fallback with no
 * `tsx`, run the built CLI in `cli.test.ts`.
 */
import { Option } from 'effect'
import { Laws } from 'foldkit-entity'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { entryOf, lawsReport, tsxWithoutApi } from '../src/laws.js'
import writes from './laws/writes.js'

const root = resolve(import.meta.dirname, '../../..')
const fixture = (name: string) => join(import.meta.dirname, 'laws', name)

/** What `Laws.show` printed of the writes example's report, kept in its LAWS.md by its own test. */
const exampleText = () => {
  const kept = readFileSync(join(root, 'examples/writes/LAWS.md'), 'utf8')
  return /```text\n([\s\S]*?)\n```/.exec(kept)![1]!
}

describe('lawsReport', () => {
  it("prints the example's report from its named export, and its findings do not fail the command", async () => {
    expect(exampleText()).toContain('unreached')
    expect(await lawsReport('examples/writes/src/laws.ts#report', root)).toEqual({
      text: `${exampleText()}\n`,
      isError: false,
    })
  })

  it('checks the { writes } a default export holds, with the module and the library one copy', async () => {
    const printed = await lawsReport(fixture('writes.ts'), root)
    expect(printed).toEqual({ text: `${Laws.show(Laws.check(writes))}\n`, isError: false })
    expect(printed.text).toContain('Recount')
  })

  it.each([
    ['a missing file', 'laws/absent.ts', /^No such file: .*absent\.ts\n$/],
    [
      'a module with no such export',
      'laws/neither.ts#zz',
      /has no export zz\. It exports: default, plain\.\n$/,
    ],
    [
      'a default export of neither shape',
      'laws/neither.ts',
      /The default export of .*neither\.ts is an object with the keys name: expected a LawReport/,
    ],
    [
      'a named export of neither shape',
      'laws/neither.ts#plain',
      /The export plain of .*neither\.ts is number: expected a LawReport/,
    ],
    [
      'a report Laws.check throws on',
      'laws/stray.ts',
      /Laws could not report on the default export of .*stray\.ts: .*Laws\.check: Stray is over Item/,
    ],
    [
      'a module that throws',
      'laws/broken.ts',
      /Could not load .*broken\.ts: the module throws on load/,
    ],
  ])('fails on %s and says what it found', async (_name, spec, message) => {
    const result = await lawsReport(spec, import.meta.dirname)
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(message)
  })
})

const packageWith = (manifest: object): string => {
  const dir = mkdtempSync(join(tmpdir(), 'foldkit-plus-laws-'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  return dir
}

describe('entryOf', () => {
  it.each([
    [
      'node before import before default',
      { node: './n.js', import: './i.js', default: './d.js' },
      'n.js',
    ],
    ['import before default', { default: './d.js', import: './i.js' }, 'i.js'],
    ['default', { default: './d.js' }, 'd.js'],
    [
      'a nested node condition',
      { node: { import: './ni.js', default: './nd.js' }, import: './i.js' },
      'ni.js',
    ],
  ])('prefers %s, as Node resolves', (_name, conditions, file) => {
    const dir = packageWith({ exports: { '.': conditions } })
    expect(entryOf(dir, '.')).toEqual(Option.some(join(dir, file)))
  })

  it('names nothing for an export the manifest lacks or only `require` reaches', () => {
    const dir = packageWith({ exports: { '.': { require: './r.cjs' } } })
    expect(Option.isNone(entryOf(dir, '.'))).toBe(true)
    expect(Option.isNone(entryOf(dir, './esm/api'))).toBe(true)
  })
})

describe('lawsReport with an old tsx', () => {
  it('fails naming the tsx, and does not fall back to Node', async () => {
    const project = packageWith({ name: 'project' })
    mkdirSync(join(project, 'node_modules', 'tsx'), { recursive: true })
    writeFileSync(
      join(project, 'node_modules', 'tsx', 'package.json'),
      JSON.stringify({ name: 'tsx', version: '3.12.0' }),
    )
    writeFileSync(join(project, 'report.ts'), 'export default {}')
    const result = await lawsReport('report.ts', project)
    expect(result.isError).toBe(true)
    expect(result.text).toContain('has no esm/api')
    expect(result.text).not.toContain('Install tsx')
  })
})

describe('tsxWithoutApi', () => {
  it('says the installed tsx has no esm/api, its version, and what to upgrade to', () => {
    const dir = packageWith({ name: 'tsx', version: '3.12.0' })
    const message = tsxWithoutApi(dir)
    expect(message).toContain('has no esm/api')
    expect(message).toContain('3.12.0')
    expect(message).toContain('Upgrade tsx')
    expect(message).not.toContain('Install tsx')
  })
})
