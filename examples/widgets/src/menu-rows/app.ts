/**
 * A shipped Menu whose rows carry a `value`, an icon and a hint. Two rows read
 * "Copy"; the Model is told which was picked by the value the Menu reports, so
 * `Picked` names `copy-link` where the label alone could not.
 */
import { Match, Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Menu } from 'foldkit-mixins-ui'

/** A row's words and parts as data; `glyph` is the path of the icon the view draws. */
export interface RowSpec {
  readonly value: string
  readonly label: string
  readonly hint?: string
  readonly glyph: string
}

export const ROWS: ReadonlyArray<RowSpec> = [
  { value: 'rename', label: 'Rename', hint: 'F2', glyph: 'M3 13l1-4 7-7 3 3-7 7z' },
  { value: 'copy-text', label: 'Copy', hint: 'Text', glyph: 'M5 5h8v8H5zM3 11V3h8' },
  {
    value: 'copy-link',
    label: 'Copy',
    hint: 'Link',
    glyph: 'M6.5 9.5l3-3M5 8l-1.5 1.5a2.1 2.1 0 003 3L8 11M11 8l1.5-1.5a2.1 2.1 0 00-3-3L8 5',
  },
  { value: 'archive', label: 'Archive', glyph: 'M2 4h12v3H2zM3 7v6h10V7M6.5 9.5h3' },
]

export const MENU_ID = 'row-actions'

export const Model = Schema.Struct({
  menu: Menu.Model,
  picked: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotMenu: { message: Menu.Message },
})
export type Message = typeof Message.Type

export const initial: Model = {
  menu: Menu.init(MENU_ID, ROWS),
  picked: Option.none(),
}

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Match.valueTags(message, {
    GotMenu: ({ message }) => {
      const next = Menu.update(model.menu, message)
      const picked = Option.map(Option.fromNullishOr(next.outMessage), ({ value }) => value)
      const commands = mapMessages(next.commands ?? [], inner =>
        Message.GotMenu({ message: inner }),
      )
      if (next.model === model.menu && Option.isNone(picked) && commands.length === 0) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          menu: () => next.model,
          picked: current => (Option.isSome(picked) ? picked : current),
        }),
        commands,
      }
    },
  })

/** The row the Model's picked value names, found by value since two rows share a label. */
export const pickedRow = (model: Model): Option.Option<RowSpec> =>
  Option.flatMap(model.picked, value => Option.fromNullishOr(ROWS.find(row => row.value === value)))
