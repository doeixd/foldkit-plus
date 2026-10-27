import { describe, expect, test } from 'vitest'

import { onRequestGet, rangeOf } from '../functions/film/[[path]].js'

describe('the film answers byte ranges', () => {
  test.each([
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=900-', { start: 900, end: 999 }],
    ['bytes=990-5000', { start: 990, end: 999 }],
    ['bytes=-10', { start: 990, end: 999 }],
    ['bytes=-5000', { start: 0, end: 999 }],
    ['', 'whole'],
    ['bytes=0-1,5-6', 'whole'],
    ['items=0-1', 'whole'],
    ['bytes=1000-', 'unsatisfiable'],
    ['bytes=5-4', 'unsatisfiable'],
    ['bytes=-0', 'unsatisfiable'],
    ['bytes=-', 'unsatisfiable'],
  ])('%s of 1000 bytes', (header, expected) => {
    expect(rangeOf(header, 1000)).toEqual(expected)
  })

  const file = new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256))
  const asked = (range?: string) =>
    onRequestGet({
      request: new Request('https://site.test/film/a.mp4', {
        headers: range === undefined ? {} : { range },
      }),
      env: {
        ASSETS: {
          fetch: async url =>
            url.pathname === '/film/a.mp4'
              ? new Response(file, { headers: { 'content-type': 'video/mp4' } })
              : new Response('Not found', { status: 404 }),
        },
      },
    })

  test('a range is the bytes asked for, as 206', async () => {
    const answer = await asked('bytes=10-19')
    expect(answer.status).toBe(206)
    expect(answer.headers.get('content-range')).toBe('bytes 10-19/300')
    expect(answer.headers.get('content-type')).toBe('video/mp4')
    expect([...new Uint8Array(await answer.arrayBuffer())]).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ])
  })

  test('no range is the whole file, offering ranges', async () => {
    const answer = await asked()
    expect(answer.status).toBe(200)
    expect(answer.headers.get('accept-ranges')).toBe('bytes')
    expect((await answer.arrayBuffer()).byteLength).toBe(300)
  })

  test('a range past the end is refused with the size', async () => {
    const answer = await asked('bytes=300-')
    expect(answer.status).toBe(416)
    expect(answer.headers.get('content-range')).toBe('bytes */300')
  })
})
