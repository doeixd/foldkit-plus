# Framework preview notes

This app exercises the unreleased Blocks and Layers API. The configuration below makes this checkout reproducible and records the integration work required by its pinned preview.

## Package versions

This app uses the unreleased Blocks and Layers preview at commit `90746b32d2ca8bc0476de7a051ace396ca590ae0`. All six Foldkit packages are pinned to the matching published npm canary versions, with exact versions and archive integrity in the lockfile. A fresh checkout builds without another framework checkout. The `create-foldkit-app` SSG scaffold supplies the build, development tooling, and framework conventions.

The application and infrastructure use Effect `4.0.6`, one of the patch versions verified by the Foldkit preview. Alchemy and its Cloudflare integration are pinned to `2.0.0-beta.84`. Each workspace typechecks with its own compiler; the application retains the scaffolded TypeScript preview.

## Development rendering

Development uses a shared build identity across client and SSR environments, working around separate identities in the pinned preview. Foldkit’s Vite plugin refreshes the SSR module graph during development updates, and the server entry disposes its RPC handler before reevaluation.

## Framework source and UI patch

`repos/foldkit` is a read-only Git subtree of [foldkit/foldkit](https://github.com/foldkit/foldkit), pinned to `90746b32d2ca8bc0476de7a051ace396ca590ae0`. It supplies source, examples, and documentation matching the installed preview packages. Application imports resolve through the installed packages. The app's formatting commands use its root configuration and skip the subtree.

The UI dependency patch preserves responsive scroll anchors and accepts native
scroll observations when their offset changes during a pending row-layout update.
When the page viewport starts above the list, it preserves the signed offset
instead of following a row that moves during sorting or filtering. Browser
coverage protects resize anchoring, sorting without page jumps, and returning
to the first catalog row with Home.

When upgrading Foldkit, pull the subtree at the commit or release tag matching the new package versions:

```sh
git subtree pull --prefix=repos/foldkit https://github.com/foldkit/foldkit.git <matching-release-ref> --squash
```

Replace `FOLDKIT.md` with the template from that same revision, as described in its upgrade instructions.
