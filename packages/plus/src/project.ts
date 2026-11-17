/**
 * What the CLI reads from the disk: the project in a folder, its package
 * manager, and this package's own manifest.
 */
import { Option, Schema } from 'effect'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, sep } from 'node:path'

import { declarationsIn, type Declaration, type Doc } from './docs.js'
import { mismatchNote, nameOf, planInstall, refusal, versionOf, type Existing } from './skill.js'
import { effectPackages, type Manager, type PnpmSettings, type Project } from './setup.js'

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

const NpmLock = Schema.Struct({
  packages: Schema.Record(
    Schema.String,
    Schema.Struct({ version: Schema.optional(Schema.String) }),
  ),
})

/**
 * The versions of Effect's packages in the nearest npm lockfile, keyed by
 * install path (`node_modules/@foldkit/vite-plugin/node_modules/effect`). One
 * npm cannot read holds none.
 */
const lockedEffect = (folder: string): ReadonlyArray<string> => {
  const lock = projectFolders(folder)
    .map(at => join(at, 'package-lock.json'))
    .find(existsSync)
  if (lock === undefined) return []
  return Option.match(
    Schema.decodeUnknownOption(Schema.fromJsonString(NpmLock))(readFileSync(lock, 'utf8')),
    {
      onNone: () => [],
      onSome: ({ packages }) =>
        Object.entries(packages).flatMap(([path, entry]) =>
          entry.version !== undefined &&
          effectPackages.some(name => path.endsWith(`node_modules/${name}`))
            ? [entry.version]
            : [],
        ),
    },
  )
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
    locked: lockedEffect(folder),
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
export const installedFrom = (base: string, name: string): Option.Option<string> => {
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

const shipsDocs = (dir: string) => existsSync(join(dir, 'skill', 'SKILL.md'))

const markdownIn = (dir: string): ReadonlyArray<string> =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(file => file.endsWith('.md'))
        .sort()
        .map(file => join(dir, file))
    : []

/** The skill and the guides a `foldkit-plus` in `dir` ships, labelled with its version. */
const shippedDocs = (dir: string): ReadonlyArray<Doc> => {
  const label = `foldkit-plus@${readManifest(join(dir, 'package.json')).version ?? 'unversioned'}`
  const doc = (topic: string, kind: string, path: string): Doc => ({
    topic,
    label: `${label} ${kind}`,
    path,
    text: readFileSync(path, 'utf8'),
  })
  return [
    doc('skill', 'skill SKILL.md', join(dir, 'skill', 'SKILL.md')),
    ...markdownIn(join(dir, 'skill', 'references')).map(path =>
      doc(basename(path, '.md'), `skill references/${basename(path)}`, path),
    ),
    ...markdownIn(join(dir, 'guides')).map(path =>
      doc(basename(path, '.md'), `guide ${basename(path)}`, path),
    ),
  ]
}

/** A path as the project would write it, or in full when it lies outside. */
const shown = (folder: string, path: string) => {
  const inside = relative(folder, path)
  return inside.startsWith('..') ? path : inside.split(sep).join('/')
}

/** What to tell the reader when the skill in their dot-folder is not the one shipped. */
const mismatches = (folder: string, shipping: string): ReadonlyArray<string> => {
  const plus = readManifest(join(shipping, 'package.json')).version ?? 'unversioned'
  const shipped = versionOf(readFileSync(join(shipping, 'skill', 'SKILL.md'), 'utf8'))
  return Option.toArray(skillIn(folder)).flatMap(dir =>
    Option.toArray(
      Option.flatMap(versionOf(readFileSync(join(dir, 'SKILL.md'), 'utf8')), found =>
        Option.flatMap(shipped, current =>
          mismatchNote(shown(folder, dir), found, current, `foldkit-plus@${plus}`),
        ),
      ),
    ),
  )
}

/** What `docs` reads for a project: its documents, and a way to look a symbol up in its types. */
export interface Library {
  readonly docs: ReadonlyArray<Doc>
  /** Lines for the reader that are no part of an answer. */
  readonly notes: ReadonlyArray<string>
  readonly declarations: (symbol: string) => ReadonlyArray<Declaration>
}

/**
 * The documents of what is installed in `folder`: the README of each Foldkit
 * Plus package Node would load there, and the skill's files if it is
 * installed. `family` is the packages this CLI knows of; an installed
 * `foldkit-plus` adds those it knows. Refuses a folder with no project, a
 * package the project names but has not installed, and a project with none.
 */
export const libraryIn = (
  folder: string,
  family: ReadonlyArray<string>,
  ownDir?: string,
): Library => {
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
  // The skill and guides `foldkit-plus` ships are the ones for the code that
  // is installed; a project's own copy of the skill is only compared with them.
  const shipping = [...Option.toArray(plus), ...(ownDir === undefined ? [] : [ownDir])].find(
    shipsDocs,
  )
  const shipped = shipping === undefined ? [] : shippedDocs(shipping)
  const notes = shipping === undefined ? [] : mismatches(folder, shipping)
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
    docs: [...shipped, ...readmes],
    notes,
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

/** The agent folders a project's skill lives in: those already holding one, else the two skills.sh writes. */
const skillHomes = (folder: string): ReadonlyArray<string> => {
  const held = readdirSync(folder, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('.'))
    .map(entry => entry.name)
    .filter(name => existsSync(join(folder, name, 'skills', 'foldkit-plus')))
    .sort()
  return held.length > 0 ? held : ['.claude', '.agents']
}

const existingSkill = (target: string): Option.Option<Existing> => {
  if (!existsSync(target)) return Option.none()
  const file = join(target, 'SKILL.md')
  if (!existsSync(file)) return Option.some({ ours: false, version: Option.none() })
  const text = readFileSync(file, 'utf8')
  return Option.some({
    ours: Option.exists(nameOf(text), name => name === 'foldkit-plus'),
    version: versionOf(text),
  })
}

const filesIn = (dir: string): number =>
  readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).length

/**
 * `npx foldkit-plus skill`: the skill shipped with the project's installed
 * `foldkit-plus` (else with this CLI) copied to `skills/foldkit-plus` under
 * each agent folder. A folder holding the same version is left alone, and
 * one holding anything else is refused unless `force`.
 */
export const installSkill = (folder: string, force: boolean, ownDir?: string) => {
  if (Option.isNone(projectIn(folder)))
    throw new Refusal(
      `There is no package.json in ${folder}: run this in the application's folder.`,
    )
  const source = [
    ...Option.toArray(installedFrom(folder, 'foldkit-plus')),
    ...(ownDir === undefined ? [] : [ownDir]),
  ].find(shipsDocs)
  if (source === undefined)
    throw new Refusal(
      'No foldkit-plus that ships the skill is installed here: install a release that does.',
    )
  const from = join(source, 'skill')
  const shipped = Option.getOrElse(
    versionOf(readFileSync(join(from, 'SKILL.md'), 'utf8')),
    () => 'unversioned',
  )
  const plus = readManifest(join(source, 'package.json')).version ?? 'unversioned'
  const lines: Array<string> = []
  let refused = false
  for (const home of skillHomes(folder)) {
    const target = join(folder, home, 'skills', 'foldkit-plus')
    const where = `${home}/skills/foldkit-plus`
    const existing = existingSkill(target)
    const plan = planInstall(existing, shipped, force)
    if (plan === 'refuse') {
      refused = true
      lines.push(
        Option.match(existing, {
          onNone: () => '',
          onSome: found => refusal(where, found, shipped),
        }),
      )
      continue
    }
    if (plan === 'current') {
      lines.push(`${where} is already foldkit-plus skill ${shipped}.`)
      continue
    }
    rmSync(target, { recursive: true, force: true })
    mkdirSync(dirname(target), { recursive: true })
    cpSync(from, target, { recursive: true })
    lines.push(
      `${plan === 'write' ? 'Wrote' : 'Replaced'} ${where}: foldkit-plus skill ${shipped} from foldkit-plus@${plus} (${filesIn(target)} files).`,
    )
  }
  return { text: lines.map(line => `${line}\n`).join(''), isError: refused }
}
