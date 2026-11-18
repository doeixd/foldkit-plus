// @vitest-environment jsdom
/**
 * The overlays' state placed as `Bundles.X`, written as an application writes
 * it: each in a field the application names, its Messages routed by the
 * placement, what it reports answered in `onOut`. Each no-op is asserted by
 * identity, since Foldkit draws again for any new Model.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import * as UiHoverIntent from '@foldkit/ui/hoverIntent'
import * as UiPopover from '@foldkit/ui/popover'
import * as UiTooltip from '@foldkit/ui/tooltip'
import { Duration, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Bundles, ColorPicker, Drawer, Sheet, Timer, Toast } from '../src/index.js'

describe('Bundles.Dialog', () => {
  const Confirm = Bundle.compose({ told: Schema.Array(Schema.String) }).pipe(
    Bundle.withChild('dialog', Bundles.Dialog, {
      args: { id: 'confirm' },
      onOut: out => model => ({ model: { ...model, told: [...model.told, out._tag] } }),
    }),
    Bundle.withChild('alert', Bundles.Dialog, {
      args: { id: 'remove', dismissible: false, isAnimated: false },
      onOut: out => model => ({ model: { ...model, told: [...model.told, `alert ${out._tag}`] } }),
    }),
  )
  const start = () => Confirm.placements.initial({ told: [] }).model
  const fold = Confirm.placements.update(model => ({ model }))
  const dialog = (message: UiDialog.Message) => Confirm.Message.GotDialogMessage({ message })
  const alert = (message: UiDialog.Message) => Confirm.Message.GotAlertMessage({ message })

  it('starts from its args, with upstream’s defaults for what they leave out', () => {
    expect(start().dialog).toEqual(UiDialog.init({ id: 'confirm' }))
    expect(start().alert).toEqual(UiDialog.init({ id: 'remove', isAnimated: false }))
  })

  it('opens and closes, telling its parent each time', () => {
    const open = fold(start(), dialog(UiDialog.Message.RequestedOpen())).model
    expect(open.dialog.isOpen).toBe(true)
    const closed = fold(open, dialog(UiDialog.Message.RequestedClose())).model
    expect(closed.dialog.isOpen).toBe(false)
    expect(closed.told).toEqual(['Opened', 'Closed'])
  })

  it('drops the dismissals of a dialog that is not dismissible, and closes through its helper', () => {
    const open = fold(start(), alert(UiDialog.Message.RequestedOpen())).model
    expect(open.alert.isOpen).toBe(true)
    // Escape, the backdrop and a close button all send this one Message.
    const dismissed = fold(open, alert(UiDialog.Message.RequestedClose())).model
    expect(dismissed.alert).toBe(open.alert)
    expect(dismissed.told).toEqual(['alert Opened'])
    const answered = Confirm.children.alert.helpers.close()(dismissed).model
    expect(answered.alert.isOpen).toBe(false)
  })

  it('opens through its helper, as a button of the application’s does', () => {
    expect(Confirm.children.dialog.helpers.open()(start()).model.dialog.isOpen).toBe(true)
  })
})

describe('Bundles.Popover', () => {
  const Menu = Bundle.compose({ shown: Schema.Boolean }).pipe(
    Bundle.withChild('popover', Bundles.Popover, {
      args: { id: 'more', isAnimated: true, contentFocus: true },
      onOut: out => model => ({
        model: {
          ...model,
          shown: UiPopover.OutMessage.match(out, { Opened: () => true, Closed: () => false }),
        },
      }),
    }),
  )
  const start = () => Menu.placements.initial({ shown: false }).model

  it('starts from its args', () => {
    expect(start().popover).toEqual(
      UiPopover.init({ id: 'more', isAnimated: true, contentFocus: true }),
    )
  })

  it('reports `Opened` and `Closed` from its helpers', () => {
    const open = Menu.children.popover.helpers.open()(start()).model
    expect(open.shown).toBe(true)
    expect(Menu.children.popover.helpers.close()(open).model.shown).toBe(false)
  })
})

describe('Bundles.Tooltip and Bundles.HoverIntent', () => {
  const Hints = Bundle.compose({}).pipe(
    Bundle.withChild('tip', Bundles.Tooltip, {
      args: { id: 'save', showDelay: 300 },
      onOut: () => model => ({ model }),
    }),
    Bundle.withChild('card', Bundles.HoverIntent, {
      args: { openDelay: 100, closeDelay: 50 },
      onOut: () => model => ({ model }),
    }),
  )
  const start = () => Hints.placements.initial({}).model

  it('start from their args, delays in milliseconds', () => {
    expect(start().tip).toEqual(UiTooltip.init({ id: 'save', showDelay: 300 }))
    expect(start().card.openDelay).toEqual(Duration.millis(100))
    expect(start().card.closeDelay).toEqual(Duration.millis(50))
  })

  it('fold their Messages', () => {
    const fold = Hints.placements.update(model => ({ model }))
    const hovered = fold(
      start(),
      Hints.Message.GotTipMessage({ message: UiTooltip.Message.EnteredTrigger() }),
    ).model
    expect(hovered.tip.isHovered).toBe(true)
    const entered = fold(
      start(),
      Hints.Message.GotCardMessage({ message: UiHoverIntent.Message.EnteredTrigger() }),
    ).model
    expect(entered.card.isTriggerHovered).toBe(true)
  })
})

describe('Bundles.Sheet and Bundles.Drawer', () => {
  const Panels = Bundle.compose({}).pipe(
    Bundle.withChild('sheet', Bundles.Sheet, {
      args: { id: 'edit', side: 'right', points: [0.5, 1], opensAt: 1, swipe: { from: 'handle' } },
      onOut: () => model => ({ model }),
    }),
    Bundle.withChild('drawer', Bundles.Drawer, { args: { id: 'tray', open: true } }),
  )
  const start = () => Panels.placements.initial({}).model

  it('start from their args', () => {
    expect(start().sheet).toEqual(
      Sheet.init({
        id: 'edit',
        side: 'right',
        points: [0.5, 1],
        opensAt: 1,
        swipe: { from: 'handle' },
      }),
    )
    expect(start().drawer).toEqual(Drawer.init({ id: 'tray', open: true }))
  })

  it('refuse what the widget refuses, at placement', () => {
    expect(() =>
      Bundle.compose({})
        .pipe(
          Bundle.withChild('sheet', Bundles.Sheet, {
            args: { id: 'bad', points: [1, 0.5] },
            onOut: () => model => ({ model }),
          }),
        )
        .placements.initial({}),
    ).toThrow(/points must ascend/)
  })

  it('open at the point the Sheet names, and toggle the Drawer', () => {
    const fold = Panels.placements.update(model => ({ model }))
    const open = Panels.children.sheet.helpers.open()(start()).model
    expect(open.sheet.dialog.isOpen).toBe(true)
    expect(open.sheet.at).toBe(1)
    const pressed = fold(
      start(),
      Panels.Message.GotDrawerMessage({ message: Drawer.Message.Pressed() }),
    ).model
    expect(pressed.drawer.open).toBe(false)
    expect(Panels.children.drawer.helpers.open()(pressed).model.drawer.open).toBe(true)
  })
})

describe('Bundles.Timer', () => {
  it('starts a countdown from its duration, and a stopwatch from nothing', () => {
    const Clocks = Bundle.compose({}).pipe(
      Bundle.withChild('down', Bundles.Timer, {
        args: { id: 'down', countdown: true, duration: 90_000 },
      }),
      Bundle.withChild('up', Bundles.Timer, { args: { id: 'up', interval: 10 } }),
    )
    const model = Clocks.placements.initial({}).model
    expect(model.down).toEqual(Timer.init({ id: 'down', countdown: true, duration: 90_000 }))
    expect(model.up).toEqual(Timer.init({ id: 'up', interval: 10 }))
  })

  it('refuses a countdown with no duration, by name', () => {
    expect(() =>
      Bundle.compose({})
        .pipe(Bundle.withChild('down', Bundles.Timer, { args: { id: 'lap', countdown: true } }))
        .placements.initial({}),
    ).toThrow(/lap.*duration/)
  })

  it('reads the clock when a control is pressed', () => {
    const Clocks = Bundle.compose({}).pipe(
      Bundle.withChild('timer', Bundles.Timer, { args: { id: 'lap' } }),
    )
    const step = Clocks.placements.update(model => ({ model }))(
      Clocks.placements.initial({}).model,
      Clocks.Message.GotTimerMessage({ message: Timer.Message.Pressed({ action: 'start' }) }),
    )
    expect(step.commands?.length).toBe(1)
  })
})

describe('Bundles.Toast', () => {
  const Notices = Bundle.compose({ acted: Schema.Array(Schema.String) }).pipe(
    Bundle.withChild('toasts', Bundles.Toast, {
      args: { id: 'notices', position: 'top-end', max: 2 },
      onOut: out => model => ({ model: { ...model, acted: [...model.acted, out.value] } }),
    }),
  )
  const start = () => Notices.placements.initial({ acted: [] }).model

  it('starts from its args', () => {
    expect(start().toasts).toEqual(Toast.init('notices', { position: 'top-end', max: 2 }))
  })

  it('raises a toast through its helper, and reports the action pressed', () => {
    const shown = Notices.children.toasts.helpers.show({
      title: 'Archived',
      actions: [
        { label: 'Undo', value: 'undo' },
        { label: 'Open', value: 'open' },
      ],
    })(start()).model
    const [entry] = shown.toasts.entries
    const id = entry!.id
    const fold = Notices.placements.update(model => ({ model }))
    const pressed = fold(
      shown,
      Notices.Message.GotToastsMessage({ message: Toast.Message.PressedAction({ id, index: 1 }) }),
    ).model
    expect(pressed.acted).toEqual(['open'])
  })
})

describe('Bundles.ColorPicker', () => {
  const Paint = Bundle.compose({ seen: Schema.Array(Schema.Number) }).pipe(
    Bundle.withChild('picker', Bundles.ColorPicker, {
      args: { id: 'fill', color: { h: 120, s: 0.5, v: 0.5, alpha: 1 }, format: 'rgb' },
      onOut: out => model => ({ model: { ...model, seen: [...model.seen, out.color.s] } }),
    }),
  )
  const fold = Paint.placements.update(model => ({ model }))
  const start = () => Paint.placements.initial({ seen: [] }).model
  const message = (inner: ColorPicker.Message) => Paint.Message.GotPickerMessage({ message: inner })

  it('starts from its args', () => {
    expect(start().picker).toEqual(
      ColorPicker.init({ id: 'fill', color: { h: 120, s: 0.5, v: 0.5, alpha: 1 }, format: 'rgb' }),
    )
  })

  it('reports `Changed` for a color it holds now, and nothing for the same one', () => {
    const moved = fold(start(), message(ColorPicker.Message.PointedArea({ x: 0.8, y: 0.5 }))).model
    expect(moved.seen).toEqual([0.8])
    const again = fold(moved, message(ColorPicker.Message.PointedArea({ x: 0.8, y: 0.5 }))).model
    expect(again.seen).toEqual([0.8])
    expect(Option.isNone(again.picker.draft)).toBe(true)
  })
})
