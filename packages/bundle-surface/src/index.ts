/**
 * foldkit-bundle placements in a foldkit-surface Module: each placement is a
 * contract that owns the Model path its Link points at, so `Module.validate`
 * checks it against every other owner (Sync, Remote, another placement).
 */
import { Option, type Schema } from 'effect'
import {
  Bundle,
  Link,
  type AnyMessage,
  type AnyPlaced,
  type AnyPlacedCollection,
  type Wrapper,
} from 'foldkit-bundle'
import {
  Module,
  type AppScope,
  type Contract,
  type FieldRef,
  type ModuleItem,
} from 'foldkit-surface'

type AnyPlacement = AnyPlaced | AnyPlacedCollection

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
    owner: ref.owner,
    ...options,
  })
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
  owner: ('owner' in placement.link ? placement.link.owner : undefined) ?? app.owner,
  owns: [placement.link.path],
  observes: [],
  messages: placement.link.messages,
  metadata:
    placement.argsSummary === undefined ? [] : [{ name: 'args', entries: [placement.argsSummary] }],
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

/**
 * The parent scope of `foldkit-bundle`, built from a Surface application, with
 * `module` bound to it: `const Page = BundleSurface.parent(App)`.
 */
const parent = <
  Root,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
>(
  app: AppScope<Root, F, Cases>,
) => {
  const scope = Bundle.parent({
    Model: app.Model as unknown as Schema.Codec<Root, unknown>,
    Message: app.Message as unknown as Schema.Codec<
      Schema.Schema.Type<typeof app.Message> & AnyMessage,
      unknown
    >,
  })
  return {
    ...scope,
    /** A Module of these placements plus the application's other contracts. */
    module: (
      assembly: { readonly placements: ReadonlyArray<AnyPlacement> },
      items: readonly ModuleItem<Root>[] = [],
    ) => module(app, assembly, items),
  }
}

export const BundleSurface = { link, contract, module, parent } as const
