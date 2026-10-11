# foldkit-guard

Early: a guard set can be declared and decided. Attaching guards to an Entity,
and the seams that derive their checks from them (`visible`, a Source's
`authorize`, a mutation's write plan, `may`), are the next slices of
[guard-DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/guard-DESIGN.md).

## What it owns

Who may do what, declared once in shared domain code. It owns the
declaration; the server owns the bodies; authentication (who is asking) stays
the application's, handed in through `G.Principal`.

- **Principal guard**: `guard.principal()`. A name whose body only the server
  has (`G.implement({ isAdmin: principal => … })`), so its logic never ships
  to the client. Asked of the principal alone.
- **Row guard**: `guard.row(Entity, p => Expr…)`. A predicate over one
  Entity's fields, with the principal's fields as inputs (`p.id` is the input
  `principal.id`). Data, so the SQL compiler and `evaluate` both run it. A
  placeholder is not a value: branching on one is a type error.

## Basic use

- `Guards.declare(name, PrincipalSchema, guard => ({ … }), { key })` takes the
  principal as a `Schema.Struct`; its fields are what row guards read.
- `G.implement(bodies)` must give a body to every principal guard and nothing
  else (a type error, and refused at runtime too).
- `policy.decide(guard, { principal, interaction, row })` is an
  `Effect<Decision>`; a visitor is `Option.none()` and passes no row guard.
  `Decision` is `boolean | { allowed: false; reason }`.
- `G.inputOf(user)` is the principal's fields as query inputs, encoded.
- `Expr.in(field, p.projectIds)` is how a membership the principal carries
  reads in a row guard.

See the [README](https://github.com/doeixd/foldkit-plus/blob/main/packages/guard/README.md).
