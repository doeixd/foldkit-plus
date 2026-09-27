/**
 * `foldkit-composition/foldkit`: a Document drawn as ordinary Foldkit `Html`.
 *
 * A Renderer is one function per Block of a Catalog, from the Block's decoded
 * props and its Regions' drawn children to `Html`. It adds no reconciler, no
 * component runtime and no per-node state, and it takes the builder it is
 * given, so the same Renderer draws a page in the browser and inside a
 * `foldkit-ssr` static region on the server.
 *
 * Production and the editor's canvas use the same Renderer. Edit mode adds two
 * things: each node is wrapped in a `display: contents` element that carries
 * `data-composition-node`, so an editor can find the node under the pointer,
 * and a text prop a view draws with `field` is marked, so it can be edited in place.
 */
import { Option, Result, Schema } from 'effect'
import { createKeyedLazy, inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import * as Update from 'foldkit/update'
import { Block, spaced, type AnyBlock, type AppearanceChoice, type PropsOf } from '../block.js'
import { Catalog } from '../catalog.js'
import { messageOf } from '../action.js'
import { holds } from '../condition.js'
import { NodeId, type Document, type Node } from '../document.js'
import { statefulNodes } from '../stateful.js'

/** How a Document is drawn: as a visitor sees it, or on an editor's canvas. */
export type Mode = 'view' | 'edit'

/** The props of `Props` that are text, which `field` draws. */
export type TextKey<Props> = {
  readonly [K in keyof Props]-?: Props[K] extends string ? K : never
}[keyof Props] &
  string

/**
 * The text prop an editor is editing in place, and its text when editing
 * began: the field is drawn with that text until editing ends, so a redraw
 * while the author types never rewrites the element under the caret.
 */
export interface Editing {
  readonly id: NodeId
  readonly key: string
  readonly initial: string
}

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
  /**
   * A text prop, drawn so an editor can edit it in place: in view mode the text
   * alone; in edit mode a span marked `data-composition-field`, which is
   * `contenteditable` while the render option `editing` names it. `label` is
   * its accessible name while it is edited, by default the prop's name spaced;
   * `multiline` lets it break lines.
   */
  readonly field: (
    key: TextKey<PropsOf<B>>,
    options?: { readonly label?: string; readonly multiline?: boolean },
  ) => Html | string
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
/**
 * In edit mode, `selected` or `hovered`, for a stylesheet to outline. One
 * attribute, so a node both hovered and selected is marked selected, whatever
 * order a stylesheet writes its rules in.
 */
export const MARK_ATTRIBUTE = 'composition-mark'
/** In edit mode, on a node whose `when` does not hold in the context drawn for. */
export const HIDDEN_ATTRIBUTE = 'composition-hidden'
/** In edit mode, on the node a drop is aimed at, holding where: `before`, `inside` or `after`. */
export const DROP_ATTRIBUTE = 'composition-drop'
/**
 * The container a page is drawn in: an editor's frame, and a published page's
 * root, are `container: page / inline-size`, so a look's container queries
 * (`Theme.inContainer(PAGE_CONTAINER, …)`) and `cqi` units measure the page,
 * not the window. The Renderer draws no such element; the page's host does.
 */
export const PAGE_CONTAINER = 'page'
/** In edit mode, on a text prop's element, naming its node and prop: see `fieldOf`. */
export const FIELD_ATTRIBUTE = 'composition-field'

const FieldName = Schema.fromJsonString(Schema.Tuple([NodeId, Schema.String]))
/** The value `FIELD_ATTRIBUTE` holds for a node's prop: JSON, so no id is split on a separator. */
export const fieldName = (id: NodeId, key: string): string =>
  Schema.encodeSync(FieldName)([id, key])
/** The node and prop a field's attribute names; none for a value that names none. */
export const fieldOf = (
  name: string,
): Option.Option<{ readonly id: NodeId; readonly key: string }> =>
  Option.map(Result.getSuccess(Schema.decodeUnknownResult(FieldName)(name)), ([id, key]) => ({
    id,
    key,
  }))

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

/** What stands in for a node that cannot be drawn: nothing in view mode, a labelled box in edit mode. */
const placeholder = (
  h: HtmlBuilder<unknown>,
  mode: Mode,
  id: NodeId,
  block: string,
  reason: string,
): Html =>
  mode === 'view'
    ? null
    : h.div(
        [h.DataAttribute(PLACEHOLDER_ATTRIBUTE, block), h.DataAttribute(NODE_ATTRIBUTE, id)],
        [`${block}: ${reason}`],
      )

/** Everything one node's drawing reads, in order, its regions' drawn children last. */
type DrawArgs = [
  renderer: Renderer<AnyBlock, unknown>,
  h: HtmlBuilder<unknown>,
  mode: Mode,
  id: NodeId,
  node: Node,
  shown: boolean,
  data: unknown,
  mark: 'selected' | 'hovered' | undefined,
  drop: 'before' | 'inside' | 'after' | undefined,
  editing: Editing | undefined,
  ...children: ReadonlyArray<Html>,
]

/**
 * One node, given its children already drawn: a function of its arguments
 * alone, so a node none of whose arguments changed is not drawn again. Nodes
 * are shared between versions of a Document when unchanged, so an edit redraws
 * the nodes it touched and those holding them.
 */
const drawNode = (
  ...[renderer, h, mode, id, node, shown, data, mark, drop, editing, ...children]: DrawArgs
): Html => {
  const block = Catalog.block(renderer.catalog, node.block)
  if (block === undefined)
    return placeholder(
      h,
      mode,
      id,
      node.block,
      'this Block is not in this version of the application',
    )
  const props = Block.decode(block, node.props)
  if (Result.isFailure(props))
    return placeholder(h, mode, id, node.block, 'its settings are not valid')
  // The children arrive flat, region by region, in the Block's order.
  let at = 0
  const regions = Object.fromEntries(
    Object.keys(block.regions).map(name => {
      const count = (node.regions[name] ?? []).length
      const drawn = children.slice(at, at + count)
      at += count
      return [name, drawn]
    }),
  )
  const entries = renderer.entries as unknown as Readonly<
    Record<string, (context: RenderContext<AnyBlock, unknown>) => Html>
  >
  let html: Html
  try {
    html = entries[block.name]!({
      id,
      props: props.success,
      regions,
      h,
      mode,
      appearance: Block.offeredAppearance(block, node.appearance),
      data,
      on: event =>
        renderer.dispatches
          ? // `forMessages` checked the Catalog's actions end in this Renderer's Messages.
            messageOf(renderer.catalog.actions, block, node.actions, event)
          : undefined,
      field: (key, fieldOptions = {}) => {
        // `TextKey` keeps `key` to the props that are text.
        const text = (props.success as Readonly<Record<string, string>>)[key] ?? ''
        if (mode === 'view') return text
        if (editing?.key !== key)
          return h.span([h.DataAttribute(FIELD_ATTRIBUTE, fieldName(id, key))], [text])
        // Keyed apart from the span drawn otherwise, so beginning and ending an edit
        // replace the element the browser changed, rather than patching its text.
        return h.span(
          [
            h.Key(`${FIELD_ATTRIBUTE}:editing`),
            h.DataAttribute(FIELD_ATTRIBUTE, fieldName(id, key)),
            h.Attribute('contenteditable', 'plaintext-only'),
            h.Role('textbox'),
            h.AriaLabel(fieldOptions.label ?? spaced(key)),
            ...(fieldOptions.multiline === true ? [h.Attribute('aria-multiline', 'true')] : []),
          ],
          [editing.initial],
        )
      },
    })
  } catch (error) {
    // One node's view failing, such as a look whose choice a Behavior also owns,
    // is that node's placeholder, not the page's end.
    return placeholder(h, mode, id, node.block, `it could not be drawn: ${String(error)}`)
  }
  // Keyed by the node, so a node moved among its siblings is moved, not patched
  // into its neighbour: its drawing is reused, and one reused drawing must keep
  // one place. In view mode the Block's own root takes the key, unless it set one.
  if (mode === 'view') {
    if (html !== null && html.key === undefined) html.key = id
    return html
  }
  return h.div(
    [
      h.Key(id),
      h.DataAttribute(NODE_ATTRIBUTE, id),
      h.Style({ display: 'contents' }),
      ...(mark === undefined ? [] : [h.DataAttribute(MARK_ATTRIBUTE, mark)]),
      ...(drop === undefined ? [] : [h.DataAttribute(DROP_ATTRIBUTE, drop)]),
      ...(shown ? [] : [h.DataAttribute(HIDDEN_ATTRIBUTE, '')]),
    ],
    [html],
  )
}

/** One memo per Renderer, keyed by node id. */
const lazies = new WeakMap<object, ReturnType<typeof createKeyedLazy>>()
const lazyOf = (renderer: Renderer<AnyBlock, unknown>): ReturnType<typeof createKeyedLazy> => {
  const known = lazies.get(renderer)
  if (known !== undefined) return known
  const made = createKeyedLazy()
  lazies.set(renderer, made)
  return made
}

/**
 * Draws a Document's roots. Nothing stored makes it throw: a node whose Block
 * the Catalog lacks, whose props do not decode, that is missing or reached
 * again, or whose view throws is a placeholder, which is nothing in view mode
 * and a labelled box in edit mode.
 */
const render = <Blocks extends AnyBlock, Message, Into = Message>(
  renderer: Renderer<Blocks, Message>,
  document: Document,
  /**
   * The builder to draw with: the application's own. A Renderer that sends
   * nothing (`Renderer.make`) draws with any application's, since its views
   * cannot make a Message; one that sends Messages takes a builder of those.
   */
  given: HtmlBuilder<[Message] extends [never] ? Into : Message>,
  options: {
    readonly mode?: Mode
    /** In edit mode, the node to mark selected. */
    readonly selected?: NodeId | undefined
    /** In edit mode, the node to mark hovered. */
    readonly hovered?: NodeId | undefined
    /**
     * What the page is drawn for, as the Catalog's `context` declares. A node
     * whose `when` does not hold is left out, or, in edit mode, drawn marked
     * `data-composition-hidden`. Without it, a node with conditions is hidden.
     */
    readonly context?: Readonly<Record<string, unknown>> | undefined
    /**
     * Each node's read, by node id, such as a Model read of
     * `QueryBlock.reads(Data, catalog, document)`.
     */
    readonly data?: Readonly<Record<string, unknown>> | undefined
    /** In edit mode, the node a drop is aimed at, and where. */
    readonly drop?:
      { readonly id: NodeId; readonly zone: 'before' | 'inside' | 'after' } | undefined
    /** In edit mode, the text prop being edited in place: see `field`. */
    readonly editing?: Editing | undefined
  } = {},
): ReadonlyArray<Html> => {
  // For a Renderer that sends nothing, `Into` is the application's Message, and
  // no view can make one: drawing with the application's builder is safe.
  const h = given as unknown as HtmlBuilder<unknown>
  const mode = options.mode ?? 'view'
  const loose = renderer as unknown as Renderer<AnyBlock, unknown>
  const lazy = lazyOf(loose)
  // Memoized only inside a runtime-driven render, which the lazy slot needs; drawn
  // inert outside one (a test, a server's first pass), every node is drawn afresh.
  let memoize = true

  const drawn = new Set<NodeId>()
  const draw = (id: NodeId): Html => {
    const node = document.nodes[id]
    if (node === undefined)
      return placeholder(h, mode, id, 'Missing', 'this node is not in the page')
    // A node reached twice is drawn once, which also ends a cycle.
    if (drawn.has(id))
      return placeholder(h, mode, id, node.block, 'this node is already on the page')
    drawn.add(id)
    const shown = holds(node.when, options.context)
    if (!shown && mode === 'view') return null
    const block = Catalog.block(loose.catalog, node.block)
    if (block === undefined)
      return placeholder(
        h,
        mode,
        id,
        node.block,
        'this Block is not in this version of the application',
      )
    // The structure is walked every time, so a node reached twice is still caught;
    // only each node's own drawing is memoized, on what it reads.
    const children = Object.keys(block.regions).flatMap(name =>
      (node.regions[name] ?? []).map(draw),
    )
    const args: DrawArgs = [
      loose,
      h,
      mode,
      id,
      node,
      shown,
      options.data?.[id],
      options.selected === id ? 'selected' : options.hovered === id ? 'hovered' : undefined,
      options.drop?.id === id ? options.drop.zone : undefined,
      // The one object the options hold, so a memoized node is drawn again only when it changes.
      options.editing?.id === id ? options.editing : undefined,
      ...children,
    ]
    if (memoize) {
      try {
        return lazy(id, drawNode, args)
      } catch {
        // No runtime frame to memoize under: draw this render uncached.
        memoize = false
      }
    }
    return drawNode(...args)
  }
  return document.roots.map(draw) as ReadonlyArray<Html>
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
  /**
   * The text props a node's view draws with `field`, in the order drawn: what
   * an editor may edit in place. Empty for a node the page does not hold, or
   * whose view draws none. It draws the node and what it holds, inert, to see.
   */
  fields: <Blocks extends AnyBlock, Message>(
    renderer: Renderer<Blocks, Message>,
    document: Document,
    id: NodeId,
  ): ReadonlyArray<string> => {
    const marks = (html: Html | string): ReadonlyArray<string> => {
      if (html === null || typeof html === 'string') return []
      const name = html.data?.attrs?.[`data-${FIELD_ATTRIBUTE}`]
      const own =
        typeof name === 'string'
          ? Option.match(fieldOf(name), {
              onNone: () => [],
              // What it holds draws fields of its own, which are not this node's.
              onSome: field => (field.id === id ? [field.key] : []),
            })
          : []
      return [...own, ...(html.children ?? []).flatMap(marks)]
    }
    // Drawn inert and only read for its marks, so a view's Messages are never sent.
    const quiet = renderer as unknown as Renderer<AnyBlock, never>
    return render(quiet, { format: 1, roots: [id], nodes: document.nodes }, inertHtml, {
      mode: 'edit',
    }).flatMap(marks)
  },
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
