/**
 * The previews with state of their own: each component's Message reaches its
 * own Model through the site's update, and what it reports becomes the
 * value the preview shows.
 */
import {
  Dialog as UiDialog,
  Listbox as UiListbox,
  Menu as UiMenu,
  RadioGroup as UiRadioGroup,
  Tabs as UiTabs,
} from '@foldkit/ui'
import { Option } from 'effect'
import {
  Chart,
  Drawer,
  ImageCropper,
  InputCopy,
  Menu,
  MessageScroller,
  Sheet,
  FileDrop,
} from 'foldkit-mixins-ui'
import { ClipboardMessage } from 'foldkit-primitives/dom'
import { describe, expect, it } from 'vitest'

import * as Snippet from '../src/snippets/components.js'
import * as Widgets from '../src/gallery/widgets.js'
import { Message, initial, update } from '../src/main.js'

const send = (message: Widgets.Message) => update(initial, Message.GotWidget({ message })).model

describe('the previews with state', () => {
  it('show the tab that was chosen', () => {
    const chosen = send(
      Widgets.Message.GotTabs({
        message: UiTabs.Message.SelectedTab({ index: 1, value: 'activity' }),
      }),
    )
    expect(chosen.widgets.section).toBe('activity')
    expect(initial.widgets.section).toBe('overview')
  })

  it('keep the billing that was chosen', () => {
    const chosen = send(
      Widgets.Message.GotBillingGroup({
        message: UiRadioGroup.Message.SelectedOption({ index: 2, value: 'lifetime' }),
      }),
    )
    expect(chosen.widgets.billing).toBe('lifetime')
  })

  it('list the files the drop zone took, by name and size', () => {
    const dropped = send(
      Widgets.Message.GotDrop({
        message: FileDrop.Message.DroppedFiles({
          files: [new File(['abc'], 'a.txt'), new File(['de'], 'b.png')],
        }),
      }),
    )
    expect(dropped.widgets.attachments).toEqual([
      { name: 'a.txt', size: 3 },
      { name: 'b.png', size: 2 },
    ])
    const more = update(
      dropped,
      Message.GotWidget({
        message: Widgets.Message.GotDrop({
          message: FileDrop.Message.DroppedFiles({ files: [new File([''], 'c.md')] }),
        }),
      }),
    ).model
    expect(more.widgets.attachments.map(file => file.name)).toEqual(['a.txt', 'b.png', 'c.md'])
    const refused = send(Widgets.Message.GotDrop({ message: FileDrop.Message.DroppedNonFiles() }))
    expect(refused.widgets.attachments).toEqual([])
  })

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

  it('keep the action and frequency that were chosen', () => {
    const acted = send(
      Widgets.Message.GotPageMenu({
        message: Menu.Message.GotMenu({
          message: UiMenu.Message.SelectedItem({ index: 0, item: 'Rename' }),
        }),
      }),
    )
    expect(acted.widgets.pageChoice).toEqual(Option.some('Rename'))
    const backedUp = send(
      Widgets.Message.GotListbox({ message: UiListbox.Message.SelectedItem({ item: 'Weekly' }) }),
    )
    expect(initial.widgets.frequency).toEqual(Option.some('Daily'))
    expect(backedUp.widgets.frequency).toEqual(Option.some('Weekly'))
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

describe('the checkbox previews', () => {
  it('each hold their own state', () => {
    const terms = send(Widgets.Message.ToggledTerms({ checked: true })).widgets
    expect([terms.terms, terms.toppings, terms.teamPlan]).toEqual([true, 'some', false])
    const team = send(Widgets.Message.ToggledTeamPlan({ checked: true })).widgets
    expect([team.terms, team.toppings, team.teamPlan]).toEqual([false, 'some', true])
  })

  it('turn the indeterminate one from some to all, then to none', () => {
    const all = send(Widgets.Message.ToggledToppings({ checked: true }))
    expect(all.widgets.toppings).toBe('all')
    const none = update(
      all,
      Message.GotWidget({ message: Widgets.Message.ToggledToppings({ checked: false }) }),
    ).model
    expect(none.widgets.toppings).toBe('none')
  })
})

describe('the pagination previews', () => {
  it('each move their own page', () => {
    const moved = send(Widgets.Message.ChosePage({ example: 'ends', page: 3 })).widgets.pages
    expect(moved).toEqual({ ...initial.widgets.pages, ends: 3 })
  })

  it('keep the first row shown in view when a page holds more rows', () => {
    // Page 3 of tens starts at row 21, which is on page 2 of twenties.
    const third = send(Widgets.Message.ChosePage({ example: 'range', page: 3 }))
    const larger = update(
      third,
      Message.GotWidget({ message: Widgets.Message.ChosePerPage({ perPage: 20 }) }),
    ).model.widgets
    expect([larger.perPage, larger.pages.range]).toEqual([20, 2])
  })
})

describe('the breadcrumb preview', () => {
  it('unfolds its trail once, and stays unfolded', () => {
    const expanded = send(Widgets.Message.ExpandedTrail())
    expect([initial.widgets.trailExpanded, expanded.widgets.trailExpanded]).toEqual([false, true])
    expect(
      update(expanded, Message.GotWidget({ message: Widgets.Message.ExpandedTrail() })).model,
    ).toBe(expanded)
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

describe('the form previews', () => {
  it('keep each custom select its own fruit', () => {
    const picked = send(
      Widgets.Message.GotSelect({
        example: 'icons',
        message: UiListbox.Message.SelectedItem({ item: 'Banana' }),
      }),
    )
    expect(picked.widgets.selects.icons.fruit).toEqual(Option.some('Banana'))
    expect(picked.widgets.selects.custom.fruit).toEqual(initial.widgets.selects.custom.fruit)
  })

  it('show the key copied until its reset, and a refused copy as failed', () => {
    const copied = send(Widgets.Message.GotCopy({ message: ClipboardMessage.Copied() }))
    expect(copied.widgets.inputCopy.copied).toBe(true)
    const reset = update(
      copied,
      Message.GotWidget({
        message: Widgets.Message.GotInputCopy({
          message: InputCopy.Message.ElapsedReset({ copy: copied.widgets.inputCopy.copies }),
        }),
      }),
    ).model
    expect(reset.widgets.inputCopy.copied).toBe(false)
    const refused = send(
      Widgets.Message.GotCopy({ message: ClipboardMessage.CopyFailed({ message: 'denied' }) }),
    )
    expect(refused.widgets.inputCopy.copied).toBe(false)
    expect(refused.widgets.inputCopy.failed).toBe(true)
  })

  it('keep what Caps Lock was read as through a key that says nothing of it', () => {
    const on = send(Widgets.Message.ReadCapsLock({ reading: Option.some(true) }))
    expect(on.widgets.capsLock).toBe(true)
    const digit = update(
      on,
      Message.GotWidget({ message: Widgets.Message.ReadCapsLock({ reading: Option.none() }) }),
    ).model
    expect(digit.widgets).toBe(on.widgets)
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

describe('the navigation previews', () => {
  it('close a file in one tab example and leave the other', () => {
    const closed = send(Widgets.Message.ClosedFile({ example: 'closable', file: 'tabs.ts' }))
    expect(closed.widgets.files.closable.files).not.toContain('tabs.ts')
    expect(closed.widgets.files.closable.chosen).not.toBe('tabs.ts')
    expect(closed.widgets.files.scrolling.files).toContain('tabs.ts')
  })
})

describe('the data previews', () => {
  it('choose an invoice once, and keep the Model when it is chosen again', () => {
    const chosen = send(Widgets.Message.ChoseInvoice({ id: 'INV-003', selected: true }))
    expect(chosen.widgets.invoicesChosen).toEqual(['INV-002', 'INV-003'])
    const again = update(
      chosen,
      Message.GotWidget({
        message: Widgets.Message.ChoseInvoice({ id: 'INV-003', selected: true }),
      }),
    )
    expect(again.model.widgets).toBe(chosen.widgets)
    expect(
      send(Widgets.Message.ChoseInvoice({ id: 'INV-002', selected: false })).widgets.invoicesChosen,
    ).toEqual([])
  })

  it('sort the invoices ascending, then descending, then not at all', () => {
    const sort = (model: typeof initial) =>
      update(
        model,
        Message.GotWidget({ message: Widgets.Message.SortedInvoices({ column: 'amount' }) }),
      ).model
    const once = sort(initial)
    const twice = sort(once)
    expect([once, twice, sort(twice)].map(model => model.widgets.invoiceSort)).toEqual([
      Option.some({ column: 'amount', direction: 'ascending' }),
      Option.some({ column: 'amount', direction: 'descending' }),
      Option.none(),
    ])
  })
})

describe('the chat and long-tail previews', () => {
  const after = (...messages: ReadonlyArray<Widgets.Message>) =>
    messages.reduce(
      (model, message) => update(model, Message.GotWidget({ message })).model,
      initial,
    ).widgets

  it('count what is sent while the reader has scrolled up, and nothing loaded above', () => {
    const away = after(
      Widgets.Message.GotChatScroller({ message: MessageScroller.Message.LeftEnd() }),
    )
    const sent = after(
      Widgets.Message.GotChatScroller({ message: MessageScroller.Message.LeftEnd() }),
      Widgets.Message.SentChat(),
      Widgets.Message.LoadedOlderChat(),
    )
    expect(away.chatScroller.unseen).toBe(0)
    expect(sent.chatScroller.unseen).toBe(2)
    expect(sent.chatEntries).toHaveLength(initial.widgets.chatEntries.length + 6)
    expect(sent.chatEntries[0]?.id).toBe('older-1-0')
    expect(sent.chatEntries.at(-1)?.id).toBe('reply-1')
    expect(new Set(sent.chatEntries.map(entry => entry.id)).size).toBe(sent.chatEntries.length)
  })

  it('stream the answer to its end, then start over', () => {
    const whole = after(...Array.from({ length: 7 }, () => Widgets.Message.StreamedWords()))
    expect(whole.streamed).toBe(Snippet.ANSWER.length)
    expect(after(Widgets.Message.StreamedWords()).streamed).toBe(10)
    const again = update(
      { ...initial, widgets: whole },
      Message.GotWidget({ message: Widgets.Message.StreamedWords() }),
    ).model.widgets
    expect(again.streamed).toBe(3)
  })

  it('send a failed message again once, and keep the Model on a second retry', () => {
    const retried = update(
      initial,
      Message.GotWidget({ message: Widgets.Message.RetriedChat() }),
    ).model
    expect(retried.widgets.chatRetried).toBe(true)
    expect(
      update(retried, Message.GotWidget({ message: Widgets.Message.RetriedChat() })).model.widgets,
    ).toBe(retried.widgets)
  })

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

  it('keep the avatar crop’s export to show beside it', () => {
    const exported = after(
      Widgets.Message.GotAvatarCrop({
        message: ImageCropper.Message.Exported({
          url: 'data:image/png;base64,AA',
          width: 1,
          height: 1,
        }),
      }),
    )
    expect(exported.avatarUrl).toEqual(Option.some('data:image/png;base64,AA'))
  })
})

describe('the Input OTP states preview', () => {
  it('keeps each editable field its own code, apart from the basic one', () => {
    const filling = send(Widgets.Message.TypedStateCode({ field: 'filling', code: '4829' }))
    expect(filling.widgets.otpStates).toEqual({ filling: '4829', refused: '482910' })
    expect(filling.widgets.code).toBe('')
    const refused = update(
      filling,
      Message.GotWidget({
        message: Widgets.Message.TypedStateCode({ field: 'refused', code: '48291' }),
      }),
    ).model
    expect(refused.widgets.otpStates).toEqual({ filling: '4829', refused: '48291' })
    expect(
      update(
        refused,
        Message.GotWidget({
          message: Widgets.Message.TypedStateCode({ field: 'refused', code: '48291' }),
        }),
      ).model.widgets,
    ).toBe(refused.widgets)
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
