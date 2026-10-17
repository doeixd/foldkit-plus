// @vitest-environment jsdom
/**
 * The date picker rendered on a server: its hidden inputs carry their `name`
 * in the markup, so a form submitted before the page hydrates still sends
 * the date.
 */
import { Effect, Option } from 'effect'
import * as Calendar from 'foldkit/calendar'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import * as UpstreamDatePicker from '@foldkit/ui/datePicker'
import { expect, test } from 'vitest'
import { view } from '../src/datePickerView.js'

type Message = UpstreamDatePicker.Message
type Model = UpstreamDatePicker.Model

const today = Calendar.make(2026, 4, 13)

test('the hidden input is named in the server markup', async () => {
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: UpstreamDatePicker.init({ id: 'picker', today }) }),
        view: (model: Model, h: HtmlBuilder<Message>) => ({
          title: 'Picker',
          body: view(
            model,
            {
              anchor: { placement: 'bottom-start' },
              maybeSelectedDate: Option.some(Calendar.make(2026, 4, 5)),
              name: 'dob',
              triggerContent: () => h.span([], ['Pick a date']),
              toCalendarView: () => h.div([], []),
            },
            h,
          ),
        }),
      },
      { buildId: 'b' },
    ),
  )
  const template =
    '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'
  const parsed = new DOMParser().parseFromString(injectIntoTemplate(template, served), 'text/html')
  const input = parsed.querySelector('input[type="hidden"]')
  expect(input?.getAttribute('name')).toBe('dob')
  expect(input?.getAttribute('value')).toBe('2026-04-05')
})
