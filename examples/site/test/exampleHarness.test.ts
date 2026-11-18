/**
 * The harness behind an example module: its state is kept in the gallery's
 * one Model under its key, folded by its own `update`, and handed back to its
 * own `view`; its style is the page's selection of its own recipe, with its
 * pins over it.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import type { Html } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Button, ButtonSlots, Recipes, TagsInputSlots } from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'

import { about } from '../src/gallery/catalogue.js'
import { fromRecipe } from '../src/gallery/define.js'
import { example } from '../src/gallery/example.js'
import * as Examples from '../src/gallery/examplesState.js'
import type { Live } from '../src/gallery/showcase.js'
import { showcaseOf } from '../src/gallery/showcases.js'
import * as Widgets from '../src/gallery/widgets.js'
import { Message, initial, update } from '../src/main.js'

const liveOf = (examples: Examples.Model): Live<string> => ({
  switched: false,
  onSwitch: () => 'switched',
  direction: 'ltr',
  widgets: Widgets.initial,
  onWidget: message => message._tag,
  examples,
  onExample: key => key,
  ready: true,
  h: SlotView.inertBuilder<string>(),
})

const button = Option.getOrThrow(showcaseOf('button'))
const named = (name: string) => button.examples.find(each => each.name === name)!
const pressed = (html: Html) =>
  Inert.byTag(html, 'button').map(each => [Inert.text(each), Inert.value(each, 'aria-pressed')])
const classes = (html: Html) => Inert.classes(Inert.byTag(html, 'button')[0])

describe('an example module on a page', () => {
  it('is drawn from its state in the gallery’s Model, and folds its own Messages there', () => {
    const toggle = named('toggle')
    expect(pressed(toggle.render({}, liveOf(initial.examples)))).toEqual([
      ['Bold', 'true'],
      ['Italic', 'false'],
      ['Underline', 'false'],
    ])
    const next = update(
      initial,
      Message.GotExample({ key: 'button/toggle', message: { _tag: 'Toggled', format: 'Italic' } }),
    ).model
    expect(pressed(toggle.render({}, liveOf(next.examples))).map(([, on]) => on)).toEqual([
      'true',
      'true',
      'false',
    ])
    expect(next.widgets).toBe(initial.widgets)
  })

  it('sends its Messages under its own key', () => {
    const sent: Array<string> = []
    const live = { ...liveOf(initial.examples), onExample: (key: string) => (sent.push(key), key) }
    named('toggle').render({}, live)
    expect(new Set(sent)).toEqual(new Set(['button/toggle']))
  })

  it('leaves the Model alone for a key no example has', () => {
    expect(update(initial, Message.GotExample({ key: 'button/nope', message: {} })).model).toBe(
      initial,
    )
  })

  it('takes the picked values, its pins over them, and a recipe of its own', () => {
    const basic = named('basic')
    const icon = named('icon')
    const live = liveOf(initial.examples)
    expect(classes(basic.render({ tone: 'danger' }, live))).not.toEqual(
      classes(basic.render({}, live)),
    )
    // Pinned neutral: the picked tone does not reach it.
    expect(classes(icon.render({ tone: 'danger' }, live))).toEqual(classes(icon.render({}, live)))
  })

  it('draws an example with the recipe it names, under the page’s picks and its own pin', () => {
    const Wide = Recipes.Button.add({ width: { full: { button: Style.class('wide') } } })
    const wide = example({
      title: 'Wide',
      slots: ButtonSlots,
      recipe: Wide,
      pins: { width: 'full' },
      view: ({ style, h }) => Button.view({ label: 'Go', style }, h),
    })
    const unpinned = example({
      title: 'Not wide',
      slots: ButtonSlots,
      recipe: Wide,
      view: ({ style, h }) => Button.view({ label: 'Go', style }, h),
    })
    const page = fromRecipe(about('button'), ButtonSlots, Recipes.Button, wide, undefined, [
      { name: 'wide', example: wide },
      { name: 'unpinned', example: unpinned },
    ])
    const live = liveOf(initial.examples)
    const [pinned, free] = page.examples.map(each => classes(each.render({}, live)))
    expect(pinned).toContain('wide')
    expect(free).not.toContain('wide')
    // The page's pick reaches the example's own recipe too.
    expect(classes(page.examples[0]!.render({ tone: 'danger' }, live))).not.toEqual(pinned)
    expect(classes(page.preview({}, live))).toEqual(pinned)
  })

  it('says which examples hold state, for the line under their code', () => {
    expect(button.examples.map(each => [each.name, each.code, each.stateful])).toEqual([
      ['basic', 'module', false],
      ['sizes', 'module', false],
      ['icon', 'module', false],
      ['trailing', 'module', false],
      ['description', 'module', false],
      ['mark', 'module', false],
      ['link', 'module', false],
      ['busy', 'module', true],
      ['toggle', 'module', true],
      ['configure', 'module', false],
      ['add', 'module', false],
    ])
    expect(button.states.map(each => each.key)).toEqual(['button/busy', 'button/toggle'])
  })
})

describe('declaring a page', () => {
  const plain = example({
    title: 'Plain',
    slots: ButtonSlots,
    recipe: Recipes.Button,
    view: ({ style, h }) => Button.view({ label: 'Go', style }, h),
  })
  const declare = (entries: Parameters<typeof fromRecipe<typeof ButtonSlots>>[5], card = plain) =>
    fromRecipe(about('button'), ButtonSlots, Recipes.Button, card, undefined, entries)

  it('refuses a pin its example’s recipe lacks', () => {
    const pinned = example({
      title: 'Pinned',
      slots: ButtonSlots,
      recipe: Recipes.Button,
      pins: { tone: 'plaid' },
      view: ({ style, h }) => Button.view({ label: 'Go', style }, h),
    })
    expect(() =>
      declare([
        { name: 'plain', example: plain },
        { name: 'pinned', example: pinned },
      ]),
    ).toThrow("button#pinned pins tone: 'plaid'")
  })

  it('refuses a card its page does not list', () => {
    expect(() => declare([])).toThrow('card is an example its page does not list')
  })

  it('refuses an example of another widget’s slots', () => {
    const other = example({
      title: 'Other',
      slots: TagsInputSlots,
      recipe: Recipes.TagsInput,
      view: ({ h }) => h.div([], []),
    })
    expect(() =>
      fromRecipe<unknown>(about('button'), ButtonSlots, Recipes.Button, plain, undefined, [
        { name: 'plain', example: plain },
        { name: 'other', example: other },
      ]),
    ).toThrow('button#other is an example of another widget’s slots')
  })
})

const Counter = Schema.Struct({ count: Schema.Number })
const Count = defineMessageUnion({ Added: { by: Schema.Number }, Idled: {} })
type Count = typeof Count.Type
const Later = Command.define('Later', {
  messages: [Count.Added],
  execute: Effect.succeed(Count.Added({ by: 10 })),
})

const counting = (start: number) =>
  example({
    title: 'Counter',
    slots: ButtonSlots,
    recipe: Recipes.Button,
    state: {
      Model: Counter,
      Message: Count,
      init: () => ({ model: { count: start } }),
      update: (model, message) =>
        Count.match(message, {
          Added: ({ by }) => ({ model: { count: model.count + by }, commands: [Later()] }),
          Idled: () => ({ model }),
        }),
      subscriptions: Subscription.make<typeof Counter.Type, Count>()(entry => ({
        tick: entry(
          { count: Schema.Number },
          {
            modelToDependencies: model => ({ count: model.count }),
            dependenciesToStream: ({ count }) => Stream.succeed(Count.Added({ by: count })),
          },
        ),
      })),
    },
    view: ({ h }) => h.div([], []),
  })

describe('the examples’ one Model', () => {
  const stateOf = (start: number) => Option.getOrThrow(counting(start).state)
  const all = Examples.over([
    { slug: 'one', key: 'one/a', state: stateOf(1) },
    { slug: 'two', key: 'two/a', state: stateOf(5) },
  ])
  const wrap = (message: Examples.Message) => message

  it('starts each example from its own `init`, under its key', () => {
    expect(all.initial).toEqual({ 'one/a': { count: 1 }, 'two/a': { count: 5 } })
  })

  it('folds a Message into its example alone, and wraps its Commands under the same key', async () => {
    const step = all.update(all.initial, { key: 'two/a', message: Count.Added({ by: 2 }) }, wrap)
    expect(step.model).toEqual({ 'one/a': { count: 1 }, 'two/a': { count: 7 } })
    expect(step.model['one/a']).toBe(all.initial['one/a'])
    const [command] = step.commands ?? []
    expect(await Effect.runPromise(command!.effect)).toEqual({
      key: 'two/a',
      message: Count.Added({ by: 10 }),
    })
  })

  it('returns the Model it was given when the example changes nothing', () => {
    expect(all.update(all.initial, { key: 'one/a', message: Count.Idled() }, wrap).model).toBe(
      all.initial,
    )
  })

  it('refuses two examples under one key', () => {
    expect(() =>
      Examples.over([
        { slug: 'one', key: 'one/a', state: stateOf(1) },
        { slug: 'one', key: 'one/a', state: stateOf(2) },
      ]),
    ).toThrow('two examples share a key')
  })

  it('runs an example’s Subscriptions under its key, on its own page only', () => {
    const subscriptions = all.subscriptions<{ readonly page: string }, Examples.Message>({
      read: () => all.initial,
      onPage: (parent, slug) => parent.page === slug,
      toParent: wrap,
    })
    expect(Object.keys(subscriptions)).toEqual(['one/a:tick', 'two/a:tick'])
    const entry = subscriptions['two/a:tick']!
    expect(entry.modelToDependencies({ page: 'two' })).toEqual({
      maybeDependencies: Option.some({ count: 5 }),
    })
    expect(entry.modelToDependencies({ page: 'one' })).toEqual({
      maybeDependencies: Option.none(),
    })
  })

  it('refuses a state that starts with a Command: a served page could not run it', () => {
    expect(() =>
      example({
        title: 'Eager',
        slots: ButtonSlots,
        recipe: Recipes.Button,
        state: {
          Model: Counter,
          Message: Count,
          init: () => ({ model: { count: 0 }, commands: [Later()] }),
          update: model => ({ model }),
        },
        view: ({ h }) => h.div([], []),
      }),
    ).toThrow('starts with a Command')
  })
})
