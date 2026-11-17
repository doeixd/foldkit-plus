/**
 * The fixture Builder drawn in a real browser for the drag tests, with only the
 * layout a drag needs: a layers panel and a canvas that scroll in boxes of their
 * own, a page of `count` Headings in one Section.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Composition, NodeId } from 'foldkit-composition'
import { BuilderView } from 'foldkit-mixins-builder'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { PageBuilder, PageView } from './fixture.js'

const Drawn = PageBuilder.bundle.pipe(Bundle.withView(BuilderView.submodel(PageView)))
const Slot = Bundle.declare(Drawn, 'editor')
const Model = Schema.Struct({ ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const Editor = Page.at(Slot)
const placements = Page.assemble(Editor)

/** A Section holding `count` Headings, `h0` first. */
export const longPage = (count: number) => {
  const section = NodeId.make('s')
  const headings = Array.from({ length: count }, (_, index) => NodeId.make(`h${index}`))
  return Composition.Document.make({
    format: 1,
    roots: [section],
    nodes: {
      [section]: { block: 'Section', props: { tone: 'plain' }, regions: { body: headings } },
      ...Object.fromEntries(
        headings.map((id, index) => [
          id,
          { block: 'Heading', props: { text: `Heading ${index}` }, regions: {} },
        ]),
      ),
    },
  })
}

/** Boxes that scroll, and a root that contains layout as the real one does (`container-type`). */
export const layout = `
  body { margin: 0; font: 16px sans-serif; }
  #builder-holder { container: builder / inline-size; width: 900px; }
  section[data-panel="layers"] { height: 260px; overflow: auto; }
  nav[data-panel="insert"] { height: 60px; overflow: auto; }
  [data-builder-canvas] { height: 320px; overflow: auto; }
  [data-builder-canvas] h2 { margin: 0; padding: 12px 8px; }
  [role="treeitem"] { height: 28px; box-sizing: border-box; list-style: none; }
  [data-builder-drop="before"] { box-shadow: inset 0 2px 0 blue; }
  [data-builder-drop="after"] { box-shadow: inset 0 -2px 0 blue; }
  [data-builder-drop="inside"] { outline: 2px dashed blue; }
  [data-composition-drop="before"] > * { box-shadow: 0 -3px 0 blue; }
  [data-composition-drop="after"] > * { box-shadow: 0 3px 0 blue; }
  [data-composition-drop="inside"] > * { outline: 2px dashed blue; }
`

export interface Mounted {
  readonly dispose: () => void
  /** The last Model drawn. */
  readonly model: () => Model | undefined
  /** How many times the view has been called. */
  readonly views: () => number
}

/** Mounts the Builder over `page` with `css` beside the layout. */
export const mountBuilder = (
  page: ReturnType<typeof longPage> = longPage(12),
  css = '',
  options: { readonly width?: string } = {},
): Mounted => {
  const style = document.createElement('style')
  style.textContent = layout + css
  document.head.appendChild(style)
  const holder = document.createElement('div')
  holder.id = 'builder-holder'
  if (options.width !== undefined) holder.style.width = options.width
  const container = document.createElement('div')
  container.id = 'builder'
  holder.appendChild(container)
  document.body.appendChild(holder)
  let drawn: Model | undefined
  let views = 0
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => placements.initial({ editor: PageBuilder.replace(PageBuilder.initial, page) }),
        update: placements.update(),
        view: (model: Model, h: HtmlBuilder<Message>) => {
          drawn = model
          views++
          return h.main([], [Editor.view(model, h, BuilderView.inputs())])
        },
        subscriptions: placements.subscriptions(),
        slow: false,
      }),
    ),
  )
  return {
    model: () => drawn,
    views: () => views,
    dispose: () => {
      handle.dispose()
      style.remove()
      holder.remove()
      document.querySelector('style[data-foldkit-styles]')?.remove()
    },
  }
}

export const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]'))
export const rowOf = (id: string) => rows().find(row => row.getAttribute('data-builder-row') === id)
export const canvas = () => document.querySelector<HTMLElement>('[data-builder-canvas]')
export const nodeOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-composition-node="${id}"]`)
/** The first element inside a node's `display: contents` wrapper: what has a box. */
export const boxOfNode = (id: string) => nodeOf(id)?.firstElementChild as HTMLElement | null
/** The order of the Headings on the page. */
export const order = () =>
  Array.from(document.querySelectorAll('[data-builder-canvas] h2')).map(h => h.textContent)

/** A point in an element's box: its middle across, `down` of the way down. */
export const centre = (element: Element, down = 0.5) => {
  const box = element.getBoundingClientRect()
  return { clientX: box.left + box.width / 2, clientY: box.top + box.height * down }
}

export type Where = { readonly clientX: number; readonly clientY: number }

/** A pointer event of `type` from a mouse (`pointerType: 'mouse'`) or a finger. */
export const pointer = (
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  where: Where,
  kind: 'mouse' | 'touch' = 'mouse',
) =>
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: kind === 'mouse' ? 1 : 7,
      pointerType: kind,
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      ...where,
    }),
  )

export const spin = (ms: number) => {
  const until = performance.now() + ms
  while (performance.now() < until) {}
}

export const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
