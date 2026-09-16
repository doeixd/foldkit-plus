#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { formatDiagnostic, generate, watch, type GenerateResult } from './generate.js'

const usage = `Usage: foldkit-react-codegen <file-or-directory>... --out-dir <directory> [--root-dir <directory>] [--watch]

Compiles Foldkit view functions to React TSX. Exits with status 1, writing
nothing, if any construct cannot be compiled. With --watch it recompiles on
change and keeps running after errors.`

const main = async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'out-dir': { type: 'string' },
      'root-dir': { type: 'string' },
      watch: { type: 'boolean', short: 'w' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const outDir = values['out-dir']
  if (values.help || positionals.length === 0 || outDir === undefined) {
    console.log(usage)
    return values.help ? 0 : 1
  }
  const options = {
    inputs: positionals,
    outDir,
    ...(values['root-dir'] === undefined ? {} : { rootDir: values['root-dir'] }),
  }
  if (values.watch) {
    watch(options, event => {
      if (event._tag === 'Failed') console.error(message(event.error))
      else report(event.result)
    })
    return new Promise<number>(() => {})
  }
  return report(await generate(options))
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

const report = (result: GenerateResult) => {
  for (const diagnostic of result.diagnostics) console.error(formatDiagnostic(diagnostic))
  if (result.diagnostics.length > 0) return 1
  console.log(`Wrote ${result.written.length} file(s), ${result.unchanged.length} unchanged.`)
  return 0
}

main().then(
  code => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(message(error))
    process.exitCode = 1
  },
)
