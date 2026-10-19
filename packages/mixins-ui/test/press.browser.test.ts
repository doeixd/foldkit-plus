/// <reference types="@vitest/browser-playwright" />
/**
 * A solid button's press on a real page: at rest its border is its fill, so
 * the fill reaches its edge; pressed (`:active`), the border clears, the
 * fill stands exactly 1px in on every side, deepens to the family's `active`,
 * and the button gives a little (a 0.98 scale) unless `travel` is 0, as
 * under reduced motion; let go, it comes back. The press is forced through
 * Chrome: a real held mouse races the other test files, which share one
 * pointer and move or press it while this one holds it down.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { ButtonSlots, Recipes } from '../src/index.js'
import { force, nodeOf } from './pseudoState.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const button = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (travel?: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + button.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'press-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const b = SlotView.buildersFor(ButtonSlots, [button.mixin], { input: undefined, h })
    return h.div(travel === undefined ? [] : [h.Style({ '--fk-knob-travel': travel })], [
      h.button(b.button.attrs([h.Type('button'), h.Id('press-target')]), ['Save']),
    ])
  }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
}

/** Holds a node pressed, or lets it go. */
const press = (nodeId: number, held: boolean) => force(nodeId, held ? ['active'] : [])

const transparent = 'rgba(0, 0, 0, 0)'

test('pressed, a solid button stands 1px in on every side, and comes back when let go', async () => {
  const handle = mount()
  try {
    const element = await vi.waitFor(() => {
      const found = document.querySelector('button')
      expect(found).not.toBeNull()
      return found!
    })
    const style = getComputedStyle(element)
    // At rest the border is the fill, so the fill reaches the edge.
    await vi.waitFor(() => expect(style.borderTopColor).toBe(style.backgroundColor))
    expect(style.backgroundClip).toBe('padding-box')
    const resting = style.backgroundColor
    // One lookup for both: a second `DOM.getDocument` hands out new ids.
    const target = await nodeOf('#press-target')
    await press(target, true)
    await vi.waitFor(() => expect(style.borderTopColor).toBe(transparent))
    expect(style.borderTopWidth).toBe('1px')
    await vi.waitFor(() => expect(style.scale).toBe('0.98'))
    expect(style.backgroundColor).not.toBe(resting)
    await press(target, false)
    await vi.waitFor(() => expect(style.borderTopColor).toBe(style.backgroundColor))
    // At rest nothing sets a scale, so it computes as `none`; awaited, since
    // the way back runs the press transition in reverse.
    await vi.waitFor(() => expect(style.scale).toBe('none'))
    expect(style.backgroundColor).toBe(resting)
  } finally {
    handle.dispose()
  }
})

test('with travel at 0, as under reduced motion, a held button deepens but keeps its size', async () => {
  const handle = mount('0')
  try {
    const element = await vi.waitFor(() => {
      const found = document.querySelector('button')
      expect(found).not.toBeNull()
      return found!
    })
    const style = getComputedStyle(element)
    await vi.waitFor(() => expect(style.borderTopColor).toBe(style.backgroundColor))
    const resting = style.backgroundColor
    const target = await nodeOf('#press-target')
    await press(target, true)
    await vi.waitFor(() => expect(style.backgroundColor).not.toBe(resting))
    // Read once the press has finished moving: mid-transition, a scale on
    // its way to 0.98 still reads 1.
    await vi.waitFor(() => expect(element.getAnimations()).toHaveLength(0))
    expect(style.scale).toBe('1')
    await press(target, false)
  } finally {
    handle.dispose()
  }
})
