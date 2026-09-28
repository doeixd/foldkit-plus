/**
 * The studio's address, in a real browser: opening or closing an entry is a
 * step Back returns from, and anything else replaces the address in place.
 */
import { Effect, Option } from 'effect'
import { afterEach, expect, it } from 'vitest'
import { writeAddress } from '../src/address.js'
import { init, initial, linkIn, Message, Narrowing, update } from '../src/app.js'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const write = (post: Option.Option<string>, q: Option.Option<string>) =>
  Effect.runPromise(writeAddress({ post, q }, ['post', 'new']))

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
  expect(linkIn(url)).toEqual({ stored: Option.some('e1'), fresh: Option.none(), preview: true })
  const { search, archived } = Narrowing.reduce(initial, url)
  expect({ search, archived }).toEqual({ search: 'milk', archived: true })
  // An empty parameter is none, not an entry named "".
  expect(linkIn(urlOf('post=&q='))).toEqual({
    stored: Option.none(),
    fresh: Option.none(),
    preview: false,
  })
  // Something new is named until its first save; a saved entry's own key wins.
  expect(linkIn(urlOf('new=e2')).fresh).toEqual(Option.some('e2'))
  expect(linkIn(urlOf('post=e1&new=e2'))).toMatchObject({
    stored: Option.some('e1'),
    fresh: Option.none(),
  })
})

it('keeps looking for something new when the runtime names its address again', () => {
  // The application runtime sends the starting address once more after `init`,
  // before the server has said whether the entry exists.
  const url = urlOf('as=edda&new=entry-9')
  const started = init(url).model
  expect(started.fresh).toEqual(Option.some('entry-9'))
  expect(update(started, Message.UrlChanged({ url })).model.fresh).toEqual(Option.some('entry-9'))
})
