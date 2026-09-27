/**
 * The authoring shell both applications draw: the header with the sections and
 * who is looking, around a section's own content. It publishes no Slots of its
 * own; it draws `AdminSlots`, which the section's view is defined over.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { SlotView } from 'foldkit-mixins'
import { Option } from 'effect'
import { Cms, type EditorStatus, type State } from 'foldkit-cms'
import { Display } from 'foldkit-crud'
import type { AdminSlots } from './style.js'
import { icon } from './icons.js'
import { chairOf, chairs, type Chair } from './transport.js'

export const chair: Chair = chairOf(window.location.search)

/** Whether the server runs in the page, where `?reset` starts the sandbox afresh. */
const sandboxed = import.meta.env.MODE === 'sandbox'

/**
 * What the demo is and what to try, first thing on the posts: a disclosure,
 * open until the author closes it for this visit.
 */
export const intro = <M>(slots: SlotView.SlotBuilders<typeof AdminSlots, M>, h: HtmlBuilder<M>) =>
  h.details(slots.intro.attrs([h.Open(true)]), [
    h.summary(slots.introSummary.attrs(), ['What this is, and what to try']),
    h.p(
      [],
      [
        'A blog’s studio and its public site, built with Foldkit Plus. ',
        sandboxed
          ? 'Its server and database run in this page, so nothing you write leaves your browser.'
          : 'Its server is the one pnpm dev started, in memory.',
      ],
    ),
    h.ol(slots.introSteps.attrs(), [
      h.li([], ['As Wren, a writer, start a post. It saves as you type; a writer cannot publish.']),
      h.li([], ['Switch to Edda, an editor, open it and publish it.']),
      h.li([], ['View the site as a visitor: only what was published is there.']),
      h.li([], ['In Pages, open Home and build it from blocks; publish, then look again.']),
    ]),
    ...(sandboxed
      ? [
          h.p(
            [],
            [
              'Made a mess? ',
              h.a([h.Href(`?as=${chair}&reset`)], ['Start the sandbox again']),
              ', with the posts and pages it began with.',
            ],
          ),
        ]
      : []),
  ])

/** Who each chair is, as the sidebar introduces them. */
const people: Readonly<Record<Chair, { readonly name: string; readonly role: string }>> = {
  wren: { name: 'Wren', role: 'Writer' },
  edda: { name: 'Edda', role: 'Editor' },
  visitor: { name: 'A visitor', role: 'Reader' },
}

/** The editor's status, in words: the posts' editor and the pages' say the same. */
export const statusLine: Readonly<Record<EditorStatus, string>> = {
  Closed: '',
  Loading: 'Loading…',
  NotFound: 'That entry does not exist.',
  LoadFailed: 'The entry could not be read.',
  Opened: 'Up to date.',
  Editing: 'Unsaved changes…',
  Saving: 'Saving…',
  Saved: 'Draft saved.',
  Conflict: 'Someone else saved this since you opened it. Your text is still here.',
  SaveFailed: 'Not saved',
  Publishing: 'Publishing…',
  Published: 'Published.',
  PublishFailed: 'Not published',
  Incomplete: 'Not published: fill in what is marked.',
  Scheduling: 'Scheduling…',
  Scheduled: 'Scheduled.',
  ScheduleFailed: 'Not scheduled',
}

/** Whether a status is a failure, which the status line says in the error color. */
export const failed = (status: EditorStatus): boolean =>
  [
    'NotFound',
    'LoadFailed',
    'SaveFailed',
    'PublishFailed',
    'ScheduleFailed',
    'Conflict',
    'Incomplete',
  ].includes(status)

/** Whether the entry's state is one of `tags`; an entry with no state yet is none of them. */
export const stateIs = (state: Option.Option<State>, ...tags: ReadonlyArray<State['_tag']>) =>
  Option.exists(state, known => tags.includes(known._tag))

/** An entry's state as a badge: its tag is its color, its words the CMS's. */
export const badge = <M>(
  slots: SlotView.SlotBuilders<typeof AdminSlots, M>,
  h: HtmlBuilder<M>,
  state: Option.Option<State>,
): Html =>
  Option.match(state, {
    // Something new has no entry yet, so no state: it is new all the same.
    onNone: () => h.span(slots.badge.attrs([h.DataAttribute('state', 'New')]), ['New']),
    onSome: known =>
      h.span(slots.badge.attrs([h.DataAttribute('state', known._tag)]), [
        Display.show(Cms.Display.State.of({}), known),
      ]),
  })

export const shell = <M>(
  slots: SlotView.SlotBuilders<typeof AdminSlots, M>,
  h: HtmlBuilder<M>,
  section: 'posts' | 'pages',
  body: ReadonlyArray<Html>,
): Html => {
  const link = (name: 'posts' | 'pages', label: string, href: string) =>
    h.a(slots.navLink.attrs([h.Href(href), ...(name === section ? [h.AriaCurrent('page')] : [])]), [
      icon(h, name),
      label,
    ])
  return h.div(slots.root.attrs(), [
    h.aside(slots.sidebar.attrs([h.AriaLabel('Studio')]), [
      h.a(slots.brand.attrs([h.Href(`/?as=${chair}`)]), [
        h.span(slots.brandMark.attrs(), ['J']),
        h.span([], ['Journal']),
      ]),
      h.nav(slots.nav.attrs([h.AriaLabel('Sections')]), [
        link('posts', 'Posts', `/?as=${chair}`),
        link('pages', 'Pages', `/pages?as=${chair}`),
        h.a(slots.navLink.attrs([h.Href(`/site?as=${chair}`)]), [
          icon(h, 'site'),
          'View site',
          h.span(slots.navAside.attrs(), [icon(h, 'external', 14)]),
        ]),
      ]),
      h.nav(slots.account.attrs([h.AriaLabel('Who is looking')]), [
        h.p(slots.accountLabel.attrs(), ['Signed in as']),
        ...chairs.map(name =>
          h.a(
            slots.whoLink.attrs([
              h.Href(`?as=${name}`),
              ...(name === chair ? [h.AriaCurrent('page')] : []),
            ]),
            [
              h.span(slots.avatar.attrs([h.DataAttribute('chair', name)]), [
                people[name].name.charAt(0),
              ]),
              h.span(slots.whoName.attrs(), [people[name].name]),
              h.span(slots.whoRole.attrs(), [people[name].role]),
            ],
          ),
        ),
      ]),
    ]),
    h.main(slots.main.attrs(), [...body]),
  ])
}
