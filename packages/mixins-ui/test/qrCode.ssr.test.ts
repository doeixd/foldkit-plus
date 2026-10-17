// @vitest-environment jsdom
/**
 * The QR code rendered on a server, as a browser parses it: one image named
 * by what it encodes, its frame an SVG with its view box, and the path of
 * its modules the one the encoder gives, so a code served before the page
 * hydrates already scans.
 */
import { Effect, Option } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'
import * as QrCode from '../src/qrCode.js'

test('the code is served as an SVG of its path, named by its value', async () => {
  const value = 'https://example.com/menu'
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: unknown, h: HtmlBuilder<never>) => ({
          title: 'Code',
          body: QrCode.view({ id: 'menu', value }, h),
        }),
      },
      { buildId: 'b' },
    ),
  )
  const page = new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      served,
    ),
    'text/html',
  )
  const matrix = Option.getOrThrow(QrCode.encode(value, 'M'))
  expect(page.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(`QR code: ${value}`)
  const frame = page.getElementById('menu-frame')
  expect(frame?.namespaceURI).toBe('http://www.w3.org/2000/svg')
  expect(frame?.getAttribute('viewBox')).toBe(`-4 -4 ${matrix.size + 8} ${matrix.size + 8}`)
  expect(frame?.querySelector('path')?.getAttribute('d')).toBe(QrCode.pathOf(matrix))
})
