/**
 * Structural accessibility validation. A `Pattern` names the Slots a widget
 * must publish, the capabilities those Slots must satisfy, the events and
 * attributes they must expose, and the obligations something attached must
 * meet on them. `validate` compares a `Slots` contract against a pattern;
 * `check` and `conform` compare an assembled view, its attachments included.
 * All of it is pure and DOM-independent: it checks what was declared, not a
 * rendered tree, so it says the declarations fit together and never that the
 * widget conforms to WCAG.
 */
import type { AttrToken } from './attr.js'
import * as Capability from './capability.js'
import * as Conformed from './conformed.js'
import { DiagnosticError, type Diagnostic } from './diagnostics.js'
import * as MetadataToken from './metadataToken.js'
import type { NamedBehavior } from './behavior.js'
import type { Mixin, MixinFor, MixinMeta, StaticMixin } from './mixin.js'
import type { Any as AnySlot, AttributeName, EventName, SlotCapability } from './slot.js'
import * as SlotViews from './slotView.js'
import type { SlotView } from './slotView.js'

export type A11yDiagnosticCode =
  | 'a11y:missing-slot'
  | 'a11y:hidden-slot'
  | 'a11y:capability-mismatch'
  | 'a11y:missing-event'
  | 'a11y:missing-attribute'
  | 'a11y:unsatisfied-obligation'
  | 'a11y:delegation-unmet'

export interface A11yDiagnostic extends Diagnostic {
  readonly source: 'a11y'
  readonly code: A11yDiagnosticCode
}

/**
 * What a pattern demands be done on a slot, beyond what its contract
 * publishes: something attached must say it does it. Compared by name.
 */
export type Obligation<Name extends string = string> = MetadataToken.MetadataToken<
  'a11y.obligation',
  Name
>

/** Arrow keys, Home and End move among the items. */
export const Navigation: Obligation<'navigation'> = MetadataToken.make(
  'a11y.obligation',
  'navigation',
)
/** Each item is reachable: a roving stop, `aria-activedescendant`, or a native control. */
export const FocusStrategy: Obligation<'focus-strategy'> = MetadataToken.make(
  'a11y.obligation',
  'focus-strategy',
)
/** Enter, Space or a press activates it. */
export const Activation: Obligation<'activation'> = MetadataToken.make(
  'a11y.obligation',
  'activation',
)
/** The element has an accessible name. */
export const Name: Obligation<'name'> = MetadataToken.make('a11y.obligation', 'name')
/** The attribute is written with a value on every draw. */
export const State = <const Attribute extends string>(
  attribute: AttrToken<Attribute>,
): Obligation<`state:${Attribute}`> =>
  MetadataToken.make('a11y.obligation', `state:${attribute.name}` as `state:${Attribute}`)

export interface SlotRequirement {
  readonly capability?: SlotCapability
  readonly events?: ReadonlyArray<EventName>
  readonly attributes?: ReadonlyArray<AttributeName>
  /** What something attached must say it does on the slot; checked by `check` and `conform`. */
  readonly obligations?: ReadonlyArray<Obligation>
  /** An absent slot is expected, not a diagnostic. A present slot is still checked. */
  readonly optional?: boolean
}

export type Requirements = Readonly<Record<string, SlotRequirement>>

export const PatternTypeId: unique symbol = Symbol.for('foldkit-mixins/A11yPattern')

export interface Pattern<Spec extends Requirements = Requirements> {
  readonly [PatternTypeId]: { readonly Requirements: Spec }
  readonly requirements: Spec
}

export const pattern = <const Spec extends Requirements>(spec: Spec): Pattern<Spec> => {
  const requirements = Object.create(null) as Record<string, SlotRequirement>
  for (const name of Object.getOwnPropertyNames(spec)) {
    const requirement = spec[name]
    if (requirement === undefined) continue
    Object.defineProperty(requirements, name, {
      value: Object.freeze({ ...requirement }),
      enumerable: true,
      configurable: false,
      writable: false,
    })
  }
  Object.freeze(requirements)
  return Object.freeze({
    [PatternTypeId]: { Requirements: undefined as unknown as Spec },
    requirements: requirements as Spec,
  }) as Pattern<Spec>
}

const publishes = (
  names: ReadonlyArray<string | MetadataToken.Any>,
  required: string | MetadataToken.Any,
): boolean => {
  const requiredName = MetadataToken.nameOf(required)
  return names.some(name => MetadataToken.nameOf(name) === requiredName)
}

const diagnostic = (
  code: A11yDiagnosticCode,
  message: string,
  slot: string,
  details?: Readonly<Record<string, unknown>>,
): A11yDiagnostic => ({
  source: 'a11y',
  code,
  severity: 'error',
  message,
  slot,
  ...(details === undefined ? {} : { details }),
})

export const validate = (
  pattern: Pattern,
  slots: { readonly [name: string]: AnySlot },
): ReadonlyArray<A11yDiagnostic> => {
  const diagnostics: Array<A11yDiagnostic> = []
  for (const name of Object.getOwnPropertyNames(pattern.requirements)) {
    const requirement = pattern.requirements[name]
    if (requirement === undefined) continue
    if (!Object.hasOwn(slots, name)) {
      if (requirement.optional === true) continue
      diagnostics.push(
        diagnostic(
          'a11y:missing-slot',
          `A11y pattern requires slot "${name}", which the contract does not publish`,
          name,
        ),
      )
      continue
    }
    const slot = slots[name]
    if (slot === undefined) continue
    if (slot.hidden) {
      diagnostics.push(
        diagnostic(
          'a11y:hidden-slot',
          `A11y pattern requires slot "${name}", which is hidden`,
          name,
        ),
      )
      continue
    }
    if (
      requirement.capability !== undefined &&
      !Capability.extendsCapability(slot.capability, requirement.capability)
    ) {
      diagnostics.push(
        diagnostic(
          'a11y:capability-mismatch',
          `A11y pattern requires capability "${MetadataToken.nameOf(requirement.capability)}" on slot "${name}", which has "${MetadataToken.nameOf(slot.capability)}"`,
          name,
          {
            required: MetadataToken.nameOf(requirement.capability),
            actual: MetadataToken.nameOf(slot.capability),
          },
        ),
      )
    }
    for (const event of requirement.events ?? []) {
      const eventName = MetadataToken.nameOf(event)
      if (publishes(slot.events, event)) continue
      diagnostics.push(
        diagnostic(
          'a11y:missing-event',
          `A11y pattern requires event "${eventName}" on slot "${name}", which does not publish it`,
          name,
          { event: eventName },
        ),
      )
    }
    for (const attribute of requirement.attributes ?? []) {
      const attributeName = MetadataToken.nameOf(attribute)
      if (publishes(slot.attributes, attribute)) continue
      diagnostics.push(
        diagnostic(
          'a11y:missing-attribute',
          `A11y pattern requires attribute "${attributeName}" on slot "${name}", which does not publish it`,
          name,
          { attribute: attributeName },
        ),
      )
    }
  }
  return diagnostics
}

export const ProvidesTypeId: unique symbol = Symbol.for('foldkit-mixins/Provides')

/**
 * The type checker's record of `Provides`. A method, so the record is
 * bivariant: a value that supplies more is still accepted where less is
 * declared (an annotated return type, a parameter typed with the default),
 * which then forgets what it supplied rather than refusing it.
 */
interface ProvidesRecord<Provides extends string> {
  provides(names: Provides): void
}

/**
 * What a value supplies, as `` `${slot}/${obligation}` `` names, for the type
 * checker alone: nothing is stored under the key. A view's names are the union
 * of what its attachments supply, and `conform` asks them to cover the
 * pattern's. Run time reads each attachment's `meta` instead, so a type that
 * claims more than its value supplies still fails `conform` when the module loads.
 */
export interface Supplies<Provides extends string> {
  readonly [ProvidesTypeId]?: ProvidesRecord<Provides>
}

type OneOf<T, All = T> = T extends unknown ? ([All] extends [T] ? true : false) : never

/**
 * `` `${Slot}/${Obligation}` `` when `Slot` is one known slot name, for a
 * factory's binder overload to state what it supplies. A slot chosen at run
 * time (a union, `string`) states nothing: the type cannot say which slot the
 * value will name, so only `conform`'s run-time check can judge it.
 */
export type ProvidedOn<Slot extends string, Obligation extends string> = string extends Slot
  ? never
  : OneOf<Slot> extends true
    ? `${Slot}/${Obligation}`
    : never

type ObligationNames<Requirement> = Requirement extends {
  readonly obligations: ReadonlyArray<infer Owed>
}
  ? MetadataToken.NameOf<Owed>
  : never

/**
 * What a pattern owes on the slots of `Slots`. Nothing when the slot names
 * are not known (`Record<string, …>`): such an assembly is checked when the
 * module loads.
 */
export type Owed<Spec, Slots> = string extends keyof Slots
  ? never
  : {
      [K in keyof Spec & keyof Slots & string]: `${K}/${ObligationNames<Spec[K]>}`
    }[keyof Spec & keyof Slots & string]

type Conforms<Spec, Slots, Provides> = [Exclude<Owed<Spec, Slots>, Provides>] extends [never]
  ? unknown
  : { readonly 'a11y:unsatisfied-obligation': Exclude<Owed<Spec, Slots>, Provides> }

type AnyView = SlotView<any, any, any, any>

interface Delegation {
  readonly slots: Readonly<Record<string, ReadonlyArray<string>>>
  readonly to: string
  readonly provider: MixinFor<any>
  readonly providerName: string
}

// Keyed by the Mixin `delegated` made: a delegation composed into another
// Mixin is no longer one, and supplies nothing.
const delegations = new WeakMap<object, Delegation>()

const suppliedOn = (meta: MixinMeta | undefined, slot: string, obligation: string): boolean =>
  meta !== undefined &&
  ((Object.hasOwn(meta.slots, slot) && meta.slots[slot]!.provides.includes(obligation)) ||
    (meta.parts ?? []).some(part => suppliedOn(part.meta, slot, obligation)))

/**
 * What `validate` reports of the view's contract, and every obligation of the
 * pattern on a slot the view publishes that no attachment supplies: an
 * attached Behavior's `provides`, `base`, `native`, or a `delegated` whose
 * provider is attached and supplies it on the slot named. Pure; reads only
 * the attachments' metadata, never the input or the DOM.
 */
export const check = (pattern: Pattern, view: AnyView): ReadonlyArray<A11yDiagnostic> => {
  const slots = view.slots as { readonly [name: string]: AnySlot }
  const mixins: ReadonlyArray<MixinFor<any>> = view.mixins
  const diagnostics = [...validate(pattern, slots)]
  for (const name of Object.getOwnPropertyNames(pattern.requirements)) {
    const obligations = pattern.requirements[name]?.obligations
    // An absent or hidden slot is `validate`'s finding, or optional and owed nothing.
    if (obligations === undefined || !Object.hasOwn(slots, name) || slots[name]!.hidden) continue
    for (const obligation of obligations) {
      const owed = MetadataToken.nameOf(obligation)
      if (mixins.some(mixin => suppliedOn(mixin.meta, name, owed))) continue
      const delegation = mixins
        .map(mixin => delegations.get(mixin))
        .find(
          found =>
            found !== undefined &&
            Object.hasOwn(found.slots, name) &&
            found.slots[name]!.includes(owed),
        )
      if (delegation === undefined) {
        diagnostics.push(
          diagnostic(
            'a11y:unsatisfied-obligation',
            `slot "${name}" owes ${owed}, which nothing attached supplies`,
            name,
            { obligation: owed },
          ),
        )
        continue
      }
      const held = mixins.includes(delegation.provider)
      if (held && suppliedOn(delegation.provider.meta, delegation.to, owed)) continue
      diagnostics.push(
        diagnostic(
          'a11y:delegation-unmet',
          `slot "${name}" delegates ${owed} to "${delegation.providerName}" on slot "${delegation.to}", ${held ? 'which does not supply it there' : 'which the view does not hold'}`,
          name,
          { obligation: owed, provider: delegation.providerName, to: delegation.to },
        ),
      )
    }
  }
  return diagnostics
}

const assertConforms = (pattern: Pattern, view: AnyView): void => {
  const diagnostics = check(pattern, view)
  const first = diagnostics[0]
  if (first === undefined) return
  throw new DiagnosticError({
    ...first,
    message:
      diagnostics.length === 1
        ? first.message
        : `${first.message} (and ${diagnostics.length - 1} more)`,
    details: { ...first.details, diagnostics },
  })
}

/**
 * Refuses a view that does not meet `pattern`. At the type level, a view whose
 * attachments' supplied names do not cover what the pattern owes on its slots
 * is an error naming each `slot/obligation` missing. At run time, where the
 * module loads, `check` runs and the first finding is thrown as a
 * `DiagnosticError` with every finding in `details.diagnostics`. Returns a
 * new view that remembers the pattern, so `SlotView.detach` and
 * `SlotView.replace` check the view they make from it again; the view given is
 * unchanged.
 *
 * @example
 * ```ts
 * const Results = Search.define(render).pipe(
 *   Behavior.attach(Keys),
 *   A11y.conform(Listbox),
 * )
 * ```
 */
export const conform =
  <Spec extends Requirements>(pattern: Pattern<Spec>) =>
  <Slots, Input, Message, Provides extends string = never>(
    view: SlotView<Slots, Input, Message, Provides> & Conforms<Spec, Slots, Provides>,
  ): SlotView<Slots, Input, Message, Provides> => {
    assertConforms(pattern, view)
    // The same view made again, so the one given stays unconformed. Each Mixin
    // already met this view's Message universe when it was first attached.
    const conformed = (view as AnyView).mixins.reduce<AnyView>(
      (built, mixin) => SlotViews.attach(mixin as Mixin<any>)(built),
      SlotViews.define(view.slots, view.render, view.name === undefined ? {} : { name: view.name }),
    )
    Conformed.record(conformed, [
      ...Conformed.conformancesOf(view),
      { pattern, check: next => assertConforms(pattern, next as AnyView) },
    ])
    return conformed
  }

/** A Mixin that contributes nothing and supplies obligations, attached with `SlotView.attach`. */
export interface Supply<Provides extends string> extends StaticMixin<never> {
  readonly [ProvidesTypeId]: ProvidesRecord<Provides>
}

/** Per slot, the obligations supplied there. */
export type SupplySpec = Readonly<Record<string, ReadonlyArray<Obligation>>>

export type SuppliedBy<Spec> = {
  [K in keyof Spec & string]: Spec[K] extends ReadonlyArray<infer Supplied>
    ? `${K}/${MetadataToken.NameOf<Supplied>}`
    : never
}[keyof Spec & string]

const supply = <Provides extends string>(
  name: string,
  spec: SupplySpec,
  provides: boolean,
): Supply<Provides> => {
  const slots: Record<string, MixinMeta['slots'][string]> = Object.create(null)
  if (provides) {
    for (const slot of Object.getOwnPropertyNames(spec)) {
      slots[slot] = Object.freeze({
        requires: Object.freeze({ events: Object.freeze([]), attributes: Object.freeze([]) }),
        provides: Object.freeze((spec[slot] ?? []).map(MetadataToken.nameOf)),
        reads: 'static' as const,
      })
    }
  }
  return Object.freeze({
    name,
    contributions: Object.freeze(Object.create(null)),
    meta: Object.freeze({ kind: 'mixin' as const, slots: Object.freeze(slots) }),
    [ProvidesTypeId]: undefined as unknown as ProvidesRecord<Provides>,
  })
}

/** Obligations the view meets with its own attributes, such as its `aria-label`: the author's word. */
export const base = <const Spec extends SupplySpec>(
  spec: Spec,
  options?: { readonly name?: string },
): Supply<SuppliedBy<Spec>> => supply(options?.name ?? 'A11y.base', spec, true)

/** The HTML elements that are interactive by themselves. */
export type NativeElement =
  | 'a'
  | 'button'
  | 'details'
  | 'input'
  | 'option'
  | 'select'
  | 'summary'
  | 'textarea'

/**
 * Obligations a native element meets by itself on the slots it is drawn as,
 * such as a `<button>`'s activation and focus. Named after the element.
 */
export const native = <const Spec extends SupplySpec>(
  spec: Spec,
  options: { readonly element: NativeElement; readonly name?: string },
): Supply<SuppliedBy<Spec>> => supply(options.name ?? `A11y.native(${options.element})`, spec, true)

type SuppliedOn<Provides, To extends string> = Provides extends `${To}/${infer Supplied}`
  ? Supplied
  : never

/**
 * Obligations met on another slot by an attached Behavior, such as a
 * listbox's navigation by the `ListNavigation` on a combobox's input. Each
 * obligation must be one `provider` supplies on `to`: a type error otherwise,
 * and `a11y:delegation-unmet` from `check` when the view does not hold
 * `provider` or it supplies no such thing there.
 */
export const delegated = <
  const Spec extends Readonly<Record<string, ReadonlyArray<Obligation<SuppliedOn<Provides, To>>>>>,
  ProviderSlots,
  To extends keyof ProviderSlots & string,
  Provides extends string = never,
>(
  spec: Spec,
  options: {
    readonly to: To
    readonly provider: NamedBehavior<ProviderSlots, any, any, Provides>
    readonly name?: string
  },
): Supply<SuppliedBy<Spec>> => {
  const providerName = options.provider.name ?? 'Behavior'
  const made = supply<SuppliedBy<Spec>>(
    options.name ?? `A11y.delegated(${providerName})`,
    spec,
    false,
  )
  const slots: Record<string, ReadonlyArray<string>> = Object.create(null)
  for (const slot of Object.getOwnPropertyNames(spec)) {
    slots[slot] = Object.freeze((spec[slot] ?? []).map(MetadataToken.nameOf))
  }
  delegations.set(made, {
    slots,
    to: options.to,
    provider: options.provider.mixin,
    providerName,
  })
  return made
}
