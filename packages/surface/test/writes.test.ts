// @vitest-environment jsdom
/**
 * `Writes`: a Surface's drawing is kept while no Message since it was made is
 * declared to write a path the Surface reads. The matching is read from
 * `regions()`; the keeping is counted on the real Foldkit runtime, whose lazy
 * slot is what hands a kept drawing back.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Writes } from '../src/writes.js'
import { App, Declared, initial, make, Message, Model, update } from './writesFixture.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('which declared Messages draw a Surface again', () => {
  const { writes } = make()
  const regions = Object.fromEntries(writes.regions().map(region => [region.name, region]))

  it.each([
    ['a write to the path it reads', 'Header', ['Renamed']],
    ['not a write to another field', 'Tally', ['Counted', 'Sneaked']],
    [
      'a write below the path it reads, and one to the path',
      'AccountPanel',
      ['Deposited', 'Moved'],
    ],
    ['a write above the path it reads, and not one to a sibling below', 'Owner', ['Moved']],
    [
      'every transition that writes, for a read no path names',
      'Loose',
      ['Renamed', 'Counted', 'Deposited', 'Moved', 'Sneaked'],
    ],
  ])('%s', (_, name, tags) => {
    expect(regions[name]?.redrawnBy).toEqual(tags)
  })

  it('gives the paths a Surface reads, and none for a read no path names', () => {
    expect(regions['Owner']?.reads).toEqual(Option.some([['account', 'owner']]))
    expect(regions['Loose']?.reads).toEqual(Option.none())
  })

  it('gives the paths a Message is declared to write, and none without a transition', () => {
    expect(writes.declared(Message.Deposited({ amount: 1 }))).toEqual(
      Option.some([['account', 'balance']]),
    )
    expect(writes.declared(Message.Pinged())).toEqual(Option.some([]))
    expect(writes.declared(Message.Noted({ note: 'n' }))).toEqual(Option.none())
  })
})

it('refuses a transition no Message of the application names', () => {
  const Other = Transition.make({ state: Model, input: Schema.Struct({}), apply: () => [] })
  expect(() =>
    // @ts-expect-error `constructor` is not a Message tag of the application
    Writes.of(App, Machine.make({ state: Model, transitions: { constructor: Other } })),
  ).toThrow('the transition "constructor" is not named by a Message of this application')
})

describe('where there is no runtime frame', () => {
  it('draws every time, since no lazy slot can keep a drawing', () => {
    const writes = Writes.of(App, Declared)
    let draws = 0
    const view = writes.region('Bare', Option.some([['title']]), (_root: Model, _h: undefined) => {
      draws++
      return null
    })
    view(initial, undefined)
    view(initial, undefined)
    expect(draws).toBe(2)
  })

  it('lets a drawing that throws throw, drawn once', () => {
    const writes = Writes.of(App, Declared)
    let draws = 0
    const view = writes.region('Bare', Option.some([['title']]), (_root: Model, _h: undefined) => {
      draws++
      throw new Error('the drawing broke')
    })
    expect(() => view(initial, undefined)).toThrow('the drawing broke')
    expect(draws).toBe(1)
  })
})

/** Frames run on a timer, as jsdom has none. */
const timedFrames = () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
}

const text = (id: string) => document.getElementById(id)?.textContent
const press = (id: string) => (document.getElementById(id) as HTMLElement).click()

/** The Messages a test sends, each from a button of its own beside the Surfaces. */
const senders = {
  renamed: Message.Renamed({ title: 'Renamed' }),
  counted: Message.Counted(),
  deposited: Message.Deposited({ amount: 5 }),
  moved: Message.Moved({ account: { balance: 1, owner: 'grace' } }),
  pinged: Message.Pinged(),
  noted: Message.Noted({ note: 'a note' }),
  ignored: Message.Ignored(),
}

/**
 * The fixture's five Surfaces on the runtime. `tracked` says which Messages
 * go through `writes.track`: the rest reach the plain `update`, as a Model
 * made behind the writes' back does.
 */
const mount = async (
  options: {
    readonly skip?: boolean
    readonly tracked?: (message: Message) => boolean
    /** Adds a view that reads the title and throws once it is `Renamed`. */
    readonly broken?: boolean
  } = {},
) => {
  const app = make(options)
  let brokenDraws = 0
  const broken = app.writes.region(
    'Broken',
    Option.some([['title']]),
    (root: Model, h: HtmlBuilder<Message>) => {
      brokenDraws++
      if (root.title === 'Renamed') throw new Error('the drawing broke')
      return h.p([], ['whole'])
    },
  )
  const container = document.createElement('div')
  container.id = 'writes'
  document.body.appendChild(container)
  timedFrames()
  const tracked = app.writes.track(update)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update: (model: Model, message: Message) => ({
        model: (options.tracked?.(message) === false ? update : tracked)(model, message).model,
        commands: [],
      }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Id('page'), h.DataAttribute('note', model.note)],
          [
            app.view(model, h),
            ...(options.broken === true ? [broken(model, h)] : []),
            ...Object.entries(senders).map(([key, message]) =>
              h.button([h.Id(key), h.OnClick(message)], [key]),
            ),
          ],
        ),
    }),
  )
  await vi.waitFor(() => expect(text('header')).toBe('Untitled'))
  return { draws: () => Object.fromEntries(app.draws), brokenDraws: () => brokenDraws, handle }
}

const once = { Header: 1, Tally: 1, AccountPanel: 1, Owner: 1, Loose: 1 }

describe('on the runtime', () => {
  it('keeps the drawing of a Surface no declared write reaches, through two transitions', async () => {
    const { draws, handle } = await mount()
    try {
      expect(draws()).toEqual(once)
      press('counted')
      await vi.waitFor(() => expect(text('tally')).toBe('1'))
      press('counted')
      await vi.waitFor(() => expect(text('tally')).toBe('2'))
      // `Counted` writes `count`: Tally reads it, and Loose reads what no path names.
      expect(draws()).toEqual({ ...once, Tally: 3, Loose: 3 })
      // A kept drawing still answers its presses.
      press('tally')
      await vi.waitFor(() => expect(text('tally')).toBe('3'))
    } finally {
      handle.dispose()
    }
  })

  it('draws again for a write below the path read, and keeps a sibling of the write', async () => {
    const { draws, handle } = await mount()
    try {
      press('deposited')
      await vi.waitFor(() => expect(text('account')).toBe('ada: 5'))
      // `account.balance` is below `account` and beside `account.owner`.
      expect(draws()).toEqual({ ...once, AccountPanel: 2, Loose: 2 })
    } finally {
      handle.dispose()
    }
  })

  it('draws again for a write above the path read', async () => {
    const { draws, handle } = await mount()
    try {
      press('moved')
      await vi.waitFor(() => expect(text('owner')).toBe('grace'))
      expect(draws()).toEqual({ ...once, AccountPanel: 2, Owner: 2, Loose: 2 })
    } finally {
      handle.dispose()
    }
  })

  it('draws every Surface for a Message with no transition, and keeps them again after', async () => {
    const { draws, handle } = await mount()
    try {
      press('noted')
      await vi.waitFor(() => expect(text('loose')).toBe('a note'))
      expect(draws()).toEqual({ Header: 2, Tally: 2, AccountPanel: 2, Owner: 2, Loose: 2 })
      press('counted')
      await vi.waitFor(() => expect(text('tally')).toBe('1'))
      expect(draws()).toEqual({ Header: 2, Tally: 3, AccountPanel: 2, Owner: 2, Loose: 3 })
    } finally {
      handle.dispose()
    }
  })

  it('draws every Surface on every Message without the writes', async () => {
    const { draws, handle } = await mount({ skip: false })
    try {
      press('counted')
      await vi.waitFor(() => expect(text('tally')).toBe('1'))
      expect(draws()).toEqual({ Header: 2, Tally: 2, AccountPanel: 2, Owner: 2, Loose: 2 })
    } finally {
      handle.dispose()
    }
  })

  it('draws every Surface for a Model no tracked update made, then keeps them again', async () => {
    const { draws, handle } = await mount({ tracked: message => message._tag !== 'Noted' })
    try {
      // Drawn from a Model the writes never saw made: its past is unknown.
      press('noted')
      await vi.waitFor(() =>
        expect(document.getElementById('page')?.dataset['note']).toBe('a note'),
      )
      expect(draws()).toEqual({ Header: 2, Tally: 2, AccountPanel: 2, Owner: 2, Loose: 2 })
      press('counted')
      await vi.waitFor(() => expect(text('tally')).toBe('1'))
      expect(draws()).toEqual({ Header: 2, Tally: 3, AccountPanel: 2, Owner: 2, Loose: 3 })
    } finally {
      handle.dispose()
    }
  })

  it('draws every Surface when a tracked Message follows an untracked one before a frame', async () => {
    const { draws, handle } = await mount({ tracked: message => message._tag !== 'Renamed' })
    try {
      // Both run before the next frame: no view sees the Model the rename made.
      press('renamed')
      press('counted')
      await vi.waitFor(() => expect(text('tally')).toBe('1'))
      // `Counted` does not write `title`, and Header shows the rename all the same.
      expect(text('header')).toBe('Renamed')
      expect(draws()).toEqual({ Header: 2, Tally: 2, AccountPanel: 2, Owner: 2, Loose: 2 })
    } finally {
      handle.dispose()
    }
  })

  it('keeps every drawing through a Message that changes nothing, whatever it is', async () => {
    const { draws, handle } = await mount()
    try {
      // `Ignored` has no transition, and returns the Model it was given.
      press('ignored')
      press('counted')
      await vi.waitFor(() => expect(text('tally')).toBe('1'))
      expect(draws()).toEqual({ ...once, Tally: 2, Loose: 2 })
    } finally {
      handle.dispose()
    }
  })

  it('runs a drawing that throws once, and does not draw it again in its place', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { brokenDraws, handle } = await mount({ broken: true })
    try {
      expect(brokenDraws()).toBe(1)
      press('renamed')
      await vi.waitFor(() => expect(brokenDraws()).toBeGreaterThan(1))
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(brokenDraws()).toBe(2)
    } finally {
      handle.dispose()
      log.mockRestore()
    }
  })

  it('draws on every render while a server renders, which keeps nothing', async () => {
    const serverRender = Symbol.for('foldkit-plus.serverRender')
    const flags = globalThis as Record<symbol, unknown>
    flags[serverRender] = true
    const { draws, handle } = await mount()
    try {
      press('counted')
      await vi.waitFor(() => expect(text('tally')).toBe('1'))
      expect(draws()).toEqual({ Header: 2, Tally: 2, AccountPanel: 2, Owner: 2, Loose: 2 })
    } finally {
      delete flags[serverRender]
      handle.dispose()
    }
  })
})

/**
 * The count of skipped drawings: fifty `Counted` Messages over the five
 * Surfaces, of which Tally reads the count and Loose names no path.
 */
describe('over fifty Messages that write one field', () => {
  const total = async (skip: boolean) => {
    const { draws, handle } = await mount({ skip })
    try {
      for (let sent = 1; sent <= 50; sent++) {
        press('counted')
        await vi.waitFor(() => expect(text('tally')).toBe(String(sent)), { interval: 1 })
      }
      return draws()
    } finally {
      handle.dispose()
      document.body.innerHTML = ''
    }
  }

  it('draws 105 times with the writes and 255 without', async () => {
    expect(await total(true)).toEqual({
      Header: 1,
      Tally: 51,
      AccountPanel: 1,
      Owner: 1,
      Loose: 51,
    })
    expect(await total(false)).toEqual({
      Header: 51,
      Tally: 51,
      AccountPanel: 51,
      Owner: 51,
      Loose: 51,
    })
  }, 20_000)
})
