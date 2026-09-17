# `foldkit-primitives/media`

Environment facts: what the browser reports about its surroundings. See the
[package README](../README.md) for the full guide; this page is the reference
card. ([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/media))

## Owns

The viewport's shape and the platform's identity, as parent-Model facts.
Nothing here performs I/O beyond listening; the browser only reports.

## Exports

| Name | Form | Needs |
| --- | --- | --- |
| `MediaQuery` | bundle `{ matches }` + `Changed` | `{ query }` |
| `PrefersDark`, `PrefersReducedMotion` | preset placements | none |
| `Breakpoints` | bundle `{ width, breakpoint }` + `Changed` | `{ breakpoints }` (finite thresholds) |
| `breakpointFor` | pure: width + table → name | — |
| `platformFromUA` | pure: UA string + optional hints → platform | — |
| `isBrowser`, `isServer` | pure: SSR split | — |

Placing both `Breakpoints` and `WindowSize` (in `events`) doubles resize
listeners — pick the one the view reads.

## Example

```ts
import { Bundle } from 'foldkit-bundle'
import { PrefersDark } from 'foldkit-primitives/media'

const Dark = Bundle.declare(PrefersDark, 'dark')
// ...Model/Message/parent, then:
Page.assemble(Page.place(Dark, 'dark'))
```

## Failure

No `matchMedia` (SSR, old browser): empty stream, initial `false` kept.
`platformFromUA` never throws: unknown input answers `unknown`.
