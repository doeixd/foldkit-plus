/**
 * A navigation menu's state: which section stands open and the last followed
 * link — beside a `ListNavigation` placement in the open popup, a `Selection`
 * placement in single mode (the highlight), and the `DismissLayer` stack the
 * Overlay behaviors mark through. Hovering a trigger opens its section;
 * leaving the bar shuts. A click after that hover stays open (the enter
 * already opened it); the next click, a keyboard click, or touch toggles.
 * Following a link records `section/link` and shuts.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer, ListNavigation, Selection } from 'foldkit-primitives/interaction'

export const ISLAND = 'navigation-menu'

export const SECTIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
  Products: ['Overview', 'Pricing', 'Changelog'],
  Resources: ['Docs', 'Blog', 'Status'],
  Company: ['About', 'Careers', 'Contact'],
}
export const NAMES: ReadonlyArray<string> = Object.keys(SECTIONS)

export const followedOf = (section: string, link: string): string => `${section}/${link}`

/** Element id of a section trigger. Collection and `PlaceAt` share it. */
export const triggerId = (section: string): string => `${ISLAND}/${section}`

/** Element id of a link. The collection and `Selection.Activated` share it. */
export const linkElementId = (section: string, link: string): string =>
  `${ISLAND}/${followedOf(section, link)}`

export const linksOf = (section: Option.Option<string>): ReadonlyArray<string> =>
  Option.match(section, {
    onNone: () => [],
    onSome: name => SECTIONS[name] ?? [],
  })

export const textOf = (value: Option.Option<string>): string =>
  Option.isSome(value) ? value.value : 'none'

const isSection = (section: Option.Option<string>, name: string): boolean =>
  Option.isSome(section) && section.value === name

export const Nav = Bundle.declare(ListNavigation.bundle, 'siteNav')

export const Sel = Bundle.declare(Selection.bundle, 'sitePick')

export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
export const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  openSection: Schema.Option(Schema.String),
  followed: Schema.Option(Schema.String),
  /** Set when a pointer enter opened the section, so the click that follows does not shut it. */
  openedByPointer: Schema.Boolean,
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

const shut = (model: Model): Model =>
  Option.isNone(model.openSection)
    ? model
    : { ...model, openSection: Option.none(), openedByPointer: false }

const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Sel, { args: selArgs }),
  Parent.at(Stack, {
    onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({ model: shut(model) }),
  }),
)

export const initial = assembly.initial({
  openSection: Option.none(),
  followed: Option.none(),
  openedByPointer: false,
})

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'EnteredSection':
      return isSection(model.openSection, message.section)
        ? { model }
        : {
            model: {
              ...model,
              openSection: Option.some(message.section),
              openedByPointer: true,
            },
          }
    case 'LeftBar':
      return { model: shut(model) }
    case 'ToggledSection':
      if (model.openedByPointer && isSection(model.openSection, message.section)) {
        return { model: { ...model, openedByPointer: false } }
      }
      return {
        model: {
          ...model,
          openedByPointer: false,
          openSection: isSection(model.openSection, message.section)
            ? Option.none()
            : Option.some(message.section),
        },
      }
    case 'FollowedLink': {
      const open = model.openSection
      if (Option.isNone(open)) return { model }
      const id = linkElementId(open.value, message.link)
      return {
        model: {
          ...model,
          openSection: Option.none(),
          openedByPointer: false,
          followed: Option.some(followedOf(open.value, message.link)),
          sitePick: Selection.bundle.update(
            model.sitePick,
            Selection.Message.Activated({ id }),
            selArgs,
          ).model,
        },
      }
    }
  }
})
