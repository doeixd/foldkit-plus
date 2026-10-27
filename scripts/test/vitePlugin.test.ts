// @vitest-environment node
/**
 * Every example Vite serves loads `@foldkit/vite-plugin`. Without it a Foldkit
 * runtime logs "No response from @foldkit/vite-plugin" and an edit reloads the
 * page from `init`, losing the Model the person was working in.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfigFromFile, type PluginOption } from 'vite'
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
    const directory = join(root, example)
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      join(directory, 'vite.config.ts'),
      directory,
      'silent',
    )
    expect(await namesOf(loaded?.config.plugins ?? [])).toContain('foldkit')
  },
)

test('every exemption names an example Vite serves', () => {
  expect([...exempt.keys()].filter(example => !served.includes(example))).toEqual([])
})
