// @vitest-environment jsdom
/**
 * Toolbar as markup: a named toolbar whose one tab stop follows `roving`, the
 * arrows, Home and End choosing the next enabled control, disabled controls
 * skipped, and the application's keys through the same owner. Where focus
 * really moves is `toolbar.browser.test.ts`.
 */
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Behaviors, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { RovingTabindex } from 'foldkit-primitives/interaction'
import { Button, Recipes, Toolbar, ToolbarSlots } from '../src/index.js'
import { ToolbarPattern } from '../src/toolbar.js'
import { diagnosticFrom, h, message, sends, type TestMessage } from './fixture.js'

const style = Style.forSlots(ToolbarSlots)(Recipes.Toolbar({}))

const button = (id: string, disabled?: boolean): Toolbar.ToolbarControl<TestMessage> => ({
  id,
  disabled,
  draw: control =>
    Button.view(
      { label: id, disabled: control.disabled, attributes: { button: control.attributes } },
      h,
    ),
})

const items: ReadonlyArray<Toolbar.ToolbarItem<TestMessage>> = [
  button('bold'),
  button('italic', true),
  button('link'),
  button('code'),
]

const roving = (current: string | null): RovingTabindex.Model => ({ current })

const drawn = (
  current: string | null,
  extra: Partial<Toolbar.ToolbarView<TestMessage>> = {},
  entries = items,
) =>
  Toolbar.view(
    {
      id: 'bar',
      label: 'Formatting',
      items: entries,
      roving: roving(current),
      onFocus: () => message('Clicked'),
      style,
      ...extra,
    },
    h,
  )

const stops = (tree: ReturnType<typeof drawn>) =>
  Inert.byTag(tree, 'button').map(each => String(Inert.value(each, 'tabindex')))

describe('Toolbar.view', () => {
  it('meets the toolbar pattern', () => {
    expect(A11y.validate(ToolbarPattern, ToolbarSlots)).toEqual([])
  })

  it('draws a named toolbar with its orientation', () => {
    const [bar] = Inert.byRole(drawn(null), 'toolbar')
    expect(Inert.value(bar, 'aria-label')).toBe('Formatting')
    expect(Inert.value(bar, 'aria-orientation')).toBe('horizontal')
    const [column] = Inert.byRole(drawn(null, { orientation: 'vertical' }), 'toolbar')
    expect(Inert.value(column, 'aria-orientation')).toBe('vertical')
  })

  it.each([
    ['none yet', null, ['0', '-1', '-1', '-1']],
    ['the last focused', 'link', ['-1', '-1', '0', '-1']],
    ['a disabled one', 'italic', ['0', '-1', '-1', '-1']],
    ['one that is gone', 'missing', ['0', '-1', '-1', '-1']],
  ])('puts the one tab stop by the current control: %s', (_, current, tabindexes) => {
    expect(stops(drawn(current))).toEqual(tabindexes)
  })

  it('gives each control its id, and a disabled one aria-disabled', () => {
    const [bold, italic] = Inert.byTag(drawn(null), 'button')
    expect(Inert.value(bold, 'id')).toBe(Toolbar.controlId('bar', 'bold'))
    expect(Inert.value(bold, 'aria-disabled')).toBeUndefined()
    expect(Inert.value(italic, 'aria-disabled')).toBe('true')
  })

  it('has no tab stop and takes no key once the toolbar is off', () => {
    const off = drawn(null, { disabled: true })
    expect(stops(off)).toEqual(['-1', '-1', '-1', '-1'])
    const [bar] = Inert.byRole(off, 'toolbar')
    expect(Inert.value(bar, 'aria-disabled')).toBe('true')
    expect(bar?.data?.on?.['keydown']).toBeUndefined()
    for (const control of Inert.byTag(off, 'button')) {
      expect(Inert.value(control, 'aria-disabled')).toBe('true')
    }
  })

  it('turns off the controls of a disabled group, and names each group', () => {
    const tree = drawn(null, {}, [
      button('bold'),
      'separator',
      {
        label: 'Align',
        disabled: true,
        controls: [button('left'), button('right')],
      },
    ])
    const [group] = Inert.byRole(tree, 'group')
    expect(Inert.value(group, 'aria-label')).toBe('Align')
    const [separator] = Inert.byRole(tree, 'separator')
    expect(Inert.value(separator, 'aria-orientation')).toBe('vertical')
    expect(Inert.byTag(tree, 'button').map(each => Inert.value(each, 'aria-disabled'))).toEqual([
      undefined,
      'true',
      'true',
    ])
    // The group's controls are stops of the one toolbar, not stops of their own.
    expect(stops(tree)).toEqual(['0', '-1', '-1'])
  })

  it('draws a separator across a vertical toolbar as horizontal', () => {
    const tree = drawn(null, { orientation: 'vertical' }, [button('a'), 'separator', button('b')])
    const [separator] = Inert.byRole(tree, 'separator')
    expect(Inert.value(separator, 'aria-orientation')).toBe('horizontal')
  })

  it('refuses two controls with one id', () => {
    const diagnostic = diagnosticFrom(() => drawn(null, {}, [button('a'), button('a')]))
    expect(diagnostic?.code).toBe('mixins:duplicate-item-id')
  })
})

type Focused = { readonly focused: string }

const ids = ['bold', 'italic', 'link', 'code']

/** Plain buttons over `Focused`, so a Scene reads which control a key would focus. */
const bound =
  (current: string | null, extra: Partial<Toolbar.ToolbarView<Focused>> = {}) =>
  (h: HtmlBuilder<Focused>) =>
    Toolbar.view(
      {
        id: 'bar',
        label: 'Formatting',
        items: ids.map((id): Toolbar.ToolbarControl<Focused> => ({
          id,
          disabled: id === 'italic',
          draw: ({ attributes, disabled }) =>
            h.button([...attributes, ...(disabled ? [h.Disabled(true)] : [])], [id]),
        })),
        roving: roving(current),
        onFocus: id => ({ focused: id }),
        ...extra,
      },
      h,
    )

const press = (
  key: string,
  current: string | null,
  expected: string | undefined,
  extra: Partial<Toolbar.ToolbarView<Focused>> = {},
) =>
  sends(
    bound(current, extra),
    Scene.keydown(Scene.role('toolbar'), key),
    expected === undefined ? Scene.expectIgnored() : Scene.expectOutMessage({ focused: expected }),
  )

const Open = Behaviors.Keys.route<undefined, Focused>('Open', {
  on: [Behaviors.Keys.chord('F10')],
  handle: () => Option.some({ focused: 'menu' }),
})

describe('Toolbar keys', () => {
  it.each([
    ['ArrowRight', 'bold', 'link'],
    ['ArrowRight', null, 'bold'],
    ['ArrowRight', 'code', 'bold'],
    ['ArrowLeft', 'bold', 'code'],
    ['ArrowLeft', 'link', 'bold'],
    ['Home', 'code', 'bold'],
    ['End', 'bold', 'code'],
  ])('%s from %s moves to %s, skipping the disabled control', (key, current, to) => {
    press(key, current, to)
  })

  it.each(['ArrowUp', 'ArrowDown', 'a', 'Enter'])(
    'leaves %s alone in a horizontal toolbar',
    key => {
      press(key, 'bold', undefined)
    },
  )

  it('moves by Up and Down, not Left and Right, in a vertical toolbar', () => {
    press('ArrowDown', 'bold', 'link', { orientation: 'vertical' })
    press('ArrowUp', 'bold', 'code', { orientation: 'vertical' })
    press('ArrowRight', 'bold', undefined, { orientation: 'vertical' })
  })

  it('swaps Left and Right under right-to-left, and stops at the ends without loop', () => {
    press('ArrowRight', 'link', 'bold', { direction: 'rtl' })
    press('ArrowLeft', 'bold', 'link', { direction: 'rtl' })
    press('ArrowRight', 'code', 'code', { loop: false })
    press('ArrowLeft', 'bold', 'bold', { loop: false })
  })

  it('leaves the arrows across the toolbar to the application, with no conflict', () => {
    const down = Behaviors.Keys.route<undefined, Focused>('Down', {
      on: [Behaviors.Keys.chord('ArrowDown')],
      handle: () => Option.some({ focused: 'below' }),
    })
    sends(
      bound('bold', { routes: [down] }),
      Scene.keydown(Scene.role('toolbar'), 'ArrowDown'),
      Scene.expectOutMessage({ focused: 'below' }),
    )
    expect(
      diagnosticFrom(() =>
        bound('bold', { routes: [down], orientation: 'vertical' })(
          SlotView.inertBuilder<Focused>(),
        ),
      )?.code,
    ).toBe('mixins:key-conflict')
  })

  it('moves over the controls of a group as over the rest, and skips a disabled group', () => {
    const grouped = (disabled: boolean) => (h: HtmlBuilder<Focused>) =>
      Toolbar.view<Focused>(
        {
          id: 'bar',
          label: 'Formatting',
          items: [
            {
              label: 'Align',
              disabled,
              controls: ['left', 'right'].map(id => ({
                id,
                draw: ({ attributes }) => h.button([...attributes], [id]),
              })),
            },
            {
              id: 'bold',
              draw: ({ attributes }) => h.button([...attributes], ['bold']),
            },
          ],
          roving: roving(null),
          onFocus: id => ({ focused: id }),
        },
        h,
      )
    sends(
      grouped(false),
      Scene.keydown(Scene.role('toolbar'), 'ArrowRight'),
      Scene.expectOutMessage({ focused: 'left' }),
    )
    sends(
      grouped(true),
      Scene.keydown(Scene.role('toolbar'), 'ArrowRight'),
      Scene.expectOutMessage({ focused: 'bold' }),
    )
  })

  it("answers the application's routes through the same owner", () => {
    sends(
      bound('bold', { routes: [Open] }),
      Scene.keydown(Scene.role('toolbar'), 'F10'),
      Scene.expectOutMessage({ focused: 'menu' }),
      Scene.keydown(Scene.role('toolbar'), 'ArrowRight'),
      Scene.expectOutMessage({ focused: 'link' }),
    )
  })

  it.each([
    ['a built-in', 'End', ['Toolbar', 'Other']],
    ['another route', 'F10', ['Open', 'Other']],
  ])('names both routes when one overlaps %s', (_, key, names) => {
    const other = Behaviors.Keys.route<undefined, Focused>('Other', {
      on: [Behaviors.Keys.chord(key === 'End' ? 'End' : 'F10')],
      handle: () => Option.none(),
    })
    const routes = key === 'End' ? [other] : [Open, other]
    const diagnostic = diagnosticFrom(() =>
      bound('bold', { routes })(SlotView.inertBuilder<Focused>()),
    )
    expect(diagnostic?.code).toBe('mixins:key-conflict')
    expect(diagnostic?.details?.['contributors']).toEqual(names)
  })
})
