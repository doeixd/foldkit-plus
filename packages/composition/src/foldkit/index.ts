/**
 * `foldkit-composition/foldkit`: a Document drawn as ordinary Foldkit `Html`.
 *
 * A Renderer is one function per Block of a Catalog, from the Block's decoded
 * props and its Regions' drawn children to `Html`. It adds no reconciler, no
 * component runtime and no per-node state, and it takes the builder it is
 * given, so the same Renderer draws a page in the browser and inside a
 * `foldkit-ssr` static region on the server.
 *
 * Production and the editor's canvas use the same Renderer. Edit mode adds one
 * thing: each node is wrapped in a `display: contents` element that carries
 * `data-composition-node`, so an editor can find the node under the pointer.
 */
import { holds } from '../condition.js'
import { Result } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Block, type AnyBlock, type PropsOf } from '../block.js'
import { Catalog } from '../catalog.js'
import type { Document, NodeId } from '../document.js'

/** How a Document is drawn: as a visitor sees it, or on an editor's canvas. */
export type Mode = 'view' | 'edit'

/** What a Block's view is drawn from. */
export interface RenderContext<B extends AnyBlock, Message> {
  readonly id: NodeId
  readonly props: PropsOf<B>
  /** Each Region's children, already drawn, in order. */
  readonly regions: { readonly [R in keyof B['regions']]: ReadonlyArray<Html> }
  readonly h: HtmlBuilder<Message>
  readonly mode: Mode
  /**
   * The node's appearance choices its Block offers, by axis; a stored choice
   * the Block does not offer is left out. A look draws them:
   * `HeroLook.draw({ appearance, h })`.
   */
  readonly appearance: Readonly<Record<string, string>>
}

/** One view per Block of the Catalog, by name: a Block without one is a type error. */
export type Entries<Blocks extends AnyBlock, Message> = {
  readonly [B in Blocks as B['name']]: (context: RenderContext<B, Message>) => Html
}

export interface Renderer<Blocks extends AnyBlock, Message> {
  readonly _tag: 'Renderer'
  readonly catalog: Catalog<Blocks>
  readonly entries: Entries<Blocks, Message>
}

/** The attribute that marks a node's element in edit mode. */
export const NODE_ATTRIBUTE = 'composition-node'
/** The attribute on a placeholder, naming the Block it stands for. */
export const PLACEHOLDER_ATTRIBUTE = 'composition-placeholder'
/** In edit mode, on the selected node's element and the hovered one's, for a stylesheet to outline. */
export const SELECTED_ATTRIBUTE = 'composition-selected'
export const HOVERED_ATTRIBUTE = 'composition-hovered'
/** In edit mode, on a node whose `when` does not hold in the context drawn for. */
export const HIDDEN_ATTRIBUTE = 'composition-hidden'
/** In edit mode, on the node a drop is aimed at, holding where: `before`, `inside` or `after`. */
export const DROP_ATTRIBUTE = 'composition-drop'

const make =
  <Message>() =>
  <Blocks extends AnyBlock>(
    catalog: Catalog<Blocks>,
    // The Catalog alone says which Blocks there are; the views are checked against it.
    entries: NoInfer<Entries<Blocks, Message>>,
  ): Renderer<Blocks, Message> => {
    const given = entries as Readonly<Record<string, unknown>>
    const missing = catalog.blocks.filter(block => typeof given[block.name] !== 'function')
    if (missing.length > 0)
      throw new Error(
        `Renderer.make: no view for ${missing.map(block => `"${block.name}"`).join(', ')}`,
      )
    return Object.freeze({ _tag: 'Renderer', catalog, entries })
  }

/**
 * Draws a Document's roots. Nothing stored makes it throw: a node whose Block
 * the Catalog lacks, whose props do not decode, or that is missing or reached
 * again is a placeholder, which is nothing in view mode and a labelled box in
 * edit mode.
 */
/** The stored choices the Block offers: an axis it has, a value on that axis's list. */
const offered = (block: AnyBlock, stored: unknown): Readonly<Record<string, string>> =>
  typeof stored !== 'object' || stored === null || Array.isArray(stored)
    ? {}
    : Object.fromEntries(
        Object.entries(stored).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === 'string' &&
            (block.appearance[entry[0]]?.values.includes(entry[1]) ?? false),
        ),
      )

const render = <Blocks extends AnyBlock, Message>(
  renderer: Renderer<Blocks, Message>,
  document: Document,
  h: HtmlBuilder<Message>,
  options: {
    readonly mode?: Mode
    /** In edit mode, the node to mark selected. */
    readonly selected?: NodeId | null
    /** In edit mode, the node to mark hovered. */
    readonly hovered?: NodeId | null
    /**
     * What the page is drawn for, as the Catalog's `context` declares. A node
     * whose `when` does not hold is left out, or, in edit mode, drawn marked
     * `data-composition-hidden`. Without it, a node with conditions is hidden.
     */
    readonly context?: Readonly<Record<string, unknown>>
    /** In edit mode, the node a drop is aimed at, and where. */
    readonly drop?: { readonly id: NodeId; readonly zone: 'before' | 'inside' | 'after' } | null
  } = {},
): ReadonlyArray<Html> => {
  const mode = options.mode ?? 'view'
  const entries = renderer.entries as unknown as Readonly<
    Record<string, (context: RenderContext<AnyBlock, Message>) => Html>
  >
  const placeholder = (id: NodeId, block: string, reason: string): Html =>
    mode === 'view'
      ? null
      : h.div(
          [h.DataAttribute(PLACEHOLDER_ATTRIBUTE, block), h.DataAttribute(NODE_ATTRIBUTE, id)],
          [`${block}: ${reason}`],
        )

  const drawn = new Set<NodeId>()
  const draw = (id: NodeId): Html => {
    const node = document.nodes[id]
    if (node === undefined) return placeholder(id, 'Missing', 'this node is not in the page')
    // A node reached twice is drawn once, which also ends a cycle.
    if (drawn.has(id)) return placeholder(id, node.block, 'this node is already on the page')
    drawn.add(id)
    const shown = holds(node.when, options.context)
    if (!shown && mode === 'view') return null
    const block = Catalog.block(renderer.catalog, node.block)
    if (block === undefined)
      return placeholder(id, node.block, 'this Block is not in this version of the application')
    const props = Block.decode(block, node.props)
    if (Result.isFailure(props)) return placeholder(id, node.block, 'its settings are not valid')
    const regions = Object.fromEntries(
      Object.keys(block.regions).map(name => [name, (node.regions[name] ?? []).map(draw)]),
    )
    const html = entries[block.name]!({
      id,
      props: props.success,
      regions,
      h,
      mode,
      appearance: offered(block, node.appearance),
    })
    return mode === 'view'
      ? html
      : h.div(
          [
            h.DataAttribute(NODE_ATTRIBUTE, id),
            h.Style({ display: 'contents' }),
            ...(options.selected === id ? [h.DataAttribute(SELECTED_ATTRIBUTE, '')] : []),
            ...(options.hovered === id ? [h.DataAttribute(HOVERED_ATTRIBUTE, '')] : []),
            ...(options.drop?.id === id
              ? [h.DataAttribute(DROP_ATTRIBUTE, options.drop.zone)]
              : []),
            ...(shown ? [] : [h.DataAttribute(HIDDEN_ATTRIBUTE, '')]),
          ],
          [html],
        )
  }
  return document.roots.map(draw)
}

export const Renderer = {
  /** A Renderer whose views dispatch no Message: what a static page, or a static region, draws. */
  make: make<never>(),
  /** A Renderer whose views may dispatch the application's Messages. */
  forMessages: <Message>() => ({ make: make<Message>() }),
  render,
}
