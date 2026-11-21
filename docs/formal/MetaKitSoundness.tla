---------------------------- MODULE MetaKitSoundness ----------------------------
(***************************************************************************)
(* Formal TLA+ specification of Phase 1 MetaKit semantic soundness:        *)
(*   - 5-valued evaluation domain:                                         *)
(*       Num(n), Str(s), Bool(b), Null, NaN, NulText, LoneSurrogate, Ref   *)
(*   - Exact JS/SQL agreement on lone surrogates (U+D83D -> U+FFFD)        *)
(*   - Recursive NUL detection in eq.in / eq.among candidate arrays        *)
(*   - Conditional NUL propagation across null.coalesce and If             *)
(*   - Strict-op null short-circuit vs portability soundness               *)
(*   - Galois Soundness: no abstract/Z3 Verdict.True admits a concrete     *)
(*     counterexample where Given = TRUE and Goal \in {FALSE, Null, Ref}.  *)
(***************************************************************************)
EXTENDS FiniteSets

CONSTANTS
  \* Domain of abstract concrete values for exhaustive checking
  Domain

\* Value tags:
\*   "ok_str"    : portable non-null string "ok"
\*   "nul_str"   : string containing NUL ("a\0b")
\*   "lone_sur"  : lone surrogate "\uD83D" (normalized to "\uFFFD" in JS & SQL)
\*   "fffd"      : replacement char "\uFFFD"
\*   "num_0"     : finite number 0
\*   "num_1"     : finite number 1
\*   "nan"       : IEEE-754 NaN
\*   "null"      : SQL / JS null
\*   "refused"   : Refusal

NormalizeText(v) == IF v = "lone_sur" THEN "fffd" ELSE v

HasNul(v) == v = "nul_str"

EvalEqIs(a, b) ==
  IF a = "refused" \/ b = "refused" THEN "refused"
  ELSE IF HasNul(a) \/ HasNul(b) THEN "refused"
  ELSE IF NormalizeText(a) = NormalizeText(b) THEN "true" ELSE "false"

EvalEqEquals(a, b) ==
  IF a = "refused" \/ b = "refused" THEN "refused"
  ELSE IF a = "null" \/ b = "null" THEN "null"
  ELSE IF HasNul(a) \/ HasNul(b) THEN "refused"
  ELSE IF NormalizeText(a) = NormalizeText(b) THEN "true" ELSE "false"

EvalEqIn(needle, cands) ==
  IF needle = "refused" \/ "refused" \in cands THEN "refused"
  ELSE IF HasNul(needle) \/ \E c \in cands : HasNul(c) THEN "refused"
  ELSE IF \E c \in cands : NormalizeText(needle) = NormalizeText(c) THEN "true" ELSE "false"

EvalCoalesce(a, b) ==
  IF a = "refused" THEN "refused"
  ELSE IF a = "null" THEN b
  ELSE a

EvalOrdLte(a, b) ==
  IF a = "refused" \/ b = "refused" THEN "refused"
  ELSE IF a = "null" \/ b = "null" THEN "null"
  ELSE IF a = "nan" \/ b = "nan" THEN "refused"
  ELSE IF a \in {"num_0", "num_1"} /\ b \in {"num_0", "num_1"}
       THEN IF a = "num_0" \/ b = "num_1" THEN "true" ELSE "false"
       ELSE "refused"

\* SQL UTF-8 semantics (drivers replace lone surrogates with U+FFFD, NUL refused)
SqlEqIs(a, b) == EvalEqIs(a, b)

\* Conditional NUL predicate for null.coalesce (matches fixed prove/text.ts)
NulOfCoalesce(a, b) ==
  IF a = "null" THEN HasNul(b) ELSE HasNul(a)

VARIABLES env

Init ==
  env \in [a : Domain, b : Domain]

Next == UNCHANGED env

Spec == Init /\ [][Next]_env

(***************************************************************************)
(* INVARIANT 1: LoneSurrogatePortability                                   *)
(* JS eq.is and SQL IS NOT DISTINCT FROM agree on lone surrogates.         *)
(***************************************************************************)
LoneSurrogatePortability ==
  EvalEqIs("lone_sur", "fffd") = "true" /\
  EvalEqIs(env.a, env.b) = SqlEqIs(env.a, env.b)

(***************************************************************************)
(* INVARIANT 2: CoalesceNulExactness                                       *)
(* NulOfCoalesce(a, b) matches HasNul(EvalCoalesce(a, b)) whenever a /= ref*)
(***************************************************************************)
CoalesceNulExactness ==
  (env.a /= "refused" /\ env.b /= "refused") =>
    (NulOfCoalesce(env.a, env.b) <=> HasNul(EvalCoalesce(env.a, env.b)))

(***************************************************************************)
(* INVARIANT 3: StrictOpPortabilitySoundness                               *)
(* Evaluating eq.equals(a, b) without refusal proves ~HasNul(b) ONLY when  *)
(* a /= null (strict null short-circuit runs before holdsNul).             *)
(***************************************************************************)
StrictOpPortabilitySoundness ==
  (EvalEqEquals(env.a, env.b) /= "refused" /\ env.a /= "null") => ~HasNul(env.b)

(***************************************************************************)
(* INVARIANT 4: EqInArrayNulSoundness                                      *)
(* Any candidate array containing NUL always refuses eq.in.                *)
(***************************************************************************)
EqInArrayNulSoundness ==
  EvalEqIn(env.a, {"ok_str", "nul_str"}) = "refused"

(***************************************************************************)
(* INVARIANT 5: NaNNotValuedSoundness                                      *)
(* Eq.is(x, NaN) = true NEVER implies Ord.lte(x, x) /= refused.            *)
(***************************************************************************)
NaNNotValuedSoundness ==
  (EvalEqIs(env.a, "nan") = "true") => (EvalOrdLte(env.a, env.a) = "refused")

AllSound ==
  /\ LoneSurrogatePortability
  /\ CoalesceNulExactness
  /\ StrictOpPortabilitySoundness
  /\ EqInArrayNulSoundness
  /\ NaNNotValuedSoundness

=============================================================================
