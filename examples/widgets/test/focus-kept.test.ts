/**
 * The focus-kept section's update: a row is removed by its id, an id that is
 * not there changes nothing, a row added later never reuses an id, and the
 * toast stack takes its toasts from `Toast.show`. Where focus goes is
 * `focus-kept.browser.test.ts`'s.
 */
import { Toast } from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'
import { Message, initial, update } from '../src/focus-kept/app.js'
import { island } from '../src/focus-kept/island.js'

const titles = (notices: ReadonlyArray<{ readonly title: string }>) =>
  notices.map(notice => notice.title)

describe('the lists', () => {
  it('start with three of each', () => {
    expect(titles(initial.alerts)).toEqual([
      'Disk almost full',
      'Backup finished',
      'Update available',
    ])
    expect(titles(initial.cards)).toEqual(['Invoice 1042', 'Invoice 1043', 'Invoice 1044'])
  })

  it('remove an alert and a card by their ids, each from its own list', () => {
    const alerts = update(initial, Message.DismissedAlert({ id: 'alert-2' })).model
    expect(titles(alerts.alerts)).toEqual(['Disk almost full', 'Update available'])
    expect(alerts.cards).toBe(initial.cards)
    const cards = update(initial, Message.DismissedCard({ id: 'card-1' })).model
    expect(titles(cards.cards)).toEqual(['Invoice 1043', 'Invoice 1044'])
    expect(cards.alerts).toBe(initial.alerts)
  })

  it('keep the Model for an id that is not in the list, and for one in the other list', () => {
    expect(update(initial, Message.DismissedAlert({ id: 'nope' })).model).toBe(initial)
    expect(update(initial, Message.DismissedCard({ id: 'alert-1' })).model).toBe(initial)
    expect(update(initial, Message.DismissedAlert({ id: 'card-1' })).model).toBe(initial)
  })

  it('give a row added after a dismissal an id the list has not used', () => {
    const dismissed = update(initial, Message.DismissedAlert({ id: 'alert-3' })).model
    const added = update(dismissed, Message.AddedAlert()).model
    expect(added.alerts.map(alert => alert.id)).toEqual(['alert-1', 'alert-2', 'alert-4'])
    const cards = update(
      update(initial, Message.DismissedCard({ id: 'card-3' })).model,
      Message.AddedCard(),
    ).model
    expect(cards.cards.map(card => card.id)).toEqual(['card-1', 'card-2', 'card-4'])
    expect(titles(cards.cards).at(-1)).toBe('Invoice 1045')
  })
})

describe('the toast stack', () => {
  it('shows a numbered toast in front, and asks for its clock and animation', () => {
    const first = update(initial, Message.ShowedToast())
    expect(first.model.toast.entries.map(entry => entry.title)).toEqual(['Saved draft 1'])
    expect(first.commands?.length).toBeGreaterThan(0)
    const second = update(first.model, Message.ShowedToast()).model
    expect(second.toast.entries.map(entry => entry.title)).toEqual([
      'Saved draft 2',
      'Saved draft 1',
    ])
    expect(new Set(second.toast.entries.map(entry => entry.id)).size).toBe(2)
  })

  it('keeps the Model for a Toast Message about a toast that is gone', () => {
    const shown = update(initial, Message.ShowedToast()).model
    expect(
      update(shown, Message.GotToastMessage({ message: Toast.Message.Dismissed({ id: 'gone' }) }))
        .model,
    ).toBe(shown)
  })

  it('leaves the stack when a toast is dismissed, once its exit has run', () => {
    const shown = update(initial, Message.ShowedToast()).model
    const [entry] = shown.toast.entries
    const dismissed = update(
      shown,
      Message.GotToastMessage({ message: Toast.Message.Dismissed({ id: entry!.id }) }),
    )
    expect(dismissed.model.toast).not.toBe(shown.toast)
    expect(dismissed.model.toastsShown).toBe(1)
  })
})

describe('demo', () => {
  it('traces two dismissals, a repeated one, a toast and an added card', () => {
    expect(island.runDemo()).toEqual([
      'start: alerts=3 cards=3 toasts=0',
      'dismissed Disk almost full: alerts=2 cards=3 toasts=0',
      'dismissed Invoice 1043: alerts=2 cards=2 toasts=0',
      'dismissed it again: alerts=2 cards=2 toasts=0',
      'showed a toast: alerts=2 cards=2 toasts=1',
      'added a card: alerts=2 cards=3 toasts=1',
    ])
  })
})
