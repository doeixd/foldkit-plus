/**
 * What the CLI reads from the disk: the project in a folder, its package
 * manager, and this package's own manifest.
 */
import { Option, Schema } from 'effect'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type { Manager, Project } from './setup.js'

const Versions = Schema.Record(Schema.String, Schema.String)
const Manifest = Schema.Struct({
  name: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  dependencies: Schema.optional(Versions),
  devDependencies: Schema.optional(Versions),
  peerDependencies: Schema.optional(Versions),
  setup: Schema.optional(Schema.Struct({ effect: Schema.String, foldkit: Schema.String })),
})
export const readManifest = (path: string) =>
  Schema.decodeUnknownSync(Manifest)(JSON.parse(readFileSync(path, 'utf8')))

/**
 * A project's folder and those above it, up to its repository's root and no
 * further, and never into the home folder: a file left there says nothing
 * about this project. A folder that is no project has none.
 */
const projectFolders = (folder: string): ReadonlyArray<string> => {
  const folders: Array<string> = []
  const project = existsSync(join(folder, 'package.json'))
  for (let at = folder; project && at !== homedir(); at = dirname(at)) {
    folders.push(at)
    if (existsSync(join(at, '.git')) || dirname(at) === at) break
  }
  return folders
}

/** The project in `folder`, if it is one. */
export const projectIn = (folder: string): Option.Option<Project> => {
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
    gitattributes: projectFolders(folder).some(at => existsSync(join(at, '.gitattributes'))),
  })
}

/**
 * The project's package manager by its lockfile, here or in a project folder
 * above (a workspace keeps one at its root), else the one running this.
 */
export const managerIn = (folder: string): Manager => {
  const locks: ReadonlyArray<readonly [string, Manager]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ]
  for (const at of projectFolders(folder)) {
    const locked = locks.find(([file]) => existsSync(join(at, file)))
    if (locked !== undefined) return locked[1]
  }
  const agent = process.env['npm_config_user_agent'] ?? ''
  return (
    locks.map(([, manager]) => manager).find(manager => agent.startsWith(`${manager}/`)) ?? 'npm'
  )
}
