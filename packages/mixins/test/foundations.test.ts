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

it('compiles through a running server where one is given', async () => {
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: false,
    root: dir,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    resolve: { conditions: ['foldkit-plus:source'] },
    ssr: { resolve: { conditions: ['foldkit-plus:source'] } },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const plugin = foundations({ module: '/fixture-sheet.ts' })
    const transform = plugin.transformIndexHtml
    if (typeof transform !== 'object' || transform === null || !('handler' in transform))
      throw new Error('the foundations plugin answers transformIndexHtml with a handler')
    const handler = transform.handler as unknown as (
      html: string,
      context: { readonly server: typeof server },
    ) => Promise<ReadonlyArray<{ readonly tag: string; readonly children?: unknown }>>
    const [tag] = await handler('<html><head></head></html>', { server })
    expect(tag?.tag).toBe('style')
    expect(tag?.children).toContain('.fixture-foundations')
  } finally {
    await server.close()
  }
}, 120_000)
