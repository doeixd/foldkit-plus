import { Effect, Match, Option, Schema } from 'effect'
import {
  Attr,
  Behavior,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
} from 'foldkit-mixins'
import { FluidHover } from 'foldkit-primitives/dom'
import { RovingTabindex, TreeNavigation, Typeahead } from 'foldkit-primitives/interaction'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { flipped } from './choices.js'
import { readingKey } from './direction.js'
import type { MixinList } from './resolve.js'

/**
 * A tree view, the APG's and Zag's: nested rows that open and shut, one tab
 * stop, Up and Down through the rows showing, Right to open a row or step
 * into it, Left to shut it or step out (the two swapped under `direction:
 * 'rtl'`), Home and End, Enter and Space to choose a row (and open or shut
 * it, if it holds rows), and a printed
 * character to the next showing row that starts with it. The keys are
 * `TreeNavigation`'s, decided in `update` against this Model, so keys faster
 * than a frame still move on. The current, open and chosen rows are this
 * Model, which the application keeps and folds with `update(nodes)`.
 *
 * Each row is an `item` (the `treeitem`, which takes focus) holding a `row`
 * (the line drawn and clicked) and, when it holds rows, a `group`. The item
 * carries its depth as `--fk-tree-level` and `data-state` open or closed; a
 * shut group stays drawn, `inert`, so it can animate shut. A row draws its
 * node's `icon` (its `openIcon` while open) before its label.
 *
 * A `checkable` tree, Zag's, gives each row a box: checking a row that
 * holds rows checks every enabled row beneath it, and it reads checked,
 * unchecked or mixed from them, as `aria-checked` on the item and
 * `data-state` on its `checkbox`. Space checks the current row, a press on
 * the box checks its row, and Enter and a press on the row still choose.
 * What is checked is the Model's `checked`, the ids of the rows holding no
 * rows; a disabled row keeps what it was given.
 *
 * `highlight`, drawn first in the root, is the hover that follows the pointer
 * from row to row, which `fluid` moves.
 */
export const TreeViewSlots = Slots.define({
  root: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  item: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Focus],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.AriaSelected, Attr.AriaDisabled],
  }),
  row: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  chevron: Slot.make({ capability: Capability.Container }),
  /** The row's box in a `checkable` tree; pressing it checks the row and chooses nothing. */
  checkbox: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  icon: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  highlight: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

// A row showing: its item neither disabled nor in a shut group, whose rows stay drawn.
const shownRow = '[role="treeitem"]:not([aria-disabled="true"], [inert] *) > :first-child'

/**
 * What moves the `highlight`: on the root, one highlight follows the pointer
 * to the nearest showing row, and to the row the keys focus, at its own
 * indentation. Pass it beside the style; until it runs, each row marks its
 * own hover and the drawn highlight shows nothing.
 */
export const fluid = [
  Behavior.forSlots(TreeViewSlots)<unknown, never>(
    {
      root: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'tree-hover',
            item: shownRow,
            axis: 'y',
            gapClick: true,
            // The focused `treeitem` holds its row and the rows beneath it.
            focused: ':scope:not([aria-disabled="true"]) > :first-child',
          }),
      }),
    },
    { name: 'TreeViewHover' },
  ).mixin,
] as const

/** A row of the tree, and the rows it holds. */
export interface TreeNode {
  readonly id: string
  readonly label: string
  readonly children?: ReadonlyArray<TreeNode> | undefined
  readonly disabled?: boolean | undefined
  /** Drawn before the label: a file's kind, a shut folder. */
  readonly icon?: Html | undefined
  /** Drawn in place of `icon` while the row is open: an open folder. */
  readonly openIcon?: Html | undefined
}

export const Model = Schema.Struct({
  /** Prefixes every id the tree draws, unique on the page. */
  id: Schema.String,
  /** The row that holds the tab stop, once one has been reached. */
  current: Schema.Option(Schema.String),
  /** The ids of the open rows. */
  open: Schema.Array(Schema.String),
  /** The chosen row, `aria-selected`. */
  selected: Schema.Option(Schema.String),
  /** The checked rows that hold no rows; a row holding rows reads its state from them. */
  checked: Schema.Array(Schema.String),
  /** The letters typed so far, which a pause clears: typeahead matches the whole word, not the last key. */
  typeahead: Typeahead.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /**
   * A key pressed in the tree, read against `update`'s own Model, as a
   * left-to-right reader presses it: ArrowRight steps in.
   */
  Pressed: { key: Schema.String },
  /** A row took focus: tabbed into, or clicked. */
  Focused: { id: Schema.String },
  Clicked: { id: Schema.String },
  /** A row's box was pressed. */
  Checked: { id: Schema.String },
  /** The pause after `generation`'s key ended: its query is dropped. */
  QueryExpired: { generation: Schema.Number },
  CompletedFocusItem: {},
})
export type Message = typeof Message.Type

export const init = (options: {
  readonly id: string
  readonly open?: ReadonlyArray<string>
  readonly checked?: ReadonlyArray<string>
}): Model => ({
  id: options.id,
  current: Option.none(),
  open: options.open ?? [],
  selected: Option.none(),
  checked: options.checked ?? [],
  typeahead: { query: '', generation: 0 },
})

/** The DOM id of a row's `treeitem`. */
export const itemId = (model: Model, id: string): string => `${model.id}-item-${id}`

const FocusItem = Command.define('FocusItem', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocusItem],
  execute: ({ id }) =>
    Dom.focus(RovingTabindex.idSelector(id)).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedFocusItem()),
    ),
})

/** How long a typed query lasts after its last key. */
const QUERY_MS = 500

const ExpireQuery = Command.define('ExpireQuery', {
  args: { generation: Schema.Number },
  messages: [Message.QueryExpired],
  execute: ({ generation }) =>
    Effect.sleep(QUERY_MS).pipe(Effect.as(Message.QueryExpired({ generation }))),
})

interface Flat {
  readonly rows: ReadonlyArray<TreeNavigation.Row>
  readonly labels: ReadonlyMap<string, string>
  /** Each row's rows that hold none, itself for such a row, in tree order. */
  readonly leaves: ReadonlyMap<string, ReadonlyArray<string>>
}

// The view and `update` both read the tree flat; flatten each tree once.
const flats = new WeakMap<ReadonlyArray<TreeNode>, Flat>()

const flatOf = (nodes: ReadonlyArray<TreeNode>): Flat => {
  const known = flats.get(nodes)
  if (known !== undefined) return known
  const rows: Array<TreeNavigation.Row> = []
  const labels = new Map<string, string>()
  const leaves = new Map<string, ReadonlyArray<string>>()
  const walk = (level: ReadonlyArray<TreeNode>, parent: string | null): ReadonlyArray<string> =>
    level.flatMap(node => {
      const children = node.children ?? []
      rows.push({
        id: node.id,
        parent,
        branch: children.length > 0,
        disabled: node.disabled === true,
      })
      labels.set(node.id, node.label)
      const under = children.length > 0 ? walk(children, node.id) : [node.id]
      leaves.set(node.id, under)
      return under
    })
  walk(nodes, null)
  const flat = { rows, labels, leaves }
  flats.set(nodes, flat)
  return flat
}

// `TreeNavigation` stores openness as rows toggled from a default; a tree
// that starts shut makes the open rows exactly that list.
const args: TreeNavigation.Args = { openByDefault: false }
const navigationOf = (model: Model): TreeNavigation.Model => ({
  current: Option.getOrNull(model.current),
  toggled: model.open,
})

const plain = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

type Return = Update.Return<Model, Message>

const focused = (model: Model, id: string): Return => ({
  model: Option.contains(model.current, id)
    ? model
    : modifyFields(model, { current: () => Option.some(id) }),
  commands: [FocusItem({ id: itemId(model, id) })],
})

/** Choosing a row: it is current and chosen, and a row holding rows opens or shuts. */
const chosen = (model: Model, row: TreeNavigation.Row): Return => {
  if (
    Option.contains(model.current, row.id) &&
    Option.contains(model.selected, row.id) &&
    !row.branch
  ) {
    return { model }
  }
  return {
    model: modifyFields(model, {
      current: () => Option.some(row.id),
      selected: () => Option.some(row.id),
      open: () => (row.branch ? flipped(model.open, row.id) : model.open),
    }),
  }
}

/**
 * Each row's check: `true` when every row it holds that holds none is
 * checked, `'mixed'` when some are, `false` when none are.
 */
export const checksOf = (
  nodes: ReadonlyArray<TreeNode>,
  checked: ReadonlyArray<string>,
): ReadonlyMap<string, boolean | 'mixed'> => {
  const on = new Set(checked)
  const states = new Map<string, boolean | 'mixed'>()
  for (const [id, under] of flatOf(nodes).leaves) {
    const count = under.filter(leaf => on.has(leaf)).length
    states.set(id, count === 0 ? false : count === under.length || 'mixed')
  }
  return states
}

/** Which rows a checked value lists: see `checkedAs`. */
export type CheckedValue = 'leaf' | 'branch' | 'trunk'

/**
 * The Model's `checked` (the checked rows holding no rows) as the value an
 * application stores or sends, in tree order:
 * - `'leaf'`: the checked rows holding no rows, which is what `checked` holds.
 * - `'branch'`: every fully checked row, rows holding rows and not.
 * - `'trunk'`: the outermost fully checked rows, so a checked folder stands for
 *   everything in it.
 *
 * A row holding rows is fully checked as `checksOf` reads it: every row it
 * holds that holds none is checked, a disabled one included, so a folder with
 * an unchecked disabled file is not listed and its checked files are. Ids the
 * tree does not hold are left out. `leavesOf` is the way back, so the Model
 * stays the one owner of what is checked.
 */
export const checkedAs = (
  nodes: ReadonlyArray<TreeNode>,
  checked: ReadonlyArray<string>,
  as: CheckedValue,
): ReadonlyArray<string> => {
  const { rows } = flatOf(nodes)
  const on = new Set(checked)
  if (as === 'leaf') return rows.flatMap(row => (!row.branch && on.has(row.id) ? [row.id] : []))
  const full = new Set<string>()
  for (const [id, state] of checksOf(nodes, checked)) if (state === true) full.add(id)
  return rows.flatMap(row =>
    full.has(row.id) && (as === 'branch' || row.parent === null || !full.has(row.parent))
      ? [row.id]
      : [],
  )
}

/**
 * The checked rows holding no rows that a value stands for, in tree order,
 * to seed or write the Model's `checked`: an id of a row holding rows stands
 * for every such row beneath it, whichever value the application keeps
 * (`checkedAs`), and ids the tree does not hold are ignored.
 */
export const leavesOf = (
  nodes: ReadonlyArray<TreeNode>,
  value: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const flat = flatOf(nodes)
  const on = new Set(value.flatMap(id => flat.leaves.get(id) ?? []))
  return flat.rows.flatMap(row => (!row.branch && on.has(row.id) ? [row.id] : []))
}

/**
 * The tree's `update` over `nodes`, the tree the view draws; the same Model
 * when nothing changes. Pass the same `nodes` the view gets, built once, and
 * `checkable` as the view has it, which makes Space check the current row.
 */
export const update = (
  nodes: ReadonlyArray<TreeNode>,
  options: { readonly checkable?: boolean | undefined } = {},
) => {
  const flat = flatOf(nodes)
  const byId = new Map(flat.rows.map(row => [row.id, row]))
  const enabled = (id: string): Option.Option<TreeNavigation.Row> =>
    Option.filter(Option.fromUndefinedOr(byId.get(id)), row => row.disabled !== true)
  /**
   * The row checked, or unchecked when every enabled row beneath it already
   * is: a mixed row checks, as a mixed checkbox does when pressed.
   */
  const check = (model: Model, row: TreeNavigation.Row): Return => {
    const on = new Set(model.checked)
    const under = (flat.leaves.get(row.id) ?? []).filter(id => Option.isSome(enabled(id)))
    if (under.length === 0) return { model }
    const all = under.every(id => on.has(id))
    for (const id of under) {
      if (all) on.delete(id)
      else on.add(id)
    }
    return { model: modifyFields(model, { checked: () => [...on] }) }
  }
  return (model: Model, message: Message): Return =>
    Message.match<Return>(message, {
      Pressed: ({ key }) => {
        if (key === ' ' && options.checkable === true) {
          return Option.match(Option.flatMap(model.current, enabled), {
            onNone: () => ({ model }),
            onSome: row => check(model, row),
          })
        }
        if (key === 'Enter' || key === ' ') {
          return Option.match(Option.flatMap(model.current, enabled), {
            onNone: () => ({ model }),
            onSome: row => chosen(model, row),
          })
        }
        // APG: `*` opens every row beside the current one that holds rows.
        if (key === '*') {
          const here = Option.flatMap(model.current, id => Option.fromUndefinedOr(byId.get(id)))
          const beside = Option.match(here, {
            onNone: () => [],
            onSome: row =>
              flat.rows.filter(
                other =>
                  other.parent === row.parent &&
                  other.branch &&
                  other.disabled !== true &&
                  !model.open.includes(other.id),
              ),
          })
          return beside.length === 0
            ? { model }
            : { model: modifyFields(model, { open: open => [...open, ...beside.map(r => r.id)] }) }
        }
        const showing = TreeNavigation.shown(flat.rows, navigationOf(model), args)
        if (Typeahead.isPrintable(key, plain)) {
          const query = model.typeahead.query + key
          const generation = model.typeahead.generation + 1
          const at = Typeahead.match(
            showing.map(row => flat.labels.get(row.id) ?? ''),
            showing.flatMap((row, index) => (row.disabled === true ? [] : [index])),
            query,
            showing.findIndex(row => Option.contains(model.current, row.id)),
          )
          const row = at === undefined ? undefined : showing[at]
          const typed = modifyFields(model, { typeahead: () => ({ query, generation }) })
          const moved = row === undefined ? { model: typed } : focused(typed, row.id)
          return {
            model: moved.model,
            commands: [...(moved.commands ?? []), ExpireQuery({ generation })],
          }
        }
        const action = TreeNavigation.move(
          showing,
          Option.getOrNull(model.current),
          key,
          plain,
          navigationOf(model),
          args,
        )
        if (action === undefined) return { model }
        // A move ends the word being typed.
        const calm =
          model.typeahead.query === ''
            ? model
            : modifyFields(model, {
                typeahead: () => ({ query: '', generation: model.typeahead.generation }),
              })
        // `move` opens only a shut row and shuts only an open one, so each flips it.
        const flip = ({ id }: { readonly id: string }): Return => ({
          model: modifyFields(calm, { open: () => flipped(calm.open, id) }),
        })
        return Match.valueTags(action, {
          Focus: ({ id }) => focused(calm, id),
          Open: flip,
          Close: flip,
        })
      },
      QueryExpired: ({ generation }) =>
        generation === model.typeahead.generation && model.typeahead.query !== ''
          ? { model: modifyFields(model, { typeahead: () => ({ query: '', generation }) }) }
          : { model },
      Focused: ({ id }) =>
        Option.contains(model.current, id) || Option.isNone(enabled(id))
          ? { model }
          : { model: modifyFields(model, { current: () => Option.some(id) }) },
      Clicked: ({ id }) =>
        Option.match(enabled(id), {
          onNone: () => ({ model }),
          onSome: row => chosen(model, row),
        }),
      Checked: ({ id }) =>
        Option.match(enabled(id), {
          onNone: () => ({ model }),
          onSome: row => check(model, row),
        }),
      CompletedFocusItem: () => ({ model }),
    })
}

const stateOf = (check: boolean | 'mixed'): 'checked' | 'unchecked' | 'mixed' => {
  if (check === 'mixed') return 'mixed'
  return check ? 'checked' : 'unchecked'
}

const handled = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'])

export interface TreeViewView<ParentMessage> {
  /** The tree's name. */
  readonly label: string
  readonly model: Model
  /** The same tree `update` was given. */
  readonly nodes: ReadonlyArray<TreeNode>
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** Default `'ltr'`; under `'rtl'` ArrowLeft and ArrowRight swap. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** Gives each row a box; pass the same to `update`. */
  readonly checkable?: boolean | undefined
  /** A style of `TreeViewSlots`, for the tree's look. */
  readonly style?: NamedStyle<typeof TreeViewSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<ParentMessage> | undefined
}

export const view = <ParentMessage>(
  options: TreeViewView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const builders = SlotView.buildersFor(
    TreeViewSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage } = options
  const open = new Set(model.open)
  const checks = options.checkable === true ? checksOf(options.nodes, model.checked) : undefined
  const stop = TreeNavigation.tabStop(
    TreeNavigation.shown(flatOf(options.nodes).rows, navigationOf(model), args),
    Option.getOrNull(model.current),
  )
  const draw = (level: ReadonlyArray<TreeNode>, depth: number): ReadonlyArray<Html> =>
    level.map((node, index) => {
      const children = node.children ?? []
      const branch = children.length > 0
      const shown = branch && open.has(node.id)
      const state = h.DataAttribute('state', shown ? 'open' : 'closed')
      return h.keyed('li')(
        node.id,
        builders.item.attrs([
          h.Id(itemId(model, node.id)),
          h.Role('treeitem'),
          h.AriaLevel(depth),
          h.AriaPosinset(index + 1),
          h.AriaSetsize(level.length),
          h.AriaSelected(Option.contains(model.selected, node.id)),
          ...(branch ? [h.AriaExpanded(shown), state] : []),
          ...(node.disabled === true ? [h.AriaDisabled(true)] : []),
          ...(checks === undefined ? [] : [h.AriaChecked(checks.get(node.id) ?? false)]),
          h.Tabindex(stop === node.id ? 0 : -1),
          h.Style({ '--fk-tree-level': String(depth) }),
          h.OnFocus(onMessage(Message.Focused({ id: node.id }))),
        ]),
        [
          h.div(builders.row.attrs([h.OnClick(onMessage(Message.Clicked({ id: node.id })))]), [
            h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
            ...(checks === undefined
              ? []
              : [
                  h.span(
                    builders.checkbox.attrs([
                      h.AriaHidden(true),
                      h.DataAttribute('state', stateOf(checks.get(node.id) ?? false)),
                      // Stopped, so the row's own press, which chooses it, does not hear it too.
                      h.OnClick(onMessage(Message.Checked({ id: node.id })), {
                        propagation: 'Stop',
                      }),
                    ]),
                    [],
                  ),
                ]),
            ...Option.match(
              Option.fromUndefinedOr(shown ? (node.openIcon ?? node.icon) : node.icon),
              {
                onNone: () => [],
                onSome: icon => [h.span(builders.icon.attrs([h.AriaHidden(true)]), [icon])],
              },
            ),
            h.span(builders.label.attrs(), [node.label]),
          ]),
          ...(branch
            ? [
                h.ul(
                  builders.group.attrs([
                    h.Role('group'),
                    state,
                    ...(shown ? [] : [h.Attribute('inert', '')]),
                  ]),
                  draw(children, depth + 1),
                ),
              ]
            : []),
        ],
      )
    })
  return h.ul(
    builders.root.attrs([
      h.Role('tree'),
      h.AriaLabel(options.label),
      // The keys' direction is the drawing's, so the chevrons' `:dir()` agrees with them.
      ...(options.direction === undefined ? [] : [h.Dir(options.direction)]),
      h.OnKeyDownPreventDefault((pressed, modifiers) => {
        const key = readingKey(pressed, options.direction)
        return handled.has(key) || Typeahead.isPrintable(key, modifiers)
          ? Option.some(onMessage(Message.Pressed({ key })))
          : Option.none()
      }),
    ]),
    [
      h.li(builders.highlight.attrs([h.Role('none'), h.AriaHidden(true)]), []),
      ...draw(options.nodes, 1),
    ],
  )
}
