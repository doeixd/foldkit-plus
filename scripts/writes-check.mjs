/**
 * Writes to the Model that go around a Message, in every package's and example's
 * `src`: a use of `Focus.set`/`Focus.modify` (what `ModelRef.focus(ref)` hands
 * back) or of `WritableProjection.set`. Ordinary application state changes in
 * `update`, normally through `modifyFields`; these two are structural seams for
 * installing a value something else already derived (a checkpoint, a restored
 * URL or key-value entry, a reconciliation), never a shortcut around a Message.
 * See docs/state-model.md.
 *
 * A member is told from an unrelated `set` (a `Map`'s) by what the checker says
 * it is: the declaration must sit in an interface named `Focus` or
 * `WritableProjection` in `packages/surface/src/index.ts`. Reads (`get`, `read`)
 * are not writes and are never reported, and neither is a write method that
 * only forwards its own `set` (`modify` inside the surface).
 *
 * Allowed:
 * - a file in `infrastructure`: the modules that own these seams, or write the
 *   slice of the Model their own package owns, from one of its own Messages;
 * - a use marked on its line, or on the line above the statement holding it,
 *   with `// write: infrastructure — <why>`. The reason is required: a bare
 *   marker is itself reported.
 *
 * Blind spots, kept simple on purpose: a write reached through a value typed
 * `any`, a wider structural type (`{ set: … }`) or a re-declared interface is
 * not seen, and nor is a write made by `optic.replace` directly.
 *
 *   node scripts/writes-check.mjs [dir…]   list findings (in the projects named, if any); exit 1 if there are any
 */
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { programsFor, projectsIn } from './programs.mjs'
// The compiler API, which TypeScript 7 no longer ships: 6 is installed beside it.
import ts from 'typescript-6'

const root = fileURLToPath(new URL('..', import.meta.url))
export const findings = []

/** The interfaces whose `set`/`modify` write the Model, by the file that declares them. */
const seamFile = 'packages/surface/src/index.ts'
const seamProject = 'packages/surface'
const seams = new Map([
  ['Focus', new Set(['set', 'modify'])],
  ['WritableProjection', new Set(['set'])],
])

/**
 * The modules that own a seam or write the slice of the Model their own package
 * owns, each with why. A write anywhere else carries a marker.
 */
export const infrastructure = {
  'packages/surface/src/index.ts': 'defines the seams',
  'packages/bundle-surface/src/index.ts': "hands a ref's `set` to Link as its write",
  'packages/mirror/src/index.ts': 'restores URL and key-value text into the mirrored fields',
  'packages/sync/src/make.ts': 'replays durable Messages over the shared slice',
  'packages/sync/src/mount.ts': "installs a replica's committed checkpoint",
  'packages/ssr/src/shared.ts': 'installs the served state and the restored paths',
  'packages/remote/src/domain.ts': 'Remote owns its store slice',
  'packages/remote/src/remote.ts': 'Remote owns its store slice',
  'packages/remote/src/reporting.ts': 'Remote owns its store slice',
  'packages/remote/src/resume.ts': "restores Remote's own captured state",
  'packages/remote/src/writes.ts': 'Remote owns its store slice',
  'packages/crud/src/index.ts': 'a Step writes the editor slice crud owns, from its own Message',
  'packages/cms/src/editor.ts': 'a Step writes the editor slice cms owns, from its own Message',
}

const marker = /\/\/\s*write:\s*infrastructure\b/
const reason = /\/\/\s*write:\s*infrastructure\s*[—-]\s*\S/

const memberNames = new Set([...seams.values()].flatMap(names => [...names]))

// Only a seam member's name is looked up (a `get` is a read), and only those: asking
// the checker about every property access is most of this check's time.
const seamOf = (checker, node, symbol) => {
  if (!memberNames.has(node.text)) return undefined
  symbol ??= checker.getSymbolAtLocation(node)
  for (const declaration of symbol?.declarations ?? []) {
    const owner = declaration.parent
    if (!ts.isInterfaceDeclaration(owner)) continue
    if (!owner.getSourceFile().fileName.endsWith(seamFile)) continue
    if (seams.has(owner.name.text)) return owner.name.text
  }
  return undefined
}

/**
 * The directories a project's tsconfigs reference, directly. Both configs are
 * read because the program is built from `tsconfig.json` while `paths:check`
 * derives its `paths` from the references of either.
 */
const referencesOf = dir => {
  const out = new Set()
  for (const name of ['tsconfig.json', 'tsconfig.build.json']) {
    const config = join(dir, name)
    if (!existsSync(config)) continue
    const { config: json } = ts.readConfigFile(config, ts.sys.readFile)
    for (const reference of json?.references ?? []) {
      const target = resolve(dir, reference.path)
      out.add(target.endsWith('.json') ? dirname(target) : target)
    }
  }
  return out
}

/**
 * Whether a project can hold a use of a seam: its program must contain the file
 * that declares them, and a program holds a workspace package's source only by a
 * `paths` entry, which exists only for a referenced project (`pnpm paths:check`).
 * So it is the project itself or one reaching `packages/surface` through references.
 */
export const reachesSeams = (dir, references = referencesOf) => {
  const target = resolve(root, seamProject)
  const seen = new Set()
  const walk = from => {
    if (from === target) return true
    if (seen.has(from)) return false
    seen.add(from)
    return [...references(from)].some(walk)
  }
  return walk(resolve(dir))
}

export const check = (program, files, found = findings, allowed = Object.keys(infrastructure)) => {
  const checker = program.getTypeChecker()
  for (const file of files) {
    const relativeFile = relative(root, file).replaceAll('\\', '/')
    if (allowed.includes(relativeFile)) continue
    const source = program.getSourceFile(file)
    const lines = source.getFullText().split('\n')
    const lineOf = node => source.getLineAndCharacterOfPosition(node.getStart()).line
    // A marker covers the statement under it, so one stands over a call that spans lines.
    const markerFor = node => {
      let statement = node
      while (
        statement.parent !== undefined &&
        !ts.isBlock(statement.parent) &&
        !ts.isSourceFile(statement.parent) &&
        !ts.isCaseClause(statement.parent) &&
        !ts.isDefaultClause(statement.parent)
      )
        statement = statement.parent
      const near = at =>
        [lines[at], lines[at - 1]].find(line => line !== undefined && marker.test(line))
      return near(lineOf(node)) ?? near(lineOf(statement))
    }
    const report = (node, what) => {
      const line = markerFor(node)
      if (line !== undefined && reason.test(line)) return
      found.push(
        `${relativeFile}:${lineOf(node) + 1}  ${what}${line === undefined ? '' : ' (a marker needs a reason after the dash)'}`,
      )
    }
    const visit = node => {
      if (ts.isPropertyAccessExpression(node)) {
        const seam = seamOf(checker, node.name)
        if (seam !== undefined)
          report(node, `${seam}.${node.name.text} writes the Model outside a Message`)
      } else if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression)
      ) {
        const seam = seamOf(checker, node.argumentExpression)
        if (seam !== undefined)
          report(node, `${seam}.${node.argumentExpression.text} writes the Model outside a Message`)
      } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
        const key = node.propertyName ?? node.name
        // A shorthand `{ set }` names a local; the member is read off the destructured type.
        const seam =
          ts.isIdentifier(key) && memberNames.has(key.text)
            ? seamOf(checker, key, checker.getTypeAtLocation(node.parent).getProperty(key.text))
            : undefined
        if (seam !== undefined)
          report(node, `${seam}.${key.text} writes the Model outside a Message`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
}

const main = () => {
  // `node scripts/writes-check.mjs packages/remote` reads only the projects named.
  const projects = projectsIn(root, process.argv.slice(2), reachesSeams)
  for (const { options, files } of programsFor(projects)) {
    const program = ts.createProgram({ rootNames: files, options })
    check(program, files)
  }

  for (const finding of findings) console.log(finding)
  if (findings.length > 0) {
    console.error(
      `\n${findings.length} Model writes outside a Message. Send a Message through update, or mark an infrastructure seam with "// write: infrastructure — <why>"; see docs/state-model.md.`,
    )
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
