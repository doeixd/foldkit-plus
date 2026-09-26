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
import { Effect, Option, Result, Schema } from 'effect'
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
import { controls, settingsOf, spaced, type Settings } from './settings.js'
import { LiveAnnounce, TreeNavigation } from 'foldkit-primitives/interaction'
import { History, HistoryModel } from 'foldkit-primitives/state'
import * as Command from 'foldkit/command'
import type { Command as CommandOf } from 'foldkit/command'
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
  /** The node it is over and the zone of it; none while it is over nothing. */
  over: Schema.OptionFromNullOr(Schema.Struct({ id: NodeId, zone: DropZone })),
  /**
   * Where a drop now puts it; none where a drop there would be refused.
   * `over.zone` is where it lands: `inside` a node that takes nothing is `after`.
   */
  at: Schema.OptionFromNullOr(Composition.Position),
})
export type Drag = typeof Drag.Type

/** A value of the page's context, as the editor previews it. */
export const ContextValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null,
])
export type ContextValue = typeof ContextValue.Type

export const Model = Schema.Struct({
  ...Layers.fields,
  ...Announcer.fields,
  /** The page and its undo steps: `page.present` is the Document being edited. */
  page: HistoryModel(Composition.Document),
  /** The node the inspector and the node actions work on. */
  selected: Schema.OptionFromNullOr(NodeId),
  /** The node under the pointer on the canvas or in the layers. */
  hovered: Schema.OptionFromNullOr(NodeId),
  panel: Panel,
  viewport: Viewport,
  /** Why the last edit was refused, until the next one goes through. */
  refused: Schema.OptionFromNullOr(Schema.Struct({ code: Schema.String, message: Schema.String })),
  /** A pointer drag under way. */
  drag: Schema.OptionFromNullOr(Drag),
  /**
   * The context the page is drawn for in the editor, by the Catalog's context
   * keys: what an author previews it as. A node whose `when` fails here is
   * drawn marked, not left out.
   */
  preview: Schema.Record(Schema.String, ContextValue),
  /**
   * What the inspector's fields hold for the node they show, as its settings
   * form's Model encoded to JSON: text that does not decode yet stays here,
   * not in the page. None until a field is changed, and after the selection
   * moves; the form is then filled from the node. Stored only when some, so a
   * Builder saved before there was one still reads.
   */
  inspector: Schema.OptionFromOptionalNullOr(Schema.Struct({ id: NodeId, form: Schema.Json })),
})
export type Model = typeof Model.Type

/** The selected node as the inspector edits it: its Block, the Block's settings form, and that form's Model. */
export interface Inspecting {
  readonly id: NodeId
  readonly block: AnyBlock
  readonly settings: Settings
  readonly model: Settings['form']['initial']
}

export { controlOf, settingsOf, spaced, type Settings } from './settings.js'

/** An edit that creates nodes and waits for their new ids. */
const Request = Schema.Union([
  Schema.TaggedStruct('Insert', { block: Schema.String, at: Composition.Position }),
  Schema.TaggedStruct('Duplicate', { id: NodeId, at: Composition.Position }),
])

export const Message = defineMessageUnion({
  ...Layers.cases,
  ...Announcer.cases,
  Selected: { id: NodeId },
  /** Nothing is selected. */
  Deselected: {},
  Hovered: { id: NodeId },
  /** The pointer left every node. */
  Unhovered: {},
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
  /** The dragged node is over another, in a zone of it. */
  DraggedOver: { id: NodeId, zone: DropZone },
  /** The dragged node is over nothing. */
  DraggedOff: {},
  /** The drag ended where it is: the node moves there, when it may. */
  DragDropped: {},
  DragCancelled: {},
  /** The author previews the page with one context key set. */
  PreviewChosen: { key: Schema.String, value: ContextValue },
  /** The author previews the page with one context key unset. */
  PreviewCleared: { key: Schema.String },
  /** A Message of the selected node's settings form, encoded to JSON. */
  Inspected: { message: Schema.Json },
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
  selected: Option.Option<NodeId>,
  blockName: string,
): Option.Option<Position> => {
  const block = Catalog.block(catalog, blockName)
  if (block === undefined) return Option.none()
  const fits = (accepted: ReadonlyArray<unknown>) =>
    block.provides.some(content => accepted.includes(content))
  if (Option.isSome(selected)) {
    const node = document.nodes[selected.value]
    const owner = node === undefined ? undefined : Catalog.block(catalog, node.block)
    if (node !== undefined && owner !== undefined)
      for (const [name, region] of Object.entries(owner.regions)) {
        const children = node.regions[name] ?? []
        if (fits(region.accepts) && children.length < region.max)
          return Option.some(Composition.region(selected.value, name, children.length))
      }
  }
  const place = Option.isSome(selected)
    ? Composition.index(document).get(selected.value)
    : undefined
  if (place !== undefined && place.parent !== undefined && place.region !== undefined) {
    const parent = document.nodes[place.parent]
    const parentBlock = parent === undefined ? undefined : Catalog.block(catalog, parent.block)
    const region = parentBlock?.regions[place.region]
    const siblings = parent?.regions[place.region] ?? []
    if (region !== undefined && fits(region.accepts) && siblings.length < region.max)
      return Option.some(Composition.region(place.parent, place.region, place.index + 1))
  }
  if (!fits(catalog.roots)) return Option.none()
  return Option.some(
    Composition.root(
      place !== undefined && place.parent === undefined ? place.index + 1 : document.roots.length,
    ),
  )
}

/** The Operation that moves a node `delta` places among its siblings; none at an end. */
const moveBy = (document: Document, id: NodeId, delta: number): Option.Option<Operation> => {
  const place = Composition.index(document).get(id)
  if (place === undefined) return Option.none()
  const to = place.index + delta
  const siblings =
    place.parent === undefined
      ? document.roots
      : (document.nodes[place.parent]?.regions[place.region ?? ''] ?? [])
  if (to < 0 || to >= siblings.length) return Option.none()
  return Option.some(
    Composition.Op.move(
      id,
      place.parent === undefined
        ? Composition.root(to)
        : Composition.region(place.parent, place.region ?? '', to),
    ),
  )
}

/** The first of a holder's Regions that accepts a Block, by name: where "inside it" goes. */
const regionTaking = (catalog: Catalog, holder: string, block: string): Option.Option<string> => {
  const owner = Catalog.block(catalog, holder)
  const taken = Catalog.block(catalog, block)
  return Option.map(
    Option.fromUndefinedOr(
      Object.entries(owner?.regions ?? {}).find(([, candidate]) =>
        (taken?.provides ?? []).some(content => candidate.accepts.includes(content)),
      ),
    ),
    ([name]) => name,
  )
}

/**
 * Where a node dragged over `target`, in `zone`, lands: before or after it
 * among its siblings, or last in the first of its Regions that accepts it,
 * with the zone it landed in. `inside` a node that takes it nowhere lands
 * after it. None when the page would refuse the move, such as into the
 * dragged node itself.
 */
const landing = (
  catalog: Catalog,
  document: Document,
  dragged: NodeId,
  target: NodeId,
  zone: DropZone,
): Option.Option<{ readonly at: Position; readonly zone: DropZone }> => {
  const place = Composition.index(document).get(target)
  const node = document.nodes[dragged]
  if (dragged === target || place === undefined || node === undefined) return Option.none()
  // A move takes the node out before putting it back, so places count without it.
  const without = (ids: ReadonlyArray<NodeId>) => ids.filter(id => id !== dragged)
  const beside = (offset: 0 | 1): Option.Option<Position> => {
    const siblings =
      place.parent === undefined
        ? document.roots
        : (document.nodes[place.parent]?.regions[place.region ?? ''] ?? [])
    const at = without(siblings).indexOf(target) + offset
    return Option.some(
      place.parent === undefined
        ? Composition.root(at)
        : Composition.region(place.parent, place.region ?? '', at),
    )
  }
  const inside = (): Option.Option<Position> => {
    const holder = document.nodes[target]
    if (holder === undefined) return Option.none()
    return Option.map(regionTaking(catalog, holder.block, node.block), regionName =>
      Composition.region(target, regionName, without(holder.regions[regionName] ?? []).length),
    )
  }
  // Where the dragged node is now, counted the same way: a drop there moves nothing.
  const current = Composition.index(document).get(dragged)
  const stays = (at: Position) =>
    current !== undefined &&
    at.index === current.index &&
    (at._tag === 'Root'
      ? current.parent === undefined
      : at.parent === current.parent && at.region === current.region)
  const candidates: ReadonlyArray<{
    readonly at: Option.Option<Position>
    readonly zone: DropZone
  }> =
    zone === 'before'
      ? [{ at: beside(0), zone }]
      : zone === 'after'
        ? [{ at: beside(1), zone }]
        : [
            { at: inside(), zone },
            { at: beside(1), zone: 'after' },
          ]
  for (const candidate of candidates) {
    if (Option.isNone(candidate.at)) continue
    const at = candidate.at.value
    // Onto its own place is not a move, and no later candidate is meant instead.
    if (stays(at)) return Option.none()
    if (Result.isSuccess(Composition.apply(catalog, document, Composition.Op.move(dragged, at))))
      return Option.some({ at, zone: candidate.zone })
  }
  return Option.none()
}

/** The Document being edited. */
const documentOf = (model: Pick<Model, 'page'>): Document => model.page.present

/**
 * The undo group an Operation joins: consecutive edits of one prop of one node
 * are one step, so typing a heading undoes as a whole. Everything else stands
 * alone, which `History.push` takes as a `null` group.
 */
const groupOf = (op: Operation): string | null =>
  op._tag === 'SetProp' ? `SetProp:${op.id}:${op.prop}` : null

/** The position right after a node, among its siblings. */
const after = (document: Document, id: NodeId): Option.Option<Position> => {
  const place = Composition.index(document).get(id)
  if (place === undefined) return Option.none()
  return Option.some(
    place.parent === undefined
      ? Composition.root(place.index + 1)
      : Composition.region(place.parent, place.region ?? '', place.index + 1),
  )
}

/** The Operation that moves a node out of its parent, to just after it; none at the top. */
const outdent = (document: Document, id: NodeId): Option.Option<Operation> => {
  const parent = Composition.index(document).get(id)?.parent
  if (parent === undefined) return Option.none()
  return Option.map(after(document, parent), to => Composition.Op.move(id, to))
}

/**
 * The Operation that moves a node into the sibling above it, last in the first
 * of its Regions that accepts it; none when there is none. Whether it fits is
 * `apply`'s to check; this only picks the Region.
 */
const indent = (catalog: Catalog, document: Document, id: NodeId): Option.Option<Operation> => {
  const place = Composition.index(document).get(id)
  const node = document.nodes[id]
  if (place === undefined || node === undefined || place.index === 0) return Option.none()
  const siblings =
    place.parent === undefined
      ? document.roots
      : (document.nodes[place.parent]?.regions[place.region ?? ''] ?? [])
  const above = siblings[place.index - 1]
  const target = above === undefined ? undefined : document.nodes[above]
  if (above === undefined || target === undefined) return Option.none()
  return Option.map(regionTaking(catalog, target.block, node.block), regionName =>
    Composition.Op.move(
      id,
      Composition.region(above, regionName, (target.regions[regionName] ?? []).length),
    ),
  )
}

/** What an applied edit says to assistive technology; none for a prop change. */
const describeEdit = (before: Document, after: Document, op: Operation): Option.Option<string> => {
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
      return Option.some(`Moved ${blockOf(after, op.id)}${where(op.id)}`)
    case 'Insert':
      return Option.some(`Added ${blockOf(after, op.id)}${where(op.id)}`)
    case 'InsertTree':
      return Option.some(`Added ${blockOf(after, op.tree.root)}${where(op.tree.root)}`)
    case 'Duplicate':
      return Option.map(
        Option.fromUndefinedOr(op.ids[op.id]),
        copy => `Duplicated ${blockOf(after, copy)}${where(copy)}`,
      )
    case 'Remove':
      return Option.some(`Removed ${blockOf(before, op.id)}`)
    case 'Batch':
      return op.ops.length === 0 ? Option.none() : Option.some('Edited the page')
    default:
      return Option.none()
  }
}

/** The selection, kept only while the Document still holds it. */
const keptIn = (document: Document, selected: Option.Option<NodeId>): Option.Option<NodeId> =>
  Option.filter(selected, id => document.nodes[id] !== undefined)

/** The Model showing another Document: what a fill, a reset or a restored revision does. */
const replace = (model: Model, document: Document): Model => ({
  ...model,
  page: History.start(document),
  selected: keptIn(document, model.selected),
  hovered: Option.none(),
  refused: Option.none(),
  drag: Option.none(),
  inspector: Option.none(),
})

/** The Model with nothing in flight, as a stored draft is shown again: no hover, no drag, no undo, no refusal. */
const settle = (model: Model): Model => ({
  ...model,
  hovered: Option.none(),
  refused: Option.none(),
  drag: Option.none(),
  page: History.clear(model.page),
})

/** The node an Operation that creates nodes creates first, to select it. */
const created = (op: Operation): Option.Option<NodeId> =>
  op._tag === 'Insert'
    ? Option.some(op.id)
    : op._tag === 'InsertTree'
      ? Option.some(op.tree.root)
      : op._tag === 'Duplicate'
        ? Option.fromUndefinedOr(op.ids[op.id])
        : Option.none()

export const Builder = {
  /**
   * Block metadata: the control the inspector draws a prop with, where its
   * Schema alone does not say, as
   * `Heading.pipe(Block.annotate(Builder.controls({ text: Input.multiline() })))`.
   * `Input.hidden()` leaves a prop out of the inspector.
   */
  controls,

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
      /** The context the editor previews the page as at first, by the Catalog's context keys. */
      readonly preview?: Readonly<Record<string, ContextValue>>
    },
  ) => {
    const { catalog, renderer } = config
    const starters = config.starters as Readonly<Record<string, unknown>>
    type Commands = ReadonlyArray<CommandOf<Message>>

    const capacity = config.capacity ?? 200
    const initial: Model = placements.initial({
      page: History.start(Composition.empty()),
      selected: Option.none(),
      hovered: Option.none(),
      panel: 'insert',
      viewport: 'wide',
      refused: Option.none(),
      drag: Option.none(),
      preview: { ...config.preview },
      inspector: Option.none(),
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
      model: { ...model, refused: Option.some(refusal) },
      commands: announce(refusal.message, 'assertive'),
    })

    const applyOp = (
      model: Model,
      op: Operation,
    ): { readonly model: Model; readonly commands?: Commands } => {
      const result = Composition.apply(catalog, documentOf(model), op)
      if (Result.isFailure(result)) return refuse(model, result.failure)
      const { document, removed } = result.success
      const kept = Option.filter(model.selected, id => !removed.includes(id))
      return {
        model: {
          ...model,
          page: History.push(model.page, document, { capacity, group: groupOf(op) }),
          selected: Option.orElse(created(op), () => kept),
          refused: Option.none(),
        },
        ...Option.match(describeEdit(documentOf(model), document, op), {
          onNone: () => ({}),
          onSome: said => ({ commands: announce(said) }),
        }),
      }
    }

    /** Asks for `count` new ids; the request goes through once they arrive. */
    const mint = (count: number, request: typeof Request.Type): Commands => [
      {
        name: `${name}.mint`,
        effect: Effect.map(Composition.newIds(count), ids => Message.Minted({ ids, request })),
      },
    ]

    /**
     * The selected node's settings form and its Model: the one the inspector
     * holds for that node, else one filled from its props. None when nothing
     * is selected or its Block is not in the Catalog.
     */
    const inspecting = (
      model: Pick<Model, 'page' | 'selected' | 'inspector'>,
    ): Option.Option<Inspecting> =>
      Option.flatMap(model.selected, id => {
        const node = documentOf(model).nodes[id]
        const block: AnyBlock | undefined =
          node === undefined ? undefined : Catalog.block(catalog, node.block)
        if (node === undefined || block === undefined) return Option.none()
        const settings = settingsOf(block)
        const held = Option.flatMap(
          Option.filter(model.inspector, inspector => inspector.id === id),
          inspector => settings.decode(inspector.form),
        )
        return Option.some({
          id,
          block,
          settings,
          model: Option.getOrElse(held, () => settings.fill(settings.form.initial, node.props)),
        })
      })

    /**
     * A settings form Message: the form takes it, and each prop whose decoded
     * value now differs from the node's is set, one Operation each. A field
     * that does not decode sets nothing and shows its error.
     */
    const inspect = (
      model: Model,
      held: Schema.Json,
    ): { readonly model: Model; readonly commands?: Commands } =>
      Option.match(inspecting(model), {
        onNone: () => ({ model }),
        onSome: ({ id, settings, model: form }) =>
          Option.match(settings.decodeMessage(held), {
            onNone: () => ({ model }),
            onSome: formMessage => {
              const next = settings.form.bundle.update(form, formMessage, undefined)
              const props = documentOf(model).nodes[id]?.props ?? {}
              const ops = Object.entries(settings.form.partial(next.model)).flatMap(
                ([key, value]) =>
                  Option.match(settings.stored(key, value), {
                    onNone: () => [],
                    onSome: stored =>
                      JSON.stringify(stored) === JSON.stringify(props[key])
                        ? []
                        : [Composition.Op.setProp(id, key, stored)],
                  }),
              )
              let result: { readonly model: Model; readonly commands?: Commands } = {
                model: {
                  ...model,
                  inspector: Option.some({ id, form: settings.encode(next.model) }),
                },
              }
              const commands: Array<CommandOf<Message>> = [
                ...Command.mapMessages(next.commands, sent =>
                  Message.Inspected({ message: settings.encodeMessage(sent) }),
                ),
              ]
              for (const op of ops) {
                result = applyOp(result.model, op)
                commands.push(...(result.commands ?? []))
              }
              return { model: result.model, commands }
            },
          }),
      })

    /**
     * The inspector after a transition not its own: dropped when the selection
     * moved; refilled from the node when the page changed by another way (an
     * undo, the canvas, an agent), except in a field the author is typing into
     * that does not decode, which keeps its text.
     */
    const reconciled = (before: Model, after: Model): Model => {
      if (Option.isNone(after.inspector)) return after
      const { id } = after.inspector.value
      if (!Option.contains(after.selected, id)) return { ...after, inspector: Option.none() }
      if (documentOf(after) === documentOf(before)) return after
      return Option.match(inspecting(after), {
        onNone: () => ({ ...after, inspector: Option.none() }),
        onSome: ({ settings, model: form }) => ({
          ...after,
          inspector: Option.some({
            id,
            form: settings.encode(
              settings.fill(
                form,
                documentOf(after).nodes[id]?.props ?? {},
                key => settings.form.field(form, key)._tag === 'Invalid',
              ),
            ),
          }),
        }),
      })
    }

    const own = (
      model: Model,
      message: Message,
    ): { readonly model: Model; readonly commands?: Commands } => {
      switch (message._tag) {
        case 'Selected':
          // A node the page does not hold selects nothing.
          return documentOf(model).nodes[message.id] === undefined
            ? { model: { ...model, selected: Option.none() } }
            : { model: { ...model, selected: Option.some(message.id), panel: 'properties' } }
        case 'Deselected':
          return { model: { ...model, selected: Option.none() } }
        case 'Hovered':
          return { model: { ...model, hovered: Option.some(message.id) } }
        case 'Unhovered':
          return { model: { ...model, hovered: Option.none() } }
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
              selected: keptIn(page.present, model.selected),
              refused: Option.none(),
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
                  drag: Option.some({ id: message.id, over: Option.none(), at: Option.none() }),
                  selected: Option.some(message.id),
                },
              }
        case 'DraggedOver': {
          if (Option.isNone(model.drag)) return { model }
          const drag = model.drag.value
          const landed = landing(catalog, documentOf(model), drag.id, message.id, message.zone)
          return {
            model: {
              ...model,
              drag: Option.some({
                ...drag,
                // Where it lands: a drop inside a node that takes nothing is after it.
                over: Option.some({
                  id: message.id,
                  zone: Option.match(landed, {
                    onNone: () => message.zone,
                    onSome: ({ zone }) => zone,
                  }),
                }),
                at: Option.map(landed, ({ at }) => at),
              }),
            },
          }
        }
        case 'DraggedOff':
          return Option.isNone(model.drag)
            ? { model }
            : {
                model: {
                  ...model,
                  drag: Option.some({
                    ...model.drag.value,
                    over: Option.none(),
                    at: Option.none(),
                  }),
                },
              }
        case 'DragDropped': {
          if (Option.isNone(model.drag)) return { model }
          const { id, over } = model.drag.value
          const ended = { ...model, drag: Option.none() }
          // Worked out again: the page may have changed since the pointer got here.
          const landed = Option.flatMap(over, target =>
            landing(catalog, documentOf(model), id, target.id, target.zone),
          )
          return Option.match(landed, {
            onNone: () => ({ model: ended, commands: announce('Not moved') }),
            onSome: ({ at }) => applyOp(ended, Composition.Op.move(id, at)),
          })
        }
        case 'DragCancelled':
          return Option.isNone(model.drag)
            ? { model }
            : { model: { ...model, drag: Option.none() }, commands: announce('Not moved') }
        case 'PreviewChosen':
          return {
            model: { ...model, preview: { ...model.preview, [message.key]: message.value } },
          }
        case 'PreviewCleared': {
          const { [message.key]: _, ...others } = model.preview
          return { model: { ...model, preview: others } }
        }
        case 'Inspected':
          return inspect(model, message.message)
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
      const moved = assembled(model, message)
      const next =
        message._tag === 'Inspected' ? moved : { ...moved, model: reconciled(model, moved.model) }
      // Moving focus in the layers moves the selection with it.
      if (message._tag === Layers.wrapper.tag && message.message._tag === 'Focused') {
        const id = NodeId.make(message.message.id)
        return documentOf(next.model).nodes[id] === undefined
          ? next
          : { ...next, model: { ...next.model, selected: Option.some(id) } }
      }
      // A selection made elsewhere (an insert, the canvas, a row click) is where
      // the layers' keys start from, with the rows above it open so it shows.
      if (Option.isNone(next.model.selected)) return next
      const selected = next.model.selected.value
      if (selected === next.model.layers.current) return next
      const places = Composition.index(documentOf(next.model))
      const above = new Set<string>()
      for (let at = places.get(selected)?.parent; at !== undefined; at = places.get(at)?.parent)
        above.add(at)
      const { layers } = next.model
      return {
        ...next,
        model: {
          ...next.model,
          layers: {
            ...layers,
            current: selected,
            // Rows start open, so a closed one is one toggled: opening it untoggles it.
            toggled: layersArgs.openByDefault
              ? layers.toggled.filter(id => !above.has(id))
              : [...new Set([...layers.toggled, ...above])],
          },
        },
      }
    }

    const view = Submodel.defineView<Model, Message>((model, h) => drawBuilder(model, h))

    /** The crude editor: a palette, the layers, the selected node's text props, and the page. */
    const drawBuilder = (model: Model, h: HtmlBuilder<Message>): Html => {
      // Type `button`: inside a form, a plain button would submit it.
      const button = (label: string, message: Option.Option<Message>) =>
        h.button(
          [
            h.Type('button'),
            h.Disabled(Option.isNone(message)),
            ...Option.match(message, { onNone: () => [], onSome: sent => [h.OnClick(sent)] }),
          ],
          [label],
        )
      const palette = h.nav(
        [h.Class('builder-palette'), h.AriaLabel('Insert')],
        catalog.blocks
          .filter(block => starters[block.name] !== undefined)
          .map(block => {
            return button(
              `Add ${block.name}`,
              Option.map(placeFor(catalog, documentOf(model), model.selected, block.name), at =>
                Message.InsertAsked({ block: block.name, at }),
              ),
            )
          }),
      )
      const layer = (id: NodeId): Html => {
        const node = documentOf(model).nodes[id]
        if (node === undefined) return null
        const known = Catalog.block(catalog, node.block) !== undefined
        const children = Object.values(node.regions).flat()
        return h.li(
          [...(Option.contains(model.selected, id) ? [h.AriaCurrent('true')] : [])],
          [
            button(`${known ? '' : '? '}${node.block}`, Option.some(Message.Selected({ id }))),
            ...(children.length === 0 ? [] : [h.ul([], children.map(layer))]),
          ],
        )
      }
      const layers = h.ul(
        [h.Class('builder-layers'), h.AriaLabel('Layers')],
        documentOf(model).roots.map(layer),
      )
      const actions = Option.match(model.selected, {
        onNone: () => [],
        onSome: selected => [
          h.div(
            [h.Class('builder-actions')],
            [
              button('Move up', applied(moveBy(documentOf(model), selected, -1))),
              button('Move down', applied(moveBy(documentOf(model), selected, 1))),
              button(
                'Duplicate',
                Option.map(after(documentOf(model), selected), at =>
                  Message.DuplicateAsked({ id: selected, at }),
                ),
              ),
              button(
                'Delete',
                Option.some(Message.Applied({ op: Composition.Op.remove(selected) })),
              ),
            ],
          ),
        ],
      })
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
      const inspector = Option.match(model.selected, {
        onNone: () => [],
        onSome: selected => [inspect(selected)],
      })
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
              button(
                'Undo',
                History.canUndo(model.page) ? Option.some(Message.Undid()) : Option.none(),
              ),
              button(
                'Redo',
                History.canRedo(model.page) ? Option.some(Message.Redid()) : Option.none(),
              ),
            ],
          ),
          ...Option.match(model.refused, {
            onNone: () => [],
            onSome: refused => [h.p([h.Role('alert')], [refused.message])],
          }),
          h.div(
            [h.Class('builder-canvas'), h.DataAttribute('viewport', model.viewport)],
            [
              ...Renderer.render(renderer, documentOf(model), inertHtml, {
                mode: 'edit',
                context: model.preview,
              }),
            ],
          ),
        ],
      )
    }

    const applied = (op: Option.Option<Operation>): Option.Option<Message> =>
      Option.map(op, found => Message.Applied({ op: found }))

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
     * Mod+Shift+Z or Mod+Y redoes; Escape deselects. None for a key it does
     * not handle.
     */
    const keyCommand = (
      model: Pick<Model, 'page' | 'selected'>,
      key: string,
      modifiers: KeyboardModifiers,
    ): Option.Option<Message> => {
      const mod = modifiers.ctrlKey || modifiers.metaKey
      const lower = key.toLowerCase()
      if (mod && !modifiers.altKey && lower === 'z')
        return Option.some(modifiers.shiftKey ? Message.Redid() : Message.Undid())
      if (mod && !modifiers.altKey && lower === 'y') return Option.some(Message.Redid())
      if (Option.isNone(model.selected)) return Option.none()
      if (key === 'Escape' && !mod && !modifiers.altKey) return Option.some(Message.Deselected())
      const selected = model.selected.value
      const document = documentOf(model)
      if (modifiers.altKey && !mod)
        return applied(
          key === 'ArrowUp'
            ? moveBy(document, selected, -1)
            : key === 'ArrowDown'
              ? moveBy(document, selected, 1)
              : key === 'ArrowLeft'
                ? outdent(document, selected)
                : key === 'ArrowRight'
                  ? indent(catalog, document, selected)
                  : Option.none(),
        )
      if (mod && lower === 'd')
        return Option.map(after(document, selected), at =>
          Message.DuplicateAsked({ id: selected, at }),
        )
      if (!mod && !modifiers.altKey && (key === 'Delete' || key === 'Backspace'))
        return Option.some(Message.Applied({ op: Composition.Op.remove(selected) }))
      return Option.none()
    }

    /** The form control that places this Builder as a key, drawn by `drawn`. */
    const inputWith = <ViewInputs>(drawn: Submodel.View<Model, Message, ViewInputs>) =>
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
      /** Where a new node of a Block goes, given the selection; none where it may not go. */
      placeFor: (document: Document, selected: Option.Option<NodeId>, block: Blocks['name']) =>
        placeFor(catalog, document, selected, block),
      moveBy,
      /** Where a node dragged over `target`, in `zone`, would go; none where it may not. */
      dropAt: (document: Document, dragged: NodeId, target: NodeId, zone: DropZone) =>
        Option.map(landing(catalog, document, dragged, target, zone), ({ at }) => at),
      replace,
      settle,
      keyCommand,
      /**
       * The selected node's settings form and its Model, for the inspector to
       * draw: the Model it holds for the node, else one filled from the props.
       */
      inspecting,
      /** The Blocks a new node may be, in the Catalog's order: those with starting props. */
      offered: catalog.blocks
        .filter(block => starters[block.name] !== undefined)
        .map(block => block.name),
      /** The Document a Builder Model is editing: its history's present. */
      document: documentOf,
    }
  },
}
