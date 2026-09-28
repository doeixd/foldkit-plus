/**
 * The studio's sections in one document: a link to another section, or Back
 * across one, swaps the application in place; anything else is left to the
 * page, a full load as before.
 */
import { Option } from 'effect'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mountStudio } from '../src/studio.js'

type Section = 'posts' | 'pages'
const sectionOf = (pathname: string): Option.Option<Section> =>
  pathname === '/'
    ? Option.some('posts')
    : pathname.startsWith('/pages')
      ? Option.some('pages')
      : Option.none()

/** Links that reached the page, which the studio left alone; stopped here, so the test stays put. */
let reached: Array<string> = []
const stay = (event: MouseEvent) => {
  const link = event.target instanceof Element ? event.target.closest('a') : null
  if (link !== null) reached.push(link.id)
  event.preventDefault()
}
let teardown = () => {}

beforeEach(() => {
  reached = []
  window.history.replaceState(null, '', '/?as=edda')
  document.addEventListener('click', stay)
})
afterEach(() => {
  teardown()
  document.removeEventListener('click', stay)
  document.body.replaceChildren()
  window.history.replaceState(null, '', '/')
})

const studio = () => {
  const host = document.createElement('div')
  document.body.append(host)
  const log: Array<string> = []
  teardown = mountStudio<Section>({
    host,
    sectionOf,
    initial: 'posts',
    mount: (section, at) => {
      at.innerHTML = [
        '<a id="posts" href="/?as=edda">Posts</a>',
        '<a id="pages" href="/pages?as=edda">Pages</a>',
        '<a id="wren" href="/pages?as=wren">Wren</a>',
        '<a id="site" href="/site?as=edda">Site</a>',
      ].join('')
      log.push(`start ${section}`)
      return () => log.push(`stop ${section}`)
    },
    sameReader: url => url.searchParams.get('as') === 'edda',
  })
  return { host, log }
}

const click = (id: string) => document.getElementById(id)?.click()

it('swaps to the section a link names, in place, with the address to match', () => {
  const { host, log } = studio()
  click('pages')
  expect(log).toEqual(['start posts', 'stop posts', 'start pages'])
  expect(window.location.pathname).toBe('/pages')
  expect(host.children).toHaveLength(1)
  expect(reached).toEqual([])
})

it('leaves the same section, another reader and the site to the page', () => {
  const { log } = studio()
  click('posts')
  click('wren')
  click('site')
  expect(reached).toEqual(['posts', 'wren', 'site'])
  expect(log).toEqual(['start posts'])
})

it('answers Back across sections', async () => {
  const { log } = studio()
  click('pages')
  const back = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }))
  window.history.back()
  await back
  expect(window.location.pathname).toBe('/')
  expect(log.at(-1)).toBe('start posts')
})

it('stops its section and lets go of links once taken down', () => {
  const { log } = studio()
  teardown()
  teardown = () => {}
  click('pages')
  expect(log).toEqual(['start posts', 'stop posts'])
  expect(reached).toEqual(['pages'])
})
