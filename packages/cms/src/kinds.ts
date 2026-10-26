/**
 * The displays a CMS adds, made with `Display.kind` exactly as an application
 * makes its own, and a renderer for each to spread beside `foldkit-mixins-crud`'s.
 * Its controls, a slug and a moment, are `foldkit-form-recipes`'.
 * Entry-level views (its state badge, published history, remaining
 * transitions) live in `./views.js`: they draw on the application's own slot
 * builders, so the application keeps its slots and styles.
 */
import { Display, type DisplayWords } from 'foldkit-crud'
import { fillWords } from 'foldkit-form'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { State } from './lifecycle.js'

/**
 * The attribute an entry's state is written in, wherever the CMS draws one (a
 * list's state cell, `stateBadge`): one name, so one tone rule styles both.
 */
export const stateAttribute = 'data-cms-state'

export interface StateWords {
  readonly New?: string
  readonly Published?: string
  readonly Changed?: string
  readonly Unpublished?: string
  readonly Archived?: string
  readonly scheduled?: string
  readonly overdue?: string
  /** A state with what its schedule adds: `{state}` and `{schedule}`. */
  readonly withSchedule?: string
}
const stateWords: Required<StateWords> = {
  New: 'New',
  Published: 'Published',
  Changed: 'Changed',
  Unpublished: 'Unpublished',
  Archived: 'Archived',
  scheduled: 'scheduled',
  overdue: 'overdue',
  withSchedule: '{state}, {schedule}',
}

const isState = (value: unknown): value is State =>
  typeof value === 'object' && value !== null && '_tag' in value && 'schedule' in value

/** What a state's schedule adds to it: nothing, `scheduled`, or `overdue`. */
const scheduleOf = (state: State): 'scheduled' | 'overdue' | undefined =>
  state.schedule === null ? undefined : state.schedule.overdue ? 'overdue' : 'scheduled'

/** An entry's lifecycle state, as words. A publish that did not happen says so. */
const StateDisplay = Display.kind<{ readonly words?: StateWords | undefined }>('CmsState', {
  text: (data, value) => {
    if (!isState(value)) return String(value)
    const words = { ...stateWords, ...data.words }
    const schedule = scheduleOf(value)
    return schedule === undefined
      ? words[value._tag]
      : fillWords(words.withSchedule, { state: words[value._tag], schedule: words[schedule] })
  },
})

const units: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/**
 * A time. Given a clock it reads relative to it ("3 days ago"), and the view
 * decides how often that clock moves; given none it is the date and the time.
 */
const Moment = Display.kind<{
  readonly now?: (() => Date) | undefined
  readonly locale?: string | undefined
}>('CmsMoment', {
  text: (data, value) => {
    const at = new Date(String(value))
    if (Number.isNaN(at.getTime())) return String(value)
    if (data.now === undefined)
      return new Intl.DateTimeFormat(data.locale ?? 'en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(at)
    const delta = at.getTime() - data.now().getTime()
    const relative = new Intl.RelativeTimeFormat(data.locale ?? 'en', { numeric: 'auto' })
    const unit = units.find(([, size]) => Math.abs(delta) >= size)
    return unit === undefined
      ? relative.format(0, 'minute')
      : relative.format(Math.trunc(delta / unit[1]), unit[0])
  },
})

/** What `foldkit-mixins-crud` gives a display's renderer, as far as these read it. */
export interface DisplayContext<Message> {
  readonly display: {
    readonly kind: string
    readonly text: (value: unknown, words: DisplayWords) => string
  }
  readonly value: unknown
  readonly words: DisplayWords
  readonly h: HtmlBuilder<Message>
  readonly badge: { readonly attrs: (attrs: ReadonlyArray<any>) => any }
}

export const Kinds = {
  /** The display kinds. */
  Display: { State: StateDisplay, Moment },

  /** For `ListView`'s and `DetailView`'s `renderers`: a state as a badge, a moment as a `time`. */
  displayRenderers: <Message>(): Readonly<
    Record<string, (context: DisplayContext<Message>) => Html>
  > => ({
    [StateDisplay.kind]: ({ display, value, words, h, badge }) =>
      h.span(
        badge.attrs(
          isState(value)
            ? [
                h.Attribute(stateAttribute, value._tag),
                ...(scheduleOf(value) === undefined
                  ? []
                  : [h.DataAttribute('cms-schedule', scheduleOf(value)!)]),
              ]
            : [],
        ),
        [display.text(value, words)],
      ),
    [Moment.kind]: ({ display, value, words, h }) =>
      h.time([h.Attribute('datetime', String(value))], [display.text(value, words)]),
  }),
}
