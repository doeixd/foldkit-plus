import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { TagsInput } from 'foldkit-mixins-ui'
import { Combobox, DatePicker, FileDrop, Listbox, Menu } from '@foldkit/ui'
import { Dialog as UiDialog } from '@foldkit/ui'
import { HoverIntent as UiHoverIntent } from '@foldkit/ui'
import { Popover as UiPopover } from '@foldkit/ui'
import { RadioGroup as UiRadioGroup } from '@foldkit/ui'
import { Tabs as UiTabs } from '@foldkit/ui'
import * as Animation from '@foldkit/ui/animation'
import { File as FoldkitFile } from 'foldkit'
import * as UiTooltip from '@foldkit/ui/tooltip'
import { Message, ToastStack, initModel, noticesMatching, update } from '../src/main.js'
import { noTweaks, tweaksCss, valueOf, withTweak } from '../src/tweaks.js'

const modelForTests = initModel({ year: 2026, month: 10, day: 8 })

describe('design-system update', () => {
  it('selects a scheme, tabs, and plan', () => {
    const scheme = update(modelForTests, Message.SchemeSelected({ scheme: 'dark' }))
    expect(scheme.model.scheme).toBe('dark')
    const tabs = update(
      scheme.model,
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
    // The slider's input reports each value it moves to, already on the step.
    expect(contact.model.volume).toBe(60)
    const turned = update(contact.model, Message.VolumeChanged({ value: 80 }))
    expect(turned.model.volume).toBe(80)
    const popoverOpened = update(
      turned.model,
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

  it('writes only the tweaked knobs on :root, unlayered, where derived tokens compute', () => {
    expect(tweaksCss(noTweaks)).toBe('')
    const tweaked = withTweak(withTweak(noTweaks, 'hue', 172), 'shadow', 60)
    expect(tweaksCss(tweaked)).toBe(':root{--fk-knob-accent-h:172;--fk-knob-shadow-strength:60%}')
  })

  it('shows the theme own value for a knob until a tweak covers it', () => {
    expect(valueOf('compact', noTweaks, 'density')).toBe(0.85)
    expect(valueOf('compact', withTweak(noTweaks, 'density', 1), 'density')).toBe(1)
  })

  it('picks a theme, clearing tweaks and announcing it, and applies it as a Command', () => {
    const tweaked = update(modelForTests, Message.TweakChanged({ tweak: 'radius', value: 1.5 }))
    expect(tweaked.model.tweaks.radius).toEqual(Option.some(1.5))
    const picked = update(tweaked.model, Message.ThemePicked({ name: 'soft' }))
    expect(picked.model.theme).toBe('soft')
    expect(picked.model.tweaks).toEqual(noTweaks)
    expect(picked.model.status).toBe('Soft theme applied')
    expect('commands' in picked ? picked.commands.length : 0).toBe(1)
  })

  it('returns the Model it was given for a choice already made', () => {
    expect(update(modelForTests, Message.ThemePicked({ name: 'shadcn' })).model).toBe(modelForTests)
    expect(update(modelForTests, Message.SchemeSelected({ scheme: 'system' })).model).toBe(
      modelForTests,
    )
    expect(update(modelForTests, Message.DirectionSelected({ dir: 'ltr' })).model).toBe(
      modelForTests,
    )
    expect(update(modelForTests, Message.TweaksReset()).model).toBe(modelForTests)
    expect(update(modelForTests, Message.ThemeChangedElsewhere({ name: 'shadcn' })).model).toBe(
      modelForTests,
    )
    expect(update(modelForTests, Message.SchemeChangedElsewhere({ scheme: 'system' })).model).toBe(
      modelForTests,
    )
  })

  it('keeps the Model when a tweak is set to the value it already holds', () => {
    const once = update(modelForTests, Message.TweakChanged({ tweak: 'hue', value: 172 }))
    expect(once.model).not.toBe(modelForTests)
    expect(update(once.model, Message.TweakChanged({ tweak: 'hue', value: 172 })).model).toBe(
      once.model,
    )
    const reset = update(once.model, Message.TweaksReset())
    expect(reset.model.tweaks).toEqual(noTweaks)
    expect(reset.model.status).toBe('Tweaks reset')
  })

  it('takes the theme and scheme another tab chose, and applies them here', () => {
    const theme = update(modelForTests, Message.ThemeChangedElsewhere({ name: 'hard' }))
    expect(theme.model.theme).toBe('hard')
    expect('commands' in theme ? theme.commands.length : 0).toBe(1)
    const scheme = update(modelForTests, Message.SchemeChangedElsewhere({ scheme: 'dark' }))
    expect(scheme.model.scheme).toBe('dark')
    expect('commands' in scheme ? scheme.commands.length : 0).toBe(1)
  })

  it('searches the notifications, and clearing takes focus back to the field', () => {
    const typed = update(modelForTests, Message.NoticesSearched({ value: 'deploy' }))
    expect(typed.model.query).toBe('deploy')
    expect(update(typed.model, Message.NoticesSearched({ value: 'deploy' })).model).toBe(
      typed.model,
    )
    const cleared = update(typed.model, Message.NoticesCleared())
    expect(cleared.model.query).toBe('')
    expect('commands' in cleared ? cleared.commands.length : 0).toBe(1)
  })

  it.each([
    ['', 3],
    ['DEPLOY', 1],
    ['  wren ', 1],
    ['onboarding', 1],
    ['nothing like it', 0],
  ])('finds %j among the notifications: %i', (query, count) => {
    expect(noticesMatching(query)).toHaveLength(count)
  })

  it('adds a topic chip through the field’s own update', () => {
    const typed = update(
      modelForTests,
      Message.GotTopics({ message: TagsInput.Message.Typed({ text: 'ui', drawn: 0 }) }),
    )
    expect(typed.model.topics.draft).toBe('ui')
    const added = update(typed.model, Message.GotTopics({ message: TagsInput.Message.Committed() }))
    expect(added.model.topics.tags).toEqual(['design', 'tokens', 'ui'])
  })
})
