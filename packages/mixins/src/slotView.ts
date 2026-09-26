/**
 * `SlotView` is the structural equivalent of a Surface: a pure Foldkit view
 * that publishes typed Slots and lets Mixins attach without forking it. It
 * owns no state and runs no Effects. Attached Mixins are resolved into
 * ordinary Foldkit attributes per slot, using the view's own `h` so Message
 * capability masking is preserved.
 */
import { createKeyedLazy, createLazy, inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import type { NamedBehavior } from './behavior.js'
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

export type SlotBuilder<Message, Slots = unknown> = {
  /**
   * The view's base attributes plus every resolved contribution. Pass `item`
   * when the slot is rendered once per item, so a Behavior can decorate each
   * repetition differently.
   */
  readonly attrs: (base?: SlotAttributes<Message>, item?: SlotItem) => SlotAttributes<Message>
  /**
   * One item's drawing, drawn again only when `args` changed by identity or
   * what the Mixins gave the Slots it used for this item changed in value.
   * `draw` must read nothing but its arguments, so pass a function defined
   * once, not a closure made per render. Keyed by `item.id`, else its index.
   */
  readonly lazy: <const Args extends ReadonlyArray<unknown>>(
    item: SlotItem,
    draw: (slots: SlotBuilders<Slots, Message>, h: HtmlBuilder<Message>, ...args: Args) => Html,
    args: Args,
  ) => Html
}

export type SlotBuilders<Slots, Message> = {
  readonly [K in keyof Slots]: SlotBuilder<Message, Slots>
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
        using?.add(name)
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
      lazy: (item, draw, args) =>
        drawItem(item, draw, args, {
          builders: builders as SlotBuilders<Slots, Message>,
          h,
          given: used =>
            used.flatMap(slot =>
              groups.flatMap(({ mixins, input }) =>
                mixins.flatMap(mixin => {
                  // As `attrs` reads it: a `Mixin<never>` only ever gives message-free data.
                  const contribution = mixin.contributions[slot] as
                    SlotContribution<Message> | undefined
                  return contribution !== undefined && isDynamic(contribution)
                    ? [contribution({ input, h, item })]
                    : []
                }),
              ),
            ),
          first: name,
        }),
    }
  }
  return builders as SlotBuilders<Slots, Message>
}

// The Slots the per-item drawing now running has used, if one is, and whether
// it drew another inside it.
const NESTED = Symbol('nested')
let using: Set<string | typeof NESTED> | undefined

/** One `draw`'s items: their memo, the Slots each used, and what those were given. */
interface ItemMemo {
  readonly lazy: ReturnType<typeof createKeyedLazy>
  readonly used: Map<PropertyKey, ReadonlyArray<string | typeof NESTED>>
  readonly given: Map<PropertyKey, unknown>
}
const itemMemos = new WeakMap<object, ItemMemo>()
const itemMemoOf = (draw: object): ItemMemo => {
  const known = itemMemos.get(draw)
  if (known !== undefined) return known
  const made = { lazy: createKeyedLazy(), used: new Map(), given: new Map() }
  itemMemos.set(draw, made)
  return made
}

// The drawing a missed item runs: set just before the memo is asked, so the
// memo sees one function whose arguments are all it compares.
let pending: (() => Html) | undefined
const runPending = (..._compared: ReadonlyArray<unknown>): Html => pending!()

// How many memoized drawings have started. Foldkit's lazy slot throws before
// it calls the drawing when there is no runtime frame, so a throw with this
// unchanged is that, and a throw after it moved is the drawing's own error.
let started = 0

/**
 * `memoized()` under a lazy slot, or `plain()` where there is no runtime frame
 * to memoize under (a test, a server's first pass). An error from the drawing
 * itself is thrown as it is, not drawn a second time.
 */
const memoizedOr = (memoized: () => Html, plain: () => Html): Html => {
  const before = started
  try {
    return memoized()
  } catch (error) {
    if (started !== before) throw error
    return plain()
  }
}

const isPlain = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null || Array.isArray(value)
}

/**
 * Whether two evaluated contributions hold the same data: arrays and plain
 * objects (Foldkit's attributes and Messages are) by value, anything else by
 * identity, since a `Map` or a `Date` keeps its contents where `Object.keys`
 * does not see them. A handler made per render is never the same, so an item
 * a Mixin gives one is drawn again every time: correct, not cached.
 */
const sameData = (left: unknown, right: unknown, depth = 0): boolean => {
  if (Object.is(left, right)) return true
  if (depth > 8) return false
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null)
    return false
  if (!isPlain(left) || Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every(
    key =>
      Object.hasOwn(right, key) &&
      sameData(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        depth + 1,
      ),
  )
}

const drawItem = <Slots, Message, Args extends ReadonlyArray<unknown>>(
  item: SlotItem,
  draw: (slots: SlotBuilders<Slots, Message>, h: HtmlBuilder<Message>, ...args: Args) => Html,
  args: Args,
  context: {
    readonly builders: SlotBuilders<Slots, Message>
    readonly h: HtmlBuilder<Message>
    readonly given: (used: ReadonlyArray<string>) => ReadonlyArray<unknown>
    readonly first: string
  },
): Html => {
  // Inside another item's drawing, drawn in place, and the outer one is not
  // cached: its key would read this one's Slots with the outer item.
  if (using !== undefined) {
    using.add(NESTED)
    return draw(context.builders, context.h, ...args)
  }
  const memo = itemMemoOf(draw)
  const key = item.id ?? item.index
  const run = (): Html => {
    started++
    using = new Set()
    try {
      const html = draw(context.builders, context.h, ...args)
      memo.used.set(key, [...using])
      return html
    } finally {
      using = undefined
    }
  }
  const used = memo.used.get(key) ?? [context.first]
  if (used.includes(NESTED)) return run()
  const now = context.given(used.filter(slot => slot !== NESTED))
  const before = memo.given.get(key)
  // The same data keeps the value last compared, so the memo sees it unchanged.
  const given = before !== undefined && sameData(before, now) ? before : now
  memo.given.set(key, given)
  pending = run
  try {
    return memoizedOr(() => memo.lazy(key, runPending, [draw, given, ...args]), run)
  } finally {
    pending = undefined
  }
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

// A part's memo. A part drawn twice in one render is the same drawing twice,
// which Foldkit copies for the second place.
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
  started++
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
        return render(input, builders, h, part => {
          const args: Parameters<typeof drawPart<Slots, Input, Message>> = [
            part,
            slots,
            h,
            mixins,
            whole,
            ...part.reads.map(key => input[key]),
          ]
          return memoizedOr(
            () => lazyOf(part)(drawPart<Slots, Input, Message>, args),
            () => drawPart(...args),
          )
        })
      }),
  })
