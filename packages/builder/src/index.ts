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
import { History, HistoryModel } from 'foldkit-primitives/state'
import type { Command } from 'foldkit/command'
import { inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'

export const Panel = Schema.Literals(['insert', 'layers', 'properties'])
export const Viewport = Schema.Literals(['wide', 'medium', 'narrow'])

export const Model = Schema.Struct({
  /** The page and its undo steps: `page.present` is the Document being edited. */
  page: HistoryModel(Composition.Document),
  /** The node the inspector and the node actions work on. */
  selected: Schema.NullOr(NodeId),
  hovered: Schema.NullOr(NodeId),
  panel: Panel,
  viewport: Viewport,
  /** Why the last edit was refused, until the next one goes through. */
  refused: Schema.NullOr(Schema.Struct({ code: Schema.String, message: Schema.String })),
})
export type Model = typeof Model.Type

/** An edit that creates nodes and waits for their new ids. */
const Request = Schema.Union([
  Schema.TaggedStruct('Insert', { block: Schema.String, at: Composition.Position }),
  Schema.TaggedStruct('Duplicate', { id: NodeId, at: Composition.Position }),
])

export const Message = defineMessageUnion({
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
})
export type Message = typeof Message.Type

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

/** The Document being edited. */
const documentOf = (model: Model): Document => model.page.present

/**
 * The undo group an Operation joins: consecutive edits of one prop of one node
 * are one step, so typing a heading undoes as a whole. Everything else stands alone.
 */
const groupOf = (op: Operation): string | null =>
  op._tag === 'SetProp' ? `SetProp:${op.id}:${op.prop}` : null

/** The Model showing another Document: what a fill, a reset or a restored revision does. */
const replace = (model: Model, document: Document): Model => ({
  ...model,
  page: History.start(document),
  selected:
    model.selected !== null && document.nodes[model.selected] !== undefined ? model.selected : null,
  hovered: null,
  refused: null,
})

/** The Model with nothing in flight, as a stored draft is shown again: no hover, no undo, no refusal. */
const settle = (model: Model): Model => ({
  ...model,
  hovered: null,
  refused: null,
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
    const initial: Model = {
      page: History.start(Composition.empty()),
      selected: null,
      hovered: null,
      panel: 'insert',
      viewport: 'wide',
      refused: null,
    }

    const refuse = (model: Model, refusal: Refusal): { readonly model: Model } => ({
      model: { ...model, refused: refusal },
    })

    const applyOp = (model: Model, op: Operation): { readonly model: Model } => {
      const result = Composition.apply(catalog, documentOf(model), op)
      if (Result.isFailure(result)) return refuse(model, result.failure)
      const { document, removed } = result.success
      const kept =
        model.selected !== null && removed.includes(model.selected) ? null : model.selected
      return {
        model: {
          ...model,
          page: History.push(model.page, document, { capacity, group: groupOf(op) }),
          selected: created(op) ?? kept,
          refused: null,
        },
      }
    }

    /** Asks for `count` new ids; the request goes through once they arrive. */
    const mint = (count: number, request: typeof Request.Type): Commands => [
      {
        name: `${name}.mint`,
        effect: Effect.map(Composition.newIds(count), ids => Message.Minted({ ids, request })),
      },
    ]

    const update = (
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
          }
        }
        case 'PanelChosen':
          return { model: { ...model, panel: message.panel } }
        case 'ViewportChosen':
          return { model: { ...model, viewport: message.viewport } }
      }
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
                      const place = Composition.index(documentOf(model)).get(selected)
                      if (place === undefined) return undefined
                      const at =
                        place.parent === undefined
                          ? Composition.root(place.index + 1)
                          : Composition.region(place.parent, place.region ?? '', place.index + 1)
                      return Message.DuplicateAsked({ id: selected, at })
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

    return {
      name,
      catalog,
      renderer,
      bundle,
      initial,
      /** The form control that places this Builder as a key: its value is the Document. */
      input: Input.bundle('Composition', {
        bundle,
        value: documentOf,
        fill: replace,
        settled: settle,
      }),
      /** Where a new node of a Block goes, given the selection. */
      placeFor: (document: Document, selected: NodeId | null, block: Blocks['name']) =>
        placeFor(catalog, document, selected, block),
      moveBy,
      replace,
      settle,
      /** The Document a Builder Model is editing: its history's present. */
      document: documentOf,
    }
  },
}
