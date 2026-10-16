/// <reference types="@vitest/browser-playwright" />
/**
 * A solid button's press on a real page: at rest its border is its fill, so
 * the fill reaches its edge; pressed (`:active`), the border clears, the
 * fill stands exactly 1px in on every side, deepens to the family's `active`,
 * and the button gives a little (a 0.98 scale) unless `travel` is 0; let go,
 * it comes back.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp } from 'vitest/browser'
import { ButtonSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const button = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
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
    return h.div([], [h.button(b.button.attrs([h.Type('button'), h.Id('press-target')]), ['Save'])])
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

type DomNode = {
  readonly nodeId: number
  readonly contentDocument?: DomNode
  readonly children?: ReadonlyArray<DomNode>
}

/** The protocol's id for `selector`, looked for in every frame's document. */
const nodeOf = async (selector: string) => {
  const { root } = (await cdp().send('DOM.getDocument', { depth: -1, pierce: true })) as {
    root: DomNode
  }
  const documents: Array<number> = []
  const walk = (node: DomNode) => {
    if (node.contentDocument !== undefined) {
      documents.push(node.contentDocument.nodeId)
      walk(node.contentDocument)
    }
    node.children?.forEach(walk)
  }
  walk(root)
  for (const nodeId of documents) {
    const { nodeId: found } = (await cdp().send('DOM.querySelector', { nodeId, selector })) as {
      nodeId: number
    }
    if (found !== 0) return found
  }
  throw new Error(`no ${selector} in any frame`)
}

/**
 * Holds a node pressed, or lets it go: Chrome forces its `:active`. A
 * real held mouse races the other test files, which share one pointer and
 * move or press it while this one holds it down.
 */
const press = async (nodeId: number, held: boolean) => {
  await cdp().send('CSS.enable')
  return cdp().send('CSS.forcePseudoState', {
    nodeId,
    forcedPseudoClasses: held ? ['active'] : [],
  })
}

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
