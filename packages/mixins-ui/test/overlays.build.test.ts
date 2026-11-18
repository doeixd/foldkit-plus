// @vitest-environment node
/**
 * The overlays built as this package publishes them: a page that draws one
 * ships only what it names. A Dialog without `overlayBars`, `keyboard` or
 * `focusReturn` runs none of the three primitives; a Drawer imports neither
 * the Sheet nor the Dialog beneath it; a Toast without `keepFocus` has no
 * `FocusRecovery`; an inline ColorPicker has no Popover; and a page placing
 * one Bundle holds no other.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build as buildPackage } from 'tsdown'
import { build as buildPage } from 'vite'
import { afterAll, expect, test } from 'vitest'
import config from '../tsdown.config.js'

const packageDir = resolve(import.meta.dirname, '..')
mkdirSync(join(packageDir, '.tsbuild'), { recursive: true })
const out = mkdtempSync(join(packageDir, '.tsbuild', 'overlays-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

const keptBy = async (name: string, source: string): Promise<ReadonlyArray<string>> => {
  const entry = join(out, `${name}.ts`)
  writeFileSync(entry, source)
  const result = await buildPage({
    configFile: false,
    logLevel: 'silent',
    root: out,
    resolve: { alias: { ui: join(out, 'dist/index.js') }, conditions: ['foldkit-plus:source'] },
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

test('a page keeps the behaviour values and neighbours it names, and no others', async () => {
  await buildPackage({
    ...config,
    config: false,
    cwd: packageDir,
    outDir: join(out, 'dist'),
    dts: false,
    logLevel: 'silent',
  })
  const [dialog, bars, keys, back, drawer, keep, toast, toastKeep, inline, popover, bundle] =
    await Promise.all([
      keptBy(
        'dialog',
        `import { Dialog } from 'ui'\nexport const page = [Dialog.toView, Dialog.update]`,
      ),
      keptBy(
        'bars',
        `import { Dialog } from 'ui'\nexport const page = [Dialog.toView, Dialog.overlayBars]`,
      ),
      keptBy(
        'keys',
        `import { Dialog } from 'ui'\nexport const page = [Dialog.toView, Dialog.keyboard]`,
      ),
      keptBy(
        'back',
        `import { Dialog } from 'ui'\nexport const page = [Dialog.toView, Dialog.focusReturn]`,
      ),
      keptBy(
        'drawer',
        `import { Drawer } from 'ui'\nexport const page = [Drawer.view, Drawer.update]`,
      ),
      keptBy(
        'keep',
        `import { Drawer } from 'ui'\nexport const page = [Drawer.view, Drawer.keepFocus]`,
      ),
      keptBy('toast', `import { Toast } from 'ui'\nexport const page = [Toast.view, Toast.show]`),
      keptBy(
        'toastKeep',
        `import { Toast } from 'ui'\nexport const page = [Toast.view, Toast.keepFocus]`,
      ),
      keptBy(
        'inline',
        `import { ColorPicker } from 'ui'\nexport const page = [ColorPicker.view, ColorPicker.update]`,
      ),
      keptBy(
        'popover',
        `import { ColorPicker } from 'ui'\nexport const page = [ColorPicker.view, ColorPicker.popover]`,
      ),
      keptBy('bundle', `import { Bundles } from 'ui'\nexport const page = Bundles.Dialog`),
    ])

  const bars$ = /\/scroll-bars\./
  expect(anyKept(dialog, bars$)).toBe(false)
  expect(anyKept(bars, bars$)).toBe(true)
  expect(anyKept(dialog, /\/keyboard-inset\./)).toBe(false)
  expect(anyKept(keys, /\/keyboard-inset\./)).toBe(true)
  expect(anyKept(dialog, /\/focus-return\./)).toBe(false)
  expect(anyKept(back, /\/focus-return\./)).toBe(true)

  // A Drawer page holds no Sheet and no Dialog, and `keepFocus` is its own file.
  expect(anyKept(drawer, /\/dist\/(sheet|dialog)\.js$/)).toBe(false)
  expect(anyKept(drawer, /\/dist\/drawer\/keepFocus\.js$/)).toBe(false)
  expect(anyKept(keep, /\/dist\/drawer\/keepFocus\.js$/)).toBe(true)

  expect(anyKept(toast, /\/focus-recovery\./)).toBe(false)
  expect(anyKept(toastKeep, /\/focus-recovery\./)).toBe(true)

  // An inline picker holds no Popover, upstream's or ours.
  const popovers = /\/dist\/popover\.js$|\/@foldkit\/ui\/dist\/popover\//
  expect(anyKept(inline, popovers)).toBe(false)
  expect(anyKept(popover, popovers)).toBe(true)

  // One Bundle is one file of the Bundles.
  expect(anyKept(bundle, /\/dist\/bundles\/dialog\.js$/)).toBe(true)
  expect(anyKept(bundle, /\/dist\/bundles\/(sheet|toast|popover|timer|colorPicker)\.js$/)).toBe(
    false,
  )
}, 240_000)
