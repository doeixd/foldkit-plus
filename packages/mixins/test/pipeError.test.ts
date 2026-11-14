/**
 * The error a pipe gives when `A11y.conform` cannot be met is the one a
 * person reads, so it is asserted as text: it names what the steps before the
 * `conform` left owed, and nothing they supplied.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const mixins = resolve(import.meta.dirname, '..')
const fixture = join(mixins, 'test', 'fixtures', 'pipeError.mts')
const root = mkdtempSync(join(tmpdir(), 'foldkit-pipe-error-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** Each error TypeScript reports in the fixture, by line, its text joined onto one line. */
const errorsOfFixture = (): ReadonlyMap<number, string> => {
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      extends: join(mixins, 'tsconfig.json'),
      compilerOptions: {
        noEmit: true,
        composite: false,
        incremental: false,
        emitDeclarationOnly: false,
        rootDir: resolve(mixins, '..', '..'),
        // Read from where the config is, which is not the repository.
        typeRoots: [resolve(mixins, '..', '..', 'node_modules', '@types')],
      },
      include: [],
      files: [fixture],
    }),
  )
  const tsc = resolve(mixins, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc')
  let output = ''
  try {
    execFileSync(process.execPath, [tsc, '-p', root, '--pretty', 'false'], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
  } catch (error) {
    output = (error as { readonly stdout: string }).stdout
  }
  const errors = new Map<number, string>()
  let line: number | undefined
  for (const text of output.split('\n')) {
    const start = /pipeError\.mts\((\d+),\d+\): error/.exec(text)
    if (start !== null) {
      line = Number(start[1])
      errors.set(line, text)
    } else if (/^\S/.test(text)) {
      line = undefined
    } else if (line !== undefined) {
      errors.set(line, `${errors.get(line)} ${text.trim()}`)
    }
  }
  return errors
}

const owedIn = (text: string): ReadonlyArray<string> => {
  const owed = /'a11y:unsatisfied-obligation': ([^;}]+)/.exec(text)
  return owed === null ? [] : [...owed[1]!.matchAll(/"([^"]+)"/g)].map(match => match[1]!)
}

describe('a pipe whose conform is not met', () => {
  const errors = errorsOfFixture()

  it.each([
    ['after single attachments', 13],
    ['after a list of Behaviors', 20],
  ])('names only what is still owed, at the conform, %s', (_case, line) => {
    expect([...errors.keys()]).toContain(line)
    expect(owedIn(errors.get(line)!)).toEqual(['option/activation', 'option/state:aria-selected'])
  })

  it('reports nothing at the steps that supplied', () => {
    expect([...errors.keys()].sort((a, b) => a - b)).toEqual([13, 20])
  })
}, 120_000)
