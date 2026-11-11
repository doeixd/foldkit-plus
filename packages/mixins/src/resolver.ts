/**
 * The deterministic resolver. `resolve` is pure: it decomposes the base
 * attributes, applies contributions in attachment order, enforces ownership
 * and protection, then emits one canonical `Class`, one `Style`, and at most
 * one `OnMount`. Conflicts throw a `DiagnosticError` before Foldkit could
 * silently chain or replace.
 */
import { Cause, Match, Option, Stream } from 'effect'
import type { Attribute, ChildAttribute } from 'foldkit/html'
import type { MountAction } from 'foldkit/mount'
import { Diagnostics as Reported } from 'foldkit-surface'
import {
  classAttribute,
  isChildAttribute,
  isTagged,
  mountAttribute,
  styleAttribute,
} from './attribute.js'
import type { StaticContribution } from './contribution.js'
import { DiagnosticError, type Diagnostic, type DiagnosticCode } from './diagnostics.js'
import { DRAWN_CLASSES } from './inject.js'
import * as MetadataToken from './metadataToken.js'
import { mountFailed } from './mountFailed.js'
import type { SlotProtection } from './slot.js'

export type SlotAttributes<Message> = ReadonlyArray<Attribute<Message> | ChildAttribute>

/**
 * What a Mixin can add to a slot's attributes: every attribute but
 * `InnerHTML`, which the resolver refuses from one as structural ownership.
 */
export type ContributedAttribute<Message> =
  | Exclude<Attribute<Message>, { readonly _tag: 'InnerHTML' }>
  | ChildAttribute

export interface ResolveOptions {
  readonly slot?: string
  readonly protected?: SlotProtection
}

/** `AriaLabel` -> `arialabel`, `aria-label` -> `arialabel`; tags and tokens agree. */
const normalizeName = (name: string): string => name.replace(/[^a-z0-9]/gi, '').toLowerCase()

/** Attribute tags are PascalCase (`OnKeyDown`); event tokens are lowercase. */
const eventNameOfTag = (tag: string): string =>
  normalizeName(tag.startsWith('On') ? tag.slice(2) : tag)

/** A Foldkit `Class` attribute, read inside a child attribute another package built. */
const isClass = (value: unknown): value is { readonly _tag: 'Class'; readonly value: string } =>
  isTagged(value) &&
  // tag-check: open — a Foldkit attribute's tag, from a package whose union we do not have.
  value._tag === 'Class' &&
  typeof (value as { value?: unknown }).value === 'string'

const splitClasses = (value: string): ReadonlyArray<string> =>
  value.split(/\s+/).filter(token => token.length > 0)

/** The field that keys an attribute that is owned individually, not by its tag. */
const OWNERSHIP_FIELD: ReadonlyMap<string, 'key' | 'name'> = new Map([
  ['Prop', 'key'],
  ['Attribute', 'key'],
  ['DataAttribute', 'key'],
  ['OnCustomEvent', 'name'],
])

// The tag may come from a child attribute another package built, so it is
// text, not a union we hold.
const ownershipKey = (tag: string, value: unknown): string => {
  const field = OWNERSHIP_FIELD.get(tag)
  if (field === undefined || typeof value !== 'object' || value === null) return tag
  return `${tag}:${String((value as { readonly key?: unknown; readonly name?: unknown })[field])}`
}

/**
 * The HTML attribute a contribution sets, normalized to compare with a protected one:
 * `AriaLabel`, `Attribute('aria-label')` and `Prop({ key: 'ariaLabel' })` all read
 * `arialabel`, and `DataAttribute('x')` reads as `data-x`.
 */
const attributeNameOf = (tag: string, value: unknown): string => {
  const key =
    typeof value === 'object' && value !== null
      ? (value as { readonly key?: unknown }).key
      : undefined
  if (typeof key !== 'string') return normalizeName(tag)
  // tag-check: open — the tag may be a child attribute's, from another package.
  if (tag === 'DataAttribute') return normalizeName(`data-${key}`)
  if (tag === 'Attribute' || tag === 'Prop') return normalizeName(key)
  return normalizeName(tag)
}

/** `OnCustomEvent` is keyed by its event name and `OnMount` is composed, not one native event. */
const NOT_NATIVE_EVENT: ReadonlySet<string> = new Set(['OnMount', 'OnCustomEvent'])

// tag-check: open — any `On…` tag is a native handler by prefix, and a child attribute's tag is another package's.
const isNativeEvent = (tag: string): boolean => tag.startsWith('On') && !NOT_NATIVE_EVENT.has(tag)

const toDiagnostic = (
  code: DiagnosticCode,
  message: string,
  slot: string | undefined,
  details: Readonly<Record<string, unknown>>,
): Diagnostic => ({
  source: 'mixins',
  code,
  severity: 'error',
  message,
  ...(slot === undefined ? {} : { slot }),
  details,
})

export const resolve = <Message>(
  base: SlotAttributes<Message> | undefined,
  contributions: ReadonlyArray<StaticContribution<Message>>,
  options: ResolveOptions = {},
): SlotAttributes<Message> => {
  const slot = options.slot
  const protection = options.protected
  const protectedEvents = new Set(
    (protection?.events ?? []).map(event => normalizeName(MetadataToken.nameOf(event))),
  )
  const protectedAttributes = new Set(
    (protection?.attributes ?? []).map(attr => normalizeName(MetadataToken.nameOf(attr))),
  )
  const protectedStyle = new Set(protection?.style ?? [])

  const classes: Array<string> = []
  const classSeen = new Set<string>()
  const style = new Map<string, string>()
  // Who wrote each inline style property. Style pieces layer over the base and
  // over each other (that is restyling); a Behavior's property has one owner,
  // and a Style piece may not overwrite what a Behavior set.
  const styleOwners = new Map<string, 'base' | 'style' | 'behavior'>()
  const mounts: Array<MountAction<Message, any>> = []
  const mountNames = new Map<string, number>()
  const preserved: Array<Attribute<Message> | ChildAttribute> = []
  const added: Array<Attribute<Message> | ChildAttribute> = []
  const ownedEvents = new Map<string, string>()
  const ownedAttributes = new Map<string, string>()

  function fail(
    code: DiagnosticCode,
    message: string,
    details: Readonly<Record<string, unknown>>,
  ): never {
    throw new DiagnosticError(toDiagnostic(code, message, slot, details))
  }

  const addClass = (token: string): void => {
    if (classSeen.has(token)) return
    classSeen.add(token)
    classes.push(token)
    // A server render collects the classes it drew, so it need not scan its HTML.
    const drawn = (globalThis as Record<symbol, unknown>)[DRAWN_CLASSES]
    if (drawn instanceof Set && token.startsWith('style-')) drawn.add(token)
  }

  const writeStyle = (
    property: string,
    value: string,
    writer: 'base' | 'style' | 'behavior',
  ): void => {
    if (writer !== 'base' && protectedStyle.has(property)) {
      fail(
        'mixins:protected-style-property',
        `slot "${slot ?? '?'}" protects style property "${property}"`,
        { property },
      )
    }
    const owner = styleOwners.get(property)
    if (
      (writer === 'behavior' && owner !== undefined) ||
      (writer === 'style' && owner === 'behavior')
    ) {
      fail(
        'mixins:style-property-conflict',
        `two owners for style property "${property}": ${owner === 'base' ? 'the view' : owner === 'style' ? 'a Style' : 'a Behavior'} already sets it`,
        { property, owner, writer },
      )
    }
    if (owner === undefined || writer === 'behavior') styleOwners.set(property, writer)
    style.set(property, value)
  }

  const addMount = (action: MountAction<Message, any>): void => {
    const count = (mountNames.get(action.name) ?? 0) + 1
    mountNames.set(action.name, count)
    if (count > 1) {
      fail('mixins:duplicate-mount-name', `two Mounts are both named "${action.name}"`, {
        name: action.name,
      })
    }
    mounts.push(action)
  }

  const reserve = (tag: string, value: unknown): void => {
    // tag-check: open — the tag may be a child attribute's, from another package.
    if (tag === 'OnMount') return
    if (isNativeEvent(tag)) {
      ownedEvents.set(eventNameOfTag(tag), tag)
      return
    }
    ownedAttributes.set(ownershipKey(tag, value), tag)
  }

  const addBase = (attribute: Attribute<Message> | ChildAttribute): void => {
    if (isChildAttribute(attribute)) {
      const inner = (attribute as { readonly attribute?: unknown }).attribute
      // A class sends no Message, so a child's joins the slot's own: kept
      // apart, Foldkit would draw one of the two `Class` lists and drop the other.
      if (isClass(inner)) {
        for (const token of splitClasses(inner.value)) addClass(token)
        return
      }
      if (isTagged(inner)) reserve(inner._tag, inner)
      preserved.push(attribute)
      return
    }
    Match.value(attribute).pipe(
      Match.tags({
        Class: ({ value }) => {
          for (const token of splitClasses(value)) addClass(token)
        },
        Style: ({ value }) => {
          for (const [property, entry] of Object.entries(value)) {
            writeStyle(property, entry, 'base')
          }
        },
        OnMount: ({ action }) => addMount(action),
      }),
      Match.orElse(other => {
        reserve(other._tag, other)
        preserved.push(other)
      }),
    )
  }

  const failStructural = (tag: string): never =>
    fail(
      'mixins:structural-override',
      `a Mixin may not contribute "${tag}"; it is structural ownership`,
      { tag },
    )

  // A contribution's tag that is not one of the above: a native handler or an attribute.
  const claim = (tag: string, attribute: unknown): void => {
    if (isNativeEvent(tag)) {
      const eventName = eventNameOfTag(tag)
      if (protectedEvents.has(eventName)) {
        fail('mixins:protected-event', `slot "${slot ?? '?'}" protects event "${eventName}"`, {
          tag,
          event: eventName,
        })
      }
      const owner = ownedEvents.get(eventName)
      if (owner !== undefined) {
        fail(
          'mixins:event-conflict',
          `two owners for event "${eventName}": "${owner}" already owns it`,
          { tag, event: eventName, owner },
        )
      }
      ownedEvents.set(eventName, tag)
      return
    }
    const key = ownershipKey(tag, attribute)
    const attributeName = attributeNameOf(tag, attribute)
    if (protectedAttributes.has(attributeName)) {
      fail('mixins:protected-attribute', `slot "${slot ?? '?'}" protects attribute "${tag}"`, {
        tag,
        attribute: attributeName,
      })
    }
    const owner = ownedAttributes.get(key)
    if (owner !== undefined) {
      fail(
        'mixins:attribute-conflict',
        `two owners for "${key}": a ${owner} attribute already occupies it`,
        { tag, key, owner },
      )
    }
    ownedAttributes.set(key, tag)
  }

  const applyMixinAttribute = (attribute: Attribute<Message> | ChildAttribute): void => {
    if (isChildAttribute(attribute)) {
      const inner = (attribute as { readonly attribute?: unknown }).attribute
      if (isTagged(inner)) reserve(inner._tag, inner)
      added.push(attribute)
      return
    }
    Match.value(attribute).pipe(
      Match.tags({
        Class: ({ value }) => {
          for (const token of splitClasses(value)) addClass(token)
        },
        // A `Style` attribute inside a contribution's attributes is a Behavior's.
        Style: ({ value }) => {
          for (const [property, entry] of Object.entries(value)) {
            writeStyle(property, entry, 'behavior')
          }
        },
        OnMount: ({ action }) => addMount(action),
        Key: ({ _tag: tag }) => failStructural(tag),
        InnerHTML: ({ _tag: tag }) => failStructural(tag),
      }),
      Match.orElse(other => {
        claim(other._tag, other)
        added.push(other)
      }),
    )
  }

  for (const attribute of base ?? []) addBase(attribute)

  for (const contribution of contributions) {
    for (const token of contribution.classes ?? []) addClass(token)
    for (const [property, value] of Object.entries(contribution.style ?? {})) {
      writeStyle(property, value, 'style')
    }
    for (const attribute of contribution.attributes ?? []) applyMixinAttribute(attribute)
    for (const mount of contribution.mounts ?? []) addMount(mount)
  }

  const emitted: Array<Attribute<Message> | ChildAttribute> = []
  if (classes.length > 0) emitted.push(classAttribute(classes.join(' ')))
  if (style.size > 0) emitted.push(styleAttribute(Object.fromEntries(style)))
  emitted.push(...preserved, ...added)
  const composed = composeMounts(mounts, slot)
  if (composed !== undefined) emitted.push(composed)
  return emitted
}

const composeMounts = <Message>(
  mounts: ReadonlyArray<MountAction<Message, any>>,
  slot: string | undefined,
): Attribute<Message> | undefined => {
  const first = mounts[0]
  if (first === undefined) return undefined
  if (mounts.length === 1) return mountAttribute(first)
  const slotOf = Option.fromUndefinedOr(slot)
  const name = `Mixins[${slot ?? 'slot'}](${mounts.map(mount => mount.name).join(',')})`
  return mountAttribute({
    name,
    args: {
      slot: slot ?? null,
      actions: mounts.map(mount => ({ name: mount.name, args: mount.args })),
    },
    f: (element, viewStateChanges) =>
      Stream.mergeAll(
        mounts.map(mount =>
          // A merge ends every stream in it when one fails, so each fails alone,
          // reported as `MountFailed`, and the rest go on: dispatched at the
          // element, since a Mount runs outside the application's resources.
          // One that ends interrupted is being torn down with its element.
          mount
            .f(element, viewStateChanges)
            .pipe(
              Stream.catchCause(cause =>
                Cause.hasInterruptsOnly(cause)
                  ? Stream.empty
                  : Stream.fromEffectDrain(
                      Reported.dispatch(element, mountFailed(mount.name, slotOf, cause)),
                    ),
              ),
            ),
        ),
        { concurrency: 'unbounded' },
      ),
  })
}
