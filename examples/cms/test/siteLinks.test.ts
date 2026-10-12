/**
 * Where a link on the site goes: one its tree holds is a route change, a
 * step unless it is the entry already shown, and any other (the studio) is
 * a full load.
 */
import { Option } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import { fromString, type Url } from 'foldkit/url'
import { expect, it } from 'vitest'

import { Message, initial, update } from '../src/apps/siteApp.js'

const urlOrThrow = (raw: string): Url =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))

const clicked = (from: string, to: string) => {
  const model = initial(urlOrThrow(`http://studio${from}`)).model
  const next = update(
    model,
    Message.UrlRequested({
      request: UrlRequest.Internal({ url: urlOrThrow(`http://studio${to}`) }),
    }),
  )
  expect(next.model).toBe(model)
  return (next.commands ?? []).map(command => ({ name: command.name, args: command.args }))
}

it.each([
  ['/site', '/site/blog/a-post', 'push'],
  ['/site/blog/a-post', '/site/blog/another', 'push'],
  ['/site/blog/a-post', '/site/blog/a-post', 'replace'],
  ['/site/about', '/site/contact', 'push'],
])('from %s, a link to %s is a %s', (from, to, history) => {
  expect(clicked(from, to)).toEqual([
    { name: 'Site.Navigate', args: { url: `http://studio${to}`, history } },
  ])
})

it('loads a link to the studio, another application', () => {
  expect(clicked('/site', '/?as=edda')).toEqual([
    { name: 'Site.Load', args: { href: 'http://studio/?as=edda' } },
  ])
})
