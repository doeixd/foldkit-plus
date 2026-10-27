// @vitest-environment node
/**
 * #212: what a host attaches to a request reaches `renderPage` through
 * Foldkit's own `handleRequest`, and a second copy of the module (the page
 * bundle beside the Worker's) reads it by name.
 */
import { Option } from 'effect'
import { Responded, handleRequest } from 'foldkit/experimental/server'
import { SSR } from 'foldkit-ssr'
import { describe, expect, it } from 'vitest'

const Page = SSR.requestContext<{ readonly reader: string }>('test/page')
const Other = SSR.requestContext<{ readonly reader: string }>('test/other')

const page = () => new Request('https://example.test/')

describe('SSR.requestContext', () => {
  it('reads what was attached to that request, under that name, and nothing else', () => {
    const request = Page.attach(page(), { reader: 'r1' })
    expect(Page.of(request)).toEqual(Option.some({ reader: 'r1' }))
    expect(Page.of(page())).toEqual(Option.none())
    expect(Other.of(request)).toEqual(Option.none())
    Other.attach(request, { reader: 'r2' })
    expect(Other.of(request)).toEqual(Option.some({ reader: 'r2' }))
    expect(Page.of(request)).toEqual(Option.some({ reader: 'r1' }))
  })

  it('refuses a second value under one name', () => {
    const request = Page.attach(page(), { reader: 'r1' })
    expect(() => Page.attach(request, { reader: 'r2' })).toThrow(
      'the request already carries a "test/page" context',
    )
    expect(Page.of(request)).toEqual(Option.some({ reader: 'r1' }))
  })

  it('reaches renderPage through handleRequest', async () => {
    const seen: Array<Option.Option<{ readonly reader: string }>> = []
    const response = await handleRequest(Page.attach(page(), { reader: 'r1' }), {
      template: '<!doctype html><html><head></head><body><div id="app"></div></body></html>',
      renderPage: async request => {
        seen.push(Page.of(request))
        return Responded(new Response('read'))
      },
    })
    expect(await response.text()).toBe('read')
    expect(seen).toEqual([Option.some({ reader: 'r1' })])
  })

  it("reads another copy's value by name, as a Worker's page bundle does", async () => {
    // A query makes Vite load the module again: a second module graph's copy.
    const copy: typeof import('../src/requestContext.js') = await import(
      /* @vite-ignore */ `${'../src/requestContext.ts'}?copy`
    )
    const request = Page.attach(page(), { reader: 'r1' })
    const theirs = copy.requestContext<{ readonly reader: string }>('test/page')
    expect(theirs).not.toBe(Page)
    expect(theirs.of(request)).toEqual(Option.some({ reader: 'r1' }))
  })

  it('refuses a globalThis that holds something else under its key', () => {
    const key = Symbol.for('foldkit-ssr/request-context')
    const held: unknown = Reflect.get(globalThis, key)
    Reflect.set(globalThis, key, {})
    try {
      expect(() => Page.of(page())).toThrow('globalThis holds something else')
    } finally {
      Reflect.set(globalThis, key, held)
    }
  })
})
