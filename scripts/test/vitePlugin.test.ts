// @vitest-environment node
/**
 * Every example Vite serves loads `@foldkit/vite-plugin`. Without it a Foldkit
 * runtime logs "No response from @foldkit/vite-plugin" and an edit reloads the
 * page from `init`, losing the Model the person was working in.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PluginOption, UserConfigExport } from 'vite'
import { expect, test } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

/** Examples whose page runs no Foldkit runtime, so nothing asks for the plugin. */
const exempt = new Map([
  ['examples/richtext', 'the harness mounts the editable adapter alone, with no runtime'],
])

const served = ['examples', 'examples/foldkit'].flatMap(parent =>
  readdirSync(join(root, parent), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `${parent}/${entry.name}`)
    .filter(example => existsSync(join(root, example, 'vite.config.ts'))),
)

const namesOf = async (option: PluginOption): Promise<ReadonlyArray<string>> => {
  const plugin = await option
  if (Array.isArray(plugin)) return (await Promise.all(plugin.map(namesOf))).flat()
  return plugin ? [plugin.name] : []
}

test.each(served.filter(example => !exempt.has(example)))(
  '%s serves with the foldkit plugin',
  async example => {
    // Through Vitest, as the e2e tests read a config: Vite's own loader runs it in
    // Node, which reaches a workspace plugin's `dist`, absent on CI.
    const exported: UserConfigExport = (
      await import(pathToFileURL(join(root, example, 'vite.config.ts')).href)
    ).default
    const config =
      typeof exported === 'function'
        ? await exported({ command: 'serve', mode: 'development' })
        : await exported
    expect(await namesOf(config.plugins ?? [])).toContain('foldkit')
  },
)

test('every exemption names an example Vite serves', () => {
  expect([...exempt.keys()].filter(example => !served.includes(example))).toEqual([])
})
