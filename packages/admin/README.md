# foldkit-admin

Management screens assembled from parts an application already has. The first
one is an **editor**: it joins a [`foldkit-form`](../form/README.md) form, the
[`foldkit-remote`](../remote/README.md) mutation its value feeds, and the
[`foldkit-entity`](../entity/README.md) Entity they share.

> **Status:** the editor only (edit and create). Lists, detail, and delete are
> planned in [entity-DESIGN.md](../../docs/design/entity-DESIGN.md). The editor
> is headless, as the form is.

## What it owns

An editor adds no state system and no runtime. It is the glue between three
things that each already own their part:

| Fact | Owner |
| --- | --- |
| The drafts and whether they are valid | the form |
| The current values, and whether a save is pending, applied, or failed | Remote, in its store |
| What to load, and how a loaded value becomes input values | the form's input (`Entity.selectFor`, `Entity.valuesFor`) |
| Which id is being edited, whether it has been shown, which save is this editor's | the editor, in its slice of the parent Model |
| What happens after a save (navigate, close, toast) | the application, reading `status` |

Nothing is generated from an Entity alone. An editor exists because you named a
form and a mutation; an Entity with neither has no editor.

## Mental model

```text
open(id)
   |  the members the form writes become a requirement, like a Surface's
   v
Remote fetches ──► the value arrives ──► sync fills the form, once
   |
   v
the user edits ──► Submitted ──► the form hands over a decoded value
   |
   v
onOut ──► Data.mutate ──► Remote settles it ──► status: Saving ─► Saved / SaveFailed
```

`status` is derived, not stored: it reads the editor's slice, Remote's mutation
state, and the loaded value, so it cannot disagree with them.

## Install

```sh
pnpm add effect foldkit foldkit-admin foldkit-bundle foldkit-entity foldkit-form foldkit-remote foldkit-surface
```

## Example

`EditPostForm` is a `Form.make` result and `EditPostMutation` a Remote mutation
over the same input struct, as in [`examples/entity`](../../examples/entity).

```ts
import { Admin } from 'foldkit-admin'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Editor = Admin.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })

// The editor is a Submodel of the page: a Model field and a Message variant.
const Slot = Bundle.declare(Editor.bundle, 'editor')
const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
const Message = defineMessageUnion({ ...Remote.messages, ...Slot.cases })

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation],
})

// Where it lives: its slice of the Model, and the domain it saves through.
const PostEditor = Editor.at({ data: Data, model: App.model.editor })

const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, { onOut: PostEditor.onOut })
const placements = Page.assemble(Placed)

const update = PostEditor.after(
  placements.update((model, message) =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
  ),
)

const subscriptions = Data.subscriptions({ editor: PostEditor.active })
```

- `Admin.editor` checks that the form's value is the mutation's input. Declaring
  the input struct once and giving it to both is what makes that true.
- `Editor.bundle` wraps the form's Bundle. Its Messages are the form's own, so a
  view dispatches `EditPostForm.Message.Changed(...)` exactly as before.
- `Editor.at` needs the editor's slice as a `ModelRef` (`App.model.editor`) and
  the bound Remote domain. It returns the pieces that need the parent:
  - `onOut` for the placement: a valid submit becomes `Data.mutate`, and the
    editor remembers the request id.
  - `active`, an `ActiveSurface` for `Data.subscriptions`: while an id is open,
    what the form writes is fetched and retained like any Surface's requirement.
  - `after(update)`: wraps `update` so `sync` runs after every Message.
  - `sync`, the Step itself, if you compose `update` another way.
  - `status(model)`.
- The save is a Command that needs `RemoteClient`, so the parent scope names it
  with `withServices<RemoteClient>()`.

### Opening it

`open`, `blank`, and `close` are helpers of the placement, so they are Update
Steps to use from your own `update`:

```ts
Placed.helpers.open('p2') // edit p2: the form empties, then fills when the value arrives
Placed.helpers.blank() // a new one: nothing to load, editing at once
Placed.helpers.close()
```

One editor serves one form. A create form and an edit form usually differ (the
edit input has an `id`), so they are two editors; `blank` is for the one whose
form creates.

## Status

| Status | When |
| --- | --- |
| `Closed` | nothing is open |
| `Loading` | an id is open and its current values have not arrived |
| `NotFound` | the entity is tombstoned in Remote's store |
| `LoadFailed` | reading it failed to decode |
| `Editing` | the form is showing, with no save in progress or just settled |
| `Saving` | this editor's mutation is pending |
| `Saved` | it was applied |
| `SaveFailed` | it failed; the drafts are kept |

An edit after a save returns to `Editing`: the last save no longer describes what
is in the form.

## Behaviour worth knowing

- **The form is filled once.** When the value is read again (a refresh, a live
  update) the drafts are left alone, so nothing the user typed is overwritten.
  Opening the same or another id empties the form and fills it again.
- **What is loaded is what the form writes**, with each relation as a ref. A key
  the form marks `Entity.unmapped` is not loaded and starts empty.
- **An invalid submit starts no mutation.** The form emits nothing until every
  key passes the input's schema.

## Limits

- Remote marks an entity not found only when a live event deletes it. Opening an
  id that never existed stays `Loading`, unless your server fails the read.
- The error of a failed save is in Remote's `MutationFailed` Message, which the
  editor does not keep. Handle it in `update` if you show it.
- Headless. Draw the form with
  [`foldkit-mixins-form`](../mixins-form/README.md) over `model.editor.form`, or
  from `EditPostForm.controls`.
