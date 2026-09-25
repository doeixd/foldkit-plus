/**
 * `foldkit-builder`: the page builder's state, as an ordinary Bundle.
 *
 * The Builder edits a `foldkit-composition` Document by Operations. Its Model
 * holds the page as an undo history (`foldkit-primitives/state`) whose present
 * is the Document, with the editor's state beside it (what is selected, the
 * open panel, the viewport), so an edit and the undo step that records it are
 * one value, changed in one transition. The Catalog and the Renderer are
 * vocabulary, not state: the Builder closes over them where it is made, and
 * they never enter the Model or a placement's args.
 *
 * Placed as a form key's control (`builder.input`), the Document is that key's
 * value: the form validates it, submits it, and a CMS autosaves it, while a
 * selection or an open panel is not an edit. Placed alone, with
 * `Bundle.withChild`, its parent owns the Model instead.
 */
import { Effect, Result, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import {
  Block,
  Catalog,
  Composition,
  NodeId,
  type AnyBlock,
  type Document,
  type Operation,
  type Position,
  type PropsOf,
  type Refusal,
} from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { Input } from 'foldkit-form'
import { LiveAnnounce, TreeNavigation } from 'foldkit-primitives/interaction'
import { History, HistoryModel } from 'foldkit-primitives/state'
import type { Command } from 'foldkit/command'
import { inertHtml, type Html, type HtmlBuilder, type KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'

export const Panel = Schema.Literals(['insert', 'layers', 'properties'])
export const Viewport = Schema.Literals(['wide', 'medium', 'narrow'])

/** The layers panel's keyboard focus and which rows are open: a tree that starts open. */
export const Layers = Bundle.declare(TreeNavigation.bundle, 'layers')
export const layersArgs: TreeNavigation.Args = { openByDefault: true }

/** What the editor says to assistive technology: a move, an insert, a refusal. */
export const Announcer = Bundle.declare(LiveAnnounce.bundle, 'announcer')
const announcerArgs: LiveAnnounce.Args = { debounceMs: 150, clearAfterMs: 5000 }

/** Where over a node a drop lands: before it, inside it, or after it. */
export const DropZone = Schema.Literals(['before', 'inside', 'after'])
export type DropZone = typeof DropZone.Type

/** A drag under way: the node dragged, what it is over, and where it would go. */
export const Drag = Schema.Struct({
  id: NodeId,
  over: Schema.NullOr(Schema.Struct({ id: NodeId, zone: DropZone })),
  /**
   * Where a drop now puts it, or `null` when a drop there would be refused.
   * `over.zone` is where it lands: `inside` a node that takes nothing is `after`.
   */
  at: Schema.NullOr(Composition.Position),
})
export type Drag = typeof Drag.Type

export const Model = Schema.Struct({
  ...Layers.fields,
  ...Announcer.fields,
  /** The page and its undo steps: `page.present` is the Document being edited. */
  page: HistoryModel(Composition.Document),
  /** The node the inspector and the node actions work on. */
  selected: Schema.NullOr(NodeId),
  hovered: Schema.NullOr(NodeId),
  panel: Panel,
  viewport: Viewport,
  /** Why the last edit was refused, until the next one goes through. */
  refused: Schema.NullOr(Schema.Struct({ code: Schema.String, message: Schema.String })),
  /** A pointer drag under way, or `null`. */
  drag: Schema.NullOr(Drag),
})
export type Model = typeof Model.Type

/** An edit that creates nodes and waits for their new ids. */
const Request = Schema.Union([
  Schema.TaggedStruct('Insert', { block: Schema.String, at: Composition.Position }),
  Schema.TaggedStruct('Duplicate', { id: NodeId, at: Composition.Position }),
])

export const Message = defineMessageUnion({
  ...Layers.cases,
  ...Announcer.cases,
  Selected: { id: Schema.NullOr(NodeId) },
  Hovered: { id: Schema.NullOr(NodeId) },
  /** An Operation, from a button, a key, a drag, or an agent. */
  Applied: { op: Composition.Operation },
  /** A new node of a Block, with the Block's starting props, once an id is minted. */
  InsertAsked: { block: Schema.String, at: Composition.Position },
  /** A copy of a node and everything it holds, once ids are minted. */
  DuplicateAsked: { id: NodeId, at: Composition.Position },
  /** The ids a request waited for. */
  Minted: { ids: Schema.Array(NodeId), request: Request },
  Undid: {},
  Redid: {},
  PanelChosen: { panel: Panel },
  ViewportChosen: { viewport: Viewport },
  /** A pointer drag of a node began: it is selected, and nothing moves until the drop. */
  DragStarted: { id: NodeId },
  /** The dragged node is over another, in a zone of it, or over nothing. */
  DraggedOver: { over: Schema.NullOr(Schema.Struct({ id: NodeId, zone: DropZone })) },
  /** The drag ended where it is: the node moves there, when it may. */
  DragDropped: {},
  DragCancelled: {},
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })
/** The layers' tree and the announcer, placed in the Builder's own Model. */
const placements = Parent.assemble(
  Parent.at(Layers, { args: layersArgs }),
  Parent.at(Announcer, { args: announcerArgs }),
)

/** Props as a Document stores them, read from what a Block's Schema encoded. */
const storedProps = Schema.decodeUnknownResult(Composition.Node.fields.props)

/** What a new node of each Block starts with. A Block without starting props is not offered. */
export type Starters<Blocks extends AnyBlock> = {
  readonly [B in Blocks as B['name']]?: PropsOf<B>
}

/** Where a new node of `block` goes, given what is selected: inside it, after it, or last. */
const placeFor = (
  catalog: Catalog,
  document: Document,
  selected: NodeId | null,
  blockName: string,
): Position | undefined => {
  const block = Catalog.block(catalog, blockName)
  if (block === undefined) return undefined
  const fits = (accepted: ReadonlyArray<unknown>) =>
    block.provides.some(content => accepted.includes(content))
  const node = selected === null ? undefined : document.nodes[selected]
  const owner = node === undefined ? undefined : Catalog.block(catalog, node.block)
  if (selected !== null && node !== undefined && owner !== undefined)
    for (const [name, region] of Object.entries(owner.regions)) {
      const children = node.regions[name] ?? []
      if (fits(region.accepts) && children.length < region.max)
        return Composition.region(selected, name, children.length)
    }
  const place = selected === null ? undefined : Composition.index(document).get(selected)
  if (place !== undefined && place.parent !== undefined && place.region !== undefined) {
    const parent = document.nodes[place.parent]
    const parentBlock = parent === undefined ? undefined : Catalog.block(catalog, parent.block)
    const region = parentBlock?.regions[place.region]
    const siblings = parent?.regions[place.region] ?? []
    if (region !== undefined && fits(region.accepts) && siblings.length < region.max)
      return Composition.region(place.parent, place.region, place.index + 1)
  }
  if (!fits(catalog.roots)) return undefined
  return Composition.root(
    place !== undefined && place.parent === undefined ? place.index + 1 : document.roots.length,
  )
}

/** The Operation that moves a node `delta` places among its siblings, or `undefined` at an end. */
const moveBy = (document: Document, id: NodeId, delta: number): Operation | undefined => {
  const place = Composition.index(document).get(id)
  if (place === undefined) return undefined
  const to = place.index + delta
  const siblings =
    place.parent === undefined
      ? document.roots
      : (document.nodes[place.parent]?.regions[place.region ?? ''] ?? [])
  if (to < 0 || to >= siblings.length) return undefined
  return Composition.Op.move(
    id,
    place.parent === undefined
      ? Composition.root(to)
      : Composition.region(place.parent, place.region ?? '', to),
  )
}

/**
 * Where a node dragged over `target`, in `zone`, lands: before or after it
 * among its siblings, or last in the first of its Regions that accepts it,
 * with the zone it landed in. `inside` a node that takes it nowhere lands
 * after it. `undefined` when the page would refuse the move, such as into the
 * dragged node itself.
 */
const landing = (
  catalog: Catalog,
  document: Document,
  dragged: NodeId,
  target: NodeId,
  zone: DropZone,
): { readonly at: Position; readonly zone: DropZone } | undefined => {
  const place = Composition.index(document).get(target)
  const node = document.nodes[dragged]
  if (dragged === target || place === undefined || node === undefined) return undefined
  // A move takes the node out before putting it back, so places count without it.
  const without = (ids: ReadonlyArray<NodeId>) => ids.filter(id => id !== dragged)
  const beside = (offset: 0 | 1): Position => {
    const siblings =
      place.parent === undefined
        ? document.roots
        : (document.nodes[place.parent]?.regions[place.region ?? ''] ?? [])
    const at = without(siblings).indexOf(target) + offset
    return place.parent === undefined
      ? Composition.root(at)
      : Composition.region(place.parent, place.region ?? '', at)
  }
  const inside = (): Position | undefined => {
    const holder = document.nodes[target]
    const block = Catalog.block(catalog, node.block)
    const owner = holder === undefined ? undefined : Catalog.block(catalog, holder.block)
    const region = Object.entries(owner?.regions ?? {}).find(([, candidate]) =>
      (block?.provides ?? []).some(content => candidate.accepts.includes(content)),
    )
    if (region === undefined || holder === undefined) return undefined
    const [regionName] = region
    return Composition.region(target, regionName, without(holder.regions[regionName] ?? []).length)
  }
  const candidates: ReadonlyArray<{ readonly at: Position | undefined; readonly zone: DropZone }> =
    zone === 'before'
      ? [{ at: beside(0), zone }]
      : zone === 'after'
        ? [{ at: beside(1), zone }]
        : [
            { at: inside(), zone },
            { at: beside(1), zone: 'after' },
          ]
  for (const candidate of candidates) {
    const { at } = candidate
    if (
      at !== undefined &&
      Result.isSuccess(Composition.apply(catalog, document, Composition.Op.move(dragged, at)))
    )
      return { at, zone: candidate.zone }
  }
  return undefined
}

/** The Document being edited. */
const documentOf = (model: Model): Document => model.page.present

/**
 * The undo group an Operation joins: consecutive edits of one prop of one node
 * are one step, so typing a heading undoes as a whole. Everything else stands alone.
 */
const groupOf = (op: Operation): string | null =>
  op._tag === 'SetProp' ? `SetProp:${op.id}:${op.prop}` : null

/** The position right after a node, among its siblings. */
const after = (document: Document, id: NodeId): Position | undefined => {
  const place = Composition.index(document).get(id)
  if (place === undefined) return undefined
  return place.parent === undefined
    ? Composition.root(place.index + 1)
    : Composition.region(place.parent, place.region ?? '', place.index + 1)
}

/** The Operation that moves a node out of its parent, to just after it; `undefined` at the top. */
const outdent = (document: Document, id: NodeId): Operation | undefined => {
  const parent = Composition.index(document).get(id)?.parent
  if (parent === undefined) return undefined
  const to = after(document, parent)
  return to === undefined ? undefined : Composition.Op.move(id, to)
}

/**
 * The Operation that moves a node into the sibling above it, last in the first
 * of its Regions that accepts it; `undefined` when there is none. Whether it
 * fits is `apply`'s to check; this only picks the Region.
 */
const indent = (catalog: Catalog, document: Document, id: NodeId): Operation | undefined => {
  const place = Composition.index(document).get(id)
  const node = document.nodes[id]
  if (place === undefined || node === undefined || place.index === 0) return undefined
  const siblings =
    place.parent === undefined
      ? document.roots
      : (document.nodes[place.parent]?.regions[place.region ?? ''] ?? [])
  const above = siblings[place.index - 1]
  const target = above === undefined ? undefined : document.nodes[above]
  const block = Catalog.block(catalog, node.block)
  const owner = target === undefined ? undefined : Catalog.block(catalog, target.block)
  if (above === undefined || target === undefined || block === undefined || owner === undefined)
    return undefined
  const region = Object.entries(owner.regions).find(([, candidate]) =>
    block.provides.some(content => candidate.accepts.includes(content)),
  )
  if (region === undefined) return undefined
  const [regionName] = region
  return Composition.Op.move(
    id,
    Composition.region(above, regionName, (target.regions[regionName] ?? []).length),
  )
}

/** What an applied edit says to assistive technology, or `undefined` for a prop change. */
const describeEdit = (before: Document, after: Document, op: Operation): string | undefined => {
  const blockOf = (document: Document, id: NodeId) => document.nodes[id]?.block ?? 'Block'
  const where = (id: NodeId): string => {
    const place = Composition.index(after).get(id)
    if (place === undefined) return ''
    const siblings =
      place.parent === undefined
        ? after.roots.length
        : (after.nodes[place.parent]?.regions[place.region ?? '']?.length ?? 0)
    const container =
      place.parent === undefined
        ? 'the page'
        : `${blockOf(after, place.parent)} ${place.region ?? ''}`.trim()
    return `, ${place.index + 1} of ${siblings} in ${container}`
  }
  switch (op._tag) {
    case 'Move':
      return `Moved ${blockOf(after, op.id)}${where(op.id)}`
    case 'Insert':
      return `Added ${blockOf(after, op.id)}${where(op.id)}`
    case 'InsertTree':
      return `Added ${blockOf(after, op.tree.root)}${where(op.tree.root)}`
    case 'Duplicate': {
      const copy = op.ids[op.id]
      return copy === undefined ? undefined : `Duplicated ${blockOf(after, copy)}${where(copy)}`
    }
    case 'Remove':
      return `Removed ${blockOf(before, op.id)}`
    case 'Batch':
      return op.ops.length === 0 ? undefined : 'Edited the page'
    default:
      return undefined
  }
}

/** The Model showing another Document: what a fill, a reset or a restored revision does. */
const replace = (model: Model, document: Document): Model => ({
  ...model,
  page: History.start(document),
  selected:
    model.selected !== null && document.nodes[model.selected] !== undefined ? model.selected : null,
  hovered: null,
  refused: null,
  drag: null,
})

/** The Model with nothing in flight, as a stored draft is shown again: no hover, no drag, no undo, no refusal. */
const settle = (model: Model): Model => ({
  ...model,
  hovered: null,
  refused: null,
  drag: null,
  page: History.clear(model.page),
})

/** The node an Operation that creates nodes creates first, to select it. */
const created = (op: Operation): NodeId | undefined =>
  op._tag === 'Insert'
    ? op.id
    : op._tag === 'InsertTree'
      ? op.tree.root
      : op._tag === 'Duplicate'
        ? op.ids[op.id]
        : undefined

export const Builder = {
  /**
   * A Builder for a Catalog: its Bundle, the form control that places it as a
   * key, and the helpers a view uses. `starters` gives the props a new node of
   * each Block starts with; the insert panel offers exactly those Blocks.
   */
  make: <const Name extends string, Blocks extends AnyBlock>(
    name: Name,
    config: {
      readonly catalog: Catalog<Blocks>
      readonly renderer: Renderer<Blocks, never>
      readonly starters: NoInfer<Starters<Blocks>>
      /** Undo steps kept. Default 200. */
      readonly capacity?: number
    },
  ) => {
    const { catalog, renderer } = config
    const starters = config.starters as Readonly<Record<string, unknown>>
    type Commands = ReadonlyArray<Command<Message>>

    const capacity = config.capacity ?? 200
    const initial: Model = placements.initial({
      page: History.start(Composition.empty()),
      selected: null,
      hovered: null,
      panel: 'insert',
      viewport: 'wide',
      refused: null,
      drag: null,
    }).model

    /** Says `text` to assistive technology, once the Builder's transition is done. */
    const announce = (text: string, politeness: LiveAnnounce.Politeness = 'polite'): Commands => [
      {
        name: `${name}.announce`,
        effect: Effect.succeed(LiveAnnounce.say(Announcer)<Message>(text, politeness)),
      },
    ]

    const refuse = (
      model: Model,
      refusal: Refusal,
    ): { readonly model: Model; readonly commands: Commands } => ({
      model: { ...model, refused: refusal },
      commands: announce(refusal.message, 'assertive'),
    })

    const applyOp = (
      model: Model,
      op: Operation,
    ): { readonly model: Model; readonly commands?: Commands } => {
      const result = Composition.apply(catalog, documentOf(model), op)
      if (Result.isFailure(result)) return refuse(model, result.failure)
      const { document, removed } = result.success
      const kept =
        model.selected !== null && removed.includes(model.selected) ? null : model.selected
      const said = describeEdit(documentOf(model), document, op)
      return {
        model: {
          ...model,
          page: History.push(model.page, document, { capacity, group: groupOf(op) }),
          selected: created(op) ?? kept,
          refused: null,
        },
        ...(said === undefined ? {} : { commands: announce(said) }),
      }
    }

    /** Asks for `count` new ids; the request goes through once they arrive. */
    const mint = (count: number, request: typeof Request.Type): Commands => [
      {
        name: `${name}.mint`,
        effect: Effect.map(Composition.newIds(count), ids => Message.Minted({ ids, request })),
      },
    ]

    const own = (
      model: Model,
      message: Message,
    ): { readonly model: Model; readonly commands?: Commands } => {
      switch (message._tag) {
        case 'Selected':
          return {
            model: {
              ...model,
              selected:
                message.id !== null && documentOf(model).nodes[message.id] === undefined
                  ? null
                  : message.id,
              panel: message.id === null ? model.panel : 'properties',
            },
          }
        case 'Hovered':
          return { model: { ...model, hovered: message.id } }
        case 'Applied':
          return applyOp(model, message.op)
        case 'InsertAsked':
          return starters[message.block] === undefined
            ? refuse(model, {
                code: 'composition:unknown-block',
                message: `"${message.block}" has no starting props, so it cannot be inserted`,
              })
            : { model, commands: mint(1, { _tag: 'Insert', block: message.block, at: message.at }) }
        case 'DuplicateAsked': {
          if (documentOf(model).nodes[message.id] === undefined)
            return refuse(model, {
              code: 'composition:missing-node',
              message: `"${message.id}" is not a node`,
            })
          const count = Object.keys(
            Composition.takeTree(documentOf(model), message.id).nodes,
          ).length
          return {
            model,
            commands: mint(count, { _tag: 'Duplicate', id: message.id, at: message.at }),
          }
        }
        case 'Minted': {
          const { request, ids } = message
          if (request._tag === 'Insert') {
            // Read as any Block: the starting props were checked against theirs in `make`.
            const block: AnyBlock | undefined = Catalog.block(catalog, request.block)
            // The starting props, encoded as the Document stores them: JSON, by key.
            const encoded =
              block === undefined
                ? undefined
                : Result.flatMap(Block.encode(block, starters[request.block]), storedProps)
            if (ids[0] === undefined || encoded === undefined || Result.isFailure(encoded))
              return refuse(model, {
                code: 'composition:invalid-props',
                message: `"${request.block}"'s starting props do not encode`,
              })
            return applyOp(
              model,
              Composition.Op.insert({
                id: ids[0],
                block: request.block,
                props: encoded.success,
                at: request.at,
              }),
            )
          }
          if (documentOf(model).nodes[request.id] === undefined)
            return refuse(model, {
              code: 'composition:missing-node',
              message: `"${request.id}" is not a node`,
            })
          const held = Object.keys(Composition.takeTree(documentOf(model), request.id).nodes)
          if (held.length !== ids.length)
            return refuse(model, {
              code: 'composition:malformed-tree',
              message: `"${request.id}" changed while its copy was being made; copy it again`,
            })
          return applyOp(
            model,
            Composition.Op.duplicate({
              id: request.id,
              ids: Object.fromEntries(held.map((id, at) => [id, ids[at]!])),
              at: request.at,
            }),
          )
        }
        case 'Undid':
        case 'Redid': {
          const page = (message._tag === 'Undid' ? History.undo : History.redo)(model.page)
          if (page === model.page) return { model }
          return {
            model: {
              ...model,
              page,
              selected:
                model.selected !== null && page.present.nodes[model.selected] !== undefined
                  ? model.selected
                  : null,
              refused: null,
            },
            commands: announce(message._tag === 'Undid' ? 'Undone' : 'Redone'),
          }
        }
        case 'DragStarted':
          return documentOf(model).nodes[message.id] === undefined
            ? { model }
            : {
                model: {
                  ...model,
                  drag: { id: message.id, over: null, at: null },
                  selected: message.id,
                },
              }
        case 'DraggedOver': {
          if (model.drag === null) return { model }
          const { over } = message
          const landed =
            over === null
              ? undefined
              : landing(catalog, documentOf(model), model.drag.id, over.id, over.zone)
          return {
            model: {
              ...model,
              drag: {
                ...model.drag,
                // Where it lands: a drop inside a node that takes nothing is after it.
                over: over === null || landed === undefined ? over : { ...over, zone: landed.zone },
                at: landed?.at ?? null,
              },
            },
          }
        }
        case 'DragDropped': {
          if (model.drag === null) return { model }
          const { id, at } = model.drag
          const ended = { ...model, drag: null }
          return at === null
            ? { model: ended, commands: announce('Not moved') }
            : applyOp(ended, Composition.Op.move(id, at))
        }
        case 'DragCancelled':
          return model.drag === null
            ? { model }
            : { model: { ...model, drag: null }, commands: announce('Not moved') }
        case 'PanelChosen':
          return { model: { ...model, panel: message.panel } }
        case 'ViewportChosen':
          return { model: { ...model, viewport: message.viewport } }
        default:
          return { model }
      }
    }

    const assembled = placements.update(own)
    const update = (model: Model, message: Message) => {
      const next = assembled(model, message)
      // Moving focus in the layers moves the selection with it.
      if (message._tag === Layers.wrapper.tag && message.message._tag === 'Focused') {
        const id = NodeId.make(message.message.id)
        return documentOf(next.model).nodes[id] === undefined
          ? next
          : { ...next, model: { ...next.model, selected: id } }
      }
      // A selection made elsewhere (an insert, the canvas, a row click) is where
      // the layers' keys start from.
      const selected = next.model.selected
      return selected === null || selected === next.model.layers.current
        ? next
        : { ...next, model: { ...next.model, layers: { ...next.model.layers, current: selected } } }
    }

    const view = Submodel.defineView<Model, Message>((model, h) => drawBuilder(model, h))

    /** The crude editor: a palette, the layers, the selected node's text props, and the page. */
    const drawBuilder = (model: Model, h: HtmlBuilder<Message>): Html => {
      // Type `button`: inside a form, a plain button would submit it.
      const button = (label: string, message: Message | undefined) =>
        h.button(
          [
            h.Type('button'),
            h.Disabled(message === undefined),
            ...(message === undefined ? [] : [h.OnClick(message)]),
          ],
          [label],
        )
      const palette = h.nav(
        [h.Class('builder-palette'), h.AriaLabel('Insert')],
        catalog.blocks
          .filter(block => starters[block.name] !== undefined)
          .map(block => {
            const at = placeFor(catalog, documentOf(model), model.selected, block.name)
            return button(
              `Add ${block.name}`,
              at === undefined ? undefined : Message.InsertAsked({ block: block.name, at }),
            )
          }),
      )
      const layer = (id: NodeId): Html => {
        const node = documentOf(model).nodes[id]
        if (node === undefined) return null
        const known = Catalog.block(catalog, node.block) !== undefined
        const children = Object.values(node.regions).flat()
        return h.li(
          [...(model.selected === id ? [h.AriaCurrent('true')] : [])],
          [
            button(`${known ? '' : '? '}${node.block}`, Message.Selected({ id })),
            ...(children.length === 0 ? [] : [h.ul([], children.map(layer))]),
          ],
        )
      }
      const layers = h.ul(
        [h.Class('builder-layers'), h.AriaLabel('Layers')],
        documentOf(model).roots.map(layer),
      )
      const selected = model.selected
      const actions =
        selected === null
          ? []
          : [
              h.div(
                [h.Class('builder-actions')],
                [
                  button('Move up', applied(moveBy(documentOf(model), selected, -1))),
                  button('Move down', applied(moveBy(documentOf(model), selected, 1))),
                  button(
                    'Duplicate',
                    (() => {
                      const at = after(documentOf(model), selected)
                      return at === undefined
                        ? undefined
                        : Message.DuplicateAsked({ id: selected, at })
                    })(),
                  ),
                  button('Delete', Message.Applied({ op: Composition.Op.remove(selected) })),
                ],
              ),
            ]
      const inspect = (id: NodeId): Html => {
        const node = documentOf(model).nodes[id]
        if (node === undefined) return null
        const fields = Object.entries(node.props).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        )
        return h.div(
          [h.Class('builder-properties'), h.AriaLabel('Properties')],
          fields.map(([key, value]) =>
            h.label(
              [],
              [
                key,
                h.input([
                  h.Value(value),
                  h.OnInput(text => Message.Applied({ op: Composition.Op.setProp(id, key, text) })),
                ]),
              ],
            ),
          ),
        )
      }
      const inspector = selected === null ? [] : [inspect(selected)]
      return h.div(
        [h.Class('builder')],
        [
          palette,
          layers,
          ...actions,
          ...inspector,
          h.div(
            [h.Class('builder-history')],
            [
              button('Undo', History.canUndo(model.page) ? Message.Undid() : undefined),
              button('Redo', History.canRedo(model.page) ? Message.Redid() : undefined),
            ],
          ),
          ...(model.refused === null ? [] : [h.p([h.Role('alert')], [model.refused.message])]),
          h.div(
            [h.Class('builder-canvas'), h.DataAttribute('viewport', model.viewport)],
            [...Renderer.render(renderer, documentOf(model), inertHtml, { mode: 'edit' })],
          ),
        ],
      )
    }

    const applied = (op: Operation | undefined): Message | undefined =>
      op === undefined ? undefined : Message.Applied({ op })

    const bundle = Bundle.make(name, {
      Model,
      Message,
      init: () => ({ model: initial }),
      update,
      view,
    })

    /**
     * The editor's keyboard shortcuts, for the layers panel: Alt with an arrow
     * moves the selected node up, down, out of its parent or into the node
     * above it; Mod+D duplicates it; Delete removes it; Mod+Z undoes, and
     * Mod+Shift+Z or Mod+Y redoes. `undefined` for a key it does not handle.
     */
    const keyCommand = (
      model: Model,
      key: string,
      modifiers: KeyboardModifiers,
    ): Message | undefined => {
      const mod = modifiers.ctrlKey || modifiers.metaKey
      const lower = key.toLowerCase()
      if (mod && !modifiers.altKey && lower === 'z')
        return modifiers.shiftKey ? Message.Redid() : Message.Undid()
      if (mod && !modifiers.altKey && lower === 'y') return Message.Redid()
      const selected = model.selected
      if (selected === null) return undefined
      const document = documentOf(model)
      if (modifiers.altKey && !mod) {
        const op =
          key === 'ArrowUp'
            ? moveBy(document, selected, -1)
            : key === 'ArrowDown'
              ? moveBy(document, selected, 1)
              : key === 'ArrowLeft'
                ? outdent(document, selected)
                : key === 'ArrowRight'
                  ? indent(catalog, document, selected)
                  : undefined
        return applied(op)
      }
      if (mod && lower === 'd') {
        const at = after(document, selected)
        return at === undefined ? undefined : Message.DuplicateAsked({ id: selected, at })
      }
      if (!mod && !modifiers.altKey && (key === 'Delete' || key === 'Backspace'))
        return Message.Applied({ op: Composition.Op.remove(selected) })
      return undefined
    }

    /** The form control that places this Builder as a key, drawn by `view`. */
    const inputWith = (drawn: Submodel.View<Model, Message, void>) =>
      Input.bundle('Composition', {
        bundle: bundle.pipe(Bundle.withView(drawn)),
        value: documentOf,
        fill: replace,
        settled: settle,
      })

    return {
      name,
      catalog,
      renderer,
      bundle,
      initial,
      /** The form control that places this Builder as a key: its value is the Document. */
      input: inputWith(view),
      /**
       * The same control, drawn by another view, such as
       * `BuilderView.submodel(view)` from `foldkit-mixins-builder`.
       */
      inputWith,
      /** Where a new node of a Block goes, given the selection. */
      placeFor: (document: Document, selected: NodeId | null, block: Blocks['name']) =>
        placeFor(catalog, document, selected, block),
      moveBy,
      /** Where a node dragged over `target`, in `zone`, would go, or `undefined` where it may not. */
      dropAt: (document: Document, dragged: NodeId, target: NodeId, zone: DropZone) =>
        landing(catalog, document, dragged, target, zone)?.at,
      replace,
      settle,
      keyCommand,
      /** The Blocks a new node may be, in the Catalog's order: those with starting props. */
      offered: catalog.blocks
        .filter(block => starters[block.name] !== undefined)
        .map(block => block.name),
      /** The Document a Builder Model is editing: its history's present. */
      document: documentOf,
    }
  },
}
