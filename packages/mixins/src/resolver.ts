/**
 * The deterministic resolver. `resolve` is pure: it decomposes the base
 * attributes, applies contributions in attachment order, enforces ownership
 * and protection, then emits one canonical `Class`, one `Style`, and at most
 * one `OnMount`. Conflicts throw a `DiagnosticError` before Foldkit could
 * silently chain or replace.
 */
import { Cause, Effect, Match, Option, Stream } from 'effect'
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
import {
  attributeNameOf,
  eventNameOf,
  isInlineHandler,
  isUnknownHandler,
  normalizeName,
} from './foldkitNames.js'
import { DRAWN_CLASSES } from './inject.js'
import * as MetadataToken from './metadataToken.js'
import { mountFailed } from './mountFailed.js'
import { declarationName, overlaps } from './styleNames.js'
import type { SlotProtection } from './slot.js'

export type SlotAttributes<Message> = ReadonlyArray<Attribute<Message> | ChildAttribute>

/**
 * What a Mixin can add to a slot's attributes: every attribute but
 * `InnerHTML`, which the resolver refuses from one as structural ownership.
 */
export type ContributedAttribute<Message> =
  | Exclude<Attribute<Message>, { readonly _tag: 'InnerHTML' }>
  | ChildAttribute

/**
 * A contribution and the name of the Mixin that gave it, which an ownership
 * diagnostic names as a contributor. Without one it is named "a Mixin".
 */
export type SourcedContribution<Message> = StaticContribution<Message> & {
  readonly source?: string
}

/** The contributor an ownership diagnostic names for the view's own base attributes. */
const VIEW = 'the view'

const quoted = (contributor: string): string => (contributor === VIEW ? VIEW : `"${contributor}"`)

/** A Mount and, when it came inside a child attribute, that attribute, whose boundary it dispatches through. */
interface HeldMount<Message> {
  readonly action: MountAction<Message, any>
  readonly child?: ChildAttribute
}

export interface ResolveOptions {
  readonly slot?: string
  readonly protected?: SlotProtection
}

/** A Foldkit `Class` attribute, read inside a child attribute another package built. */
const isClass = (value: unknown): value is { readonly _tag: 'Class'; readonly value: string } =>
  isTagged(value) &&
  // tag-check: open — a Foldkit attribute's tag, from a package whose union we do not have.
  value._tag === 'Class' &&
  typeof (value as { value?: unknown }).value === 'string'

/** A Foldkit `OnMount` attribute, read inside a child attribute another package built. */
const isMount = (
  value: unknown,
): value is { readonly _tag: 'OnMount'; readonly action: MountAction<any, any> } =>
  isTagged(value) &&
  // tag-check: open — a Foldkit attribute's tag, from a package whose union we do not have.
  value._tag === 'OnMount' &&
  typeof (value as { action?: unknown }).action === 'object'

const splitClasses = (value: string): ReadonlyArray<string> =>
  value.split(/\s+/).filter(token => token.length > 0)

/** The resolver emits the slot's one `class` and `style`; a raw write of either would replace it. */
const RESOLVER_OWNED: ReadonlySet<string> = new Set(['class', 'style'])

/** Properties that replace the element's children, as `InnerHTML` does. */
const REPLACES_CHILDREN: ReadonlySet<string> = new Set(
  ['innerHTML', 'outerHTML', 'textContent', 'innerText'].map(normalizeName),
)

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
  contributions: ReadonlyArray<SourcedContribution<Message>>,
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
  const protectedStyle = protection?.style ?? []

  const classes: Array<string> = []
  const classSeen = new Set<string>()
  // By the declaration Foldkit writes, so two spellings of one are one entry;
  // drawn under the spelling written last.
  const style = new Map<string, { readonly property: string; readonly value: string }>()
  // Who wrote each inline style declaration. Style pieces layer over the base
  // and over each other (that is restyling); a Behavior's property has one
  // owner, shorthands and sides included, and a Style piece may not overwrite
  // what a Behavior set.
  const styleOwners = new Map<
    string,
    { readonly writer: 'base' | 'style' | 'behavior'; readonly source: string }
  >()
  const mounts: Array<HeldMount<Message>> = []
  const mountSources = new Map<string, string>()
  const preserved: Array<Attribute<Message> | ChildAttribute> = []
  const added: Array<Attribute<Message> | ChildAttribute> = []
  // Each owned event and attribute: the Foldkit tag that set it, and who gave it.
  const ownedEvents = new Map<string, { readonly tag: string; readonly source: string }>()
  const ownedAttributes = new Map<string, { readonly tag: string; readonly source: string }>()
  // Who is contributing now: the view while its base is read, then each Mixin in turn.
  let source = VIEW

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
    const shielded = protectedStyle.find(name => overlaps(property, name))
    if (writer !== 'base' && shielded !== undefined) {
      fail(
        'mixins:protected-style-property',
        `slot "${slot ?? '?'}" protects style property "${shielded}", which "${property}" writes`,
        { property, protected: shielded },
      )
    }
    const declaration = declarationName(property)
    for (const [written, owner] of styleOwners) {
      if (
        (writer === 'behavior' || (writer === 'style' && owner.writer === 'behavior')) &&
        overlaps(declaration, written)
      ) {
        fail(
          'mixins:style-property-conflict',
          `two owners for style property "${property}": ${quoted(owner.source)} already sets "${written}", and ${quoted(source)} sets "${property}"`,
          { property, owner: owner.writer, writer, contributors: [owner.source, source] },
        )
      }
    }
    if (!styleOwners.has(declaration) || writer === 'behavior') {
      styleOwners.set(declaration, { writer, source })
    }
    style.set(declaration, { property, value })
  }

  const addMount = (action: MountAction<Message, any>, child?: ChildAttribute): void => {
    const owner = mountSources.get(action.name)
    if (owner !== undefined) {
      fail(
        'mixins:duplicate-mount-name',
        `two Mounts are both named "${action.name}": ${quoted(owner)} gives one, and ${quoted(source)} the other`,
        { name: action.name, contributors: [owner, source] },
      )
    }
    mountSources.set(action.name, source)
    mounts.push(child === undefined ? { action } : { action, child })
  }

  const failUnknownHandler = (tag: string): never =>
    fail(
      'mixins:unsupported-event',
      `"${tag}" is no Foldkit handler the resolver knows, so it cannot tell which event it owns`,
      { tag },
    )

  const reserve = (tag: string, value: unknown): void => {
    // tag-check: open — the tag may be a child attribute's, from another package.
    if (tag === 'OnMount') return
    if (isUnknownHandler(tag)) failUnknownHandler(tag)
    Option.match(eventNameOf(tag, value), {
      onSome: eventName => ownedEvents.set(eventName, { tag, source }),
      onNone: () => ownedAttributes.set(attributeNameOf(tag, value), { tag, source }),
    })
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
      // An element holds one Mount, so a child's joins the slot's others (#531).
      if (isMount(inner)) return addMount(inner.action, attribute)
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

  // What a Mixin adds, by the event or attribute it really sets: its own
  // attributes, and the attribute inside each child attribute it adds.
  const claim = (tag: string, attribute: unknown): void => {
    // tag-check: open — the tag may be a child attribute's, from another package.
    if (tag === 'Key' || tag === 'InnerHTML') failStructural(tag)
    if (isUnknownHandler(tag)) failUnknownHandler(tag)
    if (isInlineHandler(tag, attribute)) {
      fail(
        'mixins:unsupported-event',
        `a Mixin may not set an inline handler through ${tag}; contribute a Foldkit handler (h.On…) instead`,
        { tag },
      )
    }
    const eventName = eventNameOf(tag, attribute)
    if (Option.isSome(eventName)) return claimEvent(tag, eventName.value)
    const attributeName = attributeNameOf(tag, attribute)
    if (REPLACES_CHILDREN.has(attributeName)) failStructural(tag)
    if (RESOLVER_OWNED.has(attributeName)) {
      fail(
        'mixins:attribute-conflict',
        `a Mixin may not set "${attributeName}" through ${tag}: the resolver writes the slot's one ${attributeName}; contribute classes or style instead`,
        { tag, attribute: attributeName, owner: 'resolver' },
      )
    }
    if (protectedAttributes.has(attributeName)) {
      fail('mixins:protected-attribute', `slot "${slot ?? '?'}" protects attribute "${tag}"`, {
        tag,
        attribute: attributeName,
      })
    }
    const owner = ownedAttributes.get(attributeName)
    if (owner !== undefined) {
      fail(
        'mixins:attribute-conflict',
        `two owners for "${owner.tag}": ${quoted(owner.source)} sets ${attributeName}, and ${quoted(source)} sets it again through ${tag}`,
        {
          tag,
          attribute: attributeName,
          owner: owner.tag,
          contributors: [owner.source, source],
        },
      )
    }
    ownedAttributes.set(attributeName, { tag, source })
  }

  const claimEvent = (tag: string, eventName: string): void => {
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
        `two owners for event "${eventName}": ${quoted(owner.source)} already owns it through "${owner.tag}", and ${quoted(source)} claims it through "${tag}"`,
        { tag, event: eventName, owner: owner.tag, contributors: [owner.source, source] },
      )
    }
    ownedEvents.set(eventName, { tag, source })
  }

  const applyMixinAttribute = (attribute: Attribute<Message> | ChildAttribute): void => {
    if (isChildAttribute(attribute)) {
      const inner = (attribute as { readonly attribute?: unknown }).attribute
      // As in the view's own: kept apart, Foldkit would draw one of two `Class` lists.
      if (isClass(inner)) {
        for (const token of splitClasses(inner.value)) addClass(token)
        return
      }
      if (isMount(inner)) return addMount(inner.action, attribute)
      if (isTagged(inner)) claim(inner._tag, inner)
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
      }),
      Match.orElse(other => {
        claim(other._tag, other)
        added.push(other)
      }),
    )
  }

  for (const attribute of base ?? []) addBase(attribute)

  for (const contribution of contributions) {
    source = contribution.source ?? 'a Mixin'
    for (const token of contribution.classes ?? []) addClass(token)
    for (const [property, value] of Object.entries(contribution.style ?? {})) {
      writeStyle(property, value, 'style')
    }
    for (const attribute of contribution.attributes ?? []) applyMixinAttribute(attribute)
    for (const mount of contribution.mounts ?? []) addMount(mount)
  }

  const emitted: Array<Attribute<Message> | ChildAttribute> = []
  if (classes.length > 0) emitted.push(classAttribute(classes.join(' ')))
  if (style.size > 0) {
    emitted.push(
      styleAttribute(Object.fromEntries(Array.from(style.values(), e => [e.property, e.value]))),
    )
  }
  emitted.push(...preserved, ...added)
  const composed = composeMounts(mounts, slot)
  if (composed !== undefined) emitted.push(composed)
  return emitted
}

/**
 * A child attribute's Mount sends the child's Messages, which only its own
 * boundary's dispatch lifts to the parent: run beside the others, it sends
 * through that and gives the composed stream nothing.
 */
const messagesOf = <Message>(
  held: HeldMount<Message>,
  element: Element,
  viewStateChanges: Parameters<MountAction<Message, any>['f']>[1],
): Stream.Stream<Message, unknown> => {
  const child = held.child
  if (child === undefined) return held.action.f(element, viewStateChanges)
  return Stream.unwrap(
    Effect.sync(() => {
      const dispatch = child.resolveMountDispatch?.resolve() ?? child.dispatch
      return held.action.f(element, viewStateChanges).pipe(
        Stream.tap(message => Effect.sync(() => dispatch(message))),
        Stream.drain,
      )
    }),
  )
}

const composeMounts = <Message>(
  mounts: ReadonlyArray<HeldMount<Message>>,
  slot: string | undefined,
): Attribute<Message> | ChildAttribute | undefined => {
  const first = mounts[0]
  if (first === undefined) return undefined
  if (mounts.length === 1) return first.child ?? mountAttribute(first.action)
  const slotOf = Option.fromUndefinedOr(slot)
  const name = `Mixins[${slot ?? 'slot'}](${mounts.map(({ action }) => action.name).join(',')})`
  return mountAttribute({
    name,
    args: {
      slot: slot ?? null,
      actions: mounts.map(({ action }) => ({ name: action.name, args: action.args })),
    },
    f: (element, viewStateChanges) =>
      Stream.mergeAll(
        mounts.map(held =>
          // A merge ends every stream in it when one fails, so each fails alone,
          // reported as `MountFailed`, and the rest go on: dispatched at the
          // element, since a Mount runs outside the application's resources.
          // One that ends interrupted is being torn down with its element.
          messagesOf(held, element, viewStateChanges).pipe(
            Stream.catchCause(cause =>
              Cause.hasInterruptsOnly(cause)
                ? Stream.empty
                : Stream.fromEffectDrain(
                    Reported.dispatch(element, mountFailed(held.action.name, slotOf, cause)),
                  ),
            ),
          ),
        ),
        { concurrency: 'unbounded' },
      ),
  })
}
