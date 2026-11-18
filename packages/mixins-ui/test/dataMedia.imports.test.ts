// @vitest-environment node
/**
 * What a page drawing a data or media widget must not load unless it passes
 * the feature: each module below imports the other widget or the Behavior for
 * a type at most, which the compiler erases. The feature is a file of its own
 * that does import it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

// These read the source from disk, so `pnpm mutate` cannot reach them; each was
// broken by hand (a type import made a value import) and the test went red.
const imports = (file: string): ReadonlyArray<{ readonly type: boolean; readonly from: string }> =>
  Array.from(
    readFileSync(resolve(import.meta.dirname, file), 'utf8').matchAll(
      /^(import|export)(\s+type)?\s[^;]*?from\s+'([^']+)'/gm,
    ),
    match => ({ type: match[2] !== undefined, from: match[3] ?? '' }),
  )

const values = (file: string, pattern: RegExp) =>
  imports(file).filter(entry => !entry.type && pattern.test(entry.from))

test('a Table page loads neither Checkbox nor the pointer highlight', () => {
  expect(
    values('../src/table.ts', /(^|\/)checkbox(\.js)?$|@foldkit\/ui|foldkit-primitives/),
  ).toEqual([])
})

test('the table features are the modules that load them', () => {
  expect(imports('../src/table/checkboxes.ts')).toContainEqual({
    type: false,
    from: '../checkbox.js',
  })
  expect(imports('../src/table/fluid.ts')).toContainEqual({
    type: false,
    from: 'foldkit-primitives/dom',
  })
})

test('an ImageCropper page loads no Slider unless it passes the zoom control', () => {
  expect(values('../src/imageCropper.ts', /(^|\/)slider(\.js)?$/)).toEqual([])
  expect(imports('../src/imageCropper/zoomSlider.ts')).toContainEqual({
    type: false,
    from: '../slider.js',
  })
})

test('a Chart page loads the kinds it passes and no other', () => {
  const kinds = /(^|\/)(bars|line|area|donut)(\.js)?$/
  for (const file of ['bars', 'line', 'area', 'donut', 'cartesian', 'paths', 'kind']) {
    expect(values(`../src/chart/${file}.ts`, kinds)).toEqual([])
  }
  const chart = readFileSync(resolve(import.meta.dirname, '../src/chart.ts'), 'utf8')
  expect(chart).not.toMatch(/^import\s(?!type\s)[^']*'\.\/chart\/(bars|line|area|donut)\.js'/m)
})
