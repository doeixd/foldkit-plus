# A page the client cannot take over, said aloud (#210)

Status: built (2026-10-29).

## What happened

`@foldkit/vite-plugin` 0.28 generates one build id for a `vite build` that
makes both the client and the server, and compiles it into Foldkit's own
`buildToken.js`. It defines `import.meta.env.FOLDKIT_BUILD_ID` only for an id
it was given (`foldkit({ buildId })` or `FOLDKIT_BUILD_ID`). A browser entry
written as the docs said, `SSR.hydrate(config, plan, { buildId:
import.meta.env.FOLDKIT_BUILD_ID })`, passed `undefined`, and every page fell
back to the baseline Model in silence.

Two fixes landed before this note: a client given no id reports
`PageContained { reason: 'NoBuildId' }` (0c7e902b), and SSR's refusals go
through `Diagnostics` (d2d08c25). The second trap in the issue was still
silent: a client and a server built with different ids. `SSR.hydrate` handed
that page to Foldkit, which refuses it and logs through Effect, outside the
reporter the page was given.

## The change

`PageContained['reason']` gains `OtherBuild`. `SSR.hydrate` reports it before
handing the page to Foldkit's refusal, with the page's id (or none) and the
client's, and says how to give both bundles one id:

```ts
process.env.FOLDKIT_BUILD_ID ??= randomUUID() // in vite.config.ts, before foldkit()
```

The plugin reads the variable when `foldkit()` is called, so every evaluation
of the config in that process sees the first value.

## Rejected

- **Reading the generated id when `buildId` is omitted.** Foldkit does not
  export it (`injectedBuildId` is `@internal`, and `buildToken.js` is not in
  its export map), and `foldkit-ssr` must compare ids before it decodes a
  page's envelope. It needs Foldkit: proposal 4 in
  `docs/upstream-foldkit-ssr.md`.
- **Carrying both ids as fields.** The message names them; no caller branches
  on them, and the stamp is in the page for anyone who needs it.
