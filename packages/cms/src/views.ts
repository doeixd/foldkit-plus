/**
 * The entry-level views every CMS studio draws: its state badge, its
 * published revisions, and what can still happen to it. An application passes
 * its own slot builders and keeps its slots and styles; the interfaces below
 * are the builders each view reads. Words for states come from
 * `Cms.Display`, so a studio and its lists say them one way.
 */
import { Option } from 'effect'
import { Display } from 'foldkit-crud'
import type { SlotView } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { RemoteData } from 'foldkit-remote'
import { Kinds } from './kinds.js'
import type { State, Transition } from './lifecycle.js'

/** Whether the entry's state is one of `tags`; an entry with no state yet is none of them. */
const stateIs = (state: Option.Option<State>, ...tags: ReadonlyArray<State['_tag']>) =>
  Option.exists(state, known => tags.includes(known._tag))

/** An entry's state as a badge: its tag is its color, its words the CMS's. */
export const stateBadge = <M>(
  badge: SlotView.SlotBuilder<M>,
  h: HtmlBuilder<M>,
  state: Option.Option<State>,
  attribute = 'state',
): Html =>
  Option.match(state, {
    // Something new has no entry yet, so no state: it is new all the same.
    // `attribute` is the raw name: the view writes `data-<attribute>`, which
    // the badge's tone selectors hook.
    onNone: () => h.span(badge.attrs([h.DataAttribute('state', 'New')]), ['New']),
    onSome: known =>
      h.span(badge.attrs([h.DataAttribute(attribute, known._tag)]), [
        Display.show(Kinds.Display.State.of({}), known),
      ]),
  })

/** A published revision, as an editor's History lists it. */
export interface RevisionRow {
  readonly n: number
  readonly publishedAt: string
  readonly publishedBy: string | null
}

/**
 * The open entry's published revisions, as they have been read. A posts'
 * history and a pages' revisions read through the same shape, so one helper
 * serves both: which read is the section's to name.
 */
export const revisionsOf = <M, Value extends { readonly revisions: ReadonlyArray<RevisionRow> }>(
  model: M,
  history: (model: M) => Option.Option<{ readonly read: (model: M) => RemoteData<Value> }>,
): ReadonlyArray<RevisionRow> =>
  Option.match(history(model), {
    onNone: () => [],
    onSome: projection => {
      const read = projection.read(model)
      return read._tag === 'Ready' || read._tag === 'Refreshing' ? read.value.revisions : []
    },
  })

/** A moment as the History says it: "Sep 27, 2026" and "9:12 PM", apart. */
const momentOf = (iso: string) => {
  const at = new Date(iso)
  return {
    day: at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

/** The builders `historyCard` reads. */
export interface HistoryCardSlots<M> {
  readonly card: SlotView.SlotBuilder<M>
  readonly cardTitle: SlotView.SlotBuilder<M>
  readonly muted: SlotView.SlotBuilder<M>
  readonly timeline: SlotView.SlotBuilder<M>
  readonly revision: SlotView.SlotBuilder<M>
  readonly revisionMark: SlotView.SlotBuilder<M>
  readonly revisionBody: SlotView.SlotBuilder<M>
  readonly revisionTitle: SlotView.SlotBuilder<M>
  readonly revisionLive: SlotView.SlotBuilder<M>
  readonly revisionMeta: SlotView.SlotBuilder<M>
  readonly revisionRestore: SlotView.SlotBuilder<M>
}

/**
 * What was published, newest first, as a timeline: each revision on a line
 * down to the first, with when and by whom. The newest is marked Live while
 * the entry is on the site; restoring it is offered only while a draft sits
 * over it, since otherwise it changes nothing. Who published is the
 * application's to name (`authorName`), as only it knows its chairs.
 */
export const historyCard = <M>(
  slots: HistoryCardSlots<M>,
  h: HtmlBuilder<M>,
  revisions: ReadonlyArray<RevisionRow>,
  entry: {
    readonly state: Option.Option<State>
    readonly restore: (revision: number) => M
    readonly authorName: (name: string) => string
  },
): Html => {
  const live = stateIs(entry.state, 'Published', 'Changed')
  const drafted = stateIs(entry.state, 'Changed')
  return h.section(slots.card.attrs([h.Id('history')]), [
    h.h2(slots.cardTitle.attrs(), ['History']),
    revisions.length === 0
      ? h.p(slots.muted.attrs(), ['Nothing has been published yet.'])
      : h.ol(
          slots.timeline.attrs([h.AriaLabel('Published revisions, newest first')]),
          revisions.map((revision, index) => {
            const newest = index === 0
            const { day, time } = momentOf(revision.publishedAt)
            const isLive = newest && live
            return h.li(slots.revision.attrs(isLive ? [h.DataAttribute('live', '')] : []), [
              h.span(slots.revisionMark.attrs([h.AriaHidden(true)]), []),
              h.div(slots.revisionBody.attrs(), [
                h.p(slots.revisionTitle.attrs(), [
                  `Revision ${revision.n}`,
                  ...(isLive ? [h.span(slots.revisionLive.attrs(), ['Live'])] : []),
                ]),
                h.p(slots.revisionMeta.attrs(), [
                  h.time([h.Attribute('datetime', revision.publishedAt)], [`${day} · ${time}`]),
                  ...(revision.publishedBy === null
                    ? []
                    : [` · ${entry.authorName(revision.publishedBy)}`]),
                ]),
              ]),
              ...(isLive && !drafted
                ? []
                : [
                    h.button(
                      slots.revisionRestore.attrs([
                        h.OnClick(entry.restore(revision.n)),
                        h.AriaLabel(`Restore revision ${revision.n}`),
                      ]),
                      ['Restore'],
                    ),
                  ]),
            ])
          }),
        ),
  ])
}

/** The builders `moreCard` reads. */
export interface MoreCardSlots<M> {
  readonly card: SlotView.SlotBuilder<M>
  readonly cardTitle: SlotView.SlotBuilder<M>
  readonly toolbar: SlotView.SlotBuilder<M>
  readonly button: SlotView.SlotBuilder<M>
  readonly danger: SlotView.SlotBuilder<M>
}

/**
 * The rest of what can happen to an entry: its draft discarded, taken off the
 * site, put away or brought back, each where the server would allow it. None
 * for something never saved, which has nothing to discard or put away. The
 * archive button's icon is the application's, drawn its way.
 */
export const moreCard = <M>(
  slots: MoreCardSlots<M>,
  h: HtmlBuilder<M>,
  entry: {
    readonly state: Option.Option<State>
    readonly may: (transition: Transition) => boolean
    readonly asks: {
      readonly discard: M
      readonly unpublish: M
      readonly archive: M
      readonly unarchive: M
    }
    readonly archiveIcon: Html
  },
): ReadonlyArray<Html> => {
  const { state, may, asks } = entry
  if (Option.isNone(state)) return []
  const action = (id: string, label: string, message: M): Html =>
    h.button(slots.button.attrs([h.Id(id), h.OnClick(message)]), [label])
  return [
    h.section(slots.card.attrs(), [
      h.h2(slots.cardTitle.attrs(), ['More']),
      h.div(slots.toolbar.attrs(), [
        ...(may('discard') && stateIs(state, 'Changed', 'New')
          ? [action('discard', 'Discard draft', asks.discard)]
          : []),
        ...(may('unpublish') && stateIs(state, 'Published', 'Changed')
          ? [action('unpublish', 'Unpublish', asks.unpublish)]
          : []),
        stateIs(state, 'Archived')
          ? action('unarchive', 'Unarchive', asks.unarchive)
          : h.button(slots.danger.attrs([h.Id('archive'), h.OnClick(asks.archive)]), [
              entry.archiveIcon,
              'Archive',
            ]),
      ]),
    ]),
  ]
}
