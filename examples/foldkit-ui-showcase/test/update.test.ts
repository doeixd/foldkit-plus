import { Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import { AppRoute, Message, update } from '../src/main.js'
import { modelForRoute } from './helpers.js'

const changedUrl = (raw: string): Message =>
  Message.ChangedUrl({
    url: Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`)),
  })

describe('ChangedUrl', () => {
  // `Nav`'s links push their URL, which comes back as a ChangedUrl, the
  // current page's link included.
  test('for the page already shown, with the menu closed, changes nothing', () => {
    const model = modelForRoute(AppRoute.Button())
    expect(update(model, changedUrl('http://localhost/button')).model).toBe(model)
  })

  test('to another page, with the menu closed, leaves the menu as it is', () => {
    const model = modelForRoute(AppRoute.Button())
    const next = update(model, changedUrl('http://localhost/tabs'))
    expect(next.model.route).toEqual(AppRoute.Tabs())
    expect(next.model.uiModel).toBe(model.uiModel)
    expect(next.commands ?? []).toEqual([])
  })
})
