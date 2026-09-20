# Documentation map

The package READMEs are references. These guides explain the architecture: why a
package exists, what owns the state involved, how it composes with the rest of
Foldkit Plus, and when another package is the better choice.

If you are new to the repository, do not read the design notes first.

## Recommended reading order

1. Read the [root README](../README.md) through **How they fit together**. The
   important idea is one Foldkit application — Model, Message, `update` — with
   extensions around it rather than parallel state systems.
2. Read or run [`examples/todo-app`](../examples/todo-app). It is the best
   application-level example: Surface, Sync/Durable, Agent, Mirror, and Mixins in
   one browser application, with the files listed in the order to read them.
3. Pick the guide for the problem you are solving below. Each guide explains the
   ownership boundary before the API.
4. Use the package README as the reference once you know which abstraction you
   need. Use [`examples/README.md`](../examples/README.md) to choose a focused
   runnable trace.

If you want to see almost everything wired together before reading any API, use
[`examples/kitchen-sink`](../examples/kitchen-sink). It covers fourteen
packages in one deterministic in-process trace; `foldkit-mirror` lives in the
todo app because it needs a URL/browser store. The packages added since
(Bundle, Primitives, React, and Entity, Form, and Crud) have focused examples of
their own, listed in [`examples/README.md`](../examples/README.md).

## Release posts

- [0.7: declare the domain once](./blog/0.7.0.md): Entity, Form, the drawn form,
  and Crud, and what changed in Remote to let them in.

## The vocabulary that repeats everywhere

| Term | Meaning |
| --- | --- |
| **Model** | The application's state. Local state still belongs here unless another system is its authoritative owner. |
| **Message** | Something that happened or an intent the application knows how to handle. Agent and Sync reuse this vocabulary instead of inventing their own actions. |
| **`update`** | The application's transition function. Foldkit Plus tries hard not to create a second reducer beside it. |
| **Submodel** | A child state machine embedded in the parent: its own Model slice, Message, and `update`. The parent stores the child Model, routes wrapped Messages to it, and the child can surface facts upward via `outMessage`. |
| **Bundle** | A Submodel packaged once so it can be placed one or many times with every part wired (init, update, Subscriptions, resources, view, helpers). Holds no state itself; the parent Model owns each placed slice. |
| **Projection** | A pure, typed view of part of the Model, plus metadata about what it observes or requires. |
| **Surface** | A named feature boundary: what it may observe and which Messages it may emit. Observes; never owns transitions. |
| **Command** | One-shot work caused by a transition. Runs once, then reports back as a Message. |
| **Subscription** | Ongoing work whose lifetime follows Model state. Scoped by a slice; restarts when that slice changes. |
| **Mount** | Element-scoped imperative work. Emits Messages while the element is live; cleans up on unmount. |
| **Resource / ManagedResource** | A dependency shared with Commands and Subscriptions, not a Message source. A `Resource` lives for the app lifetime; a `ManagedResource` is a stateful handle whose lifetime follows a Model slice. |
| **Wiring** | How one integration joins the application: which Messages it folds, what it runs at startup, what it subscribes to, and what it owns. |
| **Owner** | The one authoritative source for a datum. Mirrors observe; Remote caches server-owned facts; Sync owns replicated client-authored state through the durable log. |

Those terms are enough to understand most of the repository. Package-specific
vocabulary should refine them, not replace them.

## Guides by problem

| You are trying to… | Guide | Packages |
| --- | --- | --- |
| Let an LLM or another agent use the application through real application transitions | [Agents](./agents.md) | `foldkit-agent` + WebMCP/MCP/A2A/Agent Native adapters |
| Put server-owned entities in the Model without per-view fetch/cache logic | [Server-derived state](./remote.md) | `foldkit-remote`, `foldkit-remote-server`, optional `foldkit-remote-drizzle` |
| Work offline and reconcile several devices/tabs against a server order | [Replicated state](./replication.md) | `foldkit-sync` + `foldkit-durable` |
| Keep local Model state in the URL or a device store without making that store authoritative | [Mirrored state](./mirror.md) | `foldkit-mirror` |
| Package a Submodel once and place it several times or per key, with its Subscriptions, resources, and view wired | [`foldkit-bundle` README](../packages/bundle) | `foldkit-bundle`, `foldkit-bundle-surface` |
| Join several integrations and placements through one checked list instead of hand-wiring each | [Wiring](./wiring.md) | `foldkit-bundle`, `foldkit-bundle-surface`, `foldkit-surface` |
| Choose between a Surface and a Bundle, or combine them | [Surface versus Bundle](./surface-vs-bundles.md) | `foldkit-surface`, `foldkit-bundle` |
| Let callers restyle/decorate views through typed extension points | [View composition](./mixins.md) | `foldkit-mixins`, `foldkit-mixins-surface`, `foldkit-mixins-ui` |
| Understand how a replica is actually bound to a running Foldkit app | [Runtime binding](./sync-runtime-binding.md) | `Sync.mount` |
| Write a domain down once and have the client cache, the database binding, forms, and admin screens read it | [One domain declaration](./entity.md) | `foldkit-entity`, `foldkit-form`, `foldkit-mixins-form`, `foldkit-crud`, plus `foldkit-remote` and `foldkit-remote-drizzle` |

## Design lineage

If you want to understand where the architecture came from, read
[Prior art and design lineage](./prior-art.md). It traces the foundational
lineage from Elm, Foldkit, and Effect, then the subsystem influences from fate,
Logux, nuqs, Remix mixins, StyleX, `effect-atom-jsx`, and Agent Native. It also
separates conceptual inspiration from code that is directly adapted under a
third-party license.

A useful ownership shortcut:

```text
local UI state                         -> Model / update
server-owned facts                    -> Remote
client-authored state that must agree -> Sync + Durable
linkable / remembered local state     -> Model + Mirror
what an agent may see / do             -> Surface + Agent
view customization                     -> Mixins (never state)
```

## Package references

The full API reference for each package is its README under [`packages/`](../packages):

```text
Foundation       foldkit-surface + foldkit-metadata
Domain           foldkit-entity (declaration and selection; Remote and remote-drizzle read it)
Forms            foldkit-form (headless; on foldkit-bundle and foldkit-entity) + mixins-form (draws it)
Screens          foldkit-crud (an editor, a list, a detail and a remover, joined from a form, Remote operations, and their Entity) + mixins-crud (draws lists and details)
Content          foldkit-cms (drafts beside the row, derived lifecycle) + cms-drizzle (the audience boundary and drafts; no publish yet)
Agents           foldkit-agent + agent-webmcp / agent-mcp / agent-a2a / agent-native
Server data      foldkit-remote + remote-server / remote-drizzle
Replication      foldkit-sync + foldkit-durable
Persistence      foldkit-mirror
Submodels        foldkit-bundle + bundle-surface
Primitives       foldkit-primitives (media, net, time, state, motion, device, events, observers, dom)
Views            foldkit-mixins + mixins-surface / mixins-ui
React interop    foldkit-react + react-codegen
```

The names indicate roles, not a requirement that every package depend on every
other one. In particular, `foldkit-durable` and core `foldkit-mixins` are useful
without Surface; the bridge packages connect them to the broader application
architecture where appropriate.

## Runnable examples

See the [examples index](../examples/README.md) for the recommended order and
what each trace proves. Every example prints a deterministic transcript whose
test pins the important lines, so the documentation examples double as
executable claims.

## Reference and maintenance docs

- [Releases](./releases.md) — every workspace package's current version, publish
  status, and dependency expectations.
- [Benchmarks](./benchmarks.md) — `foldkit-sync` local costs and one
  `foldkit-durable` append/storage reading.
- [Improvements](./improvements.md) — design/project suggestions, including
  resolved items. Useful for maintainers, not an onboarding document.

## Design notes: rationale, not onboarding

[`docs/design/`](./design/) contains the revision plan, design records, substrate
probes, and older brainstorms. Start there only when you are changing an
abstraction or trying to understand why a particular trade-off was chosen. The
[design index](./design/README.md) distinguishes current decision documents from
provenance/history.

[`sync-dx.md`](./sync-dx.md) is superseded by the revision plan and kept for
history.