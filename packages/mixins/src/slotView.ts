/**
 * `SlotView` is the structural equivalent of a Surface: a pure Foldkit view
 * that publishes typed Slots and lets Mixins attach without forking it. It
 * owns no state and runs no Effects. Attached Mixins are resolved into
 * ordinary Foldkit attributes per slot, using the view's own `h` so Message
 * capability masking is preserved.
 */
import { createLazy, inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import type { NamedBehavior } from './behavior.js'
import { DiagnosticError } from './diagnostics.js'
import type { SlotContribution, SlotItem } from './contribution.js'
import { ensure } from './inject.js'
import { SLOT_MARK, isMarking } from './slotMark.js'
import {
  evaluate,
  isDynamic,
  type AnyMixin,
  type Mixin,
  type MixinFor,
  type StaticMixin,
} from './mixin.js'
import { pipeSelf, type Pipeable } from './pipe.js'
import { resolve, type SlotAttributes } from './resolver.js'
import type { Any as AnySlot, SlotProtection } from './slot.js'

export type SlotBuilder<Message> = {
  /**
   * The view's base attributes plus every resolved contribution. Pass `item`
   * when the slot is rendered once per item, so a Behavior can decorate each
   * repetition differently.
   */
  readonly attrs: (base?: SlotAttributes<Message>, item?: SlotItem) => SlotAttributes<Message>
}

export type SlotBuilders<Slots, Message> = {
  readonly [K in keyof Slots]: SlotBuilder<Message>
}

export type SlotViewRender<Slots, Input, Message> = (
  input: Input,
  slots: SlotBuilders<Slots, Message>,
  h: HtmlBuilder<Message>,
) => Html

export interface SlotView<Slots, Input, Message> extends Pipeable<SlotView<Slots, Input, Message>> {
  (input: Input, h: HtmlBuilder<Message>): Html
  readonly name?: string
  readonly slots: Slots
  readonly mixins: ReadonlyArray<MixinFor<Message>>
  readonly render: SlotViewRender<Slots, Input, Message>
}

/** Mixins resolved against one input: a part's own against its selection, the view's against the whole. */
interface MixinGroup<Message> {
  readonly mixins: ReadonlyArray<MixinFor<Message>>
  readonly input: unknown
}

// The view's Mixins behind each builders record `buildersFor` makes, so an
// assembly's parts resolve the same ones; the array itself, so a memo can compare it.
const mixinsOf = new WeakMap<object, ReadonlyArray<MixinFor<any>>>()

/** Like `buildersFor`, with each group of Mixins resolved against its own input, in order. */
const buildersOver = <Slots, Message>(
  slots: Slots,
  groups: ReadonlyArray<MixinGroup<Message>>,
  h: HtmlBuilder<Message>,
): SlotBuilders<Slots, Message> => {
  const source = slots as unknown as Record<string, AnySlot>
  const builders: Record<string, SlotBuilder<Message>> = Object.create(null)
  for (const name of Object.getOwnPropertyNames(source)) {
    const slot = source[name]
    if (slot === undefined) continue
    const protection: SlotProtection = slot.protected
    builders[name] = {
      attrs: (base?: SlotAttributes<Message>, item?: SlotItem) => {
        const contributions = []
        for (const { mixins, input } of groups) {
          for (const mixin of mixins) {
            const contribution = mixin.contributions[name]
            if (contribution !== undefined) {
              const evaluated = evaluate(contribution as SlotContribution<Message>, {
                input,
                h,
                ...(item === undefined ? {} : { item }),
              })
              // What this Slot draws brings its CSS, whether or not a stylesheet listed it.
              ensure(evaluated)
              contributions.push(evaluated)
            }
          }
        }
        const resolved = resolve(base, contributions, { slot: name, protected: protection })
        // Only while a test draws with `Inert.draw`: never for a real render.
        return isMarking() ? [...resolved, h.DataAttribute(SLOT_MARK, name)] : resolved
      },
    }
  }
  return builders as SlotBuilders<Slots, Message>
}

/** Build one `attrs` resolver per published slot, evaluating Mixins lazily. */
export const buildersFor = <Slots, Message, Input>(
  slots: Slots,
  mixins: ReadonlyArray<MixinFor<Message>>,
  context: { readonly input: Input; readonly h: HtmlBuilder<Message> },
): SlotBuilders<Slots, Message> => {
  const builders = buildersOver(slots, [{ mixins, input: context.input }], context.h)
  mixinsOf.set(builders, mixins)
  return builders
}

const makeView = <Slots, Input, Message>(
  name: string | undefined,
  slots: Slots,
  mixins: ReadonlyArray<MixinFor<Message>>,
  render: SlotViewRender<Slots, Input, Message>,
): SlotView<Slots, Input, Message> => {
  const view = (input: Input, h: HtmlBuilder<Message>): Html =>
    render(input, buildersFor(slots, mixins, { input, h }), h)
  // A function's own `name` is read-only; define it rather than assigning.
  if (name !== undefined) {
    Object.defineProperty(view, 'name', { value: name, configurable: true })
  }
  return Object.assign(view, {
    slots,
    mixins,
    render,
    pipe: (...fns: ReadonlyArray<(self: unknown) => unknown>) => pipeSelf(view, fns),
  }) as unknown as SlotView<Slots, Input, Message>
}

/**
 * Defines a view over published Slots.
 *
 * `Message` has no anchor but the render callback's builder, so it is inferred
 * from an explicit `h: HtmlBuilder<Message>` annotation on that parameter.
 * Without one it resolves to `unknown`, and the first error appears later and
 * elsewhere — an invariance mismatch at `Style.attach`/`Behavior.attach` that
 * does not name the missing annotation. `forMessages<Message>()` fixes the
 * Message universe up front instead, and leaves `h` contextually typed.
 */
export const define = <Slots, Input, Message>(
  slots: Slots,
  render: SlotViewRender<Slots, Input, Message>,
  options?: { readonly name?: string },
): SlotView<Slots, Input, Message> => makeView(options?.name, slots, [], render)

/**
 * Foldkit's `inertHtml` typed for a Message universe, for rendering a view
 * outside a runtime (tests, demos, static description). `inertHtml` is
 * `HtmlBuilder<never>`, and the builder is invariant in `Message`, so this is
 * the one cast: sound because inert handlers are never dispatched.
 */
export const inertBuilder = <Message>(): HtmlBuilder<Message> =>
  inertHtml as unknown as HtmlBuilder<Message>

/** The `SlotView` constructors with `Message` already fixed. */
export interface MessageSlotView<Message> {
  readonly define: <Slots, Input>(
    slots: Slots,
    render: SlotViewRender<Slots, Input, Message>,
    options?: { readonly name?: string },
  ) => SlotView<Slots, Input, Message>
}

/**
 * Binds the view constructors to one Message universe, so the render callback
 * no longer has to annotate `h` to pin it. `Input` is still inferred from the
 * callback's own `input` annotation.
 *
 * @example
 * ```ts
 * const Field = SlotView.forMessages<Message>().define(
 *   FieldSlots,
 *   (input: FieldInput, slots, h) =>
 *     h.input(slots.input.attrs([h.OnInput(value => Message.ChangedValue({ value }))])),
 * )
 * ```
 */
export const forMessages = <Message>(): MessageSlotView<Message> => ({ define })

/** A transform on any view, used by Message-free static mixins such as Style. */
export type SlotViewTransform = <Slots, Input, Message>(
  view: SlotView<Slots, Input, Message>,
) => SlotView<Slots, Input, Message>

/** A transform restricted to one Message universe, for Behavior mixins. */
export type SlotViewTransformFor<Message> = <Slots, Input>(
  view: SlotView<Slots, Input, Message>,
) => SlotView<Slots, Input, Message>

/** Attach one Mixin. Returns a new view; the original is unchanged. */
export function attach(mixin: StaticMixin<never> | Mixin<never>): SlotViewTransform
export function attach<MixinMessage>(mixin: Mixin<MixinMessage>): SlotViewTransformFor<MixinMessage>
export function attach(mixin: AnyMixin | Mixin<never>): any {
  return (view: SlotView<any, any, any>) =>
    makeView(view.name, view.slots, [...view.mixins, mixin], view.render)
}

/**
 * One piece of an assembled view, drawn from its own selection of the view's
 * input: the keys it names in `reads`, and nothing else. It is drawn again
 * only when one of those values changed, by identity.
 */
export interface Part<Slots, Input, Message> {
  readonly name: string
  readonly reads: ReadonlyArray<keyof Input>
  /** The Behaviors declared with the part, resolved against its selection. */
  readonly mixins: ReadonlyArray<MixinFor<Message>>
  // `any`: the part's own selection, which `Parts.part` typed from `reads`.
  readonly render: (
    input: any,
    slots: SlotBuilders<Slots, Message>,
    h: HtmlBuilder<Message>,
  ) => Html
}

/** An assembly's own drawing: the parts it places, by `draw`, and anything else around them. */
export type AssemblyRender<Slots, Input, Message> = (
  input: Input,
  slots: SlotBuilders<Slots, Message>,
  h: HtmlBuilder<Message>,
  draw: (part: Part<Slots, Input, Message>) => Html,
) => Html

export interface Parts<Slots, Input, Message> {
  /**
   * A part reading `reads` of the input. `behaviors` are declared over that
   * selection, so they cannot read what the part does not redraw for.
   */
  readonly part: <const Reads extends ReadonlyArray<keyof Input>>(
    name: string,
    options: {
      readonly reads: Reads
      readonly behaviors?: ReadonlyArray<NamedBehavior<Slots, Pick<Input, Reads[number]>, Message>>
    },
    render: (
      input: Pick<Input, Reads[number]>,
      slots: SlotBuilders<Slots, Message>,
      h: HtmlBuilder<Message>,
    ) => Html,
  ) => Part<Slots, Input, Message>
  /**
   * A SlotView that draws its parts where `render` places them. Styles and
   * Behaviors attach to it as to any SlotView and reach every part's Slots.
   */
  readonly assemble: (
    render: AssemblyRender<Slots, Input, Message>,
    options?: { readonly name?: string },
  ) => SlotView<Slots, Input, Message>
}

// A part's memo; one per part, since a part is drawn at one place.
const lazies = new WeakMap<object, ReturnType<typeof createLazy>>()
const lazyOf = (part: object): ReturnType<typeof createLazy> => {
  const known = lazies.get(part)
  if (known !== undefined) return known
  const made = createLazy()
  lazies.set(part, made)
  return made
}

// Whether any of these Mixins reads the input: a function contribution may.
const readsInput = new WeakMap<ReadonlyArray<MixinFor<any>>, boolean>()
const anyDynamic = (mixins: ReadonlyArray<MixinFor<any>>): boolean => {
  const known = readsInput.get(mixins)
  if (known !== undefined) return known
  const found = mixins.some(mixin => Object.values(mixin.contributions).some(isDynamic))
  readsInput.set(mixins, found)
  return found
}

/**
 * One part, from its arguments alone, so the memo sees one function: the
 * whole input only when a view-wide Mixin reads it, and the part's read values.
 */
const drawPart = <Slots, Input, Message>(
  part: Part<Slots, Input, Message>,
  slots: Slots,
  h: HtmlBuilder<Message>,
  mixins: ReadonlyArray<MixinFor<Message>>,
  whole: unknown,
  ...values: Array<unknown>
): Html => {
  const selection = Object.fromEntries(part.reads.map((key, at) => [key, values[at]]))
  const groups = [
    { mixins: part.mixins, input: selection },
    { mixins, input: whole },
  ]
  return part.render(selection, buildersOver(slots, groups, h), h)
}

/**
 * Parts over one set of Slots and one input, and the assembly that places them.
 *
 * @example
 * ```ts
 * const Parts = SlotView.parts(PanelSlots)<PanelInput, Message>()
 * const Title = Parts.part('Title', { reads: ['title'] }, (input, slots, h) =>
 *   h.h2(slots.title.attrs(), [input.title]),
 * )
 * const Panel = Parts.assemble((input, slots, h, draw) => h.section(slots.root.attrs(), [draw(Title)]))
 * ```
 */
export const parts =
  <Slots>(slots: Slots) =>
  <Input, Message>(): Parts<Slots, Input, Message> => ({
    part: (name, options, render) => ({
      name,
      reads: options.reads,
      mixins: (options.behaviors ?? []).map(behavior => behavior.mixin),
      render,
    }),
    assemble: (render, options) =>
      makeView<Slots, Input, Message>(options?.name, slots, [], (input, builders, h) => {
        const mixins: ReadonlyArray<MixinFor<Message>> = mixinsOf.get(builders) ?? []
        // A Mixin attached to the whole view that reads the input is resolved
        // against all of it, so a part it reaches redraws whenever the input changes.
        const whole = anyDynamic(mixins) ? input : undefined
        const drawn = new Set<Part<Slots, Input, Message>>()
        return render(input, builders, h, part => {
          // A cached drawing placed twice would be patched as one element in two places.
          if (drawn.has(part))
            throw new DiagnosticError({
              source: 'mixins',
              code: 'mixins:part-drawn-twice',
              severity: 'error',
              message: `Part "${part.name}" is drawn twice in one render; a part has one place`,
            })
          drawn.add(part)
          const args: Parameters<typeof drawPart<Slots, Input, Message>> = [
            part,
            slots,
            h,
            mixins,
            whole,
            ...part.reads.map(key => input[key]),
          ]
          try {
            return lazyOf(part)(drawPart<Slots, Input, Message>, args)
          } catch {
            // No runtime frame to memoize under (a test, a server's first pass).
            return drawPart(...args)
          }
        })
      }),
  })
