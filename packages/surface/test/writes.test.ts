// @vitest-environment jsdom
/**
 * `Writes`: a Surface's drawing is kept while no Message since it was made is
 * declared to write a path the Surface reads. The matching is read from
 * `regions()`; the keeping is counted on the real Foldkit runtime, whose lazy
 * slot is what hands a kept drawing back.
 */
import { Option, Schema } from 'effect'
import { inertHtml as h, type HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Metadata, pathsRead, Projection, Surface } from '../src/index.js'
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

  it('reads a Projection composed of an unnamed read as unnamed, and a struct of fields by its paths', () => {
    const title = Projection.struct({ title: App.model.title, owner: App.model.account.owner })
    expect(pathsRead(title)).toEqual(Option.some([['title'], ['account', 'owner']]))
    const loose = Projection.fromReader(Schema.String, (model: Model) => model.note)
    expect(pathsRead(loose)).toEqual(Option.none())
    expect(pathsRead(Projection.struct({ title: App.model.title, loose }))).toEqual(Option.none())
  })

  it('reads a projection nested under a key of `Projection.of` from that key', () => {
    const owner = Projection.fromReader(
      Schema.String,
      (account: Model['account']) => account.owner,
      { dependencies: [['owner']] },
    )
    expect(pathsRead(Projection.of(Model)({ account: owner }))).toEqual(
      Option.some([['account', 'owner']]),
    )
  })

  it('gives the paths a Message is declared to write, and none without a transition', () => {
    expect(writes.declared(Message.Deposited({ amount: 1 }))).toEqual(
      Option.some([['account', 'balance']]),
    )
    expect(writes.declared(Message.Pinged())).toEqual(Option.some([]))
    expect(writes.declared(Message.Noted({ note: 'n' }))).toEqual(Option.none())
  })

  it('tracks per-path epochs via epochFor, advancing on matching writes and untracked Models (#586)', () => {
    const local = Writes.of(App, Declared)
    const tracked = local.track(update)
    const titleEpoch = local.epochFor([['title']])
    const initialEpoch = titleEpoch()
    // Counted writes ['count'], not ['title'] -> epoch unchanged after first tracked Model
    const m1 = tracked(initial, Message.Counted()).model
    const afterFirst = titleEpoch()
    // Second Counted keeps titleEpoch unchanged!
    const m2 = tracked(m1, Message.Counted()).model
    expect(titleEpoch()).toBe(afterFirst)
    // Renamed writes ['title'] -> titleEpoch advances!
    const m3 = tracked(m2, Message.Renamed({ title: 'Next' })).model
    expect(titleEpoch()).toBeGreaterThan(afterFirst)
    // Untracked Model (never seen by track) -> bumps `all` -> titleEpoch advances!
    const beforeUntracked = titleEpoch()
    tracked({ ...m3, count: 99 }, Message.Counted())
    expect(titleEpoch()).toBeGreaterThan(beforeUntracked)
    expect(initialEpoch).toBe(0)
  })
})

it('refuses a transition no Message of the application names', () => {
  const Other = Transition.make({ state: Model, input: Schema.Struct({}), apply: () => [] })
  expect(() =>
    // @ts-expect-error `constructor` is not a Message tag of the application
    Writes.of(App, Machine.make({ state: Model, transitions: { constructor: Other } })),
  ).toThrow('the transition "constructor" is not named by a Message of this application')
})

/** Reads the title, as `Header` does: a second view of it for the tests that break one. */
const Titled = App.surface('Titled', { model: ({ model }) => ({ title: model.title }) })

describe('where there is no runtime frame', () => {
  it('draws every time, since no lazy slot can keep a drawing', () => {
    const writes = Writes.of(App, Declared)
    let draws = 0
    const view = writes.rootView(Titled, undefined, () => {
      draws++
      return null
    })
    view(initial, h)
    view(initial, h)
    expect(draws).toBe(2)
  })

  it('lets a drawing that throws throw, drawn once', () => {
    const writes = Writes.of(App, Declared)
    let draws = 0
    const view = writes.rootView(Titled, undefined, () => {
      draws++
      throw new Error('the drawing broke')
    })
    expect(() => view(initial, h)).toThrow('the drawing broke')
    expect(draws).toBe(1)
  })

  it('isolates started-draw tracking per rootView instance when views nest or run concurrently', () => {
    const first = Writes.of(App, Declared)
    const second = Writes.of(App, Declared)
    let firstDraws = 0
    let secondDraws = 0
    const inner = second.rootView(Titled, undefined, () => {
      secondDraws++
      return h.span([], ['ok'])
    })
    const outer = first.rootView(Titled, undefined, () => {
      firstDraws++
      inner(initial, h)
      throw new Error('outer failed')
    })
    expect(() => outer(initial, h)).toThrow('outer failed')
    expect(firstDraws).toBe(1)
    expect(secondDraws).toBe(1)
  })
})

describe('a Surface whose projection carries metadata', () => {
  // What a planner reads by, as `foldkit-remote` names the rows a read asks for.
  const Asked = Metadata.key<string>('asked', {
    merge: values => values,
    summarize: value => value,
  })
  const Planned = App.surface('Planned', {
    model: () =>
      Projection.fromReader(Schema.String, (model: Model) => model.note, {
        dependencies: [['note']],
        metadata: Asked.of('note'),
      }),
  })

  it('is drawn again by every transition that writes, whatever path it names', () => {
    expect(pathsRead(Planned.projection())).toEqual(Option.some([['note']]))
    const writes = Writes.of(App, Declared)
    writes.rootView(Planned, undefined, (note, h) => h.p([], [note]))
    expect(writes.regions()).toEqual([
      {
        name: 'Planned',
        reads: Option.none(),
        redrawnBy: ['Renamed', 'Counted', 'Deposited', 'Moved', 'Sneaked'],
      },
    ])
  })

  it('reaches Projection.derive over a Remote read and plain store refs when store contracts are registered', () => {
    const remoteRead = Projection.fromReader(Schema.String, (model: Model) => model.note, {
      dependencies: [['note']],
      metadata: Asked.of('note'),
    })
    const DerivedRemote = App.surface('DerivedRemote', {
      model: () =>
        Projection.struct({
          summary: Projection.derive([remoteRead], (model: Model) => `len:${model.note.length}`, {
            Model: Schema.String,
          }),
        }),
    })
    const StoreRef = App.surface('StoreRef', {
      model: ({ model }) => ({ note: model.note }),
    })

    // Without registering the store-owning contract, neither DerivedRemote nor StoreRef
    // carries metadata, so Pinged (declared empty in the machine) would skip them.
    const withoutContract = Writes.of(App, Declared)
    withoutContract.rootView(DerivedRemote, undefined, ({ summary }, h) => h.p([], [summary]))
    withoutContract.rootView(StoreRef, undefined, ({ note }, h) => h.p([], [note]))
    expect(withoutContract.regions().map(region => region.redrawnBy)).toEqual([[], []])

    // Registering the store contract makes its reducer Messages writers of ['note'] in the
    // graph: DerivedRemote, StoreRef, and Planned are all reached by Noted and skipped by Counted.
    const withContract = Writes.of(App, Declared, {
      contracts: [{ messages: ['Noted'], owns: [['note']] }],
    })
    withContract.rootView(DerivedRemote, undefined, ({ summary }, h) => h.p([], [summary]))
    withContract.rootView(StoreRef, undefined, ({ note }, h) => h.p([], [note]))
    withContract.rootView(Planned, undefined, (note, h) => h.p([], [note]))
    expect(withContract.regions()).toEqual([
      { name: 'DerivedRemote', reads: Option.some([['note']]), redrawnBy: ['Noted'] },
      { name: 'StoreRef', reads: Option.some([['note']]), redrawnBy: ['Noted'] },
      { name: 'Planned', reads: Option.some([['note']]), redrawnBy: ['Noted'] },
    ])

    // Registering an UNRELATED contract (owning ['count']) must NOT disable the
    // metadata fallback for Planned (which reads unregistered ['note']).
    const withUnrelated = Writes.of(App, Declared, {
      contracts: [{ messages: ['Counted'], owns: [['count']] }],
    })
    withUnrelated.rootView(Planned, undefined, (note, h) => h.p([], [note]))
    expect(withUnrelated.regions()).toEqual([
      {
        name: 'Planned',
        reads: Option.none(),
        redrawnBy: ['Renamed', 'Counted', 'Deposited', 'Moved', 'Sneaked'],
      },
    ])
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
  const broken = app.writes.rootView(Titled, undefined, (model, h) => {
    brokenDraws++
    if (model.title === 'Renamed') throw new Error('the drawing broke')
    return h.p([], ['whole'])
  })
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

  it('routes plain Surface.rootView through path-skipping while writes.install() is active (#587)', async () => {
    const writes = Writes.of(App, Declared)
    const detach = writes.install()
    let titleDraws = 0
    let countDraws = 0
    const CountSurface = App.surface('CountSurface', {
      model: ({ model }) => ({ count: model.count }),
    })
    const titleView = Surface.rootView(Titled, undefined, (model, h) => {
      titleDraws++
      return h.h1([h.Id('installed-title')], [model.title])
    })
    const countView = Surface.rootView(CountSurface, undefined, (model, h) => {
      countDraws++
      return h.span([h.Id('installed-count')], [String(model.count)])
    })
    const container = document.createElement('div')
    container.id = 'installed'
    document.body.appendChild(container)
    timedFrames()
    const tracked = writes.track(update)
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        init: () => ({ model: initial }),
        update: (model: Model, message: Message) => ({
          model: tracked(model, message).model,
          commands: [],
        }),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.div(
            [],
            [
              titleView(model, h),
              countView(model, h),
              h.button([h.Id('inc'), h.OnClick(Message.Counted())], ['inc']),
            ],
          ),
      }),
    )
    try {
      await vi.waitFor(() => expect(text('installed-count')).toBe('0'))
      press('inc')
      await vi.waitFor(() => expect(text('installed-count')).toBe('1'))
      press('inc')
      await vi.waitFor(() => expect(text('installed-count')).toBe('2'))
      expect(titleDraws).toBe(1)
      expect(countDraws).toBe(3)
    } finally {
      handle.dispose()
      detach()
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
