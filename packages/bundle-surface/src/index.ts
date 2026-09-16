/**
 * foldkit-bundle placements in a foldkit-surface Module: each placement is a
 * contract that owns the Model path its Link points at, so `Module.validate`
 * checks it against every other owner (Sync, Remote, another placement).
 */
import { Option, type Schema } from 'effect'
import { Link, type AnyPlaced, type AnyPlacedCollection, type Wrapper } from 'foldkit-bundle'
import {
  Module,
  type AppScope,
  type Contract,
  type FieldRef,
  type ModuleItem,
} from 'foldkit-surface'

type AnyPlacement = AnyPlaced | AnyPlacedCollection

// The application a ref-built Link came from, so its contract can name that owner.
const linkOwners = new WeakMap<object, object>()

/**
 * A Link from a Surface field ref: `App.model.search`. The contract of a
 * placement through it names the ref's application, so placing a child through
 * another application's ref is a `foreign-contract` finding.
 */
const link = <Root, Value, const Tag extends string, ChildMessage>(
  ref: FieldRef<Root, Value>,
  wrapper: Wrapper<Tag, ChildMessage>,
  options: { readonly when?: (parent: Root) => boolean } = {},
) => {
  const made = Link.make<Root, Tag, Value, ChildMessage>({
    read: root => Option.some(ref.get(root)),
    write: ref.set,
    wrapper,
    path: ref.dependency,
    ...options,
  })
  linkOwners.set(made, ref.owner)
  return made
}

/**
 * The contract of one placement or collection: it owns its Model path and names
 * the parent Message tags its Messages travel under.
 */
const contract = <
  Root,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
>(
  app: AppScope<Root, F, Cases>,
  placement: AnyPlacement,
): Contract => ({
  kind: 'bundle',
  name: placement.key,
  owner: linkOwners.get(placement.link) ?? app.owner,
  owns: [placement.link.path],
  observes: [],
  messages: placement.link.messages,
  metadata: [],
})

/** A Module of an assembly's placements plus any other contracts of the application. */
const module = <
  Root,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
>(
  app: AppScope<Root, F, Cases>,
  assembly: { readonly placements: ReadonlyArray<AnyPlacement> },
  items: readonly ModuleItem<Root>[] = [],
) => Module.make(app, [...assembly.placements.map(placement => contract(app, placement)), ...items])

export const BundleSurface = { link, contract, module } as const
