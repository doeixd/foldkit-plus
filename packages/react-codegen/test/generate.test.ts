import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { DiagnosticCode, formatDiagnostic, generate } from '../src/index.js'

const view = `import type { Html, HtmlBuilder } from 'foldkit/html'
export const view = (h: HtmlBuilder<never>): Html => h.p([], ['hi'])
`

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'foldkit-react-codegen-'))
  await mkdir(join(dir, 'src/nested'), { recursive: true })
  await writeFile(join(dir, 'src/View.ts'), view)
  await writeFile(join(dir, 'src/nested/util.ts'), 'export const one = 1\n')
  await writeFile(join(dir, 'src/View.test.ts'), 'this is not compiled')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

it('mirrors sources into the out dir and skips files whose bytes would not change', async () => {
  const options = { inputs: [join(dir, 'src')], outDir: join(dir, 'generated'), rootDir: dir }
  const first = await generate(options)
  expect(first.diagnostics).toEqual([])
  expect(first.written.map(path => path.slice(dir.length).replace(/\\/g, '/'))).toEqual([
    '/generated/src/View.tsx',
    '/generated/src/nested/util.tsx',
  ])
  const output = await readFile(join(dir, 'generated/src/View.tsx'), 'utf8')
  expect(output).toContain('from src/View.ts.')
  expect(output).toContain('<p>hi</p>')
  const modified = (await stat(join(dir, 'generated/src/View.tsx'))).mtimeMs

  await new Promise(resolve => setTimeout(resolve, 20))
  const second = await generate(options)
  expect(second.written).toEqual([])
  expect(second.unchanged).toHaveLength(2)
  expect((await stat(join(dir, 'generated/src/View.tsx'))).mtimeMs).toBe(modified)
})

it('writes nothing when any file has a diagnostic', async () => {
  await writeFile(
    join(dir, 'src/nested/Bad.ts'),
    `import type { HtmlBuilder } from 'foldkit/html'\nexport const bad = (h: HtmlBuilder<never>) =>\n  h.div([h.OnMount(m)], [])\n`,
  )
  const result = await generate({
    inputs: [join(dir, 'src')],
    outDir: join(dir, 'generated'),
    rootDir: dir,
  })
  expect(result.written).toEqual([])
  expect(result.diagnostics.map(formatDiagnostic)).toEqual([
    expect.stringMatching(
      new RegExp(
        `^src/nested/Bad\\.ts:3:10 - error ${DiagnosticCode.UnsupportedAttribute}: h\\.OnMount`,
      ),
    ),
  ])
  await expect(stat(join(dir, 'generated'))).rejects.toThrow()
})

it('exits non-zero from the CLI on a diagnostic', async () => {
  await writeFile(
    join(dir, 'src/Bad.ts'),
    `import type { HtmlBuilder } from 'foldkit/html'\nexport const bad = (h: HtmlBuilder<never>) => h.submodel(x)\n`,
  )
  const cli = resolve('packages/react-codegen/src/cli.ts')
  const run = promisify(execFile)
  const error = await run(
    process.execPath,
    ['--import', 'tsx', cli, 'src', '--out-dir', 'generated'],
    { cwd: dir },
  ).catch((failure: { code: number; stderr: string }) => failure)
  expect(error).toMatchObject({ code: 1 })
  expect((error as { stderr: string }).stderr).toContain(
    `src/Bad.ts:2:47 - error ${DiagnosticCode.UnsupportedBuilder}`,
  )

  await rm(join(dir, 'src/Bad.ts'))
  const { stdout } = await run(
    process.execPath,
    ['--import', 'tsx', cli, 'src', '--out-dir', 'generated'],
    { cwd: dir },
  )
  expect(stdout).toContain('Wrote 2 file(s), 0 unchanged.')
})
