/**
 * Menu's update: a submenu's row opens it instead of being chosen, by
 * ArrowRight, Enter or a resting pointer; while it is open the menu's
 * bubbled keys and blur are dropped and its Escape closes the submenu alone;
 * choosing a submenu's row closes everything and names the submenu; no focus
 * ever goes to a submenu's button, which is a mark; and at a point, the menu
 * opens where the right press before it landed, or with no point from the
 * keyboard.
 */
import { Menu as UiMenu } from '@foldkit/ui'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Menu } from '../src/index.js'
import { SlotView } from 'foldkit-mixins'
import { attributeOf } from './fixture.js'

// Two submenus, so opening one has another to leave shut.
const ROWS: ReadonlyArray<Menu.Row> = [
  { label: 'New tab' },
  { label: 'Share', items: ['Email', 'Messages'] },
  { label: 'Export', items: ['PDF', 'PNG'] },
  { label: 'Print' },
]
const shut = Menu.init('file', ROWS)
const SHARE = 1
const EXPORT = 2

type Result = ReturnType<typeof Menu.update>
const names = (result: Result) => (result.commands ?? []).map(command => command.name)
const menu = (model: Menu.Model, message: UiMenu.Message) =>
  Menu.update(model, Menu.Message.GotMenu({ message }))
const submenu = (model: Menu.Model, row: number, message: UiMenu.Message) =>
  Menu.update(model, Menu.Message.GotSubmenu({ row, message }))
const press = (model: Menu.Model, key: 'ArrowRight' | 'ArrowLeft' | 'Tab') =>
  Menu.update(model, Menu.Message.Pressed({ key }))
const open = (model: Menu.Model) => model.submenus.map(sub => sub.menu.isOpen)
const sub = (model: Menu.Model, row: number) => model.submenus.find(each => each.row === row)

/** The menu open with `row` active, as the keys leave it. */
const onRow = (row: number) =>
  menu(shut, UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(row) })).model
/** The menu open with Share's submenu open on its first row. */
const shareOpen = press(onRow(SHARE), 'ArrowRight').model

describe('Menu.update', () => {
  it('keeps one shut submenu per row with items, at its row', () => {
    expect(shut.submenus.map(each => [each.row, each.label, each.menu.id])).toEqual([
      [SHARE, 'Share', 'file-sub-1'],
      [EXPORT, 'Export', 'file-sub-2'],
    ])
    expect(Menu.init('plain', [{ label: 'Rename' }]).submenus).toEqual([])
  })

  it('makes the menu modal alone: its submenus are drawn inside it', () => {
    const modal = Menu.init('file', ROWS, { isModal: true })
    expect(modal.menu.isModal).toBe(true)
    expect(modal.submenus.map(each => each.menu.isModal)).toEqual([false, false])
    expect(shut.menu.isModal).toBe(false)
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
      Menu.OutMessage.Selected({ value: 'Print', submenu: Option.none() }),
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
      Menu.OutMessage.Selected({ value: 'Messages', submenu: Option.some('Share') }),
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
    const result = Menu.update(shareOpen, Menu.Message.PressedAway())
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
    const over = (model: Menu.Model, index: number) =>
      menu(model, UiMenu.Message.MovedPointerOverItem({ index, screenX: index, screenY: index }))
    /** The delay `result` started for `row`, run out. */
    const delayOf = (result: Result, row: number) => {
      const delays = (result.commands ?? []).filter(each => each.name === 'DelayHover')
      expect(delays.map(each => each.args)).toEqual([{ hover: result.model.hover, row }])
      return Menu.Message.CompletedHoverDelay({ hover: result.model.hover, row })
    }
    const settle = (result: Result, row: number) => Menu.update(result.model, delayOf(result, row))

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
      expect(Menu.update(later.model, stale).model).toBe(later.model)
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
      const result = Menu.update(inside.model, stale)
      expect(result.model).toBe(inside.model)
      expect(open(result.model)).toEqual([true, false])
    })

    it('a key decides over a pending hover', () => {
      const hovered = over(onRow(0), SHARE)
      const stale = delayOf(hovered, SHARE)
      const opened = press(hovered.model, 'ArrowRight').model
      const closed = press(opened, 'ArrowLeft').model
      expect(Menu.update(closed, stale).model).toBe(closed)
    })

    it('schedules nothing over a plain row while no submenu is open', () => {
      expect(names(over(onRow(SHARE), 3))).not.toContain('DelayHover')
    })
  })

  describe('at a point', () => {
    const POINT = { x: 140, y: 30 }
    const pressed = (model: Menu.Model) =>
      Menu.update(model, Menu.Message.PressedTarget({ point: POINT })).model
    const requested = (model: Menu.Model) => Menu.update(model, Menu.Message.RequestedContextMenu())

    it('a right press only records its point; the contextmenu after it opens there', () => {
      const recorded = pressed(shut)
      expect(recorded.menu.isOpen).toBe(false)
      expect(recorded.point).toEqual(Option.none())
      const result = requested(recorded)
      expect(result.model.menu.isOpen).toBe(true)
      expect(result.model.menu.maybeActiveItemIndex).toEqual(Option.some(0))
      expect(result.model.point).toEqual(Option.some(POINT))
      expect(result.model.press).toEqual(Option.none())
    })

    it('opened from the keyboard, with no press before it, it has no point', () => {
      expect(requested(shut).model.point).toEqual(Option.none())
    })

    it('keeps its point while it closes, and the next keyboard open has none', () => {
      const atPoint = requested(pressed(shut)).model
      const closed = Menu.update(atPoint, Menu.Message.PressedAway()).model
      expect(closed.menu.isOpen).toBe(false)
      expect(closed.point).toEqual(Option.some(POINT))
      expect(requested(closed).model.point).toEqual(Option.none())
    })

    // iOS fires no contextmenu for a held finger, so the hold itself opens it.
    describe('held by a finger', () => {
      const SCREEN = { x: 500, y: 300 }
      const touched = (model: Menu.Model) =>
        Menu.update(model, Menu.Message.TouchedTarget({ point: POINT, screen: SCREEN }))
      const held = (model: Menu.Model, hold = model.hold) =>
        Menu.update(model, Menu.Message.HeldTarget({ hold }))
      const moved = (model: Menu.Model, by: number) =>
        Menu.update(
          model,
          Menu.Message.MovedOnTarget({ screen: { x: SCREEN.x + by, y: SCREEN.y } }),
        ).model

      it('starts a hold that opens it at the finger', () => {
        const down = touched(shut)
        expect(down.model.menu.isOpen).toBe(false)
        expect(names(down)).toEqual(['Menu.hold'])
        const result = held(down.model)
        expect(result.model.menu.isOpen).toBe(true)
        expect(result.model.point).toEqual(Option.some(POINT))
        expect(result.model.holding).toEqual(Option.none())
      })

      it('wanders a little and still holds; moves further, and is a scroll, opening nothing', () => {
        const down = touched(shut).model
        const still = moved(down, 9)
        expect(still).toBe(down)
        expect(held(still).model.menu.isOpen).toBe(true)
        const away = moved(down, 12)
        expect(held(away).model.menu.isOpen).toBe(false)
      })

      it('lifted before the hold ends, opens nothing', () => {
        const down = touched(shut).model
        const lifted = Menu.update(down, Menu.Message.LiftedFromTarget()).model
        expect(held(lifted).model.menu.isOpen).toBe(false)
      })

      it('an earlier hold running out does nothing to the next', () => {
        const first = touched(shut).model
        const lifted = Menu.update(first, Menu.Message.LiftedFromTarget()).model
        const second = touched(lifted).model
        expect(held(second, first.hold).model).toBe(second)
        expect(held(second).model.menu.isOpen).toBe(true)
      })

      it('Android’s own contextmenu for the hold spends it, so it opens once', () => {
        const opened = requested(touched(shut).model).model
        expect(opened.menu.isOpen).toBe(true)
        expect(opened.point).toEqual(Option.some(POINT))
        expect(held(opened).model).toBe(opened)
      })
    })

    it('pointTarget records a finger’s press, so Android’s contextmenu opens under it', () => {
      // The press's point is the Message, so the test reads where it was recorded.
      const h = SlotView.inertBuilder<{ readonly x: number; readonly y: number }>()
      const attrs = Menu.pointTarget({ onPress: point => point, onOpen: POINT }, h)
      const down = attributeOf(attrs, 'OnPointerDown')!
      const at = (type: string, button: number) => down.f(type, button, 0, 0, 0, 7, 9, 1, null)
      expect([at('touch', 0), at('pen', 0), at('mouse', 2)]).toEqual(
        [1, 2, 3].map(() => Option.some({ x: 7, y: 9 })),
      )
      expect(at('mouse', 0)).toEqual(Option.none())
    })

    it('opens its submenus as a menu under a button does', () => {
      const atPoint = requested(pressed(shut)).model
      const onShare = menu(
        atPoint,
        UiMenu.Message.ActivatedItem({ index: SHARE, activationTrigger: 'Keyboard' }),
      ).model
      expect(open(press(onShare, 'ArrowRight').model)).toEqual([true, false])
    })
  })

  it('a chosen check row names itself and leaves the menu as it was, open', () => {
    const before = onRow(0)
    const result = Menu.update(before, Menu.Message.ChoseCheck({ value: 'Grid' }))
    expect(result.model).toBe(before)
    expect(result.outMessage).toEqual(
      Menu.OutMessage.Selected({ value: 'Grid', submenu: Option.none() }),
    )
  })

  it('finds the check row a Menu Message chooses, and no other', () => {
    const rows: ReadonlyArray<Menu.Row> = [
      { label: 'Cut' },
      { label: 'Grid', check: 'checkbox', checked: false },
    ]
    const chosen = (index: number) =>
      Menu.checkChosen(rows, UiMenu.Message.SelectedItem({ index, item: 'x' }))
    expect(Option.map(chosen(1), row => row.label)).toEqual(Option.some('Grid'))
    expect(chosen(0)).toEqual(Option.none())
    expect(Menu.checkChosen(rows, UiMenu.Message.RequestedItemClick({ index: 1 }))).toEqual(
      Option.none(),
    )
  })

  it('names keys drawn as symbols for aria-keyshortcuts', () => {
    expect(Menu.keyShortcuts(['⌘', '⇧', 'P'])).toBe('Meta+Shift+P')
    expect(Menu.keyShortcuts(['Ctrl', 'constructor'])).toBe('Control+constructor')
  })
})
