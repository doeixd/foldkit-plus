/**
 * `foldkit-mixins-builder`: the page Builder drawn as accessible HTML, every
 * element a `foldkit-mixins` Slot.
 *
 * `foldkit-builder` owns the editor's state and draws nothing of its own worth
 * shipping. This package draws it: a palette of the Blocks a page may gain, the
 * page's layers as an ARIA tree driven by the keyboard, the selected node's
 * props in an inspector, undo and redo, a viewport picker, and the page itself,
 * drawn by the site's own Renderer in edit mode. It adds no state and no
 * Messages: every element dispatches one of the Builder's own.
 *
 * Interaction comes from `foldkit-primitives`, attached as Behaviors:
 * `TreeNavigation` on the layers, `Targets` on the canvas (hover and click pick
 * a node), and the Builder's `keyCommand` shortcuts on the layers panel.
 */
import { Option, Schema } from 'effect'
import { Layers, Message, layersArgs, type ContextValue, type Model } from 'foldkit-builder'
import {
  Catalog,
  Composition,
  NodeId,
  fieldsOf,
  type AnyBlock,
  type Document,
  type Position,
} from 'foldkit-composition'
import { NODE_ATTRIBUTE, Renderer } from 'foldkit-composition/foldkit'
import { Entity } from 'foldkit-entity'
import { Input, type Control } from 'foldkit-form'
import { Metadata } from 'foldkit-metadata'
import { Behavior, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { LiveAnnounce, PointerDrag, Targets, TreeNavigation } from 'foldkit-primitives/interaction'
import { History } from 'foldkit-primitives/state'
import type { KeyboardModifiers } from 'foldkit/html'
import { inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import * as Submodel from 'foldkit/submodel'

/** The Builder's public customization contract: every element the editor draws. */
export const BuilderSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** The Blocks a page may gain, one button each. */
  palette: Slot.make({ capability: Capability.Container }),
  paletteItem: Slot.make({ capability: Capability.Interactive }),
  /** The layers panel: it takes the editor's keyboard shortcuts. */
  layers: Slot.make({ capability: Capability.Interactive }),
  /** The `role="tree"` element, and one `treeitem` row per node showing. */
  tree: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
  /** Move, duplicate and delete for the selected node. */
  actions: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Interactive }),
  /** The selected node's props, one field each. */
  inspector: Slot.make({ capability: Capability.Container }),
  field: Slot.make({ capability: Capability.Container }),
  control: Slot.make({ capability: Capability.Interactive }),
  history: Slot.make({ capability: Capability.Container }),
  undo: Slot.make({ capability: Capability.Interactive }),
  redo: Slot.make({ capability: Capability.Interactive }),
  viewports: Slot.make({ capability: Capability.Container }),
  viewport: Slot.make({ capability: Capability.Interactive }),
  /** What the page is previewed as: one field per key of the Catalog's context. */
  preview: Slot.make({ capability: Capability.Container }),
  /** Why the last edit was refused. */
  alert: Slot.make({ capability: Capability.Base }),
  /** The page in edit mode, and the frame that sets its width. */
  canvas: Slot.make({ capability: Capability.Container }),
  frame: Slot.make({ capability: Capability.Container }),
  /** The live region the Builder's announcements are read from. */
  live: Slot.make({ capability: Capability.Base }),
})

/** The width each viewport draws the page at. */
export const viewportWidths = { wide: '100%', medium: '768px', narrow: '375px' } as const

/** What `BuilderView.define` needs of a Builder: what `Builder.make` returns has all of it. */
export interface BuilderLike {
  readonly name: string
  readonly catalog: Catalog
  // `any`: a Renderer's entries are keyed by its own Blocks, so no one Blocks type fits every Builder's.
  readonly renderer: Renderer<any, never>
  readonly offered: ReadonlyArray<string>
  readonly document: (model: Model) => Document
  // Method syntax: a Builder whose Blocks are named narrower still fits.
  placeFor(document: Document, selected: NodeId | null, block: string): Position | undefined
  readonly keyCommand: (
    model: Model,
    key: string,
    modifiers: KeyboardModifiers,
  ) => Message | undefined
}

/** Every node as a tree row, in document order, with its parent node and whether it holds any. */
export const rowsOf = (document: Document): ReadonlyArray<TreeNavigation.Row> => {
  // The view and the tree's Behavior both ask, on every draw.
  const known = rowsByDocument.get(document)
  if (known !== undefined) return known
  const rows: Array<TreeNavigation.Row> = []
  const seen = new Set<string>()
  const visit = (id: NodeId, parent: string | null): void => {
    const node = document.nodes[id]
    if (node === undefined || seen.has(id)) return
    seen.add(id)
    const children = Object.values(node.regions).flat()
    rows.push({ id, parent, branch: children.length > 0 })
    for (const child of children) visit(child, id)
  }
  for (const root of document.roots) visit(root, null)
  rowsByDocument.set(document, rows)
  return rows
}

const rowsByDocument = new WeakMap<Document, ReadonlyArray<TreeNavigation.Row>>()

/** The attribute a layer row carries, holding its node's id, for a drag to find. */
export const ROW_ATTRIBUTE = 'builder-row'
/** On the row a drop is aimed at, holding where: `before`, `inside` or `after`. */
export const ROW_DROP_ATTRIBUTE = 'builder-drop'
/** On the row being dragged. */
export const ROW_DRAGGING_ATTRIBUTE = 'builder-dragging'

/** The Builder's Message for what a drag reports. */
const dragMessage = (fact: PointerDrag.DragFact): Message => {
  switch (fact._tag) {
    case 'DragStarted':
      return Message.DragStarted({ id: NodeId.make(fact.id) })
    case 'DraggedOver':
      return Message.DraggedOver({
        over: fact.over === null ? null : { id: NodeId.make(fact.over.id), zone: fact.over.zone },
      })
    case 'DragDropped':
      return Message.DragDropped()
    case 'DragCancelled':
      return Message.DragCancelled()
  }
}

/** The DOM id a layer row carries, so keyboard focus can find it. */
export const layerId = (builder: { readonly name: string }, id: string): string =>
  `${builder.name}-layer-${id}`

const asNodeId = (id: string | null): NodeId | null =>
  id === null || id === '' ? null : NodeId.make(id)

/** A stored appearance that is a record of choices, as opposed to a list or a scalar. */
const isChoices = (
  value: Schema.Json | undefined,
): value is { readonly [axis: string]: Schema.Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What a context key's control reads as a value: blank is unset, a toggle's text a boolean. */
const contextValue = (control: Control | undefined, raw: string): ContextValue => {
  if (raw === '') return null
  if (control !== undefined && Input.Toggle.is(control)) return raw === 'true'
  if (
    control !== undefined &&
    Input.Number.is(control) &&
    raw.trim() !== '' &&
    Number.isFinite(Number(raw))
  )
    return Number(raw)
  return raw
}

/**
 * A select's options: a blank, the choices, and a stored value the choices lack,
 * shown as `? value` and chosen, rather than the blank misreporting it.
 */
const optionsOf = <Message>(
  h: HtmlBuilder<Message>,
  blank: string,
  choices: ReadonlyArray<string>,
  current: string | undefined,
): ReadonlyArray<Html> => {
  const stray = current !== undefined && current !== '' && !choices.includes(current)
  return [
    ...['', ...choices].map(value =>
      h.option(
        [h.Value(value), h.Selected((current ?? '') === value)],
        [value === '' ? blank : value],
      ),
    ),
    ...(stray ? [h.option([h.Value(current), h.Selected(true)], [`? ${current}`])] : []),
  ]
}

/** The choices a context key offers, or `undefined` when it is typed in. */
const contextChoices = (control: Control | undefined): ReadonlyArray<string> | undefined =>
  control === undefined
    ? undefined
    : Input.Select.is(control)
      ? control.data.options
      : Input.Toggle.is(control)
        ? ['true', 'false']
        : undefined

/**
 * An action's input to start from: an empty value for each field the inspector
 * can draw, the first choice of a select. What still does not check is refused
 * as any edit is, and the alert says why.
 */
const seedOf = (input: Schema.Top): { readonly [key: string]: Schema.Json } =>
  Object.fromEntries(
    Object.entries(fieldsOf(input)).flatMap(
      ([key, schema]): ReadonlyArray<[string, Schema.Json]> => {
        const control = Input.resolve(Entity.unmapped, schema)
        if (control === undefined) return []
        if (Input.Toggle.is(control)) return [[key, false]]
        if (Input.Number.is(control)) return [[key, 0]]
        if (Input.Select.is(control)) {
          const [first] = control.data.options
          return first === undefined ? [] : [[key, first]]
        }
        return Input.Text.is(control) || Input.Multiline.is(control) ? [[key, '']] : []
      },
    ),
  )

const controlsKey = Metadata.key<Readonly<Record<string, Control>>>(
  'foldkit-mixins-builder/controls',
  {
    // One record per Block: a later annotation's prop replaces an earlier one's.
    merge: records => [Object.assign({}, ...records)],
    summarize: record =>
      Object.entries(record)
        .map(([key, control]) => `${key}: ${control.kind}`)
        .join(', '),
  },
)

/** The control a Block asked for its prop, else the one its Schema resolves to. */
const controlFor = (block: AnyBlock, key: string, schema: Schema.Top): Control | undefined =>
  controlsKey.get(block.metadata)[0]?.[key] ?? Input.resolve(Entity.unmapped, schema)

/** A prop's label: its Schema's `title`, else its key. */
const labelFor = (key: string, schema: Schema.Top): string => {
  const title = Schema.resolveAnnotations(schema)?.title
  return typeof title === 'string' ? title : key
}

/**
 * What the drawn Builder is given beside its Model, by the page's parent: the
 * application's, never the Builder's to keep.
 */
export interface BuilderViewInputs {
  /**
   * Each node's read, by node id, as a published page is drawn with it: the
   * page's Query and Surface Blocks' values, so the canvas shows their rows.
   */
  readonly data?: Readonly<Record<string, unknown>> | undefined
}

/** What the drawn Builder's Slots and Behaviors read: its Model and its inputs. */
export type BuilderInput = Model & BuilderViewInputs

/** The drawn Builder: what `BuilderView.define` returns. */
export type BuilderSlotView = SlotView.SlotView<typeof BuilderSlots, BuilderInput, Message>

export const BuilderView = {
  /**
   * Block metadata: the control the inspector draws a prop with, where its
   * Schema alone does not say, as
   * `Heading.pipe(Block.annotate(BuilderView.controls({ text: Input.multiline() })))`.
   * `Input.hidden()` leaves a prop out of the inspector.
   */
  controls: (controls: Readonly<Record<string, Control>>): Metadata => controlsKey.of(controls),

  /** What the drawn Builder is drawn with, typed where a form's `controls` entry cannot be. */
  inputs: (inputs: BuilderViewInputs = {}): BuilderViewInputs => inputs,

  /**
   * The drawn Builder as a Submodel view, for `bundle.pipe(Bundle.withView(...))`
   * or `builder.inputWith(...)`, drawn with `BuilderView.inputs(...)`.
   */
  submodel: (view: BuilderSlotView): Submodel.View<Model, Message, BuilderViewInputs> =>
    Submodel.defineView<Model, Message, BuilderViewInputs>(((
      model: Model,
      inputs: BuilderViewInputs | HtmlBuilder<Message>,
      h: HtmlBuilder<Message> | undefined,
    ) =>
      // A form draws a Bundle control with no inputs when its `controls` gives the
      // key none, and a Submodel view given none is called as `(model, h)`.
      h === undefined
        ? view(model, inputs as HtmlBuilder<Message>)
        : view({ ...model, ...(inputs as BuilderViewInputs) }, h)) as (
      model: Model,
      inputs: BuilderViewInputs,
      h: HtmlBuilder<Message>,
    ) => Html),

  /**
   * The Builder drawn, as a `SlotView` over the Builder's Model. Style and
   * extend it through `BuilderSlots` like any other SlotView; its Behaviors
   * (the layers' keyboard, the canvas's pointer, the shortcuts) are attached.
   */
  define: (builder: BuilderLike) => {
    const draw = (
      model: BuilderInput,
      slots: SlotView.SlotBuilders<typeof BuilderSlots, Message>,
      h: HtmlBuilder<Message>,
    ): Html => {
      const document = builder.document(model)
      const selected = model.selected
      // A drop is marked only where it would land: `at` is null where the page refuses it.
      const drop = model.drag?.at == null ? null : model.drag.over
      const button = (
        slot: SlotView.SlotBuilder<Message>,
        label: string,
        message: Message | undefined,
        extra: ReadonlyArray<ReturnType<HtmlBuilder<Message>['AriaPressed']>> = [],
      ) =>
        h.button(
          slot.attrs([
            h.Type('button'),
            h.Disabled(message === undefined),
            ...(message === undefined ? [] : [h.OnClick(message)]),
            ...extra,
          ]),
          [label],
        )

      const palette = h.nav(
        slots.palette.attrs([h.AriaLabel('Add a block')]),
        builder.offered.map(name => {
          const at = builder.placeFor(document, selected, name)
          return button(
            slots.paletteItem,
            `Add ${name}`,
            at === undefined ? undefined : Message.InsertAsked({ block: name, at }),
          )
        }),
      )

      const shown = TreeNavigation.shown(rowsOf(document), model.layers, layersArgs)
      const tree = h.ul(
        slots.tree.attrs([h.Role('tree'), h.AriaLabel('Layers')]),
        shown.map((row, index) => {
          const node = document.nodes[NodeId.make(row.id)]
          const known =
            node !== undefined && Catalog.block(builder.catalog, node.block) !== undefined
          return h.li(
            slots.row.attrs(
              [
                h.Key(row.id),
                h.DataAttribute(ROW_ATTRIBUTE, row.id),
                ...(drop?.id === row.id ? [h.DataAttribute(ROW_DROP_ATTRIBUTE, drop.zone)] : []),
                ...(model.drag?.id === row.id ? [h.DataAttribute(ROW_DRAGGING_ATTRIBUTE, '')] : []),
                h.AriaSelected(row.id === selected),
                h.OnClick(Message.Selected({ id: NodeId.make(row.id) })),
              ],
              { index, id: row.id },
            ),
            [`${known ? '' : '? '}${node?.block ?? row.id}`],
          )
        }),
      )
      // The tree inside is what is named "Layers"; the panel around it is not named twice.
      const layers = h.section(slots.layers.attrs(), [tree])

      const actions =
        selected === null
          ? []
          : [
              h.div(slots.actions.attrs([h.Role('toolbar'), h.AriaLabel('Selected block')]), [
                button(slots.action, 'Move up', builder.keyCommand(model, 'ArrowUp', alt)),
                button(slots.action, 'Move down', builder.keyCommand(model, 'ArrowDown', alt)),
                button(slots.action, 'Move out', builder.keyCommand(model, 'ArrowLeft', alt)),
                button(slots.action, 'Move in', builder.keyCommand(model, 'ArrowRight', alt)),
                button(slots.action, 'Duplicate', builder.keyCommand(model, 'd', ctrl)),
                button(slots.action, 'Delete', builder.keyCommand(model, 'Delete', plain)),
              ]),
            ]

      const inspector = selected === null ? [] : [inspect(document, selected, slots, h)]

      const history = h.div(slots.history.attrs([h.Role('toolbar'), h.AriaLabel('History')]), [
        button(slots.undo, 'Undo', History.canUndo(model.page) ? Message.Undid() : undefined),
        button(slots.redo, 'Redo', History.canRedo(model.page) ? Message.Redid() : undefined),
      ])

      const viewports = h.div(
        slots.viewports.attrs([h.Role('group'), h.AriaLabel('Viewport')]),
        (['wide', 'medium', 'narrow'] as const).map(viewport =>
          button(slots.viewport, viewport, Message.ViewportChosen({ viewport }), [
            h.AriaPressed(model.viewport === viewport ? 'true' : 'false'),
          ]),
        ),
      )

      const context = fieldsOf(builder.catalog.context)
      const preview =
        Object.keys(context).length === 0
          ? []
          : [
              h.div(
                slots.preview.attrs([h.Role('group'), h.AriaLabel('Preview as')]),
                Object.entries(context).map(([key, schema]) =>
                  contextField(slots, h, {
                    id: `${builder.name}-preview-${key}`,
                    label: key,
                    schema,
                    current: model.preview[key],
                    blank: 'unset',
                    send: value => Message.PreviewChosen({ key, value }),
                  }),
                ),
              ),
            ]

      const canvas = h.div(slots.canvas.attrs([h.Role('region'), h.AriaLabel('Page')]), [
        h.div(
          slots.frame.attrs([
            h.DataAttribute('viewport', model.viewport),
            h.Style({ maxWidth: viewportWidths[model.viewport], margin: '0 auto' }),
          ]),
          [
            ...Renderer.render(builder.renderer, document, inertHtml, {
              mode: 'edit',
              selected,
              hovered: model.hovered,
              drop,
              context: model.preview,
              ...(model.data === undefined ? {} : { data: model.data }),
            }),
          ],
        ),
      ])

      return h.div(slots.root.attrs(), [
        palette,
        layers,
        ...actions,
        ...inspector,
        history,
        viewports,
        ...preview,
        ...(model.refused === null
          ? []
          : [h.p(slots.alert.attrs([h.Role('alert')]), [model.refused.message])]),
        canvas,
        h.div(slots.live.attrs(), [LiveAnnounce.view(model.announcer, h)]),
      ])
    }

    // One field per context key: a choice, or typed in; blank is unset.
    const contextField = (
      slots: SlotView.SlotBuilders<typeof BuilderSlots, Message>,
      h: HtmlBuilder<Message>,
      field: {
        readonly id: string
        readonly label: string
        readonly schema: Schema.Top
        readonly current: ContextValue | undefined
        /** What the blank choice reads as. */
        readonly blank: string
        readonly send: (value: ContextValue) => Message
      },
    ) => {
      const { id: fieldId, label, schema, current, blank, send } = field
      const control = Input.resolve(Entity.unmapped, schema)
      const choices = contextChoices(control)
      const shown = current === undefined || current === null ? '' : String(current)
      return h.div(slots.field.attrs(), [
        h.label([h.For(fieldId)], [label]),
        choices === undefined
          ? h.input(
              slots.control.attrs([
                h.Id(fieldId),
                h.Value(shown),
                h.OnInput(raw => send(contextValue(control, raw))),
              ]),
            )
          : h.select(
              slots.control.attrs([
                h.Id(fieldId),
                h.OnChange(raw => send(contextValue(control, raw))),
              ]),
              optionsOf(h, blank, choices, shown),
            ),
      ])
    }

    /** One value, drawn by the control it resolves to: a prop, or an action's input. */
    const valueField = (
      slots: SlotView.SlotBuilders<typeof BuilderSlots, Message>,
      h: HtmlBuilder<Message>,
      field: {
        readonly id: string
        readonly label: string
        readonly control: Control | undefined
        readonly value: Schema.Json | undefined
        readonly set: (value: Schema.Json) => Message
      },
    ): Html => {
      const { id: fieldId, label, control, value, set } = field
      const input = (() => {
        if (control !== undefined && Input.Toggle.is(control))
          return h.input(
            slots.control.attrs([
              h.Id(fieldId),
              h.Type('checkbox'),
              h.Checked(value === true),
              h.OnClick(set(value !== true)),
            ]),
          )
        if (control !== undefined && Input.Select.is(control))
          return h.select(
            slots.control.attrs([h.Id(fieldId), h.OnChange(choice => set(choice))]),
            control.data.options.map(option =>
              h.option([h.Value(option), h.Selected(option === value)], [option]),
            ),
          )
        if (control !== undefined && Input.Number.is(control))
          return h.input(
            slots.control.attrs([
              h.Id(fieldId),
              h.Value(typeof value === 'number' ? String(value) : ''),
              h.OnInput(text =>
                set(Number.isFinite(Number(text)) && text.trim() !== '' ? Number(text) : text),
              ),
            ]),
          )
        const text = [
          h.Id(fieldId),
          h.Value(typeof value === 'string' ? value : ''),
          h.OnInput((typed: string) => set(typed)),
        ]
        if (control !== undefined && Input.Multiline.is(control))
          // A textarea's attributes exclude `InnerHTML`, which a slot's type admits
          // and these never carry.
          return h.textarea(slots.control.attrs(text) as Parameters<typeof h.textarea>[0])
        if (control !== undefined && Input.Text.is(control))
          return h.input(slots.control.attrs(text))
        return undefined
      })()
      // A kind this inspector does not draw is shown, not edited: no control to label.
      return input === undefined
        ? h.div(slots.field.attrs(), [
            h.span([], [label]),
            h.code(slots.control.attrs([h.Id(fieldId)]), [JSON.stringify(value ?? null)]),
          ])
        : h.div(slots.field.attrs(), [h.label([h.For(fieldId)], [label]), input])
    }

    /** The selected node's props, one field each, drawn by the control its Schema resolves to. */
    const inspect = (
      document: Document,
      id: NodeId,
      slots: SlotView.SlotBuilders<typeof BuilderSlots, Message>,
      h: HtmlBuilder<Message>,
    ): Html => {
      const node = document.nodes[id]
      const block = node === undefined ? undefined : Catalog.block(builder.catalog, node.block)
      if (node === undefined || block === undefined)
        return h.div(slots.inspector.attrs([h.Role('group'), h.AriaLabel('Properties')]), [
          h.p(
            [],
            [
              'This block is not in this version of the application, so its settings cannot be edited here.',
            ],
          ),
          ...Object.entries(node?.props ?? {}).map(([key, value]) =>
            h.div(slots.field.attrs(), [
              h.span([], [key]),
              h.code(slots.control.attrs(), [JSON.stringify(value)]),
            ]),
          ),
        ])
      const set = (key: string, value: Schema.Json): Message =>
        Message.Applied({ op: Composition.Op.setProp(id, key, value) })
      const drawn = Object.entries(fieldsOf(block.Props)).flatMap(([key, schema]) => {
        const control = controlFor(block, key, schema)
        return control !== undefined && Input.Hidden.is(control) ? [] : [{ key, schema, control }]
      })
      const fields = drawn.map(({ key, schema, control }) =>
        valueField(slots, h, {
          id: `${builder.name}-${id}-${key}`,
          label: labelFor(key, schema),
          control,
          value: node.props[key],
          set: value => set(key, value),
        }),
      )
      // The node's look: one choice per axis its Block offers, blank for the default,
      // and on a responsive axis one more per breakpoint it may change at.
      const chosen = isChoices(node.appearance) ? node.appearance : {}
      const looks = Object.entries(block.appearance).flatMap(([axis, { values, breakpoints }]) => {
        const stored = chosen[axis]
        // What is chosen at each point: `base`, then each breakpoint.
        const at: Readonly<Record<string, string>> =
          typeof stored === 'string'
            ? { base: stored }
            : isChoices(stored)
              ? Object.fromEntries(
                  Object.entries(stored).filter(
                    (entry): entry is [string, string] => typeof entry[1] === 'string',
                  ),
                )
              : {}
        const choose =
          (point: string) =>
          (value: string): Message => {
            const { [point]: _, ...kept } = at
            const points = value === '' ? kept : { ...kept, [point]: value }
            const { [axis]: __, ...others } = chosen
            // One name when only the base is chosen; none when nothing is.
            const choice =
              Object.keys(points).length === 0
                ? undefined
                : Object.keys(points).length === 1 && points['base'] !== undefined
                  ? points['base']
                  : points
            const next = choice === undefined ? others : { ...others, [axis]: choice }
            return Message.Applied({
              op: Composition.Op.setAppearance(id, Object.keys(next).length === 0 ? null : next),
            })
          }
        return ['base', ...(breakpoints ?? [])].map(point => {
          const fieldId = `${builder.name}-${id}-appearance-${axis}${point === 'base' ? '' : `-${point}`}`
          return h.div(slots.field.attrs(), [
            h.label([h.For(fieldId)], [point === 'base' ? axis : `${axis} at ${point}`]),
            h.select(
              slots.control.attrs([h.Id(fieldId), h.OnChange(choose(point))]),
              optionsOf(h, point === 'base' ? 'default' : 'unchanged', values, at[point]),
            ),
          ])
        })
      })
      // When it shows: an `eq` condition per context key, blank for always. Other
      // conditions on a key are kept as they are.
      const when = Array.isArray(node.when) ? node.when : []
      const isEqOn = (key: string) => (condition: Schema.Json) =>
        isChoices(condition) && Array.isArray(condition['eq']) && condition['eq'][0] === key
      const eqOf = (key: string): ContextValue | undefined => {
        for (const condition of when)
          if (isChoices(condition) && isEqOn(key)(condition) && Array.isArray(condition['eq'])) {
            const value = condition['eq'][1]
            if (
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
            )
              return value
          }
        return undefined
      }
      const conditions = Object.entries(fieldsOf(builder.catalog.context)).map(([key, schema]) =>
        contextField(slots, h, {
          id: `${builder.name}-${id}-when-${key}`,
          label: `when ${key}`,
          schema,
          current: eqOf(key),
          blank: 'always',
          send: value => {
            const others = when.filter(condition => !isEqOn(key)(condition))
            const next = value === null ? others : [...others, { eq: [key, value] }]
            return Message.Applied({
              op: Composition.Op.setWhen(id, next.length === 0 ? null : next),
            })
          },
        }),
      )
      // What each of the Block's events runs: an action the Catalog offers, blank for
      // none, then that action's input, one field each.
      const stored = isChoices(node.actions) ? node.actions : {}
      const events = block.events.flatMap(event => {
        const reference = stored[event]
        const ref = isChoices(reference) ? reference : {}
        const input = isChoices(ref['input']) ? ref['input'] : {}
        const action = builder.catalog.actions.find(each => each.name === ref['action'])
        const run = (name: string, given: { readonly [key: string]: Schema.Json }): Message =>
          Message.Applied({
            op: Composition.Op.setAction(id, event, { action: name, input: given }),
          })
        const pickId = `${builder.name}-${id}-on-${event}`
        const pick = h.div(slots.field.attrs(), [
          h.label([h.For(pickId)], [`on ${event}`]),
          h.select(
            slots.control.attrs([
              h.Id(pickId),
              h.OnChange(name => {
                const chosen = builder.catalog.actions.find(each => each.name === name)
                return chosen === undefined
                  ? Message.Applied({ op: Composition.Op.setAction(id, event, null) })
                  : run(chosen.name, seedOf(chosen.input))
              }),
            ]),
            optionsOf(
              h,
              'nothing',
              builder.catalog.actions.map(each => each.name),
              typeof ref['action'] === 'string' ? ref['action'] : undefined,
            ),
          ),
        ])
        const inputs =
          action === undefined
            ? []
            : Object.entries(fieldsOf(action.input)).map(([key, schema]) =>
                valueField(slots, h, {
                  id: `${pickId}-${key}`,
                  label: labelFor(key, schema),
                  control: Input.resolve(Entity.unmapped, schema),
                  value: input[key],
                  set: value => run(action.name, { ...input, [key]: value }),
                }),
              )
        return [pick, ...inputs]
      })
      return h.div(slots.inspector.attrs([h.Role('group'), h.AriaLabel('Properties')]), [
        ...fields,
        ...looks,
        ...conditions,
        ...events,
      ])
    }

    return SlotView.forMessages<Message>()
      .define(BuilderSlots, (input: BuilderInput, slots, h) => draw(input, slots, h), {
        name: 'Builder',
      })
      .pipe(
        Behavior.attach(
          TreeNavigation.behavior(Layers, layersArgs)(BuilderSlots)<BuilderInput, Message>({
            container: 'tree',
            item: 'row',
            rows: model => rowsOf(builder.document(model)),
            domId: id => layerId(builder, id),
          }),
        ),
        Behavior.attach(
          Targets.behavior(BuilderSlots)<BuilderInput, Message>({
            container: 'canvas',
            attribute: `data-${NODE_ATTRIBUTE}`,
            // A link on the page being edited selects its node; it does not navigate.
            preventDefault: true,
            toMessage: fact =>
              fact._tag === 'TargetHovered'
                ? Message.Hovered({ id: asNodeId(fact.id) })
                : Message.Selected({ id: asNodeId(fact.id) }),
          }),
        ),
        // A row or a node is dragged onto another; the keyboard's way is the shortcuts.
        Behavior.attach(
          PointerDrag.behavior(BuilderSlots)<BuilderInput, Message>({
            container: 'tree',
            attribute: `data-${ROW_ATTRIBUTE}`,
            toMessage: dragMessage,
          }),
        ),
        Behavior.attach(
          PointerDrag.behavior(BuilderSlots)<BuilderInput, Message>({
            container: 'canvas',
            attribute: `data-${NODE_ATTRIBUTE}`,
            toMessage: dragMessage,
          }),
        ),
        Behavior.attach(
          Behavior.forSlots(BuilderSlots)<BuilderInput, Message>(
            {
              layers: Behavior.slot({
                attributes: ({
                  input,
                  h,
                }: {
                  readonly input: BuilderInput
                  readonly h: HtmlBuilder<Message>
                }) => [
                  h.OnKeyDownPreventDefault((key, modifiers) =>
                    Option.fromNullishOr(builder.keyCommand(input, key, modifiers)),
                  ),
                ],
              }),
            },
            { name: 'BuilderShortcuts' },
          ),
        ),
      )
  },
}

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const alt: KeyboardModifiers = { ...plain, altKey: true }
const ctrl: KeyboardModifiers = { ...plain, ctrlKey: true }
