/**
 * Typed reads over a resolved `SlotAttributes` bundle. Foldkit's tagged
 * attribute union narrows on `_tag`, so a lookup by tag returns that variant's
 * own fields (`value`, `message`, `key`, `action`) without a cast.
 */
import type { Attribute } from 'foldkit/html'
import { isChildAttribute, isTagged } from './attribute.js'
import type { SlotAttributes } from './resolver.js'

/** Every Foldkit attribute tag: `'Class'`, `'OnClick'`, `'DataAttribute'`, … */
export type Tag = Attribute<never>['_tag']

/** The attribute variant carrying `T`. */
export type Of<Message, T extends Tag> = Extract<Attribute<Message>, { readonly _tag: T }>

/** The tag of one bundle entry; `undefined` for an opaque `ChildAttribute`. */
export const tagOf = <Message>(attribute: SlotAttributes<Message>[number]): Tag | undefined =>
  !isChildAttribute(attribute) && isTagged(attribute) ? attribute._tag : undefined

const hasTag =
  <Message, T extends Tag>(tag: T) =>
  (attribute: SlotAttributes<Message>[number]): attribute is Of<Message, T> =>
    tagOf(attribute) === tag

/** The first attribute with `tag`, typed as that variant. */
export const find = <Message, T extends Tag>(
  attributes: SlotAttributes<Message>,
  tag: T,
): Of<Message, T> | undefined => attributes.find(hasTag<Message, T>(tag))

/** Every attribute with `tag`, in bundle order. */
export const filter = <Message, T extends Tag>(
  attributes: SlotAttributes<Message>,
  tag: T,
): ReadonlyArray<Of<Message, T>> => attributes.filter(hasTag<Message, T>(tag))
