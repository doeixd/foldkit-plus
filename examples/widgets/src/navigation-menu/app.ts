/**
 * A navigation menu's state: which section stands open (null while shut)
 * and the last followed link — beside a `ListNavigation` placement in the
 * open popup, a `Selection` placement in single mode (the highlight), and
 * the `DismissLayer` stack the Overlay behaviors mark through. Hovering a
 * trigger opens its section; leaving the bar shuts; a click toggles for
 * touch and keyboard; following a link records `section/link` and shuts.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer, ListNavigation, Selection } from 'foldkit-primitives/interaction'

export const SECTIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
  Products: ['Overview', 'Pricing', 'Changelog'],
  Resources: ['Docs', 'Blog', 'Status'],
  Company: ['About', 'Careers', 'Contact'],
}
export const NAMES: ReadonlyArray<string> = Object.keys(SECTIONS)

export const linksOf = (section: string | null): ReadonlyArray<string> =>
  section === null ? [] : (SECTIONS[section] ?? [])

export const Nav = Bundle.declare(ListNavigation.bundle, 'siteNav')
export const Sel = Bundle.declare(Selection.bundle, 'sitePick')
export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  openSection: Schema.NullOr(Schema.String),
  followed: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Sel.cases,
  ...Stack.cases,
  EnteredSection: { section: Schema.String },
  LeftBar: {},
  ToggledSection: { section: Schema.String },
  FollowedLink: { link: Schema.String },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Sel, { args: selArgs }),
  Parent.at(Stack, {
    onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({
      model: model.openSection === null ? model : { ...model, openSection: null },
    }),
  }),
)

export const initial = assembly.initial({ openSection: null, followed: null })

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'EnteredSection':
      return model.openSection === message.section
        ? { model }
        : { model: { ...model, openSection: message.section } }
    case 'LeftBar':
      return model.openSection === null ? { model } : { model: { ...model, openSection: null } }
    case 'ToggledSection':
      return {
        model: {
          ...model,
          openSection: model.openSection === message.section ? null : message.section,
        },
      }
    case 'FollowedLink':
      return {
        model: {
          ...model,
          openSection: null,
          followed:
            model.openSection === null ? model.followed : `${model.openSection}/${message.link}`,
          sitePick: Selection.bundle.update(
            model.sitePick,
            Selection.Message.Activated({ id: message.link }),
            selArgs,
          ).model,
        },
      }
  }
})
