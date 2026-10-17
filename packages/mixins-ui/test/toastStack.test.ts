/**
 * The Toast component's update: a toast shown in front and counting down
 * once its clock is read; a hold stops every countdown and keeps what was
 * left; a timeout, a clock read or a stop from before a later start does
 * nothing; settling restarts the countdown for the outcome; and every
 * Message that changes nothing returns the Model it was given.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Toast } from '../src/index.js'

const names = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
  (result.commands ?? []).map(command => command.name)

const empty = Toast.init('toasts', { duration: 1000, max: 2 })
const shown = Toast.show(empty, { title: 'Saved' })
const entry = (model: Toast.Model, id = shown.id) => model.entries.find(each => each.id === id)!
/** The first toast's clock read at 100ms: it is running. */
const running = Toast.update(
  shown.model,
  Toast.Message.StartedClock({ id: shown.id, version: entry(shown.model).version, at: 100 }),
).model

describe('Toast.update', () => {
  it('shows a toast in front, asking for the clock to start its countdown', () => {
    const second = Toast.show(shown.model, { title: 'Sent' })
    expect(second.model.entries.map(each => each.title)).toEqual(['Sent', 'Saved'])
    expect(second.id).not.toBe(shown.id)
    expect(names(shown)).toContain('StartToastClock')
    expect(entry(running).countdown._tag).toBe('Running')
  })

  it('waits for a loading toast and one past max, without a clock', () => {
    const loading = Toast.show(empty, { title: 'Uploading', type: 'loading' })
    expect(names(loading)).not.toContain('StartToastClock')
    const three = Toast.show(Toast.show(running, { title: 'B' }).model, { title: 'C' })
    // The first is now third of two shown: its countdown stops.
    expect(entry(three.model).countdown._tag).toBe('Stopped')
    expect(names(three)).toContain('StopToastClock')
  })

  it('a hold stops the countdown, and the stop keeps what was left', () => {
    const held = Toast.update(running, Toast.Message.Held({ by: 'pointer', on: true }))
    expect(entry(held.model).countdown._tag).toBe('Stopped')
    expect(names(held)).toEqual(['StopToastClock'])
    const stopped = Toast.update(
      held.model,
      Toast.Message.StoppedClock({
        id: shown.id,
        version: entry(held.model).version,
        elapsed: 400,
      }),
    )
    expect(entry(stopped.model).remaining).toBe(600)
    // Let go, it starts again from there.
    const resumed = Toast.update(stopped.model, Toast.Message.Held({ by: 'pointer', on: false }))
    expect(names(resumed)).toEqual(['StartToastClock'])
  })

  it('does nothing for a timeout, a start or a stop from before', () => {
    const stale = entry(running).version - 1
    for (const message of [
      Toast.Message.TimedOut({ id: shown.id, version: stale }),
      Toast.Message.StartedClock({ id: shown.id, version: stale, at: 0 }),
      Toast.Message.StoppedClock({ id: shown.id, version: stale, elapsed: 5 }),
      Toast.Message.Held({ by: 'focus', on: false }),
      Toast.Message.Dismissed({ id: 'nobody' }),
      Toast.Message.PressedAction({ id: shown.id }),
    ]) {
      expect(Toast.update(running, message).model).toBe(running)
    }
    expect(Toast.settle(running, 'nobody', { title: 'x' }).model).toBe(running)
    expect(Toast.dismiss(running, 'nobody').model).toBe(running)
  })

  it('settling says the outcome and counts down afresh', () => {
    const loading = Toast.show(empty, { title: 'Uploading', type: 'loading' })
    const settled = Toast.settle(loading.model, loading.id, {
      title: 'Uploaded',
      type: 'success',
      description: 'report.pdf',
    })
    const after = entry(settled.model, loading.id)
    expect([after.type, after.title, after.description]).toEqual([
      'success',
      'Uploaded',
      Option.some('report.pdf'),
    ])
    expect(after.remaining).toBe(1000)
    expect(names(settled)).toEqual(['StartToastClock'])
  })

  it('an action leaves and sends Acted with its value', () => {
    const withAction = Toast.show(empty, {
      title: 'Archived',
      action: { label: 'Undo', value: 'undo' },
    })
    const acted = Toast.update(withAction.model, Toast.Message.PressedAction({ id: withAction.id }))
    expect(acted.outMessage).toEqual(Toast.OutMessage.Acted({ id: withAction.id, value: 'undo' }))
    expect(entry(acted.model, withAction.id).animation.transitionState).toBe('LeaveStart')
  })
})
