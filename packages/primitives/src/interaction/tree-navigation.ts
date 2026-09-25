/**
 * Keyboard navigation of a tree (a file explorer, a page's layers, a nested
 * menu), after the WAI-ARIA tree pattern: one tab stop, Up and Down through the
 * rows that are showing, Right to open a row or step into it, Left to close it
 * or step out to its parent, Home and End to the first and last row.
 *
 * The Model slice is the current row's id and which rows are open. Openness is
 * stored as the rows `toggled` away from a default, so a layers panel that
 * starts with everything open and a file tree that starts closed are the same
 * bundle with a different `openByDefault`, and neither stores every row.
 *
 * Which rows exist is the view's to say, each with its parent, in tree order.
 * What a key does is a pure function of those rows and the Model; the Behavior
 * wires it to the slots and writes the tree's ARIA attributes.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import type { Declared } from 'foldkit-bundle'
import { Behavior, Capability, type SlotItem } from 'foldkit-mixins'
import { idSelector } from './roving-tabindex.js'

export const Model = Schema.Struct({
  /** The current row's id, or `null` before any row has been focused. */
  current: Schema.NullOr(Schema.String),
  /** The rows whose open state differs from `openByDefault`. */
  toggled: Schema.Array(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** A row became current: the user focused it, or a key moved there. */
  Focused: { id: Schema.String },
  Opened: { id: Schema.String },
  Closed: { id: Schema.String },
})
export type Message = typeof Message.Type

export const Args = Schema.Struct({
  /** Whether a row with children starts open. */
  openByDefault: Schema.Boolean,
})
export type Args = typeof Args.Type

/** Whether a row is open, given the default and what was toggled. */
export const isOpen = (model: Model, args: Args, id: string): boolean =>
  args.openByDefault !== model.toggled.includes(id)

const setOpen = (model: Model, args: Args, id: string, open: boolean): Model =>
  isOpen(model, args, id) === open
    ? model
    : {
        ...model,
        toggled: model.toggled.includes(id)
          ? model.toggled.filter(toggled => toggled !== id)
          : [...model.toggled, id],
      }

export const bundle = Bundle.make('TreeNavigation', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { current: null, toggled: [] } }),
  update: (model, message, args) => {
    switch (message._tag) {
      case 'Focused':
        return { model: { ...model, current: message.id } }
      case 'Opened':
        return { model: setOpen(model, args, message.id, true) }
      case 'Closed':
        return { model: setOpen(model, args, message.id, false) }
    }
  },
})

/** One row of the tree, in tree order: a parent comes before its children. */
export interface Row {
  readonly id: string
  /** The parent's id, or `null` for a top-level row. */
  readonly parent: string | null
  /** Whether it has children, so it can be opened and closed. */
  readonly branch: boolean
  readonly disabled?: boolean
}

/** A row as it is showing: where it sits, for its ARIA attributes. */
export interface Shown extends Row {
  /** 1 for a top-level row. */
  readonly level: number
  /** Its place among its siblings, from 1, and how many there are. */
  readonly position: number
  readonly siblings: number
}

/**
 * The rows that are showing: every row whose ancestors are all open, with its
 * level and its place among its siblings. A row whose parent is not a row is
 * treated as top-level.
 */
export const shown = (rows: ReadonlyArray<Row>, model: Model, args: Args): ReadonlyArray<Shown> => {
  const byId = new Map(rows.map(row => [row.id, row]))
  const siblingsOf = new Map<string | null, Array<string>>()
  for (const row of rows) {
    const parent = row.parent !== null && byId.has(row.parent) ? row.parent : null
    siblingsOf.set(parent, [...(siblingsOf.get(parent) ?? []), row.id])
  }
  const levels = new Map<string, number>()
  const showing = new Map<string, boolean>()
  const result: Array<Shown> = []
  for (const row of rows) {
    const parent = row.parent !== null && byId.has(row.parent) ? row.parent : null
    const level = parent === null ? 1 : (levels.get(parent) ?? 0) + 1
    levels.set(row.id, level)
    const visible = parent === null || (showing.get(parent) === true && isOpen(model, args, parent))
    showing.set(row.id, visible)
    if (!visible) continue
    const siblings = siblingsOf.get(parent) ?? []
    result.push({
      ...row,
      level,
      position: siblings.indexOf(row.id) + 1,
      siblings: siblings.length,
    })
  }
  return result
}

/** What a key does: move to a row, or open or close one. */
export type Action =
  | { readonly _tag: 'Focus'; readonly id: string }
  | { readonly _tag: 'Open'; readonly id: string }
  | { readonly _tag: 'Close'; readonly id: string }

const isPlain = (modifiers: KeyboardModifiers): boolean =>
  !modifiers.ctrlKey && !modifiers.altKey && !modifiers.metaKey

/**
 * What a key does from the current row, over the rows that are showing, or
 * `undefined` when it is not a key the tree handles. Disabled rows are stepped
 * over. With nothing current, Down and Home land on the first row, Up and End
 * on the last. Right and Left swap under `rtl`.
 */
export const move = (
  rows: ReadonlyArray<Shown>,
  current: string | null,
  key: string,
  modifiers: KeyboardModifiers,
  model: Model,
  args: Args,
  direction: 'ltr' | 'rtl' = 'ltr',
): Action | undefined => {
  const enabled = rows.filter(row => row.disabled !== true)
  if (enabled.length === 0 || !isPlain(modifiers)) return undefined
  const focus = (row: Row | undefined): Action | undefined =>
    row === undefined ? undefined : { _tag: 'Focus', id: row.id }
  const at = enabled.findIndex(row => row.id === current)
  const inward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const outward = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  if (key === 'Home') return focus(enabled[0])
  if (key === 'End') return focus(enabled[enabled.length - 1])
  if (key === 'ArrowDown')
    return focus(at === -1 ? enabled[0] : enabled[Math.min(at + 1, enabled.length - 1)])
  if (key === 'ArrowUp')
    return focus(at === -1 ? enabled[enabled.length - 1] : enabled[Math.max(at - 1, 0)])
  const row = enabled[at]
  if (row === undefined) return key === inward || key === outward ? focus(enabled[0]) : undefined
  if (key === inward) {
    if (!row.branch) return undefined
    if (!isOpen(model, args, row.id)) return { _tag: 'Open', id: row.id }
    return focus(enabled.find(child => child.parent === row.id))
  }
  if (key === outward) {
    if (row.branch && isOpen(model, args, row.id)) return { _tag: 'Close', id: row.id }
    return focus(enabled.find(parent => parent.id === row.parent))
  }
  return undefined
}

/** The row that holds the tab stop: the current one while it is showing, else the first. */
export const tabStop = (rows: ReadonlyArray<Shown>, current: string | null): string | undefined => {
  const here = rows.find(row => row.id === current && row.disabled !== true)
  return (here ?? rows.find(row => row.disabled !== true))?.id
}

export interface BehaviorOptions<Input, Slots> {
  /** The slot that receives the keys: the element with `role="tree"`. */
  readonly container: keyof Slots & string
  /** The slot rendered once per showing row, with `item.id` or `item.index` into `shown`. */
  readonly item: keyof Slots & string
  /** Every row, open or not, in tree order. */
  readonly rows: (input: Input) => ReadonlyArray<Row>
  /** The DOM id a row's element carries. Default: the row's own id. */
  readonly domId?: (id: string) => string
  readonly direction?: (input: Input) => 'ltr' | 'rtl'
}

/**
 * Wires a placed `TreeNavigation` to the slots. The container's keys move focus
 * to the row they pick, or open or close the current row with focus left where
 * it is. Each showing row gets its id, `role="treeitem"`, `aria-level`,
 * `aria-posinset`, `aria-setsize`, `aria-expanded` when it has children,
 * `aria-disabled` when disabled, a roving `tabindex`, and `OnFocus` reporting
 * it current. Every handled key is default-prevented.
 */
/** The rows showing for one input, with what each row's attributes look up. */
interface Prepared {
  readonly model: Model
  readonly rows: ReadonlyArray<Shown>
  readonly byId: ReadonlyMap<string, Shown>
  readonly stop: string | undefined
}

export const behavior =
  <Field extends string>(declared: Declared<typeof bundle, Field>, args: Args) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
    const wrap = (message: Message): ParentMessage =>
      declared.wrapper.make(message) as unknown as ParentMessage
    const slice = (input: Input): Model => input[declared.field]
    const domId = options.domId ?? ((id: string) => id)
    // Every row's attributes read the same rows: work them out once per input,
    // or a tree of n rows costs n times its whole.
    const prepared = new WeakMap<Input, Prepared>()
    const prepare = (input: Input): Prepared => {
      const known = prepared.get(input)
      if (known !== undefined) return known
      const model = slice(input)
      const rows = shown(options.rows(input), model, args)
      const made: Prepared = {
        model,
        rows,
        byId: new Map(rows.map(row => [row.id, row])),
        stop: tabStop(rows, model.current),
      }
      prepared.set(input, made)
      return made
    }
    return Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
          }) => {
            const { model, rows } = prepare(input)
            const direction = options.direction?.(input) ?? 'ltr'
            return [
              h.OnKeyDownFocus((key, modifiers) => {
                const action = move(rows, model.current, key, modifiers, model, args, direction)
                if (action === undefined) return Option.none()
                // Opening or closing keeps focus on the row it acted on.
                const message =
                  action._tag === 'Focus'
                    ? Message.Focused({ id: action.id })
                    : action._tag === 'Open'
                      ? Message.Opened({ id: action.id })
                      : Message.Closed({ id: action.id })
                return Option.some({
                  focusSelector: idSelector(domId(action.id)),
                  message: wrap(message),
                })
              }),
            ]
          },
        }),
        [options.item]: Behavior.slot({
          requires: { capability: Capability.Focusable },
          attributes: ({
            input,
            h,
            item,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
            readonly item?: SlotItem
          }) => {
            if (item === undefined) return []
            const { model, rows, byId, stop } = prepare(input)
            const row = item.id === undefined ? rows[item.index] : byId.get(item.id)
            if (row === undefined) return []
            return [
              h.Id(domId(row.id)),
              h.Role('treeitem'),
              h.AriaLevel(row.level),
              h.AriaPosinset(row.position),
              h.AriaSetsize(row.siblings),
              ...(row.branch ? [h.AriaExpanded(isOpen(model, args, row.id))] : []),
              ...(row.disabled === true ? [h.AriaDisabled(true)] : []),
              h.Tabindex(stop === row.id ? 0 : -1),
              h.OnFocus(wrap(Message.Focused({ id: row.id }))),
            ]
          },
        }),
        // Keyed by values the caller chose; `forSlots` checks both keys exist.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'TreeNavigation' },
    )
  }
