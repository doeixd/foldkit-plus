/**
 * The authoring shell both applications draw: the header with the sections and
 * who is looking, around a section's own content. It publishes no Slots of its
 * own; it draws `AdminSlots`, which the section's view is defined over.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { SlotView } from 'foldkit-mixins'
import { Option } from 'effect'
import { Cms, type EditorStatus, type State } from 'foldkit-cms'
import type { AdminSlots } from '../styles/adminStyle.js'
import { icon } from './icons.js'
import { chairOf, chairs, type Chair } from '../server/transport.js'

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

/**
 * The bar's status line: what the editor last did with the draft, unless the
 * entry itself says more. A status comes from the last save or publish, so
 * after an archive or an unpublish it would still say "Published." or
 * "Scheduled."; and something new that nothing was typed into is not
 * "Up to date", it is empty.
 */
export const statusText = (status: EditorStatus, state: Option.Option<State>): string => {
  if (['Opened', 'Saved', 'Published', 'Scheduled'].includes(status)) {
    if (stateIs(state, 'Archived')) return 'Archived.'
    if (stateIs(state, 'Unpublished')) return 'Not on the site.'
    if (Option.isNone(state)) return ''
  }
  return statusLine[status]
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

/**
 * What an entry is closed from, and what it says: the bar above an open
 * entry. The posts' bar and the pages' own differ only in where back goes
 * and which actions they offer.
 */
export interface EditorBar<M> {
  /** Where back goes: the section label and the message that closes the entry. */
  readonly closeLabel: string
  readonly close: M
  readonly status: EditorStatus
  readonly state: Option.Option<State>
  readonly error: Option.Option<{ readonly message: string }>
  /** What can be done next: the preview toggle, the site link, the publish button. */
  readonly actions: ReadonlyArray<Html>
}

export const editorBar = <M>(
  slots: SlotView.SlotBuilders<typeof AdminSlots, M>,
  h: HtmlBuilder<M>,
  bar: EditorBar<M>,
): Html =>
  h.div(slots.editorBar.attrs(), [
    h.button(slots.ghost.attrs([h.Id('close'), h.OnClick(bar.close)]), [
      icon(h, 'back'),
      bar.closeLabel,
    ]),
    // An entry still being read is not New: no badge until its state is known.
    ...(bar.status === 'Loading' ? [] : [Cms.stateBadge(slots.badge, h, bar.state)]),
    h.p(
      slots.status.attrs([
        h.Id('status'),
        h.Role('status'),
        ...(failed(bar.status) ? [h.DataAttribute('tone', 'error')] : []),
        ...(bar.status === 'Loading' ? [h.AriaBusy(true)] : []),
      ]),
      [
        statusText(bar.status, bar.state),
        Option.match(bar.error, { onNone: () => '', onSome: ({ message }) => `: ${message}` }),
      ],
    ),
    h.div(slots.barActions.attrs(), [...bar.actions]),
  ])

/** Who published, by the name the sidebar gives them; someone else by their own. */
export const publisherOf = (name: string): string =>
  Option.match(Option.fromUndefinedOr(chairs.find(known => known === name)), {
    onNone: () => name,
    onSome: known => people[known].name,
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
        // In this tab, as the site links back here: no mark of a link that leaves.
        h.a(slots.navLink.attrs([h.Href(`/site?as=${chair}`)]), [icon(h, 'site'), 'View site']),
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
