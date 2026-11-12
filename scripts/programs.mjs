/**
 * Compiling every project's `src` for a check that reads types: one program per
 * set of identical compiler options rather than one per project, since binding
 * the dependency closure (Effect's declarations most of it) is the cost of a
 * program.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// The compiler API, which TypeScript 7 no longer ships: 6 is installed beside it.
import ts from 'typescript-6'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * Every project's options and its own `src` files: the directories of `packages`,
 * `examples` and `examples/foldkit` (those named, if any) that hold a tsconfig
 * and pass `wanted`.
 */
export const projectsIn = (base, named = [], wanted = () => true) => {
  const only = named.map(arg => resolve(base, arg))
  const projects = []
  const dirs = ['packages', 'examples', 'examples/foldkit']
    .flatMap(parent =>
      readdirSync(join(base, parent), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => join(base, parent, entry.name)),
    )
    .filter(dir => only.length === 0 || only.includes(dir))
    .sort()
  for (const dir of dirs) {
    const config = join(dir, 'tsconfig.json')
    if (!existsSync(config) || !wanted(dir)) continue
    const parsed = ts.getParsedCommandLineOfConfigFile(
      config,
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
    )
    // TypeScript lists files with `/`; `join` writes `\` on Windows, where a
    // raw comparison matched nothing and the check passed having read no file.
    const sources = join(dir, 'src')
    const files = parsed?.fileNames.filter(file => resolve(file).startsWith(sources)) ?? []
    if (files.length > 0) projects.push({ options: parsed.options, files })
  }
  return projects
}

/**
 * One program for every project compiled with the same options: binding the
 * dependency closure (Effect's declarations most of it) is the cost of a
 * program, so sharing it is what makes a whole-tree run take a minute, not
 * a quarter of an hour. Their `paths` are merged; where two projects map one
 * name to different files they cannot share, and stand apart.
 */
export const programsFor = projects => {
  const groups = new Map()
  for (const { options, files } of projects) {
    const { paths, pathsBasePath, rootDir, outDir, configFilePath, tsBuildInfoFile, ...rest } =
      options
    const absolute = Object.entries(paths ?? {}).map(([name, targets]) => [
      name,
      targets.map(target => resolve(pathsBasePath ?? root, target)),
    ])
    const key = JSON.stringify(rest)
    const candidates = groups.get(key) ?? []
    const group = candidates.find(candidate =>
      absolute.every(
        ([name, targets]) =>
          !candidate.paths.has(name) || candidate.paths.get(name).join() === targets.join(),
      ),
    )
    if (group === undefined) {
      candidates.push({ rest, paths: new Map(absolute), files: new Set(files) })
      groups.set(key, candidates)
    } else {
      for (const [name, targets] of absolute) group.paths.set(name, targets)
      for (const file of files) group.files.add(file)
    }
  }
  return [...groups.values()].flat().map(({ rest, paths, files }) => ({
    options: {
      ...rest,
      noEmit: true,
      pathsBasePath: root,
      paths: Object.fromEntries(paths),
    },
    files: [...files],
  }))
}
