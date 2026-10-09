import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Attributes, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { DismissLayer } from 'foldkit-primitives/interaction'
import {
  DESCRIPTION_ID,
  LAYER_ID,
  Stack,
  TITLE_ID,
  initial,
  update,
  type Message,
} from '../src/alert-dialog/app.js'
import { AlertDialog, AlertDialogSlots, AlertOverlay, runDemo } from '../src/alert-dialog/view.js'

const dismissNamed = Stack.wrapper.make(
  DismissLayer.Message.PressedEscape({
    layers: [{ id: LAYER_ID, outside: false, escape: false }],
  }),
)

describe('update flows', () => {
  it('starts closed and undecided', () => {
    expect(initial.model.open).toBe(false)
    expect(initial.model.answer).toEqual(Option.none())
  })

  it('confirms and cancels through the buttons', () => {
    const open = update(initial.model, { _tag: 'Opened' }).model
    expect(open.open).toBe(true)
    expect(update(open, { _tag: 'Confirmed' }).model).toEqual({
      ...open,
      open: false,
      answer: Option.some('confirmed'),
    })
    expect(update(open, { _tag: 'Cancelled' }).model.answer).toEqual(Option.some('cancelled'))
  })

  it('a dismissal naming the dialog changes nothing', () => {
    const open = update(initial.model, { _tag: 'Opened' }).model
    const after = update(open, dismissNamed).model
    expect(after.open).toBe(true)
    expect(after.answer).toEqual(Option.none())
  })
})

describe('view structure', () => {
  it('hides the dialog and its backdrop when closed, names it when open', () => {
    const shut = Inert.draw(AlertDialog, initial.model)
    expect(Inert.byRole(shut, 'alertdialog')).toHaveLength(0)
    expect(Inert.bySlot(shut, 'backdrop')).toHaveLength(0)
    const open = update(initial.model, { _tag: 'Opened' }).model
    const dialog = Inert.draw(AlertDialog, open)
    expect(Inert.bySlot(dialog, 'backdrop')).toHaveLength(1)
    const panel = Inert.byRole(dialog, 'alertdialog')
    expect(panel).toHaveLength(1)
    expect(Inert.value(panel[0], 'aria-modal')).toBe('true')
    expect(Inert.value(panel[0], 'aria-labelledby')).toBe(TITLE_ID)
    expect(Inert.value(panel[0], 'aria-describedby')).toBe(DESCRIPTION_ID)
    expect(Inert.byLabel(dialog, 'Cancel')).toHaveLength(1)
    expect(Inert.byLabel(dialog, 'Delete')).toHaveLength(1)
  })

  it('the panel carries the explicit policy mounts and opt-outs', () => {
    const h = SlotView.inertBuilder<Message>()
    const builders = SlotView.buildersFor(
      AlertDialogSlots,
      AlertOverlay.map(behavior => behavior.mixin),
      { input: update(initial.model, { _tag: 'Opened' }).model, h },
    )
    const mount = Attributes.find(builders.panel.attrs([]), 'OnMount') as unknown as {
      readonly action?: { readonly name?: string }
    }
    expect(mount?.action?.name).toContain('FocusScope')
    expect(mount?.action?.name).toContain('ScrollLock')
    expect(mount?.action?.name).toContain('HideOutside')
    const text = JSON.stringify(builders.panel.attrs([]))
    expect(text).toContain('data-foldkit-plus-layer-outside')
    expect(text).toContain('data-foldkit-plus-layer-escape')
  })
})

describe('demo', () => {
  it('traces open, ignored escape, and confirm', () => {
    expect(runDemo()).toEqual([
      'start: open=false answer=none',
      'opened: open=true answer=none',
      'escape pressed: open=true answer=none (ignored)',
      'confirmed: open=false answer=confirmed',
    ])
  })
})
