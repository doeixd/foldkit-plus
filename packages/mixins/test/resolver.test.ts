import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import type { Attribute } from 'foldkit/html'
import { Attr, Attributes, Event, Resolver, Slot, type SlotAttributes } from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'
import { fakeChild, h, mount, type TestMessage } from './resolverFixture.js'

const tagOf = <Message>(attribute: SlotAttributes<Message>[number]): string =>
  Attributes.tagOf(attribute) ?? 'Child'

const tags = <Message>(attributes: SlotAttributes<Message>): ReadonlyArray<string> =>
  attributes.map(tagOf)

const classOf = <Message>(attributes: SlotAttributes<Message>): unknown =>
  Attributes.find(attributes, 'Class')?.value

const styleOf = <Message>(attributes: SlotAttributes<Message>): unknown =>
  Attributes.find(attributes, 'Style')?.value

const mountNames = <Message>(attributes: SlotAttributes<Message>): ReadonlyArray<string> =>
  Attributes.filter(attributes, 'OnMount').map(attribute => attribute.action.name)

const codeOf = (f: () => unknown): string => {
  try {
    f()
  } catch (error) {
    if (error instanceof DiagnosticError) return error.diagnostic.code
    throw error
  }
  throw new Error('expected resolve to throw')
}

// Foldkit's `Prop` constructor is not a runtime export of `foldkit/html` here.
const prop = (key: string, value: unknown): Attribute<TestMessage> =>
  ({ _tag: 'Prop', key, value }) as unknown as Attribute<TestMessage>

const customEvent = (name: string): Attribute<TestMessage> =>
  ({
    _tag: 'OnCustomEvent',
    name,
    f: () => Option.some({ _tag: 'Clicked' }),
  }) as Attribute<TestMessage>

describe('Resolver.resolve', () => {
  it('adds and deduplicates class tokens, emitting one Class', () => {
    const out = Resolver.resolve([h.Class('a b'), h.Class('b c')], [{ classes: ['c', 'd'] }])
    expect(classOf(out)).toBe('a b c d')
    expect(out.filter(attribute => tagOf(attribute) === 'Class')).toHaveLength(1)
  })

  it('gives a style property one owner between a Behavior and anything else', () => {
    const behaviorStyle = { attributes: [h.Style({ position: 'absolute', top: '4px' })] }
    // A Behavior may set a property nothing else set.
    expect(styleOf(Resolver.resolve([], [behaviorStyle]))).toEqual({
      position: 'absolute',
      top: '4px',
    })
    // A Style piece may not overwrite it, in either order.
    expect(codeOf(() => Resolver.resolve([], [behaviorStyle, { style: { top: '0' } }]))).toBe(
      'mixins:style-property-conflict',
    )
    expect(codeOf(() => Resolver.resolve([], [{ style: { top: '0' } }, behaviorStyle]))).toBe(
      'mixins:style-property-conflict',
    )
    // Nor may the view's own base, or a second Behavior.
    expect(codeOf(() => Resolver.resolve([h.Style({ top: '0' })], [behaviorStyle]))).toBe(
      'mixins:style-property-conflict',
    )
    expect(
      codeOf(() =>
        Resolver.resolve([], [behaviorStyle, { attributes: [h.Style({ position: 'fixed' })] }]),
      ),
    ).toBe('mixins:style-property-conflict')
    // Different properties from both channels coexist.
    expect(styleOf(Resolver.resolve([], [behaviorStyle, { style: { color: 'red' } }]))).toEqual({
      position: 'absolute',
      top: '4px',
      color: 'red',
    })
  })

  it('merges inline style per property in attachment order, emitting one Style', () => {
    const out = Resolver.resolve(
      [h.Style({ color: 'red', padding: '1px' })],
      [{ style: { color: 'blue' } }, { style: { padding: '2px' } }],
    )
    expect(styleOf(out)).toEqual({ color: 'blue', padding: '2px' })
    expect(out.filter(attribute => tagOf(attribute) === 'Style')).toHaveLength(1)
  })

  it('lets a Mixin add an unowned scalar attribute', () => {
    const out = Resolver.resolve([h.Role('button')], [{ attributes: [h.AriaDisabled(true)] }])
    expect(tags(out)).toEqual(['Role', 'AriaDisabled'])
  })

  it('rejects a Mixin that replaces a base scalar attribute', () => {
    expect(
      codeOf(() => Resolver.resolve([h.Role('button')], [{ attributes: [h.Role('link')] }])),
    ).toBe('mixins:attribute-conflict')
  })

  it('rejects two owners of one semantic event', () => {
    expect(
      codeOf(() =>
        Resolver.resolve(
          [h.OnClick({ _tag: 'Clicked' })],
          [{ attributes: [h.OnClick({ _tag: 'Other' })] }],
        ),
      ),
    ).toBe('mixins:event-conflict')
  })

  it('keeps before-input apart from input: they are two DOM events', () => {
    const out = Resolver.resolve(
      [h.OnInput(() => ({ _tag: 'Clicked' }))],
      [{ attributes: [h.OnBeforeInput(() => ({ _tag: 'Other' }))] }],
    )
    expect(tags(out)).toEqual(['OnInput', 'OnBeforeInput'])
  })

  describe('an event variant is the DOM event it listens to (#523)', () => {
    const none = () => Option.none()
    const keydownVariants: ReadonlyArray<readonly [string, () => Attribute<TestMessage>]> = [
      ['OnKeyDownPreventDefault', () => h.OnKeyDownPreventDefault(none)],
      ['OnKeyDownSelf', () => h.OnKeyDownSelf(() => ({ _tag: 'Other' }))],
      ['OnKeyDownSelfPreventDefault', () => h.OnKeyDownSelfPreventDefault(none)],
      ['OnKeyDownFocus', () => h.OnKeyDownFocus(none)],
    ]

    it.each(keydownVariants)('refuses %s on a slot protecting keydown', (_name, make) => {
      const protection = Slot.make({
        protected: { events: [Event.KeyDown], attributes: [], style: [] },
      }).protected
      expect(
        codeOf(() =>
          Resolver.resolve([], [{ attributes: [make()] }], {
            slot: 'editor',
            protected: protection,
          }),
        ),
      ).toBe('mixins:protected-event')
    })

    it.each(keydownVariants)('finds %s a second owner of the view keydown', (_name, make) => {
      expect(
        codeOf(() =>
          Resolver.resolve([h.OnKeyDown(() => ({ _tag: 'Clicked' }))], [{ attributes: [make()] }]),
        ),
      ).toBe('mixins:event-conflict')
    })

    it.each([
      ['OnDoubleClick', 'dblclick', () => h.OnDoubleClick({ _tag: 'Clicked' })],
      ['OnFocusEnter', 'focusin', () => h.OnFocusEnter({ _tag: 'Clicked' })],
      ['OnFocusLeave', 'focusout', () => h.OnFocusLeave({ _tag: 'Clicked' })],
      ['OnFileChange', 'change', () => h.OnFileChange(() => ({ _tag: 'Clicked' }))],
      ['OnDropFiles', 'drop', () => h.OnDropFiles(() => ({ _tag: 'Clicked' }))],
      ['AllowDrop', 'dragover', () => h.AllowDrop()],
      ['OnCopyText', 'copy', () => h.OnCopyText('x')],
      ['OnCancelPreventDefault', 'cancel', () => h.OnCancelPreventDefault()],
    ])('meets a custom %s event under the name %s', (_name, event, make) => {
      expect(codeOf(() => Resolver.resolve([make()], [{ attributes: [customEvent(event)] }]))).toBe(
        'mixins:event-conflict',
      )
    })

    it('refuses a handler tag Foldkit does not have, rather than guess its event', () => {
      const unknown = {
        _tag: 'OnKeyDownSomehow',
        f: () => Option.none(),
      } as unknown as Attribute<TestMessage>
      expect(codeOf(() => Resolver.resolve([], [{ attributes: [unknown] }]))).toBe(
        'mixins:unsupported-event',
      )
    })
  })

  describe("a Mixin's child attribute meets the same checks as its own (#523, #524)", () => {
    const protection = Slot.make({
      protected: { events: [Event.Click], attributes: [Attr.Role], style: [] },
    }).protected
    const options = { slot: 'root', protected: protection }

    it('refuses a protected event or attribute wrapped in a child', () => {
      expect(
        codeOf(() =>
          Resolver.resolve(
            [],
            [{ attributes: [fakeChild(h.OnClick({ _tag: 'Clicked' }))] }],
            options,
          ),
        ),
      ).toBe('mixins:protected-event')
      expect(
        codeOf(() => Resolver.resolve([], [{ attributes: [fakeChild(h.Role('x'))] }], options)),
      ).toBe('mixins:protected-attribute')
    })

    it('finds a child a second owner', () => {
      expect(
        codeOf(() =>
          Resolver.resolve(
            [h.OnClick({ _tag: 'Clicked' })],
            [{ attributes: [fakeChild(h.OnClick({ _tag: 'Other' }))] }],
          ),
        ),
      ).toBe('mixins:event-conflict')
      expect(
        codeOf(() =>
          Resolver.resolve([h.Role('button')], [{ attributes: [fakeChild(h.Role('link'))] }]),
        ),
      ).toBe('mixins:attribute-conflict')
    })

    it("joins a child's class to the slot's one class", () => {
      const out = Resolver.resolve([h.Class('slot')], [{ attributes: [fakeChild(h.Class('mix'))] }])
      expect(tags(out)).toEqual(['Class'])
      expect(classOf(out)).toBe('slot mix')
    })

    it('refuses structure wrapped in a child', () => {
      expect(codeOf(() => Resolver.resolve([], [{ attributes: [fakeChild(h.Key('row'))] }]))).toBe(
        'mixins:structural-override',
      )
    })
  })

  it.each([
    ['Attribute', () => h.Attribute('style', 'position:absolute')],
    ['Prop', () => prop('style', 'position:absolute')],
    ['a child Style', () => fakeChild(h.Style({ position: 'absolute' }))],
  ])('refuses a style set through %s, which would replace the slot style', (_name, make) => {
    const protection = Slot.make({
      protected: { events: [], attributes: [], style: ['position'] },
    }).protected
    for (const options of [{}, { slot: 'root', protected: protection }]) {
      expect(codeOf(() => Resolver.resolve([], [{ attributes: [make()] }], options))).toBe(
        'mixins:attribute-conflict',
      )
    }
  })

  it.each([
    ['Attribute', () => h.Attribute('class', 'x')],
    ['Prop', () => prop('className', 'x')],
  ])('refuses a class list set through %s, which would replace the slot class', (_name, make) => {
    expect(codeOf(() => Resolver.resolve([], [{ attributes: [make()] }]))).toBe(
      'mixins:attribute-conflict',
    )
  })

  it.each([['innerHTML'], ['outerHTML'], ['textContent'], ['innerText']])(
    'refuses a Prop that replaces the children (%s)',
    key => {
      expect(codeOf(() => Resolver.resolve([], [{ attributes: [prop(key, 'x')] }]))).toBe(
        'mixins:structural-override',
      )
    },
  )

  it.each([
    ['AriaLabel', 'Attribute', () => h.AriaLabel('a'), () => h.Attribute('aria-label', 'b')],
    ['AriaLabel', 'Prop', () => h.AriaLabel('a'), () => prop('ariaLabel', 'b')],
    ['Attribute', 'AriaLabel', () => h.Attribute('aria-label', 'a'), () => h.AriaLabel('b')],
    ['Role', 'Attribute', () => h.Role('a'), () => h.Attribute('role', 'b')],
    ['For', 'Attribute', () => h.For('a'), () => h.Attribute('for', 'b')],
    ['For', 'Prop', () => h.For('a'), () => prop('htmlFor', 'b')],
    ['CiteAttr', 'Attribute', () => h.CiteAttr('a'), () => h.Attribute('cite', 'b')],
    [
      'DataAttribute',
      'Attribute',
      () => h.DataAttribute('grid', 'a'),
      () => h.Attribute('data-grid', 'b'),
    ],
  ])('finds %s and %s owners of one HTML attribute (#524)', (_a, _b, view, mixin) => {
    expect(codeOf(() => Resolver.resolve([view()], [{ attributes: [mixin()] }]))).toBe(
      'mixins:attribute-conflict',
    )
  })

  it('treats distinct raw attribute keys as distinct owners', () => {
    const out = Resolver.resolve(
      [h.Attribute('data-a', '1')],
      [{ attributes: [h.Attribute('data-b', '2')] }],
    )
    expect(tags(out)).toEqual(['Attribute', 'Attribute'])
  })

  it('keys a custom event by its name instead of one native event', () => {
    const out = Resolver.resolve([customEvent('a')], [{ attributes: [customEvent('b')] }])
    expect(tags(out)).toEqual(['OnCustomEvent', 'OnCustomEvent'])
    expect(
      codeOf(() => Resolver.resolve([customEvent('a')], [{ attributes: [customEvent('a')] }])),
    ).toBe('mixins:event-conflict')
  })

  describe('a custom event is the DOM event it names', () => {
    const protection = Slot.make({
      protected: { events: [Event.Click], attributes: [], style: [] },
    }).protected

    it.each(['click', 'Click'])('refuses a protected event set as %s', name => {
      expect(
        codeOf(() =>
          Resolver.resolve([], [{ attributes: [customEvent(name)] }], {
            slot: 'root',
            protected: protection,
          }),
        ),
      ).toBe('mixins:protected-event')
    })

    it('leaves an unrelated custom event alone', () => {
      expect(() =>
        Resolver.resolve(
          [],
          [{ attributes: [customEvent('clicked'), customEvent('grid-select')] }],
          {
            slot: 'root',
            protected: protection,
          },
        ),
      ).not.toThrow()
    })

    it('finds two owners of one event when one is custom', () => {
      expect(
        codeOf(() =>
          Resolver.resolve(
            [h.OnClick({ _tag: 'Clicked' })],
            [{ attributes: [customEvent('click')] }],
          ),
        ),
      ).toBe('mixins:event-conflict')
      expect(
        codeOf(() =>
          Resolver.resolve(
            [],
            [{ attributes: [h.OnClick({ _tag: 'Clicked' }), customEvent('click')] }],
          ),
        ),
      ).toBe('mixins:event-conflict')
      expect(
        codeOf(() =>
          Resolver.resolve(
            [customEvent('click')],
            [{ attributes: [h.OnClick({ _tag: 'Clicked' })] }],
          ),
        ),
      ).toBe('mixins:event-conflict')
    })
  })

  it('rejects a redundant raw attribute key', () => {
    expect(
      codeOf(() =>
        Resolver.resolve(
          [h.Attribute('data-a', '1')],
          [{ attributes: [h.Attribute('data-a', '2')] }],
        ),
      ),
    ).toBe('mixins:attribute-conflict')
  })

  it('refuses Key and InnerHTML from a Mixin', () => {
    expect(codeOf(() => Resolver.resolve([], [{ attributes: [h.Key('row')] }]))).toBe(
      'mixins:structural-override',
    )
    expect(codeOf(() => Resolver.resolve([], [{ attributes: [h.InnerHTML('<b>x</b>')] }]))).toBe(
      'mixins:structural-override',
    )
  })

  it('preserves a ChildAttribute by identity and reserves its event', () => {
    const child = fakeChild(h.OnClick({ _tag: 'Clicked' }))
    const out = Resolver.resolve([child], [])
    expect(out).toContain(child)
    expect(
      codeOf(() => Resolver.resolve([child], [{ attributes: [h.OnClick({ _tag: 'Other' })] }])),
    ).toBe('mixins:event-conflict')
  })

  it('composes every Mount into exactly one OnMount', () => {
    const out = Resolver.resolve([h.OnMount(mount('A'))], [{ mounts: [mount('B'), mount('C')] }])
    expect(mountNames(out)).toEqual(['Mixins[slot](A,B,C)'])
  })

  it('rejects two Mounts with one name', () => {
    expect(
      codeOf(() => Resolver.resolve([h.OnMount(mount('A'))], [{ mounts: [mount('A')] }])),
    ).toBe('mixins:duplicate-mount-name')
  })

  it('honors protected events, attributes, and style properties', () => {
    const protection = Slot.make({
      protected: { events: [Event.Click], attributes: [Attr.Role], style: ['position'] },
    }).protected
    const options = { slot: 'root', protected: protection }
    expect(
      codeOf(() =>
        Resolver.resolve([], [{ attributes: [h.OnClick({ _tag: 'Clicked' })] }], options),
      ),
    ).toBe('mixins:protected-event')
    expect(codeOf(() => Resolver.resolve([], [{ attributes: [h.Role('button')] }], options))).toBe(
      'mixins:protected-attribute',
    )
    expect(codeOf(() => Resolver.resolve([], [{ style: { position: 'absolute' } }], options))).toBe(
      'mixins:protected-style-property',
    )
  })

  it.each([
    ['Attribute', 'aria-label', () => h.Attribute('aria-label', 'x')],
    ['Attribute, another case', 'aria-label', () => h.Attribute('ARIA-Label', 'x')],
    ['Prop', 'aria-label', () => prop('ariaLabel', 'x')],
    ['AriaLabel', 'aria-label', () => h.AriaLabel('x')],
    ['DataAttribute', 'data-grid-checkbox', () => h.DataAttribute('grid-checkbox', 'x')],
    [
      'Attribute with the data form',
      'data-grid-checkbox',
      () => h.Attribute('data-grid-checkbox', 'x'),
    ],
  ])('refuses a protected attribute set through %s', (_name, protectedName, make) => {
    const protection = Slot.make({
      protected: { events: [], attributes: [Attr.make(protectedName)], style: [] },
    }).protected
    expect(
      codeOf(() =>
        Resolver.resolve([], [{ attributes: [make()] }], { slot: 'root', protected: protection }),
      ),
    ).toBe('mixins:protected-attribute')
  })

  it('leaves an attribute that is not protected to a generic builder', () => {
    const protection = Slot.make({
      protected: { events: [], attributes: [Attr.make('aria-label')], style: [] },
    }).protected
    const options = { slot: 'root', protected: protection }
    expect(() =>
      Resolver.resolve(
        [],
        [
          {
            attributes: [
              h.Attribute('aria-labelx', 'x'),
              h.DataAttribute('aria-label', 'x'),
              prop('value', 'x'),
            ],
          },
        ],
        options,
      ),
    ).not.toThrow()
  })

  it('is deterministic for the same inputs', () => {
    const build = (): ReadonlyArray<string> =>
      tags(
        Resolver.resolve(
          [h.Class('a'), h.Role('button'), h.OnClick({ _tag: 'Clicked' })],
          [{ classes: ['b'], style: { color: 'red' } }],
        ),
      )
    expect(build()).toEqual(build())
  })
})
