/**
 * Binds a Surface's projected Model and Message subset to a SlotView.
 *
 * The renderer's input is the Surface's projected Model, so Style and Behavior
 * contributions can only read what the Surface projects. Its builder is typed
 * with the Surface's Message subset, so a Behavior cannot emit a Message the
 * Surface does not expose. The returned value is an ordinary `SlotView`, so the
 * core attach/pipe algebra applies unchanged.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Surface, type MetadataSummary, type Renderer } from 'foldkit-surface'
import { Slots, SlotView, type SlotViewRender, type ViewDescription } from 'foldkit-mixins'

export const define = <Root, Model, Message, Params, Slots_>(
  surface: Surface<Root, Model, Message, Params>,
  slots: Slots_,
  render: SlotViewRender<Slots_, Model, Message>,
  options?: { readonly name?: string },
): SlotView.SlotView<Slots_, Model, Message> =>
  SlotView.define<Slots_, Model, Message>(slots, render, {
    name: options?.name ?? surface.name,
  })

/**
 * `SlotView.over` with the input the Surface's projected Model and the Message
 * universe the subset it exposes, both read from `surface`, so nothing is
 * annotated. Its `define` names the view after the Surface unless told otherwise.
 */
export const over = <Root, Model, Message, Params, Slots_>(
  surface: Surface<Root, Model, Message, Params>,
  slots: Slots_,
): SlotView.Bound<Slots_, Model, Message> =>
  Object.freeze({
    ...SlotView.over(slots)<Model, Message>(),
    define: (
      render: SlotViewRender<Slots_, Model, Message>,
      options?: { readonly name?: string },
    ) => define(surface, slots, render, options),
  })

/**
 * Adapts a SlotView to a Surface renderer. `Surface.view` hands a renderer a
 * `ViewBuilder` — the real builder with its `MessageUniverse` phantom removed —
 * and this is the matching boundary cast, sound because the renderer only
 * constructs the Surface's Message subset.
 */
export const toRenderer =
  <Slots_, Model, Message>(
    view: SlotView.SlotView<Slots_, Model, Message>,
  ): Renderer<Model, Message> =>
  (model, h) =>
    view(model, h as unknown as HtmlBuilder<Message>)

/**
 * Renders a SlotView for `surface`'s projection of `root` with an inert
 * builder: no runtime, so handlers are built but never dispatched. For demos,
 * tests, and static output.
 */
export const render = <Root, Model, Message, Params, Slots_>(
  view: SlotView.SlotView<Slots_, Model, Message>,
  surface: Surface<Root, Model, Message, Params>,
  params: Params,
  root: Root,
): Html =>
  Surface.rootView(surface, params, toRenderer(view))(root, SlotView.inertBuilder<Message>())

export interface SurfaceViewInspection {
  /** The SlotView's name, defaulted from the Surface's name. */
  readonly name: string
  readonly slots: ReturnType<typeof Slots.describe>['slots']
  readonly mixins: ReadonlyArray<string>
}

/**
 * Serializable metadata for DevTools and docs: the published slots and the
 * names of the attached Mixins, with no functions.
 *
 * @deprecated Use `SlotView.describe`, or `SurfaceView.describe` with a
 * Surface: they add each attachment's requirements and contributions. This
 * stays for one release.
 */
export const inspect = <Slots_, Model, Message>(
  view: SlotView.SlotView<Slots_, Model, Message>,
): SurfaceViewInspection => ({
  name: view.name ?? '',
  slots: Slots.describe(view.slots as unknown as Parameters<typeof Slots.describe>[0]).slots,
  mixins: view.mixins.map(mixin => mixin.name),
})

/** Reads the tag off a Foldkit Message constructor without constructing one. */
const constructorTag = (constructor: unknown): string => {
  const literal = (constructor as { fields?: { _tag?: { ast?: { literal?: unknown } } } }).fields
    ?._tag?.ast?.literal
  if (typeof literal === 'string') return literal
  const name = (constructor as { readonly name?: unknown }).name
  return typeof name === 'string' ? name : 'unknown'
}

export interface SurfaceViewDescription {
  readonly name: string
  readonly observes: ReturnType<typeof Surface.inspect>['dependencies']
  readonly metadata: ReadonlyArray<MetadataSummary>
  /** Emitted Message tags, not constructors, so the value stays serializable. */
  readonly emits: ReadonlyArray<string>
  readonly slots: ViewDescription['slots']
  /** Each attachment in order, with what it requires and contributes per slot. */
  readonly attachments: ViewDescription['attachments']
  readonly findings: ViewDescription['findings']
  /** The attachments' names; `attachments` has them and more. */
  readonly mixins: ReadonlyArray<string>
}

/**
 * One serializable description of a Surface and the SlotView that renders it:
 * what it observes and may emit, and where Style/Behavior attach. No functions,
 * so it can be committed, diffed, or handed to DevTools and agent tooling.
 */
export const describe = <Root, Model, Message, Params, Slots_>(
  surface: Surface<Root, Model, Message, Params>,
  params: Params,
  view: SlotView.SlotView<Slots_, Model, Message>,
): SurfaceViewDescription => {
  const inspection = Surface.inspect(surface, params)
  const ui = SlotView.describe(view)
  return {
    name: ui.name === '' ? inspection.name : ui.name,
    observes: inspection.dependencies,
    metadata: inspection.metadata,
    emits: inspection.emits.map(constructorTag),
    slots: ui.slots,
    attachments: ui.attachments,
    findings: ui.findings,
    mixins: ui.attachments.map(attachment => attachment.name),
  }
}

/** Deterministic Markdown for a description; stable key order, no timestamps. */
export const toMarkdown = (description: SurfaceViewDescription): string => {
  const lines: string[] = [`# ${description.name}`, '', '## Observes', '']
  for (const path of description.observes) lines.push(`- \`${path.join('.')}\``)
  lines.push('', '## May emit', '')
  for (const tag of description.emits) lines.push(`- \`${tag}\``)
  lines.push('', SlotView.toMarkdown(description))
  return lines.join('\n')
}
