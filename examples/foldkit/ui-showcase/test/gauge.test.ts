/**
 * The Meter, Progress and Slider pages as the showcase configures them: each
 * demo's value, label and thresholds reach the component `@foldkit/ui` draws,
 * and the volume slider stands upright. How the components draw a value is
 * upstream's, tested there.
 */
import { expect, given, role, scene } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { AppRoute, update, view } from '../src/main.js'
import { modelForRoute } from './helpers.js'

const page = (route: AppRoute) => given(modelForRoute(route))

describe('the Meter page', () => {
  test('names each meter by its label and reports its value', () => {
    scene(
      { update, view },
      page(AppRoute.Meter()),
      expect(role('meter', { name: 'Health' })).toHaveAttr('aria-valuenow', '75'),
      expect(role('meter', { name: 'Health' })).toHaveAttr('aria-valuetext', '75 of 100 health'),
      expect(role('meter', { name: 'Storage' })).toHaveAttr('aria-valuenow', '82'),
      expect(role('meter', { name: 'Storage' })).toHaveAttr('aria-valuetext', '82 percent used'),
    )
  })

  test('gives the storage meter its thresholds, and the health meter none', () => {
    scene(
      { update, view },
      page(AppRoute.Meter()),
      expect(role('meter', { name: 'Storage' })).toHaveAttr('data-low', '30'),
      expect(role('meter', { name: 'Storage' })).toHaveAttr('data-high', '80'),
      expect(role('meter', { name: 'Storage' })).toHaveAttr('data-optimum', '20'),
      expect(role('meter', { name: 'Health' })).not.toHaveAttr('data-high'),
    )
  })
})

describe('the Progress page', () => {
  test('shows the upload at its value and the sync as indeterminate', () => {
    scene(
      { update, view },
      page(AppRoute.Progress()),
      expect(role('progressbar', { name: 'Upload' })).toHaveAttr('aria-valuenow', '42'),
      expect(role('progressbar', { name: 'Upload' })).toHaveAttr('data-state', 'loading'),
      expect(role('progressbar', { name: 'Syncing' })).toHaveAttr('data-state', 'indeterminate'),
      expect(role('progressbar', { name: 'Syncing' })).not.toHaveAttr('aria-valuenow'),
    )
  })
})

describe('the Slider page', () => {
  test('lays the rating out horizontally and stands the volume upright', () => {
    scene(
      { update, view },
      page(AppRoute.Slider()),
      expect(role('slider', { name: 'Rating' })).toHaveAttr('aria-orientation', 'horizontal'),
      expect(role('slider', { name: 'Volume' })).toHaveAttr('aria-orientation', 'vertical'),
    )
  })
})
