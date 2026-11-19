// @vitest-environment node
/**
 * A page that draws a widget without its behaviour values (`fluid`,
 * `overlayBars`, `readingKeys`) ships none of the primitive each runs: the
 * value lives in a file of its own, so a page that never reads it drops the
 * primitive. Built as this package publishes it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build as buildPage } from 'vite'
import { afterAll, expect, test } from 'vitest'
import { builtUiEntry } from './builtPackage.js'

const packageDir = resolve(import.meta.dirname, '..')
mkdirSync(join(packageDir, '.tsbuild'), { recursive: true })
const out = mkdtempSync(join(packageDir, '.tsbuild', 'behaviour-values-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

const keptBy = async (name: string, source: string): Promise<ReadonlyArray<string>> => {
  const ui = await builtUiEntry()
  const entry = join(out, `${name}.ts`)
  writeFileSync(entry, source)
  const result = await buildPage({
    configFile: false,
    logLevel: 'silent',
    root: out,
    resolve: { alias: { ui }, conditions: ['foldkit-plus:source'] },
    build: { write: false, minify: false, lib: { entry, formats: ['es'], fileName: name } },
  })
  return [result]
    .flat()
    .flatMap(built => ('output' in built ? built.output : []))
    .flatMap(chunk =>
      chunk.type === 'chunk'
        ? Object.entries(chunk.modules)
            .filter(([, module]) => module.renderedLength > 0)
            .map(([id]) => id.replaceAll(String.fromCharCode(92), '/'))
        : [],
    )
}

/** Each row: the widget's namespace, a value of it, and the primitive's file that value alone runs. */
const values = [
  ['Menu', 'fluid', /fluid-hover/],
  ['Menu', 'overlayBars', /scroll-bars/],
  ['Tabs', 'fluid', /fluid-hover/],
  ['Tabs', 'readingKeys', /direction/],
  ['Command', 'overlayBars', /scroll-bars/],
] as const

test('a page that never reads a behaviour value keeps no primitive it runs', async () => {
  for (const [widget, value, primitive] of values) {
    const [without, withValue] = await Promise.all([
      keptBy(
        `${widget}-${value}-without`,
        `import { ${widget} } from 'ui'\nexport const page = ${widget}.view`,
      ),
      keptBy(
        `${widget}-${value}-with`,
        `import { ${widget} } from 'ui'\nexport const page = [${widget}.view, ${widget}.${value}]`,
      ),
    ])
    expect(
      without.filter(id => primitive.test(id)),
      `${widget} without ${value}`,
    ).toEqual([])
    expect(
      withValue.some(id => primitive.test(id)),
      `${widget} with ${value}`,
    ).toBe(true)
  }
}, 180_000)
