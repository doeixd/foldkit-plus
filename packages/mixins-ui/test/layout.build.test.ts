// @vitest-environment node
/**
 * The layout and disclosure widgets built as this package publishes them: a
 * page keeps a behaviour value, a state module or a feature only when it
 * names it. An Accordion drawn with `toggled` keeps no `accordion/state`; a
 * TreeView, ScrollArea, FloatingPanel, Tour, VirtualList or Sidebar that names
 * no `fluid`, `overlayBars`, `focusReturn` or `advanceOnClick` keeps none.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build as buildPage } from 'vite'
import { afterAll, expect, test } from 'vitest'
import { builtUiEntry } from './builtPackage.js'

const packageDir = resolve(import.meta.dirname, '..')
mkdirSync(join(packageDir, '.tsbuild'), { recursive: true })
const out = mkdtempSync(join(packageDir, '.tsbuild', 'layout-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

const keptBy = async (
  uiEntry: string,
  name: string,
  source: string,
): Promise<ReadonlyArray<string>> => {
  const entry = join(out, `${name}.ts`)
  writeFileSync(entry, source)
  const result = await buildPage({
    configFile: false,
    logLevel: 'silent',
    root: out,
    resolve: { alias: { ui: uiEntry }, conditions: ['foldkit-plus:source'] },
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

const has = (kept: ReadonlyArray<string>, file: string) =>
  kept.some(id => id.endsWith(`/dist/${file}.js`))

test('a layout page keeps the state, behaviour values and Bundles it names, and no others', async () => {
  const uiEntry = await builtUiEntry()
  const pages = {
    accordion: `import { Accordion } from 'ui'
export const page = [Accordion.view, Accordion.toggled]`,
    accordionState: `import { Accordion } from 'ui'
export const page = [Accordion.view, Accordion.update]`,
    tree: `import { TreeView } from 'ui'
export const page = [TreeView.view, TreeView.update]`,
    treeFluid: `import { TreeView } from 'ui'
export const page = [TreeView.view, TreeView.fluid]`,
    scroll: `import { ScrollArea } from 'ui'
export const page = [ScrollArea.view]`,
    scrollBars: `import { ScrollArea } from 'ui'
export const page = [ScrollArea.view, ScrollArea.overlayBars]`,
    panel: `import { FloatingPanel } from 'ui'
export const page = [FloatingPanel.view, FloatingPanel.update]`,
    panelBack: `import { FloatingPanel } from 'ui'
export const page = [FloatingPanel.view, FloatingPanel.focusReturn]`,
    tour: `import { Tour } from 'ui'
export const page = [Tour.view, Tour.update]`,
    tourMore: `import { Tour } from 'ui'
export const page = [Tour.view, Tour.focusReturn, Tour.advanceOnClick]`,
    list: `import { VirtualList } from 'ui'
export const page = [VirtualList.view]`,
    listBars: `import { VirtualList } from 'ui'
export const page = [VirtualList.view, VirtualList.overlayBars]`,
    sidebar: `import { Sidebar } from 'ui'
export const page = [Sidebar.view, Sidebar.update]`,
    sidebarFluid: `import { Sidebar } from 'ui'
export const page = [Sidebar.view, Sidebar.fluid]`,
  }
  const kept = Object.fromEntries(
    await Promise.all(
      Object.entries(pages).map(
        async ([name, source]) => [name, await keptBy(uiEntry, name, source)] as const,
      ),
    ),
  )
  const pairs: ReadonlyArray<readonly [string, string, string]> = [
    ['accordion', 'accordionState', 'accordion/state'],
    ['tree', 'treeFluid', 'treeView/fluid'],
    ['scroll', 'scrollBars', 'scrollArea/overlayBars'],
    ['panel', 'panelBack', 'floatingPanel/focusReturn'],
    ['tour', 'tourMore', 'tour/focusReturn'],
    ['tour', 'tourMore', 'tour/advanceOnClick'],
    ['list', 'listBars', 'virtualList/overlayBars'],
    ['sidebar', 'sidebarFluid', 'sidebar/fluid'],
  ]
  // Each value's file is absent from the page that does not name it, and present where it is named.
  expect(pairs.filter(([without, , file]) => has(kept[without]!, file))).toEqual([])
  expect(pairs.filter(([, named, file]) => !has(kept[named]!, file))).toEqual([])
}, 180_000)
