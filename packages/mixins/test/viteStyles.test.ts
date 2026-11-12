// @vitest-environment node
/**
 * The plugin writes the application's stylesheet as a hashed asset in the
 * browser build and gives the server entry its address.
 */
import { fileURLToPath } from 'node:url'
import { createServer as createHttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { build, createServer, defaultServerConditions } from 'vite'
import type { Rollup } from 'vite'
import { Style } from 'foldkit-mixins'
import { styles, type StylesOptions } from 'foldkit-mixins/vite'
import { describe, expect, it } from 'vitest'
import { Look, stylesheet } from './fixtures/viteStyles/sheet.js'
import { OUTSIDE_GLOBAL, Outside } from './fixtures/viteStyles/outside.js'

const root = fileURLToPath(new URL('./fixtures/viteStyles/', import.meta.url))
const mixins = fileURLToPath(new URL('../src/index.ts', import.meta.url))

const built = async (
  base = '/',
  sheet = '/sheet.ts',
  prune?: StylesOptions['prune'],
): Promise<ReadonlyArray<Rollup.OutputChunk | Rollup.OutputAsset>> => {
  const result = await build({
    root,
    base,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { 'foldkit-mixins': mixins } },
    plugins: [styles({ sheet, prune })],
    build: { write: false, rollupOptions: { input: `${root}entry.ts` } },
  })
  return [result].flat().flatMap(output => ('output' in output ? output.output : []))
}

const cssOf = (output: ReadonlyArray<Rollup.OutputChunk | Rollup.OutputAsset>) =>
  output.filter(file => file.type === 'asset' && file.fileName.endsWith('.css'))

describe('foldkit-mixins/vite', () => {
  it('writes the stylesheet as a hashed asset, and its address to the virtual module', async () => {
    const output = await built()
    const [asset, ...others] = cssOf(output)
    expect(others).toEqual([])
    expect(asset?.fileName).toMatch(/^assets\/styles-[0-9a-f]{8}\.css$/)
    const source = asset?.type === 'asset' ? String(asset.source) : ''
    // Every compiled class the sheet does not hold follows it.
    expect(source.startsWith(stylesheet)).toBe(true)
    // A class the sheet holds is not written again.
    expect(source.split(Look.rules[0]?.css ?? '')).toHaveLength(2)
    expect(source).toContain(Look.rules[0]?.css)
    const entry = output.find(file => file.type === 'chunk' && file.isEntry)
    expect(entry?.type === 'chunk' ? entry.code : '').toContain(`/${asset?.fileName}`)
  })

  it('names the file by its content, the same in every build', async () => {
    const [first] = cssOf(await built())
    const [second] = cssOf(await built())
    expect(first?.fileName).toBe(second?.fileName)
  })

  it('names different content differently', async () => {
    const [first] = cssOf(await built())
    const [other] = cssOf(await built('/', '/plain.ts'))
    expect(other?.fileName).toMatch(/^assets\/styles-[0-9a-f]{8}\.css$/)
    expect(other?.fileName).not.toBe(first?.fileName)
  })

  it('puts the base in front of the address', async () => {
    const output = await built('/app/')
    const [asset] = cssOf(output)
    const entry = output.find(file => file.type === 'chunk' && file.isEntry)
    expect(entry?.type === 'chunk' ? entry.code : '').toContain(`/app/${asset?.fileName}`)
  })

  it.each([
    ['every token without prune', undefined, true],
    ['only the tokens the sheet reads with prune', {}, false],
    ['a token prune is told to keep', { keep: ['--fk-unread'] }, true],
  ])('writes %s', async (_, prune, unread) => {
    const [asset] = cssOf(await built('/', '/tokens.ts', prune))
    const source = asset?.type === 'asset' ? String(asset.source) : ''
    expect(source).toContain('--fk-read:1px')
    expect(source.includes('--fk-unread')).toBe(unread)
  })

  it('serves the same pruned sheet in dev', async () => {
    const vite = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: { alias: { 'foldkit-mixins': mixins } },
      // The sheet loads through `foldkit-mixins` into the other workspace
      // packages; their source, since CI builds no `dist` to resolve to.
      ssr: { resolve: { conditions: ['foldkit-plus:source', ...defaultServerConditions] } },
      plugins: [styles({ sheet: '/tokens.ts', prune: {} })],
      server: { middlewareMode: true, ws: false },
    })
    const http = createHttpServer(vite.middlewares)
    try {
      await new Promise<void>(listening => http.listen(0, '127.0.0.1', listening))
      const { port } = http.address() as AddressInfo
      const css = await (await fetch(`http://127.0.0.1:${port}/__foldkit-styles.css`)).text()
      expect(css).toContain('--fk-read:1px')
      expect(css).not.toContain('--fk-unread')
    } finally {
      http.close()
      await vite.close()
    }
  })

  it('emits a file only the sheet names, at the address the sheet gives it', async () => {
    const output = await built('/', '/withFont.ts')
    const [asset] = cssOf(output)
    const named = /url\((\/assets\/face-[\w-]+\.woff2)\)/.exec(
      asset?.type === 'asset' ? String(asset.source) : '',
    )?.[1]
    expect(named).toBeDefined()
    expect(output.map(file => `/${file.fileName}`)).toContain(named)
  })

  it('writes the sheet completed with the classes its modules compiled', async () => {
    const [asset] = cssOf(await built())
    expect(asset?.type === 'asset' ? String(asset.source) : '').toBe(Style.complete(stylesheet))
  })
})

describe('Style.complete', () => {
  const source = Style.complete(stylesheet)

  it('keeps the sheet first and writes a class it holds once', () => {
    expect(source.startsWith(stylesheet)).toBe(true)
    expect(source.split(Look.rules[0]?.css ?? '')).toHaveLength(2)
  })

  it('appends a class compiled outside the sheet, which only usedIn found before, and its global rule once', () => {
    const rule = Outside.rules[0]
    expect(stylesheet).not.toContain(rule?.className)
    expect(source).toContain(rule?.css)
    expect(source.split(OUTSIDE_GLOBAL)).toHaveLength(2)
    expect(Style.usedIn(`<div class="${rule?.className}">`)).toContain(rule?.css)
  })

  it('does not write a global rule the sheet already holds again', () => {
    expect(Style.complete(source)).toBe(source)
  })
})
