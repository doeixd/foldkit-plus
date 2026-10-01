// @vitest-environment jsdom
/**
 * What a route change does for a reader at a keyboard: the same address twice
 * is nothing, a new one moves focus to what it drew. A browser's `focus`, so
 * jsdom where the claim is about focus and not about rendering.
 */
import { Option } from 'effect'
import { fromString, type Url } from 'foldkit/url'
import { afterEach, expect, it } from 'vitest'

import { Message, focusMain, initial, update } from '../src/apps/siteApp.js'

const urlOrThrow = (raw: string): Url =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))

const main = () => {
  const element = document.createElement('main')
  element.id = 'site-main'
  element.tabIndex = -1
  document.body.append(element)
  return element
}

it('moves focus to what a route change drew', () => {
  const element = main()
  focusMain()
  expect(document.activeElement).toBe(element)
})

it('says nothing where there is nothing to move focus to', () => {
  expect(() => focusMain()).not.toThrow()
})

it('a route change moves focus, and the address it already shows does not', () => {
  const start = initial(urlOrThrow('http://studio/site/blog')).model
  const same = update(start, Message.UrlChanged({ url: urlOrThrow('http://studio/site/blog') }))
  expect(same.model).toBe(start)
  expect(same.commands ?? []).toEqual([])

  const moved = update(start, Message.UrlChanged({ url: urlOrThrow('http://studio/site/about') }))
  expect(moved.model.route).toEqual({ _tag: 'Page', slug: 'about' })
  expect((moved.commands ?? []).map(command => command.name)).toEqual(['FocusMain'])
})

afterEach(() => {
  document.body.replaceChildren()
})
