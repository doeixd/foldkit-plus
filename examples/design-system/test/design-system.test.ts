import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Combobox, DatePicker, FileDrop, Listbox, Menu } from '@foldkit/ui'
import { Dialog as UiDialog } from '@foldkit/ui'
import { HoverIntent as UiHoverIntent } from '@foldkit/ui'
import { Popover as UiPopover } from '@foldkit/ui'
import { RadioGroup as UiRadioGroup } from '@foldkit/ui'
import { Tabs as UiTabs } from '@foldkit/ui'
import * as Animation from '@foldkit/ui/animation'
import { File as FoldkitFile } from 'foldkit'
import * as UiSlider from '@foldkit/ui/slider'
import * as UiTooltip from '@foldkit/ui/tooltip'
import { Message, ToastStack, initModel, rootOverrideOf, update } from '../src/main.js'

const modelForTests = initModel({ year: 2026, month: 10, day: 8 })

describe('design-system update', () => {
  it('selects a hue, scheme, shadow strength, tabs, and plan', () => {
    const hue = update(modelForTests, Message.HueSelected({ hue: 172 }))
    expect(hue.model.hue).toBe(172)
    const scheme = update(hue.model, Message.SchemeSelected({ scheme: 'dark' }))
    expect(scheme.model.scheme).toBe('dark')
    const shadow = update(scheme.model, Message.ShadowSelected({ strength: 60 }))
    expect(shadow.model.shadow).toBe(60)
    const tabs = update(
      shadow.model,
      Message.SectionsTabs({
        message: UiTabs.Message.SelectedTab({ index: 2, value: 'settings' }),
      }),
    )
    expect(tabs.model.lineTab).toBe('settings')
    const pill = update(
      tabs.model,
      Message.RangeTabs({
        message: UiTabs.Message.SelectedTab({ index: 2, value: 'month' }),
      }),
    )
    expect(pill.model.pillTab).toBe('month')
    const plan = update(pill.model, Message.PlanSelected({ plan: 'enterprise' }))
    expect(plan.model.plan).toBe('enterprise')
    const page = update(plan.model, Message.PageSelected({ page: 3 }))
    expect(page.model.page).toBe(3)
    const bold = update(page.model, Message.BoldToggled({ value: true }))
    expect(bold.model.bold).toBe(true)
  })

  it('types drafts, toggles options, and counts button presses', () => {
    const named = update(modelForTests, Message.NameTyped({ value: 'Ada' }))
    expect(named.model.name).toBe('Ada')
    const bio = update(named.model, Message.BioTyped({ value: 'Analytical engines.' }))
    expect(bio.model.bio).toBe('Analytical engines.')
    const toggled = update(bio.model, Message.NotificationsToggled({ value: true }))
    expect(toggled.model.notifications).toBe(true)
    const untoggled = update(toggled.model, Message.MarketingToggled({ value: false }))
    expect(untoggled.model.marketing).toBe(false)
    const clicked = update(untoggled.model, Message.ButtonClicked())
    expect(clicked.model.clicks).toBe(1)
  })

  it('selects a country, contact radio, and disclosure, drives the live slider, and toggles the popover', () => {
    const country = update(modelForTests, Message.CountrySelected({ value: 'ca' }))
    expect(country.model.country).toBe('ca')
    const details = update(country.model, Message.DetailsToggled({ value: true }))
    expect(details.model.detailsOpen).toBe(true)
    const contact = update(
      details.model,
      Message.ContactGroup({
        message: UiRadioGroup.Message.SelectedOption({ index: 1, value: 'phone' }),
      }),
    )
    expect(contact.model.contact).toBe('phone')
    // Arrow keys step through the child's keyboard navigation.
    const stepped = update(
      contact.model,
      Message.VolumeSlider({
        message: UiSlider.Message.PressedKeyboardNavigation({
          direction: 'StepIncrement',
          value: 60,
        }),
      }),
    )
    expect(stepped.model.volume).toBe(65)
    const steppedDown = update(
      stepped.model,
      Message.VolumeSlider({
        message: UiSlider.Message.PressedKeyboardNavigation({
          direction: 'StepDecrement',
          value: 65,
        }),
      }),
    )
    expect(steppedDown.model.volume).toBe(60)
    // A press starts the drag and each stop writes through ChangedValue.
    const pressed = update(
      steppedDown.model,
      Message.VolumeSlider({
        message: UiSlider.Message.PressedPointer({ value: 70, originValue: 60 }),
      }),
    )
    expect(pressed.model.volume).toBe(70)
    expect(pressed.model.volumeSlider.dragState._tag).toBe('Dragging')
    const dragged = update(
      pressed.model,
      Message.VolumeSlider({ message: UiSlider.Message.MovedDragPointer({ value: 80 }) }),
    )
    expect(dragged.model.volume).toBe(80)
    // A move with no drag in flight is ignored.
    const idle = update(
      modelForTests,
      Message.VolumeSlider({ message: UiSlider.Message.MovedDragPointer({ value: 80 }) }),
    )
    expect(idle.model.volume).toBe(60)
    const popoverOpened = update(
      dragged.model,
      Message.Popover({ message: UiPopover.Message.RequestedOpen() }),
    )
    expect(popoverOpened.model.popover.isOpen).toBe(true)
    const popoverClosed = update(
      popoverOpened.model,
      Message.Popover({ message: UiPopover.Message.RequestedClose() }),
    )
    expect(popoverClosed.model.popover.isOpen).toBe(false)
    const address = update(popoverClosed.model, Message.AddressTyped({ value: 'pricing' }))
    expect(address.model.address).toBe('pricing')
  })

  it('shows the tooltip after its delay and hides it on leave', () => {
    const entered = update(
      modelForTests,
      Message.Tooltip({ message: UiTooltip.Message.EnteredTrigger() }),
    )
    expect(entered.model.tooltip.isHovered).toBe(true)
    expect(entered.model.tooltip.isOpen).toBe(false)
    // The delay is scheduled, not skipped: the fold returns the wait command.
    const scheduled = 'commands' in entered ? entered.commands : undefined
    expect(scheduled?.length ?? 0).toBe(1)
    const version = entered.model.tooltip.pendingShowVersion
    const shown = update(
      entered.model,
      Message.Tooltip({ message: UiTooltip.Message.CompletedWaitBeforeShowing({ version }) }),
    )
    expect(shown.model.tooltip.isOpen).toBe(true)
    const left = update(shown.model, Message.Tooltip({ message: UiTooltip.Message.LeftTrigger() }))
    expect(left.model.tooltip.isOpen).toBe(false)
  })

  it('opens the dialog on request and closes it on request', () => {
    const opened = update(modelForTests, Message.OpenDeleteDialog())
    expect(opened.model.dialog.isOpen).toBe(true)
    const closed = update(
      opened.model,
      Message.DeleteDialog({ message: UiDialog.Message.RequestedClose() }),
    )
    expect(closed.model.dialog.isOpen).toBe(false)
  })

  it('opens the hover card after its delay and closes it on leave', () => {
    const entered = update(
      modelForTests,
      Message.HoverCard({ message: UiHoverIntent.Message.EnteredTrigger() }),
    )
    expect(entered.model.hoverCard.isOpen).toBe(false)
    const version = entered.model.hoverCard.pendingOpenVersion
    const shown = update(
      entered.model,
      Message.HoverCard({
        message: UiHoverIntent.Message.CompletedWaitBeforeOpening({ version }),
      }),
    )
    expect(shown.model.hoverCard.isOpen).toBe(true)
    const left = update(
      shown.model,
      Message.HoverCard({ message: UiHoverIntent.Message.LeftTrigger() }),
    )
    const closeVersion = left.model.hoverCard.pendingCloseVersion
    const closed = update(
      left.model,
      Message.HoverCard({
        message: UiHoverIntent.Message.CompletedWaitBeforeClosing({ version: closeVersion }),
      }),
    )
    expect(closed.model.hoverCard.isOpen).toBe(false)
  })

  it('drives the menu, listbox, combobox, date picker, toast, and file drop folds', () => {
    // Menu: open, pick, and the choice lands while the menu closes itself.
    const menuOpened = update(
      modelForTests,
      Message.Menu({ message: Menu.Message.Opened({ maybeActiveItemIndex: Option.none() }) }),
    )
    expect(menuOpened.model.menu.isOpen).toBe(true)
    const menuPicked = update(
      menuOpened.model,
      Message.Menu({ message: Menu.Message.SelectedItem({ index: 1, item: 'Duplicate' }) }),
    )
    expect(menuPicked.model.menuChoice).toBe('Duplicate')
    expect(menuPicked.model.menu.isOpen).toBe(false)

    // Listbox: open and choose a frequency.
    const listOpened = update(
      modelForTests,
      Message.Listbox({ message: Listbox.Message.Opened({ maybeActiveItemIndex: Option.none() }) }),
    )
    expect(listOpened.model.listbox.isOpen).toBe(true)
    const listPicked = update(
      listOpened.model,
      Message.Listbox({ message: Listbox.Message.SelectedItem({ item: 'Weekly' }) }),
    )
    expect(listPicked.model.maybeFrequency).toEqual(Option.some('Weekly'))

    // Combobox: type to filter, then take the match.
    const typed = update(
      modelForTests,
      Message.Combobox({ message: Combobox.Message.UpdatedInputValue({ value: 'qui' }) }),
    )
    expect(typed.model.combobox.inputValue).toBe('qui')
    const cityPicked = update(
      typed.model,
      Message.Combobox({
        message: Combobox.Message.SelectedItem({
          item: 'Quito',
          displayText: 'Quito',
          wasSelected: false,
        }),
      }),
    )
    expect(cityPicked.model.maybeCity).toEqual(Option.some('Quito'))

    // Date picker: the trigger opens the popover; picking a day is a browser test.
    const dateOpened = update(
      modelForTests,
      Message.DatePicker({ message: DatePicker.Message.Opened() }),
    )
    expect(dateOpened.model.picker.popover.isOpen).toBe(true)

    // Toast: Notify stacks one entry; dismissing starts the leave, and the
    // settled leave animation removes it.
    const notified = update(modelForTests, Message.NotifyPressed())
    expect(notified.model.toast.entries).toHaveLength(1)
    expect(notified.model.toast.entries[0]?.payload.title).toBe('Saved')
    const entryId = notified.model.toast.entries[0]?.id ?? ''
    const dismissing = update(
      notified.model,
      Message.Toast({ message: ToastStack.Message.Dismissed({ entryId }) }),
    )
    expect(dismissing.model.toast.entries).toHaveLength(1)
    expect(dismissing.model.toast.entries[0]?.animation.transitionState).toBe('LeaveStart')
    const generation = dismissing.model.toast.entries[0]?.animation.transitionGeneration ?? 0
    const painted = update(
      dismissing.model,
      Message.Toast({
        message: ToastStack.Message.GotAnimationMessage({
          entryId,
          message: Animation.Message.CompletedWaitForPaint({ generation }),
        }),
      }),
    )
    expect(painted.model.toast.entries).toHaveLength(1)
    const dismissed = update(
      painted.model,
      Message.Toast({
        message: ToastStack.Message.GotAnimationMessage({
          entryId,
          message: Animation.Message.EndedAnimation({ generation }),
        }),
      }),
    )
    expect(dismissed.model.toast.entries).toHaveLength(0)

    // File drop: a dropped file is kept; removing it by index drops it.
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })
    const dropped = update(
      modelForTests,
      Message.DropFiles({ message: FileDrop.Message.DroppedFiles({ files: [file] }) }),
    )
    expect(dropped.model.files).toHaveLength(1)
    expect(FoldkitFile.name(dropped.model.files[0]!)).toBe('note.txt')
    const removed = update(dropped.model, Message.RemoveFile({ index: 0 }))
    expect(removed.model.files).toHaveLength(0)
    const noFiles = update(
      modelForTests,
      Message.DropFiles({ message: FileDrop.Message.DroppedNonFiles() }),
    )
    expect(noFiles.model.files).toHaveLength(0)
  })

  it('declares the hue knob, shadow knob, and scheme on :root, where derived tokens compute', () => {
    expect(rootOverrideOf({ hue: 172, scheme: 'system', shadow: 100 })).toBe(
      ':root{--fk-knob-accent-h:172;--fk-knob-shadow-strength:100%;color-scheme:light dark}',
    )
    expect(rootOverrideOf({ hue: 222, scheme: 'dark', shadow: 60 })).toBe(
      ':root{--fk-knob-accent-h:222;--fk-knob-shadow-strength:60%;color-scheme:dark}',
    )
    expect(rootOverrideOf({ hue: 38, scheme: 'light', shadow: 30 })).toBe(
      ':root{--fk-knob-accent-h:38;--fk-knob-shadow-strength:30%;color-scheme:light}',
    )
  })
})
