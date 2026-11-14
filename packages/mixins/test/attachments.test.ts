// @vitest-environment jsdom
/**
 * What a view remembers of each attachment (its kind, what it requires and
 * supplies, per slot), `detach` and `replace`, the contributors an ownership
 * conflict names, and a child attribute's Mount composed with the rest (#531).
 */
import { Effect, Stream } from 'effect'
import { liveViewStateChanges, type MountAction } from 'foldkit/mount'
import { describe, expect, it } from 'vitest'
import {
  Attr,
  Attributes,
  Behavior,
  Event,
  Mixin,
  Resolver,
  SlotView,
  Style,
  type Diagnostic,
} from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'
import { FieldSlots } from './fixture.js'
import { fakeChild, h, mount, type TestMessage } from './resolverFixture.js'

interface FieldInput {
  readonly invalid: boolean
}

const Field = SlotView.over(FieldSlots)<FieldInput, TestMessage>()
const FieldView = Field.define((input, slots, h) =>
  h.div(slots.root.attrs(), [h.input(slots.input.attrs())]),
)

const Validates = Field.behavior(
  {
    input: {
      requires: { events: [Event.Input], attributes: [Attr.AriaInvalid] },
      attributes: ({ input, h }) => [h.AriaInvalid(input.invalid)],
    },
    label: { requires: { events: [] } },
  },
  { name: 'Validates' },
)

const diagnosticOf = (run: () => unknown): Diagnostic => {
  try {
    run()
  } catch (error) {
    if (error instanceof DiagnosticError) return error.diagnostic
    throw error
  }
  throw new Error('expected a DiagnosticError')
}

/** A Behavior named `name` that sets `click` on the root. */
const clicks = (name: string) =>
  Field.behavior({ root: { attributes: ({ h }) => [h.OnClick({ _tag: 'Clicked' })] } }, { name })

const names = (view: {
  readonly mixins: ReadonlyArray<{ readonly name: string }>
}): ReadonlyArray<string> => view.mixins.map(mixin => mixin.name)

const rootOf = (view: SlotView.SlotView<typeof FieldSlots, FieldInput, TestMessage>) =>
  SlotView.buildersFor(view.slots, view.mixins, { input: { invalid: false }, h }).root.attrs()

describe('what a view remembers of an attachment', () => {
  it('keeps a Behavior per slot: what it requires, supplies and reads', () => {
    const attached = FieldView.pipe(Behavior.attach(Validates))
    expect(attached.mixins[0]?.meta).toEqual({
      kind: 'behavior',
      slots: {
        input: {
          requires: { events: ['input'], attributes: ['aria-invalid'] },
          provides: [],
          reads: 'input',
        },
        label: { requires: { events: [], attributes: [] }, provides: [], reads: 'static' },
      },
    })
  })

  it('keeps a Style as asking nothing, and whether each piece reads the input', () => {
    const Look = Style.forSlots(FieldSlots)(
      {
        root: { display: 'grid' },
        input: Style.whenInput((input: FieldInput) => input.invalid, { color: 'red' }),
      },
      { name: 'Look' },
    )
    const nothing = { requires: { events: [], attributes: [] }, provides: [] }
    expect(Look.mixin.meta).toEqual({
      kind: 'style',
      slots: { root: { ...nothing, reads: 'static' }, input: { ...nothing, reads: 'input' } },
    })
  })

  it('knows nothing of a made Mixin, and keeps the parts of a composition in order', () => {
    const Made = Mixin.make<TestMessage>('Made', { root: { classes: ['made'] } })
    expect(Made.meta).toBeUndefined()
    expect(Mixin.compose<TestMessage>(Validates.mixin, Made).meta).toEqual({
      kind: 'mixin',
      slots: {},
      parts: [{ name: 'Validates', meta: Validates.mixin.meta }, { name: 'Made' }],
    })
  })

  it('is plain data', () => {
    const meta = Validates.mixin.meta
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta)
    expect(Object.isFrozen(meta?.slots.input?.requires.events)).toBe(true)
  })
})

describe('detach and replace', () => {
  const view = FieldView.pipe(
    Behavior.attach(clicks('A')),
    Behavior.attach(Validates),
    Behavior.attach(clicks('C')),
  )

  it('detach takes out the one named, and leaves the others in order', () => {
    expect(names(view.pipe(SlotView.detach('Validates')))).toEqual(['A', 'C'])
    expect(names(view)).toEqual(['A', 'Validates', 'C'])
  })

  it('replace puts the new Mixin in the old one’s place', () => {
    const Other = Field.behavior({}, { name: 'Other' })
    expect(names(view.pipe(SlotView.replace('Validates', Other.mixin)))).toEqual([
      'A',
      'Other',
      'C',
    ])
  })

  it('a detached Behavior no longer resolves', () => {
    expect(() => rootOf(view)).toThrow(DiagnosticError)
    expect(Attributes.find(rootOf(view.pipe(SlotView.detach('C'))), 'OnClick')).toBeDefined()
  })

  it.each([
    ['detach', SlotView.detach('Nope')],
    ['replace', SlotView.replace('Nope', Validates.mixin)],
  ])('%s refuses a name the view does not hold', (_, transform) => {
    expect(diagnosticOf(() => transform(view))).toMatchObject({
      code: 'mixins:unknown-attachment',
      details: { name: 'Nope' },
    })
  })

  it.each([
    ['detach', SlotView.detach('A')],
    ['replace', SlotView.replace('A', Validates.mixin)],
  ])('%s refuses a name the view holds twice', (_, transform) => {
    const twice = FieldView.pipe(
      Behavior.attach(clicks('A')),
      Style.attach(Style.forSlots(FieldSlots)({}, { name: 'A' })),
    )
    expect(diagnosticOf(() => transform(twice))).toMatchObject({
      code: 'mixins:ambiguous-attachment',
      details: { name: 'A', count: 2 },
    })
  })
})

describe('an ownership conflict names both contributors', () => {
  it('two Behaviors on one event', () => {
    const view = FieldView.pipe(Behavior.attach(clicks('Opens')), Behavior.attach(clicks('Clears')))
    const diagnostic = diagnosticOf(() => rootOf(view))
    expect(diagnostic).toMatchObject({
      code: 'mixins:event-conflict',
      details: { event: 'click', contributors: ['Opens', 'Clears'] },
    })
    expect(diagnostic.message).toBe(
      'two owners for event "click": "Opens" already owns it through "OnClick", and "Clears" claims it through "OnClick"',
    )
  })

  it.each([
    [
      'the view and a Behavior on an attribute',
      [h.Role('group')],
      [{ source: 'Roles', attributes: [h.Role('list')] }],
      'mixins:attribute-conflict',
      ['the view', 'Roles'],
    ],
    [
      'two Behaviors on a style property',
      [],
      [
        { source: 'Pins', attributes: [h.Style({ top: '0' })] },
        { source: 'Moves', attributes: [h.Style({ inset: '1px' })] },
      ],
      'mixins:style-property-conflict',
      ['Pins', 'Moves'],
    ],
    [
      'the view and a Behavior on a Mount name',
      [h.OnMount(mount('Measure'))],
      [{ source: 'Measures', mounts: [mount('Measure')] }],
      'mixins:duplicate-mount-name',
      ['the view', 'Measures'],
    ],
    [
      'an unnamed contribution',
      [h.OnClick({ _tag: 'Clicked' })],
      [{ attributes: [h.OnClick({ _tag: 'Other' })] }],
      'mixins:event-conflict',
      ['the view', 'a Mixin'],
    ],
  ] as const)('%s', (_, base, contributions, code, contributors) => {
    const diagnostic = diagnosticOf(() => Resolver.resolve<TestMessage>(base, contributions))
    expect(diagnostic).toMatchObject({ code, details: { contributors } })
    for (const contributor of contributors) expect(diagnostic.message).toContain(contributor)
  })
})

describe('a child attribute’s Mount (#531)', () => {
  const run = <A>(stream: Stream.Stream<A, unknown>) =>
    Effect.runPromise(Stream.runCollect(stream).pipe(Effect.map(chunk => Array.from(chunk))))

  const emits = (name: string, tag: TestMessage['_tag']): MountAction<TestMessage> => ({
    name,
    f: () => Stream.succeed({ _tag: tag }),
  })

  it.each([
    [
      'the view',
      (child: ReturnType<typeof fakeChild>) =>
        [[child], [{ mounts: [emits('B', 'Clicked')] }]] as const,
    ],
    [
      'a Mixin',
      (child: ReturnType<typeof fakeChild>) =>
        [[], [{ attributes: [child], mounts: [emits('B', 'Clicked')] }]] as const,
    ],
  ])(
    'given by %s joins the slot’s one OnMount, and sends through its own boundary',
    async (_, given) => {
      const sent: Array<unknown> = []
      const child = {
        ...fakeChild(h.OnMount(emits('A', 'Other'))),
        resolveMountDispatch: {
          owner: 'Live',
          resolve: () => (message: unknown) => sent.push(message),
        },
      } as ReturnType<typeof fakeChild>
      const [base, contributions] = given(child)
      const attributes = Resolver.resolve<TestMessage>(base, contributions, { slot: 'root' })
      expect(attributes).toHaveLength(1)
      const composed = Attributes.find(attributes, 'OnMount')!.action
      expect(composed.name).toBe('Mixins[root](A,B)')
      expect(await run(composed.f(document.createElement('div'), liveViewStateChanges))).toEqual([
        { _tag: 'Clicked' },
      ])
      expect(sent).toEqual([{ _tag: 'Other' }])
    },
  )

  it('alone, is drawn as it was given', () => {
    const child = fakeChild(h.OnMount(mount('A')))
    expect(Resolver.resolve<TestMessage>([child], [])).toEqual([child])
  })
})
