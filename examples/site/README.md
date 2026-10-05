# The demos site

The landing page for the published demos,
[foldkit-plus.pages.dev](https://foldkit-plus.pages.dev/): one card per demo,
each saying what it proves, three things to try, the file to read first, and
the packages it uses.

It is a Foldkit Plus page itself: rendered at build time by `foldkit-ssr`'s
`staticSite`, taken over in the browser, and styled with `foldkit-mixins`, with
no CSS file. [`examples/foldkit/ssg`](../foldkit/ssg) is the same build at its
smallest.

## One list of demos

[`src/demos.ts`](src/demos.ts) holds every demo once. The site draws its cards
from it, every demo draws its "What this is, and what to try" box from its own
entry, and the root README's list of demos is written from it:

```bash
pnpm --filter foldkit-example-site readme   # rewrites the list between <!-- demos --> markers
```

`test/demos.test.ts` fails when the README's list and the data differ, and when
a card names an example, a file or a package that does not exist, so a card
cannot point at something moved or renamed.

## Run it

```bash
pnpm --filter foldkit-example-site dev
FOLDKIT_BUILD_ID=local pnpm --filter foldkit-example-site build   # to examples/site/dist
```

The build needs `FOLDKIT_BUILD_ID`, the deployment the pages belong to, as
every `foldkit-ssr` build does.

## Files

- `src/demos.ts`: the cards' data.
- `src/main.ts`: the Model (only the route), the view, and the resume plan.
- `src/style.ts`: the Slots and their Styles.
- `src/intro.ts`: the box each demo draws at the top of its first screen,
  exported as `foldkit-example-site/intro` (the data as `foldkit-example-site/demos`).
  It carries its own values, so it looks the same in every demo whatever its
  theme. An application calls `demoIntro<Message>()` once, for its Messages.
- `src/site.ts`: what `staticSite` renders.
- `src/readme.ts`, `scripts/readme.ts`: the root README's list, and the script that writes it.
