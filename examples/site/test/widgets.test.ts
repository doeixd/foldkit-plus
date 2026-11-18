/**
 * The previews with state of their own: each component's Message reaches its
 * own Model through the site's update, and what it reports becomes the
 * value the preview shows.
 */
import { Dialog as UiDialog, Menu as UiMenu } from '@foldkit/ui'
import { Option } from 'effect'
import { Chart, Drawer, Menu, Sheet } from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'

import * as Widgets from '../src/gallery/widgets.js'
import { Message, initial, update } from '../src/main.js'

const send = (message: Widgets.Message) => update(initial, Message.GotWidget({ message })).model

describe('the previews with state', () => {
  it('keep the volume and the price range the sliders moved to', () => {
    const turned = send(Widgets.Message.TurnedVolume({ value: 65 }))
    expect(initial.widgets.volume).toBe(60)
    expect(turned.widgets.volume).toBe(65)
    const moved = send(Widgets.Message.MovedPriceRange({ value: { low: 120, high: 350 } }))
    expect(initial.widgets.priceRange).toEqual({ low: 100, high: 350 })
    expect(moved.widgets.priceRange).toEqual({ low: 120, high: 350 })
    const again = update(
      turned,
      Message.GotWidget({ message: Widgets.Message.TurnedVolume({ value: 65 }) }),
    )
    expect(again.model.widgets).toBe(turned.widgets)
  })

  it('open the dialog and close it again', () => {
    const opened = send(Widgets.Message.OpenedDialog())
    expect(opened.widgets.dialog.isOpen).toBe(true)
    const closed = update(
      opened,
      Message.GotWidget({ message: Widgets.Message.ClosedDialog() }),
    ).model
    expect(closed.widgets.dialog.isOpen).toBe(false)
    expect(UiDialog.init({ id: 'x' }).isOpen).toBe(false)
  })

  it('keep the action that was chosen', () => {
    const acted = send(
      Widgets.Message.GotPageMenu({
        message: Menu.Message.GotMenu({
          message: UiMenu.Message.SelectedItem({ index: 0, item: 'Rename' }),
        }),
      }),
    )
    expect(acted.widgets.pageChoice).toEqual(Option.some('Rename'))
  })

  it('show a notice when the draft is saved', () => {
    expect(initial.widgets.notices.entries).toHaveLength(0)
    const saved = send(Widgets.Message.SavedDraft())
    expect(saved.widgets.notices.entries.map(entry => entry.payload.title)).toEqual(['Draft saved'])
  })

  it('press the range that was chosen, and stay put on the same one', () => {
    const chosen = send(Widgets.Message.ChoseRange({ range: 'month' }))
    expect(chosen.widgets.range).toBe('month')
    const again = update(
      chosen,
      Message.GotWidget({ message: Widgets.Message.ChoseRange({ range: 'month' }) }),
    )
    expect(again.model.widgets).toBe(chosen.widgets)
  })
})

describe('the menu previews', () => {
  it('fade their menus and submenus in and out', () => {
    for (const menu of [initial.widgets.fileMenu, initial.widgets.pageMenu])
      expect(
        [menu.menu, ...menu.submenus.map(submenu => submenu.menu)].map(m => m.isAnimated),
      ).toEqual([menu.menu, ...menu.submenus].map(() => true))
    expect(initial.widgets.fileMenu.submenus.length).toBeGreaterThan(0)
  })
})

describe('the checkbox group previews', () => {
  it('each check their own alerts', () => {
    const toggled = send(Widgets.Message.ToggledAlert({ example: 'described', value: 'digest' }))
      .widgets.alerts
    expect(toggled).toEqual({
      ...initial.widgets.alerts,
      described: ['mentions', 'replies', 'digest'],
    })
  })
})

describe('the menu, command and toast previews', () => {
  const view = (value: string) =>
    Message.GotWidget({
      message: Widgets.Message.GotViewMenu({
        message: Menu.Message.GotMenu({
          message: UiMenu.Message.SelectedItem({
            index: ['Grid', 'Rulers', 'Fit', 'Actual size', 'Delete'].indexOf(value),
            item: value,
          }),
        }),
      }),
    })

  it('flip a checkbox row, pick a radio row, and choose a plain one', () => {
    const grid = update(initial, view('Grid')).model
    expect(grid.widgets.viewOptions.grid).toBe(true)
    const zoomed = update(grid, view('Actual size')).model
    expect(zoomed.widgets.viewOptions.zoom).toBe('Actual size')
    const deleted = update(zoomed, view('Delete')).model
    expect(deleted.widgets.viewOptions.chosen).toEqual(Option.some('Delete'))
    expect(update(deleted, view('Grid')).model.widgets.viewOptions.grid).toBe(false)
  })

  it('step into the theme page, back out, and close on a run', () => {
    const run = (value: string) =>
      Message.GotWidget({ message: Widgets.Message.RanPalette({ value }) })
    const opened = send(Widgets.Message.OpenedPalette())
    const theme = update(opened, run('theme')).model
    expect(theme.widgets.palettePages).toEqual(['Theme'])
    expect(theme.widgets.palette.isOpen).toBe(true)
    const back = update(
      theme,
      Message.GotWidget({ message: Widgets.Message.LeftPalettePage() }),
    ).model
    expect(back.widgets.palettePages).toEqual([])
    const ran = update(theme, run('dark')).model
    expect(ran.widgets.paletteRan).toEqual(Option.some('dark'))
    expect(ran.widgets.palette.isOpen).toBe(false)
  })

  it('settle the upload toast it showed, on its own stack', () => {
    const started = send(Widgets.Message.StartedUpload())
    const [loading] = started.widgets.toasts.promise.entries
    expect(loading?.type).toBe('loading')
    expect(started.widgets.toasts.types.entries).toHaveLength(0)
    const finished = update(
      started,
      Message.GotWidget({
        message: Widgets.Message.FinishedUpload({ id: loading?.id ?? '' }),
      }),
    ).model
    expect(finished.widgets.toasts.promise.entries.map(entry => [entry.type, entry.title])).toEqual(
      [['success', 'Uploaded']],
    )
  })
})

describe('the overlay previews', () => {
  it('open and close each dialog and sheet on its own', () => {
    const terms = send(Widgets.Message.OpenedDialogAt({ example: 'terms' }))
    expect(terms.widgets.dialogs.terms.isOpen).toBe(true)
    expect(terms.widgets.dialogs.form.isOpen).toBe(false)
    const drawer = send(Widgets.Message.OpenedSheet({ example: 'drawer' }))
    expect(Sheet.isOpen(drawer.widgets.sheets.drawer)).toBe(true)
    expect(Sheet.isOpen(drawer.widgets.sheets.right)).toBe(false)
    const shut = update(
      drawer,
      Message.GotWidget({ message: Widgets.Message.ClosedSheet({ example: 'drawer' }) }),
    ).model
    expect(Sheet.isOpen(shut.widgets.sheets.drawer)).toBe(false)
  })
})

describe('the chart previews', () => {
  it('light one chart’s point, and keep the Model when it is lit already', () => {
    const point = Widgets.Message.GotChart({
      example: 'line',
      message: Chart.Message.Pointed({ point: 2 }),
    })
    const lit = update(initial, Message.GotWidget({ message: point })).model
    expect(lit.widgets.charts.line.point).toEqual(Option.some(2))
    expect(lit.widgets.charts.bar.point).toEqual(Option.none())
    expect(update(lit, Message.GotWidget({ message: point })).model.widgets).toBe(lit.widgets)
  })
})

describe('the Drawer preview', () => {
  it('opens on a press of its handle, and a press that changes nothing keeps the Model', () => {
    expect(initial.widgets.drawer.open).toBe(false)
    const pressed = send(Widgets.Message.GotDrawer({ message: Drawer.Message.Pressed() }))
    expect(pressed.widgets.drawer.open).toBe(true)
    expect(initial.widgets.drawer.open).toBe(false)
    const dragged = update(
      pressed,
      Message.GotWidget({
        message: Widgets.Message.GotDrawer({ message: Drawer.Message.Dragged({ delta: 5 }) }),
      }),
    ).model
    expect(dragged.widgets.drawer).toBe(pressed.widgets.drawer)
  })
})
