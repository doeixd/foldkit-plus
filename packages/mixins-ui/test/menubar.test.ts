/**
 * Menubar's update: the keys move the one tab stop while every menu is
 * shut and open the next menu while one is open, opening a menu shuts the
 * rest without pulling focus back to their buttons, the pointer opens a
 * neighbour only while one is open, and a chosen row names its menu.
 */
import { Menu as UiMenu } from '@foldkit/ui'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Menubar, MenubarSlots, Patterns } from '../src/index.js'
import { A11y } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'

const bar = Menubar.init(['file', 'edit', 'view'])
const press = (model: Menubar.Model, key: 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End') =>
  Menubar.update(model, Menubar.Message.Pressed({ key }))
const names = (result: ReturnType<typeof Menubar.update>) =>
  (result.commands ?? []).map(command => command.name)
const open = (model: Menubar.Model) => model.menus.map(menu => menu.isOpen)
const opened = (model: Menubar.Model, index: number) =>
  Menubar.update(
    model,
    Menubar.Message.GotMenu({
      index,
      message: UiMenu.Message.Opened({ maybeActiveItemIndex: Option.none() }),
    }),
  ).model

describe('Menubar.update', () => {
  it('meets the menubar pattern', () => {
    expect(A11y.validate(Patterns.Menubar, MenubarSlots)).toEqual([])
  })

  it.each([
    ['ArrowRight', 0, 1],
    ['ArrowRight', 2, 0],
    ['ArrowLeft', 0, 2],
    ['ArrowLeft', 2, 1],
    ['Home', 2, 0],
    ['End', 0, 2],
  ] as const)('moves the tab stop on %s from %i to %i, and focuses it', (key, from, to) => {
    const at = { ...bar, stop: from }
    const result = press(at, key)
    expect(result.model.stop).toBe(to)
    expect(names(result)).toEqual(['FocusTrigger'])
    expect(open(result.model)).toEqual([false, false, false])
  })

  it('opening a menu shuts the open one, sending no focus to its button', () => {
    const first = opened(bar, 0)
    const result = Menubar.update(
      first,
      Menubar.Message.GotMenu({
        index: 2,
        message: UiMenu.Message.Opened({ maybeActiveItemIndex: Option.none() }),
      }),
    )
    expect(open(result.model)).toEqual([false, false, true])
    expect(result.model.stop).toBe(2)
    expect(names(result)).not.toContain(UiMenu.FocusButton.name)
    expect(names(result)).toContain(UiMenu.FocusItems.name)
  })

  it('the arrows across an open menu open the next on its first row', () => {
    const result = press(opened(bar, 2), 'ArrowRight')
    expect(open(result.model)).toEqual([true, false, false])
    expect(result.model.menus[0]?.maybeActiveItemIndex).toEqual(Option.some(0))
    expect(result.model.stop).toBe(0)
    expect(names(result)).not.toContain(UiMenu.FocusButton.name)
  })

  it("leaves Home and End to an open menu's rows", () => {
    const model = opened(bar, 1)
    expect(press(model, 'Home').model).toBe(model)
  })

  it('returns the same Model for a menu Message that changes nothing', () => {
    const shut = Menubar.Message.GotMenu({ index: 0, message: UiMenu.Message.Closed() })
    expect(Menubar.update(bar, shut).model).toBe(bar)
  })

  it('the pointer opens a neighbour only while a menu is open', () => {
    expect(Menubar.update(bar, Menubar.Message.Hovered({ to: 1 })).model).toBe(bar)
    const result = Menubar.update(opened(bar, 0), Menubar.Message.Hovered({ to: 1 }))
    expect(open(result.model)).toEqual([false, true, false])
  })

  it('names the menu a chosen row came from', () => {
    const result = Menubar.update(
      opened(bar, 1),
      Menubar.Message.GotMenu({
        index: 1,
        message: UiMenu.Message.SelectedItem({ index: 2, item: 'Copy' }),
      }),
    )
    expect(result.outMessage).toEqual(Menubar.OutMessage.Selected({ menu: 1, value: 'Copy' }))
    expect(open(result.model)).toEqual([false, false, false])
  })
})

describe('Menubar.view', () => {
  const sceneIn =
    (direction: 'ltr' | 'rtl') =>
    (model: Menubar.Model, ...steps: ReadonlyArray<Step>) =>
      Scene.scene<Menubar.Model, Menubar.Message, Menubar.OutMessage>(
        {
          update: (model, message) => Menubar.update(model, message),
          view: (model, h) =>
            Menubar.view(
              {
                label: 'Editor',
                model,
                menus: [
                  { label: 'File', rows: [{ label: 'New' }] },
                  { label: 'Edit', rows: [{ label: 'Copy' }] },
                  { label: 'View', rows: [{ label: 'Zoom' }] },
                ],
                onMessage: message => message,
                direction,
                menuMixins: [],
              },
              h,
            ),
        },
        Scene.given(model),
        ...steps,
      )
  const scene = sceneIn('ltr')
  type Step = Parameters<typeof Scene.scene<Menubar.Model, Menubar.Message, Menubar.OutMessage>>[1]
  const stops = (expected: ReadonlyArray<number>) =>
    Scene.tap<Menubar.Model, Menubar.Message, Menubar.OutMessage>(({ html }) =>
      expect(
        Inert.byRole(html, 'menuitem').map(trigger => Inert.value(trigger, 'tabindex')),
      ).toEqual(expected),
    )

  it('makes the stop trigger the one tab stop, each a menuitem', () => {
    scene({ ...bar, stop: 1 }, stops([-1, 0, -1]))
  })

  it('answers its own keys on the bar and leaves the rest', () => {
    const [focusEdit] = press(bar, 'ArrowRight').commands ?? []
    scene(
      bar,
      Scene.keydown(Scene.role('menubar'), 'ArrowRight'),
      Scene.Command.resolve(focusEdit!, Menubar.Message.CompletedFocusTrigger()),
      stops([-1, 0, -1]),
    )
    scene(bar, Scene.keydown(Scene.role('menubar'), 'a'), Scene.expectIgnored())
  })

  it.each([
    ['ArrowLeft', 'ArrowRight', [-1, 0, -1]],
    ['ArrowRight', 'ArrowLeft', [-1, -1, 0]],
  ] as const)('right to left, %s moves as %s does left to right', (key, reading, expected) => {
    const [focus] = press(bar, reading).commands ?? []
    sceneIn('rtl')(
      bar,
      Scene.keydown(Scene.role('menubar'), key),
      Scene.Command.resolve(focus!, Menubar.Message.CompletedFocusTrigger()),
      stops(expected),
    )
  })
})
