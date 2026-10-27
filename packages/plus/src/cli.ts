#!/usr/bin/env node
/**
 * `npx foldkit-plus`: `setup` prints `setup.ts`'s instructions for the project
 * in this folder; `docs` answers from the docs installed there (`docs.ts`);
 * `mcp` serves `docs` as Model Context Protocol tools over stdio (`mcp.ts`).
 */
import { Option } from 'effect'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

import { answer, answerJson, answerText, found, outlineText, topicsOf } from './docs.js'
import { reply, type ToolResult } from './mcp.js'
import { Refusal, familyOf, libraryIn, managerIn, projectIn, readManifest } from './project.js'
import { setupGuide } from './setup.js'

const usage = `Usage:
  npx foldkit-plus setup            How to install Foldkit Plus in the project
                                    in this folder: instructions for a coding agent.
  npx foldkit-plus docs <query>     The best sections of the installed packages'
                                    docs (READMEs and the foldkit-plus skill) for
                                    a symbol (Remote.make) or words; --json for a program.
  npx foldkit-plus docs --list [topic]
                                    The installed documents, or one topic's outline.
  npx foldkit-plus mcp              The docs as MCP tools over stdio.`

// Beside `dist` and `src` alike.
const own = readManifest(fileURLToPath(new URL('../package.json', import.meta.url)))

/** The versions this release installs, from its own manifest. */
const ownVersions = () => {
  if (own.version === undefined) throw new Error("foldkit-plus's manifest has no version")
  if (own.setup === undefined) throw new Error("foldkit-plus's manifest names no setup versions")
  return { plus: own.version, ...own.setup }
}

const library = () => libraryIn(process.cwd(), familyOf(own))

/**
 * `docs`' answer to a search, read afresh, so a reinstall shows at once. One
 * that found nothing is a failure, said in words even under `--json`.
 */
const search = (query: string, json = false): ToolResult => {
  const { docs, declarations } = library()
  const result = answer(docs, query, declarations)
  return found(result)
    ? { text: json ? answerJson(result) : answerText(result), isError: false }
    : { text: answerText(result), isError: true }
}

const outline = (topic: Option.Option<string>): ToolResult => {
  const { docs } = library()
  return Option.match(outlineText(docs, topic), {
    onNone: () => ({
      text: `No installed document is on "${Option.getOrElse(topic, () => '')}". The topics are: ${topicsOf(docs).join(', ')}.\n`,
      isError: true,
    }),
    onSome: text => ({ text, isError: false }),
  })
}

/** A refusal is the reader's to act on, so it is its message; anything else is a bug and throws. */
const refused = (run: () => ToolResult): ToolResult => {
  try {
    return run()
  } catch (error) {
    if (error instanceof Refusal) return { text: `${error.message}\n`, isError: true }
    throw error
  }
}

const print = (result: ToolResult) => {
  ;(result.isError ? process.stderr : process.stdout).write(result.text)
  process.exitCode = result.isError ? 1 : 0
}

const docs = (args: ReadonlyArray<string>) => {
  const flags = args.filter(arg => arg.startsWith('--'))
  const words = args.filter(arg => !arg.startsWith('--'))
  const unknown = flags.filter(flag => flag !== '--json' && flag !== '--list')
  if (unknown.length > 0 || (words.length === 0 && !flags.includes('--list'))) {
    process.stderr.write(`${usage}\n`)
    process.exitCode = 1
    return
  }
  if (flags.includes('--list')) return print(refused(() => outline(Option.fromNullishOr(words[0]))))
  print(refused(() => search(words.join(' '), flags.includes('--json'))))
}

const mcp = () => {
  const serve = {
    version: own.version ?? 'unversioned',
    search: (query: string) => refused(() => search(query)),
    outline: (topic: Option.Option<string>) => refused(() => outline(topic)),
  }
  createInterface({ input: process.stdin }).on('line', line => {
    if (line.trim() === '') return
    Option.map(reply(line, serve), out => process.stdout.write(`${out}\n`))
  })
}

const [command = 'setup', ...rest] = process.argv.slice(2)
if (command === 'setup') {
  const folder = process.cwd()
  process.stdout.write(
    setupGuide({ project: projectIn(folder), manager: managerIn(folder), versions: ownVersions() }),
  )
} else if (command === 'docs') {
  docs(rest)
} else if (command === 'mcp') {
  mcp()
} else {
  process.stdout.write(`${usage}\n`)
  process.exitCode = command === '--help' || command === '-h' || command === 'help' ? 0 : 1
}
