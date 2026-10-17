import { AnchorConfig, anchorSetup } from '@foldkit/ui/anchor'
import { Effect, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { layerBox, topLayer } from './anchor.js'
import { readingKey } from './direction.js'
import type { MixinList } from './resolve.js'

/**
 * A cascade select, Zag's: one value chosen as a path through nested options
 * (a country, then a region, then a city), from a popup that shows one
 * column per level, or one level at a time with a way back (`layout:
 * 'drill'`). The value is the path of ids, root first.
 *
 * ```text
 * trigger -> Opened -> highlighted = the value's path, or the first option
 * keys, pointer -> Pressed / Highlighted / Picked -> update(config) -> highlighted, value
 * view: highlighted -> the columns shown, the active row; value -> the trigger's text
 * ```
 *
 * The open popup is a tree in the APG's sense, its columns the levels: focus
 * rests on it and `aria-activedescendant` names the active row. The arrows
 * move within a level and between levels (ArrowRight into the active row's
 * children, ArrowLeft back to its parent, swapped right to left), Home and
 * End go to a level's ends, a letter to the next row it begins, Enter and
 * Space choose, and Escape closes. Only an option without children can be
 * chosen, unless the config's `parents` allows any. The popup is drawn in
 * the browser's top layer, placed under its trigger by `@foldkit/ui`'s
 * anchor, over a backdrop. Focus leaving the panel closes it, by Tab or a
 * press anywhere else; the backdrop takes that press, so it opens nothing
 * beneath, the trigger included.
 */
export const CascadeSelectSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaExpanded, Attr.AriaInvalid, Attr.Disabled],
  }),
  valueText: Slot.make({ capability: Capability.Container }),
  chevron: Slot.make({ capability: Capability.Container }),
  clear: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  /** The hidden input that submits the value, when the view names one. */
  input: Slot.make({ capability: Capability.Container, attributes: [Attr.Value] }),
  /** The box in the top layer that holds the backdrop and the panel. */
  layer: Slot.make({ capability: Capability.Container }),
  backdrop: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  column: Slot.make({ capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] }),
  /** A column's name, from the view's `levels`. */
  heading: Slot.make({ capability: Capability.Container }),
  /** Drilled in, the way back to the level above; the keys go back with ArrowLeft. */
  back: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  item: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.Hover],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.AriaExpanded, Attr.AriaDisabled],
  }),
  itemText: Slot.make({ capability: Capability.Container }),
  /** The mark on a row that has children. */
  branch: Slot.make({ capability: Capability.Container }),
})

/** An option and the options under it. */
export interface Node {
  readonly id: string
  readonly label: string
  readonly children?: ReadonlyArray<Node> | undefined
  readonly disabled?: boolean | undefined
}

export const Model = Schema.Struct({
  /** Prefixes every id the select draws, unique on the page. */
  id: Schema.String,
  open: Schema.Boolean,
  /** The chosen path of ids, root first. */
  value: Schema.Option(Schema.Array(Schema.String)),
  /** The path the keys or the pointer are on while open, its last the active row; empty while closed. */
  highlighted: Schema.Array(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Opened: {},
  /** The application closes it, giving focus back to the trigger. */
  Closed: {},
  /** A key on the open panel, as a left-to-right reader presses it. */
  Pressed: { key: Schema.String },
  /** The pointer is on a row (`expandOn: 'hover'`). */
  Highlighted: { path: Schema.Array(Schema.String) },
  /** A row was pressed. */
  Picked: { path: Schema.Array(Schema.String) },
  /** Drilled in, a row with children was pressed: show its children. */
  Entered: { path: Schema.Array(Schema.String) },
  /** Focus left the open panel, by Tab or a press elsewhere. */
  Left: {},
  Cleared: {},
  /** The panel was shown and placed. */
  Placed: {},
  CompletedFocusTrigger: {},
  CompletedRevealItem: {},
})
export type Message = typeof Message.Type

/** The options and the choices `update` and the view agree on. */
export interface Config {
  readonly nodes: ReadonlyArray<Node>
  /** Whether an option with children may be chosen too; default only those without. */
  readonly parents?: boolean | undefined
  /** Whether ArrowDown on a level's last row goes to its first; default false. */
  readonly loop?: boolean | undefined
  /** Whether choosing closes the popup; default true. */
  readonly closeOnSelect?: boolean | undefined
}

export const init = (options: {
  readonly id: string
  readonly value?: ReadonlyArray<string> | undefined
}): Model => ({
  id: options.id,
  open: false,
  value: Option.fromNullishOr(options.value),
  highlighted: [],
})

export const triggerId = (id: string): string => `${id}-trigger`
const panelId = (id: string): string => `${id}-panel`
const columnId = (id: string, level: number): string => `${id}-level-${level}`
/** A row's id, by its place in each level: ids an application chose may hold any character. */
const itemId = (id: string, places: ReadonlyArray<number>): string =>
  `${id}-item-${places.join('-')}`

/** The rows of each level `path` opens: the roots, then the children of each node on it. */
const levelsOf = (
  nodes: ReadonlyArray<Node>,
  path: ReadonlyArray<string>,
): ReadonlyArray<ReadonlyArray<Node>> => {
  const levels: Array<ReadonlyArray<Node>> = [nodes]
  for (const step of path) {
    const children = levels[levels.length - 1]!.find(node => node.id === step)?.children
    if (children === undefined || children.length === 0) break
    levels.push(children)
  }
  return levels
}

/** The nodes along `path`, as far as it names nodes. */
const nodesOn = (nodes: ReadonlyArray<Node>, path: ReadonlyArray<string>): ReadonlyArray<Node> => {
  const found: Array<Node> = []
  let level: ReadonlyArray<Node> = nodes
  for (const step of path) {
    const node = level.find(candidate => candidate.id === step)
    if (node === undefined) break
    found.push(node)
    level = node.children ?? []
  }
  return found
}

const hasChildren = (node: Node): boolean => (node.children ?? []).length > 0
const enabled = (node: Node): boolean => node.disabled !== true

/** The labels along the value, for the trigger, or none for a path that names no node. */
export const labelsOf = (nodes: ReadonlyArray<Node>, path: ReadonlyArray<string>) => {
  const found = nodesOn(nodes, path)
  return found.length === path.length && path.length > 0
    ? Option.some(found.map(node => node.label))
    : Option.none()
}

/** Focuses the trigger once the closed popup is drawn away. */
export const FocusTrigger = Command.define('CascadeSelect.FocusTrigger', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocusTrigger],
  execute: ({ id }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        document.getElementById(triggerId(id))?.focus()
        return Message.CompletedFocusTrigger()
      }),
    ),
})

/** Scrolls the active row into its column once drawn, as the keys move it. */
export const RevealItem = Command.define('CascadeSelect.RevealItem', {
  args: { elementId: Schema.String },
  messages: [Message.CompletedRevealItem],
  execute: ({ elementId }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        document.getElementById(elementId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        return Message.CompletedRevealItem()
      }),
    ),
})

/**
 * Shows its element in the top layer and places the panel inside it under
 * the trigger, focusing the panel once placed: the anchor hides the panel
 * until its first position, and focus does not land on a hidden element.
 */
export const PlaceCascade = Mount.define('CascadeSelect.Place', {
  args: { buttonId: Schema.String, anchor: AnchorConfig },
  messages: [Message.Placed],
  execute: ({ element, buttonId, anchor }) =>
    Effect.gen(function* () {
      const panel = element.querySelector('[role="tree"]')
      if (panel !== null) {
        yield* Effect.acquireRelease(
          Effect.sync(() =>
            anchorSetup(panel, {
              buttonId,
              anchor,
              interceptTab: false,
              focusAfterPosition: true,
            }),
          ),
          release => Effect.sync(release),
        )
      }
      return Message.Placed()
    }),
})

type Return = Update.Return<Model, Message>

const closed = (model: Model, focus: boolean): Return =>
  model.open
    ? {
        model: modifyFields(model, { open: () => false, highlighted: () => [] }),
        ...(focus ? { commands: [FocusTrigger({ id: model.id })] } : {}),
      }
    : { model }

/**
 * The cascade's `update` for `config`, the options the view draws; the same
 * Model when nothing changes.
 */
export const update = (config: Config) => {
  const { nodes } = config
  const choosesParents = config.parents === true
  const closeOnSelect = config.closeOnSelect ?? true

  /** Whether every node on `path` exists and may be reached. */
  const reachable = (path: ReadonlyArray<string>): boolean => {
    const on = nodesOn(nodes, path)
    return path.length > 0 && on.length === path.length && on.every(enabled)
  }

  /** The places of the nodes on `path` in their levels, for the active row's id. */
  const placesOf = (path: ReadonlyArray<string>): ReadonlyArray<number> =>
    levelsOf(nodes, path)
      .slice(0, path.length)
      .map((level, depth) => level.findIndex(node => node.id === path[depth]))

  const highlight = (model: Model, path: ReadonlyArray<string>, reveal: boolean): Return => {
    const same =
      path.length === model.highlighted.length &&
      path.every((step, depth) => step === model.highlighted[depth])
    if (same) return { model }
    const next = modifyFields(model, { highlighted: () => path })
    return reveal
      ? { model: next, commands: [RevealItem({ elementId: itemId(model.id, placesOf(path)) })] }
      : { model: next }
  }

  const choose = (model: Model, path: ReadonlyArray<string>): Return => {
    const node = nodesOn(nodes, path).at(-1)
    if (node === undefined || !reachable(path)) return { model }
    if (hasChildren(node)) {
      const expanded = highlight(model, path, false)
      return choosesParents
        ? { ...expanded, model: modifyFields(expanded.model, { value: () => Option.some(path) }) }
        : expanded
    }
    const chosen = modifyFields(model, { value: () => Option.some(path) })
    return closeOnSelect ? closed(chosen, true) : highlight(chosen, path, false)
  }

  /** The path to the first enabled row of `level`, under `parent`. */
  const firstOf = (parent: ReadonlyArray<string>, level: ReadonlyArray<Node>) =>
    Option.map(Option.fromNullishOr(level.find(enabled)), node => [...parent, node.id])

  /** The first enabled child of the node at `path`, highlighted; the same Model for none. */
  const enter = (model: Model, path: ReadonlyArray<string>): Return => {
    const node = nodesOn(nodes, path).at(-1)
    return node !== undefined && reachable(path)
      ? Option.match(firstOf(path, node.children ?? []), {
          onNone: () => ({ model }),
          onSome: next => highlight(model, next, true),
        })
      : { model }
  }

  const opened = (model: Model): Return => {
    if (model.open) return { model }
    const start = Option.match(model.value, {
      onNone: () => Option.none<ReadonlyArray<string>>(),
      onSome: path =>
        nodesOn(nodes, path).length === path.length ? Option.some(path) : Option.none(),
    }).pipe(Option.orElse(() => firstOf([], nodes)))
    return {
      model: modifyFields(model, {
        open: () => true,
        highlighted: () => Option.getOrElse(start, () => []),
      }),
    }
  }

  /** The row `to` picks in the active level, from the active one's place. */
  const moved = (model: Model, to: (rows: ReadonlyArray<Node>, at: number) => number): Return => {
    const path = model.highlighted
    if (path.length === 0)
      return firstOf([], nodes).pipe(
        Option.match({ onNone: () => ({ model }), onSome: start => highlight(model, start, true) }),
      )
    const parent = path.slice(0, -1)
    const rows = levelsOf(nodes, parent)[parent.length] ?? []
    const at = rows.findIndex(node => node.id === path[path.length - 1])
    const target = rows[to(rows, at)]
    return target === undefined ? { model } : highlight(model, [...parent, target.id], true)
  }

  /** The next enabled row from `at`, `step` at a time, wrapping only when `loop`. */
  const stepping =
    (step: 1 | -1) =>
    (rows: ReadonlyArray<Node>, at: number): number => {
      for (let offset = 1; offset <= rows.length; offset++) {
        const raw = at + step * offset
        if (config.loop !== true && (raw < 0 || raw >= rows.length)) return at
        const place = (raw + rows.length) % rows.length
        if (enabled(rows[place]!)) return place
      }
      return at
    }

  const typed =
    (key: string) =>
    (rows: ReadonlyArray<Node>, at: number): number => {
      const letter = key.toLocaleLowerCase()
      for (let offset = 1; offset <= rows.length; offset++) {
        const place = (at + offset) % rows.length
        const row = rows[place]!
        if (enabled(row) && row.label.toLocaleLowerCase().startsWith(letter)) return place
      }
      return at
    }

  const pressed = (model: Model, key: string): Return => {
    if (!model.open) return { model }
    const path = model.highlighted
    const active = nodesOn(nodes, path).at(-1)
    switch (key) {
      case 'ArrowDown':
        return moved(model, stepping(1))
      case 'ArrowUp':
        return moved(model, stepping(-1))
      case 'Home':
        return moved(model, rows => rows.findIndex(enabled))
      case 'End':
        return moved(model, rows => rows.length - 1 - [...rows].reverse().findIndex(enabled))
      case 'ArrowRight':
        return enter(model, path)
      case 'ArrowLeft':
        return path.length > 1 ? highlight(model, path.slice(0, -1), true) : { model }
      case 'Enter':
      case ' ':
        return active !== undefined && hasChildren(active) && !choosesParents
          ? enter(model, path)
          : choose(model, path)
      case 'Escape':
        return closed(model, true)
      default:
        return key.length === 1 ? moved(model, typed(key)) : { model }
    }
  }

  return (model: Model, message: Message): Return =>
    Message.match<Return>(message, {
      Opened: () => opened(model),
      Closed: () => closed(model, true),
      Pressed: ({ key }) => pressed(model, key),
      Highlighted: ({ path }) =>
        model.open && reachable(path) ? highlight(model, path, false) : { model },
      Picked: ({ path }) => (model.open ? choose(model, path) : { model }),
      Entered: ({ path }) => (model.open ? enter(model, path) : { model }),
      // Focus went on by itself, so none is given back.
      Left: () => closed(model, false),
      Cleared: () =>
        Option.isNone(model.value)
          ? { model }
          : {
              model: modifyFields(model, { value: () => Option.none() }),
              // The clear button goes with the value, and would take focus with it.
              commands: [FocusTrigger({ id: model.id })],
            },
      Placed: () => ({ model }),
      CompletedFocusTrigger: () => ({ model }),
      CompletedRevealItem: () => ({ model }),
    })
}

/** The keys the open panel takes from the page. */
const PANEL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Enter',
  ' ',
  'Escape',
])
const TRIGGER_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', ' '])

export interface CascadeSelectView<ParentMessage> {
  readonly model: Model
  /** The options; the same as `update`'s, with its `parents` when set. */
  readonly config: Config
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** What is chosen, the trigger's and the panel's accessible name. */
  readonly label: string
  /** Shown while nothing is chosen; default `Select…`. */
  readonly placeholder?: string | undefined
  /** Between the labels of the chosen path on the trigger; default ` / `. */
  readonly separator?: string | undefined
  /** One column per level (default), or one level at a time with a way back. */
  readonly layout?: 'columns' | 'drill' | undefined
  /** Whether the pointer resting on a row opens its children, or only a press; default `click`. */
  readonly expandOn?: 'click' | 'hover' | undefined
  /** A name per level, such as `['Country', 'Region', 'City']`, heading each column. */
  readonly levels?: ReadonlyArray<string> | undefined
  /** Draws a button that clears the value while there is one. */
  readonly clearable?: boolean | undefined
  /** Default `Clear`. */
  readonly clearLabel?: string | undefined
  /** Drilled in, the back row's words before the level above's option; default `Back to`. */
  readonly backLabel?: string | undefined
  /** Submits the value with a form under this name, its ids joined by `/`. */
  readonly name?: string | undefined
  readonly disabled?: boolean | undefined
  readonly invalid?: boolean | undefined
  /** Default `'ltr'`; under `'rtl'` ArrowLeft goes into a row's children. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** Where the panel opens against the trigger; default below it, at its start. */
  readonly anchor?: AnchorConfig | undefined
  /** A style of `CascadeSelectSlots`, for the look. */
  readonly style?: NamedStyle<typeof CascadeSelectSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<ParentMessage> | undefined
}

export const view = <ParentMessage>(
  options: CascadeSelectView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  if (options.label.trim() === '')
    throw new Error('CascadeSelect: a label is required, its accessible name')
  const builders = SlotView.buildersFor(
    CascadeSelectSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage, config } = options
  const { id } = model
  const send = (message: Message) => onMessage(message)
  const value = Option.getOrElse(model.value, () => [])
  const shown = Option.flatMap(model.value, path => labelsOf(config.nodes, path))
  const disabled = options.disabled === true
  const drill = options.layout === 'drill'
  const path = model.highlighted
  const levels = levelsOf(config.nodes, path)
  const places = levels
    .slice(0, path.length)
    .map((level, depth) => level.findIndex(node => node.id === path[depth]))
  const activeId = path.length === 0 ? Option.none() : Option.some(itemId(id, places))

  const trigger = h.button(
    builders.trigger.attrs([
      h.Id(triggerId(id)),
      h.Type('button'),
      h.Role('combobox'),
      h.AriaHasPopup('tree'),
      h.AriaExpanded(model.open),
      h.AriaControls(panelId(id)),
      h.AriaLabel(options.label),
      ...(options.invalid === true ? [h.AriaInvalid(true)] : []),
      ...(disabled
        ? [h.Disabled(true)]
        : [
            h.OnClick(send(Message.Opened())),
            h.OnKeyDownPreventDefault(key =>
              TRIGGER_KEYS.has(key) ? Option.some(send(Message.Opened())) : Option.none(),
            ),
          ]),
    ]),
    [
      h.span(
        builders.valueText.attrs(
          Option.isNone(shown) ? [h.DataAttribute('placeholder', 'true')] : [],
        ),
        [
          Option.match(shown, {
            onNone: () => options.placeholder ?? 'Select…',
            onSome: labels => labels.join(options.separator ?? ' / '),
          }),
        ],
      ),
      h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
    ],
  )

  const row = (node: Node, depth: number, place: number) => {
    const rowPath = [...path.slice(0, depth), node.id]
    const rowPlaces = [...places.slice(0, depth), place]
    const onPath = path[depth] === node.id
    const isActive = onPath && depth === path.length - 1
    const branch = hasChildren(node)
    const chosen = value.length === depth + 1 && value.every((step, at) => step === rowPath[at])
    // Columns show the children of every branch on the path, the active one's included.
    const expanded = branch && onPath && !drill
    return h.div(
      builders.item.attrs([
        h.Key(node.id),
        h.Id(itemId(id, rowPlaces)),
        h.Role('treeitem'),
        h.AriaLevel(depth + 1),
        h.AriaSelected(chosen),
        ...(isActive ? [h.DataAttribute('active', '')] : []),
        ...(value[depth] === node.id && !chosen ? [h.DataAttribute('on-path', '')] : []),
        ...(branch ? [h.AriaExpanded(expanded)] : []),
        ...(expanded ? [h.AriaOwns(columnId(id, depth + 1))] : []),
        ...(enabled(node)
          ? [
              h.OnClick(
                send(
                  drill && branch
                    ? Message.Entered({ path: rowPath })
                    : Message.Picked({ path: rowPath }),
                ),
              ),
              ...(options.expandOn === 'hover'
                ? [h.OnMouseEnter(send(Message.Highlighted({ path: rowPath })))]
                : []),
            ]
          : [h.AriaDisabled(true)]),
      ]),
      [
        h.span(builders.itemText.attrs(), [node.label]),
        ...(branch ? [h.span(builders.branch.attrs([h.AriaHidden(true)]), [])] : []),
      ],
    )
  }

  const column = (rows: ReadonlyArray<Node>, depth: number) => {
    const name = options.levels?.[depth]
    const parent =
      depth === 0
        ? Option.none()
        : Option.fromNullishOr(levels[depth - 1]?.[places[depth - 1] ?? -1])
    return h.div(
      builders.column.attrs([
        h.Key(String(depth)),
        h.Id(columnId(id, depth)),
        h.Role('group'),
        h.AriaLabel(
          name ?? Option.match(parent, { onNone: () => options.label, onSome: node => node.label }),
        ),
      ]),
      [
        ...(drill && depth > 0
          ? [
              // For the pointer: the keys go back with ArrowLeft, and a button is no tree's child.
              h.button(
                builders.back.attrs([
                  h.Type('button'),
                  h.Tabindex(-1),
                  h.AriaHidden(true),
                  h.OnClick(send(Message.Highlighted({ path: path.slice(0, depth) }))),
                ]),
                [
                  `${options.backLabel ?? 'Back to'} ${Option.match(parent, { onNone: () => '', onSome: node => node.label })}`,
                ],
              ),
            ]
          : []),
        ...(name === undefined
          ? []
          : [h.div(builders.heading.attrs([h.AriaHidden(true)]), [name])]),
        ...rows.map((node, place) => row(node, depth, place)),
      ],
    )
  }

  const shownLevels = drill
    ? // Drilled in, the level of the active row, or its children's once a row with children is chosen.
      [Math.max(0, path.length - 1)]
    : levels.map((_, depth) => depth)

  const popup = model.open
    ? [
        h.div(
          builders.layer.attrs([
            ...layerBox(h),
            h.OnMount(
              topLayer(
                Mount.mapMessage(
                  PlaceCascade({
                    buttonId: triggerId(id),
                    anchor: {
                      placement: 'bottom-start',
                      gap: 4,
                      padding: 8,
                      ...options.anchor,
                      portal: false,
                    },
                  }),
                  send,
                ),
              ),
            ),
          ]),
          [
            h.div(builders.backdrop.attrs([h.Style({ position: 'fixed', inset: '0' })]), []),
            h.div(
              builders.panel.attrs([
                h.Id(panelId(id)),
                h.Role('tree'),
                h.AriaLabel(options.label),
                h.Tabindex(-1),
                // The anchor writes `top` and `left`, which place only a positioned box.
                h.Style({ position: 'absolute' }),
                h.DataAttribute('layout', drill ? 'drill' : 'columns'),
                ...Option.match(activeId, {
                  onNone: () => [],
                  onSome: active => [h.AriaActiveDescendant(active)],
                }),
                h.OnKeyDownPreventDefault((pressed, modifiers) => {
                  if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey)
                    return Option.none()
                  const key = readingKey(pressed, options.direction)
                  // Tab goes through, and focus leaving closes the panel.
                  return PANEL_KEYS.has(key) || key.length === 1
                    ? Option.some(send(Message.Pressed({ key })))
                    : Option.none()
                }),
                h.OnFocusLeave(send(Message.Left())),
              ]),
              shownLevels.map(depth => column(levels[depth] ?? [], depth)),
            ),
          ],
        ),
      ]
    : []

  return h.div(
    builders.root.attrs([
      ...(model.open ? [h.DataAttribute('open', '')] : []),
      ...(options.direction === undefined ? [] : [h.Dir(options.direction)]),
    ]),
    [
      trigger,
      ...(options.clearable === true && Option.isSome(model.value) && !disabled
        ? [
            h.button(
              builders.clear.attrs([
                h.Type('button'),
                h.AriaLabel(options.clearLabel ?? 'Clear'),
                h.OnClick(send(Message.Cleared())),
              ]),
              [],
            ),
          ]
        : []),
      ...(options.name === undefined
        ? []
        : [
            h.input(
              builders.input.attrs([
                h.Type('hidden'),
                h.Attribute('name', options.name),
                h.Attribute('value', value.join('/')),
              ]),
            ),
          ]),
      ...popup,
    ],
  )
}
