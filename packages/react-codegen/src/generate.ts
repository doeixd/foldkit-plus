import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { transformSourceFile, type Diagnostic } from './transform.js'

export interface GenerateOptions {
  /** Files or directories; directories are searched for `.ts` files that are not declarations or tests. */
  readonly inputs: ReadonlyArray<string>
  readonly outDir: string
  /** Output paths mirror input paths relative to this directory. Defaults to the working directory. */
  readonly rootDir?: string
}

export interface GenerateResult {
  readonly written: ReadonlyArray<string>
  readonly unchanged: ReadonlyArray<string>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const isSource = (path: string) =>
  path.endsWith('.ts') && !path.endsWith('.d.ts') && !/\.test(-d)?\.ts$/.test(path)

const collect = async (path: string): Promise<Array<string>> => {
  if (!(await stat(path)).isDirectory()) return [path]
  const entries = await readdir(path, { withFileTypes: true })
  const nested = await Promise.all(
    entries
      .filter(entry => entry.isDirectory() || isSource(entry.name))
      .map(entry => collect(join(path, entry.name))),
  )
  return nested.flat()
}

/**
 * Compiles each input to `<outDir>/<path relative to rootDir>.tsx`. Writes
 * nothing if any file has diagnostics, and leaves a file untouched when its
 * bytes would not change, so watchers and version control see no churn.
 */
export const generate = async (options: GenerateOptions): Promise<GenerateResult> => {
  const rootDir = resolve(options.rootDir ?? '.')
  const files = (await Promise.all(options.inputs.map(input => collect(resolve(input)))))
    .flat()
    .sort()
  const outputs: Array<{ readonly path: string; readonly code: string }> = []
  const diagnostics: Array<Diagnostic> = []

  for (const file of files) {
    const name = relative(rootDir, file).replace(/\\/g, '/')
    if (name.startsWith('../')) {
      throw new Error(`${file} is outside the root directory ${rootDir}.`)
    }
    const result = transformSourceFile(name, await readFile(file, 'utf8'))
    if (result.ok) {
      outputs.push({
        path: join(resolve(options.outDir), name.replace(/\.ts$/, '.tsx')),
        code: result.code,
      })
    } else {
      diagnostics.push(...result.diagnostics)
    }
  }
  if (diagnostics.length > 0) return { written: [], unchanged: [], diagnostics }

  const written: Array<string> = []
  const unchanged: Array<string> = []
  for (const { path, code } of outputs) {
    const existing = await readFile(path, 'utf8').catch(() => undefined)
    if (existing === code) {
      unchanged.push(path)
      continue
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, code)
    written.push(path)
  }
  return { written, unchanged, diagnostics }
}

export const formatDiagnostic = (diagnostic: Diagnostic) =>
  `${diagnostic.fileName}:${diagnostic.line}:${diagnostic.column} - error ${diagnostic.code}: ${diagnostic.message}`
