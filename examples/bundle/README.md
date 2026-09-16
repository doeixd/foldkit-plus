# `foldkit-bundle` example

A settings page assembled from placements, run as a transcript:

- **`MediaQuery`**, one bundle with a Subscription, placed twice (`dark`,
  `narrow`) with different args.
- **`@foldkit/ui` Tabs** through `Bundle.fromParts`; its `Selected` OutMessage
  sets the parent's `section`.
- **`Upload`**, placed once per file with `each`: `add` with the file name,
  progress by key, a `Finished` OutMessage, and a `restart` helper.
- **`BundleSurface.module`** validates the placements beside a Sync contract and
  prints who owns each Model path.

```bash
pnpm --filter foldkit-example-bundle demo
```

`test/demo.test.ts` pins the transcript. The application is in
[`src/app.ts`](src/app.ts).
