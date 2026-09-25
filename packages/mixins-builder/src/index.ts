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
import { Layers, Message, layersArgs, type Model } from 'foldkit-builder'
import {
  Catalog,
  Composition,
  NodeId,
  type AnyBlock,
  type Document,
  type Position,
} from 'foldkit-composition'
import { NODE_ATTRIBUTE, Renderer } from 'foldkit-composition/foldkit'
import { Entity } from 'foldkit-entity'
import { Input, type Control } from 'foldkit-form'
import { Metadata } from 'foldkit-metadata'
import { Behavior, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { LiveAnnounce, Targets, TreeNavigation } from 'foldkit-primitives/interaction'
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
  tree: Slot.make({ capability: Capability.Interactive }),
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
  return rows
}

/** The DOM id a layer row carries, so keyboard focus can find it. */
export const layerId = (builder: { readonly name: string }, id: string): string =>
  `${builder.name}-layer-${id}`

const asNodeId = (id: string | null): NodeId | null =>
  id === null || id === '' ? null : NodeId.make(id)

/** The fields a Block's props Schema declares, when it is a struct. */
const fieldsOf = (block: AnyBlock): Readonly<Record<string, Schema.Top>> => {
  const fields = (block.Props as { readonly fields?: unknown }).fields
  return typeof fields === 'object' && fields !== null
    ? (fields as Readonly<Record<string, Schema.Top>>)
    : {}
}

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

/** The drawn Builder: what `BuilderView.define` returns. */
export type BuilderSlotView = SlotView.SlotView<typeof BuilderSlots, Model, Message>

export const BuilderView = {
  /**
   * Block metadata: the control the inspector draws a prop with, where its
   * Schema alone does not say, as
   * `Heading.pipe(Block.annotate(BuilderView.controls({ text: Input.multiline() })))`.
   * `Input.hidden()` leaves a prop out of the inspector.
   */
  controls: (controls: Readonly<Record<string, Control>>): Metadata => controlsKey.of(controls),

  /** The drawn Builder as a Submodel view, for `bundle.pipe(Bundle.withView(...))`. */
  submodel: (view: BuilderSlotView): Submodel.View<Model, Message, void> =>
    Submodel.defineView<Model, Message>((model, h) => view(model, h)),

  /**
   * The Builder drawn, as a `SlotView` over the Builder's Model. Style and
   * extend it through `BuilderSlots` like any other SlotView; its Behaviors
   * (the layers' keyboard, the canvas's pointer, the shortcuts) are attached.
   */
  define: (builder: BuilderLike) => {
    const draw = (
      model: Model,
      slots: SlotView.SlotBuilders<typeof BuilderSlots, Message>,
      h: HtmlBuilder<Message>,
    ): Html => {
      const document = builder.document(model)
      const selected = model.selected
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
                h.AriaSelected(row.id === selected),
                h.OnClick(Message.Selected({ id: NodeId.make(row.id) })),
              ],
              { index, id: row.id },
            ),
            [`${known ? '' : '? '}${node?.block ?? row.id}`],
          )
        }),
      )
      const layers = h.section(slots.layers.attrs([h.AriaLabel('Layers')]), [tree])

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

      const canvas = h.div(slots.canvas.attrs([h.AriaLabel('Page')]), [
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
        ...(model.refused === null
          ? []
          : [h.p(slots.alert.attrs([h.Role('alert')]), [model.refused.message])]),
        canvas,
        h.div(slots.live.attrs(), [LiveAnnounce.view(model.announcer, h)]),
      ])
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
        return h.div(slots.inspector.attrs([h.AriaLabel('Properties')]), [
          'This block is not in this version of the application, so its settings cannot be edited here.',
        ])
      const set = (key: string, value: Schema.Json): Message =>
        Message.Applied({ op: Composition.Op.setProp(id, key, value) })
      const drawn = Object.entries(fieldsOf(block)).flatMap(([key, schema]) => {
        const control = controlFor(block, key, schema)
        return control !== undefined && Input.Hidden.is(control) ? [] : [{ key, schema, control }]
      })
      const fields = drawn.map(({ key, schema, control }) => {
        const fieldId = `${builder.name}-${id}-${key}`
        const value = node.props[key]
        const input = (() => {
          if (control !== undefined && Input.Toggle.is(control))
            return h.input(
              slots.control.attrs([
                h.Id(fieldId),
                h.Type('checkbox'),
                h.Checked(value === true),
                h.OnClick(set(key, value !== true)),
              ]),
            )
          if (control !== undefined && Input.Select.is(control))
            return h.select(
              slots.control.attrs([h.Id(fieldId), h.OnChange(choice => set(key, choice))]),
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
                  set(
                    key,
                    Number.isFinite(Number(text)) && text.trim() !== '' ? Number(text) : text,
                  ),
                ),
              ]),
            )
          const text = [
            h.Id(fieldId),
            h.Value(typeof value === 'string' ? value : ''),
            h.OnInput((typed: string) => set(key, typed)),
          ]
          if (control !== undefined && Input.Multiline.is(control))
            // A textarea's attributes exclude `InnerHTML`, which a slot's type admits
            // and these never carry.
            return h.textarea(slots.control.attrs(text) as Parameters<typeof h.textarea>[0])
          if (control !== undefined && Input.Text.is(control))
            return h.input(slots.control.attrs(text))
          // A kind this inspector does not draw is shown, not edited.
          return h.code(slots.control.attrs([h.Id(fieldId)]), [JSON.stringify(value ?? null)])
        })()
        return h.div(slots.field.attrs(), [
          h.label([h.For(fieldId)], [labelFor(key, schema)]),
          input,
        ])
      })
      return h.div(slots.inspector.attrs([h.AriaLabel('Properties')]), fields)
    }

    return SlotView.forMessages<Message>()
      .define(BuilderSlots, (model: Model, slots, h) => draw(model, slots, h), {
        name: 'Builder',
      })
      .pipe(
        Behavior.attach(
          TreeNavigation.behavior(Layers, layersArgs)(BuilderSlots)<Model, Message>({
            container: 'tree',
            item: 'row',
            rows: model => rowsOf(builder.document(model)),
            domId: id => layerId(builder, id),
          }),
        ),
        Behavior.attach(
          Targets.behavior(BuilderSlots)<Model, Message>({
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
        Behavior.attach(
          Behavior.forSlots(BuilderSlots)<Model, Message>(
            {
              layers: Behavior.slot({
                attributes: ({
                  input,
                  h,
                }: {
                  readonly input: Model
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
