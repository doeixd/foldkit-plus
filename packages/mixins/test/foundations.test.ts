/**
 * The foundations land in the page's head: the plugin compiles the sheet
 * module and injects its text as a style tag, and a module without the
 * export is refused by name.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HtmlTagDescriptor } from 'vite'
import { expect, it } from 'vitest'
import { foundations, loadFoundations } from 'foldkit-mixins/foundations'

const dir = dirname(fileURLToPath(import.meta.url))

/** The plugin's tags for `html`, through its handler with no running server. */
const tagsFor = async (
  plugin: ReturnType<typeof foundations>,
  html: string,
): Promise<ReadonlyArray<HtmlTagDescriptor>> => {
  const transform = plugin.transformIndexHtml
  if (typeof transform !== 'object' || transform === null || !('handler' in transform))
    throw new Error('the foundations plugin answers transformIndexHtml with a handler')
  // Through unknown: the hook's context carries the build, which this call
  // does not have and does not need (no server, so it starts its own).
  const handler = transform.handler as unknown as (
    html: string,
    context: { readonly server?: undefined },
  ) => Promise<ReadonlyArray<HtmlTagDescriptor>>
  return handler(html, {})
}

it('compiles the sheet module into a head style', async () => {
  expect(await loadFoundations({ module: '/fixture-sheet.ts', root: dir })).toContain(
    '.fixture-foundations',
  )
  const [tag] = await tagsFor(
    foundations({ module: '/fixture-sheet.ts', root: dir }),
    '<html><head></head><body></body></html>',
  )
  expect(tag?.tag).toBe('style')
  expect(tag?.injectTo).toBe('head')
  expect(tag?.children).toContain('.fixture-foundations')
}, 120_000)

it('refuses a module without the export, naming it', async () => {
  await expect(
    loadFoundations({ module: '/fixture-sheet.ts', export: 'missing', root: dir }),
  ).rejects.toThrow('fixture-sheet.ts')
  await expect(
    tagsFor(foundations({ module: '/fixture-sheet.ts', export: 'missing', root: dir }), ''),
  ).rejects.toThrow('missing')
}, 120_000)
