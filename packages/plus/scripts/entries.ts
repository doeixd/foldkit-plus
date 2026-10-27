/**
 * What `foldkit-plus` re-exports, read from the workspace: one subpath per
 * entry point of every published package (`foldkit-remote/port` is
 * `foldkit-plus/remote/port`), and how `foldkit-plus` depends on each. A package
 * whose peers are only Effect, Foldkit and other Foldkit Plus packages is a
 * dependency, installed with it; one that needs a library of its own (React,
 * Drizzle, Shiki) is an optional peer, so installing `foldkit-plus` installs
 * none of those libraries. `generate.ts` writes this; `test/generated.test.ts`
 * fails when what is written differs from it.
 */
import { Schema } from 'effect'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Entry {
  /** `remote/port`: the path under `foldkit-plus/`, and the file under `src/`. */
  readonly subpath: string
  /** `foldkit-remote/port`: what the file re-exports. */
  readonly specifier: string
}

export interface Included {
  readonly name: string
  readonly dir: string
  /** Needs a library beyond Effect, Foldkit and this workspace: an optional peer. */
  readonly adapter: boolean
  /** The libraries that make it an adapter. */
  readonly libraries: ReadonlyArray<string>
  readonly entries: ReadonlyArray<Entry>
}

/** The fields of a package's manifest this reads; the rest are let through. */
const Manifest = Schema.Struct({
  name: Schema.String,
  private: Schema.optional(Schema.Boolean),
  exports: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  peerDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  peerDependenciesMeta: Schema.optional(
    Schema.Record(Schema.String, Schema.Struct({ optional: Schema.optional(Schema.Boolean) })),
  ),
})

const SELF = 'plus'

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const manifestOf = (path: string) =>
  Schema.decodeUnknownSync(Manifest)(JSON.parse(readFileSync(path, 'utf8')))

/** Every published package but this one, in directory order. */
export const included = (root: string): ReadonlyArray<Included> =>
  readdirSync(join(root, 'packages'))
    .filter(dir => dir !== SELF && existsSync(join(root, 'packages', dir, 'package.json')))
    .map(dir => ({ dir, manifest: manifestOf(join(root, 'packages', dir, 'package.json')) }))
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ dir, manifest }) => {
      const libraries = Object.keys(manifest.peerDependencies ?? {}).filter(
        peer =>
          peer !== 'effect' &&
          peer !== 'foldkit' &&
          !peer.startsWith('foldkit-') &&
          manifest.peerDependenciesMeta?.[peer]?.optional !== true,
      )
      const entries = Object.entries(manifest.exports ?? {}).flatMap(([subpath, target]) => {
        const source = isRecord(target) ? target['foldkit-plus:source'] : undefined
        // A declaration file (`foldkit-media/client`'s ambient `?image` type) is no module to re-export.
        if (typeof source !== 'string' || !source.endsWith('.ts') || source.endsWith('.d.ts'))
          return []
        return [
          subpath === '.'
            ? { subpath: dir, specifier: manifest.name }
            : {
                subpath: `${dir}${subpath.slice(1)}`,
                specifier: `${manifest.name}${subpath.slice(1)}`,
              },
        ]
      })
      return { name: manifest.name, dir, adapter: libraries.length > 0, libraries, entries }
    })

/** The source of an entry's file. */
export const fileOf = (entry: Entry): string =>
  `/** \`${entry.specifier}\`, as \`foldkit-plus/${entry.subpath}\`. */\nexport * from '${entry.specifier}'\n`

/** `foldkit-plus`'s own entry points, beside those it re-exports. */
const OWN = {
  '.': {
    'foldkit-plus:source': './src/index.ts',
    types: './dist/index.d.mts',
    import: './dist/index.mjs',
  },
} as const

/**
 * The fields of `foldkit-plus`'s manifest that follow the workspace. The
 * adapters are dev dependencies too, so this workspace has them to compile
 * against; `devDependencies` is the manifest's own, which they join.
 */
export const generatedFields = (
  packages: ReadonlyArray<Included>,
  devDependencies: Readonly<Record<string, string>>,
) => {
  const foldkit = devDependencies['foldkit']
  if (foldkit === undefined) throw new Error('packages/plus/package.json has no foldkit to test')
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name))
  const core = sorted.filter(each => !each.adapter)
  const adapters = sorted.filter(each => each.adapter)
  return {
    exports: {
      ...OWN,
      ...Object.fromEntries(
        packages.flatMap(each =>
          each.entries.map(entry => [
            `./${entry.subpath}`,
            {
              'foldkit-plus:source': `./src/${entry.subpath}.ts`,
              types: `./dist/${entry.subpath}.d.mts`,
              import: `./dist/${entry.subpath}.mjs`,
            },
          ]),
        ),
      ),
    },
    dependencies: Object.fromEntries(core.map(each => [each.name, 'workspace:*'])),
    peerDependencies: {
      effect: '^4.0.0',
      foldkit: `^${foldkit}`,
      ...Object.fromEntries(adapters.map(each => [each.name, 'workspace:^'])),
    },
    peerDependenciesMeta: Object.fromEntries(adapters.map(each => [each.name, { optional: true }])),
    devDependencies: {
      ...Object.fromEntries(
        Object.entries(devDependencies).filter(([name]) => !name.startsWith('foldkit-')),
      ),
      ...Object.fromEntries(adapters.map(each => [each.name, 'workspace:*'])),
    },
  }
}

/**
 * What `npx foldkit-plus setup` installs, from the manifest of the Foldkit
 * tested here: that Foldkit, and the Effect it asks for. Foldkit names one
 * exactly, and npm refuses any other.
 */
export const setupOf = (foldkit: {
  readonly version: string
  readonly peerDependencies: Readonly<Record<string, string>>
}) => {
  const effect = foldkit.peerDependencies['effect']
  if (effect === undefined) throw new Error('Foldkit names no Effect peer')
  return { foldkit: foldkit.version, effect }
}

/** The projects `foldkit-plus`'s `tsconfig.json` references: one per package it re-exports. */
export const references = (packages: ReadonlyArray<Included>) =>
  [...packages]
    .sort((a, b) => a.dir.localeCompare(b.dir))
    .map(each => ({ path: `../${each.dir}/tsconfig.build.json` }))

/** The files under `src/` that are the package's own, never generated. */
export const OWN_FILES: ReadonlyArray<string> = ['index.ts', 'cli.ts', 'project.ts', 'setup.ts']

/** Every generated file now under `src/`, as `remote/port.ts`. */
export const writtenFiles = (packageDir: string): ReadonlyArray<string> => {
  const walk = (dir: string, prefix: string): ReadonlyArray<string> =>
    readdirSync(join(packageDir, 'src', dir), { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory()
        ? walk(join(dir, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`],
    )
  return walk('', '').filter(file => !OWN_FILES.includes(file))
}
