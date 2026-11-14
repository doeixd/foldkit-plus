// @vitest-environment node
/**
 * `foldkit-plus laws`' loading and printing, run in this process through the
 * workspace's `tsx`. The command's own exit status, and the fallback with no
 * `tsx`, run the built CLI in `cli.test.ts`.
 */
import { Laws } from 'foldkit-entity'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lawsReport } from '../src/laws.js'
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
