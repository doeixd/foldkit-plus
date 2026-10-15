import { Effect, Match, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
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
 * shut group stays drawn, `inert`, so it can animate shut.
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
  label: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

/** A row of the tree, and the rows it holds. */
export interface TreeNode {
  readonly id: string
  readonly label: string
  readonly children?: ReadonlyArray<TreeNode> | undefined
  readonly disabled?: boolean | undefined
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
  CompletedFocusItem: {},
})
export type Message = typeof Message.Type

export const init = (options: {
  readonly id: string
  readonly open?: ReadonlyArray<string>
}): Model => ({
  id: options.id,
  current: Option.none(),
  open: options.open ?? [],
  selected: Option.none(),
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

interface Flat {
  readonly rows: ReadonlyArray<TreeNavigation.Row>
  readonly labels: ReadonlyMap<string, string>
}

// The view and `update` both read the tree flat; flatten each tree once.
const flats = new WeakMap<ReadonlyArray<TreeNode>, Flat>()

const flatOf = (nodes: ReadonlyArray<TreeNode>): Flat => {
  const known = flats.get(nodes)
  if (known !== undefined) return known
  const rows: Array<TreeNavigation.Row> = []
  const labels = new Map<string, string>()
  const walk = (level: ReadonlyArray<TreeNode>, parent: string | null): void => {
    for (const node of level) {
      const children = node.children ?? []
      rows.push({
        id: node.id,
        parent,
        branch: children.length > 0,
        disabled: node.disabled === true,
      })
      labels.set(node.id, node.label)
      walk(children, node.id)
    }
  }
  walk(nodes, null)
  const flat = { rows, labels }
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
 * The tree's `update` over `nodes`, the tree the view draws; the same Model
 * when nothing changes. Pass the same `nodes` the view gets, built once.
 */
export const update = (nodes: ReadonlyArray<TreeNode>) => {
  const flat = flatOf(nodes)
  const byId = new Map(flat.rows.map(row => [row.id, row]))
  const enabled = (id: string): Option.Option<TreeNavigation.Row> =>
    Option.filter(Option.fromUndefinedOr(byId.get(id)), row => row.disabled !== true)
  return (model: Model, message: Message): Return =>
    Message.match<Return>(message, {
      Pressed: ({ key }) => {
        if (key === 'Enter' || key === ' ') {
          return Option.match(Option.flatMap(model.current, enabled), {
            onNone: () => ({ model }),
            onSome: row => chosen(model, row),
          })
        }
        const showing = TreeNavigation.shown(flat.rows, navigationOf(model), args)
        if (Typeahead.isPrintable(key, plain)) {
          const at = Typeahead.match(
            showing.map(row => flat.labels.get(row.id) ?? ''),
            showing.flatMap((row, index) => (row.disabled === true ? [] : [index])),
            key,
            showing.findIndex(row => Option.contains(model.current, row.id)),
          )
          const row = at === undefined ? undefined : showing[at]
          return row === undefined ? { model } : focused(model, row.id)
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
        // `move` opens only a shut row and shuts only an open one, so each flips it.
        const flip = ({ id }: { readonly id: string }): Return => ({
          model: modifyFields(model, { open: () => flipped(model.open, id) }),
        })
        return Match.valueTags(action, {
          Focus: ({ id }) => focused(model, id),
          Open: flip,
          Close: flip,
        })
      },
      Focused: ({ id }) =>
        Option.contains(model.current, id) || Option.isNone(enabled(id))
          ? { model }
          : { model: modifyFields(model, { current: () => Option.some(id) }) },
      Clicked: ({ id }) =>
        Option.match(enabled(id), {
          onNone: () => ({ model }),
          onSome: row => chosen(model, row),
        }),
      CompletedFocusItem: () => ({ model }),
    })
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
          h.Tabindex(stop === node.id ? 0 : -1),
          h.Style({ '--fk-tree-level': String(depth) }),
          h.OnFocus(onMessage(Message.Focused({ id: node.id }))),
        ]),
        [
          h.div(builders.row.attrs([h.OnClick(onMessage(Message.Clicked({ id: node.id })))]), [
            h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
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
      h.OnKeyDownPreventDefault((pressed, modifiers) => {
        const key = readingKey(pressed, options.direction)
        return handled.has(key) || Typeahead.isPrintable(key, modifiers)
          ? Option.some(onMessage(Message.Pressed({ key })))
          : Option.none()
      }),
    ]),
    draw(options.nodes, 1),
  )
}
