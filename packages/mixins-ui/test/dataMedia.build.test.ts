// @vitest-environment node
/**
 * The data and media widgets built as this package publishes them: a Table
 * page without `Table.fluid` or `Table.checkboxes` keeps neither the pointer
 * highlight nor a Checkbox, and an ImageCropper page without its zoom control
 * keeps no Slider. `dataMedia.imports.test.ts` reads the imports; this reads
 * what a page actually holds, transitive imports included.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build as buildPage } from 'vite'
import { afterAll, expect, test } from 'vitest'
import { builtUiEntry } from './builtPackage.js'

const packageDir = resolve(import.meta.dirname, '..')
mkdirSync(join(packageDir, '.tsbuild'), { recursive: true })
const out = mkdtempSync(join(packageDir, '.tsbuild', 'data-media-'))
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

const anyKept = (kept: ReadonlyArray<string>, file: RegExp) => kept.some(id => file.test(id))

test('a page keeps the table and cropper features it passes, and no others', async () => {
  const [table, fluid, boxes, cropper, zoom] = await Promise.all([
    keptBy('table', `import { Table } from 'ui'\nexport const page = [Table.view]`),
    keptBy('fluid', `import { Table } from 'ui'\nexport const page = [Table.view, Table.fluid]`),
    keptBy(
      'boxes',
      `import { Table } from 'ui'\nexport const page = [Table.view, Table.checkboxes]`,
    ),
    keptBy(
      'cropper',
      `import { ImageCropper } from 'ui'\nexport const page = [ImageCropper.view, ImageCropper.update]`,
    ),
    keptBy(
      'zoom',
      `import { ImageCropper } from 'ui'\nexport const page = [ImageCropper.view, ImageCropper.zoomSlider]`,
    ),
  ])

  const highlight = /\/fluidHover\.|\/dist\/table\/fluid\.js$/
  expect(anyKept(table, highlight)).toBe(false)
  expect(anyKept(fluid, highlight)).toBe(true)

  const checkbox = /\/dist\/checkbox\.js$|\/@foldkit\/ui\/dist\/checkbox\//
  expect(anyKept(table, checkbox)).toBe(false)
  expect(anyKept(boxes, checkbox)).toBe(true)

  const slider = /\/dist\/slider\.js$|\/@foldkit\/ui\/dist\/slider\//
  expect(anyKept(cropper, slider)).toBe(false)
  expect(anyKept(zoom, slider)).toBe(true)
}, 240_000)
