# Settings drawer (`foldkit-example-drawer`)

A modal settings panel proving the Overlay policy: one `Overlay.modal`
value turns into the dismiss marking, focus containment and restore, scroll
lock, and inertness — composed from the existing pieces, nothing
reimplemented. Escape and outside press arrive as the `DismissLayer`
stack's outmessage.

## Run it

```bash
pnpm --filter foldkit-example-drawer demo   # closed, open, escape-dismissed
pnpm --filter foldkit-example-drawer typecheck
npx vitest run examples/drawer
```

## Files

- `src/app.ts` — `{ open }` plus the `DismissLayer` stack placement; `Dismiss`
  naming the drawer closes it, anything else leaves it open.
- `src/view.ts` — `DrawerSlots` with `Overlay.behaviors(..., Overlay.modal)`
  spread into the pipe; the panel draws only while open (`data-open` drives
  the CSS slide; presence stays CSS, not JS state).
- `src/demo.ts` — the headless trace `main.ts` prints.
