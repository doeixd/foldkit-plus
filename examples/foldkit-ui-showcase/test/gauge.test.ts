/**
 * The Meter and Progress this showcase ports from upstream `@foldkit/ui`,
 * which the pinned 0.163.0 lacks: their ARIA and data attributes, and the
 * width of the bar, from upstream's own scene tests.
 */
import { Option } from 'effect'
import type { Update } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { expect, given, role, scene, selector } from 'foldkit/scene'
import { describe, test } from 'vitest'

import * as Meter from '../src/ui/meter.js'
import * as Progress from '../src/ui/progress.js'

const Message = defineMessageUnion({ Ignored: {} })
type Message = typeof Message.Type

type Model = Readonly<Record<string, never>>

const update = (model: Model): Update.Return<Model, Message> => ({ model })

const meterView =
  (value: number, thresholds: Option.Option<Meter.Thresholds> = Option.none()) =>
  (_model: Model, h: HtmlBuilder<Message>) =>
    Meter.view(
      {
        id: 'test',
        value,
        thresholds,
        valueText: `${value} used`,
        toView: ({ meter, label, fill }) =>
          h.div(meter, [h.span(label, ['Storage']), h.div([...fill, h.Id('test-fill')])]),
      },
      h,
    )

const progressView =
  (maybeValue: Option.Option<number>) => (_model: Model, h: HtmlBuilder<Message>) =>
    Progress.view(
      {
        id: 'test',
        maybeValue,
        valueText: 'Uploading',
        toView: ({ progress, label, track, indicator }) =>
          h.div(progress, [
            h.span(label, ['Upload']),
            h.div([...track, h.Id('test-track')], [h.div([...indicator, h.Id('test-indicator')])]),
          ]),
      },
      h,
    )

const meter = role('meter')
const fill = selector('#test-fill')
const progressbar = role('progressbar')
const indicator = selector('#test-indicator')

describe('Meter', () => {
  test('renders the value against the range, named by its label', () => {
    scene(
      { update, view: meterView(25) },
      given({}),
      expect(meter).toHaveAttr('aria-valuemin', '0'),
      expect(meter).toHaveAttr('aria-valuemax', '100'),
      expect(meter).toHaveAttr('aria-valuenow', '25'),
      expect(meter).toHaveAttr('aria-valuetext', '25 used'),
      expect(meter).toHaveAttr('aria-labelledby', 'test-label'),
      expect(selector('#test-label')).toHaveText('Storage'),
      expect(fill).toHaveStyle('width', '25%'),
    )
  })

  test.each([
    { value: -5, expectedValue: '0', expectedWidth: '0%' },
    { value: 125, expectedValue: '100', expectedWidth: '100%' },
  ])('clamps $value before rendering', ({ value, expectedValue, expectedWidth }) => {
    scene(
      { update, view: meterView(value) },
      given({}),
      expect(meter).toHaveAttr('aria-valuenow', expectedValue),
      expect(fill).toHaveAttr('data-value', expectedValue),
      expect(fill).toHaveStyle('width', expectedWidth),
    )
  })

  test('exposes its thresholds only when it has them', () => {
    scene(
      { update, view: meterView(82, Option.some({ low: 30, high: 80, optimum: 20 })) },
      given({}),
      expect(meter).toHaveAttr('data-low', '30'),
      expect(meter).toHaveAttr('data-high', '80'),
      expect(meter).toHaveAttr('data-optimum', '20'),
    )
    scene({ update, view: meterView(82) }, given({}), expect(meter).not.toHaveAttr('data-high'))
  })
})

describe('Progress', () => {
  test.each([
    { value: 42, state: 'loading', width: '42%' },
    { value: 100, state: 'complete', width: '100%' },
    { value: 140, state: 'complete', width: '100%' },
  ])('at $value is $state', ({ value, state, width }) => {
    scene(
      { update, view: progressView(Option.some(value)) },
      given({}),
      expect(progressbar).toHaveAttr('aria-valuenow', String(Math.min(value, 100))),
      expect(progressbar).toHaveAttr('data-state', state),
      expect(indicator).toHaveStyle('width', width),
    )
  })

  test('without a value is indeterminate and claims no value', () => {
    scene(
      { update, view: progressView(Option.none()) },
      given({}),
      expect(progressbar).toHaveAttr('data-state', 'indeterminate'),
      expect(progressbar).not.toHaveAttr('aria-valuenow'),
      expect(progressbar).toHaveAttr('aria-valuetext', 'Uploading'),
      expect(indicator).toHaveAttr('data-indeterminate', ''),
    )
  })
})
