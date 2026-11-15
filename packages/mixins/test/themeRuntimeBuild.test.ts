// @vitest-environment node
/**
 * The compiler-free halves of the theme code: a production browser build of an
 * entry that imports only `foldkit-mixins/theme/runtime` or
 * `foldkit-mixins/theme/knob-data` holds no module that compiles or writes
 * styles, which is what lets a page built with `foldkit-mixins/vite`'s
 * `modules` switch themes and draw a theme panel (`refuseCompiler` there
 * fails a build that holds `styleRules`).
 */
import { fileURLToPath } from 'node:url'
import { build, defaultClientConditions } from 'vite'
import type { Rollup } from 'vite'
import { describe, expect, it } from 'vitest'
import { mutation } from '../../../scripts/mutation-plugin.mjs'

const root = fileURLToPath(new URL('./fixtures/themeRuntime/', import.meta.url))

/** The workspace modules of `mixins/src` that a production build of `entry` renders. */
const rendered = async (entry: string): Promise<ReadonlyArray<string>> => {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    // `pnpm mutate`'s edits reach the modules this build bundles.
    plugins: [mutation()],
    resolve: { conditions: ['foldkit-plus:source', ...defaultClientConditions] },
    build: { write: false, rollupOptions: { input: `${root}${entry}` } },
  })
  return [result]
    .flat()
    .flatMap(output => ('output' in output ? output.output : []))
    .flatMap((file: Rollup.OutputChunk | Rollup.OutputAsset) =>
      file.type === 'chunk' ? Object.entries(file.modules) : [],
    )
    .flatMap(([id, info]) => {
      const own = /[\/]mixins[\/]src[\/](.*)$/.exec(id)
      return info.renderedLength > 0 && own !== null ? [own[1]!] : []
    })
}

// The modules that compile a Style or write style values into a page.
const style = ['styleRules.ts', 'styleValue.ts', 'theme/core.ts', 'theme/themes.ts', 'theme.ts']

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
})
