/**
 * What the working tree changed, and which TypeScript projects hold it: the
 * shared half of `typecheck:fast` and `check:changed`.
 *
 * A project is a folder with a `tsconfig.json` below the root (the root's
 * lists references and no files). A file belongs to the nearest one above it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

export const root = resolve(import.meta.dirname, '..')
const posix = path => path.split(sep).join('/')

const git = args => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`)
  return result.stdout
}

/**
 * Repo-relative paths changed in the working tree (modified, added, renamed,
 * deleted, untracked), and with `since` every path that differs from that ref
 * through to HEAD as well. Sorted; `exists` says whether the file is still there.
 */
export const changedFiles = ({ since } = {}) => {
  const paths = new Set()
  // -z: no quoting of odd names; a rename lists its origin as a second field.
  const fields = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0')
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (field === '') continue
    paths.add(field.slice(3))
    if (field[0] === 'R' || field[0] === 'C') paths.add(fields[++i])
  }
  if (since !== undefined) {
    for (const path of git(['diff', '--name-only', '-z', `${since}...`]).split('\0')) {
      if (path !== '') paths.add(path)
    }
  }
  return [...paths].sort().map(path => ({ path, exists: existsSync(join(root, path)) }))
}

/** The nearest project folder above `path` (repo-relative, posix), if any. */
export const projectOf = path => {
  let dir = dirname(path)
  while (dir !== '.' && dir !== '/') {
    if (existsSync(join(root, dir, 'tsconfig.json'))) return posix(dir)
    dir = dirname(dir)
  }
  return undefined
}

/** `tsconfig.json` allows comments and trailing commas; none here uses them in a string. */
const readConfig = path => {
  const text = readFileSync(path, 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(text)
}

/** Project folder -> the project folders it references. */
export const referenceGraph = () => {
  const graph = new Map()
  const all = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', '*tsconfig.json'])
    .split('\n')
    .filter(path => path.endsWith('/tsconfig.json') && existsSync(join(root, path)))
  for (const config of all) {
    const dir = dirname(config)
    const references = (readConfig(join(root, config)).references ?? []).map(reference => {
      const target = resolve(root, dir, reference.path)
      // A reference names a folder or a config file in one.
      return posix(relative(root, target.endsWith('.json') ? dirname(target) : target))
    })
    graph.set(posix(dir), references)
  }
  return graph
}

/** `projects` and every project that references one of them, however far. */
export const withDependents = (projects, graph = referenceGraph()) => {
  const found = new Set(projects)
  for (let grew = true; grew; ) {
    grew = false
    for (const [project, references] of graph) {
      if (!found.has(project) && references.some(reference => found.has(reference))) {
        found.add(project)
        grew = true
      }
    }
  }
  return [...found].sort()
}

/** The projects holding the changed files, `--dependents` widening them. */
export const changedProjects = ({ since, dependents = false } = {}) => {
  const files = changedFiles({ since })
  const direct = [...new Set(files.flatMap(({ path }) => projectOf(path) ?? []))].sort()
  return { files, projects: dependents ? withDependents(direct) : direct }
}
