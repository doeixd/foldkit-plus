/**
 * Phase 1: the search text, its address and the label the reads use. The
 * text is the Model's `query`, `?q=` mirrors it, and the debounce moves
 * `settledLabel` once the text rests.
 */
import { Option } from 'effect'
import { Mount, expect as expectScene, given, role, scene, text } from 'foldkit/scene'
import { WindowList } from 'foldkit-mixins-ui'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'
import { Message, init, update, type Model } from '../src/client/app.js'
import { ScrollPageToTop } from '../src/client/command.js'
import { SearchInput } from '../src/client/message.js'
import { view } from '../src/client/view.js'

const url = (path: string) => Option.getOrThrow(fromString(`https://domains.test${path}`))

/** `model` after each Message, Commands dropped: the debounce's timer is its own to test. */
const after = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)

const typed = (value: string) => Message.UpdatedSearch({ value })

/** What the debounce's timer would deliver for the text it last saw. */
const rested = (model: Model): Message =>
  Message.GotSearchMessage({
    message: SearchInput.Message.Settled({
      value: model.search.latest ?? '',
      generation: model.search.generation,
    }),
  })

const empty = init(url('/')).model

describe('typing', () => {
  test('shows the text at once and reads its label only once it rests', () => {
    const typing = after(empty, typed('a'), typed('ac'), typed('acme'))
    expect(typing.query).toBe('acme')
    expect(typing.searchLayout).toBe('Search')
    expect(typing.settledLabel).toEqual(Option.none())
    expect(after(typing, rested(typing)).settledLabel).toEqual(Option.some('acme'))
  })

  test('a text the box has moved on from is not read', () => {
    const typing = after(empty, typed('acme'))
    const settled = Message.GotSearchMessage({
      message: SearchInput.Message.Settled({ value: 'acme', generation: typing.search.generation }),
    })
    const movedOn = after(typing, settled, typed('acmes'))
    expect(movedOn.settledLabel).toEqual(Option.some('acme'))
    // The timer of the earlier text answers after a later keystroke: dropped.
    expect(after(movedOn, settled).settledLabel).toEqual(Option.some('acme'))
  })

  test('a text that is no label reads nothing', () => {
    const typing = after(empty, typed('-bad-'))
    expect(after(typing, rested(typing)).settledLabel).toEqual(Option.none())
  })

  test('Enter reads the text without waiting', () => {
    const typing = after(empty, typed('acme'))
    expect(after(typing, Message.SubmittedSearch()).settledLabel).toEqual(Option.some('acme'))
  })

  test('Escape empties the box and stops reading at once', () => {
    const typing = after(empty, typed('acme'))
    const searching = after(typing, rested(typing))
    const cleared = after(searching, Message.PressedEscape())
    expect(cleared.query).toBe('')
    expect(cleared.settledLabel).toEqual(Option.none())
    // The layout stays in the header, as upstream's does.
    expect(cleared.searchLayout).toBe('Search')
    // And the page goes back to its top.
    expect(
      update(searching, Message.PressedEscape()).commands?.map(command => command.name),
    ).toContain(ScrollPageToTop().name)
  })
})

describe('the address', () => {
  test('a page opened at ?q= reads its label from the first render', () => {
    const opened = init(url('/?q=Acme.com')).model
    expect(opened.query).toBe('Acme.com')
    expect(opened.settledLabel).toEqual(Option.some('acme'))
    expect(opened.searchLayout).toBe('Search')
  })

  test("the mirror's own write coming back changes nothing", () => {
    const typing = after(empty, typed('acme'))
    expect(update(typing, Message.ChangedUrl({ url: url('/?q=acme') })).model).toBe(typing)
  })

  test('back to an earlier search goes through the debounce like a keystroke', () => {
    const typing = after(empty, typed('acme'))
    const searching = after(typing, rested(typing))
    const back = after(searching, Message.ChangedUrl({ url: url('/?q=globex') }))
    expect(back.query).toBe('globex')
    expect(back.search.latest).toBe('globex')
    expect(after(back, rested(back)).settledLabel).toEqual(Option.some('globex'))
  })

  test('back to the empty page stops reading at once', () => {
    const typing = after(empty, typed('acme'))
    const searching = after(typing, rested(typing))
    const home = after(searching, Message.ChangedUrl({ url: url('/') }))
    expect(home.query).toBe('')
    expect(home.settledLabel).toEqual(Option.none())
  })
})

/**
 * All Results' list reports where the window lies over it. `WindowList`
 * composes its two Mounts into one, which a Scene matches by name (#369).
 */
const placeResultsList = Mount.resolve(
  { name: 'Mixins[root](WindowViewport,MeasureRows)' },
  Message.GotResultsListMessage({ message: WindowList.Message.Placed({ top: 0, height: 900 }) }),
)

describe('the page while typing', () => {
  test('draws pending cards and rows for the typed name', () => {
    scene(
      { update, view },
      given(after(empty, typed('acme'))),
      placeResultsList,
      expectScene(role('heading', { name: 'Top Results' })).toExist(),
      expectScene(text('Checking availability and prices…')).toExist(),
      expectScene(role('searchbox', { name: 'Search domains' })).toHaveValue('acme'),
    )
  })

  test('says why a text is no domain', () => {
    scene(
      { update, view },
      given(after(empty, typed('-bad-'))),
      expectScene(role('alert')).toContainText('letters, numbers, and hyphens'),
      expectScene(role('searchbox', { name: 'Search domains' })).toHaveAttr('aria-invalid', 'true'),
    )
  })
})
