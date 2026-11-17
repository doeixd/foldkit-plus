// @vitest-environment node
/**
 * The compiler-free halves of the theme code: a production browser build of an
 * entry that imports only `foldkit-mixins/theme/runtime` or
 * `foldkit-mixins/theme/knob-data` holds no module that compiles or writes
 * styles, which is what lets a page built with `foldkit-mixins/vite`'s
 * `modules` switch themes and draw a theme panel (`refuseCompiler` there
 * fails a build that holds `styleRules`).
 */
import { brotliCompressSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { build, defaultClientConditions } from 'vite'
import type { Rollup } from 'vite'
import { describe, expect, it } from 'vitest'
import { mutation } from '../../../scripts/mutation-plugin.mjs'

const root = fileURLToPath(new URL('./fixtures/themeRuntime/', import.meta.url))

/** The workspace modules of `mixins/src` that a production build of `entry` renders. */
const built = async (entry: string) => {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    // `pnpm mutate`'s edits reach the modules this build bundles.
    plugins: [mutation()],
    resolve: { conditions: ['foldkit-plus:source', ...defaultClientConditions] },
    build: { write: false, rollupOptions: { input: `${root}${entry}` } },
  })
  const chunks = [result]
    .flat()
    .flatMap(output => ('output' in output ? output.output : []))
    .flatMap((file: Rollup.OutputChunk | Rollup.OutputAsset) =>
      file.type === 'chunk' ? [file] : [],
    )
  const modules = chunks
    .flatMap(chunk => Object.entries(chunk.modules))
    .flatMap(([id, info]) => {
      const own = /[\/]mixins[\/]src[\/](.*)$/.exec(id)
      return info.renderedLength > 0 && own !== null ? [own[1]!] : []
    })
  const code = chunks.map(chunk => chunk.code).join('')
  return { modules, code, bytes: brotliCompressSync(code).length }
}

const rendered = async (entry: string) => (await built(entry)).modules

// The modules that compile a Style or write style values into a page.
const style = ['styleRules.ts', 'styleValue.ts', 'theme/core.ts', 'theme/themes.ts', 'theme.ts']

// The knob definitions, their shadow and gamut tables, and the math they pull in.
const knobCode = [
  'theme/knobs.ts',
  'theme/knob.ts',
  'theme/shadows.ts',
  'theme/gamut.ts',
  'theme/cssMath.ts',
]

describe('a production browser build', { timeout: 60_000 }, () => {
  it('of the compiled half renders the style compiler (the control)', async () => {
    expect(await rendered('compiledEntry.ts')).toEqual(expect.arrayContaining(style))
  })

  it.each([
    ['foldkit-mixins/theme/runtime', 'runtimeEntry.ts', 'theme/runtime.ts'],
    ['foldkit-mixins/theme/knob-data', 'knobDataEntry.ts', 'theme/knobData.ts'],
  ])('of %s renders no style module', async (_, entry, own) => {
    const modules = await rendered(entry)
    expect(modules).toContain(own)
    expect(modules.filter(module => style.includes(module))).toEqual([])
  })

  it('of the knob table renders none of the knob definitions', async () => {
    const modules = await rendered('knobDataEntry.ts')
    expect(modules.filter(module => knobCode.includes(module))).toEqual([])
  })

  it('of six knobs keeps six entries, and of the table all of them', async () => {
    const six = await built('knobsSixEntry.ts')
    const all = await built('knobsAllEntry.ts')
    // `accent-c-dark` is the variable of a knob that only the table names.
    expect(six.code).toContain('shadow-strength')
    expect(six.code).not.toContain('accent-c-dark')
    expect(all.code).toContain('accent-c-dark')
    expect(six.bytes).toBeLessThan(all.bytes / 4)
  })
})
