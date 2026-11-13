import { Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Action, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  A11y,
  Assembly,
  Behavior,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  Style,
} from '../src/index.js'
import * as Mixin from '../src/mixin.js'
import { type TestMessage } from './resolverFixture.js'

const Fields = Slots.define({
  button: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  secret: Slot.make({ capability: Capability.Container, hidden: true }),
})
type Input = { readonly label: string }

const clicked = (): TestMessage => ({ _tag: 'Clicked' })

const First = Behavior.forSlots(Fields)<Input, TestMessage>(
  {
    button: Behavior.slot({
      attributes: ({ input, h }) => [h.AriaLabel(input.label), h.OnClick(clicked())],
    }),
  },
  { name: 'First' },
)
const Second = Behavior.forSlots(Fields)<Input, TestMessage>(
  {
    button: Behavior.slot({
      attributes: ({ h }) => [h.AriaLabel('SECRET-OTHER'), h.OnClick(clicked())],
    }),
  },
  { name: 'Second' },
)

let mounted = 0
const Watching = Behavior.forSlots(Fields)<Input, TestMessage>(
  {
    button: Behavior.slot({
      mount: () => {
        mounted += 1
        return { name: 'Watch', f: () => Stream.empty }
      },
    }),
  },
  { name: 'Watching' },
)

const view = SlotView.forMessages<TestMessage>()
  .define(Fields, (_input: Input, slots, h) => h.button(slots.button.attrs(), ['Go']))
  .pipe(Behavior.attach(First), Behavior.attach(Watching))

const Message = defineMessageUnion({ Cleared: {} })
const Model = Schema.Struct({ title: Schema.String })
const App = Surface.application({ Model, Message })
const Detail = App.surface('TodoDetail', {
  model: ({ model }) => ({ title: model.title }),
  messages: [Message.Cleared],
})
const clear = Action.define({
  name: 'clearSearch',
  description: 'SECRET-DESC',
  input: Schema.String,
  toMessage: () => {
    throw new Error('ran')
  },
})

describe('Assembly', () => {
  it('lists public slots and attachment order, and leaves a dynamic claim unknown', () => {
    const described = Assembly.describe({
      name: 'Go',
      view,
      behaviors: [First, Second, Watching],
    })
    expect(described.slots.map(slot => slot.name)).toEqual(['button'])
    expect(described.attachments.map(attachment => attachment.name)).toEqual(['First', 'Watching'])
    expect(described.attachments[0]?.slots[0]).toMatchObject({
      slot: 'button',
      reads: 'unknown',
      events: 'unknown',
    })
    const text = Assembly.textOf(described)
    expect(text).toContain('attachment 0 behavior First')
    expect(text).toContain('attachment 1 behavior Watching')
  })

  it('names both owners of one event once input resolves the attributes', () => {
    const replaced = view.pipe(Behavior.attach(Second))
    const unresolved = Assembly.describe({
      name: 'Go',
      view: replaced,
      behaviors: [First, Second, Watching],
    })
    expect(unresolved.conflicts).toEqual([])
    expect(unresolved.attachments[0]?.slots[0]?.events).toBe('unknown')
    const described = Assembly.describe({
      name: 'Go',
      view: replaced,
      behaviors: [First, Second, Watching],
      input: { label: 'SECRET-LABEL' },
    })
    expect(described.conflicts).toEqual([
      {
        code: 'mixins:event-conflict',
        slot: 'button',
        name: 'click',
        contributors: ['First', 'Second'],
      },
      {
        code: 'mixins:attribute-conflict',
        slot: 'button',
        name: 'arialabel',
        contributors: ['First', 'Second'],
      },
    ])
    expect(described.attachments[0]?.slots[0]?.events).toEqual(['click'])
    expect(described.attachments[0]?.slots[0]?.attributes).toEqual(['arialabel'])
    const text = Assembly.textOf(described)
    expect(text).toContain('conflict button click First Second')
    expect(text).toContain('conflict button arialabel First Second')
    expect(text).not.toContain('SECRET-LABEL')
    expect(text).not.toContain('SECRET-OTHER')
    expect(JSON.stringify(described)).not.toContain('SECRET-LABEL')
    expect(JSON.stringify(described)).not.toContain('SECRET-OTHER')
    expect(view.mixins).toHaveLength(2)
    expect(mounted).toBe(0)
  })

  it('keeps Surface and Action identities and drops everything else they carry', () => {
    const contract = Surface.contract(Detail)
    const described = Assembly.describe({
      name: 'Go',
      view,
      behaviors: [First],
      links: [contract, clear],
    })
    expect(described.links).toEqual([
      { kind: 'surface', name: contract.name },
      { kind: 'action', name: 'clearSearch' },
    ])
    expect(JSON.stringify(described)).not.toContain('SECRET-DESC')
    expect(Assembly.textOf(described)).toContain('link surface TodoDetail')
    expect(Assembly.textOf(described)).toContain('link action clearSearch')
  })

  it('does not draw the view or open a mixin whose behavior was not passed', () => {
    let drawn = 0
    let opened = 0
    const closed = SlotView.forMessages<TestMessage>()
      .define(Fields, () => {
        drawn += 1
        throw new Error('drawn')
      })
      .pipe(
        SlotView.attach(
          Mixin.dynamic('Closed', {
            button: () => {
              opened += 1
              return {}
            },
          }),
        ),
      )
    const described = Assembly.describe({ name: 'Closed', view: closed })
    expect(described.attachments[0]).toMatchObject({
      name: 'Closed',
      kind: 'mixin',
      slots: [{ slot: 'button', events: 'unknown', mount: 'unknown' }],
    })
    expect(drawn).toBe(0)
    expect(opened).toBe(0)
  })

  it('reports a pattern obligation and a missing slot from the same description', () => {
    const described = Assembly.describe({
      name: 'Go',
      view,
      behaviors: [First],
      pattern: {
        name: 'button',
        pattern: A11y.pattern({
          button: { capability: Capability.Interactive, events: [Event.Click] },
          missing: { capability: Capability.Container },
        }),
      },
    })
    expect(described.obligations.map(item => `${item.pattern} ${item.slot}`)).toEqual([
      'button button',
      'button missing',
    ])
    expect(described.patternDiagnostics.map(item => item.code)).toContain('a11y:missing-slot')
    const text = Assembly.textOf(described)
    expect(text).toContain('obligation button missing')
    expect(text).toContain('diagnostic a11y:missing-slot missing')
  })

  it('orders a part style before its behavior when there is no view', () => {
    const Look = Style.forSlots(Fields)({ button: Style.class('go') }, { name: 'Look' })
    const described = Assembly.describe({
      name: 'Go',
      slots: Fields,
      styles: [Look],
      behaviors: [First],
    })
    expect(
      described.attachments.map(attachment => [attachment.order, attachment.kind, attachment.name]),
    ).toEqual([
      [0, 'style', 'Look'],
      [1, 'behavior', 'First'],
    ])
    expect(described.attachments[1]?.slots[0]?.events).toBe('unknown')
  })
})
