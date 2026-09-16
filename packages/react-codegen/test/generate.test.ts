import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DiagnosticCode, formatDiagnostic, generate, watch, type WatchEvent } from '../src/index.js'

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
  // Two Node processes loading tsx.
}, 60_000)

it('regenerates on change, reports diagnostics without writing, and recovers', async () => {
  const events: Array<WatchEvent> = []
  // The out dir sits inside the watched input, so the watcher must ignore its own writes.
  const options = { inputs: [dir], outDir: join(dir, 'generated'), rootDir: dir }
  const watcher = watch(options, event => events.push(event))
  const output = join(dir, 'generated/src/View.tsx')
  try {
    await vi.waitFor(() => expect(events).toHaveLength(1), { timeout: 15_000 })
    expect(await readFile(output, 'utf8')).toContain('<p>hi</p>')

    await new Promise(resolve => setTimeout(resolve, 300))
    const before = events.length
    await writeFile(join(dir, 'src/View.ts'), view.replace("'hi'", "'bye'"))
    await vi.waitFor(async () => expect(await readFile(output, 'utf8')).toContain('<p>bye</p>'), {
      timeout: 15_000,
    })
    // One run for the edit; the run's own write to the out dir must not trigger another.
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(events).toHaveLength(before + 1)

    await writeFile(join(dir, 'src/View.ts'), view.replace("h.p([], ['hi'])", 'h.submodel(x)'))
    await vi.waitFor(
      () => {
        const last = events.at(-1)
        expect(last?._tag === 'Generated' && last.result.diagnostics[0]?.code).toBe(
          DiagnosticCode.UnsupportedBuilder,
        )
      },
      { timeout: 15_000 },
    )
    expect(await readFile(output, 'utf8')).toContain('<p>bye</p>')

    await writeFile(join(dir, 'src/View.ts'), view)
    await vi.waitFor(async () => expect(await readFile(output, 'utf8')).toContain('<p>hi</p>'), {
      timeout: 15_000,
    })
    // Settle, then prove the watcher's own writes did not keep it running.
    await new Promise(resolve => setTimeout(resolve, 300))
    const settled = events.length
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(events).toHaveLength(settled)
  } finally {
    watcher.close()
  }
}, 60_000)
