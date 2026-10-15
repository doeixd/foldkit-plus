/// <reference types="@vitest/browser-playwright" />
/**
 * A solid button's press on a real page: at rest its border is its fill, so
 * the fill reaches its edge; held down, the border clears, and the fill
 * stands exactly 1px in on every side; let go, it comes back.
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
    return h.button(b.button.attrs([h.Type('button'), h.Id('press-target')]), ['Save'])
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

/**
 * Where `selector` is on the top page, as Chrome lays it out: the protocol's
 * mouse takes the top page's coordinates, and the test's frame stands
 * elsewhere on it, perhaps scaled, which only the browser knows exactly.
 */
const centerOf = async (selector: string) => {
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
    if (found === 0) continue
    const { model } = (await cdp().send('DOM.getBoxModel', { nodeId: found })) as {
      model: { readonly content: ReadonlyArray<number> }
    }
    const [x1, y1, , , x3, y3] = model.content
    return { x: (x1! + x3!) / 2, y: (y1! + y3!) / 2 }
  }
  throw new Error(`no ${selector} in any frame`)
}

/** Holds the main mouse button down over `selector`, or lets it go. */
const mouse = async (selector: string, type: 'mousePressed' | 'mouseReleased') => {
  const { x, y } = await centerOf(selector)
  return cdp().send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
}

const transparent = 'rgba(0, 0, 0, 0)'

test('held down, a solid button stands 1px in on every side, and comes back when let go', async () => {
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
    await mouse('#press-target', 'mousePressed')
    await vi.waitFor(() => expect(style.borderTopColor).toBe(transparent))
    expect(style.borderTopWidth).toBe('1px')
    await mouse('#press-target', 'mouseReleased')
    await vi.waitFor(() => expect(style.borderTopColor).toBe(style.backgroundColor))
  } finally {
    handle.dispose()
  }
})
