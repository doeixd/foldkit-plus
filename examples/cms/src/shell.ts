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
import { chairOf, chairs, type Chair } from './transport.js'

export const chair: Chair = chairOf(window.location.search)

const chairNames: Readonly<Record<Chair, string>> = {
  wren: 'Wren, a writer',
  edda: 'Edda, an editor',
  visitor: 'A visitor',
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
  Scheduling: 'Scheduling…',
  Scheduled: 'Scheduled.',
  ScheduleFailed: 'Not scheduled',
}

/** Whether a status is a failure, which the status line says in the error color. */
export const failed = (status: EditorStatus): boolean =>
  ['NotFound', 'LoadFailed', 'SaveFailed', 'PublishFailed', 'ScheduleFailed', 'Conflict'].includes(
    status,
  )

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
  const here = (name: 'posts' | 'pages') => (name === section ? [h.AriaCurrent('page')] : [])
  return h.div(slots.root.attrs(), [
    h.header(slots.header.attrs(), [
      h.a(slots.brand.attrs([h.Href(`/?as=${chair}`)]), ['Journal Studio']),
      h.nav(slots.nav.attrs([h.AriaLabel('Sections')]), [
        h.a(slots.navLink.attrs([h.Href(`/?as=${chair}`), ...here('posts')]), ['Posts']),
        h.a(slots.navLink.attrs([h.Href(`/pages?as=${chair}`), ...here('pages')]), ['Pages']),
        h.a(slots.navLink.attrs([h.Href(`/site?as=${chair}`)]), ['View site ↗']),
      ]),
      h.nav(slots.who.attrs([h.AriaLabel('Who is looking')]), [
        'Signed in as',
        ...chairs.map(name =>
          h.a(
            slots.whoLink.attrs([
              h.Href(`?as=${name}`),
              ...(name === chair ? [h.AriaCurrent('page')] : []),
            ]),
            [chairNames[name]],
          ),
        ),
      ]),
    ]),
    h.main(slots.main.attrs(), [...body]),
  ])
}
