/**
 * What the CLI reads from the disk: the project in a folder, its package
 * manager, and this package's own manifest.
 */
import { Option, Schema } from 'effect'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'

import { declarationsIn, type Declaration, type Doc } from './docs.js'
import type { Manager, PnpmSettings, Project } from './setup.js'

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

/**
 * Where pnpm reads `folder`'s `overrides` and `peerDependencyRules`: the
 * workspace root, the nearest folder at or above it with a
 * `pnpm-workspace.yaml`, since pnpm ignores them in a member's `package.json`.
 * There, the root `package.json`'s `pnpm` field if it already has one, else
 * the YAML; with no workspace, the project's own `package.json`.
 */
const pnpmSettingsIn = (folder: string): PnpmSettings => {
  const root = projectFolders(folder).find(at => existsSync(join(at, 'pnpm-workspace.yaml')))
  if (root === undefined) return { folder: '.', file: 'package.json' }
  const manifest = join(root, 'package.json')
  const field =
    existsSync(manifest) &&
    Object.hasOwn(JSON.parse(readFileSync(manifest, 'utf8')) as object, 'pnpm')
  return {
    folder: relative(folder, root).split(sep).join('/') || '.',
    file: field ? 'package.json' : 'pnpm-workspace.yaml',
  }
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
    pnpmSettings: pnpmSettingsIn(folder),
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

/** A failure the reader can act on, printed as its message alone. */
export class Refusal extends Error {}

/** The Foldkit Plus packages a manifest names: its own `foldkit-*` dependencies and peers. */
export const familyOf = (manifest: ReturnType<typeof readManifest>): ReadonlyArray<string> =>
  Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }).filter(name =>
    name.startsWith('foldkit-'),
  )

/**
 * Where an `import` from `base` finds `name`: the nearest `node_modules` above
 * it that holds the package, with links resolved, so a package's own
 * dependencies are found beside it in pnpm's store. ESM reads neither
 * `NODE_PATH` nor the global folders, which `require.resolve.paths` adds.
 */
const installedFrom = (base: string, name: string): Option.Option<string> => {
  for (let at = base; ; at = dirname(at)) {
    const candidate = join(at, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return Option.some(realpathSync(candidate))
    if (dirname(at) === at) return Option.none()
  }
}

interface Installed {
  readonly name: string
  readonly version: string
  readonly dir: string
}

/** The `foldkit-plus` skill nearest the project: in a dot-folder's `skills/` here, above, or at home. */
const skillIn = (folder: string): Option.Option<string> => {
  for (const at of [...projectFolders(folder), homedir()]) {
    const holders = existsSync(at)
      ? readdirSync(at, { withFileTypes: true }).filter(
          entry => entry.isDirectory() && entry.name.startsWith('.'),
        )
      : []
    const skill = holders
      .map(entry => join(at, entry.name, 'skills', 'foldkit-plus'))
      .find(dir => existsSync(join(dir, 'SKILL.md')))
    if (skill !== undefined) return Option.some(skill)
  }
  return Option.none()
}

const declarationFiles = (dir: string): ReadonlyArray<string> =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory()
          ? declarationFiles(join(dir, entry.name))
          : /\.d\.m?ts$/.test(entry.name)
            ? [join(dir, entry.name)]
            : [],
      )
    : []

const topicOf = (name: string) => name.replace(/^foldkit-/, '')

/** What `docs` reads for a project: its documents, and a way to look a symbol up in its types. */
export interface Library {
  readonly docs: ReadonlyArray<Doc>
  readonly declarations: (symbol: string) => ReadonlyArray<Declaration>
}

/**
 * The documents of what is installed in `folder`: the README of each Foldkit
 * Plus package Node would load there, and the skill's files if it is
 * installed. `family` is the packages this CLI knows of; an installed
 * `foldkit-plus` adds those it knows. Refuses a folder with no project, a
 * package the project names but has not installed, and a project with none.
 */
export const libraryIn = (folder: string, family: ReadonlyArray<string>): Library => {
  const project = projectIn(folder)
  if (Option.isNone(project))
    throw new Refusal(
      `There is no package.json in ${folder}: run this in the application's folder.`,
    )
  const plus = installedFrom(folder, 'foldkit-plus')
  const names = new Set([
    'foldkit-plus',
    ...family,
    ...Option.match(plus, {
      onNone: () => [],
      onSome: dir => familyOf(readManifest(join(dir, 'package.json'))),
    }),
  ])
  const installed: Array<Installed> = []
  for (const name of [...names].sort()) {
    // What the project names is what its own imports load; the rest is what
    // `foldkit-plus` loads, which a copy in a folder above must not stand for.
    const named = project.value.versions[name] !== undefined
    const fromProject = () => installedFrom(folder, name)
    const dir = named
      ? fromProject()
      : Option.orElse(
          Option.flatMap(plus, at => installedFrom(at, name)),
          fromProject,
        )
    Option.match(dir, {
      onNone: () => {
        if (named)
          throw new Refusal(
            `package.json names ${name}, but it is not installed in ${folder}: run the install first.`,
          )
      },
      onSome: at => {
        const version = readManifest(join(at, 'package.json')).version ?? 'unversioned'
        installed.push({ name, version, dir: at })
      },
    })
  }
  if (installed.length === 0)
    throw new Refusal(
      `No Foldkit Plus package is installed in ${folder}. \`npx foldkit-plus setup\` says how to install one.`,
    )
  const skill = Option.match(skillIn(folder), {
    onNone: () => [],
    onSome: dir => {
      const front = readFileSync(join(dir, 'SKILL.md'), 'utf8')
      const version = /^\s+version:\s*['"]?([^'"\s]+)/m.exec(front)?.[1] ?? 'unversioned'
      const references = join(dir, 'references')
      const files = [
        join(dir, 'SKILL.md'),
        ...(existsSync(references)
          ? readdirSync(references)
              .filter(file => file.endsWith('.md'))
              .sort()
              .map(file => join(references, file))
          : []),
      ]
      return files.map(path => ({
        topic: path.endsWith('SKILL.md') ? 'skill' : relative(references, path).slice(0, -3),
        label: `foldkit-plus skill ${version} ${relative(dir, path).split(sep).join('/')}`,
        path,
        text: readFileSync(path, 'utf8'),
      }))
    },
  })
  const readmes = installed.flatMap(each => {
    const path = join(each.dir, 'README.md')
    return existsSync(path)
      ? [
          {
            topic: topicOf(each.name),
            label: `${each.name}@${each.version} README.md`,
            path,
            text: readFileSync(path, 'utf8'),
          },
        ]
      : []
  })
  return {
    docs: [...skill, ...readmes],
    // Read only for a symbol; `foldkit-plus`'s own types re-export the others'.
    declarations: symbol => {
      const seen = new Set<string>()
      return installed
        .filter(each => each.name !== 'foldkit-plus')
        .flatMap(each =>
          declarationFiles(join(each.dir, 'dist')).flatMap(path =>
            declarationsIn(
              {
                topic: topicOf(each.name),
                origin: `${each.name}@${each.version}`,
                path,
                text: readFileSync(path, 'utf8'),
              },
              symbol,
            ),
          ),
        )
        .filter(found => {
          const key = [...found.comment, ...found.signature].join('\n')
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
    },
  }
}
