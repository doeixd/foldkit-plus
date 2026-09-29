/**
 * When a page the build rendered is taken over as it is: it shows the seed to
 * a visitor, so only a visitor whose sandbox still holds the seed gets it.
 */
import { expect, it } from 'vitest'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { APP_ROOT, takesOver } from '../src/content/siteConfig.js'
import type { Chair } from '../src/server/transport.js'

const page = (body: string) => new DOMParser().parseFromString(body, 'text/html')
const generated = page(
  '<main></main><div data-foldkit-app="app" data-foldkit-plus-resume="{}"></div>',
)
const shell = page('<div id="app"></div>')

it.each<[string, Document, Chair, boolean, boolean]>([
  ['a generated page, to a visitor with the seed', generated, 'visitor', false, true],
  ['the studio’s shell, which carries nothing to take over', shell, 'visitor', false, false],
  ['a visitor whose sandbox has changed', generated, 'visitor', true, false],
  ['an author, whose links keep their chair', generated, 'edda', false, false],
])('%s', (_, document, reader, edited, taken) => {
  expect(takesOver(document, reader, edited)).toBe(taken)
})

it('finds a rendered page by the mark Foldkit puts on its root', () => {
  expect(APP_ROOT).toBe(FOLDKIT_APP_ATTRIBUTE)
})
