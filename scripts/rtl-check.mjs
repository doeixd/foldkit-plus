/**
 * Physical directions in styles, in every package's and example's `src`:
 * `marginLeft`/`paddingRight`/`borderLeft*`/`border*Left|RightRadius`, a
 * `left`/`right` offset, `textAlign: 'left'|'right'`, `float: 'left'|'right'`,
 * their kebab-case spellings in CSS text, and `translateX(`. Under
 * `dir="rtl"` each stays on its screen side, so a layout written with one
 * is mirrored wrong. Write the logical property (`marginInlineStart`,
 * `insetInlineEnd`, `textAlign: 'start'`), or, where the side really is the
 * screen's (a pointer coordinate, a measured pixel offset, a placement an
 * application names, a drawing that does not flip), keep it and say why in a
 * comment `// physical: <why>`.
 *
 * A marker covers the declarations after it in the same object: it is read
 * upward from a finding, through the lines that are neither blank nor open or
 * close a block, to the first comment, which must read `physical`. A marker
 * at the end of the line covers that line.
 *
 * Blind spots, kept simple on purpose:
 * - only files that mention `Style.`, `h.Style`, `Declarations` or `StyleValue`
 *   are read, so a style object in a file with none of them is missed;
 * - a name assembled at run time (`border${side}Width`) or read from a
 *   variable is not seen, nor is a `left` of an unquoted CSS string in a
 *   template that spans lines;
 * - a four-value `borderRadius` (`'8px 0 0 8px'`) names physical corners and is
 *   not read;
 * - `translateX` is flagged wherever it is written, direction or not;
 * - a `left`/`right` key is told from a data field (a Side table, a Slot's
 *   name) only by its value: a CSS length or a token read counts, a bare
 *   word does not, so an offset written as a word (`'inherit'`) is missed.
 *
 *   node scripts/rtl-check.mjs   list findings; exit 1 if there are any
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const styleFile = /\bStyle\.|\bh\.Style\b|\bDeclarations\b|\bStyleValue\b/

const physical = [
  {
    what: 'physical margin, padding or border side',
    pattern:
      /\b(?:margin|padding|scrollMargin|scrollPadding|border)(?:Left|Right)\w*\b|\bborder(?:Top|Bottom)(?:Left|Right)Radius\b|\b(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right)\b|\bborder-(?:top|bottom)-(?:left|right)-radius\b/,
  },
  {
    what: 'physical text-align or float',
    pattern:
      /\b(?:textAlign|float)\b['"]?\s*:\s*['"](?:left|right)['"]|\b(?:text-align|float)\s*:\s*(?:left|right)\b/,
  },
  {
    what: 'left/right offset',
    // A CSS length or a token read, not a quoted word or a slot's Style.
    pattern:
      /(?<![\w.'"`$-])(?:left|right)\s*:\s*(?:['"`](?:-?[\d.]|calc|var\(|env\(|auto|\$\{)|(?:ref|t|d|v|at)\b[.(])/,
  },
  { what: 'translateX', pattern: /\btranslateX\(/ },
]

const stripped = line => line.replace(/^\s*(?:\/\/|\*|\/\*\*?).*$/, '')

const marked = (lines, index) => {
  if (/\/\/\s*physical\b/i.test(lines[index])) return true
  for (let up = index - 1; up >= 0 && index - up <= 12; up--) {
    const line = lines[up]
    const trimmed = line.trim()
    if (trimmed === '') return false
    if (trimmed.startsWith('//')) return /^\/\/\s*physical\b/i.test(trimmed)
    // A multi-line comment's lines are the same comment.
    if (trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
    if (/^[}\])]/.test(trimmed) || /[{[(]$/.test(trimmed)) return false
  }
  return false
}

/** The 1-based lines of `text` with a physical direction and no marker, with what they are. */
export const physicalFindings = text => {
  if (!styleFile.test(text)) return []
  const lines = text.split(/\r?\n/)
  const found = []
  lines.forEach((line, index) => {
    const code = stripped(line).replace(/\/\/.*$/, '')
    const hit = physical.find(({ pattern }) => pattern.test(code))
    if (hit !== undefined && !marked(lines, index)) found.push({ line: index + 1, what: hit.what })
  })
  return found
}

const walk = path =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap(entry => walk(join(path, entry)))
    : [path]

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const sources = ['packages', 'examples', 'examples/foldkit']
    .flatMap(parent =>
      readdirSync(join(root, parent), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => join(root, parent, entry.name, 'src')),
    )
    .filter(existsSync)
  const findings = []
  for (const file of sources.flatMap(walk)) {
    if (!/\.(?:ts|tsx)$/.test(file) || file.endsWith('.d.ts')) continue
    for (const { line, what } of physicalFindings(readFileSync(file, 'utf8')))
      findings.push(`${relative(root, file)}:${line}  ${what}`)
  }
  for (const finding of findings) console.log(finding)
  if (findings.length > 0) {
    console.error(
      `\n${findings.length} physical directions. Use the logical property, or mark the line above with "// physical: <why>" (see scripts/rtl-check.mjs).`,
    )
    process.exit(1)
  }
}
