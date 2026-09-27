/**
 * The studio's address, in a real browser: opening or closing an entry is a
 * step Back returns from, and anything else replaces the address in place.
 */
import { Effect, Option } from 'effect'
import { afterEach, expect, it } from 'vitest'
import { writeAddress } from '../src/address.js'
import { initial, linkIn, Narrowing } from '../src/app.js'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const write = (post: Option.Option<string>, q: Option.Option<string>) =>
  Effect.runPromise(writeAddress({ post, q }, 'post'))

it('adds a step for an entry opened or closed, and replaces for a search', async () => {
  window.history.replaceState(null, '', '/?as=edda')
  const start = window.history.length
  await write(Option.none(), Option.some('milk'))
  expect(window.location.search).toBe('?as=edda&q=milk')
  expect(window.history.length).toBe(start)
  await write(Option.some('e1'), Option.some('milk'))
  expect(window.location.search).toBe('?as=edda&q=milk&post=e1')
  expect(window.history.length).toBe(start + 1)
  // Already so, as after Back: no step is added.
  await write(Option.some('e1'), Option.some('milk'))
  expect(window.history.length).toBe(start + 1)
})

const urlOf = (search: string) => ({
  protocol: 'http:',
  host: 'studio',
  port: Option.none(),
  pathname: '/',
  search: Option.some(search),
  hash: Option.none(),
})

it('reads the open post, its preview, and the worklist’s narrowing from an address', () => {
  const url = urlOf('as=edda&post=e1&preview=1&q=milk&archive=true')
  expect(linkIn(url)).toEqual({ post: Option.some('e1'), preview: true })
  const { search, archived } = Narrowing.reduce(initial, url)
  expect({ search, archived }).toEqual({ search: 'milk', archived: true })
  // An empty parameter is none, not an entry named "".
  expect(linkIn(urlOf('post=&q='))).toEqual({ post: Option.none(), preview: false })
})
