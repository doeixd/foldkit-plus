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
import {
  Layers,
  controlOf,
  inputOf,
  Message,
  layersArgs,
  type ContextValue,
  type BuilderCommand,
  type CommandKey,
  type DropZone,
  type InspectedForm,
  type Inspecting,
  type Model,
  type Settings,
} from 'foldkit-builder'
import {
  Catalog,
  Composition,
  NodeId,
  fieldsOf,
  spaced,
  type Document,
  type Position,
} from 'foldkit-composition'
import { MARK_ATTRIBUTE, NODE_ATTRIBUTE, Renderer } from 'foldkit-composition/foldkit'
import { Entity } from 'foldkit-entity'
import { Input, type Control } from 'foldkit-form'
import {
  Behavior,
  Capability,
  Layers as StyleLayers,
  Slot,
  Slots,
  SlotView,
  Style,
} from 'foldkit-mixins'
import { FormView, type FormViewInputs, type Renderers } from 'foldkit-mixins-form'
import { KeepInView, Measure, measured } from 'foldkit-primitives/dom'
import { LiveAnnounce, PointerDrag, Targets, TreeNavigation } from 'foldkit-primitives/interaction'
import type { KeyboardModifiers } from 'foldkit/html'
import { createLazy, inertHtml, type Attribute, type Html, type HtmlBuilder } from 'foldkit/html'
import * as Submodel from 'foldkit/submodel'

/** The Builder's public customization contract: every element the editor draws. */
export const BuilderSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** The Blocks a page may gain, in groups, one button each. */
  palette: Slot.make({ capability: Capability.Container }),
  /** One group of the palette, and its heading, drawn when there is more than one. */
  paletteGroup: Slot.make({ capability: Capability.Container }),
  paletteHeading: Slot.make({ capability: Capability.Base }),
  /** A Block to add: its label, and the line describing it. Carries `data-block`. */
  paletteItem: Slot.make({ capability: Capability.Interactive }),
  paletteLabel: Slot.make({ capability: Capability.Base }),
  paletteHint: Slot.make({ capability: Capability.Base }),
  /** The layers panel: it takes the editor's keyboard shortcuts. */
  layers: Slot.make({ capability: Capability.Interactive }),
  /** The `role="tree"` element, and one `treeitem` row per node showing. Rows carry `data-block`. */
  tree: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
  /** On a row that holds others: opens or closes it, as Right and Left do. */
  rowToggle: Slot.make({ capability: Capability.Interactive }),
  /** A row's Block, and what its node says, in brief. */
  rowLabel: Slot.make({ capability: Capability.Base }),
  rowSummary: Slot.make({ capability: Capability.Base }),
  /** Move, duplicate and delete for the selected node, in the inspector's head. Each carries `data-action`. */
  actions: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Interactive }),
  /** The selected node's settings, or, with nothing selected, how to begin and the shortcuts. */
  inspector: Slot.make({ capability: Capability.Container }),
  /** The selected node's Block: its label, what it is for, and its actions. */
  inspectorHead: Slot.make({ capability: Capability.Container }),
  inspectorTitle: Slot.make({ capability: Capability.Base }),
  inspectorHint: Slot.make({ capability: Capability.Base }),
  /** One part of the settings, such as Content or Style, and its heading. */
  inspectorSection: Slot.make({ capability: Capability.Container }),
  inspectorSectionTitle: Slot.make({ capability: Capability.Base }),
  field: Slot.make({ capability: Capability.Container }),
  /** A field's name: a `label`, or a `span` naming a group of controls. */
  label: Slot.make({ capability: Capability.Base }),
  control: Slot.make({ capability: Capability.Interactive }),
  /** One choice of a many-choice picker: its checkbox and its words. */
  option: Slot.make({ capability: Capability.Base }),
  /** One choice of a `select`. */
  selectOption: Slot.make({ capability: Capability.Base }),
  /** A look's few values as buttons, one pressed: drawn in place of a select. */
  choices: Slot.make({ capability: Capability.Container }),
  choice: Slot.make({ capability: Capability.Interactive }),
  /** The editor's shortcuts, as a list of keys and what they do. */
  shortcuts: Slot.make({ capability: Capability.Container }),
  shortcutKeys: Slot.make({ capability: Capability.Base }),
  shortcutWhat: Slot.make({ capability: Capability.Base }),
  /** The commands offered in the toolbar, undo and redo by default. One `toolbarAction` each, with `data-action`. */
  toolbar: Slot.make({ capability: Capability.Container }),
  toolbarAction: Slot.make({ capability: Capability.Interactive }),
  /** Where the selection is: the page, then each node holding it, then it. One `crumb` button each. */
  crumbs: Slot.make({ capability: Capability.Container }),
  crumb: Slot.make({ capability: Capability.Interactive }),
  viewports: Slot.make({ capability: Capability.Container }),
  viewport: Slot.make({ capability: Capability.Interactive }),
  /** What the page is previewed as: one field per key of the Catalog's context. */
  preview: Slot.make({ capability: Capability.Container }),
  /** Why the last edit was refused. */
  alert: Slot.make({ capability: Capability.Base }),
  /** The page in edit mode, and the frame that sets its width. It takes the shortcuts when focused. */
  canvas: Slot.make({ capability: Capability.Container }),
  frame: Slot.make({ capability: Capability.Container }),
  /** In the frame while the page holds nothing: how to begin. */
  empty: Slot.make({ capability: Capability.Base }),
  /**
   * Over the selected node on the canvas, placed from where it is measured to
   * be, with its Block's label; drawn over the page, so the page's own
   * markup needs no mark to show it.
   */
  selectionBox: Slot.make({ capability: Capability.Container }),
  selectionLabel: Slot.make({ capability: Capability.Base }),
  /** Over the node under the pointer, as the selection's box is placed. */
  hoverBox: Slot.make({ capability: Capability.Base }),
  /** The live region the Builder's announcements are read from. */
  live: Slot.make({ capability: Capability.Base }),
})

/**
 * What the drawn Builder needs to work unstyled: the frame as wide as the
 * viewport, centred. In `components`, so an application's style overrides it.
 */
/** A box over a measured node: where `Measure` found it, and nothing to the pointer. */
const boxOver = (name: string) => {
  const at = measured(name)
  return Style.self({
    position: 'absolute',
    insetInlineStart: `var(${at.x})`,
    insetBlockStart: `var(${at.y})`,
    width: `var(${at.w})`,
    height: `var(${at.h})`,
    display: `var(${at.display}, none)`,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  })
}

// What makes the Builder work, not how it looks: the frame's width, and the boxes
// placed over the page. Any application style overrides them.
const FrameDefaults = Style.forSlots(BuilderSlots)(
  {
    frame: Style.self({ maxWidth: 'var(--fk-frame-width)', marginInline: 'auto' }),
    // What the boxes are placed in: the canvas, measured from its scroll box.
    canvas: Style.self({ position: 'relative' }),
    selectionBox: boxOver('selected'),
    selectionLabel: Style.self({
      position: 'absolute',
      insetBlockEnd: '100%',
      insetInlineStart: '0',
    }),
    hoverBox: boxOver('hovered'),
  },
  { name: 'BuilderDefaults', layer: StyleLayers.standard.layer('components') },
)

/** The width each viewport draws the page at. */
export const viewportWidths = { wide: '100%', medium: '768px', narrow: '375px' } as const

/** What `BuilderView.define` needs of a Builder: what `Builder.make` returns has all of it. */
export interface BuilderLike {
  readonly name: string
  readonly catalog: Catalog
  // `any`: a Renderer's entries are keyed by its own Blocks, so no one Blocks type fits every Builder's.
  readonly renderer: Renderer<any, never>
  readonly offered: ReadonlyArray<string>
  readonly document: (model: Pick<Model, 'page'>) => Document
  // Method syntax: a Builder whose Blocks are named narrower still fits.
  placeFor(
    document: Document,
    selected: Option.Option<NodeId>,
    block: string,
  ): Option.Option<Position>
  /** What a key, a node's action and the toolbar run. */
  readonly commands: ReadonlyArray<BuilderCommand>
  readonly inspecting: (
    model: Pick<Model, 'page' | 'selected' | 'inspector'>,
  ) => Option.Option<Inspecting>
  readonly keyCommand: (
    model: Pick<Model, 'page' | 'selected'>,
    key: string,
    modifiers: KeyboardModifiers,
  ) => Option.Option<Message>
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
      // The DOM's fact says "over nothing" with `null`; the Builder has a Message for it.
      return fact.over === null
        ? Message.DraggedOff()
        : Message.DraggedOver({ id: NodeId.make(fact.over.id), zone: fact.over.zone })
    case 'DragDropped':
      return Message.DragDropped()
    case 'DragCancelled':
      return Message.DragCancelled()
  }
}

/** The DOM id a layer row carries, so keyboard focus can find it. */
export const layerId = (builder: { readonly name: string }, id: string): string =>
  `${builder.name}-layer-${id}`

/** A node id the DOM reported, where `null` or an empty id is none. */
const asNodeId = (id: string | null): Option.Option<NodeId> =>
  Option.map(
    Option.filter(Option.fromNullOr(id), found => found !== ''),
    NodeId.make,
  )

/** A stored appearance that is a record of choices, as opposed to a list or a scalar. */
const isChoices = (
  value: Schema.Json | undefined,
): value is { readonly [axis: string]: Schema.Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What a context key's control reads as a value: blank is none, a toggle's text a boolean. */
const contextValue = (control: Control | undefined, raw: string): Option.Option<ContextValue> => {
  if (raw === '') return Option.none()
  if (control !== undefined && Input.Toggle.is(control)) return Option.some(raw === 'true')
  if (
    control !== undefined &&
    Input.Number.is(control) &&
    raw.trim() !== '' &&
    Number.isFinite(Number(raw))
  )
    return Option.some(Number(raw))
  return Option.some(raw)
}

/** Choices named by themselves. */
const named = (values: ReadonlyArray<string>): ReadonlyArray<BuilderOption> =>
  values.map(value => ({ value, label: value }))

/**
 * A select's options: a blank, the choices, and a stored value the choices lack,
 * shown as `? value` and chosen, rather than the blank misreporting it. With no
 * word for the blank, it is offered only while nothing is chosen.
 */
const optionsOf = <Message>(
  h: HtmlBuilder<Message>,
  option: SlotView.SlotBuilder<Message>,
  select: {
    /** What the blank choice reads as; with none, a blank only while nothing is chosen. */
    readonly blank?: string | undefined
    readonly choices: ReadonlyArray<BuilderOption>
    readonly current?: string | undefined
  },
): ReadonlyArray<Html> => {
  const { blank, choices, current } = select
  const empty = current === undefined || current === ''
  const stray = !empty && !choices.some(choice => choice.value === current)
  return [
    ...(blank !== undefined || empty
      ? [h.option(option.attrs([h.Value(''), h.Selected(empty)]), [blank ?? ''])]
      : []),
    ...choices.map(choice =>
      h.option(option.attrs([h.Value(choice.value), h.Selected(current === choice.value)]), [
        choice.label,
      ]),
    ),
    ...(stray
      ? [h.option(option.attrs([h.Value(current), h.Selected(true)]), [`? ${current}`])]
      : []),
  ]
}

/** The choices a context key offers, or `undefined` when it is typed in. */
const contextChoices = (control: Control | undefined): ReadonlyArray<string> | undefined =>
  control === undefined
    ? undefined
    : Input.Select.is(control)
      ? control.data.options.map(String)
      : Input.Toggle.is(control)
        ? ['true', 'false']
        : undefined

/** The longest summary a layer row shows before it is cut short. */
const SUMMARY_LENGTH = 40

/** The most values a look offers as buttons; one with more is a select. */
const CHOICES_SHOWN = 4

/** The keys the tree's own keyboard takes, beside the commands: they move focus, not the page. */
const TREE_KEYS: ReadonlyArray<readonly [keys: string, what: string]> = [
  ['↑ ↓', 'Go to the layer above or below'],
  ['← →', 'Close or open a layer'],
]

/** How a key is named on screen. */
const keyNames: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

/**
 * A command's key as a person on `platform` reads it, in its own order: `⌥⇧⌘Z`
 * on a Mac, where `mod` is ⌘, and `Ctrl+Alt+Shift+Z` elsewhere.
 */
export const keysOf = (key: CommandKey, platform: Platform = 'other'): string => {
  const name = keyNames[key.key] ?? (key.key.length === 1 ? key.key.toUpperCase() : key.key)
  const held = (
    words: { mod: string; alt: string; shift: string },
    order: ReadonlyArray<'mod' | 'alt' | 'shift'>,
  ) => order.flatMap(modifier => (key[modifier] === true ? [words[modifier]] : []))
  return platform === 'mac'
    ? [...held({ mod: '⌘', alt: '⌥', shift: '⇧' }, ['alt', 'shift', 'mod']), name].join('')
    : [...held({ mod: 'Ctrl', alt: 'Alt', shift: 'Shift' }, ['mod', 'alt', 'shift']), name].join(
        '+',
      )
}

/** The platform keys are named for: a Mac's, or any other's. */
export type Platform = 'mac' | 'other'

/**
 * What the drawn Builder is given beside its Model, by the page's parent: the
 * application's, never the Builder's to keep.
 */
export interface BuilderViewInputs {
  /** The platform the author is on, so keys are named as theirs are (⌘ on a Mac). Default: `other`. */
  readonly platform?: Platform | undefined
  /**
   * Each node's read, by node id, as a published page is drawn with it: the
   * page's Query and Surface Blocks' values, so the canvas shows their rows.
   */
  readonly data?: Readonly<Record<string, unknown>> | undefined
  /**
   * The choices of a relation prop's picker, keyed `'Block.prop'`: the rows the
   * application loaded for it, as a form's `options` are.
   */
  readonly options?: Readonly<Record<string, ReadonlyArray<BuilderOption>>> | undefined
}

/** One choice of a relation picker: what is stored, and what is shown. */
export interface BuilderOption {
  readonly value: string
  readonly label: string
}

/** What the drawn Builder's Slots and Behaviors read: its Model and its inputs. */
export type BuilderInput = Model & BuilderViewInputs

// Whether a runtime render is under way, which `h.submodel` needs. Foldkit offers
// no way to ask; a lazy slot reads the current frame before anything else and
// throws without one. Any other throw, such as a slot drawn twice, is left to surface.
const probe = createLazy()
const nothing = () => null
const inRender = (): boolean => {
  try {
    probe(nothing, [])
    return true
  } catch {
    return false
  }
}

/**
 * How the inspector's settings forms look: Styles attached to every Block's
 * settings form, as to any form's `FormView.field(form)` and `FormView.define`.
 */
export interface SettingsLook {
  /** Attached to each settings form's fields: `FieldSlots`. */
  readonly field?: SlotView.SlotViewTransform
  /** Attached to each settings form around its fields: `FormSlots`. */
  readonly form?: SlotView.SlotViewTransform
  /**
   * Renderers for control kinds of the application's own, beside the shipped
   * ones, as a form view takes them. A function of the Message, since each
   * Block's settings form has Messages of its own: `Cms.controlRenderers`.
   */
  readonly renderers?: <Message>() => Renderers<Message>
}

/** A Block's settings form, drawn with `look`. */
const settingsViewOf = (settings: Settings, look: SettingsLook) => {
  const field = FormView.field(
    settings.form,
    look.renderers === undefined ? {} : { renderers: look.renderers() },
  )
  const drawn = FormView.define(settings.form, {
    field: look.field === undefined ? field : field.pipe(look.field),
  })
  const view = FormView.submodel(
    settings.form,
    look.form === undefined ? drawn : drawn.pipe(look.form),
  )
  return view
}

/** The drawn Builder: what `BuilderView.define` returns. */
export type BuilderSlotView = SlotView.SlotView<typeof BuilderSlots, BuilderInput, Message>

const Parts = SlotView.parts(BuilderSlots)<BuilderInput, Message>()

/** One piece of the drawn Builder, placed by `BuilderView.assemble`. */
export type BuilderPart = SlotView.Part<typeof BuilderSlots, BuilderInput, Message>

/** The drawn Builder's pieces, by what they show. */
export interface BuilderParts {
  /** The Blocks a page may gain, each a button that inserts it. */
  readonly Palette: BuilderPart
  /** The page's nodes as an ARIA tree, with the keyboard and dragging. */
  readonly Layers: BuilderPart
  /** The selected node's props, looks, conditions and actions, or the shortcuts. */
  readonly Inspector: BuilderPart
  /** The toolbar's commands: undo and redo, unless the Builder's commands say otherwise. */
  readonly Toolbar: BuilderPart
  /** Where the selection is, from the page down. */
  readonly Crumbs: BuilderPart
  readonly Viewports: BuilderPart
  /** The context the page is previewed for; nothing where the Catalog has none. */
  readonly Preview: BuilderPart
  /** Why the last edit was refused; nothing when none was. */
  readonly Alert: BuilderPart
  /** The page, drawn by the site's Renderer, with the pointer. */
  readonly Canvas: BuilderPart
  /** What the Builder announces to a screen reader. */
  readonly Live: BuilderPart
}

export const BuilderView = {
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
   * The Builder's parts, each drawn again only when what it reads changed,
   * with its Behaviors (the layers' keyboard, the canvas's pointer, the
   * shortcuts) declared with it. Place them with `assemble`.
   */
  parts: (
    builder: BuilderLike,
    options: {
      /** How the inspector's settings forms look. */
      readonly settings?: SettingsLook
    } = {},
  ): BuilderParts => {
    // Each Block's settings form, drawn: made once per form, as the form is once per Block.
    const settingsViews = new WeakMap<Settings, ReturnType<typeof settingsViewOf>>()
    const settingsView = (settings: Settings) => {
      const known = settingsViews.get(settings)
      if (known !== undefined) return known
      const made = settingsViewOf(settings, options.settings ?? {})
      settingsViews.set(settings, made)
      return made
    }
    const described = new Map(
      builder.catalog.blocks.map(block => {
        // The props a layer row may quote: those drawn as text.
        const texts = Object.entries(fieldsOf(block.Props)).flatMap(([key, schema]) => {
          const control = controlOf(block, key, schema)
          return control !== undefined && (Input.Text.is(control) || Input.Multiline.is(control))
            ? [key]
            : []
        })
        return [
          block.name,
          {
            label: block.words.label,
            description: block.words.description,
            // Blocks given no group share one.
            group: Option.getOrElse(block.words.group, () => 'Blocks'),
            texts,
          },
        ] as const
      }),
    )
    /** A Block's label; one the Catalog lacks is marked unknown. */
    const labelOf = (name: string): string => described.get(name)?.label ?? `? ${name}`
    /** A node's first text prop that says something, cut short. */
    const summaryOf = (node: Document['nodes'][NodeId]): Option.Option<string> => {
      for (const key of described.get(node.block)?.texts ?? []) {
        const value = node.props[key]
        const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
        if (text !== '')
          return Option.some(
            text.length > SUMMARY_LENGTH ? `${text.slice(0, SUMMARY_LENGTH - 1).trimEnd()}…` : text,
          )
      }
      return Option.none()
    }
    // The palette's groups, in the order their first Block is offered: a Map keeps insertion order.
    const grouped = new Map<string, Array<string>>()
    for (const name of builder.offered) {
      const group = described.get(name)?.group ?? 'Blocks'
      const names = grouped.get(group)
      if (names === undefined) grouped.set(group, [name])
      else names.push(name)
    }
    const groups = [...grouped]

    // One field per context key: a choice, or typed in; blank is unset.
    const contextField = (
      slots: SlotView.SlotBuilders<typeof BuilderSlots, Message>,
      h: HtmlBuilder<Message>,
      field: {
        readonly id: string
        readonly label: string
        readonly schema: Schema.Top
        readonly current: Option.Option<ContextValue>
        /** What the blank choice reads as. */
        readonly blank: string
        /** The value chosen, or none for the blank. */
        readonly send: (value: Option.Option<ContextValue>) => Message
      },
    ) => {
      const { id: fieldId, label, schema, current, blank, send } = field
      const control = Input.resolve(Entity.unmapped, schema)
      const choices = contextChoices(control)
      // A context value that is itself `null` is shown as the blank too.
      const shown = Option.match(current, {
        onNone: () => '',
        onSome: value => (value === null ? '' : String(value)),
      })
      return h.div(slots.field.attrs(), [
        h.label(slots.label.attrs([h.For(fieldId)]), [label]),
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
              optionsOf(h, slots.selectOption, { blank, choices: named(choices), current: shown }),
            ),
      ])
    }

    const inspect = (
      document: Document,
      id: NodeId,
      options: Readonly<Record<string, ReadonlyArray<BuilderOption>>>,
      actions: Html,
      inspecting: Option.Option<Inspecting>,
      slots: SlotView.SlotBuilders<typeof BuilderSlots, Message>,
      h: HtmlBuilder<Message>,
    ): Html => {
      const node = document.nodes[id]
      const block = node === undefined ? undefined : Catalog.block(builder.catalog, node.block)
      const head = h.div(slots.inspectorHead.attrs(), [
        h.h2(slots.inspectorTitle.attrs(), [node === undefined ? id : labelOf(node.block)]),
        ...Option.match(
          node === undefined
            ? Option.none()
            : (described.get(node.block)?.description ?? Option.none()),
          {
            onNone: () => [],
            onSome: hint => [h.p(slots.inspectorHint.attrs(), [hint])],
          },
        ),
        actions,
      ])
      /** A part of the settings under its heading; none when it has nothing in it. */
      const section = (title: string, fields: ReadonlyArray<Html>): ReadonlyArray<Html> =>
        fields.length === 0
          ? []
          : [
              h.div(slots.inspectorSection.attrs([h.Role('group'), h.AriaLabel(title)]), [
                h.h3(slots.inspectorSectionTitle.attrs(), [title]),
                ...fields,
              ]),
            ]
      if (node === undefined || block === undefined)
        return h.div(slots.inspector.attrs([h.Role('group'), h.AriaLabel('Properties')]), [
          head,
          h.p(
            [],
            [
              'This block is not in this version of the application, so its settings cannot be edited here.',
            ],
          ),
          ...Object.entries(node?.props ?? {}).map(([key, value]) =>
            h.div(slots.field.attrs(), [
              h.span(slots.label.attrs(), [key]),
              h.code(slots.control.attrs(), [JSON.stringify(value)]),
            ]),
          ),
        ])
      // The props: the Block's settings form, whose changes the Builder turns into edits,
      // then any prop no control fits, as it is stored.
      /**
       * One of the node's forms, placed under `slot`; its Messages go to the
       * Builder as `Inspected`, naming the node and the form.
       */
      const drawForm = (
        target: Inspecting,
        form: InspectedForm,
        slot: string,
        inputs: FormViewInputs,
      ): Html => {
        const view = settingsView(form.settings)
        return inRender()
          ? h.submodel({
              slotId: `${builder.name}-${slot}`,
              model: form.model,
              view,
              toParentMessage: sent =>
                Message.Inspected({
                  id: target.id,
                  form: form.key,
                  message: form.settings.encodeMessage(sent),
                }),
              viewInputs: inputs,
            })
          : // No runtime frame (a test, a static description): nothing carries the form's
            // Messages to the Builder, and no handler can run, so it is drawn as it is.
            view(form.model, inputs, SlotView.inertBuilder())
      }
      const fields = Option.match(inspecting, {
        onNone: () => [],
        onSome: target => [
          drawForm(target, target.props, 'settings', {
            submits: false,
            words: { none: 'none' },
            // The application's choices are keyed `'Block.prop'`; the form's by prop.
            options: Object.fromEntries(
              Object.entries(options).flatMap(([at, choices]) =>
                at.startsWith(`${node.block}.`) ? [[at.slice(node.block.length + 1), choices]] : [],
              ),
            ),
          }),
          ...target.props.settings
            .shown(node.props)
            .map(({ label, value }) =>
              h.div(slots.field.attrs(), [
                h.span(slots.label.attrs(), [label]),
                h.code(slots.control.attrs(), [JSON.stringify(value)]),
              ]),
            ),
        ],
      })
      // The node's look: one choice per axis its Block offers, blank for the default,
      // and on a responsive axis one more per breakpoint it may change at.
      const chosen = isChoices(node.appearance) ? node.appearance : {}
      const looks = Object.entries(block.appearance).flatMap(([axis, look]) => {
        const { values, breakpoints } = look
        /** A value's name: the look's label for it, else the value spaced. */
        const named = (value: string): string => look.labels?.[value] ?? spaced(value)
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
        const label = spaced(axis)
        if ((breakpoints ?? []).length === 0 && values.length <= CHOICES_SHOWN) {
          const current = at['base']
          // A stored value the look lacks is shown pressed, and choosing it again sends nothing.
          const stray =
            current !== undefined && !values.includes(current)
              ? Option.some(current)
              : Option.none()
          return [
            h.div(slots.field.attrs(), [
              h.span(slots.label.attrs(), [label]),
              h.div(
                slots.choices.attrs([
                  h.Id(`${builder.name}-${id}-appearance-${axis}`),
                  h.Role('group'),
                  h.AriaLabel(label),
                ]),
                [
                  ...[
                    ['', 'Default'] as const,
                    ...values.map(value => [value, named(value)] as const),
                  ].map(([value, text]) =>
                    h.button(
                      slots.choice.attrs([
                        h.Type('button'),
                        h.AriaPressed(
                          (value === '' ? current === undefined : current === value)
                            ? 'true'
                            : 'false',
                        ),
                        h.OnClick(choose('base')(value)),
                      ]),
                      [text],
                    ),
                  ),
                  ...Option.match(stray, {
                    onNone: () => [],
                    onSome: value => [
                      h.button(
                        slots.choice.attrs([
                          h.Type('button'),
                          h.AriaPressed('true'),
                          h.Disabled(true),
                        ]),
                        [`? ${value}`],
                      ),
                    ],
                  }),
                ],
              ),
            ]),
          ]
        }
        return ['base', ...(breakpoints ?? [])].map(point => {
          const fieldId = `${builder.name}-${id}-appearance-${axis}${point === 'base' ? '' : `-${point}`}`
          return h.div(slots.field.attrs(), [
            h.label(slots.label.attrs([h.For(fieldId)]), [
              point === 'base' ? label : `${label} at ${point}`,
            ]),
            h.select(
              slots.control.attrs([h.Id(fieldId), h.OnChange(choose(point))]),
              optionsOf(h, slots.selectOption, {
                blank: point === 'base' ? 'default' : 'unchanged',
                choices: values.map(value => ({ value, label: named(value) })),
                current: at[point],
              }),
            ),
          ])
        })
      })
      // When it shows: an `eq` condition per context key, blank for always. Other
      // conditions on a key are kept as they are.
      const when = Array.isArray(node.when) ? node.when : []
      const isEqOn = (key: string) => (condition: Schema.Json) =>
        isChoices(condition) && Array.isArray(condition['eq']) && condition['eq'][0] === key
      const eqOf = (key: string): Option.Option<ContextValue> => {
        for (const condition of when)
          if (isChoices(condition) && isEqOn(key)(condition) && Array.isArray(condition['eq'])) {
            const value = condition['eq'][1]
            if (
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
            )
              return Option.some(value)
          }
        return Option.none()
      }
      const conditions = Object.entries(fieldsOf(builder.catalog.context)).map(([key, schema]) =>
        contextField(slots, h, {
          id: `${builder.name}-${id}-when-${key}`,
          label: `Shown when ${key} is`,
          schema,
          current: eqOf(key),
          blank: 'always',
          send: value => {
            const others = when.filter(condition => !isEqOn(key)(condition))
            const next = Option.match(value, {
              onNone: () => others,
              onSome: chosen => [...others, { eq: [key, chosen] }],
            })
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
        const run = (name: string, given: { readonly [key: string]: Schema.Json }): Message =>
          Message.Applied({
            op: Composition.Op.setAction(id, event, { action: name, input: given }),
          })
        const pickId = `${builder.name}-${id}-on-${event}`
        const pick = h.div(slots.field.attrs(), [
          h.label(slots.label.attrs([h.For(pickId)]), [`On ${event}`]),
          h.select(
            slots.control.attrs([
              h.Id(pickId),
              h.OnChange(name => {
                const chosen = builder.catalog.actions.find(each => each.name === name)
                return chosen === undefined
                  ? Message.Applied({ op: Composition.Op.setAction(id, event, null) })
                  : run(chosen.name, inputOf(block, event, chosen).seed())
              }),
            ]),
            optionsOf(h, slots.selectOption, {
              blank: 'nothing',
              choices: named(builder.catalog.actions.map(each => each.name)),
              current: typeof ref['action'] === 'string' ? ref['action'] : undefined,
            }),
          ),
        ])
        // The chosen action's input, its own form; an action the Catalog lacks has none.
        const input = Option.match(
          Option.flatMap(inspecting, target =>
            Option.map(Option.fromUndefinedOr(target.on[event]), form => ({ target, form })),
          ),
          {
            onNone: () => [],
            onSome: ({ target, form }) => [
              drawForm(target, form, `on-${event}`, { submits: false, words: { none: 'none' } }),
            ],
          },
        )
        return [pick, ...input]
      })
      return h.div(slots.inspector.attrs([h.Role('group'), h.AriaLabel('Properties')]), [
        head,
        ...section('Content', fields),
        ...section('Style', looks),
        ...section('Visibility', conditions),
        ...section('Interactions', events),
      ])
    }

    const shortcuts = ({
      input,
      h,
    }: {
      readonly input: Pick<BuilderInput, 'page' | 'selected'>
      readonly h: HtmlBuilder<Message>
    }) => [h.OnKeyDownPreventDefault((key, modifiers) => builder.keyCommand(input, key, modifiers))]

    /** A button, disabled where there is nothing to send. */
    const button = (
      h: HtmlBuilder<Message>,
      slot: SlotView.SlotBuilder<Message>,
      label: string,
      message: Option.Option<Message>,
      extra: ReadonlyArray<Attribute<Message>> = [],
    ) =>
      h.button(
        slot.attrs([
          h.Type('button'),
          h.Disabled(Option.isNone(message)),
          ...Option.match(message, { onNone: () => [], onSome: sent => [h.OnClick(sent)] }),
          ...extra,
        ]),
        [label],
      )

    /** A command as a button: disabled while it has nothing to do, titled with its first key. */
    const commandButton = (
      h: HtmlBuilder<Message>,
      slot: SlotView.SlotBuilder<Message>,
      command: BuilderCommand,
      input: Pick<BuilderInput, 'page' | 'selected' | 'platform'>,
    ) => {
      const [key] = command.keys
      return button(h, slot, command.label, command.run(input), [
        h.DataAttribute('action', command.id),
        h.Title(
          key === undefined ? command.label : `${command.label} (${keysOf(key, input.platform)})`,
        ),
      ])
    }

    const labelAt = (document: Document, id: NodeId): string =>
      Option.match(Option.fromUndefinedOr(document.nodes[id]), {
        onNone: () => id,
        onSome: node => labelOf(node.block),
      })
    // Where an insert lands, said on the Block's button, from the place itself.
    const whereItGoes = (
      document: Document,
      selected: Option.Option<NodeId>,
      at: Option.Option<Position>,
    ): string =>
      Option.match(at, {
        onNone: () =>
          Option.match(selected, {
            onNone: () => 'Select a block that can hold it',
            onSome: id => `It cannot go in or after the ${labelAt(document, id)}`,
          }),
        onSome: position => {
          if (position._tag === 'Root') {
            const before = document.roots[position.index - 1]
            return position.index === document.roots.length
              ? 'Adds it to the end of the page'
              : before === undefined
                ? 'Adds it to the top of the page'
                : `Adds it after the ${labelAt(document, before)}`
          }
          const before =
            document.nodes[position.parent]?.regions[position.region]?.[position.index - 1]
          return Option.contains(selected, position.parent) || before === undefined
            ? `Adds it inside the ${labelAt(document, position.parent)}`
            : `Adds it after the ${labelAt(document, before)}`
        },
      })
    // A drop is marked only where it would land: `at` is none where the page refuses it.
    const dropOf = (drag: Model['drag']) =>
      Option.flatMap(drag, each => (Option.isSome(each.at) ? each.over : Option.none()))

    // The shortcuts, on the layers and on the canvas; each part draws one of the two.
    const Shortcuts = Behavior.forSlots(BuilderSlots)<
      Pick<BuilderInput, 'page' | 'selected'>,
      Message
    >(
      {
        layers: Behavior.slot({ attributes: shortcuts }),
        canvas: Behavior.slot({ attributes: shortcuts }),
      },
      { name: 'BuilderShortcuts' },
    )
    // What is selected, however it was (a click, a shortcut, an insert, the
    // address), is brought into view in the layers and on the canvas.
    const KeepSelectionInView = Behavior.forSlots(BuilderSlots)<Pick<BuilderInput, never>, Message>(
      {
        layers: Behavior.slot({
          mount: () => KeepInView({ selector: '[role="treeitem"][aria-selected="true"]' }),
        }),
        canvas: Behavior.slot({
          // The mark is on a `display: contents` wrapper, which has no box: the Block's own element does.
          mount: () => KeepInView({ selector: `[data-${MARK_ATTRIBUTE}="selected"] > *` }),
        }),
      },
      { name: 'KeepSelectionInView' },
    )

    const Palette = Parts.part('Palette', { reads: ['page', 'selected'] }, (input, slots, h) => {
      const document = builder.document(input)
      return h.nav(
        slots.palette.attrs([h.AriaLabel('Add a block')]),
        groups.map(([group, names]) =>
          h.div(slots.paletteGroup.attrs([h.Role('group'), h.AriaLabel(group)]), [
            ...(groups.length > 1 ? [h.h3(slots.paletteHeading.attrs(), [group])] : []),
            ...names.map(name => {
              const at = builder.placeFor(document, input.selected, name)
              const label = labelOf(name)
              return h.button(
                slots.paletteItem.attrs([
                  h.Type('button'),
                  h.DataAttribute('block', name),
                  h.AriaLabel(`Add ${label}`),
                  h.Title(whereItGoes(document, input.selected, at)),
                  h.Disabled(Option.isNone(at)),
                  ...Option.match(at, {
                    onNone: () => [],
                    onSome: position => [
                      h.OnClick(Message.InsertAsked({ block: name, at: position })),
                    ],
                  }),
                ]),
                [
                  h.span(slots.paletteLabel.attrs(), [label]),
                  ...Option.match(described.get(name)?.description ?? Option.none(), {
                    onNone: () => [],
                    onSome: hint => [h.span(slots.paletteHint.attrs(), [hint])],
                  }),
                ],
              )
            }),
          ]),
        ),
      )
    })

    /**
     * One layer row, from what it shows alone. Its arguments are compared by
     * identity, so an absent node or drop arrives as `undefined`, not as an
     * `Option`, which would be a new value on every draw.
     */
    const drawRow = (
      slots: SlotView.SlotBuilders<typeof BuilderSlots, Message>,
      h: HtmlBuilder<Message>,
      {
        index,
        id,
        branch,
        node,
        open,
        selected,
        drop,
        dragged,
      }: {
        readonly index: number
        readonly id: string
        readonly branch: boolean
        readonly node: Document['nodes'][NodeId] | undefined
        readonly open: boolean
        readonly selected: boolean
        readonly drop: DropZone | undefined
        readonly dragged: boolean
      },
    ): Html =>
      h.li(
        slots.row.attrs(
          [
            h.Key(id),
            h.DataAttribute(ROW_ATTRIBUTE, id),
            ...(node === undefined ? [] : [h.DataAttribute('block', node.block)]),
            ...(drop === undefined ? [] : [h.DataAttribute(ROW_DROP_ATTRIBUTE, drop)]),
            ...(dragged ? [h.DataAttribute(ROW_DRAGGING_ATTRIBUTE, '')] : []),
            h.AriaSelected(selected),
            h.OnClick(Message.Selected({ id: NodeId.make(id) })),
            // Pointing at a row marks its node on the page, as pointing at the page does.
            h.OnMouseEnter(Message.Hovered({ id: NodeId.make(id) })),
            h.OnMouseLeave(Message.Unhovered()),
          ],
          { index, id },
        ),
        [
          ...(branch
            ? [
                h.span(
                  slots.rowToggle.attrs([
                    // The row says whether it is open; this is the pointer's way to change it.
                    h.AriaHidden(true),
                    h.OnClick(
                      Layers.wrapper.make(
                        open
                          ? TreeNavigation.Message.Closed({ id })
                          : TreeNavigation.Message.Opened({ id }),
                      ),
                    ),
                  ]),
                  [],
                ),
              ]
            : []),
          h.span(slots.rowLabel.attrs(), [node === undefined ? id : labelOf(node.block)]),
          ...Option.match(node === undefined ? Option.none() : summaryOf(node), {
            onNone: () => [],
            onSome: summary => [h.span(slots.rowSummary.attrs(), [summary])],
          }),
        ],
      )

    // Where the selected and the hovered node are, for the boxes drawn over them.
    const MeasureMarks = Behavior.forSlots(BuilderSlots)<Pick<BuilderInput, never>, Message>(
      {
        canvas: Behavior.slot({
          mount: () =>
            Measure({
              targets: {
                // The mark is on a `display: contents` wrapper, which has no box: its Block's element does.
                selected: `[data-${MARK_ATTRIBUTE}="selected"] > *`,
                hovered: `[data-${MARK_ATTRIBUTE}="hovered"] > *`,
              },
            }),
        }),
      },
      { name: 'MeasureMarks' },
    )

    const LayersPart = Parts.part(
      'Layers',
      {
        reads: ['page', 'selected', 'layers', 'drag'],
        behaviors: [
          TreeNavigation.behavior(Layers, layersArgs)(BuilderSlots)<
            Pick<BuilderInput, 'page' | 'selected' | 'layers' | 'drag'>,
            Message
          >({
            container: 'tree',
            item: 'row',
            rows: input => rowsOf(builder.document(input)),
            domId: id => layerId(builder, id),
          }),
          // A row is dragged onto another; the keyboard's way is the shortcuts.
          PointerDrag.behavior(BuilderSlots)<Pick<BuilderInput, never>, Message>({
            container: 'tree',
            attribute: `data-${ROW_ATTRIBUTE}`,
            toMessage: dragMessage,
          }),
          Shortcuts,
          KeepSelectionInView,
        ],
      },
      (input, slots, h) => {
        const document = builder.document(input)
        const { selected } = input
        const drop = dropOf(input.drag)
        const dragged = Option.map(input.drag, drag => drag.id)
        const shown = TreeNavigation.shown(rowsOf(document), input.layers, layersArgs)
        const tree = h.ul(
          slots.tree.attrs([h.Role('tree'), h.AriaLabel('Layers')]),
          // Each row drawn again only when what it shows changed: a new selection
          // redraws the row it left and the row it reached.
          shown.map((row, index) =>
            slots.row.lazy({ index, id: row.id }, drawRow, {
              index,
              id: row.id,
              branch: row.branch,
              node: document.nodes[NodeId.make(row.id)],
              open: TreeNavigation.isOpen(input.layers, layersArgs, row.id),
              selected: Option.contains(selected, NodeId.make(row.id)),
              drop: Option.getOrUndefined(
                Option.map(
                  Option.filter(drop, over => over.id === row.id),
                  over => over.zone,
                ),
              ),
              dragged: Option.contains(dragged, NodeId.make(row.id)),
            }),
          ),
        )
        // The tree inside is what is named "Layers"; the panel around it is not named twice.
        return h.section(slots.layers.attrs(), [tree])
      },
    )

    const Inspector = Parts.part(
      'Inspector',
      { reads: ['page', 'selected', 'options', 'inspector', 'platform'] },
      (input, slots, h) => {
        const actions = h.div(
          slots.actions.attrs([h.Role('toolbar'), h.AriaLabel('Selected block')]),
          builder.commands
            .filter(command => command.placement.includes('node'))
            .map(command => commandButton(h, slots.action, command, input)),
        )
        return Option.match(input.selected, {
          onNone: () =>
            h.div(slots.inspector.attrs([h.Role('group'), h.AriaLabel('Properties')]), [
              h.p(slots.inspectorHint.attrs(), [
                'Select a block on the page or in the layers to change it.',
              ]),
              h.h3(slots.inspectorSectionTitle.attrs(), [
                'Shortcuts, in the layers or on the page',
              ]),
              h.dl(
                slots.shortcuts.attrs(),
                [
                  ...TREE_KEYS,
                  ...builder.commands.flatMap(command => {
                    const [key] = command.keys
                    return key === undefined
                      ? []
                      : [[keysOf(key, input.platform), command.label] as const]
                  }),
                ].flatMap(([keys, what]) => [
                  h.dt(slots.shortcutKeys.attrs(), [keys]),
                  h.dd(slots.shortcutWhat.attrs(), [what]),
                ]),
              ),
            ]),
          onSome: id =>
            inspect(
              builder.document(input),
              id,
              input.options ?? {},
              actions,
              builder.inspecting(input),
              slots,
              h,
            ),
        })
      },
    )

    const Toolbar = Parts.part(
      'Toolbar',
      { reads: ['page', 'selected', 'platform'] },
      (input, slots, h) =>
        h.div(
          slots.toolbar.attrs([h.Role('toolbar'), h.AriaLabel('Page actions')]),
          builder.commands
            .filter(command => command.placement.includes('toolbar'))
            .map(command => commandButton(h, slots.toolbarAction, command, input)),
        ),
    )

    const Crumbs = Parts.part('Crumbs', { reads: ['page', 'selected'] }, (input, slots, h) => {
      const document = builder.document(input)
      // The page, then each node from the top down to the selected one, which is where you are.
      const holders = (id: NodeId): ReadonlyArray<NodeId> => {
        const places = Composition.index(document)
        const chain: Array<NodeId> = [id]
        for (
          let place = places.get(id);
          place?.parent !== undefined;
          place = places.get(place.parent)
        )
          chain.unshift(place.parent)
        return chain
      }
      const trail = Option.match(input.selected, { onNone: () => [], onSome: holders })
      return h.nav(slots.crumbs.attrs([h.AriaLabel('Where the selection is')]), [
        h.button(
          slots.crumb.attrs([
            h.Type('button'),
            h.OnClick(Message.Deselected()),
            ...(trail.length === 0 ? [h.AriaCurrent('location')] : []),
          ]),
          ['Page'],
        ),
        ...trail.map((id, index) =>
          h.button(
            slots.crumb.attrs([
              h.Type('button'),
              h.OnClick(Message.Selected({ id })),
              ...(index === trail.length - 1 ? [h.AriaCurrent('location')] : []),
            ]),
            [labelAt(document, id)],
          ),
        ),
      ])
    })

    const Viewports = Parts.part('Viewports', { reads: ['viewport'] }, (input, slots, h) =>
      h.div(
        slots.viewports.attrs([h.Role('group'), h.AriaLabel('Viewport')]),
        (['wide', 'medium', 'narrow'] as const).map(viewport =>
          button(
            h,
            slots.viewport,
            spaced(viewport),
            Option.some(Message.ViewportChosen({ viewport })),
            [
              h.DataAttribute('viewport', viewport),
              h.AriaPressed(input.viewport === viewport ? 'true' : 'false'),
            ],
          ),
        ),
      ),
    )

    const context = fieldsOf(builder.catalog.context)
    // Nothing where the Catalog has no context to preview.
    const Preview = Parts.part('Preview', { reads: ['preview'] }, (input, slots, h) =>
      Object.keys(context).length === 0
        ? null
        : h.div(
            slots.preview.attrs([h.Role('group'), h.AriaLabel('Preview as')]),
            Object.entries(context).map(([key, schema]) =>
              contextField(slots, h, {
                id: `${builder.name}-preview-${key}`,
                label: key,
                schema,
                current: Option.fromUndefinedOr(input.preview[key]),
                blank: 'unset',
                send: value =>
                  Option.match(value, {
                    onNone: () => Message.PreviewCleared({ key }),
                    onSome: chosen => Message.PreviewChosen({ key, value: chosen }),
                  }),
              }),
            ),
          ),
    )

    const Alert = Parts.part('Alert', { reads: ['refused'] }, (input, slots, h) =>
      Option.match(input.refused, {
        onNone: () => null,
        onSome: refused => h.p(slots.alert.attrs([h.Role('alert')]), [refused.message]),
      }),
    )

    // Focusable, so a press on the page leaves the shortcuts where the selection is.
    const Canvas = Parts.part(
      'Canvas',
      {
        reads: ['page', 'selected', 'hovered', 'drag', 'viewport', 'preview', 'data'],
        behaviors: [
          Targets.behavior(BuilderSlots)<Pick<BuilderInput, never>, Message>({
            container: 'canvas',
            attribute: `data-${NODE_ATTRIBUTE}`,
            // A link on the page being edited selects its node; it does not navigate.
            preventDefault: true,
            toMessage: fact =>
              Option.match(asNodeId(fact.id), {
                onNone: () =>
                  fact._tag === 'TargetHovered' ? Message.Unhovered() : Message.Deselected(),
                onSome: id =>
                  fact._tag === 'TargetHovered'
                    ? Message.Hovered({ id })
                    : Message.Selected({ id }),
              }),
          }),
          // A node is dragged onto another; the keyboard's way is the shortcuts.
          PointerDrag.behavior(BuilderSlots)<Pick<BuilderInput, never>, Message>({
            container: 'canvas',
            attribute: `data-${NODE_ATTRIBUTE}`,
            toMessage: dragMessage,
          }),
          Shortcuts,
          KeepSelectionInView,
          MeasureMarks,
        ],
      },
      (input, slots, h) => {
        const document = builder.document(input)
        // The selected node's Block, named on its box.
        const selectedBlock = Option.flatMap(input.selected, id =>
          Option.fromUndefinedOr(document.nodes[id]?.block),
        )
        return h.div(slots.canvas.attrs([h.Role('region'), h.AriaLabel('Page'), h.Tabindex(0)]), [
          h.div(
            slots.frame.attrs([
              h.DataAttribute('viewport', input.viewport),
              // The width is the frame's own; the rule that reads it is `FrameDefaults`.
              h.Style({ '--fk-frame-width': viewportWidths[input.viewport] }),
            ]),
            [
              ...(document.roots.length === 0
                ? [
                    h.p(slots.empty.attrs(), [
                      'This page is empty. Add a block to begin: the palette offers what can go here.',
                    ]),
                  ]
                : []),
              ...Renderer.render(builder.renderer, document, inertHtml, {
                mode: 'edit',
                selected: Option.getOrUndefined(input.selected),
                hovered: Option.getOrUndefined(input.hovered),
                drop: Option.getOrUndefined(dropOf(input.drag)),
                context: input.preview,
                data: input.data,
              }),
            ],
          ),
          // Drawn over the page, placed from where the marked nodes are measured to be;
          // hidden while none is. They only show: they take no pointer.
          h.div(slots.hoverBox.attrs([h.AriaHidden(true)]), []),
          h.div(
            slots.selectionBox.attrs([h.AriaHidden(true)]),
            Option.match(selectedBlock, {
              onNone: () => [],
              onSome: name => [h.span(slots.selectionLabel.attrs(), [labelOf(name)])],
            }),
          ),
        ])
      },
    )

    const Live = Parts.part('Live', { reads: ['announcer'] }, (input, slots, h) =>
      h.div(slots.live.attrs(), [LiveAnnounce.view(input.announcer, h)]),
    )

    return {
      Palette,
      Layers: LayersPart,
      Inspector,
      Toolbar,
      Crumbs,
      Viewports,
      Preview,
      Alert,
      Canvas,
      Live,
    }
  },

  /**
   * A layout of your own: `render` places the parts with `draw`, around
   * anything else you draw with its `h`. Styles and Behaviors attach to the
   * result as to `define`'s.
   */
  assemble: (
    render: SlotView.AssemblyRender<typeof BuilderSlots, BuilderInput, Message>,
  ): BuilderSlotView =>
    Parts.assemble(render, { name: 'Builder' }).pipe(Style.attach(FrameDefaults)),

  /** The Builder drawn with every part, in the default layout. */
  define: (
    builder: BuilderLike,
    options: {
      /** How the inspector's settings forms look. */
      readonly settings?: SettingsLook
    } = {},
  ): BuilderSlotView => {
    const parts = BuilderView.parts(builder, options)
    return BuilderView.assemble((_input, slots, h, draw) =>
      h.div(slots.root.attrs(), [
        draw(parts.Palette),
        draw(parts.Layers),
        draw(parts.Inspector),
        draw(parts.Toolbar),
        draw(parts.Crumbs),
        draw(parts.Viewports),
        draw(parts.Preview),
        draw(parts.Alert),
        draw(parts.Canvas),
        draw(parts.Live),
      ]),
    )
  },
}
