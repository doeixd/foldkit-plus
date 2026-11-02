/**
 * Fails on a declaration a package publishes as plain `any`: `declare const
 * Query: any`, `type X = any`, a function returning `any`. The emitter writes
 * that where a referenced package's declarations were missing (#340), and it
 * compiles, so a consumer reads `any` far from the cause. Run by every
 * package's `build` after tsdown. A deliberate `any` inside a type (a
 * parameter, `EntityBinding<any>`) is not such a declaration.
 *
 *   node scripts/declared-any.mjs [package-dir ...]   default: every package
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const name = String.raw`[\w$]+`
const declaration = new RegExp(
  [
    String.raw`^[ \t]*(?:export\s+)?(?:declare\s+)?(?:const|let|var)\s+${name}\s*:\s*any\s*;`,
    String.raw`^[ \t]*(?:export\s+)?(?:declare\s+)?type\s+${name}(?:<[^=]*>)?\s*=\s*any\s*;`,
    String.raw`^[ \t]*(?:export\s+)?(?:declare\s+)?function\s+${name}\s*(?:<[^;]*?>)?\s*\([^;]*?\)\s*:\s*any\s*;`,
  ].join('|'),
  'gm',
)

/** The 1-based lines of `text` that declare a name as `any`. */
export const anyDeclarations = text =>
  [...text.matchAll(declaration)].map(match => text.slice(0, match.index).split(/\r?\n/).length)

const walk = path =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap(entry => walk(join(path, entry)))
    : [path]

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const asked = process.argv.slice(2)
  const dirs =
    asked.length === 0
      ? readdirSync(join(root, 'packages')).map(dir => join(root, 'packages', dir))
      : asked.map(dir => resolve(dir))
  const found = dirs
    .map(dir => join(dir, 'dist'))
    .filter(existsSync)
    .flatMap(walk)
    .filter(file => /\.d\.[mc]?ts$/.test(file))
    .flatMap(file => {
      const text = readFileSync(file, 'utf8')
      const lines = text.split(/\r?\n/)
      return anyDeclarations(text).map(
        line => `${relative(root, file)}:${line}: ${lines[line - 1].trim()}`,
      )
    })
  if (found.length > 0) {
    console.error(
      `declared-any: ${found.length} published declaration(s) are \`any\`. Usually a ` +
        `referenced package's .tsbuild declarations were missing when tsdown ran: run ` +
        `\`node scripts/declarations.mjs\` and build again. A source that declares ` +
        `\`any\` itself should name a type.\n` +
        found.join('\n'),
    )
    process.exit(1)
  }
}
