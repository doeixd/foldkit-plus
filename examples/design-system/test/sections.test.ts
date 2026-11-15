import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Menu, TagsInput } from 'foldkit-mixins-ui'
import { Combobox, DatePicker, FileDrop, Listbox } from '@foldkit/ui'
import * as UiMenu from '@foldkit/ui/menu'
import { Dialog as UiDialog } from '@foldkit/ui'
import { HoverIntent as UiHoverIntent } from '@foldkit/ui'
import { Popover as UiPopover } from '@foldkit/ui'
import { RadioGroup as UiRadioGroup } from '@foldkit/ui'
import { Tabs as UiTabs } from '@foldkit/ui'
import * as Animation from '@foldkit/ui/animation'
import { File as FoldkitFile } from 'foldkit'
import * as UiTooltip from '@foldkit/ui/tooltip'
import * as Buttons from '../src/sections/buttons.js'
import * as Choice from '../src/sections/choice.js'
import * as Collections from '../src/sections/collections.js'
import * as DateSection from '../src/sections/date.js'
import * as Feedback from '../src/sections/feedback.js'
import * as Form from '../src/sections/form.js'
import * as Navigation from '../src/sections/navigation.js'
import * as Overlays from '../src/sections/overlays.js'
import * as Utilities from '../src/sections/utilities.js'

describe('navigation', () => {
  it('selects tabs, a plan and a page', () => {
    const tabs = Navigation.update(
      Navigation.initModel(),
      Navigation.Message.SectionsTabs({
        message: UiTabs.Message.SelectedTab({ index: 2, value: 'settings' }),
      }),
    )
    expect(tabs.model.lineTab).toBe('settings')
    const pill = Navigation.update(
      tabs.model,
      Navigation.Message.RangeTabs({
        message: UiTabs.Message.SelectedTab({ index: 2, value: 'month' }),
      }),
    )
    expect(pill.model.pillTab).toBe('month')
    const plan = Navigation.update(
      pill.model,
      Navigation.Message.PlanSelected({ plan: 'enterprise' }),
    )
    expect(plan.model.plan).toBe('enterprise')
    const page = Navigation.update(plan.model, Navigation.Message.PageSelected({ page: 3 }))
    expect(page.model.page).toBe(3)
  })
})

describe('buttons', () => {
  it('counts presses and toggles the text style', () => {
    const clicked = Buttons.update(Buttons.initModel(), Buttons.Message.ButtonClicked())
    expect(clicked.model.clicks).toBe(1)
    const bold = Buttons.update(clicked.model, Buttons.Message.BoldToggled({ value: true }))
    expect(bold.model.bold).toBe(true)
  })
})

describe('form', () => {
  it('types drafts, toggles options, and keeps dropped files until removed', () => {
    const named = Form.update(Form.initModel(), Form.Message.NameTyped({ value: 'Ada' }))
    expect(named.model.name).toBe('Ada')
    const bio = Form.update(named.model, Form.Message.BioTyped({ value: 'Analytical engines.' }))
    expect(bio.model.bio).toBe('Analytical engines.')
    const toggled = Form.update(bio.model, Form.Message.NotificationsToggled({ value: true }))
    expect(toggled.model.notifications).toBe(true)
    const untoggled = Form.update(toggled.model, Form.Message.MarketingToggled({ value: false }))
    expect(untoggled.model.marketing).toBe(false)
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })
    const dropped = Form.update(
      Form.initModel(),
      Form.Message.DropFiles({ message: FileDrop.Message.DroppedFiles({ files: [file] }) }),
    )
    expect(dropped.model.files).toHaveLength(1)
    expect(FoldkitFile.name(dropped.model.files[0]!)).toBe('note.txt')
    const removed = Form.update(dropped.model, Form.Message.RemoveFile({ index: 0 }))
    expect(removed.model.files).toHaveLength(0)
    const noFiles = Form.update(
      Form.initModel(),
      Form.Message.DropFiles({ message: FileDrop.Message.DroppedNonFiles() }),
    )
    expect(noFiles.model.files).toHaveLength(0)
  })

  it('adds a topic chip through the field’s own update', () => {
    const typed = Form.update(
      Form.initModel(),
      Form.Message.GotTopics({ message: TagsInput.Message.Typed({ text: 'ui', drawn: 0 }) }),
    )
    expect(typed.model.topics.draft).toBe('ui')
    const added = Form.update(
      typed.model,
      Form.Message.GotTopics({ message: TagsInput.Message.Committed() }),
    )
    expect(added.model.topics.tags).toEqual(['design', 'tokens', 'ui'])
  })
})

describe('choice', () => {
  it('selects a country, contact radio and disclosure, and drives the live slider', () => {
    const country = Choice.update(
      Choice.initModel(),
      Choice.Message.CountrySelected({ value: 'ca' }),
    )
    expect(country.model.country).toBe('ca')
    const details = Choice.update(country.model, Choice.Message.DetailsToggled({ value: true }))
    expect(details.model.detailsOpen).toBe(true)
    const contact = Choice.update(
      details.model,
      Choice.Message.ContactGroup({
        message: UiRadioGroup.Message.SelectedOption({ index: 1, value: 'phone' }),
      }),
    )
    expect(contact.model.contact).toBe('phone')
    // The slider's input reports each value it moves to, already on the step.
    expect(contact.model.volume).toBe(60)
    const turned = Choice.update(contact.model, Choice.Message.VolumeChanged({ value: 80 }))
    expect(turned.model.volume).toBe(80)
  })

  it('chooses a frequency from the listbox, and types to filter the combobox then takes the match', () => {
    const listOpened = Choice.update(
      Choice.initModel(),
      Choice.Message.Listbox({
        message: Listbox.Message.Opened({ maybeActiveItemIndex: Option.none() }),
      }),
    )
    expect(listOpened.model.listbox.isOpen).toBe(true)
    const listPicked = Choice.update(
      listOpened.model,
      Choice.Message.Listbox({ message: Listbox.Message.SelectedItem({ item: 'Weekly' }) }),
    )
    expect(listPicked.model.maybeFrequency).toEqual(Option.some('Weekly'))
    const typed = Choice.update(
      Choice.initModel(),
      Choice.Message.Combobox({ message: Combobox.Message.UpdatedInputValue({ value: 'qui' }) }),
    )
    expect(typed.model.combobox.inputValue).toBe('qui')
    const cityPicked = Choice.update(
      typed.model,
      Choice.Message.Combobox({
        message: Combobox.Message.SelectedItem({
          item: 'Quito',
          displayText: 'Quito',
          wasSelected: false,
        }),
      }),
    )
    expect(cityPicked.model.maybeCity).toEqual(Option.some('Quito'))
  })
})

describe('overlays', () => {
  it('toggles the popover', () => {
    const opened = Overlays.update(
      Overlays.initModel(),
      Overlays.Message.Popover({ message: UiPopover.Message.RequestedOpen() }),
    )
    expect(opened.model.popover.isOpen).toBe(true)
    const closed = Overlays.update(
      opened.model,
      Overlays.Message.Popover({ message: UiPopover.Message.RequestedClose() }),
    )
    expect(closed.model.popover.isOpen).toBe(false)
  })

  it('shows the tooltip after its delay and hides it on leave', () => {
    const entered = Overlays.update(
      Overlays.initModel(),
      Overlays.Message.Tooltip({ message: UiTooltip.Message.EnteredTrigger() }),
    )
    expect(entered.model.tooltip.isHovered).toBe(true)
    expect(entered.model.tooltip.isOpen).toBe(false)
    // The delay is scheduled, not skipped: the fold returns the wait command.
    const scheduled = 'commands' in entered ? entered.commands : undefined
    expect(scheduled?.length ?? 0).toBe(1)
    const version = entered.model.tooltip.pendingShowVersion
    const shown = Overlays.update(
      entered.model,
      Overlays.Message.Tooltip({
        message: UiTooltip.Message.CompletedWaitBeforeShowing({ version }),
      }),
    )
    expect(shown.model.tooltip.isOpen).toBe(true)
    const left = Overlays.update(
      shown.model,
      Overlays.Message.Tooltip({ message: UiTooltip.Message.LeftTrigger() }),
    )
    expect(left.model.tooltip.isOpen).toBe(false)
  })

  it('opens the hover card after its delay and closes it on leave', () => {
    const entered = Overlays.update(
      Overlays.initModel(),
      Overlays.Message.HoverCard({ message: UiHoverIntent.Message.EnteredTrigger() }),
    )
    expect(entered.model.hoverCard.isOpen).toBe(false)
    const version = entered.model.hoverCard.pendingOpenVersion
    const shown = Overlays.update(
      entered.model,
      Overlays.Message.HoverCard({
        message: UiHoverIntent.Message.CompletedWaitBeforeOpening({ version }),
      }),
    )
    expect(shown.model.hoverCard.isOpen).toBe(true)
    const left = Overlays.update(
      shown.model,
      Overlays.Message.HoverCard({ message: UiHoverIntent.Message.LeftTrigger() }),
    )
    const closeVersion = left.model.hoverCard.pendingCloseVersion
    const closed = Overlays.update(
      left.model,
      Overlays.Message.HoverCard({
        message: UiHoverIntent.Message.CompletedWaitBeforeClosing({ version: closeVersion }),
      }),
    )
    expect(closed.model.hoverCard.isOpen).toBe(false)
  })

  it('reports the value of the menu row picked, and keeps it while the menu opens again', () => {
    const got = (message: UiMenu.Message) =>
      Overlays.Message.Menu({ message: Menu.Message.GotMenu({ message }) })
    const opened = Overlays.update(
      Overlays.initModel(),
      got(UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(1) })),
    )
    expect(opened.model.menu.menu.isOpen).toBe(true)
    const picked = Overlays.update(
      opened.model,
      got(UiMenu.Message.SelectedItem({ index: 1, item: 'forward' })),
    )
    expect(picked.model.picked).toEqual(Option.some('forward'))
    expect(picked.model.menu.menu.isOpen).toBe(false)
    const again = Overlays.update(
      picked.model,
      got(UiMenu.Message.Opened({ maybeActiveItemIndex: Option.none() })),
    )
    expect(again.model.picked).toEqual(Option.some('forward'))
  })

  it('returns the Model it was given when the menu changes nothing', () => {
    const model = Overlays.initModel()
    expect(
      Overlays.update(
        model,
        Overlays.Message.Menu({
          message: Menu.Message.GotMenu({ message: UiMenu.Message.Closed() }),
        }),
      ).model,
    ).toBe(model)
  })
})

describe('feedback', () => {
  it('opens the dialog on request and closes it on request', () => {
    const opened = Feedback.update(Feedback.initModel(), Feedback.Message.OpenDeleteDialog())
    expect(opened.model.dialog.isOpen).toBe(true)
    const closed = Feedback.update(
      opened.model,
      Feedback.Message.DeleteDialog({ message: UiDialog.Message.RequestedClose() }),
    )
    expect(closed.model.dialog.isOpen).toBe(false)
  })

  it('stacks a toast, and the settled leave animation removes it', () => {
    const notified = Feedback.update(Feedback.initModel(), Feedback.Message.NotifyPressed())
    expect(notified.model.toast.entries).toHaveLength(1)
    expect(notified.model.toast.entries[0]?.payload.title).toBe('Saved')
    const entryId = notified.model.toast.entries[0]?.id ?? ''
    const dismissing = Feedback.update(
      notified.model,
      Feedback.Message.Toast({ message: Feedback.ToastStack.Message.Dismissed({ entryId }) }),
    )
    expect(dismissing.model.toast.entries).toHaveLength(1)
    expect(dismissing.model.toast.entries[0]?.animation.transitionState).toBe('LeaveStart')
    const generation = dismissing.model.toast.entries[0]?.animation.transitionGeneration ?? 0
    const painted = Feedback.update(
      dismissing.model,
      Feedback.Message.Toast({
        message: Feedback.ToastStack.Message.GotAnimationMessage({
          entryId,
          message: Animation.Message.CompletedWaitForPaint({ generation }),
        }),
      }),
    )
    expect(painted.model.toast.entries).toHaveLength(1)
    const dismissed = Feedback.update(
      painted.model,
      Feedback.Message.Toast({
        message: Feedback.ToastStack.Message.GotAnimationMessage({
          entryId,
          message: Animation.Message.EndedAnimation({ generation }),
        }),
      }),
    )
    expect(dismissed.model.toast.entries).toHaveLength(0)
  })
})

describe('date', () => {
  it('opens the picker from its trigger', () => {
    const opened = DateSection.update(
      DateSection.initModel({ year: 2026, month: 10, day: 8 }),
      DateSection.Message.DatePicker({ message: DatePicker.Message.Opened() }),
    )
    expect(opened.model.picker.popover.isOpen).toBe(true)
  })
})

describe('utilities', () => {
  it('previews the typed address', () => {
    const typed = Utilities.update(
      Utilities.initModel(),
      Utilities.Message.AddressTyped({ value: 'pricing' }),
    )
    expect(typed.model.address).toBe('pricing')
  })
})

describe('collections', () => {
  it('searches the notifications, and clearing takes focus back to the field', () => {
    const typed = Collections.update(
      Collections.initModel(),
      Collections.Message.NoticesSearched({ value: 'deploy' }),
    )
    expect(typed.model.query).toBe('deploy')
    expect(
      Collections.update(typed.model, Collections.Message.NoticesSearched({ value: 'deploy' }))
        .model,
    ).toBe(typed.model)
    const cleared = Collections.update(typed.model, Collections.Message.NoticesCleared())
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
    expect(Collections.noticesMatching(query)).toHaveLength(count)
  })
})
