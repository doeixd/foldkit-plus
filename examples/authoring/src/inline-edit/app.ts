/**
 * Titles that rename in place. `InlineEdit` keeps the draft and what the
 * parent said about it; the Model decides what a title may be. A commit of a
 * changed value arrives as `Committed`: an acceptable one is written to
 * `titles`, a refused one is handed back with its reason, which keeps the
 * editor open on what was typed.
 */
import { Array, Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { InlineEdit } from 'foldkit-primitives/interaction'

export const Title = Schema.Struct({ id: Schema.String, text: Schema.String })
export type Title = typeof Title.Type

export const Rename = Bundle.declare(InlineEdit.bundle, 'rename')
export const renameArgs = { id: 'titles', blur: 'cancel' } as const

export const Model = Schema.Struct({
  ...Rename.fields,
  titles: Schema.Array(Title),
  added: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Rename.cases,
  Added: {},
})
export type Message = typeof Message.Type

export const BLANK = 'A title is required.'
export const TAKEN = 'Another title already says that.'

/** Why `value` cannot be `id`'s title, or none when it can. */
export const refusalOf = (
  titles: ReadonlyArray<Title>,
  id: string,
  value: string,
): Option.Option<string> => {
  const wanted = value.trim().toLowerCase()
  if (wanted === '') return Option.some(BLANK)
  return Array.some(titles, title => title.id !== id && title.text.toLowerCase() === wanted)
    ? Option.some(TAKEN)
    : Option.none()
}

const Parent = Bundle.parent({ Model, Message })
const Renames = Parent.at(Rename, {
  args: renameArgs,
  onOut:
    (committed: InlineEdit.Committed) =>
    (model: Model): Update.Return<Model, Message> =>
      Option.match(refusalOf(model.titles, committed.id, committed.value), {
        onSome: reason => Renames.helpers.refuse(committed, reason)(model),
        onNone: () => ({
          model: modifyFields(model, {
            titles: titles =>
              titles.map(title =>
                title.id === committed.id ? { ...title, text: committed.value.trim() } : title,
              ),
          }),
        }),
      }),
})

export const assembly = Parent.assemble(Renames)

const TITLES: ReadonlyArray<Title> = [
  { id: 'title-1', text: 'Write the guide' },
  { id: 'title-2', text: 'Review the pull request' },
  { id: 'title-3', text: 'Ship it' },
]

export const initial = () => assembly.initial({ titles: TITLES, added: 0 })

export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    Added: () => ({
      model: modifyFields(model, {
        titles: titles => [
          ...titles,
          { id: `new-${model.added + 1}`, text: `New title ${model.added + 1}` },
        ],
        added: count => count + 1,
      }),
    }),
  }),
)

/** Whether an editor is open on `id`. */
export const isEditing = (model: Model, id: string): boolean =>
  Option.exists(model.rename.editing, editing => editing.id === id)
