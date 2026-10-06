/**
 * The entry-level views: a badge for a state, rows for a history, a timeline
 * with Live and Restore in the right places, and the transitions each state
 * offers.
 */
import { Option, Schema } from 'effect'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { RemoteData } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import {
  Cms,
  type RevisionHistory,
  type RevisionRow,
  type State,
  type Transition,
} from '../src/index.js'

const Message = defineMessageUnion({
  RestoreAsked: { revision: Schema.Number },
  DiscardAsked: {},
  UnpublishAsked: {},
  ArchiveAsked: {},
  UnarchiveAsked: {},
  RetryAsked: {},
})
type Message = typeof Message.Type

const TestSlots = Slots.define({
  card: Slot.make({ capability: Capability.Container }),
  cardTitle: Slot.make({ capability: Capability.Container }),
  badge: Slot.make({ capability: Capability.Container }),
  muted: Slot.make({ capability: Capability.Container }),
  timeline: Slot.make({ capability: Capability.Container }),
  revision: Slot.make({ capability: Capability.Container }),
  revisionMark: Slot.make({ capability: Capability.Container }),
  revisionBody: Slot.make({ capability: Capability.Container }),
  revisionTitle: Slot.make({ capability: Capability.Container }),
  revisionLive: Slot.make({ capability: Capability.Container }),
  revisionMeta: Slot.make({ capability: Capability.Container }),
  revisionRestore: Slot.make({ capability: Capability.Interactive }),
  toolbar: Slot.make({ capability: Capability.Container }),
  button: Slot.make({ capability: Capability.Interactive }),
  danger: Slot.make({ capability: Capability.Interactive }),
})
type Slots = SlotView.SlotBuilders<typeof TestSlots, Message>

const revisions: ReadonlyArray<RevisionRow> = [
  { n: 2, publishedAt: '2026-09-27T12:00:00.000Z', publishedBy: 'edda' },
  { n: 1, publishedAt: '2026-09-24T12:00:00.000Z', publishedBy: null },
]

const draw = (view: (slots: Slots, h: HtmlBuilder<Message>) => Html) => {
  const View = SlotView.define(TestSlots, (_model: {}, slots, h: HtmlBuilder<Message>) =>
    view(slots, h),
  )
  return View({}, SlotView.inertBuilder<Message>())
}

describe('stateBadge', () => {
  const attrsOf = (tree: unknown): unknown => {
    const badge = Inert.all(tree as never).find(node => node.sel === 'span')
    return badge?.data?.attrs
  }

  it('says New for no state, and a state in its words', () => {
    const fresh = draw((slots, h) => Cms.stateBadge(slots.badge, h, Option.none()))
    expect(attrsOf(fresh)).toEqual({ [Cms.stateAttribute]: 'New' })
    expect(Inert.text(fresh)).toBe('New')
    const published = draw((slots, h) =>
      Cms.stateBadge(slots.badge, h, Option.some({ _tag: 'Published', schedule: null })),
    )
    expect(attrsOf(published)).toEqual({ [Cms.stateAttribute]: 'Published' })
    expect(Inert.text(published)).toBe('Published')
    // The name a list's state cell writes too, so one tone rule styles both.
    expect(Cms.stateAttribute).toBe('data-cms-state')
  })
})

describe('revisionsOf', () => {
  const history =
    (
      read: RemoteData<{ readonly revisions: ReadonlyArray<RevisionRow> }>,
    ): (() => Option.Option<{
      readonly read: () => RemoteData<{ readonly revisions: ReadonlyArray<RevisionRow> }>
    }>) =>
    () =>
      Option.some({ read: () => read })

  it('reads rows once read, stale rows while refetching', () => {
    expect(Cms.revisionsOf({}, history({ _tag: 'Ready', value: { revisions } }))).toEqual({
      _tag: 'Ready',
      revisions,
    })
    expect(Cms.revisionsOf({}, history({ _tag: 'Refreshing', value: { revisions } }))).toEqual({
      _tag: 'Ready',
      revisions,
    })
  })

  it('says loading while the read has no answer yet', () => {
    expect(Cms.revisionsOf({}, history({ _tag: 'Loading' }))).toEqual({ _tag: 'Loading' })
    expect(Cms.revisionsOf({}, history({ _tag: 'Initial' }))).toEqual({ _tag: 'Loading' })
  })

  it('says failed when the read fails, not empty', () => {
    expect(
      Cms.revisionsOf(
        {},
        history({ _tag: 'Failed', error: { _tag: 'ReadFailed', message: 'no' } }),
      ),
    ).toEqual({ _tag: 'Failed' })
  })

  it('reads empty without a history, or with none published', () => {
    expect(Cms.revisionsOf({}, () => Option.none())).toEqual({ _tag: 'Ready', revisions: [] })
    expect(Cms.revisionsOf({}, history({ _tag: 'Ready', value: { revisions: [] } }))).toEqual({
      _tag: 'Ready',
      revisions: [],
    })
  })
})

describe('historyCard', () => {
  const card = (
    state: State,
    history: RevisionHistory = { _tag: 'Ready', revisions },
    extra: {
      readonly onRetry?: Message
      readonly words?: { readonly retry?: string }
    } = {},
  ) =>
    draw((slots, h) =>
      Cms.historyCard(slots, h, history, {
        state: Option.some(state),
        restore: revision => Message.RestoreAsked({ revision }),
        authorName: name => (name === 'edda' ? 'Edda' : name),
        ...extra,
      }),
    )

  // What `OnClick` was given while drawing, so a test reads the dispatched
  // message itself: an inert click handler only throws without a runtime.
  const cardCapturing = (
    history: RevisionHistory,
    extra: {
      readonly onRetry?: Message
      readonly words?: { readonly retry?: string }
    } = {},
  ): { readonly tree: Html; readonly clicked: ReadonlyArray<Message> } => {
    const clicked: Array<Message> = []
    const View = SlotView.define(TestSlots, (_model: {}, slots, h: HtmlBuilder<Message>) => {
      const recording = new Proxy(h, {
        get(target, property) {
          const found = Reflect.get(target, property)
          if (property === 'OnClick' && typeof found === 'function') {
            return (message: Message, options?: unknown) => {
              clicked.push(message)
              return Reflect.apply(found as (...args: ReadonlyArray<unknown>) => unknown, target, [
                message,
                options,
              ])
            }
          }
          return found
        },
      }) as HtmlBuilder<Message>
      return Cms.historyCard(slots, recording, history, {
        state: Option.some({ _tag: 'Published', schedule: null }),
        restore: revision => Message.RestoreAsked({ revision }),
        authorName: name => name,
        ...extra,
      })
    })
    return { tree: View({}, SlotView.inertBuilder<Message>()), clicked }
  }

  it('marks the newest Live while on the site, restoring only the older', () => {
    const tree = card({ _tag: 'Published', schedule: null })
    const [newest, oldest] = Inert.byTag(tree, 'li')
    expect(Inert.value(newest, 'data-live')).toBe('')
    expect(Inert.value(oldest, 'data-live')).toBeUndefined()
    expect(Inert.text(newest)).toMatch(/^Revision 2Live/)
    const newestRestore = Inert.byTag(newest, 'button')[0]
    const oldestRestore = Inert.byTag(oldest, 'button')[0]
    expect(newestRestore).toBeUndefined()
    expect(Inert.value(oldestRestore, 'aria-label')).toBe('Restore revision 1')
  })

  it('offers the live revision back while a draft sits over it', () => {
    const tree = card({ _tag: 'Changed', schedule: null })
    expect(
      Inert.byTag(tree, 'li').map(item =>
        Inert.value(Inert.byTag(item, 'button')[0], 'aria-label'),
      ),
    ).toEqual(['Restore revision 2', 'Restore revision 1'])
  })

  it('names who published through the application', () => {
    const tree = card({ _tag: 'Published', schedule: null })
    const metas = Inert.byTag(tree, 'p').map(node => Inert.text(node))
    expect(metas.some(text => text?.includes('Edda'))).toBe(true)
    const [time] = Inert.byTag(tree, 'time')
    expect(Inert.value(time, 'datetime')).toBe('2026-09-27T12:00:00.000Z')
  })

  it('says when nothing was published yet', () => {
    const tree = card({ _tag: 'New', schedule: null }, { _tag: 'Ready', revisions: [] })
    expect(Inert.text(tree)).toContain('Nothing has been published yet.')
  })

  it('says when the history failed instead of claiming nothing was published', () => {
    const tree = card({ _tag: 'Published', schedule: null }, { _tag: 'Failed' })
    expect(Inert.text(tree)).toContain('The history could not be read.')
    expect(Inert.text(tree)).not.toContain('Nothing has been published yet.')
  })

  it('announces a failed history as an alert, with no retry unless one was given', () => {
    const tree = card({ _tag: 'Published', schedule: null }, { _tag: 'Failed' })
    const [paragraph] = Inert.byTag(tree, 'p')
    expect(Inert.value(paragraph, 'role')).toBe('alert')
    expect(Inert.value(paragraph, 'aria-busy')).toBeUndefined()
    expect(Inert.byTag(tree, 'button')).toEqual([])
  })

  it('asks again through onRetry, saying Try again unless told otherwise', () => {
    const retry = Message.RetryAsked({})
    const { tree, clicked } = cardCapturing({ _tag: 'Failed' }, { onRetry: retry })
    const [button] = Inert.byTag(tree, 'button')
    expect(button).toBeDefined()
    expect(Inert.text(button)).toBe('Try again')
    expect(clicked).toEqual([retry])
    const renamed = cardCapturing(
      { _tag: 'Failed' },
      { onRetry: Message.RetryAsked({}), words: { retry: 'Reload history' } },
    )
    expect(Inert.text(Inert.byTag(renamed.tree, 'button')[0])).toBe('Reload history')
  })

  it('says loading while the history has no answer yet', () => {
    const tree = card({ _tag: 'Published', schedule: null }, { _tag: 'Loading' })
    expect(Inert.text(tree)).toContain('Loading')
    expect(Inert.text(tree)).not.toContain('Nothing has been published yet.')
  })

  it('says a loading history as a busy status, told from empty', () => {
    const tree = card({ _tag: 'Published', schedule: null }, { _tag: 'Loading' })
    const [paragraph] = Inert.byTag(tree, 'p')
    expect(Inert.value(paragraph, 'role')).toBe('status')
    expect(Inert.value(paragraph, 'aria-busy')).toBe('true')
    expect(Inert.byTag(tree, 'button')).toEqual([])
  })
})

describe('moreCard', () => {
  const asks = {
    discard: Message.DiscardAsked({}),
    unpublish: Message.UnpublishAsked({}),
    archive: Message.ArchiveAsked({}),
    unarchive: Message.UnarchiveAsked({}),
  }
  const card = (state: State | null, may: (transition: Transition) => boolean) =>
    draw((slots, h) =>
      h.div(
        [],
        Cms.moreCard(slots, h, {
          state: Option.fromNullOr(state),
          may,
          asks,
          archiveIcon: h.span([], ['*']),
        }),
      ),
    )
  const labels = (tree: ReturnType<typeof card>): ReadonlyArray<string> =>
    Inert.byTag(tree, 'button').map(button => Inert.text(button) ?? '')

  it('offers nothing for something never saved', () => {
    expect(labels(card(null, () => true))).toEqual([])
  })

  it('offers discard, unpublish and archive on a changed entry', () => {
    expect(labels(card({ _tag: 'Changed', schedule: null }, () => true))).toEqual([
      'Discard draft',
      'Unpublish',
      '*Archive',
    ])
  })

  it('offers only unarchive once put away', () => {
    expect(labels(card({ _tag: 'Archived', schedule: null }, () => true))).toEqual(['Unarchive'])
  })

  it('gates discard and unpublish on may; archive is always offered', () => {
    expect(labels(card({ _tag: 'Changed', schedule: null }, () => false))).toEqual(['*Archive'])
  })
})
