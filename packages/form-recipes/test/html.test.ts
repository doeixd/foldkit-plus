// @vitest-environment jsdom
/**
 * The recipes' plain renderers: each a native input of the kind's type,
 * carrying the field's name, id and state, and a server's markup holds what a
 * post without scripts needs.
 */
import { Effect, Schema } from 'effect'
import { Form } from 'foldkit-form'
import { SlotView } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import { Inert } from 'foldkit-mixins/testing'
import { CalendarDate, make } from 'foldkit/calendar'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { FieldRecipes } from '../src/index.js'
import { renderers } from '../src/html.js'

const Event = Form.make(
  'Event',
  Form.input(Schema.Struct({ day: CalendarDate, at: Schema.String.check(Schema.isMinLength(1)) })),
  {
    inputs: {
      day: FieldRecipes.date().control,
      at: FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' }).control,
    },
  },
)
type Model = typeof Event.initial
const filled = Event.fill(Event.initial, {
  day: make(2026, 7, 1),
  at: '2026-07-01T08:30:00.000Z',
}).model
const View = FormView.define(Event, { renderers: renderers() })

describe('the recipes’ plain renderers', () => {
  it('draw each key as a native input of its type, with the field’s state', () => {
    const root = View({ model: filled, errors: [], canSubmit: false }, SlotView.inertBuilder())
    const inputs = Inert.byTag(root, 'input').map(input =>
      ['id', 'name', 'type', 'value', 'aria-required'].map(key => Inert.value(input, key)),
    )
    expect(inputs).toEqual([
      ['Event-day', 'day', 'date', '2026-07-01', 'true'],
      ['Event-at', 'at', 'datetime-local', '2026-07-01T09:30', 'true'],
    ])
  })

  // A date-time input given a value with an offset would show nothing (#313).
  it('draws a moment that needs its offset as text, and one that does not as a date-time', () => {
    const NewYork = Form.make('Event', Form.input(Schema.Struct({ at: Schema.String })), {
      inputs: {
        at: FieldRecipes.dateTime({ stored: 'instant', zone: 'America/New_York' }).control,
      },
    })
    const drawn = (at: string) =>
      Inert.byTag(
        FormView.define(NewYork, { renderers: renderers() })(
          { model: NewYork.fill(NewYork.initial, { at }).model, errors: [], canSubmit: false },
          SlotView.inertBuilder(),
        ),
        'input',
      ).map(input => [Inert.value(input, 'type'), Inert.value(input, 'value')])
    expect(drawn('2026-11-01T05:30:00.000Z')).toEqual([['datetime-local', '2026-11-01T01:30']])
    expect(drawn('2026-11-01T06:30:00.000Z')).toEqual([['text', '2026-11-01T01:30-05:00']])
  })

  it('serve each input with its name, type and value', async () => {
    const html = await Effect.runPromise(
      renderToString(
        {
          init: () => ({ model: filled }),
          view: (model: Model, h: HtmlBuilder<typeof Event.Message.Type>) => ({
            title: 'Event',
            body: View({ model, errors: [], canSubmit: false }, h),
          }),
        },
        { buildId: 'b' },
      ),
    )
    const page = new DOMParser().parseFromString(
      injectIntoTemplate(
        '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
        html,
      ),
      'text/html',
    )
    const posted = Array.from(page.querySelectorAll('input')).map(input => [
      input.getAttribute('name'),
      input.getAttribute('type'),
      input.getAttribute('value'),
    ])
    expect(posted).toEqual([
      ['day', 'date', '2026-07-01'],
      ['at', 'datetime-local', '2026-07-01T09:30'],
    ])
  })
})
