/**
 * #472: on a plan that does not start now, a field whose binding names its
 * typing and that has no `KeepTyped` is refused, naming it: its typing before
 * boot would be lost at the first render. A plan that starts now, a closure
 * the page cannot name, and a kept field all render.
 */
import { Effect } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { Resume, SSR, type ResumableBuilder, type Start } from 'foldkit-ssr'
import { config, Message, plan, type Model } from './checkedFixture.js'

const rendering = (
  start: Start,
  field: (rh: ResumableBuilder<Message>) => unknown,
): Effect.Effect<unknown, unknown> =>
  SSR.render(
    {
      ...config,
      view: (_model: Model, h: HtmlBuilder<Message>) => {
        const rh = Resume.builder(h)
        return { title: 'Ticks', body: rh.main([], [field(rh) as never]) }
      },
    },
    plan(start),
    { buildId: 'b' },
  )

const text = (rh: ResumableBuilder<Message>) =>
  rh.input([rh.Id('size'), rh.OnInput(Message.Picked)])
const box = (rh: ResumableBuilder<Message>) =>
  rh.input([rh.Id('agree'), rh.Type('checkbox'), rh.OnClick(Message.Toggled())])

describe('a named field without KeepTyped', () => {
  it.each([
    { on: 'a text field', start: 'idle' as const, field: text, names: 'input#size' },
    { on: 'a checkbox', start: 'on-interaction' as const, field: box, names: 'input#agree' },
  ])('is refused on $on of a deferred plan', async ({ start, field, names }) => {
    const error = await Effect.runPromise(Effect.flip(rendering(start, field)))
    expect(error).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'UnkeptField' })
    expect((error as Error).message).toContain(`- ${names}`)
  })

  it.each([
    { on: 'a plan that starts now', start: 'now' as const, field: text },
    {
      on: 'a closure',
      start: 'idle' as const,
      field: (rh: ResumableBuilder<Message>) =>
        rh.input([rh.Id('size'), rh.OnInput(value => Message.Picked({ value }))]),
    },
    {
      on: 'a kept field',
      start: 'idle' as const,
      field: (rh: ResumableBuilder<Message>) =>
        rh.input([rh.Id('size'), rh.OnInput(Message.Picked), rh.KeepTyped()]),
    },
    {
      on: 'a button',
      start: 'idle' as const,
      field: (rh: ResumableBuilder<Message>) =>
        rh.button([rh.Id('press'), rh.OnClick(Message.Pressed())], []),
    },
  ])('renders for $on', async ({ start, field }) => {
    await Effect.runPromise(rendering(start, field))
  })
})
