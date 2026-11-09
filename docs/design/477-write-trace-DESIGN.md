# #477: a declared write traced to the region that draws it

Status: spike done (2026-11-08). The evidence is
[`packages/remote/test/writeTrace.test.ts`](../../packages/remote/test/writeTrace.test.ts):
each `it` records one edge below, run through the real APIs.

**Verdict.** The existing APIs answer every edge of the path. The trace found
one place where an edge answered "unaffected" for what was unknown, which is
now fixed, and one place where an answer's reason was lost, now kept (#489).
Neither calls for a new graph abstraction, so none is added. The
static check in edge 2 is twenty lines over two existing functions. It should
become an API when #439, its first real consumer, is built, and not before.

## The fixture

A shop with products (`name`, `status`) and categories (`name`), where each
product points at its category. Two declared writes:

- `SetStatus` updates a product's `status`.
- `RenameCategory` updates a category's `name`, which only a path reads.

Four lists of products, all on one page Surface (`Shop`):

| List | Body | What it reads |
| --- | --- | --- |
| `Active` | `status = 'active'`, ordered by name | the product's `status` |
| `Named` | ordered by name | only the product's name and id |
| `InToys` | the category's name is `'toys'` | `Category.name`, through `Product.category` |
| `Opaque` | none (`Query.make`) | unknown: only its server knows |

There was no existing example that connects a declared write, a query body, a
Remote read and an active Surface in one place small enough to read. The CMS
has all four, but behind its editor. So the fixture is new, and needs no
wiring beyond what an application writes.

## The path, edge by edge

### 1. The write: what it may change

- **Source:** the declaration. `Write.writes(write)` lists the members a
  write may write: `SetStatus` writes `Product.status`, and `RenameCategory`
  writes `Category.name`.
- **Scope:** each member carries its owner's identity (`member.owner.token`),
  not only the Entity's name.
- **Precision:** exact for a declared single-row `Write`. A handler mutation
  (`Mutation.make` with a server `run`) declares nothing, so what it writes is
  unknown. The client never assumes it wrote nothing: its answer's patches
  are what move the store.
- **Authority:** the server. A write's declaration is what the client
  predicts with. What the server's answer says it wrote is what the store
  takes.

### 2. The queries a write can reach, from declarations alone

- **Source:** `Query.dependencies(body)`. `fields` lists what the judged row's
  own predicate and order read. `reaches` lists what a path, an exists, or a
  path from the viewer reads in other rows.
- **Result:** compared by owner identity with `Write.writes`:
  - `SetStatus` reaches `Active`, but not `Named` or `InToys`.
  - `RenameCategory` reaches `InToys`, through its reaches; `fields` alone
    would miss it.
  - `Opaque` is `unknown` for both writes, never "unaffected".
- **Identity:** compared by identity, a write to a second Entity also defined
  as `Product` reaches none of these lists. `explain()`'s `dependencies`
  names fields by Entity name alone, because the owner's token is a symbol
  and the explanation is plain data, so it cannot tell the two apart. That is
  right for display. A consumer that decides anything uses
  `Query.dependencies`, which keeps the identity.
- **Precision:** this says which lists are *candidates*. Whether a row joins,
  leaves or moves within a list depends on the row's values and the list's
  pages, which is edge 3's job.
- **No API yet.** Nothing in the packages asks this question today. The test's
  `candidate` is twenty lines over `Write.writes` and `Query.dependencies`.
  #439's invalidation map is the first consumer that needs it, and should own
  the function when it is built.

### 3. The client's decision, from the runtime path

- **What crosses the network:**
  - A mutation's answer (`MutationSucceeded`) carries the server's patches of
    the rows it wrote (`NormalizedPatch`: entity, id, the field values). It
    also carries any lists the client asked back.
  - A live stream carries the same as events.
  - The client works out each row's changed fields against its store
    (`changesOf`), and judges each held list against them (`impactOn`).
- **Result:**

| Write | `Active` | `Named` | `InToys` | `Opaque` |
| --- | --- | --- | --- | --- |
| `SetStatus` p2 → retired | placed: saw leaves | kept | kept | fetched again |
| `RenameCategory` c1 → games | kept | kept | judged again through the path, both rows leave, fetched to confirm | fetched again (after the fix) |

- **Source:** `impactOn` decides `Kept`, `Placed` or `Invalidated`, with a
  reason. A list whose body reads other rows is then judged again over the
  store (`rejudged`), and fetched.
- **Precision:**
  - A placement is exact where the client holds the rows and the list's
    pages.
  - Anything it cannot judge is invalidated, including a row whose path
    reaches a row it lacks, an order it cannot place, and a member a server
    read rule filters on.
  - A list with no body is invalidated by any change.
- **Authority:**
  - The server decides membership. A placement is the client's deduction,
    which the next read or live event confirms.
  - The journal's order (Sync) is not involved: Remote is a cache of the
    server's answers, and a held list is never the authority on what it holds.
  - An invalidation reason names only the client's own store keys and the
    query's name, never a field the server withheld.

**Found and fixed.** `impactOn` returned `Kept` for a change to an Entity other
than the list's own, before it looked at whether the list has a body. So a
`Query.make` list of products stayed `Ready` after a category was renamed,
though its server may filter by that name. That is "missing edge means
unaffected", the failure this issue was written to find. A list with no body
is now invalidated by any change the client sees, to any Entity, at the cost
of a refetch. The CMS's `…BySlug` lists are of this kind. The test's
`writeTrace.mutations.ts` restores the old rule and is killed.

**Information lost, then kept (#489).** `impactOn` gave a reason, but the
reducer that applies an answer (`bodies.ts`) matched `Invalidated: () => …` and
dropped it, so the connection kept only `stale: true`. `why(...)` could say a
list was stale but not why: the issue's "first information loss". The Remote
Model now keeps each stale list's reason (`staleBecause`), and `why` reports
it as an `Invalidated` term beside the list's `List` term. It is runtime state:
not persisted, collected with its list, and defaulted for a Model encoded
before it existed.

### 4. The Surfaces that read a list

- **Source:** the active record that `subscriptions` takes. Given it,
  `explain(Data, model, list, { surfaces })` names every Surface instance
  reading the connection (`['Shop']`), and why each is active where that is a
  readable fact (`Surface.when`).
- **Precision:** exact for the Model it is asked of. A Surface placed with
  `Surface.at` gives no activation reason, since a callback cannot be read.
  Without the record the member is absent, not empty.
- **Authority:** a Surface observes, and owns nothing. Naming it says who reads
  the list, not who may.

### 5. The region that draws a list

- **Source:**
  - `SlotView.region` draws over `Projection.derive` of the list's read.
  - A Remote read declares no Model path (its data is named by its metadata,
    #385), so the region reads it on every render.
  - It is drawn again only when the read gives a different value.
- **Result:** after `SetStatus`, the `Named` read hands back the same object,
  because Remote memoizes a read by the store entries it visited. So its
  region is reused. `Active`'s read is a new value, so its region is drawn
  again.
- **Precision:** the region decision is by value at render time, after the
  fact, not predicted from the declarations. The root render runs either way:
  skipping it is #439's.
- **What this does not say:** which DOM nodes patch. A Surface's allowed
  Messages say what it may cause, not what it draws.

## What already answers the question

| Question | Answered by |
| --- | --- |
| What may this write change? | `Write.writes` |
| Which queries read that? | `Query.dependencies` (`fields` and `reaches`), by identity |
| What did the client do to each held list, and why? | `impactOn`, `rejudged` (reason lost in the reducer) |
| Which Surfaces read the list? | `explain(..., { surfaces })` |
| Is the list stale, in flight, or failed? | `why` |
| Was the region drawn again? | `Projection.derive`'s identity, as `SlotView.region` reads it |

## Decisions

1. **Fixed:** a list with no body is invalidated by any change, of any Entity.
2. **Built, #489:** an invalidation's reason is kept, so `why` says why a list is
   being fetched again.
3. **Not built:** the static candidate check (edge 2). It belongs to #439.
4. **Not built:** a graph value spanning the edges. Each edge already has an
   owner and an API, and a parallel format would duplicate them (#190 plans the
   contract graph).
5. **Unchanged:** `explain()` names fields by Entity name. It is display data,
   and identity lives in `Query.dependencies`.

## Checks

- `packages/remote/test/writeTrace.test.ts` passes (with #489's reasons), and `impact.test.ts`
  states both cases: an Owner write restarts nothing without a body-less list
  held, and invalidates one that is.
- `writeTrace.mutations.ts` is killed.
- The Remote suite and the full unit, browser and type checks were run.
