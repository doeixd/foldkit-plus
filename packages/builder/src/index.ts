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
  type Tree,
} from 'foldkit-composition'
import { Renderer, fieldName, fieldOf } from 'foldkit-composition/foldkit'
import { Input, fillWords } from 'foldkit-form'
import { controls, inputOf, settingsOf, type Settings } from './settings.js'
import { editWords, type EditWords } from './words.js'
import { copyText, readText } from 'foldkit-primitives/dom'
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

/** What a drag carries: a node on the page, or a new node of a Block, from the palette. */
export const DragSource = Schema.Union([
  Schema.TaggedStruct('Existing', { id: NodeId }),
  Schema.TaggedStruct('New', { block: Schema.String }),
])
export type DragSource = typeof DragSource.Type

/** A drag under way: what is dragged, what it is over, and where it would go. */
export const Drag = Schema.Struct({
  source: DragSource,
  /**
   * The node it is over and the zone of it; none while it is over nothing, or
   * over the page's own space, which `at` then tells apart.
   */
  over: Schema.OptionFromNullOr(
    Schema.Struct({
      id: NodeId,
      zone: DropZone,
      /** The empty Region of the node it is over, which a drop goes into. */
      region: Schema.OptionFromNullOr(Schema.String),
    }),
  ),
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
   * What the inspector's fields hold for the node they show: each form's Model
   * encoded to JSON, by the form's key (`props`, or `on:<event>:<action>`), so
   * text that does not decode yet stays here, not in the page. None until a
   * field is changed, and after the selection moves; a form it does not hold is
   * filled from the node. Stored only when some, so a Builder saved before
   * there was one still reads.
   */
  inspector: Schema.OptionFromOptionalNullOr(
    Schema.Struct({ id: NodeId, forms: Schema.Record(Schema.String, Schema.Json) }),
  ),
  /**
   * The last node copied or cut, and all it holds: what a paste inserts when
   * the system clipboard cannot be read. Kept across pages, so a copy on one
   * pastes on another.
   */
  clipboard: Schema.OptionFromOptionalNullOr(Composition.Tree),
  /**
   * The text prop being edited in place on the canvas; its text when editing
   * began, which the canvas keeps the field at; and whether anything has been
   * typed, since only then does ending it write. Stored only when some.
   */
  editing: Schema.OptionFromOptionalNullOr(
    Schema.Struct({
      id: NodeId,
      key: Schema.String,
      initial: Schema.String,
      typed: Schema.Boolean,
    }),
  ),
})
export type Model = typeof Model.Type

/** One form the inspector draws for the selected node, and its Model. */
export interface InspectedForm {
  /** Which it is, as `Inspected` names it: `props`, or `on:<event>:<action>`. */
  readonly key: string
  readonly settings: Settings
  readonly model: Settings['form']['initial']
}

/** The selected node as the inspector edits it: its Block and its forms. */
export interface Inspecting {
  readonly id: NodeId
  readonly block: AnyBlock
  /** Its props. */
  readonly props: InspectedForm
  /**
   * The input of the action each event runs, by event: none for an event that
   * runs nothing, or an action the Catalog lacks.
   */
  readonly on: Readonly<Record<string, InspectedForm>>
}

export { controlOf, inputOf, settingsOf, type Settings } from './settings.js'
export { editWords, type EditWords } from './words.js'

/** An edit that creates nodes and waits for their new ids. */
const Request = Schema.Union([
  Schema.TaggedStruct('Insert', { block: Schema.String, at: Composition.Position }),
  Schema.TaggedStruct('Duplicate', { id: NodeId, at: Composition.Position }),
  Schema.TaggedStruct('Paste', { tree: Composition.Tree, at: Composition.Position }),
  Schema.TaggedStruct('Pattern', { pattern: Schema.String, at: Composition.Position }),
])

/**
 * A copied node as the system clipboard holds it: JSON, tagged, so text that
 * is not part of a page is not pasted as one.
 */
const Clip = Schema.fromJsonString(
  Schema.Struct({ format: Schema.Literal('foldkit-composition'), tree: Composition.Tree }),
)
const clipText = (tree: Tree): string =>
  Schema.encodeSync(Clip)({ format: 'foldkit-composition', tree })
// Strict: a clipboard is anyone's text, and a key misspelled is refused, not dropped.
const clipOf = Schema.decodeUnknownResult(Clip, { onExcessProperty: 'error' })

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
  /** One of the Catalog's patterns, once ids are minted for its nodes. */
  PatternAsked: { pattern: Schema.String, at: Composition.Position },
  /** The selected node and all it holds, copied. */
  CopyAsked: { id: NodeId },
  /** The selected node and all it holds, copied and removed. */
  CutAsked: { id: NodeId },
  /** A paste: the system clipboard is read, and what it holds goes in by the selection. */
  PasteAsked: {},
  /** What the system clipboard held for a paste; none when it could not be read. */
  ClipboardRead: { text: Schema.OptionFromNullOr(Schema.String) },
  /**
   * Text on the page is asked to be edited in place: a double-click on it, or
   * Enter on its node. Each of these names the field as the canvas marks it
   * (`data-composition-field`), which is checked here.
   */
  EditingAsked: { field: Schema.String },
  /** What the field being edited holds now. */
  FieldTyped: { field: Schema.String, text: Schema.String },
  /** Editing ended with the text kept: Enter, or leaving the field. */
  EditingCommitted: { field: Schema.String, text: Schema.String },
  /** Editing ended with the text put back as it began: Escape. */
  EditingCancelled: { field: Schema.String },
  /** The ids a request waited for. */
  Minted: { ids: Schema.Array(NodeId), request: Request },
  Undid: {},
  Redid: {},
  PanelChosen: { panel: Panel },
  ViewportChosen: { viewport: Viewport },
  /** A pointer drag of a node began: it is selected, and nothing moves until the drop. */
  DragStarted: { source: DragSource },
  /** The dragged node is over another, in a zone of it. */
  DraggedOver: { id: NodeId, zone: DropZone },
  /** The dragged node is over a node's empty Region, by name: a drop goes into it. */
  DraggedOverRegion: { id: NodeId, region: Schema.String },
  /** The dragged node is over nothing. */
  DraggedOff: {},
  /**
   * A palette tile is over the page but over none of its nodes, as an empty
   * page or the space below the last node: it goes last where the page takes it.
   */
  DraggedOverPage: {},
  /** The drag ended where it is: the node moves there, when it may. */
  DragDropped: {},
  DragCancelled: {},
  /** The author previews the page with one context key set. */
  PreviewChosen: { key: Schema.String, value: ContextValue },
  /** The author previews the page with one context key unset. */
  PreviewCleared: { key: Schema.String },
  /**
   * A Message of one of a node's forms (`Inspecting`), encoded to JSON. One for
   * a node no longer selected, or a form it no longer draws, such as a form's
   * Command answering late, is ignored.
   */
  Inspected: { id: NodeId, form: Schema.String, message: Schema.Json },
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

/**
 * Where a new node of `block` goes, given what is selected: inside it, after
 * it, or last, among the roots or, for a Block that is no root, in the last
 * Region on the page with room that accepts it. None where it fits nowhere.
 */
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
  /** Last in the first of a node's Regions with room that accepts the Block. */
  const inside = (id: NodeId): Option.Option<Position> => {
    const node = document.nodes[id]
    const owner = node === undefined ? undefined : Catalog.block(catalog, node.block)
    if (node !== undefined && owner !== undefined)
      for (const [name, region] of Object.entries(owner.regions)) {
        const children = node.regions[name] ?? []
        if (fits(region.accepts) && children.length < region.max)
          return Option.some(Composition.region(id, name, children.length))
      }
    return Option.none()
  }
  if (Option.isSome(selected)) {
    const within = inside(selected.value)
    if (Option.isSome(within)) return within
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
  if (fits(catalog.roots))
    return Option.some(
      Composition.root(
        place !== undefined && place.parent === undefined ? place.index + 1 : document.roots.length,
      ),
    )
  // Nodes in page order, last first, so the place found is the last one on the page.
  const order: Array<NodeId> = []
  const visit = (id: NodeId): void => {
    order.push(id)
    for (const ids of Object.values(document.nodes[id]?.regions ?? {})) ids.forEach(visit)
  }
  document.roots.forEach(visit)
  for (const id of order.reverse()) {
    const last = inside(id)
    if (Option.isSome(last)) return last
  }
  return Option.none()
}

/** Whether a place has room for one more node: a root always, a Region below its most. */
const hasRoom = (catalog: Catalog, document: Document, at: Position): boolean => {
  if (at._tag === 'Root') return true
  const holder = document.nodes[at.parent]
  const region =
    holder === undefined ? undefined : Catalog.block(catalog, holder.block)?.regions[at.region]
  return region !== undefined && (holder?.regions[at.region] ?? []).length < region.max
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
 * What is dragged, as `landing` weighs it: its Block, the node it is if it is
 * on the page already, and the Operation that would put it at a place.
 */
interface Dragged {
  readonly block: string
  readonly id: Option.Option<NodeId>
  readonly to: (at: Position) => Operation
}

/**
 * Where something dragged over `target`, in `zone`, lands beside or inside
 * that one node: before or after it among its siblings, or last in the first
 * of its Regions that accepts it, with the zone it landed in. `inside` a node
 * that takes it nowhere lands after it. None when the page would refuse it
 * there, such as a node into itself: each place is tried, a move for a node
 * and an insert for a new one. `stays` where it would land on its own place.
 */
const landingBy = (
  catalog: Catalog,
  document: Document,
  dragged: Dragged,
  target: NodeId,
  zone: DropZone,
  /** For `inside`, the Region it goes into, in place of the first that accepts it. */
  region: Option.Option<string>,
): Option.Option<{ readonly at: Position; readonly zone: DropZone }> | 'stays' => {
  const place = Composition.index(document).get(target)
  if (Option.contains(dragged.id, target) || place === undefined) return Option.none()
  // A move takes the node out before putting it back, so places count without it.
  const without = (ids: ReadonlyArray<NodeId>) => ids.filter(id => !Option.contains(dragged.id, id))
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
    const named = Option.orElse(region, () => regionTaking(catalog, holder.block, dragged.block))
    return Option.map(named, regionName =>
      Composition.region(target, regionName, without(holder.regions[regionName] ?? []).length),
    )
  }
  // Where the dragged node is now, counted the same way: a drop there moves nothing.
  const current = Option.flatMap(dragged.id, id =>
    Option.fromUndefinedOr(Composition.index(document).get(id)),
  ).pipe(Option.getOrUndefined)
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
    if (stays(at)) return 'stays'
    if (Result.isSuccess(Composition.apply(catalog, document, dragged.to(at))))
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

/** The node a pattern's use makes its root; none for a pattern the Catalog lacks. */
const patternRoot = (
  catalog: Catalog,
  op: { readonly pattern: string; readonly ids: Readonly<Record<NodeId, NodeId>> },
): Option.Option<NodeId> =>
  Option.flatMap(Catalog.pattern(catalog, op.pattern), pattern =>
    Option.fromUndefinedOr(op.ids[pattern.tree.root]),
  )

/** A Block's label, the Catalog's word; one the Catalog lacks by its stored name. */
const blockLabel = (catalog: Catalog, block: string): string =>
  Catalog.block(catalog, block)?.words.label ?? block

/** What an applied edit says to assistive technology; none for a prop change. */
const describeEdit = (
  catalog: Catalog,
  words: EditWords,
  before: Document,
  after: Document,
  op: Operation,
): Option.Option<string> => {
  const labelOf = (document: Document, id: NodeId): string =>
    Option.match(Option.fromUndefinedOr(document.nodes[id]), {
      onNone: () => id,
      onSome: node => blockLabel(catalog, node.block),
    })
  const where = (id: NodeId): string => {
    const place = Composition.index(after).get(id)
    if (place === undefined) return ''
    const siblings =
      place.parent === undefined
        ? after.roots.length
        : (after.nodes[place.parent]?.regions[place.region ?? '']?.length ?? 0)
    const container =
      place.parent === undefined
        ? words.thePage
        : fillWords(words.inRegion, {
            label: labelOf(after, place.parent),
            region: place.region ?? '',
          })
    return fillWords(words.at, { position: place.index + 1, count: siblings, container })
  }
  const said = (template: string, id: NodeId) =>
    fillWords(template, { label: labelOf(after, id), at: where(id) })
  switch (op._tag) {
    case 'Move':
      return Option.some(said(words.moved, op.id))
    case 'Insert':
      return Option.some(said(words.added, op.id))
    case 'InsertTree':
      return Option.some(said(words.added, op.tree.root))
    case 'Duplicate':
      return Option.map(Option.fromUndefinedOr(op.ids[op.id]), copy => said(words.duplicated, copy))
    case 'UsePattern':
      return Option.map(patternRoot(catalog, op), root => said(words.added, root))
    case 'Remove':
      return Option.some(fillWords(words.removed, { label: labelOf(before, op.id) }))
    case 'Batch':
      return op.ops.length === 0 ? Option.none() : Option.some(words.editedPage)
    case 'SetProp':
    case 'UnsetProp':
    case 'SetWhen':
    case 'SetAppearance':
    case 'SetAction':
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
  editing: Option.none(),
})

/** The Model with nothing in flight, as a stored draft is shown again: no hover, no drag, no undo, no refusal. */
const settle = (model: Model): Model => ({
  ...model,
  hovered: Option.none(),
  refused: Option.none(),
  drag: Option.none(),
  editing: Option.none(),
  page: History.clear(model.page),
})

/** The undo group of one editing session: its steps are one, and ending it cancelled takes them back. */
const editingGroup = (editing: { readonly id: NodeId; readonly key: string }): string =>
  `Editing:${fieldName(editing.id, editing.key)}`

/**
 * Where something dragged over `target`, in `zone`, lands: by `target`, else
 * by the nearest node holding it where it fits, before it for `before` and
 * after it otherwise, so a Section dropped on the last Heading of a Section
 * lands after that Section. It climbs no further than a node being dragged.
 * With the node it landed by.
 */
const landing = (
  catalog: Catalog,
  document: Document,
  dragged: Dragged,
  target: NodeId,
  zone: DropZone,
  region: Option.Option<string> = Option.none(),
): Option.Option<{
  readonly at: Position
  readonly zone: DropZone
  readonly by: NodeId
  readonly region: Option.Option<string>
}> => {
  const places = Composition.index(document)
  for (
    let by: NodeId | undefined = target, at: DropZone = zone, into = region;
    by !== undefined && !Option.contains(dragged.id, by);
    by = places.get(by)?.parent, at = zone === 'before' ? 'before' : 'after', into = Option.none()
  ) {
    const landed = landingBy(catalog, document, dragged, by, at, into)
    // Its own place is no move, and no holder's place is meant instead.
    if (landed === 'stays') return Option.none()
    if (Option.isSome(landed))
      return Option.some({
        ...landed.value,
        by,
        // Marked on the Region only where it went into the one it was over.
        region: landed.value.zone === 'inside' ? into : Option.none(),
      })
  }
  return Option.none()
}

/** The node an Operation that creates nodes creates first, to select it. */
const created = (catalog: Catalog, op: Operation): Option.Option<NodeId> =>
  op._tag === 'Insert'
    ? Option.some(op.id)
    : op._tag === 'InsertTree'
      ? Option.some(op.tree.root)
      : op._tag === 'Duplicate'
        ? Option.fromUndefinedOr(op.ids[op.id])
        : op._tag === 'UsePattern'
          ? patternRoot(catalog, op)
          : Option.none()

/**
 * A key that runs a command, named as `KeyboardEvent.key` names it. `mod` is
 * Ctrl, or ⌘ on a Mac. `mod` and `alt` must be as given; `shift` must be as
 * given only where it is given, so a key that leaves it out takes either.
 */
export interface CommandKey {
  readonly key: string
  readonly mod?: boolean
  readonly alt?: boolean
  readonly shift?: boolean
}

/** One thing the editor does, and every way to ask for it. */
export interface BuilderCommand {
  readonly id: string
  /** What it is called, on its button and in the list of shortcuts. */
  readonly label: string
  /** The keys that run it; the first is the one shown. None for one run only by a button. */
  readonly keys: ReadonlyArray<CommandKey>
  /** Where a drawn Builder offers it: with the selected node's actions, in the toolbar, or by key only. */
  readonly placement: ReadonlyArray<'node' | 'toolbar' | 'keyboard'>
  /** The Message it sends now; none while it has nothing to do, which disables its button. */
  readonly run: (model: Pick<Model, 'page' | 'selected'>) => Option.Option<Message>
}

/** Whether a key press is `spec`. A letter is matched as either case. */
const pressed = (spec: CommandKey, key: string, modifiers: KeyboardModifiers): boolean =>
  spec.key.toLowerCase() === key.toLowerCase() &&
  (spec.mod ?? false) === (modifiers.ctrlKey || modifiers.metaKey) &&
  (spec.alt ?? false) === modifiers.altKey &&
  (spec.shift === undefined || spec.shift === modifiers.shiftKey)

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
      /**
       * The editor's commands, given the built ones: another key for one, one
       * left out, another order. What runs a key, the node's actions and the
       * toolbar are all drawn from the table this returns.
       */
      readonly commands?: (built: ReadonlyArray<BuilderCommand>) => ReadonlyArray<BuilderCommand>
      /** What it says of each edit, its commands' labels and its refusals, over the English ones. */
      readonly words?: Partial<EditWords>
    },
  ) => {
    const { catalog, renderer } = config
    const words: EditWords = { ...editWords, ...config.words }
    const starters = config.starters as Readonly<Record<string, unknown>>
    // Each Block's props form, made now, so a control the inspector cannot run
    // is refused where the Builder is made, not at the first selection.
    for (const block of catalog.blocks) settingsOf(block)
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
      clipboard: Option.none(),
      editing: Option.none(),
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
      // An Operation `apply` refused, or a paste of nothing: no Operation at all.
      refusal:
        | Refusal
        | {
            readonly code: 'builder:nothing-to-paste' | 'builder:no-place'
            readonly message: string
          },
    ): { readonly model: Model; readonly commands: Commands } => ({
      model: { ...model, refused: Option.some(refusal) },
      commands: announce(refusal.message, 'assertive'),
    })

    const applyOp = (
      model: Model,
      op: Operation,
      group: string | null = groupOf(op),
    ): { readonly model: Model; readonly commands?: Commands } => {
      const result = Composition.apply(catalog, documentOf(model), op)
      if (Result.isFailure(result))
        return refuse(model, {
          ...result.failure,
          message: fillWords(words.refusal, {
            code: result.failure.code,
            message: result.failure.message,
          }),
        })
      const { document, removed } = result.success
      const kept = Option.filter(model.selected, id => !removed.includes(id))
      return {
        model: {
          ...model,
          page: History.push(model.page, document, { capacity, group }),
          selected: Option.orElse(created(catalog, op), () => kept),
          refused: Option.none(),
        },
        ...Option.match(describeEdit(catalog, words, documentOf(model), document, op), {
          onNone: () => ({}),
          onSome: said => ({ commands: announce(said) }),
        }),
      }
    }

    /** A Block's starting props, encoded as the Document stores them; none for a Block with none. */
    const startingProps = (name: string): Option.Option<Readonly<Record<string, Schema.Json>>> => {
      // Read as any Block: the starting props were checked against theirs in `make`.
      const block: AnyBlock | undefined = Catalog.block(catalog, name)
      // A Block the Catalog lacks has none; one given no starting props fails to encode, below.
      if (block === undefined) return Option.none()
      return Result.getSuccess(Result.flatMap(Block.encode(block, starters[name]), storedProps))
    }

    /**
     * Where a palette tile dropped on the page's own space goes: last where the
     * page takes its Block, as a press with nothing selected puts it. None for
     * a node on the page, which is moved only onto another.
     */
    const onPage = (document: Document, source: DragSource): Option.Option<Position> =>
      source._tag === 'New'
        ? placeFor(catalog, document, Option.none(), source.block)
        : Option.none()

    /** What a drag carries, as `landing` weighs it; none for a node gone or a Block not offered. */
    const draggedOf = (document: Document, source: DragSource): Option.Option<Dragged> => {
      if (source._tag === 'Existing') {
        const node = document.nodes[source.id]
        return node === undefined
          ? Option.none()
          : Option.some({
              block: node.block,
              id: Option.some(source.id),
              to: at => Composition.Op.move(source.id, at),
            })
      }
      // Tried with an id no node on this page has; the drop asks for a real one.
      let unused = 'dragged'
      while (document.nodes[NodeId.make(unused)] !== undefined) unused = `${unused}-`
      const trial = NodeId.make(unused)
      return Option.map(startingProps(source.block), props => ({
        block: source.block,
        id: Option.none(),
        to: at => Composition.Op.insert({ id: trial, block: source.block, props, at }),
      }))
    }

    /**
     * The drag, over `id` in `zone` (or its empty `region`), marked where it
     * lands: a drop inside a node that takes nothing is after it, and one its
     * holder takes instead is marked on the holder.
     */
    const draggedOver = (
      model: Model,
      id: NodeId,
      zone: DropZone,
      region: Option.Option<string>,
    ): { readonly model: Model } => {
      if (Option.isNone(model.drag)) return { model }
      const drag = model.drag.value
      const landed = Option.flatMap(draggedOf(documentOf(model), drag.source), dragged =>
        landing(catalog, documentOf(model), dragged, id, zone, region),
      )
      return {
        model: {
          ...model,
          drag: Option.some({
            ...drag,
            over: Option.some(
              Option.match(landed, {
                onNone: () => ({ id, zone, region }),
                onSome: ({ by, zone, region }) => ({ id: by, zone, region }),
              }),
            ),
            at: Option.map(landed, ({ at }) => at),
          }),
        },
      }
    }

    /** Puts a node's tree on the system clipboard, then says `said`, whether it could or not. */
    const copy = (tree: Tree, said: string): Commands => [
      {
        name: `${name}.copy`,
        effect: Effect.as(
          copyText(clipText(tree)).effect,
          LiveAnnounce.say(Announcer)<Message>(said, 'polite'),
        ),
      },
    ]

    /** The edit under way of the field a canvas Message names; none for any other. */
    const editingOf = (model: Model, field: string) =>
      Option.flatMap(fieldOf(field), named =>
        Option.filter(
          model.editing,
          editing => editing.id === named.id && editing.key === named.key,
        ),
      )

    /** What is said when a drag ends with nothing done. */
    const unmoved = (source: DragSource): string =>
      source._tag === 'Existing' ? words.notMoved : words.notAdded

    /** Asks for `count` new ids; the request goes through once they arrive. */
    const mint = (count: number, request: typeof Request.Type): Commands => [
      {
        name: `${name}.mint`,
        effect: Effect.map(Composition.newIds(count), ids => Message.Minted({ ids, request })),
      },
    ]

    /** A stored value that is a record of JSON, as props and an action's input are; else empty. */
    const recordOf = (value: unknown): Readonly<Record<string, Schema.Json>> =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Readonly<Record<string, Schema.Json>>)
        : {}

    /**
     * A node's forms, each with the stored values it fills from and the
     * Operations that write its changed values back and take away those
     * cleared.
     */
    const formsOf = (id: NodeId, node: Document['nodes'][NodeId], block: AnyBlock) => {
      const props = {
        key: 'props',
        settings: settingsOf(block),
        stored: recordOf(node.props),
        write: (
          changed: Readonly<Record<string, Schema.Json>>,
          cleared: ReadonlyArray<string>,
        ): ReadonlyArray<Operation> => [
          ...Object.entries(changed).map(([key, value]) => Composition.Op.setProp(id, key, value)),
          ...cleared.map(key => Composition.Op.unsetProp(id, key)),
        ],
      }
      const refs = recordOf(node.actions)
      const on = block.events.flatMap(event => {
        const ref = recordOf(refs[event])
        const action = catalog.actions.find(each => each.name === ref['action'])
        if (action === undefined) return []
        const input = recordOf(ref['input'])
        const settings = inputOf(block, event, action)
        return [
          {
            event,
            key: `on:${event}:${action.name}`,
            settings,
            stored: input,
            // The action's input is one value: the changed keys over what it held, less
            // those cleared and any its Schema no longer names, which would be refused.
            write: (
              changed: Readonly<Record<string, Schema.Json>>,
              cleared: ReadonlyArray<string>,
            ): ReadonlyArray<Operation> => [
              Composition.Op.setAction(id, event, {
                action: action.name,
                input: Object.fromEntries(
                  Object.entries({ ...input, ...changed }).filter(
                    ([key]) => settings.keys.includes(key) && !cleared.includes(key),
                  ),
                ),
              }),
            ],
          },
        ]
      })
      return { props, on }
    }

    /**
     * The selected node's forms and their Models: the Model the inspector
     * holds for each, else one filled from the node. None when nothing is
     * selected or its Block is not in the Catalog.
     */
    const inspecting = (
      model: Pick<Model, 'page' | 'selected' | 'inspector'>,
    ): Option.Option<Inspecting> =>
      Option.flatMap(model.selected, id => {
        const node = documentOf(model).nodes[id]
        const block: AnyBlock | undefined =
          node === undefined ? undefined : Catalog.block(catalog, node.block)
        if (node === undefined || block === undefined) return Option.none()
        const held: Readonly<Record<string, Schema.Json>> = Option.match(
          Option.filter(model.inspector, inspector => inspector.id === id),
          { onNone: () => ({}), onSome: inspector => inspector.forms },
        )
        const drawn = (form: {
          readonly key: string
          readonly settings: Settings
          readonly stored: Readonly<Record<string, Schema.Json>>
        }): InspectedForm => ({
          key: form.key,
          settings: form.settings,
          model: Option.getOrElse(
            Option.flatMap(Option.fromUndefinedOr(held[form.key]), form.settings.decode),
            () => form.settings.fill(form.settings.form.initial, form.stored),
          ),
        })
        const { props, on } = formsOf(id, node, block)
        return Option.some({
          id,
          block,
          props: drawn(props),
          on: Object.fromEntries(on.map(form => [form.event, drawn(form)])),
        })
      })

    /** A form's Model refilled from what the node stores, but for a field that does not decode. */
    const refill = (
      settings: Settings,
      model: InspectedForm['model'],
      stored: Readonly<Record<string, Schema.Json>>,
    ) => settings.fill(model, stored, key => settings.form.field(model, key)._tag === 'Invalid')

    /**
     * A Message of one of the selected node's forms: the form takes it, and
     * each value it changed, and that the node does not already hold, is
     * written back: a prop by one `setProp` each, an action's input by one
     * `setAction`; a value cleared that the node held is taken away. A field
     * that does not decode writes nothing and shows its error; a value the
     * node refuses is said, and the form shows what the node holds again.
     */
    const inspect = (
      model: Model,
      message: { readonly id: NodeId; readonly form: string; readonly message: Schema.Json },
    ): { readonly model: Model; readonly commands?: Commands } => {
      const target = Option.filter(inspecting(model), each => each.id === message.id)
      const node = documentOf(model).nodes[message.id]
      if (Option.isNone(target) || node === undefined) return { model }
      const { id, block, props, on } = target.value
      const forms = formsOf(id, node, block)
      const known = [
        { ...forms.props, model: props.model },
        ...forms.on.flatMap(form => {
          const drawn = on[form.event]
          return drawn === undefined ? [] : [{ ...form, model: drawn.model }]
        }),
      ].find(form => form.key === message.form)
      if (known === undefined) return { model }
      const { settings, stored, write } = known
      return Option.match(settings.decodeMessage(message.message), {
        onNone: () => ({ model }),
        onSome: formMessage => {
          const next = settings.form.bundle.update(known.model, formMessage, undefined)
          // Stored values are JSON, so their text tells two apart.
          const text = (value: unknown) => JSON.stringify(value)
          const before: Readonly<Record<string, unknown>> = settings.form.partial(known.model)
          const after: Readonly<Record<string, unknown>> = settings.form.partial(next.model)
          // Only what this Message changed: a field left alone is never written
          // back, even where its draft does not give back the stored value exactly.
          const changed = Object.fromEntries(
            Object.entries(after).flatMap(([key, value]) =>
              Object.hasOwn(before, key) && text(before[key]) === text(value)
                ? []
                : Option.match(settings.stored(key, value), {
                    onNone: () => [],
                    onSome: json => (text(json) === text(stored[key]) ? [] : [[key, json]]),
                  }),
            ),
          )
          // A value that left the form without its field failing, as an optional
          // one emptied does: the node holds it no longer.
          const cleared = Object.keys(before).filter(
            key =>
              !Object.hasOwn(after, key) && settings.form.field(next.model, key)._tag !== 'Invalid',
          )
          const held = Option.match(model.inspector, {
            onNone: () => ({}),
            onSome: inspector => (inspector.id === id ? inspector.forms : {}),
          })
          let result: { readonly model: Model; readonly commands?: Commands } = {
            model: {
              ...model,
              inspector: Option.some({
                id,
                forms: { ...held, [known.key]: settings.encode(next.model) },
              }),
            },
          }
          const commands: Array<CommandOf<Message>> = [
            ...Command.mapMessages(next.commands, sent =>
              Message.Inspected({ id, form: known.key, message: settings.encodeMessage(sent) }),
            ),
          ]
          let refused = false
          if (Object.keys(changed).length > 0 || cleared.length > 0)
            for (const op of write(changed, cleared)) {
              result = applyOp(result.model, op)
              // A write that went through clears the refusal: one left is this one's.
              refused ||= Option.isSome(result.model.refused)
              commands.push(...(result.commands ?? []))
            }
          if (!refused) return { model: result.model, commands }
          // Refused: the form shows what the node holds, not a value it never took.
          const now = formsOf(id, documentOf(result.model).nodes[id] ?? node, block)
          const holds = [now.props, ...now.on].find(form => form.key === known.key)
          return {
            model: {
              ...result.model,
              inspector: Option.some({
                id,
                forms: {
                  ...held,
                  [known.key]: settings.encode(
                    refill(settings, next.model, holds?.stored ?? stored),
                  ),
                },
              }),
            },
            commands,
          }
        },
      })
    }

    /**
     * The inspector after a transition not its own: dropped when the selection
     * moved; when the page changed by another way (an undo, the canvas, an
     * agent), each form it holds is refilled from the node, except a field the
     * author is typing into that does not decode, and a form the node no
     * longer draws is let go.
     */
    const reconciled = (before: Model, after: Model): Model => {
      if (Option.isNone(after.inspector)) return after
      const { id, forms: held } = after.inspector.value
      if (!Option.contains(after.selected, id)) return { ...after, inspector: Option.none() }
      if (documentOf(after) === documentOf(before)) return after
      const node = documentOf(after).nodes[id]
      const block: AnyBlock | undefined =
        node === undefined ? undefined : Catalog.block(catalog, node.block)
      if (node === undefined || block === undefined) return { ...after, inspector: Option.none() }
      const { props, on } = formsOf(id, node, block)
      const refilled = [props, ...on].flatMap(form =>
        Option.match(Option.flatMap(Option.fromUndefinedOr(held[form.key]), form.settings.decode), {
          onNone: () => [],
          onSome: model => [
            [form.key, form.settings.encode(refill(form.settings, model, form.stored))] as const,
          ],
        }),
      )
      return {
        ...after,
        inspector:
          refilled.length === 0
            ? Option.none()
            : Option.some({ id, forms: Object.fromEntries(refilled) }),
      }
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
          return !Object.hasOwn(starters, message.block)
            ? refuse(model, {
                code: 'composition:unknown-block',
                message: fillWords(words.noStartingProps, { block: message.block }),
              })
            : { model, commands: mint(1, { _tag: 'Insert', block: message.block, at: message.at }) }
        case 'DuplicateAsked': {
          if (documentOf(model).nodes[message.id] === undefined)
            return refuse(model, {
              code: 'composition:missing-node',
              message: fillWords(words.notANode, { id: message.id }),
            })
          const count = Object.keys(
            Composition.takeTree(documentOf(model), message.id).nodes,
          ).length
          return {
            model,
            commands: mint(count, { _tag: 'Duplicate', id: message.id, at: message.at }),
          }
        }
        case 'CopyAsked':
        case 'CutAsked': {
          const node = documentOf(model).nodes[message.id]
          if (node === undefined)
            return refuse(model, {
              code: 'composition:missing-node',
              message: fillWords(words.notANode, { id: message.id }),
            })
          const tree = Composition.takeTree(documentOf(model), message.id)
          const copied = { ...model, clipboard: Option.some(tree) }
          if (message._tag === 'CopyAsked')
            return {
              model: copied,
              commands: copy(
                tree,
                fillWords(words.copied, { label: blockLabel(catalog, node.block) }),
              ),
            }
          const cut = applyOp(copied, Composition.Op.remove(message.id))
          // A node its Region cannot do without is not cut: nothing is copied either.
          return cut.model.page === model.page
            ? { ...cut, model: { ...cut.model, clipboard: model.clipboard } }
            : {
                model: cut.model,
                commands: copy(
                  tree,
                  fillWords(words.cut, { label: blockLabel(catalog, node.block) }),
                ),
              }
        }
        case 'PasteAsked':
          return {
            model,
            commands: [
              {
                name: `${name}.paste`,
                effect: Effect.map(readText().effect, read =>
                  Message.ClipboardRead({
                    text: read._tag === 'Read' ? Option.some(read.text) : Option.none(),
                  }),
                ),
              },
            ],
          }
        case 'ClipboardRead': {
          // Text read wins, so a copy made in another tab pastes here; the
          // Builder's own copy is for a browser that would not let it be read.
          const tree = Option.match(message.text, {
            onNone: () => model.clipboard,
            onSome: text => Option.map(Result.getSuccess(clipOf(text)), ({ tree }) => tree),
          })
          if (Option.isNone(tree))
            return refuse(model, {
              code: 'builder:nothing-to-paste',
              message: Option.isSome(message.text) ? words.notAPage : words.nothingCopied,
            })
          // Checked by its own ids, before new ones are minted, so a refusal names what was copied.
          const wrong = Composition.treeRefusal(catalog, tree.value)
          if (Option.isSome(wrong))
            return refuse(model, {
              ...wrong.value,
              message: fillWords(words.refusal, {
                code: wrong.value.code,
                message: wrong.value.message,
              }),
            })
          // `treeRefusal` found the root and its Block, so only a full page leaves no place.
          const block = tree.value.nodes[tree.value.root]?.block ?? ''
          const place = placeFor(catalog, documentOf(model), model.selected, block)
          if (Option.isNone(place))
            return refuse(model, {
              code: 'builder:no-place',
              message: fillWords(words.noPlace, { label: blockLabel(catalog, block) }),
            })
          const at = place.value
          return {
            model,
            commands: mint(Object.keys(tree.value.nodes).length, {
              _tag: 'Paste',
              tree: tree.value,
              at,
            }),
          }
        }
        case 'PatternAsked':
          return Option.match(Catalog.pattern(catalog, message.pattern), {
            onNone: () =>
              refuse(model, {
                code: 'composition:unknown-pattern',
                message: fillWords(words.unknownPattern, { name: message.pattern }),
              }),
            onSome: pattern => ({
              model,
              commands: mint(Object.keys(pattern.tree.nodes).length, {
                _tag: 'Pattern',
                pattern: message.pattern,
                at: message.at,
              }),
            }),
          })
        case 'EditingAsked':
          // A second ask for the field being edited, a double-click inside it, begins nothing.
          if (Option.isSome(editingOf(model, message.field))) return { model }
          return Option.match(fieldOf(message.field), {
            onNone: () => ({ model }),
            onSome: ({ id, key }) => {
              const stored = documentOf(model).nodes[id]?.props[key]
              // Only text the page draws as a field, so what is edited is what shows.
              if (
                typeof stored !== 'string' ||
                !Renderer.fields(renderer, documentOf(model), id).includes(key)
              )
                return { model }
              return {
                model: {
                  ...model,
                  editing: Option.some({ id, key, initial: stored, typed: false }),
                  selected: Option.some(id),
                  // Its steps are one, apart from any edit of the same prop before.
                  page: History.close(model.page),
                },
              }
            },
          })
        case 'FieldTyped':
          return Option.match(editingOf(model, message.field), {
            onNone: () => ({ model }),
            onSome: editing =>
              applyOp(
                { ...model, editing: Option.some({ ...editing, typed: true }) },
                Composition.Op.setProp(editing.id, editing.key, message.text),
                editingGroup(editing),
              ),
          })
        case 'EditingCommitted':
        case 'EditingCancelled':
          return Option.match(editingOf(model, message.field), {
            onNone: () => ({ model }),
            onSome: editing => {
              const kept = message._tag === 'EditingCommitted' ? message.text : editing.initial
              // Nothing typed and nothing new: the field only showed the text, so another
              // edit that came between is not overwritten with what it showed.
              if (!editing.typed && kept === editing.initial)
                return { model: { ...model, editing: Option.none() } }
              const group = editingGroup(editing)
              // Back where it began, the session's step is taken back, while it is still the last.
              const page = kept === editing.initial ? History.revert(model.page, group) : model.page
              const ended = { ...model, page, editing: Option.none() }
              // Written only where the page does not hold it yet, so no step is empty; and
              // written where another edit came between, so Escape still puts the text back.
              return documentOf(ended).nodes[editing.id]?.props[editing.key] === kept
                ? { model: ended }
                : applyOp(ended, Composition.Op.setProp(editing.id, editing.key, kept), group)
            },
          })
        case 'Minted': {
          const { request, ids } = message
          switch (request._tag) {
            case 'Insert': {
              const props = startingProps(request.block)
              if (ids[0] === undefined || Option.isNone(props))
                return refuse(model, {
                  code: 'composition:invalid-props',
                  message: fillWords(words.startingPropsFail, { block: request.block }),
                })
              return applyOp(
                model,
                Composition.Op.insert({
                  id: ids[0],
                  block: request.block,
                  props: props.value,
                  at: request.at,
                }),
              )
            }
            case 'Pattern': {
              // Asked for by name, so it is the Catalog's still: its ids, in its order.
              const held = Option.match(Catalog.pattern(catalog, request.pattern), {
                onNone: () => [],
                onSome: pattern => Object.keys(pattern.tree.nodes),
              })
              return applyOp(
                model,
                Composition.Op.usePattern({
                  pattern: request.pattern,
                  ids: Object.fromEntries(held.map((id, at) => [id, ids[at]!])),
                  at: request.at,
                }),
              )
            }
            case 'Paste': {
              // Its own ids are kept out of the page: each node gets a new one.
              const renamed = Composition.rekey(
                request.tree,
                Object.fromEntries(Object.keys(request.tree.nodes).map((id, at) => [id, ids[at]!])),
              )
              return applyOp(model, Composition.Op.insertTree({ tree: renamed, at: request.at }))
            }
            case 'Duplicate': {
              if (documentOf(model).nodes[request.id] === undefined)
                return refuse(model, {
                  code: 'composition:missing-node',
                  message: fillWords(words.notANode, { id: request.id }),
                })
              const held = Object.keys(Composition.takeTree(documentOf(model), request.id).nodes)
              if (held.length !== ids.length)
                return refuse(model, {
                  code: 'composition:malformed-tree',
                  message: fillWords(words.copyChanged, { id: request.id }),
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
          }
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
              // The page changed under the field being edited: it is drawn from the page again.
              editing: Option.none(),
            },
            commands: announce(message._tag === 'Undid' ? words.undone : words.redone),
          }
        }
        case 'DragStarted':
          // A node gone, or a Block with nothing to start from, starts no drag.
          return Option.isNone(draggedOf(documentOf(model), message.source))
            ? { model }
            : {
                model: {
                  ...model,
                  drag: Option.some({
                    source: message.source,
                    over: Option.none(),
                    at: Option.none(),
                  }),
                  // A node dragged is the one worked on; a new one is selected once it is added.
                  selected:
                    message.source._tag === 'Existing'
                      ? Option.some(message.source.id)
                      : model.selected,
                },
              }
        case 'DraggedOver':
          return draggedOver(model, message.id, message.zone, Option.none())
        case 'DraggedOverRegion':
          return draggedOver(model, message.id, 'inside', Option.some(message.region))
        case 'DraggedOverPage': {
          if (Option.isNone(model.drag)) return { model }
          const drag = model.drag.value
          return {
            model: {
              ...model,
              drag: Option.some({
                ...drag,
                over: Option.none(),
                at: onPage(documentOf(model), drag.source),
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
          const { source, over, at } = model.drag.value
          const ended = { ...model, drag: Option.none() }
          // Worked out again: the page may have changed since the pointer got here.
          // Over no node with a place is over the page's own space.
          const landed = Option.match(over, {
            onNone: () =>
              Option.isSome(at)
                ? Option.map(onPage(documentOf(model), source), place => ({ at: place }))
                : Option.none(),
            onSome: target =>
              Option.flatMap(draggedOf(documentOf(model), source), dragged =>
                landing(catalog, documentOf(model), dragged, target.id, target.zone, target.region),
              ),
          })
          return Option.match(landed, {
            onNone: () => ({ model: ended, commands: announce(unmoved(source)) }),
            onSome: ({ at }) =>
              source._tag === 'Existing'
                ? applyOp(ended, Composition.Op.move(source.id, at))
                : // A new node needs an id: the same request a press on the palette makes.
                  { model: ended, commands: mint(1, { _tag: 'Insert', block: source.block, at }) },
          })
        }
        case 'DragCancelled':
          return Option.isNone(model.drag)
            ? { model }
            : {
                model: { ...model, drag: Option.none() },
                commands: announce(unmoved(model.drag.value.source)),
              }
        case 'PreviewChosen':
          return {
            model: { ...model, preview: { ...model.preview, [message.key]: message.value } },
          }
        case 'PreviewCleared': {
          const { [message.key]: _, ...others } = model.preview
          return { model: { ...model, preview: others } }
        }
        case 'Inspected':
          return inspect(model, message)
        case 'PanelChosen':
          return { model: { ...model, panel: message.panel } }
        case 'ViewportChosen':
          return { model: { ...model, viewport: message.viewport } }
        // The placements' own: the layers and the announcer update themselves.
        case 'GotLayersMessage':
        case 'GotAnnouncerMessage':
          return { model }
      }
    }

    const assembled = placements.update(own)
    /**
     * Editing in place kept only while its node is the one selected: another
     * selected, or the node removed (which deselects it), ends it.
     */
    const stillEditing = (model: Model): Model =>
      Option.isSome(model.editing) && !Option.contains(model.selected, model.editing.value.id)
        ? { ...model, editing: Option.none() }
        : model
    /**
     * The layers' keys, once the node they were on is removed and nothing is
     * selected, start from where it was: its next sibling left, else the one
     * before, else the nearest holder left; not the first row.
     */
    const keptCurrent = <R extends { readonly model: Model }>(before: Model, next: R): R => {
      const { current } = next.model.layers
      const after = documentOf(next.model)
      if (current === null || Composition.index(after).has(NodeId.make(current))) return next
      const was = documentOf(before)
      const place = Composition.index(was).get(NodeId.make(current))
      if (place === undefined) return next
      const left = (id: NodeId) => Composition.index(after).has(id)
      const siblings =
        place.parent === undefined
          ? was.roots
          : (was.nodes[place.parent]?.regions[place.region ?? ''] ?? [])
      const beside = [
        ...siblings.slice(place.index + 1),
        ...siblings.slice(0, place.index).reverse(),
      ].find(left)
      let holder = place.parent
      while (holder !== undefined && !left(holder))
        holder = Composition.index(was).get(holder)?.parent
      const kept = beside ?? holder ?? null
      return { ...next, model: { ...next.model, layers: { ...next.model.layers, current: kept } } }
    }
    const update = (model: Model, message: Message) => {
      const moved = assembled(model, message)
      const next = {
        ...moved,
        model: stillEditing(
          message._tag === 'Inspected' ? moved.model : reconciled(model, moved.model),
        ),
      }
      // Moving focus in the layers moves the selection with it.
      if (message._tag === Layers.wrapper.tag && message.message._tag === 'Focused') {
        const id = NodeId.make(message.message.id)
        return documentOf(next.model).nodes[id] === undefined
          ? next
          : { ...next, model: { ...next.model, selected: Option.some(id) } }
      }
      // A selection made elsewhere (an insert, the canvas, a row click) is where
      // the layers' keys start from, with the rows above it open so it shows.
      if (Option.isNone(next.model.selected)) return keptCurrent(model, next)
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
          .filter(block => Object.hasOwn(starters, block.name))
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
              button(words.moveUp, applied(moveBy(documentOf(model), selected, -1))),
              button(words.moveDown, applied(moveBy(documentOf(model), selected, 1))),
              button(
                words.duplicate,
                Option.map(after(documentOf(model), selected), at =>
                  Message.DuplicateAsked({ id: selected, at }),
                ),
              ),
              button(
                words.delete,
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
                words.undo,
                History.canUndo(model.page) ? Option.some(Message.Undid()) : Option.none(),
              ),
              button(
                words.redo,
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

    /** Undo and redo, which need no selection. */
    const history = (model: Pick<Model, 'page'>) => ({
      undo: History.canUndo(model.page) ? Option.some(Message.Undid()) : Option.none(),
      redo: History.canRedo(model.page) ? Option.some(Message.Redid()) : Option.none(),
    })
    /** A command on the selected node, which runs nothing while none is selected. */
    const onSelected =
      (run: (document: Document, selected: NodeId) => Option.Option<Message>) =>
      (model: Pick<Model, 'page' | 'selected'>): Option.Option<Message> =>
        Option.flatMap(model.selected, selected => run(documentOf(model), selected))

    const built: ReadonlyArray<BuilderCommand> = [
      {
        id: 'move-up',
        label: words.moveUp,
        keys: [{ key: 'ArrowUp', alt: true }],
        placement: ['node'],
        run: onSelected((document, selected) => applied(moveBy(document, selected, -1))),
      },
      {
        id: 'move-down',
        label: words.moveDown,
        keys: [{ key: 'ArrowDown', alt: true }],
        placement: ['node'],
        run: onSelected((document, selected) => applied(moveBy(document, selected, 1))),
      },
      {
        id: 'move-out',
        label: words.moveOut,
        keys: [{ key: 'ArrowLeft', alt: true }],
        placement: ['node'],
        run: onSelected((document, selected) => applied(outdent(document, selected))),
      },
      {
        id: 'move-in',
        label: words.moveIn,
        keys: [{ key: 'ArrowRight', alt: true }],
        placement: ['node'],
        run: onSelected((document, selected) => applied(indent(catalog, document, selected))),
      },
      {
        id: 'duplicate',
        label: words.duplicate,
        keys: [{ key: 'd', mod: true }],
        placement: ['node'],
        // Offered only where its Region has room for the copy.
        run: onSelected((document, selected) =>
          Option.map(
            Option.filter(after(document, selected), at => hasRoom(catalog, document, at)),
            at => Message.DuplicateAsked({ id: selected, at }),
          ),
        ),
      },
      {
        id: 'copy',
        label: words.copy,
        keys: [{ key: 'c', mod: true }],
        placement: ['node'],
        run: onSelected((_, selected) => Option.some(Message.CopyAsked({ id: selected }))),
      },
      {
        id: 'cut',
        label: words.cutCommand,
        keys: [{ key: 'x', mod: true }],
        placement: ['node'],
        run: onSelected((_, selected) => Option.some(Message.CutAsked({ id: selected }))),
      },
      {
        id: 'delete',
        label: words.delete,
        keys: [{ key: 'Delete' }, { key: 'Backspace' }],
        placement: ['node'],
        run: onSelected((_, selected) =>
          Option.some(Message.Applied({ op: Composition.Op.remove(selected) })),
        ),
      },
      {
        id: 'undo',
        label: words.undo,
        keys: [{ key: 'z', mod: true, shift: false }],
        placement: ['toolbar'],
        run: model => history(model).undo,
      },
      {
        id: 'redo',
        label: words.redo,
        keys: [
          { key: 'z', mod: true, shift: true },
          { key: 'y', mod: true },
        ],
        placement: ['toolbar'],
        run: model => history(model).redo,
      },
      {
        id: 'paste',
        label: words.paste,
        keys: [{ key: 'v', mod: true }],
        placement: ['toolbar'],
        run: () => Option.some(Message.PasteAsked()),
      },
      {
        id: 'edit-text',
        label: words.editText,
        keys: [{ key: 'Enter' }],
        placement: ['keyboard'],
        // The first text the node draws as a field; none for a node that draws none.
        run: onSelected((document, selected) =>
          Option.map(
            Option.fromUndefinedOr(Renderer.fields(renderer, document, selected)[0]),
            key => Message.EditingAsked({ field: fieldName(selected, key) }),
          ),
        ),
      },
      {
        id: 'deselect',
        label: words.deselect,
        keys: [{ key: 'Escape' }],
        placement: ['keyboard'],
        run: onSelected(() => Option.some(Message.Deselected())),
      },
    ]
    const commands = config.commands === undefined ? built : config.commands(built)

    /**
     * The Message a key sends, for the layers panel and the canvas: the first
     * command one of whose keys it is, and whose run has one. None for a key
     * no command takes, or one whose command has nothing to do, and none at
     * all while text is edited in place: its keys are the text's.
     */
    const keyCommand = (
      model: Pick<Model, 'page' | 'selected' | 'editing'>,
      key: string,
      modifiers: KeyboardModifiers,
    ): Option.Option<Message> => {
      if (Option.isSome(model.editing)) return Option.none()
      for (const command of commands) {
        if (!command.keys.some(spec => pressed(spec, key, modifiers))) continue
        const sent = command.run(model)
        if (Option.isSome(sent)) return sent
      }
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
      /** Where a pattern goes, as a new node of its root's Block would; none where it may not. */
      patternAt: (document: Document, selected: Option.Option<NodeId>, pattern: string) =>
        Option.flatMap(Catalog.pattern(catalog, pattern), found =>
          Option.flatMap(Option.fromUndefinedOr(found.tree.nodes[found.tree.root]), root =>
            placeFor(catalog, document, selected, root.block),
          ),
        ),
      moveBy,
      /** Where what is dragged over `target`, in `zone`, would go; none where it may not. */
      dropAt: (document: Document, dragged: DragSource, target: NodeId, zone: DropZone) =>
        Option.map(
          Option.flatMap(draggedOf(document, dragged), each =>
            landing(catalog, document, each, target, zone),
          ),
          ({ at }) => at,
        ),
      replace,
      settle,
      /** The editor's commands: what a key, a node's action or the toolbar runs. */
      commands,
      keyCommand,
      /**
       * The selected node's settings form and its Model, for the inspector to
       * draw: the Model it holds for the node, else one filled from the props.
       */
      inspecting,
      /** The Blocks a new node may be, in the Catalog's order: those with starting props. */
      offered: catalog.blocks
        .filter(block => Object.hasOwn(starters, block.name))
        .map(block => block.name),
      /** The Document a Builder Model is editing: its history's present. */
      document: documentOf,
    }
  },
}
