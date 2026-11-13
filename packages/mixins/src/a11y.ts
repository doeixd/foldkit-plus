/**
 * Structural accessibility validation. A `Pattern` names the Slots a widget
 * must publish, the capabilities those Slots must satisfy, and the events and
 * attributes they must expose. `validate` compares a `Slots` contract against a
 * pattern and reports every mismatch as a `Diagnostic`. Pass a support list and
 * it also reports a present slot whose obligation has no named provider.
 * It is pure and DOM-independent: it checks the contract it is given, not a
 * rendered tree, and it does not certify WCAG conformance.
 */
import * as Capability from './capability.js'
import type { Diagnostic } from './diagnostics.js'
import * as MetadataToken from './metadataToken.js'
import type { Any as AnySlot, AttributeName, EventName, SlotCapability } from './slot.js'

export type A11yDiagnosticCode =
  | 'a11y:missing-slot'
  | 'a11y:hidden-slot'
  | 'a11y:capability-mismatch'
  | 'a11y:missing-event'
  | 'a11y:missing-attribute'
  | 'a11y:unsatisfied-obligation'
  | 'a11y:unnamed-delegation'

export interface A11yDiagnostic extends Diagnostic {
  readonly source: 'a11y'
  readonly code: A11yDiagnosticCode
}

/** What a part must have a provider for. Not a role, and not proof of the handler. */
export const obligationNames = ['navigation', 'focus', 'activation', 'checked'] as const
export type ObligationName = (typeof obligationNames)[number]

const obligationSet = new Set<string>(obligationNames)

export const isObligation = (name: string): name is ObligationName => obligationSet.has(name)

export interface SlotRequirement {
  readonly capability?: SlotCapability
  readonly events?: ReadonlyArray<EventName>
  readonly attributes?: ReadonlyArray<AttributeName>
  /** An absent slot is expected, not a diagnostic. A present slot is still checked. */
  readonly optional?: boolean
  /**
   * Providers a present slot must have. Publishing an event or an attribute
   * does not satisfy one.
   */
  readonly obligations?: readonly ObligationName[]
}

/** Who supplies one obligation. `delegated` names that provider; an empty name is refused. */
export interface ObligationSupport {
  readonly slot: string
  readonly obligation: ObligationName
  readonly by: 'behavior' | 'native' | 'delegated'
  readonly provider: string
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
    const obligations = requirement.obligations
    if (obligations !== undefined) {
      for (const obligation of obligations) {
        if (!isObligation(obligation)) throw new Error(`Unknown obligation: ${obligation}`)
      }
    }
    Object.defineProperty(requirements, name, {
      value: Object.freeze({
        ...requirement,
        ...(obligations === undefined ? {} : { obligations: Object.freeze([...obligations]) }),
      }),
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

const providerName = (provider: string, kind: 'native' | 'delegated'): string => {
  if (provider === '') throw new Error(`A ${kind} obligation names its provider`)
  return provider
}

/** A native control supplies these obligations. `provider` is the element, such as `input`. */
export const native = <const Names extends readonly ObligationName[]>(options: {
  readonly slot: string
  readonly obligations: Names
  readonly provider: string
}): { readonly [I in keyof Names]: ObligationSupport & { readonly obligation: Names[I] } } => {
  const provider = providerName(options.provider, 'native')
  return options.obligations.map(obligation => ({
    slot: options.slot,
    obligation,
    by: 'native' as const,
    provider,
  })) as { readonly [I in keyof Names]: ObligationSupport & { readonly obligation: Names[I] } }
}

/** A named delegate supplies one obligation. The name is the provider, not a role. */
export const delegated = <const Name extends ObligationName>(options: {
  readonly slot: string
  readonly obligation: Name
  readonly provider: string
}): ObligationSupport & { readonly obligation: Name } => ({
  slot: options.slot,
  obligation: options.obligation,
  by: 'delegated',
  provider: providerName(options.provider, 'delegated'),
})

/** The obligations a Behavior declared on its slots. */
export const suppliedBy = (behavior: {
  readonly name?: string | undefined
  readonly spec: object
}): readonly ObligationSupport[] => {
  const provider = behavior.name === undefined || behavior.name === '' ? 'Behavior' : behavior.name
  const spec = behavior.spec as Record<
    string,
    { readonly supplies?: readonly string[] } | undefined
  >
  const support: ObligationSupport[] = []
  for (const slot of Object.getOwnPropertyNames(spec)) {
    const supplies = spec[slot]?.supplies
    if (supplies === undefined) continue
    for (const obligation of supplies) {
      if (!isObligation(obligation)) throw new Error(`Unknown obligation: ${obligation}`)
      support.push({ slot, obligation, by: 'behavior', provider })
    }
  }
  return support
}

const satisfied = (
  support: readonly ObligationSupport[],
  slot: string,
  obligation: string,
): boolean =>
  support.some(item => item.slot === slot && item.obligation === obligation && item.provider !== '')

export const validate = (
  pattern: Pattern,
  slots: { readonly [name: string]: AnySlot },
  support?: readonly ObligationSupport[],
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
    if (support !== undefined && requirement.obligations !== undefined) {
      for (const obligation of requirement.obligations) {
        if (satisfied(support, name, obligation)) continue
        const unnamed = support.find(
          item => item.slot === name && item.obligation === obligation && item.by === 'delegated',
        )
        if (unnamed !== undefined && unnamed.provider === '') {
          diagnostics.push(
            diagnostic(
              'a11y:unnamed-delegation',
              `A delegated obligation "${obligation}" on slot "${name}" names no provider`,
              name,
              { obligation },
            ),
          )
          continue
        }
        diagnostics.push(
          diagnostic(
            'a11y:unsatisfied-obligation',
            `A11y pattern requires obligation "${obligation}" on slot "${name}", and no provider supplies it`,
            name,
            { obligation },
          ),
        )
      }
    }
  }
  return diagnostics
}

type ObligationKey<Spec extends Requirements> = {
  [Slot in keyof Spec]: Spec[Slot] extends { readonly obligations: readonly (infer Name)[] }
    ? Name extends string
      ? `${Slot & string}/${Name}`
      : never
    : never
}[keyof Spec]

type SupportKey<Support> = Support extends {
  readonly slot: infer Slot extends string
  readonly obligation: infer Name extends string
}
  ? `${Slot}/${Name}`
  : never

type MissingKeys<Required, Provided> = Required extends Provided ? never : Required

/** The literal obligations a support list does not cover. */
export interface MissingObligations<Keys extends string> {
  readonly missing: Keys
}

/**
 * Structural validation plus obligations.
 *
 * A literal support list that misses an obligation is a type error. A list
 * typed only as `ObligationSupport[]` is checked when this runs. `validate`
 * without support does not read obligations: a published attribute is not a
 * provider, and neither result is a WCAG claim.
 */
export const bound = <
  const Spec extends Requirements,
  const Support extends readonly ObligationSupport[],
>(
  pattern: Pattern<Spec>,
  slots: { readonly [name: string]: AnySlot },
  support: [ObligationKey<Spec>] extends [never]
    ? Support
    : [MissingKeys<ObligationKey<Spec>, SupportKey<Support[number]>>] extends [never]
      ? Support
      : MissingObligations<MissingKeys<ObligationKey<Spec>, SupportKey<Support[number]>>>,
): ReadonlyArray<A11yDiagnostic> =>
  validate(pattern, slots, support as readonly ObligationSupport[])
