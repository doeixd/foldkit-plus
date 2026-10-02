import { Array, Match, Option, pipe } from 'effect'
import { Submodel } from 'foldkit'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'

import { VirtualList } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import {
  type AvatarColor,
  VirtualListPageSlots,
  VirtualListPageStyle,
} from '../style/virtualList.js'

type Activity = Readonly<{
  id: number
  actor: string
  initial: string
  color: AvatarColor
  verb: string
  target: string
  timeAgo: string
  hasSummary: boolean
}>

export const ROW_COUNT = 10_000

const actorNames = [
  'Sarah Chen',
  'Marcus Davies',
  'Priya Patel',
  'Alex Kim',
  'Jordan Lee',
  'Sam Rivera',
  'Ben Carter',
  'Mira Patel',
  'Lucy Hong',
  'Casey Park',
  'Robin Adams',
  'Tomás Reyes',
]

const actionVerbs = [
  'merged',
  'opened',
  'commented on',
  'approved',
  'closed',
  'reopened',
  'requested review on',
  'pushed to',
]

const avatarColors: ReadonlyArray<AvatarColor> = [
  'rose',
  'amber',
  'emerald',
  'sky',
  'violet',
  'fuchsia',
  'teal',
  'orange',
]

const branchNames = [
  'main',
  'feat/scroll-handlers',
  'fix/dialog-focus',
  'refactor/auth',
  'chore/deps',
]

const cycle = <A>(xs: ReadonlyArray<A>, index: number): A =>
  pipe(xs, Array.get(index % xs.length), Option.getOrThrow)

const formatTimeAgo = (hours: number): string => {
  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))}m ago`
  }
  if (hours < 24) {
    return `${Math.round(hours)}h ago`
  }
  const days = hours / 24
  if (days < 30) {
    return `${Math.round(days)}d ago`
  }
  const months = days / 30
  if (months < 12) {
    return `${Math.round(months)}mo ago`
  }
  return `${Math.round(months / 12)}y ago`
}

const targetForVerb = (verb: string, index: number): string => {
  const number = ((index * 13) % 9999) + 1
  return Match.value(verb).pipe(
    Match.withReturnType<string>(),
    Match.when('pushed to', () => cycle(branchNames, index)),
    Match.whenOr('opened', 'closed', 'reopened', () => `issue #${number}`),
    Match.orElse(() => `PR #${number}`),
  )
}

const sampleActivities: ReadonlyArray<Activity> = Array.makeBy(ROW_COUNT, index => {
  const actor = cycle(actorNames, index)
  const verb = cycle(actionVerbs, index)
  const color = cycle(avatarColors, index)
  const hoursAgo = index * 2.3
  return {
    id: index,
    actor,
    initial: actor.charAt(0),
    color,
    verb,
    target: targetForVerb(verb, index),
    timeAgo: formatTimeAgo(hoursAgo),
    hasSummary: index % 4 === 0,
  }
})

// VARIABLE-HEIGHT DATA

type Summary = Readonly<{
  title: string
  body: string
  artifact: string
}>

const summaries: ReadonlyArray<Summary> = [
  {
    title: 'CI passing across all browsers',
    body: 'Resolved the flake in the snapshot suite and confirmed the migration step runs idempotently against staging.',
    artifact: 'ci/run-4892',
  },
  {
    title: 'Tracking upstream change',
    body: 'Linked the upstream regression and added reproduction context so the next reviewer has everything in one place.',
    artifact: 'tracker/issue-218',
  },
  {
    title: 'Release notes ready for review',
    body: 'Bumped the patch version, regenerated the changelog, and queued the release notes for editorial pass.',
    artifact: 'release/v0.42.1-rc1',
  },
  {
    title: 'Rollback plan coordinated',
    body: 'Walked through the unwind steps with on-call and pre-staged the revert PR in case the deploy needs to be undone.',
    artifact: 'runbook/rollback-checklist',
  },
  {
    title: 'Failure trace attached',
    body: 'Captured the steps to reproduce, attached the failing trace, and tagged the owning team for triage.',
    artifact: 'traces/failure-7c2e',
  },
  {
    title: 'Visual direction approved',
    body: 'Aligned with the design team on spacing, contrast, and the dark-mode treatment before merging the implementation.',
    artifact: 'design/spec-v3',
  },
  {
    title: 'Migration verified on staging',
    body: 'Confirmed the migration runs cleanly against the staging snapshot and produces the expected row counts on every shard.',
    artifact: 'migration/2026-04-batch',
  },
]

const SHORT_ROW_HEIGHT_PX = 56
const TALL_ROW_HEIGHT_PX = 112

const summaryFor = (index: number): Summary =>
  pipe(summaries, Array.get(index % summaries.length), Option.getOrThrow)

export const variableActivities: ReadonlyArray<Activity> = sampleActivities

export const variableRowHeightPx = (activity: Activity): number =>
  activity.hasSummary ? TALL_ROW_HEIGHT_PX : SHORT_ROW_HEIGHT_PX

type Slots = SlotBuilders<typeof VirtualListPageSlots, UiMessage>

/** The avatar's color is the row's, which its `data-color` carries to the Style. */
const avatar = (row: Activity, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.avatar.attrs([h.DataAttribute('color', row.color)]), [row.initial])

const activityText = (row: Activity, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.activityText.attrs(), [
    h.span(slots.actor.attrs(), [row.actor]),
    ' ',
    row.verb,
    ' ',
    h.span(slots.target.attrs(), [row.target]),
  ])

const shortRow = (row: Activity, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.row.attrs(), [
    avatar(row, slots, h),
    activityText(row, slots, h),
    h.div(slots.timeAgo.attrs(), [row.timeAgo]),
  ])

const tallRow = (row: Activity, summary: Summary, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.tallRow.attrs(), [
    avatar(row, slots, h),
    h.div(slots.activity.attrs(), [
      activityText(row, slots, h),
      h.div(slots.summaryTitle.attrs(), [summary.title]),
      h.div(slots.summaryBody.attrs(), [summary.body]),
      h.div(slots.artifact.attrs(), [summary.artifact]),
    ]),
    h.div(slots.timeAgo.attrs(), [row.timeAgo]),
  ])

type ListDemo = Readonly<{
  title: string
  description: string
  jumpMessage: UiMessage
  list: Html
}>

const listDemo = (demo: ListDemo, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.demo.attrs(), [
    h.h3(slots.subsection.attrs(), [demo.title]),
    h.div(slots.header.attrs(), [
      h.span(slots.count.attrs(), [demo.description]),
      h.button(slots.jumpButton.attrs([h.OnClick(demo.jumpMessage)]), ['Jump to middle']),
    ]),
    demo.list,
  ])

const VirtualListPage = SlotView.forMessages<UiMessage>()
  .define(VirtualListPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Virtual List']),
      h.div(slots.demos.attrs(), [
        listDemo(
          {
            title: 'Basic',
            description: `${ROW_COUNT.toLocaleString()} activity events`,
            jumpMessage: UiMessage.ClickedVirtualListScrollToMiddle(),
            list: h.submodel({
              slotId: model.virtualListDemo.id,
              model: model.virtualListDemo,
              view: VirtualList.view<Activity>(),
              viewInputs: {
                items: sampleActivities,
                itemToKey: row => String(row.id),
                itemToView: row => shortRow(row, slots, h),
                containerAttributes: childAttributes(slots.list.attrs()),
              },
              toParentMessage: message => UiMessage.GotVirtualListDemoMessage({ message }),
            }),
          },
          slots,
          h,
        ),
        listDemo(
          {
            title: 'Variable row heights',
            description: 'Every fourth row is taller and shows a summary block',
            jumpMessage: UiMessage.ClickedVirtualListVariableScrollToMiddle(),
            list: h.submodel({
              slotId: model.virtualListVariableDemo.id,
              model: model.virtualListVariableDemo,
              view: VirtualList.view<Activity>(),
              viewInputs: {
                items: variableActivities,
                itemToKey: row => String(row.id),
                itemToRowHeightPx: variableRowHeightPx,
                itemToView: (row, index) =>
                  row.hasSummary
                    ? tallRow(row, summaryFor(index), slots, h)
                    : shortRow(row, slots, h),
                containerAttributes: childAttributes(slots.list.attrs()),
              },
              toParentMessage: message => UiMessage.GotVirtualListVariableDemoMessage({ message }),
            }),
          },
          slots,
          h,
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(VirtualListPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(VirtualListPage)
