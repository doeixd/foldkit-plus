/**
 * `foldkit-plus laws <module>[#export]`: loads a module of the project and
 * prints `Laws.show` of the report it holds. It reads `tsx` and
 * `foldkit-entity` from the project, never its own copies: a report is the
 * project's data, and Effect values from a second copy of a library do not
 * compare with the first's.
 */
import { Option } from 'effect'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { installedFrom } from './project.js'

/** What a command prints, and whether it failed. */
export interface Printed {
  readonly text: string
  readonly isError: boolean
}

interface EntityLaws {
  readonly check: (options: { readonly writes: unknown }) => unknown
  readonly show: (report: unknown) => string
}

type Load = (specifier: string) => Promise<unknown>

interface Scoped {
  readonly load: Load
  readonly close: () => Promise<void>
}

const failed = (text: string): Printed => ({ text: `${text}\n`, isError: true })

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const isReport = (value: unknown) =>
  isRecord(value) &&
  ['pairs', 'arrows', 'states', 'findings'].every(key => Array.isArray(value[key]))

const isWrites = (value: unknown): value is { readonly writes: unknown } =>
  isRecord(value) && Array.isArray(value['writes'])

const isEntityLaws = (value: unknown): value is EntityLaws =>
  isRecord(value) && typeof value['check'] === 'function' && typeof value['show'] === 'function'

const describeValue = (value: unknown): string => {
  if (!isRecord(value)) return typeof value
  if (Array.isArray(value)) return 'an array'
  const keys = Object.keys(value)
  return keys.length === 0 ? 'an empty object' : `an object with the keys ${keys.join(', ')}`
}

/** The file a package's export `subpath` names for Node's `import`, read from its manifest: `node`, then `import`, then `default`, as Node picks. */
export const entryOf = (dir: string, subpath: string): Option.Option<string> => {
  const exported = (
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      exports?: Readonly<Record<string, unknown>>
    }
  ).exports?.[subpath]
  const target = (value: unknown): Option.Option<string> => {
    if (typeof value === 'string') return Option.some(value)
    if (!isRecord(value)) return Option.none()
    return [value['node'], value['import'], value['default']].reduce<Option.Option<string>>(
      (found, condition) => Option.orElse(found, () => target(condition)),
      Option.none(),
    )
  }
  return Option.map(target(exported), file => join(dir, file))
}

const nearestTsconfig = (from: string): Option.Option<string> => {
  for (let at = from; ; at = dirname(at)) {
    const candidate = join(at, 'tsconfig.json')
    if (existsSync(candidate)) return Option.some(candidate)
    if (dirname(at) === at) return Option.none()
  }
}

/**
 * Loads through the project's `tsx`, which reads its tsconfig `paths` and `.js`
 * specifiers for `.ts` files. One namespace for the module and `foldkit-entity`
 * keeps them one copy of the library, so `Laws.check` meets the entries the
 * module built; two `tsImport` calls would each load their own.
 */
const throughTsx = async (api: string, file: string): Promise<Scoped> => {
  const { register } = (await import(/* @vite-ignore */ pathToFileURL(api).href)) as {
    register: (options: { namespace: string; tsconfig?: string }) => {
      readonly import: (specifier: string, parent: string) => Promise<unknown>
      readonly unregister: () => Promise<void>
    }
  }
  const tsconfig = nearestTsconfig(dirname(file))
  const scope = register(
    Option.isSome(tsconfig)
      ? { namespace: 'foldkit-plus-laws', tsconfig: tsconfig.value }
      : { namespace: 'foldkit-plus-laws' },
  )
  const parent = pathToFileURL(file).href
  return {
    load: specifier => scope.import(specifier, parent),
    close: scope.unregister,
  }
}

/** What to say when the project's tsx is too old to have the API this command loads through. */
export const tsxWithoutApi = (dir: string): string => {
  const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    version?: string
  }
  return `The tsx installed at ${dir} (${version ?? 'unknown version'}) has no esm/api export, which this command loads the module through. Upgrade tsx to a 4.x release that has it (foldkit-plus is tested with ^4.23.15).`
}

/** Node's own TypeScript support: the module by its URL, `foldkit-entity` from the nearest `node_modules`. */
const throughNode =
  (file: string): Load =>
  async specifier => {
    if (specifier !== 'foldkit-entity') return import(/* @vite-ignore */ specifier)
    const dir = installedFrom(dirname(file), specifier)
    if (Option.isNone(dir)) throw new Error('foldkit-entity is not installed above the module')
    const entry = entryOf(dir.value, '.')
    if (Option.isNone(entry))
      throw new Error("foldkit-entity's manifest names no entry for `import`")
    return import(/* @vite-ignore */ pathToFileURL(entry.value).href)
  }

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

const printed = async (
  file: string,
  exportName: string,
  load: Load,
  throughTsx: boolean,
): Promise<Printed> => {
  let loaded: unknown
  try {
    loaded = await load(pathToFileURL(file).href)
  } catch (error) {
    return failed(
      throughTsx
        ? `Could not load ${file}: ${messageOf(error)}`
        : `Could not load ${file} with Node's own TypeScript support: ${messageOf(error)}\nInstall tsx in the project (it reads tsconfig paths and \`.js\` import specifiers for \`.ts\` files, which Node does not): npm install --save-dev tsx`,
    )
  }
  if (!isRecord(loaded)) return failed(`${file} loaded as ${describeValue(loaded)}, not a module.`)

  const named = exportName === 'default' ? 'default export' : `export ${exportName}`
  if (!Object.hasOwn(loaded, exportName))
    return failed(
      `${file} has no ${named}. It exports: ${Object.keys(loaded).join(', ') || 'nothing'}.`,
    )
  const value = loaded[exportName]
  if (!isReport(value) && !isWrites(value))
    return failed(
      `The ${named} of ${file} is ${describeValue(value)}: expected a LawReport (Laws.check's result) or { writes }.`,
    )

  let laws: unknown
  try {
    const entity = await load('foldkit-entity')
    laws = isRecord(entity) ? entity['Laws'] : undefined
  } catch (error) {
    return failed(`Could not load foldkit-entity from the project: ${messageOf(error)}`)
  }
  if (!isEntityLaws(laws))
    return failed("The project's foldkit-entity exports no Laws.check and Laws.show.")
  try {
    return { text: `${laws.show(isWrites(value) ? laws.check(value) : value)}\n`, isError: false }
  } catch (error) {
    return failed(`Laws could not report on the ${named} of ${file}: ${messageOf(error)}`)
  }
}

/**
 * Prints the report `spec` (`path` or `path#export`, resolved from `cwd`)
 * holds, or the `{ writes }` that `Laws.check` takes. Findings are the report's
 * content, not a failure; only a module that cannot be loaded, or an export that
 * is neither shape, fails.
 */
export const lawsReport = async (spec: string, cwd: string): Promise<Printed> => {
  const hash = spec.lastIndexOf('#')
  const exportName = hash === -1 ? 'default' : spec.slice(hash + 1)
  const file = resolve(cwd, hash === -1 ? spec : spec.slice(0, hash))
  if (!existsSync(file)) return failed(`No such file: ${file}`)

  const tsx = installedFrom(dirname(file), 'tsx')
  const api = Option.flatMap(tsx, dir => entryOf(dir, './esm/api'))
  if (Option.isSome(tsx) && Option.isNone(api)) return failed(tsxWithoutApi(tsx.value))
  const scoped = Option.isSome(api) ? Option.some(await throughTsx(api.value, file)) : Option.none()
  try {
    return await printed(
      file,
      exportName,
      Option.match(scoped, { onNone: () => throughNode(file), onSome: ({ load }) => load }),
      Option.isSome(scoped),
    )
  } finally {
    if (Option.isSome(scoped)) await scoped.value.close()
  }
}
