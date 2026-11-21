--------------------------- MODULE WritesInvalidation ---------------------------
(***************************************************************************)
(* Formal TLA+ specification of Phase 2 dependency-driven invalidation:    *)
(*   - Writes.of (`all` / `own` epoch counters + `current` root identity)  *)
(*   - Per-projection metadata coverage (registered vs unregistered store) *)
(*   - Bundle.at (`keptDrawing` + `onNone` slot eviction)                  *)
(*   - Remote `observeEntry` (`storeOnly` + `Surface.when` activation)     *)
(*                                                                         *)
(* Safety invariant: After any Render step (and across any interleaving of *)
(* tracked declared/undeclared Messages, untracked Model mutations,        *)
(* Bundle hide/show cycles, and clock ticks), no cached drawing or read    *)
(* plan ever disagrees with the true projection of the current Model.      *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Vals,        \* Finite value domain per field, e.g. {0, 1}
  MaxEpoch,    \* Bound on epoch counters for finite TLC model checking
  MaxClock     \* Bound on discrete clock ticks

VARIABLES
  model,        \* [title |-> v, count |-> v, remote |-> v, unreg |-> v, route |-> v, bundle |-> v]
  modelVer,     \* Monotonic object identity of `model` (models JS reference identity ===)
  currentVer,   \* Tracked `current` Model identity (0 = Option.none)
  allEpoch,     \* Global redraw counter (`all`)
  ownEpoch,     \* [Region -> Nat] per-region redraw counter (`region.own`)
  regionCache,  \* [Region -> [all |-> Nat, own |-> Nat, val |-> Vals, drawn |-> BOOLEAN]]
  bundlePresent,\* BOOLEAN: whether Bundle.at is Some or None
  bundleSlot,   \* [valid |-> BOOLEAN, epoch |-> Nat, val |-> Vals]
  observeCache, \* [valid |-> BOOLEAN, remote |-> Vals, route |-> Vals, until |-> Nat, ask |-> Vals]
  clock,        \* Discrete clock 0..MaxClock
  rendered      \* BOOLEAN: TRUE immediately after a RenderAll step

vars == <<model, modelVer, currentVer, allEpoch, ownEpoch, regionCache,
          bundlePresent, bundleSlot, observeCache, clock, rendered>>

Regions == {"Header", "Tally", "DerivedRemote", "PlannedUnreg", "Opaque"}

\* True projection of each region from `model`
TrueVal(r, m) ==
  CASE r = "Header"        -> m.title
    [] r = "Tally"         -> m.count
    [] r = "DerivedRemote" -> m.remote
    [] r = "PlannedUnreg"  -> m.unreg
    [] r = "Opaque"        -> m.title

\* Regions affected by each declared Message tag (per-projection metadata coverage!)
\* - Renamed writes ['title'] -> Header, PlannedUnreg (unregistered metadata -> Option.none), Opaque
\* - Counted writes ['count'] -> Tally, PlannedUnreg, Opaque
\* - RemoteSettled writes ['remote'] (registered contract) -> DerivedRemote, PlannedUnreg, Opaque
\* - RouteChanged writes ['route'] -> PlannedUnreg, Opaque
\* - BundleEdited writes ['bundle'] -> PlannedUnreg, Opaque (and bumps bundleEpoch)
AffectedBy(tag) ==
  CASE tag = "Renamed"       -> {"Header", "PlannedUnreg", "Opaque"}
    [] tag = "Counted"       -> {"Tally", "PlannedUnreg", "Opaque"}
    [] tag = "RemoteSettled" -> {"DerivedRemote", "PlannedUnreg", "Opaque"}
    [] tag = "RouteChanged"  -> {"PlannedUnreg", "Opaque"}
    [] tag = "BundleEdited"  -> {"PlannedUnreg", "Opaque"}
    [] OTHER                 -> Regions

Init ==
  /\ model = [title |-> 0, count |-> 0, remote |-> 0, unreg |-> 0, route |-> 0, bundle |-> 0]
  /\ modelVer = 1
  /\ currentVer = 0
  /\ allEpoch = 0
  /\ ownEpoch = [r \in Regions |-> 0]
  /\ regionCache = [r \in Regions |-> [all |-> 0, own |-> 0, val |-> 0, drawn |-> FALSE]]
  /\ bundlePresent = TRUE
  /\ bundleSlot = [valid |-> FALSE, epoch |-> 0, val |-> 0]
  /\ observeCache = [valid |-> FALSE, remote |-> 0, route |-> 0, until |-> 0, ask |-> 0]
  /\ clock = 0
  /\ rendered = FALSE

\* Helper: bump `all` if `modelVer /= currentVer`, then bump `own` for affected regions
TrackedDeclared(tag, newVal) ==
  /\ allEpoch < MaxEpoch
  /\ modelVer < MaxEpoch
  /\ LET nextModel ==
           CASE tag = "Renamed"       -> [model EXCEPT !.title = newVal]
             [] tag = "Counted"       -> [model EXCEPT !.count = newVal]
             [] tag = "RemoteSettled" -> [model EXCEPT !.remote = newVal]
             [] tag = "RouteChanged"  -> [model EXCEPT !.route = newVal]
             [] tag = "BundleEdited"  -> [model EXCEPT !.bundle = newVal]
         changed == nextModel /= model
         nextVer == IF changed THEN modelVer + 1 ELSE modelVer
         nextAll == IF modelVer /= currentVer THEN allEpoch + 1 ELSE allEpoch
         nextOwn ==
           IF changed
           THEN [r \in Regions |-> IF r \in AffectedBy(tag) THEN ownEpoch[r] + 1 ELSE ownEpoch[r]]
           ELSE ownEpoch
     IN /\ model' = nextModel
        /\ modelVer' = nextVer
        /\ currentVer' = nextVer
        /\ allEpoch' = nextAll
        /\ ownEpoch' = nextOwn
        /\ UNCHANGED <<regionCache, bundlePresent, bundleSlot, observeCache, clock>>
        /\ rendered' = FALSE

\* Tracked undeclared Message (e.g. writes unregistered store `unreg` or arbitrary field)
TrackedUndeclared(newUnreg) ==
  /\ allEpoch + 2 <= MaxEpoch
  /\ modelVer < MaxEpoch
  /\ LET nextModel == [model EXCEPT !.unreg = newUnreg]
         changed == nextModel /= model
         nextVer == IF changed THEN modelVer + 1 ELSE modelVer
         bump1 == IF modelVer /= currentVer THEN allEpoch + 1 ELSE allEpoch
         nextAll == IF changed THEN bump1 + 1 ELSE bump1
     IN /\ model' = nextModel
        /\ modelVer' = nextVer
        /\ currentVer' = nextVer
        /\ allEpoch' = nextAll
        /\ UNCHANGED <<ownEpoch, regionCache, bundlePresent, bundleSlot, observeCache, clock>>
        /\ rendered' = FALSE

\* Untracked Model mutation behind `Writes.track`'s back (hydration / restore / untracked arm)
UntrackedMutation(newTitle, newBundle) ==
  /\ modelVer < MaxEpoch
  /\ LET nextModel == [model EXCEPT !.title = newTitle, !.bundle = newBundle]
     IN /\ nextModel /= model
        /\ model' = nextModel
        /\ modelVer' = modelVer + 1
        /\ UNCHANGED <<currentVer, allEpoch, ownEpoch, regionCache,
                       bundlePresent, bundleSlot, observeCache, clock>>
        /\ rendered' = FALSE

\* Bundle.at hide/show toggle (`onNone` evicts `bundleSlot`!)
ToggleBundle ==
  /\ bundlePresent' = ~bundlePresent
  /\ bundleSlot' = IF bundlePresent THEN [bundleSlot EXCEPT !.valid = FALSE] ELSE bundleSlot
  /\ UNCHANGED <<model, modelVer, currentVer, allEpoch, ownEpoch, regionCache,
                 observeCache, clock>>
  /\ rendered' = FALSE

\* RenderAll: runs every region's lazy slot + Bundle.at + Remote observeEntry
RenderAll ==
  /\ allEpoch < MaxEpoch
  /\ LET bumpedAll == IF modelVer /= currentVer THEN allEpoch + 1 ELSE allEpoch
         nextCurrent == modelVer
         nextRegionCache ==
           [r \in Regions |->
             IF regionCache[r].drawn /\ regionCache[r].all = bumpedAll /\ regionCache[r].own = ownEpoch[r]
             THEN regionCache[r]
             ELSE [all |-> bumpedAll, own |-> ownEpoch[r], val |-> TrueVal(r, model), drawn |-> TRUE]]
         \* Bundle.at keyed on (bumpedAll + ownEpoch["Opaque"]) when present; evicted on None
         bundleKey == bumpedAll + ownEpoch["Opaque"]
         nextBundleSlot ==
           IF ~bundlePresent
           THEN [valid |-> FALSE, epoch |-> 0, val |-> 0]
           ELSE IF bundleSlot.valid /\ bundleSlot.epoch = bundleKey
                THEN bundleSlot
                ELSE [valid |-> TRUE, epoch |-> bundleKey, val |-> model.bundle]
         \* Remote observeEntry for Surface.when(route): skips asked.of iff remote, route unchanged & clock < until
         nextObserve ==
           IF observeCache.valid
              /\ observeCache.remote = model.remote
              /\ observeCache.route = model.route
              /\ clock < observeCache.until
           THEN observeCache
           ELSE [valid |-> TRUE, remote |-> model.remote, route |-> model.route,
                 until |-> clock + 1, ask |-> model.route]
     IN /\ allEpoch' = bumpedAll
        /\ currentVer' = nextCurrent
        /\ regionCache' = nextRegionCache
        /\ bundleSlot' = nextBundleSlot
        /\ observeCache' = nextObserve
        /\ rendered' = TRUE
        /\ UNCHANGED <<model, modelVer, ownEpoch, bundlePresent, clock>>

AdvanceClock ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<model, modelVer, currentVer, allEpoch, ownEpoch, regionCache,
                 bundlePresent, bundleSlot, observeCache, rendered>>

Next ==
  \/ \E tag \in {"Renamed", "Counted", "RemoteSettled", "RouteChanged", "BundleEdited"}, v \in Vals :
       TrackedDeclared(tag, v)
  \/ \E v \in Vals : TrackedUndeclared(v)
  \/ \E t \in Vals, b \in Vals : UntrackedMutation(t, b)
  \/ ToggleBundle
  \/ RenderAll
  \/ AdvanceClock

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* SAFETY INVARIANT: NoStaleRender                                         *)
(* Immediately after any RenderAll step, EVERY region's cached drawing,    *)
(* the Bundle.at slot (when present), and observeEntry's cached ask MUST   *)
(* equal the true projection of `model`.                                   *)
(***************************************************************************)
NoStaleRender ==
  rendered =>
    /\ \A r \in Regions :
         regionCache[r].drawn /\ regionCache[r].val = TrueVal(r, model)
    /\ (bundlePresent => (bundleSlot.valid /\ bundleSlot.val = model.bundle))
    /\ (~bundlePresent => ~bundleSlot.valid)
    /\ (observeCache.valid /\ observeCache.ask = model.route)

=============================================================================
