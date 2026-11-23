/**
 * Ported from `effect-atom-jsx/src/Element.ts` `Capability`, without Handle
 * objects. Inheritance is metadata: a behavior that needs Interactive can
 * attach to TextInput. A token answers for its own ancestors, so one made by
 * another copy of this package still fits; the registry resolves a bare name.
 * Lookups go through a Map so `__proto__` is a legal name.
 */
import * as MetadataToken from './metadataToken.js'

export type CapabilityParent = string | MetadataToken.MetadataToken<'element.capability', string>

export interface Capability<
  Name extends string = string,
  Extends extends readonly CapabilityParent[] = readonly [],
> extends MetadataToken.MetadataToken<'element.capability', Name> {
  readonly extends: Extends
}

export type Any = Capability<string, readonly CapabilityParent[]>
export type NameOf<T> = MetadataToken.NameOf<T>
export type NamesOf<T extends readonly unknown[]> = MetadataToken.NamesOf<T>
export type ExtendsOf<T> =
  T extends Capability<any, infer Extends> ? MetadataToken.NameOf<Extends[number]> : never
export type AssignableNamesOf<T> = T extends string
  ? T
  : T extends Capability<any, infer Extends>
    ? MetadataToken.NameOf<T> | AssignableNamesOf<Extends[number]>
    : MetadataToken.NameOf<T>

export type Satisfies<Actual, Required extends { readonly name: string }> =
  Required['name'] extends AssignableNamesOf<Actual> ? true : false

const parentsByName = new Map<string, ReadonlyArray<CapabilityParent>>()
const registry = new Map<string, Any>()

export const is = (value: unknown): value is Any =>
  MetadataToken.is(value) && value.kind === 'element.capability'

export const make = <
  const Name extends string,
  const Extends extends readonly CapabilityParent[] = readonly [],
>(
  name: Name,
  options?: { readonly extends?: Extends },
): Capability<Name, Extends> => {
  if (name === '') {
    throw new Error('Capability name must be non-empty')
  }
  const parents = (options?.extends ?? []) as Extends
  const parentNames = parents.map(parent => MetadataToken.nameOf(parent))
  const existing = registry.get(name)
  if (existing !== undefined) {
    const existingNames = existing.extends.map(parent => MetadataToken.nameOf(parent))
    if (
      existingNames.length === parentNames.length &&
      existingNames.every((parentName, index) => parentName === parentNames[index])
    ) {
      return existing as Capability<Name, Extends>
    }
    throw new Error(`Capability "${name}" is already defined with a different extends list`)
  }
  const frozenParents = Object.freeze([...parents]) as Extends
  parentsByName.set(name, frozenParents)
  const capability: Capability<Name, Extends> = {
    ...MetadataToken.make('element.capability', name),
    extends: frozenParents,
  }
  registry.set(name, capability)
  return Object.freeze(capability)
}

/**
 * A value's declared parents: a token carries its own, so a capability made by
 * another copy of this package still knows its ancestors; a bare name — or a
 * bare metadata token — resolves through this copy's registry.
 */
const parentsOf = (value: CapabilityParent): ReadonlyArray<CapabilityParent> =>
  (typeof value === 'string' ? undefined : (value as Partial<Any>).extends) ??
  parentsByName.get(MetadataToken.nameOf(value)) ??
  []

/** True when `value` is `base` or inherits from it. Ported from AF-UI. */
export const extendsCapability = (value: string | Any, base: string | Any): boolean => {
  const baseName = MetadataToken.nameOf(base)
  const visited = new Set<string>()
  const stack: Array<CapabilityParent> = [value]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) continue
    const currentName = MetadataToken.nameOf(current)
    if (currentName === baseName) return true
    if (visited.has(currentName)) continue
    visited.add(currentName)
    stack.push(...parentsOf(current))
  }
  return false
}

export const satisfies = (actual: string | Any, required: string | Any): boolean =>
  extendsCapability(actual, required)

export const names = (capability: Any): ReadonlyArray<string> => {
  const seen = new Set<string>()
  const walk = (value: CapabilityParent) => {
    const name = MetadataToken.nameOf(value)
    if (seen.has(name)) return
    seen.add(name)
    for (const parent of parentsOf(value)) walk(parent)
  }
  walk(capability)
  return [...seen]
}

export const describe = (
  capability: Any,
): { readonly name: string; readonly extends: ReadonlyArray<string> } => ({
  name: capability.name,
  extends: capability.extends.map(parent => MetadataToken.nameOf(parent)),
})

export const Base = make('Base')
export const Interactive = make('Interactive', { extends: [Base] })
export const Container = make('Container', { extends: [Interactive] })
export const Focusable = make('Focusable', { extends: [Interactive] })
export const TextInput = make('TextInput', { extends: [Focusable] })
export const Draggable = make('Draggable', { extends: [Interactive] })
export const Collection = make('Collection', { extends: [Base] })
