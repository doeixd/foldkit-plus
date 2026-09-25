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
import { Result } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Update from 'foldkit/update'
import { Block, type AnyBlock, type AppearanceChoice, type PropsOf } from '../block.js'
import { Catalog } from '../catalog.js'
import { messageOf } from '../action.js'
import { holds } from '../condition.js'
import type { Document, NodeId } from '../document.js'
import { statefulNodes } from '../stateful.js'

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
  readonly appearance: Readonly<Record<string, AppearanceChoice>>
  /**
   * The Message the action this node gives `event` makes, such as a button's
   * `on('press')`; `undefined` when it gives none. Stored input never runs: it
   * is decoded by the action's Schema first.
   */
  readonly on: (event: string) => Message | undefined
  /**
   * What the page's reads hold for this node, from the render option `data`;
   * `undefined` when there is none. A Query Block reads it with `rows(data)`.
   */
  readonly data: unknown
}

/** One view per Block of the Catalog, by name: a Block without one is a type error. */
export type Entries<Blocks extends AnyBlock, Message> = {
  readonly [B in Blocks as B['name']]: (context: RenderContext<B, Message>) => Html
}

export interface Renderer<Blocks extends AnyBlock, Message> {
  readonly _tag: 'Renderer'
  readonly catalog: Catalog<Blocks>
  readonly entries: Entries<Blocks, Message>
  /** Whether its views dispatch: `on(event)` gives an action's Message only when they do. */
  readonly dispatches: boolean
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
  <Message>(dispatches: boolean) =>
  <Blocks extends AnyBlock>(
    catalog: Catalog<Blocks, unknown>,
    // The Catalog alone says which Blocks there are; the views are checked against it.
    entries: NoInfer<Entries<Blocks, Message>>,
  ): Renderer<Blocks, Message> => {
    const given = entries as Readonly<Record<string, unknown>>
    const missing = catalog.blocks.filter(block => typeof given[block.name] !== 'function')
    if (missing.length > 0)
      throw new Error(
        `Renderer.make: no view for ${missing.map(block => `"${block.name}"`).join(', ')}`,
      )
    return Object.freeze({ _tag: 'Renderer', catalog, entries, dispatches })
  }

/**
 * Draws a Document's roots. Nothing stored makes it throw: a node whose Block
 * the Catalog lacks, whose props do not decode, that is missing or reached
 * again, or whose view throws is a placeholder, which is nothing in view mode
 * and a labelled box in edit mode.
 */
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
    /**
     * Each node's read, by node id, such as a Model read of
     * `QueryBlock.reads(Data, catalog, document)`.
     */
    readonly data?: Readonly<Record<string, unknown>>
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
    let html: Html
    try {
      html = entries[block.name]!({
        id,
        props: props.success,
        regions,
        h,
        mode,
        appearance: Block.offeredAppearance(block, node.appearance),
        data: options.data?.[id],
        on: event =>
          renderer.dispatches
            ? // `forMessages` checked the Catalog's actions end in this Renderer's Messages.
              (messageOf(renderer.catalog.actions, block, node.actions, event) as
                Message | undefined)
            : undefined,
      })
    } catch (error) {
      // One node's view failing, such as a look whose choice a Behavior also owns,
      // is that node's placeholder, not the page's end.
      return placeholder(id, node.block, `it could not be drawn: ${String(error)}`)
    }
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
  /**
   * A Renderer whose views dispatch no Message: what a static page, a static
   * region, or an editor's canvas draws. Its views' `on(event)` gives nothing.
   */
  make: make<never>(false),
  /**
   * A Renderer whose views may dispatch the application's Messages. Every
   * Message the Catalog's actions make must be one of them.
   */
  forMessages: <Message>() => ({
    make: <Blocks extends AnyBlock>(
      catalog: Catalog<Blocks, NoInfer<Message>>,
      entries: NoInfer<Entries<Blocks, Message>>,
    ): Renderer<Blocks, Message> => make<Message>(true)(catalog, entries),
  }),
  render,
}

/** Whether two stored JSON values are equal, whatever the order of their keys. */
const sameJson = (left: unknown, right: unknown): boolean => {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null)
    return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      key =>
        Object.hasOwn(right, key) &&
        sameJson(
          (left as Readonly<Record<string, unknown>>)[key],
          (right as Readonly<Record<string, unknown>>)[key],
        ),
    )
  )
}

/** What a placed collection (`Page.each(...)`) offers that `Stateful` uses. */
export interface StatefulCollection<Parent, ParentMessage, R, Model> {
  // Method syntax: a collection keyed by a narrower id still fits.
  add(key: string, prepare?: (model: Model) => Model): Update.Step<Parent, ParentMessage, R>
  remove(key: string): Update.Step<Parent, ParentMessage, never>
  view(parent: Parent, h: HtmlBuilder<ParentMessage>, key: string): Html
}

/**
 * A page's stateful nodes, as a placed collection holds them: one Bundle per
 * node, keyed by its id, the parent's own Model.
 */
export const Stateful = {
  /**
   * The Step that keeps `collection` in step with a page's nodes of `block`,
   * from the page it showed (`before`, `undefined` at first) to the one it
   * shows now: a new node is added, its Model prepared from its props, a gone
   * one removed, and one whose props changed started again with the new ones.
   */
  sync: <Parent, ParentMessage, R, Model, B extends AnyBlock>(
    collection: StatefulCollection<Parent, ParentMessage, R, Model>,
    catalog: Catalog,
    block: B,
    pages: { readonly before: Document | undefined; readonly after: Document },
    prepare: (model: Model, props: PropsOf<B>) => Model,
  ): Update.Step<Parent, ParentMessage, R> => {
    if (Catalog.block(catalog, block.name) !== block)
      throw new Error(`Stateful.sync: "${block.name}" is not this Catalog's Block`)
    const of = (document: Document | undefined) =>
      document === undefined ? [] : statefulNodes(catalog, document, block.name)
    const before = new Map(of(pages.before).map(node => [node.id, node]))
    const after = of(pages.after)
    const staying = new Set(after.map(node => node.id))
    const stored = (document: Document | undefined, id: NodeId) => document?.nodes[id]?.props
    return Update.combine([
      ...[...before.keys()].filter(id => !staying.has(id)).map(id => collection.remove(id)),
      ...after
        .filter(
          node =>
            !before.has(node.id) ||
            // By value: a page loaded again is new objects with the same props.
            !sameJson(stored(pages.before, node.id), stored(pages.after, node.id)),
        )
        // The props of a node of `block`, which is the Catalog's, decoded by its Schema.
        .map(node => collection.add(node.id, model => prepare(model, node.props as PropsOf<B>))),
    ])
  },

  /** Each of a page's nodes of `block`, drawn by its item, by id: for `Renderer.render`'s `data`. */
  views: <Parent, ParentMessage>(
    collection: Pick<StatefulCollection<Parent, ParentMessage, never, unknown>, 'view'>,
    catalog: Catalog,
    block: AnyBlock,
    document: Document,
    parent: Parent,
    h: HtmlBuilder<ParentMessage>,
  ): Readonly<Record<string, Html>> =>
    Object.fromEntries(
      statefulNodes(catalog, document, block.name).map(node => [
        node.id,
        collection.view(parent, h, node.id),
      ]),
    ),

  /** A stateful node's drawn Bundle, from the `data` `views` gave it; nothing until it is placed. */
  html: (data: unknown): Html =>
    // `views` hands each node its item's Html.
    data === undefined ? null : (data as Html),
}
