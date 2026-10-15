/**
 * NestedMenu's update: a submenu's row opens it instead of being chosen, by
 * ArrowRight, Enter or a resting pointer; while it is open the menu's
 * bubbled keys and blur are dropped and its Escape closes the submenu alone;
 * choosing a submenu's row closes everything and names the submenu; and no
 * focus ever goes to a submenu's button, which is a mark.
 */
import { Menu as UiMenu } from '@foldkit/ui'
import { Option } from 'effect'
import { A11y } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import * as NestedMenu from '../src/nestedMenu.js'
import { NestedMenuSlots } from '../src/nestedMenu.js'
import { Patterns } from '../src/index.js'

// Two submenus, so opening one has another to leave shut.
const ROWS: ReadonlyArray<NestedMenu.NestedRow> = [
  { label: 'New tab' },
  { label: 'Share', items: ['Email', 'Messages'] },
  { label: 'Export', items: ['PDF', 'PNG'] },
  { label: 'Print' },
]
const shut = NestedMenu.init('file', ROWS)
const SHARE = 1
const EXPORT = 2

type Result = ReturnType<typeof NestedMenu.update>
const names = (result: Result) => (result.commands ?? []).map(command => command.name)
const menu = (model: NestedMenu.Model, message: UiMenu.Message) =>
  NestedMenu.update(model, NestedMenu.Message.GotMenu({ message }))
const submenu = (model: NestedMenu.Model, row: number, message: UiMenu.Message) =>
  NestedMenu.update(model, NestedMenu.Message.GotSubmenu({ row, message }))
const press = (model: NestedMenu.Model, key: 'ArrowRight' | 'ArrowLeft' | 'Tab') =>
  NestedMenu.update(model, NestedMenu.Message.Pressed({ key }))
const open = (model: NestedMenu.Model) => model.submenus.map(sub => sub.menu.isOpen)
const sub = (model: NestedMenu.Model, row: number) => model.submenus.find(each => each.row === row)

/** The menu open with `row` active, as the keys leave it. */
const onRow = (row: number) =>
  menu(shut, UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(row) })).model
/** The menu open with Share's submenu open on its first row. */
const shareOpen = press(onRow(SHARE), 'ArrowRight').model

describe('NestedMenu.update', () => {
  it('meets the nested menu pattern', () => {
    expect(A11y.validate(Patterns.NestedMenu, NestedMenuSlots)).toEqual([])
  })

  it('keeps one shut submenu per row with items, at its row', () => {
    expect(shut.submenus.map(each => [each.row, each.label, each.menu.id])).toEqual([
      [SHARE, 'Share', 'file-sub-1'],
      [EXPORT, 'Export', 'file-sub-2'],
    ])
  })

  it.each([
    ['ArrowRight', () => press(onRow(SHARE), 'ArrowRight')],
    ['Enter', () => menu(onRow(SHARE), UiMenu.Message.RequestedItemClick({ index: SHARE }))],
  ] as const)('%s on a submenu row opens it on its first row', (_key, act) => {
    const result = act()
    expect(open(result.model)).toEqual([true, false])
    expect(sub(result.model, SHARE)?.menu.maybeActiveItemIndex).toEqual(Option.some(0))
    expect(result.model.menu.isOpen).toBe(true)
    expect(result.outMessage).toBeUndefined()
    expect(names(result)).toContain(UiMenu.FocusItems.name)
  })

  it('a click on a submenu row opens it with no row active, and chooses nothing', () => {
    const result = menu(onRow(SHARE), UiMenu.Message.SelectedItem({ index: SHARE, item: 'Share' }))
    expect(open(result.model)).toEqual([true, false])
    expect(sub(result.model, SHARE)?.menu.maybeActiveItemIndex).toEqual(Option.none())
    expect(result.model.menu.isOpen).toBe(true)
    expect(result.outMessage).toBeUndefined()
  })

  it('ArrowRight on a plain row, or with nothing active, changes nothing', () => {
    const plain = onRow(0)
    expect(press(plain, 'ArrowRight').model).toBe(plain)
    const none = menu(shut, UiMenu.Message.Opened({ maybeActiveItemIndex: Option.none() })).model
    expect(press(none, 'ArrowRight').model).toBe(none)
  })

  it('a plain row is chosen as a Menu row is, naming no submenu', () => {
    const result = menu(onRow(3), UiMenu.Message.SelectedItem({ index: 3, item: 'Print' }))
    expect(result.model.menu.isOpen).toBe(false)
    expect(result.outMessage).toEqual(
      NestedMenu.OutMessage.Selected({ value: 'Print', submenu: Option.none() }),
    )
  })

  // Each would move, choose on or close the menu if it were not dropped.
  it.each([
    UiMenu.Message.ActivatedItem({ index: 3, activationTrigger: 'Keyboard' }),
    UiMenu.Message.Searched({ key: 'p', maybeTargetIndex: Option.some(3) }),
    UiMenu.Message.RequestedItemClick({ index: 3 }),
    UiMenu.Message.BlurredItems(),
  ])('drops the menu’s $_tag while a submenu holds focus', message => {
    const result = menu(shareOpen, message)
    expect(result.model).toBe(shareOpen)
    expect(names(result)).toEqual([])
  })

  it("drops a release in the submenu, which would press the menu's active row", () => {
    const pressed = menu(
      shut,
      UiMenu.Message.PressedPointerOnButton({
        pointerType: 'mouse',
        button: 0,
        screenX: 0,
        screenY: 0,
        timeStamp: 0,
      }),
    ).model
    const elsewhere = menu(
      pressed,
      UiMenu.Message.MovedPointerOverItem({ index: 3, screenX: 50, screenY: 50 }),
    ).model
    const release = UiMenu.Message.ReleasedPointerOnItems({
      screenX: 100,
      screenY: 100,
      timeStamp: 999,
    })
    // The release the menu presses its row on, with no submenu open.
    expect(names(menu(elsewhere, release))).toEqual([UiMenu.ClickItem.name])
    // The same menu with Share's submenu open: the release came from inside it.
    const withShare = { ...elsewhere, submenus: shareOpen.submenus }
    const result = menu(withShare, release)
    expect(result.model).toBe(withShare)
    expect(names(result)).toEqual([])
  })

  it.each([
    ['Escape', () => menu(shareOpen, UiMenu.Message.Closed())],
    ['ArrowLeft', () => press(shareOpen, 'ArrowLeft')],
  ] as const)('%s closes the submenu alone, back to its row', (_key, act) => {
    const result = act()
    expect(open(result.model)).toEqual([false, false])
    expect(result.model.menu.isOpen).toBe(true)
    expect(result.model.menu.maybeActiveItemIndex).toEqual(Option.some(SHARE))
    expect(names(result)).toContain(UiMenu.FocusItems.name)
    expect(names(result)).not.toContain(UiMenu.FocusButton.name)
  })

  it("drops the submenu's own Closed, which only its Escape sends", () => {
    expect(submenu(shareOpen, SHARE, UiMenu.Message.Closed()).model).toBe(shareOpen)
  })

  it("choosing a submenu's row closes everything, naming the submenu, focus on the trigger", () => {
    const result = submenu(
      shareOpen,
      SHARE,
      UiMenu.Message.SelectedItem({ index: 1, item: 'Messages' }),
    )
    expect(result.model.menu.isOpen).toBe(false)
    expect(open(result.model)).toEqual([false, false])
    expect(result.outMessage).toEqual(
      NestedMenu.OutMessage.Selected({ value: 'Messages', submenu: Option.some('Share') }),
    )
    const focus = (result.commands ?? []).filter(
      command => command.name === UiMenu.FocusButton.name,
    )
    expect(focus.map(command => command.args)).toEqual([{ id: 'file' }])
    // The click bubbles to the submenu's row after: the closed menu ignores it.
    const bubbled = menu(result.model, UiMenu.Message.SelectedItem({ index: SHARE, item: 'Share' }))
    expect(bubbled.model).toBe(result.model)
    expect(bubbled.outMessage).toBeUndefined()
  })

  it('closing the menu closes its submenus, sending no focus to their buttons', () => {
    const result = NestedMenu.update(shareOpen, NestedMenu.Message.PressedAway())
    expect(result.model.menu.isOpen).toBe(false)
    expect(open(result.model)).toEqual([false, false])
    const focus = (result.commands ?? []).filter(
      command => command.name === UiMenu.FocusButton.name,
    )
    expect(focus.map(command => command.args)).toEqual([{ id: 'file' }])
  })

  it('Tab out of a submenu closes everything; with none open it is the Menu’s', () => {
    const result = press(shareOpen, 'Tab')
    expect(result.model.menu.isOpen).toBe(false)
    expect(open(result.model)).toEqual([false, false])
    const plain = onRow(SHARE)
    expect(press(plain, 'Tab').model).toBe(plain)
  })

  describe('the pointer', () => {
    const over = (model: NestedMenu.Model, index: number) =>
      menu(model, UiMenu.Message.MovedPointerOverItem({ index, screenX: index, screenY: index }))
    /** The delay `result` started for `row`, run out. */
    const delayOf = (result: Result, row: number) => {
      const delays = (result.commands ?? []).filter(each => each.name === 'DelayHover')
      expect(delays.map(each => each.args)).toEqual([{ hover: result.model.hover, row }])
      return NestedMenu.Message.CompletedHoverDelay({ hover: result.model.hover, row })
    }
    const settle = (result: Result, row: number) =>
      NestedMenu.update(result.model, delayOf(result, row))

    it('resting on a submenu row opens it once the delay runs out, no row active', () => {
      const hovered = over(onRow(0), SHARE)
      expect(open(hovered.model)).toEqual([false, false])
      const result = settle(hovered, SHARE)
      expect(open(result.model)).toEqual([true, false])
      expect(sub(result.model, SHARE)?.menu.maybeActiveItemIndex).toEqual(Option.none())
    })

    it('a delay overtaken by another move does nothing', () => {
      const first = over(onRow(0), SHARE)
      const stale = delayOf(first, SHARE)
      const later = over(first.model, 3)
      expect(NestedMenu.update(later.model, stale).model).toBe(later.model)
    })

    it('resting on another row closes the open submenu, focus on the menu', () => {
      const result = settle(over(shareOpen, 3), 3)
      expect(open(result.model)).toEqual([false, false])
      expect(result.model.menu.isOpen).toBe(true)
      expect(names(result)).toContain(UiMenu.FocusItems.name)
      expect(names(result)).not.toContain(UiMenu.FocusButton.name)
    })

    it('resting on another submenu row switches to it', () => {
      const result = settle(over(shareOpen, EXPORT), EXPORT)
      expect(open(result.model)).toEqual([false, true])
    })

    it('reaching the submenu drops a pending close', () => {
      const leaving = over(shareOpen, 3)
      const stale = delayOf(leaving, 3)
      const inside = submenu(
        leaving.model,
        SHARE,
        UiMenu.Message.MovedPointerOverItem({ index: 0, screenX: 5, screenY: 5 }),
      )
      const result = NestedMenu.update(inside.model, stale)
      expect(result.model).toBe(inside.model)
      expect(open(result.model)).toEqual([true, false])
    })

    it('a key decides over a pending hover', () => {
      const hovered = over(onRow(0), SHARE)
      const stale = delayOf(hovered, SHARE)
      const opened = press(hovered.model, 'ArrowRight').model
      const closed = press(opened, 'ArrowLeft').model
      expect(NestedMenu.update(closed, stale).model).toBe(closed)
    })

    it('schedules nothing over a plain row while no submenu is open', () => {
      expect(names(over(onRow(SHARE), 3))).not.toContain('DelayHover')
    })
  })
})
