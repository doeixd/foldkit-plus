# Bundle placements: a settings page

This example packages a child state machine once and places it in a parent
Model. Run it to see Message routing, keyed children, and OutMessages without
starting a browser. Read the [Bundle guide](../../packages/bundle/README.md)
first if Model, Message, and `update` are new to you.

The parent owns all state. A placement supplies the reducer and wiring for
one slice; it does not create another store.

```text
GotDarkMessage → MediaQuery.update → model.dark
GotUploadMessage(key) → Upload.update → model.uploads[key]
                                      → Finished → parent model.finished
```

## Run it

From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter foldkit-example-bundle demo
pnpm exec vitest run examples/bundle/test
```

The demo prints a transcript; it does not open a settings UI or upload files.
The media-query source emits a fixed value so it can run in Node.

## Follow one child before the whole page

In [src/app.ts](src/app.ts), read `MediaQuery`, then `Dark`, then `placements`.
`Bundle.declare` supplies the parent's field and wrapper Message;
`Page.at` binds the query; `Page.assemble` collects routing and subscriptions.
`config.init()` creates the initial parent Model.

In [src/demo.ts](src/demo.ts), the first subscription changes `dark` to true
while `narrow` remains false. Both use the same bundle, but have independent
Model fields. That is the central claim to check in the output.

Then follow the other placements:

| Placement | Mechanism | What to look for |
| --- | --- | --- |
| Tabs | `Bundle.fromParts` adapts `@foldkit/ui`; `onOut` handles selection | The parent's `section` becomes `uploads`. |
| Uploads | `Page.each` routes by key; `add` initializes a child | Progress for `u1` leaves `u2` unchanged. |
| Finished upload | Child OutMessage folded into the parent | `finished` contains `photo.png`. |
| Restart | A placed helper returns a parent Update.Step | `u1` returns to 0%. |
| Module | Placement contracts claim their Model paths | Validation reports zero findings. |

## Try a change

Change the demo's `u1` progress from 100 to 99. The upload should remain in the
Model, but its name should not enter `finished`: that happens only when the
child emits `Finished`. The transcript test should fail until you restore the
original value. This separates child state from the notification to its parent.

The `SettingsSync` value is an ownership contract for validation, not a running
replica. For real replication, continue with [the Sync example](../sync/README.md).
