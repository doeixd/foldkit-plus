// @vitest-environment jsdom
/**
 * `SlotView.describe` and `SlotView.resolution`: a static, serializable
 * account of an assembled view, and of what one input resolves to, with names
 * and owners and never a value.
 */
import { Effect, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { DRAWN_CLASSES } from '../src/inject.js'
import { A11y, Attr, Behavior, Event, Mixin, SlotView, Style } from '../src/index.js'
import { Clears, Listbox, Named, Nav, Picks, bare } from './a11y.fixture.js'
import { FieldSlots } from './fixture.js'
import { type TestMessage } from './resolverFixture.js'

interface FieldInput {
  readonly invalid: boolean
  readonly value: string
}

const Field = SlotView.over(FieldSlots)<FieldInput, TestMessage>()
const FieldView = Field.define(
  (input, slots, h) => h.div(slots.root.attrs(), [h.input(slots.input.attrs())]),
  { name: 'Field' },
)

const Validates = Field.behavior(
  {
    input: {
      requires: { events: [Event.Input], attributes: [Attr.AriaInvalid] },
      attributes: ({ input, h }) => [h.AriaInvalid(input.invalid)],
    },
  },
  { name: 'Validates' },
)

const Look = Style.forSlots(FieldSlots)({ root: Style.class('field') }, { name: 'Look' })

const assembled = FieldView.pipe(Style.attach(Look), Behavior.attach(Validates))

/** A Behavior named `name` that sets `click` on the root. */
const clicks = (name: string) =>
  Field.behavior({ root: { attributes: ({ h }) => [h.OnClick({ _tag: 'Clicked' })] } }, { name })

const SECRET = 'hunter2-the-secret'

describe('SlotView.describe', () => {
  it('lists each attachment in order with what it requires and contributes', () => {
    const description = SlotView.describe(assembled)
    expect(description.name).toBe('Field')
    expect(Object.keys(description.slots)).toEqual(['root', 'label', 'input', 'internals'])
    expect(description.attachments).toEqual([
      {
        order: 0,
        name: 'Look',
        kind: 'style',
        slots: {
          root: {
            requires: { capability: null, events: [], attributes: [] },
            provides: [],
            contributes: { classes: ['field'], mounts: [] },
          },
        },
      },
      {
        order: 1,
        name: 'Validates',
        kind: 'behavior',
        slots: {
          input: {
            requires: { capability: null, events: ['input'], attributes: ['aria-invalid'] },
            provides: [],
            contributes: 'unknown',
          },
        },
      },
    ])
    expect(description.findings).toEqual([])
  })

  it('reads a contribution that is a function of the input as unknown, and never calls it', () => {
    const called = vi.fn(() => ({ classes: ['x'] }))
    const view = FieldView.pipe(SlotView.attach(Mixin.dynamic<never>('Reads', { root: called })))
    expect(SlotView.describe(view).attachments[0]?.slots.root?.contributes).toBe('unknown')
    expect(called).not.toHaveBeenCalled()
  })

  it('names the Mounts a static contribution gives, and runs none', () => {
    const run = vi.fn(() => Stream.empty)
    const view = FieldView.pipe(
      SlotView.attach(
        Mixin.make<TestMessage>('Mounts', { root: { mounts: [{ name: 'Watch', f: run }] } }),
      ),
    )
    expect(SlotView.describe(view).attachments[0]?.slots.root?.contributes).toEqual({
      classes: [],
      mounts: ['Watch'],
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('keeps what a composition’s parts declare', () => {
    const view = FieldView.pipe(
      SlotView.attach(Mixin.compose<TestMessage>(Validates.mixin, Look.mixin)),
    )
    const [composed] = SlotView.describe(view).attachments
    expect(composed?.kind).toBe('mixin')
    expect(composed?.slots.input?.requires).toEqual({
      capability: null,
      events: ['input'],
      attributes: ['aria-invalid'],
    })
    expect(composed?.slots.root?.contributes).toEqual({ classes: ['field'], mounts: [] })
    expect(composed?.slots.input?.contributes).toBe('unknown')
  })

  it('reports the pattern a conformed view was checked against, and nothing for one never conformed', () => {
    const listbox = bare.pipe(
      Behavior.attach(Nav),
      Behavior.attach(Picks),
      SlotView.attach(Named),
      A11y.conform(Listbox),
    )
    expect(SlotView.describe(bare).conforms).toEqual([])
    expect(SlotView.describe(listbox).conforms).toEqual([
      {
        slots: {
          listbox: { capability: 'Interactive', obligations: ['navigation', 'name'] },
          option: {
            capability: 'Focusable',
            obligations: ['focus-strategy', 'activation', 'state:aria-selected'],
          },
        },
      },
    ])
    // An attachment that leaves the view conforming keeps the report.
    expect(SlotView.describe(listbox.pipe(Behavior.attach(Clears))).conforms).toHaveLength(1)
  })

  it('survives a JSON round trip', () => {
    const description = SlotView.describe(assembled)
    expect(JSON.parse(JSON.stringify(description))).toEqual(description)
  })

  it('changes when a Behavior is removed, and leaves the first view’s description alone', () => {
    const before = JSON.stringify(SlotView.describe(assembled))
    const without = assembled.pipe(SlotView.detach('Validates'))
    expect(SlotView.describe(without).attachments.map(attachment => attachment.name)).toEqual([
      'Look',
    ])
    expect(JSON.stringify(SlotView.describe(without))).not.toBe(before)
    expect(JSON.stringify(SlotView.describe(assembled))).toBe(before)
  })

  it('reports where each attachment resolves, which is no identity', () => {
    const view = FieldView.pipe(
      Behavior.attach(clicks('A')),
      Behavior.attach(Validates),
      Behavior.attach(clicks('C')),
    )
    const described = SlotView.describe(view).attachments
    expect(described.map(({ order, name }) => [order, name])).toEqual([
      [0, 'A'],
      [1, 'Validates'],
      [2, 'C'],
    ])
    const reordered = SlotView.describe(view.pipe(SlotView.detach('A'))).attachments
    expect(reordered.map(({ order, name }) => [order, name])).toEqual([
      [0, 'Validates'],
      [1, 'C'],
    ])
  })

  it('warns of an unnamed attachment and of two with one name', () => {
    const view = FieldView.pipe(
      SlotView.attach(Mixin.make<never>('', { root: { classes: ['a'] } })),
      Behavior.attach(clicks('Twin')),
      Behavior.attach(Field.behavior({ label: {} }, { name: 'Twin' })),
    )
    expect(SlotView.describe(view).findings.map(({ code, severity }) => [code, severity])).toEqual([
      ['mixins:unnamed-attachment', 'warning'],
      ['mixins:ambiguous-attachment', 'warning'],
    ])
  })
})

describe('SlotView.resolution', () => {
  const secretive = Field.behavior(
    {
      input: {
        attributes: ({ input, h }) => [
          h.Value(input.value),
          h.DataAttribute('echo', input.value),
          h.Style({ '--typed': input.value }),
        ],
      },
    },
    { name: 'Secretive' },
  )

  it('reports names and owners, and no value', () => {
    const spyHandler = vi.fn(() => ({ _tag: 'Clicked' as const }))
    const spyMount = vi.fn(() => Stream.empty)
    const Wired = Field.behavior(
      {
        input: {
          attributes: ({ h }) => [h.OnInput(spyHandler)],
          mount: input => ({ name: 'Track', args: { typed: input.value }, f: spyMount }),
        },
      },
      { name: 'Wired' },
    )
    const view = FieldView.pipe(
      Style.attach(Look),
      Style.attach(
        Style.forSlots(FieldSlots)(
          { input: Style.whenInput((input: FieldInput) => input.invalid, { color: SECRET }) },
          { name: 'Danger' },
        ),
      ),
      Behavior.attach(secretive),
      Behavior.attach(Wired),
    )
    const result = SlotView.resolution(view, { invalid: true, value: SECRET })

    expect(JSON.stringify(result)).not.toContain(SECRET)
    expect(result.slots.root).toEqual({
      classes: [{ name: 'field', owner: 'Look' }],
      style: [],
      attributes: [],
      events: [],
      mounts: [],
    })
    expect(result.slots.input?.attributes).toEqual([
      { name: 'value', owner: 'Secretive' },
      { name: 'dataecho', owner: 'Secretive' },
    ])
    expect(result.slots.input?.events).toEqual([{ name: 'input', owner: 'Wired' }])
    expect(result.slots.input?.mounts).toEqual([{ name: 'Track', owner: 'Wired' }])
    expect(result.slots.input?.style).toEqual([{ name: '--typed', owner: 'Secretive' }])
    expect(result.slots.input?.classes.map(({ owner }) => owner)).toEqual(['Danger'])
    expect(result.findings).toEqual([])
    expect(spyHandler).not.toHaveBeenCalled()
    expect(spyMount).not.toHaveBeenCalled()
  })

  it('runs no Mount and calls no handler, even one that would fail', () => {
    const Boom = Field.behavior(
      {
        root: {
          attributes: ({ h }) => [
            h.OnClick({ _tag: 'Clicked' }),
            h.OnKeyDown(() => {
              throw new Error('a handler ran')
            }),
          ],
          mount: () => ({
            name: 'Boom',
            f: () =>
              Stream.fromEffect(
                Effect.sync(() => {
                  throw new Error('a Mount ran')
                }),
              ),
          }),
        },
      },
      { name: 'Boom' },
    )
    expect(() =>
      SlotView.resolution(FieldView.pipe(Behavior.attach(Boom)), { invalid: false, value: '' }),
    ).not.toThrow()
  })

  it('returns a conflict as a finding naming both contributors, where resolve would throw', () => {
    const view = FieldView.pipe(Behavior.attach(clicks('First')), Behavior.attach(clicks('Second')))
    const result = SlotView.resolution(view, { invalid: false, value: '' })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      code: 'mixins:event-conflict',
      slot: 'root',
      details: { event: 'click', contributors: ['First', 'Second'] },
    })
    expect(result.slots.root?.events).toEqual([{ name: 'click', owner: 'First' }])
  })

  it("leaves a server render's drawn-class collector as it was", () => {
    const view = FieldView.pipe(
      SlotView.attach(Mixin.make<never>('Drawn', { root: { classes: ['style-describe-probe'] } })),
    )
    const collector = new Set<string>()
    const global = globalThis as Record<symbol, unknown>
    global[DRAWN_CLASSES] = collector
    try {
      SlotView.resolution(view, { invalid: false, value: '' })
      expect([...collector]).toEqual([])
      expect(global[DRAWN_CLASSES]).toBe(collector)
    } finally {
      delete global[DRAWN_CLASSES]
    }
  })

  it('is plain data', () => {
    const result = SlotView.resolution(assembled, { invalid: true, value: SECRET })
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})

describe('SlotView.toMarkdown', () => {
  it('renders a description deterministically, naming each attachment', () => {
    const markdown = SlotView.toMarkdown(SlotView.describe(assembled))
    expect(SlotView.toMarkdown(SlotView.describe(assembled))).toBe(markdown)
    expect(markdown).toContain('- `input` — TextInput (events: input, focus, blur)')
    expect(markdown).toContain('1. `Look` (style)')
    expect(markdown).toContain('   - `root`: classes `field`')
    expect(markdown).toContain(
      '   - `input`: requires events input; attributes aria-invalid; depends on the input',
    )
  })
})
