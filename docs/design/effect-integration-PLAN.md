# Effect 4.1.4 Seamless Integration Plan

> **Audit baseline:** Effect `4.1.4`, `@effect/platform-browser` `4.1.4`, `@effect/sql-pg` `4.1.4`, TypeScript `7.0.2`.
> **Current state:** ~85–90% native Effect 4.1.4 (`Context.Service` / `Context.Reference`, `Layer`, `Schema.TaggedError` / `Data.TaggedError`, `Option`, `Result`, `Stream`, `Scope`, `Schema`).
> **Goal:** Close every remaining seam where Effect idioms, resource safety, deterministic testing (`TestClock`), tracing (`Effect.withSpan`), or runtime reuse break down.

---

## Executive Summary of Gaps

| # | Area | Package(s) | Current Friction | Target State |
|---|------|-----------|------------------|--------------|
| 1 | Verification & testing helpers | `metakit` (`storeCheck.ts`, `temporal.ts`) | Raw `Promise`, `setTimeout`, manual `close()` / `finish()` | Native `Effect` + `Scope` + `Clock` (`checkStoreEffect`, `walkEffect`), keeping `Promise` facades as thin wrappers |
| 2 | Runtime & store boundaries | `metakit` (`store.ts`, `transition.ts`, `machine.ts`) | `Store.mount` throws synchronously; `supplied` is passed manually | `Store.check` (`Result`) & `Store.mountEffect` (`Effect`); optional `Transition.runEffect` / `Machine.updateEffect` pulling `Clock` / `Random` / services |
| 3 | Unified per-request `Effect` & `ManagedRuntime` | `ssr`, `remote-server`, `sync` | `ssr` calls `Effect.runPromise` 4× per request; `remote-server` rebuilds `Layer` per request; `sync` uses fire-and-forget `runPromise` + manual `Scope.make()` | Single composed `Effect` pipeline per request in `ssr`; `ManagedRuntime` support in `remote-server`; caller-scoped lifecycle in `sync` |
| 4 | Native Effect Observability | `remote-server`, `remote-drizzle`, `metakit/prove`, `sync`, `guard`, `ssr` | Custom `Diagnostics` only; no `Effect.withSpan` / `Effect.fn` / `Metric` | `Effect.withSpan` on HTTP, RPC, DB, Z3, and SSR boundaries; optional `Diagnostics` -> `Effect.log` bridge |
| 5 | `Pipeable` & `Inspectable` on descriptors | `metakit` (`path.ts`, `transition.ts`, `machine.ts`, `relation.ts`, `policy.ts`, `expr.ts`) | `Expr` and `Fn` are `Pipeable`; other descriptors lack `Pipeable` / `Inspectable` | Consistent `Pipeable` + `Inspectable.NodeInspectSymbol` across `metakit` descriptors (branded domain primitives like `Fixed`/`Money`/`Ordinal`/`Id` already work natively with `Equal`/`Hash`) |
| 6 | Deterministic `Clock` (remove raw `Date.now()` / `setTimeout`) | `agent`, `agent-mcp`, `agent-a2a`, `remote`, `sync`, `ssr`, `metakit/prove` | Non-DOM server/protocol code calls `Date.now()` / `setTimeout` directly | Use `Clock.currentTimeMillis` / `Effect.sleep` inside Effect pipelines so `TestClock` controls all time-dependent logic |
| 7 | Typed `Config` integration | `host`, `ssr`, `remote-server`, `media` | Plain env object / manual parsing; `auth` uses `Redacted` | Optional Effect `Config` schemas for server/host configuration alongside existing plain config objects |

---

## Phased Implementation Plan

### Phase 1 — `metakit` Native Effect Surfaces (Gaps 1, 2, 5)

**Why first:** Zero cross-package blast radius; unlocks Effect-native testing, `Scope`-managed store probes, and `Effect.gen` ergonomics for all `metakit` consumers.

#### 1.1 `metakit/store` (`packages/metakit/src/store.ts`)
- Add `Store.check(store, needed): Result.Result<void, StoreRefused>` (pure, never throws, yieldable directly in `Effect.gen`).
- Add `Store.mountEffect(store, needed): Effect.Effect<void, StoreRefused>` (delegates to `Store.check`).
- Keep `Store.mount(store, needed): void` as a thin `Result.getOrThrow(check(store, needed))` wrapper for backwards compatibility.

#### 1.2 `metakit/store/check` (`packages/metakit/src/storeCheck.ts`)
- Add `EffectStoreTx`, `EffectStoreConnection`, and `EffectStoreAdapter` (with `connect: Effect.Effect<EffectStoreConnection, E, Scope.Scope>` so connection cleanup is automatic via `Scope`, eliminating manual `close()`).
- Implement `checkStoreEffect(declared, adapter, options): Effect.Effect<StoreReport, E>`:
  - Replace `setTimeout(resolve, 0)` barrier with `Deferred` + `Effect.race(Deferred.await(gate), Effect.yieldNow)` (or `Effect.sleep` via `Clock`).
  - Run concurrent writers with `Effect.all([...], { concurrency: 'unbounded' })` inside `Effect.scoped`.
- Re-implement `checkStore` (existing Promise API) as a thin adapter over `checkStoreEffect` via `Effect.tryPromise` + `Effect.acquireRelease` so there is one source of truth.

#### 1.3 `metakit/temporal` (`packages/metakit/src/temporal.ts`)
- Add `EffectStep<World, Name, E, R>` (`run: (world: World) => Effect.Effect<void, E, R>`) and `EffectScenario<World, Name, E, R>`:
  - `initial: Effect.Effect<World, E, Scope.Scope | R>` (replaces manual `finish?: (world) => Promise<void>` with `Scope`).
  - `holds: (world: World, ran: ReadonlyArray<Name>) => Effect.Effect<Option.Option<string>, E, R>`.
- Implement `walkEffect(scenario, options): Effect.Effect<WalkResult<Name>, never, R>` with automatic `Effect.scoped` teardown per run and per shrink candidate, catching typed errors and defects via `Effect.exit` + `Cause.pretty`.
- Keep `walkAsync` as a thin wrapper calling `walkEffect` with `Effect.runPromise`.

#### 1.4 `metakit/transition` & `metakit/machine` (`packages/metakit/src/transition.ts`, `packages/metakit/src/machine.ts`)
- Add `Transition.runEffect(tr, state, input, supplied?): Effect.Effect<TransitionResult<State, Emit>, TransitionError>` (and `Machine.updateEffect`) so callers in `Effect.gen` don't have to bridge `Result` manually when composing with Effect services.
- Note: in Effect 4, `Result` is already yieldable via `yield* Transition.run(...)` — verify this in a type+runtime test and only add `runEffect` where `Supplied` injection from Effect `Clock` / services adds genuine value (e.g. `SuppliedClock` / `Transition.withClock`).

#### 1.5 `Pipeable` & `Inspectable` on `metakit` Descriptors
- Add `Pipeable` (`Pipeable.Prototype`) and `Inspectable.toJSON` / `NodeInspectSymbol` to:
  - `Expr` (`packages/metakit/src/expr.ts` — already `Pipeable`, add `Inspectable` printing `Expr.format`)
  - `Path` (`packages/metakit/src/path.ts`)
  - `Transition` (`packages/metakit/src/transition.ts`)
  - `Machine` (`packages/metakit/src/machine.ts`)
  - `Relation` (`packages/metakit/src/relation.ts`)
  - `Policy` (`packages/metakit/src/policy.ts`)
  - `Fn` (`packages/metakit/src/fn.ts` — already `Pipeable`, add `Inspectable`)
- **Verification:** `tsc -b packages/metakit examples/metakit`, unit tests for `checkStoreEffect`, `walkEffect`, `Store.check`, `Pipeable`/`Inspectable`, plus `pnpm --filter metakit build` (zero `any` in `.d.ts`).

---

### Phase 2 — Unified Per-Request Effect Pipelines & `ManagedRuntime` (Gap 3)

**Why second:** High production impact — fixes split tracing/context in SSR, avoids per-request Layer rebuilds on Node/Bun servers, and eliminates leaked fibers/scopes in `sync`.

#### 2.1 `foldkit-ssr` (`packages/ssr/src/index.ts`)
- Refactor `renderPage` (lines 1881–1910) into a single `renderPageEffect(request: Request): Effect.Effect<EntryResult, never, ...>`:
  - Replace the 4 separate `await Effect.runPromise(...)` calls (`pageKey`, `store.match`, `Diagnostics.report`, `store.put`) with `yield*` inside one `Effect.gen`.
  - Replace `Date.now()` on line 1893 with `yield* Clock.currentTimeMillis`.
  - Execute `Effect.runPromise` **once** at the outer `renderPage` HTTP boundary.
- Audit the remaining `Effect.runPromise` sites in `packages/ssr/src/index.ts` (lines 1662, 1690, 1776) and collapse them into the same per-request Effect where possible.

#### 2.2 `foldkit-remote-server` (`packages/remote-server/src/fetch.ts`)
- Extract `serveEffect(config): (request: Request, env: Env) => Effect.Effect<Response, never, R | RP | Scope.Scope>` so callers can compose `remote-server` inside an existing Effect HTTP server (`@effect/platform` `HttpRouter`, custom middleware, or a `ManagedRuntime`) without crossing a Promise boundary.
- Add an optional `runtime?: ManagedRuntime.ManagedRuntime<R | RP>` (or `serveWithRuntime`) path for long-lived Node/Bun servers so DB pools and services are initialized once at startup instead of rebuilt per request, while preserving per-request `config.layer(env)` for Cloudflare Workers.
- Keep `serveFetch` calling `serveEffect` once per request.

#### 2.3 `foldkit-sync` (`packages/sync/src/journal.ts`, `packages/sync/src/presence.ts`, `packages/sync/src/do.ts`)
- Add `Scope`-managed entry points (`openJournalEffect`, `attachPresenceEffect`) that fork background fibers with `Effect.forkScoped` instead of manual `Effect.runSync(Scope.make())` + `Fiber.interrupt` + fire-and-forget `void Effect.runPromise(...)`.
- Keep existing imperative wrappers delegating to the scoped Effect implementations for backwards compatibility.
- In `packages/guard/src/sync.ts` and `packages/guard/src/may.ts`: expose `Effect`-returning variants alongside the sync `Effect.runSync` helpers so Effect-native callers never drop fiber context.

- **Verification:** `tsc -b packages/ssr packages/remote-server packages/sync packages/guard`, targeted unit & e2e tests for `ssr`, `remote-server`, `sync`, and `guard`.

---

### Phase 3 — Native Effect Observability (`withSpan` / `Effect.fn` / `Logger`) (Gap 4)

**Why third:** Once Phase 2 unifies per-request Effects, adding `Effect.withSpan` gives end-to-end OpenTelemetry traces across SSR → Remote RPC → Guard → Drizzle/SQL → MetaKit Prover with minimal code.

#### 3.1 Core Span Instrumentation
Add `Effect.withSpan` (with safe, low-cardinality attributes — never PII or secrets) to:
- `packages/remote-server/src/fetch.ts`: `remote.fetch` (method, path), `remote.answer` (kind: query/mutation/live, target name).
- `packages/remote-drizzle/src/index.ts` / `plans.ts`: `remote.drizzle.query`, `remote.drizzle.mutate`.
- `packages/guard/src/server.ts`: `guard.readPlan`, `guard.writeRequirement`.
- `packages/ssr/src/index.ts`: `ssr.renderPage` (cache hit/miss attribute).
- `packages/metakit/src/prove/solve.ts`: `metakit.prove.z3` (solver, goal count, outcome).
- `packages/sync/src/transport.ts` & `journal.ts`: `sync.exchange`.

#### 3.2 `Diagnostics` ↔ Effect `Logger` Bridge
- Provide a small `Layer` helper (e.g. `Diagnostics.toEffectLogger` in `packages/surface/src/diagnostics.ts`) that forwards structured `Diagnostics` reports into `Effect.logWarning` / `Effect.logError` with `Effect.annotateLogs`, so apps using Effect's JSON/OTel logger receive all framework diagnostics automatically.

- **Verification:** Add a unit test using an in-memory `Tracer` / `Logger` `Layer` proving that a single request produces nested spans (`remote.fetch` → `remote.answer` → `guard` → `drizzle`) and that `metakit/prove` emits `metakit.prove.z3` spans.

---

### Phase 4 — Deterministic `Clock` Across Non-DOM Code (Gap 6)

**Why fourth:** Eliminates flaky wall-clock timing in tests and enables `TestClock.adjust` across agent, remote, sync, and prover timeouts.

#### 4.1 Audit & Replace Non-DOM `Date.now()` / `setTimeout`
Replace wall-clock calls inside Effectful code with `Clock.currentTimeMillis` / `Effect.sleep` / `Effect.timeout`:
- `packages/agent/src/audit.ts`, `packages/agent/src/invocation.ts`, `packages/agent-mcp/src/handler.ts`, `packages/agent-a2a/src/handler.ts`
- `packages/remote/src/coalesce.ts`, `packages/remote/src/domain.ts`, `packages/remote/src/liveReads.ts`
- `packages/metakit/src/prove/solve.ts` (Z3 timeout / elapsed timing)
- `packages/sync/src/do.ts` (Durable Object alarm timestamping, keeping `armAlarm` boundary compatible)

*(Note: DOM/browser animation & pointer timers in `packages/primitives/src/dom/*`, `packages/mixins-ui/*`, and `packages/richtext-dom/*` intentionally use `requestAnimationFrame` / DOM timers and are out of scope.)*

- **Verification:** Add `TestClock`-driven tests in `packages/remote/test` and `packages/agent/test` verifying deterministic expiration/coalescing without real wall-clock waits.

---

### Phase 5 — Optional `Config` Integration for Server/Host Packages (Gap 7)

**Why last:** Additive ergonomics for Effect-first deployments; zero breaking changes to plain-object configs.

- Add `Config`-backed `Layer` constructors (alongside existing plain config constructors) for:
  - `packages/remote-server`: `maxBodyBytes`, `path` from `Config`.
  - `packages/host` / `packages/ssr`: `buildId`, cache TTLs, base URL from `Config`.
  - `packages/media`: upload size limits, signing secrets (`Config.redacted`) from `Config`.
- Ensure all secrets use `Config.redacted` (matching `packages/auth/src/server.ts`).

- **Verification:** Unit tests using `ConfigProvider.fromMap(...)` confirming typed parsing and `Redacted` secret handling.

---

## Cross-Cutting Constraints & Guardrails

1. **Zero breaking changes:** Every existing Promise or sync entry point (`Store.mount`, `checkStore`, `walkAsync`, `serveFetch`, `renderPage`) remains supported as a thin facade over the Effect-native core.
2. **Zero `any` in emitted `.d.ts`:** Every new `Effect` / `Layer` / `Scope` generic must pass `scripts/declared-any.mjs` and `exportMatrix` TS2883 checks.
3. **Cloudflare Workers compatibility:** Per-request `Layer` creation (`config.layer(env)`) stays the default for Workers; `ManagedRuntime` is opt-in for long-lived Node/Bun hosts.
4. **Commit cadence:** One focused commit per phase (or sub-phase), verified with `tsc -b`, targeted unit tests, `pnpm tags:check`, and package builds before moving to the next phase.
