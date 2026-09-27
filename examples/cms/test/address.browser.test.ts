/**
 * The studio's address, in a real browser: opening or closing an entry is a
 * step Back returns from, and anything else replaces the address in place.
 */
import { Effect, Option } from 'effect'
import { afterEach, expect, it } from 'vitest'
import { writeAddress } from '../src/address.js'
import { linkIn } from '../src/app.js'

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

it('reads the open post and the worklist’s narrowing from an address', () => {
  const at = (search: string) =>
    linkIn({
      protocol: 'http:',
      host: 'studio',
      port: Option.none(),
      pathname: '/',
      search: Option.some(search),
      hash: Option.none(),
    })
  expect(at('as=edda&post=e1&q=milk&archive=1')).toEqual({
    post: Option.some('e1'),
    search: 'milk',
    archived: true,
  })
  // An empty parameter is none, not an entry named "".
  expect(at('post=&q=')).toEqual({ post: Option.none(), search: '', archived: false })
})
