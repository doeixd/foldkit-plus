# foldkit-admin

Management screens assembled from parts the application already has. So far one:
an **editor**, which joins a `foldkit-form` form, the Remote mutation its value
feeds, and the Entity they share. It loads what the form writes, fills the form,
turns a valid submit into the mutation, and reports how it went. Headless.

Nothing is generated from an Entity alone: no form and mutation, no editor.

## Ownership

| Fact | Owner |
| --- | --- |
| Drafts and their validity | the form |
| Current values; whether a save is pending, applied, failed | Remote's store |
| What to load, how a loaded value becomes input values | the form's input (`Entity.selectFor` / `valuesFor`) |
| Which id is open, whether it was shown, which save is this editor's | the editor's slice of the parent Model |
| What happens after a save | the application, reading `status` |

`status` is derived from those, never stored.

## Minimal example

`EditPostForm` is a `Form.make` result; `EditPostMutation` is a Remote mutation
over the same input struct (see [form.md](form.md), [remote.md](remote.md)).

```ts
import { Admin } from 'foldkit-admin'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Editor = Admin.editor('PostEditor', { form: EditPostForm, mutation: EditPostMutation })

const Slot = Bundle.declare(Editor.bundle, 'editor')
const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
const Message = defineMessageUnion({ ...Remote.messages, ...Slot.cases })

const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: Object.values(Blog),
  mutations: [EditPostMutation],
})

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

## Common tasks

- **Open it** from your own `update`: `Placed.helpers.open(id)` (edit: empties the
  form, fills it when the value arrives), `.blank()` (create: nothing to load),
  `.close()`.
- **Dispatch form Messages** as before: the editor's Messages are the form's own
  (`EditPostForm.Message.Changed(...)` wrapped in `Message.GotEditorMessage`).
- **Read state:** `PostEditor.status(model)` is `Closed`, `Loading`, `NotFound`,
  `LoadFailed`, `Editing`, `Saving`, `Saved`, or `SaveFailed`;
  `PostEditor.saveError(model)` is why a save failed. The form's Model is
  `model.editor.form`.
- **Draw it:** `foldkit-mixins-form` over `model.editor.form`, or from
  `EditPostForm.controls`.
- **Compose `update` yourself:** `PostEditor.sync` is the Step `after` runs.

## Gotchas

- `Editor.at` needs the slice as a `ModelRef` (`App.model.editor`), so the Model
  must be the application's (`Surface.application`).
- Name the service: `Bundle.parent(...).withServices<RemoteClient>()`, or `onOut`
  does not type-check.
- Register `PostEditor.active` with `Data.subscriptions`, or nothing is fetched.
- Use `after` (or run `sync`), or the form never fills.
- The form fills once per `open`. A later refresh does not overwrite drafts.
- A form and a mutation with different inputs is a type error at `Admin.editor`.
- One editor serves one form; create and edit are usually two editors.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/admin/README.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/entity
