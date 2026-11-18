/**
 * The sheet section's update: opening rests at the lowest point, the handle's
 * Messages and the Dialog's Escape fold into the Sheet's Model, the point is
 * read back from it, and a Message that changes nothing keeps the Model.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import { Option } from 'effect'
import { Sheet } from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'
import { Message, POINTS, initial, percentShown, restingPercent, update } from '../src/sheet/app.js'
import { island } from '../src/sheet/island.js'

const snapped = (at: number) =>
  Message.GotSheetMessage({ message: Sheet.Message.SnappedTo({ at }) })
const escape = Message.GotSheetMessage({
  message: Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedClose() }),
})

const opened = update(initial, Message.Opened())

describe('update flows', () => {
  it('starts closed, with the lowest point as the one it would open at', () => {
    expect(initial.sheet.dialog.isOpen).toBe(false)
    expect(percentShown(initial)).toEqual(Option.none())
    expect(restingPercent(initial)).toBe(30)
  })

  it('opens at the lowest point and asks the Dialog to show it', () => {
    expect(percentShown(opened.model)).toEqual(Option.some(30))
    expect(opened.commands?.length).toBeGreaterThan(0)
  })

  it('rests at the point a key names, and keeps the Model for the one it already rests at', () => {
    const raised = update(opened.model, snapped(1)).model
    expect(percentShown(raised)).toEqual(Option.some(60))
    expect(update(raised, snapped(1)).model).toBe(raised)
    expect(percentShown(update(raised, snapped(POINTS.length - 1)).model)).toEqual(Option.some(100))
  })

  it('ignores a point the sheet does not have', () => {
    expect(update(opened.model, snapped(POINTS.length)).model).toBe(opened.model)
    expect(update(opened.model, snapped(-1)).model).toBe(opened.model)
  })

  it('closes on the Dialog’s Escape, and opens again at the lowest point', () => {
    const raised = update(opened.model, snapped(2)).model
    const closed = update(raised, escape).model
    expect(percentShown(closed)).toEqual(Option.none())
    expect(percentShown(update(closed, Message.Opened()).model)).toEqual(Option.some(30))
  })

  it('keeps the Model for an Escape while closed', () => {
    expect(update(initial, escape).model).toBe(initial)
  })
})

describe('demo', () => {
  it('traces opening, two handle keys and Escape', () => {
    expect(island.runDemo()).toEqual([
      'start: closed',
      'opened: open at 30%',
      'handle key raised it: open at 60%',
      'End: open at 100%',
      'Escape: closed',
    ])
  })
})
