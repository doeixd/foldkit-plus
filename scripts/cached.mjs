/**
 * `node scripts/cached.mjs <name> --inputs <pathspec...> -- <command...>`: runs
 * the command unless it already passed on exactly these inputs, then prints
 * `skipped: <name> unchanged since <time> (<key>)` and exits 0.
 *
 * The key hashes the command line, the Node major, the lockfile and every
 * input file as it is in the working tree. A tracked file counts by its blob
 * id (`git ls-files -s`), so a commit of unchanged content keeps the key; a
 * file `git status` reports modified, added or untracked is hashed from disk
 * the same way (`git hash-object`); a deleted one leaves the key. Inputs are
 * git pathspecs (`packages`, `scripts/tags-check.mjs`, `*.md`; `*` crosses
 * folders), so ignored files are never inputs. Name every input a command
 * reads: one it reads and the key omits is a stale skip. `.` is the whole
 * repository, which is the honest answer for a command that reads all of it.
 *
 * Only a pass is stored (`.cache/checks/<name>.json`, or
 * `$FOLDKIT_CACHE_DIR`); a failure always runs again and drops a pass stored
 * for its key. `--no-cache` and `FOLDKIT_NO_CACHE=1` run regardless (the pass
 * is still stored). Exit status is the command's, or 2 for a bad call.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
// Bump when the key's recipe changes, so no old pass is read as a new one.
const RECIPE = 1

const git = (args, input) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', input, maxBuffer: 256 * 2 ** 20 })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`)
  return result.stdout
}

/** Path -> blob id of every input file, as the working tree holds it. */
export const inputBlobs = pathspecs => {
  const blobs = new Map()
  for (const entry of git(['ls-files', '-s', '-z', '--', ...pathspecs]).split('\0')) {
    if (entry === '') continue
    const tab = entry.indexOf('\t')
    blobs.set(entry.slice(tab + 1), entry.slice(0, tab).split(' ')[1])
  }
  const dirty = []
  const fields = git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...pathspecs]).split('\0')
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (field === '') continue
    dirty.push(field.slice(3))
    // A rename lists its origin next; the origin is gone.
    if (field[0] === 'R' || field[0] === 'C') blobs.delete(fields[++i])
  }
  const present = dirty.filter(path => existsSync(join(root, path)))
  for (const path of dirty) if (!present.includes(path)) blobs.delete(path)
  if (present.length > 0) {
    const ids = git(['hash-object', '--stdin-paths'], `${present.join('\n')}\n`).split('\n')
    present.forEach((path, i) => blobs.set(path, ids[i]))
  }
  return blobs
}

const sha = text => createHash('sha256').update(text).digest('hex')

/** The key of a run: what must be equal for an earlier pass to stand. */
export const keyOf = ({ command, blobs }) => {
  const lock = existsSync(join(root, 'pnpm-lock.yaml')) ? git(['hash-object', 'pnpm-lock.yaml']).trim() : 'none'
  const files = [...blobs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return sha(
    JSON.stringify({ RECIPE, command, node: process.versions.node.split('.')[0], lock, files }),
  ).slice(0, 16)
}

const storeFor = name => join(process.env['FOLDKIT_CACHE_DIR'] ?? join(root, '.cache', 'checks'), `${name}.json`)

const read = path => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

const usage = 'usage: node scripts/cached.mjs <name> [--no-cache] --inputs <pathspec...> -- <command...>'

const main = () => {
  const args = process.argv.slice(2)
  const split = args.indexOf('--')
  const head = split === -1 ? args : args.slice(0, split)
  const command = split === -1 ? [] : args.slice(split + 1)
  const inputsAt = head.indexOf('--inputs')
  const name = head[0]
  if (name === undefined || name.startsWith('--') || !/^[\w.:-]+$/.test(name) || inputsAt === -1 || command.length === 0) {
    console.error(usage)
    return 2
  }
  const pathspecs = head.slice(inputsAt + 1).filter(arg => !arg.startsWith('--'))
  if (pathspecs.length === 0) {
    console.error(`cached: ${name} names no inputs; ${usage}`)
    return 2
  }
  const blobs = inputBlobs(pathspecs)
  if (blobs.size === 0) {
    console.error(`cached: ${name}: no file matches ${pathspecs.join(' ')}; a check whose inputs are not named is not cached`)
    return 2
  }
  const key = keyOf({ command, blobs })
  const store = storeFor(name)
  const bypass = head.includes('--no-cache') || process.env['FOLDKIT_NO_CACHE'] === '1'
  const earlier = read(store)
  if (!bypass && earlier?.key === key) {
    console.log(`skipped: ${name} unchanged since ${earlier.at} (${key})`)
    return 0
  }

  const windows = process.platform === 'win32'
  const quoted = windows ? command.map(arg => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)) : command
  const result = spawnSync(quoted[0], quoted.slice(1), { cwd: root, stdio: 'inherit', shell: windows })
  const status = result.status ?? 1
  if (status === 0) {
    mkdirSync(join(store, '..'), { recursive: true })
    writeFileSync(store, `${JSON.stringify({ key, at: new Date().toISOString(), command }, null, 2)}\n`)
    console.log(`ran: ${name} passed (${key})`)
  } else {
    if (earlier?.key === key) rmSync(store, { force: true })
    console.log(`ran: ${name} FAILED, exit ${status} (${key})`)
  }
  return status
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
