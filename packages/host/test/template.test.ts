import { Host } from 'foldkit-host'
import { describe, expect, it } from 'vitest'

const page = (buildId?: string) =>
  `<!doctype html><html><head>${
    buildId === undefined ? '' : `<meta name="${Host.BUILD_META}" content="${buildId}">`
  }</head><body><div id="app"></div></body></html>`

/** An assets binding serving `files`, recording what was asked of it. */
const assetsOf = (files: Record<string, string>) => {
  const asked: Array<string> = []
  return {
    asked,
    fetch: async (request: Request | string) => {
      const path = new URL(typeof request === 'string' ? request : request.url).pathname
      asked.push(path)
      return Object.hasOwn(files, path)
        ? new Response(files[path])
        : new Response('missing', { status: 404 })
    },
  }
}

interface Env {
  readonly ASSETS: Host.Assets
}

describe('Host.template', () => {
  it('reads the template and its build id once per binding', async () => {
    const assets = assetsOf({ '/index.html': page('build-7') })
    const read = Host.template((env: Env) => env.ASSETS)
    const env = { ASSETS: assets }
    expect(await read(env)).toEqual({ html: page('build-7'), buildId: 'build-7' })
    await read(env)
    expect(assets.asked).toEqual(['/index.html'])
  })

  it('reads the path it is given', async () => {
    const assets = assetsOf({ '/app/shell.html': page('b') })
    const read = Host.template((env: Env) => env.ASSETS, { path: '/app/shell.html' })
    expect((await read({ ASSETS: assets })).buildId).toBe('b')
  })

  it('reads the id buildTag writes', async () => {
    const tag = Host.buildTag('build-9')
    const html = `<head><meta name="${tag.attrs.name}" content="${tag.attrs.content}"></head>`
    const read = Host.template((env: Env) => env.ASSETS)
    expect(await read({ ASSETS: assetsOf({ '/index.html': html }) })).toEqual({
      html,
      buildId: 'build-9',
    })
    expect(tag).toEqual({
      tag: 'meta',
      attrs: { name: 'foldkit-build', content: 'build-9' },
      injectTo: 'head',
    })
  })

  it('refuses assets with no template, and reads again on the next call', async () => {
    const files: Record<string, string> = {}
    const assets = assetsOf(files)
    const read = Host.template((env: Env) => env.ASSETS)
    await expect(read({ ASSETS: assets })).rejects.toThrow('The assets hold no /index.html (404)')
    files['/index.html'] = page('late')
    expect((await read({ ASSETS: assets })).buildId).toBe('late')
  })

  it('refuses a template no build stamped', async () => {
    const read = Host.template((env: Env) => env.ASSETS)
    await expect(read({ ASSETS: assetsOf({ '/index.html': page() }) })).rejects.toThrow(
      '/index.html carries no build id',
    )
  })
})
