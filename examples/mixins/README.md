# foldkit-mixins example

A worked trace of the `foldkit-surface` → `foldkit-mixins` bridge. It defines a
`ProjectCard` Surface that projects only the fields it needs and exposes only two
of the application's Messages, then styles and decorates it with a `SlotView`.

## Follow one customization

Read [src/demo.ts](src/demo.ts) in this order: `ProjectCard`, its slot
contract, `ProjectCardStyle`, then `ArchiveBehavior`. The Surface restricts
input and Messages; slots name extension points; the resolver combines the
attributes at those points.

Try changing the projected project's `archived` value. Predict the status
class and archive button's `aria-disabled` before rerunning the trace. Then
remove a required slot from the accessibility check: the diagnostic is about
the declared structure, not a browser audit of the rendered page.

This demo resolves attributes and prints CSS; a browser application must also
install the stylesheet. See the [Mixins guide](../../packages/mixins/README.md)
for the full rendering path.

```bash
pnpm install && pnpm build                  # from the repository root
pnpm --filter foldkit-example-mixins demo
```

`src/demo.ts` is the only file to read. Its output is the point:

```
surface: ProjectCard
observes: project, selection
slots: root(Container), title(Container), status(Container), archive(Interactive)
mixins: ProjectCardStyle, ArchiveBehavior
a11y: ok
a11y missing: a11y:missing-slot
projected: {"project":{"name":"Apollo","archived":true},"selection":"p1"}
root classes: card style-yow16s
root style: {"display":"grid","gap":"0.5rem"}
status classes: archived
archive aria-disabled: true
stylesheet: .style-yow16s:hover{box-shadow:0 1px 2px}
```

Read it as: the Surface decides what the card may observe (`project`,
`selection`) and emit; the SlotView decides where appearance and behavior attach;
`Style.whenInput` reads the projected input; and the Behavior reads the projected
input, not the root Model. The root-only `internalNotes` field never reaches the
renderer, and `DeleteProject` is not in the Surface's Message set, so a `toView`
cannot emit it.

`Style.pseudo(':hover', …)` compiles to one deterministic class
(`style-yow16s`) plus CSS text; `Style.stylesheet(ProjectCardStyle)` is the
`<style>` block the application would inject. The class is a hash of the rule, so
it is identical on the server and the client.

The demo then prints the serializable `SurfaceView.describe(...)` value and its
`toMarkdown` rendering — the same data DevTools or agent tooling would consume:

```md
# ProjectCard

## Observes

- `project`
- `selection`

## May emit

- `ArchiveProject`
- `SelectProject`

## Slots

- `root` — Container
- `title` — Container
- `status` — Container
- `archive` — Interactive (events: click)

## Mixins

- `ProjectCardStyle`
- `ArchiveBehavior`
```

`test/demo.test.ts` pins every line, so the trace cannot silently drift.
