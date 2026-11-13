/**
 * A serializable description of an assembled widget: its public slots, the
 * attachments on them in order, and the pattern obligations it claims.
 *
 * What a closure reads stays unknown. Passing `input` resolves the attributes
 * a Behavior would contribute and nothing else: Mounts are not called, the
 * view is not drawn, and no Message is dispatched. A Surface contract or an
 * Action contributes only its kind and name.
 */
import { Option } from 'effect'
import type { Contract } from 'foldkit-surface'
import * as A11y from './a11y.js'
import { isChildAttribute, isTagged } from './attribute.js'
import type { NamedBehavior } from './behavior.js'
import type { StaticContribution } from './contribution.js'
import type { A11yDiagnostic } from './a11y.js'
import { attributeNameOf, eventNameOf, isUnknownHandler } from './foldkitNames.js'
import * as MetadataToken from './metadataToken.js'
import * as Mixin from './mixin.js'
import type { MixinFor } from './mixin.js'
import * as Slot from './slot.js'
import type { Any as AnySlot, UnnamedSlot } from './slot.js'
import * as Slots from './slots.js'
import * as SlotView from './slotView.js'
import type { NamedStyle } from './style.js'

/** A link whose identity already exists: a Surface contract's kind and name, or an Action's name. */
export type LinkSource =
  | { readonly kind: string; readonly name: string }
  | { readonly _tag: 'Action'; readonly name: string }
  | Contract

export interface KnownLink {
  readonly kind: string
  readonly name: string
}

export interface PatternRef {
  readonly name: string
  readonly pattern: A11y.Pattern
}

/** What one attachment does to one slot. Arrays are resolved claims; `'unknown'` was not resolved. */
export interface SlotAttachment {
  readonly slot: string
  /** `'unknown'` for a function of input: which fields it reads is not extracted. */
  readonly reads: 'unknown' | 'none'
  readonly events: ReadonlyArray<string> | 'unknown'
  readonly attributes: ReadonlyArray<string> | 'unknown'
  /** Whether a Mount callback was declared. `'unknown'` when the contribution was not opened. */
  readonly mount: boolean | 'unknown'
}

export interface Attachment {
  readonly order: number
  readonly name: string
  readonly kind: 'behavior' | 'style' | 'mixin'
  readonly slots: ReadonlyArray<SlotAttachment>
}

export interface Obligation {
  readonly pattern: string
  readonly slot: string
  readonly capability?: string
  readonly events: ReadonlyArray<string>
  readonly attributes: ReadonlyArray<string>
  readonly obligations: ReadonlyArray<string>
  readonly optional: boolean
}

export interface ContributionConflict {
  readonly code: 'mixins:event-conflict' | 'mixins:attribute-conflict'
  readonly slot: string
  /** The DOM event or the normalized attribute name. */
  readonly name: string
  readonly contributors: readonly [string, string]
}

export interface SlotInfo {
  readonly name: string
  readonly capability: string
  readonly events: ReadonlyArray<string>
  readonly attributes: ReadonlyArray<string>
  readonly requirements: ReadonlyArray<string>
}

export interface Description {
  readonly name: string
  readonly slots: ReadonlyArray<SlotInfo>
  readonly attachments: ReadonlyArray<Attachment>
  readonly obligations: ReadonlyArray<Obligation>
  readonly patternDiagnostics: ReadonlyArray<A11yDiagnostic>
  readonly links: ReadonlyArray<KnownLink>
  readonly conflicts: ReadonlyArray<ContributionConflict>
  readonly parts: ReadonlyArray<Description>
}

export interface AssemblySource {
  readonly name: string
  readonly view?: SlotView.SlotView<any, any, any>
  readonly slots?: { readonly [key: string]: AnySlot | UnnamedSlot }
  readonly behaviors?: ReadonlyArray<NamedBehavior<any, any, any>>
  readonly styles?: ReadonlyArray<NamedStyle<any>>
  readonly pattern?: PatternRef
  readonly links?: ReadonlyArray<LinkSource>
  readonly parts?: ReadonlyArray<AssemblySource>
  /** Resolve Behavior attributes against this input. Omit it to leave their claims unknown. */
  readonly input?: unknown
}

const isActionLink = (
  link: LinkSource,
): link is { readonly _tag: 'Action'; readonly name: string } =>
  // tag-check: open — an Action is another package's value; a contract has no tag.
  Object.hasOwn(link, '_tag') && (link as { readonly _tag?: unknown })._tag === 'Action'

const linkOf = (link: LinkSource): KnownLink =>
  isActionLink(link) ? { kind: 'action', name: link.name } : { kind: link.kind, name: link.name }

const claimsFrom = (
  attributes: ReadonlyArray<unknown>,
): { readonly events: ReadonlyArray<string>; readonly attributes: ReadonlyArray<string> } => {
  const events = new Set<string>()
  const names = new Set<string>()
  const visit = (value: unknown): void => {
    if (isChildAttribute(value)) {
      visit(value.attribute)
      return
    }
    if (!isTagged(value)) return
    const tag = value._tag
    // Class, style, and mounts are not event or attribute owners.
    if (tag === 'Class' || tag === 'Style' || tag === 'OnMount' || tag === 'OnUnmount') return
    if (isUnknownHandler(tag)) return
    const event = eventNameOf(tag, value)
    if (Option.isSome(event)) {
      events.add(event.value)
      return
    }
    names.add(attributeNameOf(tag, value))
  }
  for (const attribute of attributes) visit(attribute)
  return { events: [...events], attributes: [...names] }
}

const emptyClaims = {
  events: [] as ReadonlyArray<string>,
  attributes: [] as ReadonlyArray<string>,
}

const behaviorSlots = (
  behavior: NamedBehavior<any, any, any>,
  input: unknown,
  resolve: boolean,
): ReadonlyArray<SlotAttachment> => {
  const slots: Array<SlotAttachment> = []
  for (const [slot, options] of Object.entries(behavior.spec)) {
    if (options === undefined) continue
    const dynamic = options.attributes !== undefined
    if (!resolve || options.attributes === undefined) {
      slots.push({
        slot,
        reads: dynamic ? 'unknown' : 'none',
        events: dynamic ? 'unknown' : [],
        attributes: dynamic ? 'unknown' : [],
        mount: options.mount !== undefined,
      })
      continue
    }
    const produced = options.attributes({ input, h: SlotView.inertBuilder() })
    const claims = claimsFrom(produced)
    slots.push({
      slot,
      reads: 'unknown',
      events: claims.events,
      attributes: claims.attributes,
      mount: options.mount !== undefined,
    })
  }
  return slots
}

const styleSlots = (style: NamedStyle<any>, resolve: boolean): ReadonlyArray<SlotAttachment> => {
  const slots: Array<SlotAttachment> = []
  for (const [slot, contribution] of Object.entries(style.mixin.contributions)) {
    if (contribution === undefined) continue
    if (!Mixin.isDynamic(contribution)) {
      slots.push({ slot, reads: 'none', ...emptyClaims, mount: false })
      continue
    }
    // Which fields the predicate reads stays unknown. Resolving only drops the
    // 'unknown' claim marker; the classes themselves are not part of the description.
    slots.push({
      slot,
      reads: 'unknown',
      events: resolve ? [] : 'unknown',
      attributes: resolve ? [] : 'unknown',
      mount: 'unknown',
    })
  }
  return slots
}

const staticSlots = (mixin: MixinFor<any>): ReadonlyArray<SlotAttachment> => {
  const slots: Array<SlotAttachment> = []
  for (const [slot, contribution] of Object.entries(mixin.contributions)) {
    if (contribution === undefined) continue
    if (Mixin.isDynamic(contribution)) {
      // Opening it would run a Behavior's Mount callback. Leave the claims unknown.
      slots.push({
        slot,
        reads: 'unknown',
        events: 'unknown',
        attributes: 'unknown',
        mount: 'unknown',
      })
      continue
    }
    const body = contribution as StaticContribution<never>
    const claims = claimsFrom(body.attributes ?? [])
    slots.push({
      slot,
      reads: 'none',
      events: claims.events,
      attributes: claims.attributes,
      mount: (body.mounts?.length ?? 0) > 0,
    })
  }
  return slots
}

const attachmentsOf = (source: AssemblySource): ReadonlyArray<Attachment> => {
  const resolve = source.input !== undefined
  const fromView = source.view !== undefined
  // `Mixin<never>` does not widen onto `Mixin<any>`: `HtmlBuilder` is invariant.
  const mixins: ReadonlyArray<MixinFor<any>> = fromView
    ? source.view!.mixins
    : [
        ...(source.styles ?? []).map(style => style.mixin),
        ...(source.behaviors ?? []).map(behavior => behavior.mixin),
      ]
  return mixins.map((mixin, order) => {
    const behavior = source.behaviors?.find(candidate => candidate.mixin === mixin)
    if (behavior !== undefined) {
      return {
        order,
        name: behavior.name ?? mixin.name,
        kind: 'behavior' as const,
        slots: behaviorSlots(behavior, source.input, resolve),
      }
    }
    const style = source.styles?.find(candidate => candidate.mixin === mixin)
    if (style !== undefined) {
      return {
        order,
        name: style.name ?? mixin.name,
        kind: 'style' as const,
        slots: styleSlots(style, resolve),
      }
    }
    return {
      order,
      name: mixin.name,
      kind: 'mixin' as const,
      slots: staticSlots(mixin),
    }
  })
}

const conflictsOf = (
  attachments: ReadonlyArray<Attachment>,
): ReadonlyArray<ContributionConflict> => {
  const owners = new Map<string, string>()
  const conflicts: Array<ContributionConflict> = []
  const claim = (
    code: ContributionConflict['code'],
    slot: string,
    name: string,
    contributor: string,
  ): void => {
    const key = `${code}\0${slot}\0${name}`
    const owner = owners.get(key)
    if (owner === undefined) {
      owners.set(key, contributor)
      return
    }
    if (owner === contributor) return
    conflicts.push({ code, slot, name, contributors: [owner, contributor] })
  }
  for (const attachment of attachments) {
    for (const slot of attachment.slots) {
      if (slot.events === 'unknown' || slot.attributes === 'unknown') continue
      for (const event of slot.events)
        claim('mixins:event-conflict', slot.slot, event, attachment.name)
      for (const attribute of slot.attributes) {
        claim('mixins:attribute-conflict', slot.slot, attribute, attachment.name)
      }
    }
  }
  return conflicts
}

const obligationsOf = (pattern: PatternRef | undefined): ReadonlyArray<Obligation> => {
  if (pattern === undefined) return []
  const obligations: Array<Obligation> = []
  for (const slot of Object.getOwnPropertyNames(pattern.pattern.requirements)) {
    const requirement = pattern.pattern.requirements[slot]
    if (requirement === undefined) continue
    obligations.push({
      pattern: pattern.name,
      slot,
      ...(requirement.capability === undefined
        ? {}
        : { capability: MetadataToken.nameOf(requirement.capability) }),
      events: (requirement.events ?? []).map(event => MetadataToken.nameOf(event)),
      attributes: (requirement.attributes ?? []).map(attribute => MetadataToken.nameOf(attribute)),
      obligations: [...(requirement.obligations ?? [])],
      optional: requirement.optional === true,
    })
  }
  return obligations
}

const namedSlot = (slot: AnySlot | UnnamedSlot): slot is AnySlot =>
  Object.hasOwn(slot, 'name') && typeof slot.name === 'string'

const slotsOf = (source: AssemblySource): { readonly [key: string]: AnySlot | UnnamedSlot } => {
  const slots = source.view?.slots ?? source.slots
  if (slots === undefined)
    throw new Error(`Assembly.describe: "${source.name}" needs a view or slots`)
  return slots as { readonly [key: string]: AnySlot | UnnamedSlot }
}

const publicSlots = (slots: {
  readonly [key: string]: AnySlot | UnnamedSlot
}): ReadonlyArray<SlotInfo> => {
  const described = Slots.describe(slots).slots
  const info: Array<SlotInfo> = []
  for (const key of Object.getOwnPropertyNames(described)) {
    const slot = described[key]
    if (slot === undefined || slot.hidden) continue
    info.push({
      name: slot.name,
      capability: slot.capability,
      events: slot.events,
      attributes: slot.attributes,
      requirements: slot.requirements,
    })
  }
  return info
}

export const describe = (source: AssemblySource): Description => {
  const slots = slotsOf(source)
  const attachments = attachmentsOf(source)
  const patternSlots: Record<string, AnySlot> = Object.create(null)
  for (const key of Object.getOwnPropertyNames(slots)) {
    const slot = slots[key]
    // `Slot.is` also admits an unnamed slot, which has no name for validate.
    if (slot !== undefined && namedSlot(slot)) patternSlots[key] = slot
  }
  return {
    name: source.name,
    slots: publicSlots(slots),
    attachments,
    obligations: obligationsOf(source.pattern),
    patternDiagnostics:
      source.pattern === undefined
        ? []
        : A11y.validate(
            source.pattern.pattern,
            patternSlots,
            (source.behaviors ?? []).flatMap(behavior => A11y.suppliedBy(behavior)),
          ),
    links: (source.links ?? []).map(linkOf),
    conflicts: conflictsOf(attachments),
    parts: (source.parts ?? []).map(part => describe(part)),
  }
}

const linesOf = (description: Description, indent: string): Array<string> => {
  const lines = [`${indent}${description.name}`]
  for (const slot of description.slots) {
    lines.push(`${indent}slot ${slot.name} ${slot.capability}`)
  }
  for (const attachment of description.attachments) {
    lines.push(`${indent}attachment ${attachment.order} ${attachment.kind} ${attachment.name}`)
    for (const slot of attachment.slots) {
      const events = slot.events === 'unknown' ? 'unknown' : slot.events.join(',')
      lines.push(`${indent}  ${slot.slot} reads ${slot.reads} events ${events}`)
    }
  }
  for (const obligation of description.obligations) {
    const names = obligation.obligations.length === 0 ? '' : ` ${obligation.obligations.join(',')}`
    lines.push(`${indent}obligation ${obligation.pattern} ${obligation.slot}${names}`)
  }
  for (const link of description.links) {
    lines.push(`${indent}link ${link.kind} ${link.name}`)
  }
  for (const conflict of description.conflicts) {
    lines.push(
      `${indent}conflict ${conflict.slot} ${conflict.name} ${conflict.contributors[0]} ${conflict.contributors[1]}`,
    )
  }
  for (const diagnostic of description.patternDiagnostics) {
    lines.push(`${indent}diagnostic ${diagnostic.code} ${diagnostic.slot ?? ''}`)
  }
  for (const part of description.parts) lines.push(...linesOf(part, `${indent}  `))
  return lines
}

/** The description as text, for a document or a diagnostic that should not walk the widget again. */
export const textOf = (description: Description): string => linesOf(description, '').join('\n')

export const Assembly = { describe, textOf } as const
