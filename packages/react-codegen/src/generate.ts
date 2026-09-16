import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { watch as fsWatch } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
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

export type WatchEvent =
  | { readonly _tag: 'Generated'; readonly result: GenerateResult }
  | { readonly _tag: 'Failed'; readonly error: unknown }

/**
 * Runs `generate` now and again after each change under the inputs, one run at
 * a time; changes during a run cause exactly one more. Changes inside
 * `outDir` are ignored, so an out dir nested in an input does not loop.
 */
export const watch = (
  options: GenerateOptions,
  onEvent: (event: WatchEvent) => void,
): { readonly close: () => void } => {
  const outDir = resolve(options.outDir)
  let running = false
  let pending = false
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const run = async () => {
    if (running) {
      pending = true
      return
    }
    running = true
    try {
      do {
        pending = false
        const event: WatchEvent = await generate(options).then(
          result => ({ _tag: 'Generated', result }),
          (error: unknown) => ({ _tag: 'Failed', error }),
        )
        if (!closed) onEvent(event)
      } while (pending && !closed)
    } finally {
      running = false
    }
  }

  const watchers = options.inputs.map(input => {
    const path = resolve(input)
    return fsWatch(path, { recursive: true }, (_, file) => {
      const changed = file === null ? path : resolve(path, file.toString())
      if (closed || changed === outDir || changed.startsWith(outDir + sep)) return
      // Editors write a file in several steps; one run per burst.
      clearTimeout(timer)
      timer = setTimeout(() => void run(), 50)
    })
  })
  void run()

  return {
    close: () => {
      closed = true
      clearTimeout(timer)
      watchers.forEach(watcher => watcher.close())
    },
  }
}
