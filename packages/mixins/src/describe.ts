/**
 * What an assembled view is, as data: `describe` reads its attachments and
 * what each asks of a slot and gives it, with no input; `resolution` reads what
 * one input makes the attachments contribute, as names and owners. Neither runs
 * a Mount, a Command or `update`, and neither reads the DOM. Re-exported as
 * `SlotView.describe`, `SlotView.resolution` and `SlotView.toMarkdown`.
 */
import { Match, Option } from 'effect'
import { inertHtml, type Attribute, type HtmlBuilder } from 'foldkit/html'
import { isChildAttribute } from './attribute.js'
import type { SlotContribution, StaticContribution } from './contribution.js'
import { DiagnosticError, type Diagnostic, type DiagnosticCode } from './diagnostics.js'
import { attributeNameOf, eventNameOf } from './foldkitNames.js'
import { evaluate, isDynamic, type MixinFor, type MixinMeta } from './mixin.js'
import { resolve } from './resolver.js'
import type { Any as AnySlot } from './slot.js'
import * as Slots from './slots.js'
import type { SlotView } from './slotView.js'

/** A diagnostic, or a warning about the view's assembly that `resolve` would not throw for. */
export type Finding = Omit<Diagnostic, 'code' | 'severity'> & {
  readonly code: DiagnosticCode | 'mixins:unnamed-attachment'
  readonly severity: 'error' | 'warning'
}

export interface SlotDescription {
  readonly requires: {
    /** `null` is JSON's: the attachment asks for no capability. */
    readonly capability: string | null
    readonly events: ReadonlyArray<string>
    readonly attributes: ReadonlyArray<string>
  }
  readonly provides: ReadonlyArray<string>
  /** `'unknown'`: a function of the input, which a description does not call. */
  readonly contributes:
    | { readonly classes: ReadonlyArray<string>; readonly mounts: ReadonlyArray<string> }
    | 'unknown'
}

export interface AttachmentDescription {
  /** Where it resolves; reported, and no identity: that is the name. */
  readonly order: number
  readonly name: string
  readonly kind: 'style' | 'behavior' | 'mixin'
  readonly slots: Readonly<Record<string, SlotDescription>>
}

export interface ViewDescription {
  readonly name: string
  readonly slots: ReturnType<typeof Slots.describe>['slots']
  readonly attachments: ReadonlyArray<AttachmentDescription>
  readonly findings: ReadonlyArray<Finding>
}

/** One thing a slot ends up with, and the attachment that gave it. */
export interface Owned {
  readonly name: string
  readonly owner: string
}

export interface SlotResolution {
  readonly classes: ReadonlyArray<Owned>
  /** Property names; no value. */
  readonly style: ReadonlyArray<Owned>
  /** Attribute names as the resolver compares them (lower case, no hyphens: `ariainvalid`); no value. */
  readonly attributes: ReadonlyArray<Owned>
  readonly events: ReadonlyArray<Owned>
  /** Mount names; no args. */
  readonly mounts: ReadonlyArray<Owned>
}

export interface Resolution {
  readonly name: string
  readonly slots: Readonly<Record<string, SlotResolution>>
  readonly findings: ReadonlyArray<Finding>
}

type AnyView = SlotView<any, any, any>

const unique = (names: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(names)]

/** What a Mixin and the Mixins it composes declare for `slot`, merged. */
const declared = (
  meta: MixinMeta | undefined,
  slot: string,
): SlotDescription['requires'] & {
  readonly provides: ReadonlyArray<string>
} => {
  const own = meta?.slots[slot]
  const parts = (meta?.parts ?? []).map(part => declared(part.meta, slot))
  const capability =
    own?.requires.capability ?? parts.find(part => part.capability !== null)?.capability
  return {
    capability: capability ?? null,
    events: unique([...(own?.requires.events ?? []), ...parts.flatMap(part => part.events)]),
    attributes: unique([
      ...(own?.requires.attributes ?? []),
      ...parts.flatMap(part => part.attributes),
    ]),
    provides: unique([...(own?.provides ?? []), ...parts.flatMap(part => part.provides)]),
  }
}

const slotNamesOf = (meta: MixinMeta | undefined): ReadonlyArray<string> => [
  ...Object.keys(meta?.slots ?? {}),
  ...(meta?.parts ?? []).flatMap(part => slotNamesOf(part.meta)),
]

const describeContribution = (
  contribution: SlotContribution<any> | undefined,
): SlotDescription['contributes'] => {
  if (contribution === undefined) return { classes: [], mounts: [] }
  if (isDynamic(contribution)) return 'unknown'
  return {
    classes: classTokens(contribution.classes ?? []),
    mounts: (contribution.mounts ?? []).map(mount => mount.name),
  }
}

const classTokens = (classes: ReadonlyArray<string>): ReadonlyArray<string> =>
  unique(classes.flatMap(entry => entry.split(/\s+/).filter(token => token.length > 0)))

const describeAttachment = (mixin: MixinFor<any>, order: number): AttachmentDescription => {
  const slots: Record<string, SlotDescription> = Object.create(null)
  const names = unique([...slotNamesOf(mixin.meta), ...Object.keys(mixin.contributions)])
  for (const slot of names) {
    const { provides, ...requires } = declared(mixin.meta, slot)
    slots[slot] = {
      requires,
      provides,
      contributes: describeContribution(
        mixin.contributions[slot] as SlotContribution<any> | undefined,
      ),
    }
  }
  return { order, name: mixin.name, kind: mixin.meta?.kind ?? 'mixin', slots }
}

/** Findings about how the view's attachments are named, which a name-addressed `detach` depends on. */
const namingFindings = (view: AnyView): ReadonlyArray<Finding> => {
  const counts = new Map<string, number>()
  for (const mixin of view.mixins) counts.set(mixin.name, (counts.get(mixin.name) ?? 0) + 1)
  return [...counts].flatMap(([name, count]): ReadonlyArray<Finding> => {
    if (name === '') {
      return [
        {
          source: 'mixins',
          code: 'mixins:unnamed-attachment',
          severity: 'warning',
          message: `the view holds ${count} attachment${count === 1 ? '' : 's'} with no name, which cannot be addressed`,
          details: { count },
        },
      ]
    }
    return count === 1
      ? []
      : [
          {
            source: 'mixins',
            code: 'mixins:ambiguous-attachment',
            severity: 'warning',
            message: `the view holds ${count} attachments named "${name}"; name them apart to address one`,
            details: { name, count },
          },
        ]
  })
}

/**
 * The view as a serializable value: its slots, and each attachment in order
 * with, per slot, what it requires, what it supplies and the classes and
 * Mounts it contributes. A contribution that is a function of the input reads
 * `'unknown'`: it is not called. A description is a function of one view value;
 * attaching or detaching returns another view and leaves this one's alone.
 */
export const describe = (view: AnyView): ViewDescription => ({
  name: view.name ?? '',
  slots: Slots.describe(view.slots).slots,
  attachments: view.mixins.map(describeAttachment),
  findings: namingFindings(view),
})

const emptyResolution = (): { [K in keyof SlotResolution]: Array<Owned> } => ({
  classes: [],
  style: [],
  attributes: [],
  events: [],
  mounts: [],
})

/** Adds `name` unless an earlier owner gave it: the first one is the one `resolve` keeps. */
const note = (into: Array<Owned>, name: string, owner: string): void => {
  if (!into.some(held => held.name === name)) into.push({ name, owner })
}

/** The names one contribution sets, never the values. */
const readNames = (
  contribution: StaticContribution<any>,
  owner: string,
  into: ReturnType<typeof emptyResolution>,
): void => {
  for (const token of classTokens(contribution.classes ?? [])) note(into.classes, token, owner)
  for (const property of Object.keys(contribution.style ?? {})) note(into.style, property, owner)
  for (const mount of contribution.mounts ?? []) note(into.mounts, mount.name, owner)
  for (const given of contribution.attributes ?? []) {
    // A child attribute's inner one is of the child's own Message; only its tag and fields are read.
    const attribute = (
      isChildAttribute(given) ? (given as { readonly attribute?: unknown }).attribute : given
    ) as Attribute<unknown> | undefined
    if (attribute === undefined) continue
    Match.value(attribute).pipe(
      Match.tags({
        Class: ({ value }) => {
          for (const token of classTokens([value])) note(into.classes, token, owner)
        },
        Style: ({ value }) => {
          for (const property of Object.keys(value)) note(into.style, property, owner)
        },
        OnMount: ({ action }) => note(into.mounts, action.name, owner),
      }),
      Match.orElse(other => {
        Option.match(eventNameOf(other._tag, other), {
          onSome: event => note(into.events, event, owner),
          onNone: () => note(into.attributes, attributeNameOf(other._tag, other), owner),
        })
      }),
    )
  }
}

/**
 * What `input` makes each slot hold: class tokens, style property names,
 * attribute names, event names and Mount names, each with the attachment that
 * gave it. It reports no value (a password in `Value` is the input's, and an
 * attribute carries it), no Mount args, and runs no Mount: a handler is built
 * with the inert builder and never called, and a contribution is called with
 * `input`, as a render would. Where `resolve` would throw, the conflict is a
 * finding. The view's own base attributes are not drawn, so a clash with one
 * is not reported here.
 */
export const resolution = (view: AnyView, input: unknown): Resolution => {
  const h = inertHtml as unknown as HtmlBuilder<any>
  const slots: Record<string, SlotResolution> = Object.create(null)
  const findings: Array<Finding> = []
  const source = view.slots as unknown as Record<string, AnySlot>
  for (const name of Object.getOwnPropertyNames(source)) {
    const slot = source[name]
    if (slot === undefined) continue
    const names = emptyResolution()
    const contributions: Array<StaticContribution<any> & { readonly source: string }> = []
    for (const mixin of view.mixins) {
      const contribution = mixin.contributions[name] as SlotContribution<any> | undefined
      if (contribution === undefined) continue
      const evaluated = evaluate(contribution, { input, h })
      readNames(evaluated, mixin.name, names)
      contributions.push({ ...evaluated, source: mixin.name })
    }
    slots[name] = names
    try {
      resolve(undefined, contributions, { slot: name, protected: slot.protected })
    } catch (error) {
      if (!(error instanceof DiagnosticError)) throw error
      findings.push(error.diagnostic)
    }
  }
  return { name: view.name ?? '', slots, findings: [...namingFindings(view), ...findings] }
}

const contributes = (value: SlotDescription['contributes']): string => {
  if (value === 'unknown') return 'depends on the input'
  const parts = [
    ...(value.classes.length === 0
      ? []
      : [`classes ${value.classes.map(c => `\`${c}\``).join(' ')}`]),
    ...(value.mounts.length === 0 ? [] : [`mounts ${value.mounts.map(m => `\`${m}\``).join(' ')}`]),
  ]
  return parts.length === 0 ? 'nothing static' : parts.join('; ')
}

/** Deterministic Markdown for a description: stable key order, no timestamps. */
export const toMarkdown = (description: ViewDescription): string => {
  const lines: Array<string> = ['## Slots', '']
  for (const [name, slot] of Object.entries(description.slots)) {
    const events = slot.events.length === 0 ? '' : ` (events: ${slot.events.join(', ')})`
    lines.push(`- \`${name}\` — ${slot.capability}${events}`)
  }
  lines.push('', '## Attachments', '')
  for (const attachment of description.attachments) {
    lines.push(`${attachment.order + 1}. \`${attachment.name}\` (${attachment.kind})`)
    for (const [slot, entry] of Object.entries(attachment.slots)) {
      const asks = [
        ...(entry.requires.capability === null ? [] : [`capability ${entry.requires.capability}`]),
        ...(entry.requires.events.length === 0
          ? []
          : [`events ${entry.requires.events.join(', ')}`]),
        ...(entry.requires.attributes.length === 0
          ? []
          : [`attributes ${entry.requires.attributes.join(', ')}`]),
      ]
      const gives = entry.provides.length === 0 ? '' : `; supplies ${entry.provides.join(', ')}`
      const needs = asks.length === 0 ? '' : `requires ${asks.join('; ')}; `
      lines.push(`   - \`${slot}\`: ${needs}${contributes(entry.contributes)}${gives}`)
    }
  }
  if (description.findings.length > 0) {
    lines.push('', '## Findings', '')
    for (const finding of description.findings) {
      lines.push(`- ${finding.severity} \`${finding.code}\`: ${finding.message}`)
    }
  }
  return lines.join('\n')
}
