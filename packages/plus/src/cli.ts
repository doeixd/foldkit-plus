#!/usr/bin/env node
/**
 * `npx foldkit-plus setup`: reads the project in the current folder and this
 * package's own manifest, and prints `setup.ts`'s instructions for it.
 */
import { Option, Schema } from 'effect'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { setupGuide, type Manager, type Project } from './setup.js'

const usage = `Usage: npx foldkit-plus setup

Prints, for the project in this folder, how to install Effect, Foldkit and
Foldkit Plus, how to add the agent skill, and which package does which job:
instructions written for a coding agent to follow.`

const Versions = Schema.Record(Schema.String, Schema.String)
const Manifest = Schema.Struct({
  name: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  dependencies: Schema.optional(Versions),
  devDependencies: Schema.optional(Versions),
  peerDependencies: Schema.optional(Versions),
  setup: Schema.optional(Schema.Struct({ effect: Schema.String, foldkit: Schema.String })),
})
const readManifest = (path: string) =>
  Schema.decodeUnknownSync(Manifest)(JSON.parse(readFileSync(path, 'utf8')))

/** The project here, if this is one. */
const projectIn = (folder: string): Option.Option<Project> => {
  const path = join(folder, 'package.json')
  if (!existsSync(path)) return Option.none()
  const manifest = readManifest(path)
  return Option.some({
    name: manifest.name ?? 'this project',
    versions: {
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
      ...manifest.dependencies,
    },
  })
}

/**
 * The project's package manager by its lockfile, here or in a project folder
 * above (a workspace keeps one at its root), else the one running this.
 */
const managerIn = (folder: string): Manager => {
  const locks: ReadonlyArray<readonly [string, Manager]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ]
  // Up to the repository's root and no further, and never into the home
  // folder: a lockfile left there says nothing about this project. A folder
  // that is no project has no lockfile of its own to find.
  const project = existsSync(join(folder, 'package.json'))
  for (let at = folder; project && at !== homedir(); at = dirname(at)) {
    const locked = locks.find(([file]) => existsSync(join(at, file)))
    if (locked !== undefined) return locked[1]
    if (existsSync(join(at, '.git')) || dirname(at) === at) break
  }
  const agent = process.env['npm_config_user_agent'] ?? ''
  return (
    locks.map(([, manager]) => manager).find(manager => agent.startsWith(`${manager}/`)) ?? 'npm'
  )
}

/** The versions this release installs, from its own manifest, beside `dist` and `src` alike. */
const ownVersions = () => {
  const own = readManifest(fileURLToPath(new URL('../package.json', import.meta.url)))
  if (own.version === undefined) throw new Error("foldkit-plus's manifest has no version")
  if (own.setup === undefined) throw new Error("foldkit-plus's manifest names no setup versions")
  return { plus: own.version, ...own.setup }
}

const [command = 'setup'] = process.argv.slice(2)
if (command === 'setup') {
  const folder = process.cwd()
  process.stdout.write(
    setupGuide({ project: projectIn(folder), manager: managerIn(folder), versions: ownVersions() }),
  )
} else {
  process.stdout.write(`${usage}\n`)
  process.exitCode = command === '--help' || command === '-h' || command === 'help' ? 0 : 1
}
