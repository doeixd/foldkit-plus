/**
 * The previews with state of their own: each component's Message reaches its
 * own Model through the site's update, and what it reports becomes the
 * value the preview shows.
 */
import { Dialog as UiDialog, RadioGroup as UiRadioGroup, Tabs as UiTabs } from '@foldkit/ui'
import * as UiSlider from '@foldkit/ui/slider'
import { describe, expect, it } from 'vitest'

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

  it('step the volume from where it stands', () => {
    const stepped = send(
      Widgets.Message.GotSlider({
        message: UiSlider.Message.PressedKeyboardNavigation({
          direction: 'StepIncrement',
          value: initial.widgets.volume,
        }),
      }),
    )
    expect(initial.widgets.volume).toBe(60)
    expect(stepped.widgets.volume).toBe(65)
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
})
