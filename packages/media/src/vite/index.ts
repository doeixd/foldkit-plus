/**
 * Icons as imports: `import { arrowLeft } from 'virtual:foldkit-icons/lucide'`
 * gives the icon's `IconData`, read from an Iconify set or a folder of the
 * application's own SVG files when the build reads the import. The import is
 * the selection, and the bundler drops what nothing imports. A declaration
 * file names every icon of every set, so a misspelt name is a type error.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { Schema } from 'effect'
import type { Plugin } from 'vite'
import type { IconData } from '../icon.js'
import { fromIconify, IconifySet, namesOf, parse } from '../icons/index.js'

const PREFIX = 'virtual:foldkit-icons/'
// Rollup's mark for a module no file holds, which other plugins leave alone.
const RESOLVED = `${String.fromCharCode(0)}${PREFIX}`
const SET_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

export interface IconsOptions {
  /** Iconify sets by prefix (`lucide`, `uil`), each read from the application's `@iconify-json/<prefix>`. */
  readonly iconify?: ReadonlyArray<string> | undefined
  /** The application's own sets: a name, and a folder whose SVG files are its icons, each named by its file. */
  readonly folders?: Readonly<Record<string, string>> | undefined
  /** Where the declaration of every set is written, from the root: `foldkit-icons.d.ts` unless given; `false` writes none. */
  readonly dts?: string | false | undefined
}

/** An icon set ready to be a module: each icon under the name it is imported by. */
interface ReadSet {
  readonly icons: ReadonlyArray<readonly [exported: string, icon: IconData]>
  /** The icons of an Iconify set the parser refused, and why: left out, so importing one fails. */
  readonly refused: ReadonlyArray<readonly [name: string, reason: string]>
}

/** `arrow-left` is `arrowLeft`, and `1-circle` `_1Circle`; JavaScript's reserved words export as they are. */
export const exportName = (name: string): string => {
  const camel = name.replace(/[-_:.]+([a-zA-Z0-9])/g, (_, next: string) => next.toUpperCase())
  return /^[0-9]/.test(camel) ? `_${camel}` : camel
}

const named = (
  set: string,
  entries: ReadonlyArray<readonly [name: string, icon: IconData]>,
): ReadSet['icons'] => {
  const seen = new Map<string, string>()
  return entries.map(([name, icon]) => {
    const exported = exportName(name)
    if (!/^[A-Za-z_$][\w$]*$/.test(exported)) {
      throw new Error(`foldkit-media/vite: the icon "${set}:${name}" has no name to import it by.`)
    }
    const earlier = seen.get(exported)
    if (earlier !== undefined) {
      throw new Error(
        `foldkit-media/vite: the icons "${set}:${earlier}" and "${set}:${name}" would both be imported as ${exported}.`,
      )
    }
    seen.set(exported, name)
    return [exported, icon] as const
  })
}

const moduleOf = ({ icons }: ReadSet): string =>
  [
    ...icons.map(([, icon], at) => `const i${at} = ${JSON.stringify(icon)}`),
    `export { ${icons.map(([exported], at) => `i${at} as ${exported}`).join(', ')} }`,
  ].join('\n')

const declarationOf = (sets: ReadonlyMap<string, ReadSet>): string =>
  [
    '// Written by foldkit-media/vite from the icon sets it is given. Do not edit.',
    ...[...sets].map(([name, { icons, refused }]) =>
      [
        `declare module '${PREFIX}${name}' {`,
        "  import type { IconData } from 'foldkit-media'",
        ...refused.map(
          ([icon, reason]) => `  // Left out, ${icon}: ${reason.replace(/\s+/g, ' ')}`,
        ),
        ...icons.map((_, at) => `  const i${at}: IconData`),
        `  export { ${icons.map(([exported], at) => `i${at} as ${exported}`).join(', ')} }`,
        '}',
      ].join('\n'),
    ),
    '',
  ].join('\n')

/**
 * The plugin: give it the sets the application imports from. An SVG in a
 * folder that the parser refuses fails the build, naming the file; an icon of
 * an Iconify set that it refuses is left out of the set, and its declaration
 * says why, so only importing that icon fails.
 */
export const icons = (options: IconsOptions = {}): Plugin => {
  const iconify = options.iconify ?? []
  const folders = Object.entries(options.folders ?? {})
  for (const name of [...iconify, ...folders.map(([name]) => name)]) {
    if (!SET_NAME.test(name)) {
      throw new Error(
        `foldkit-media/vite: "${name}" is not a set name (lowercase words and hyphens).`,
      )
    }
  }
  const twice = [...iconify, ...folders.map(([name]) => name)].find(
    (name, at, all) => all.indexOf(name) !== at,
  )
  if (twice !== undefined) throw new Error(`foldkit-media/vite: the set "${twice}" is given twice.`)

  let root = process.cwd()
  const read = new Map<string, ReadSet>()
  const folderDirs = new Map(folders)
  const folderOf = (name: string) => resolve(root, folderDirs.get(name)!)

  const readIconify = (prefix: string): ReadSet => {
    const require = createRequire(join(root, 'package.json'))
    let file: string
    try {
      file = require.resolve(`@iconify-json/${prefix}/icons.json`)
    } catch {
      throw new Error(
        `foldkit-media/vite: the Iconify set "${prefix}" is not installed: add @iconify-json/${prefix}.`,
      )
    }
    let set: IconifySet
    try {
      set = Schema.decodeUnknownSync(IconifySet)(JSON.parse(readFileSync(file, 'utf8')))
    } catch (error) {
      throw new Error(
        `foldkit-media/vite: ${file} is not an Iconify set: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    const icons: Array<readonly [string, IconData]> = []
    const refused: Array<readonly [string, string]> = []
    for (const name of namesOf(set)) {
      try {
        icons.push([name, fromIconify(set, name)])
      } catch (error) {
        refused.push([name, error instanceof Error ? error.message : String(error)])
      }
    }
    return { icons: named(prefix, icons), refused }
  }

  const readFolder = (name: string): ReadSet => {
    const folder = folderOf(name)
    const files = readdirSync(folder)
      .filter(file => extname(file) === '.svg')
      .sort()
    return {
      icons: named(
        name,
        files.map(file => {
          const path = join(folder, file)
          return [
            file.slice(0, -4),
            parse(readFileSync(path, 'utf8'), relative(root, path)),
          ] as const
        }),
      ),
      refused: [],
    }
  }

  const setOf = (name: string): ReadSet => {
    const known = read.get(name)
    if (known !== undefined) return known
    const made = iconify.includes(name) ? readIconify(name) : readFolder(name)
    read.set(name, made)
    return made
  }

  const all = () => [...iconify, ...folders.map(([name]) => name)]

  const writeDeclaration = () => {
    if (options.dts === false) return
    const path = resolve(root, options.dts ?? 'foldkit-icons.d.ts')
    const text = declarationOf(new Map(all().map(name => [name, setOf(name)])))
    let current: string | undefined
    try {
      current = readFileSync(path, 'utf8')
    } catch {
      current = undefined
    }
    // Written only when it changes, so a watcher on the file does not see a write of every build.
    if (current !== text) writeFileSync(path, text)
  }

  return {
    name: 'foldkit-media:icons',
    configResolved(config) {
      root = config.root
    },
    buildStart() {
      read.clear()
      writeDeclaration()
      for (const [name] of folders) this.addWatchFile(folderOf(name))
    },
    resolveId(id) {
      if (!id.startsWith(PREFIX)) return undefined
      const name = id.slice(PREFIX.length)
      if (!all().includes(name)) {
        throw new Error(
          `foldkit-media/vite: there is no icon set "${name}"; the sets given are ${all().join(', ') || 'none'}.`,
        )
      }
      return `${RESOLVED}${name}`
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return undefined
      const name = id.slice(RESOLVED.length)
      if (folders.some(([folder]) => folder === name)) {
        for (const file of readdirSync(folderOf(name)))
          this.addWatchFile(join(folderOf(name), file))
      }
      return moduleOf(setOf(name))
    },
    configureServer(server) {
      const dirs = folders.map(([name]) => [name, folderOf(name)] as const)
      server.watcher.add(dirs.map(([, dir]) => dir))
      server.watcher.on('all', (_, file) => {
        const changed = dirs.find(([, dir]) => {
          const path = relative(dir, file)
          return !isAbsolute(path) && !path.startsWith('..')
        })
        if (changed === undefined || extname(file) !== '.svg') return
        read.delete(changed[0])
        try {
          writeDeclaration()
        } catch (error) {
          // A throw here would end the server; the set's next load fails with it, where the page shows it.
          server.config.logger.error(error instanceof Error ? error.message : String(error))
        }
        for (const environment of Object.values(server.environments)) {
          const module = environment.moduleGraph.getModuleById(`${RESOLVED}${changed[0]}`)
          if (module !== undefined) environment.moduleGraph.invalidateModule(module)
        }
        server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

export { images, type ImagesOptions } from './images.js'
