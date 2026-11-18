/**
 * The chat widgets' Bundles placed with `foldkit-bundle`: each starts from
 * its args and folds its own Messages through the placement.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Bundles, MessageScroller, ThinkingSteps } from '../src/index.js'

const App = Bundle.compose({ note: Schema.String }).pipe(
  Bundle.withChild('trace', Bundles.ThinkingSteps, { args: { openSteps: ['a'] } }),
  Bundle.withChild('tools', Bundles.ThinkingSteps, { args: { multiple: true } }),
  Bundle.withChild('chat', Bundles.MessageScroller, { args: { id: 'chat', opens: 'start' } }),
)
const update = App.placements.update(model => ({ model }))
const start = () => App.placements.initial({ note: '' }).model

describe('Bundles.ThinkingSteps', () => {
  it('starts following the work, with the steps its args open', () => {
    expect(start().trace).toEqual({ open: Option.none(), openSteps: ['a'] })
  })

  it('keeps what the reader asked for, and the same Model for the same ask', () => {
    const opened = update(
      start(),
      App.Message.GotTraceMessage({ message: ThinkingSteps.Message.Toggled({ open: true }) }),
    ).model
    expect(opened.trace.open).toEqual(Option.some(true))
    const again = update(
      opened,
      App.Message.GotTraceMessage({ message: ThinkingSteps.Message.Toggled({ open: true }) }),
    ).model
    expect(again.trace).toBe(opened.trace)
  })

  it('opens one step at a time, or many with `multiple`, held once for every press', () => {
    const press = (field: 'trace' | 'tools', id: string) =>
      field === 'trace'
        ? App.Message.GotTraceMessage({ message: ThinkingSteps.Message.ToggledStep({ id }) })
        : App.Message.GotToolsMessage({ message: ThinkingSteps.Message.ToggledStep({ id }) })
    const single = update(start(), press('trace', 'b')).model
    expect(single.trace.openSteps).toEqual(['b'])
    const many = update(update(start(), press('tools', 'a')).model, press('tools', 'b')).model
    expect(many.tools.openSteps).toEqual(['a', 'b'])
  })

  it('feeds the view: the open state, the open steps and a Message for each press', () => {
    const controls = ThinkingSteps.controls(start().trace, message => message)
    expect(controls.open).toEqual(Option.none())
    expect(controls.openSteps).toEqual(['a'])
    expect(controls.onToggle(true)).toEqual(ThinkingSteps.Message.Toggled({ open: true }))
    expect(controls.onToggleStep('x')).toEqual(ThinkingSteps.Message.ToggledStep({ id: 'x' }))
  })
})

describe('Bundles.MessageScroller', () => {
  it('starts where its args say it opens', () => {
    expect(start().chat).toMatchObject({ id: 'chat', opens: 'start', following: false })
  })

  it('counts what arrives while away and clears it when the end is reached', () => {
    const arrived = update(
      start(),
      App.Message.GotChatMessage({ message: MessageScroller.Message.Appended({ count: 2 }) }),
    ).model
    expect(arrived.chat.unseen).toBe(2)
    const reached = update(
      arrived,
      App.Message.GotChatMessage({ message: MessageScroller.Message.ReachedEnd() }),
    ).model
    expect(reached.chat).toMatchObject({ following: true, unseen: 0 })
  })
})
