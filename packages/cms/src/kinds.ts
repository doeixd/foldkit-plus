/**
 * The kinds a CMS adds: two controls and two displays, made with `Input.kind`
 * and `Display.kind` exactly as an application makes its own, and a renderer for
 * each to spread beside `foldkit-mixins-form`'s and `foldkit-mixins-crud`'s.
 * There is no CMS view package: a kind and its renderer are all a view needs.
 */
import { Display } from 'foldkit-crud'
import { Input, type Control, type ControlChange, type Draft } from 'foldkit-form'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import type { State } from './lifecycle.js'

/** Text as an address: lower case, unaccented, words joined by `-`. */
export const slugify = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** A slug: text, shown after the address it completes. */
const Slug = Input.kind<{ readonly prefix: string }>('CmsSlug', { draft: 'text' })

/** A moment: the text of a `datetime-local` input, submitted as an ISO string. */
const DateTime = Input.kind('CmsDateTime', {
  draft: 'text',
  parse: draft => {
    const at = new Date(draft)
    return Number.isNaN(at.getTime()) ? undefined : at.toISOString()
  },
  unparsed: 'Enter a date and a time',
})

export interface StateWords {
  readonly New?: string
  readonly Published?: string
  readonly Changed?: string
  readonly Unpublished?: string
  readonly Archived?: string
  readonly scheduled?: string
  readonly overdue?: string
}
const stateWords: Required<StateWords> = {
  New: 'New',
  Published: 'Published',
  Changed: 'Changed',
  Unpublished: 'Unpublished',
  Archived: 'Archived',
  scheduled: 'scheduled',
  overdue: 'overdue',
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
    return schedule === undefined ? words[value._tag] : `${words[value._tag]}, ${words[schedule]}`
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

/** What `foldkit-mixins-form` gives a control's renderer, as far as these read it. */
export interface ControlContext<Message> {
  readonly control: Control
  readonly draft: Draft
  readonly change: (value: Draft) => Message
  readonly blurred: Message
  readonly state: ReadonlyArray<Attribute<Message>>
  readonly slots: { readonly text: { readonly attrs: (attrs: ReadonlyArray<any>) => any } }
  readonly h: HtmlBuilder<Message>
}

/** What `foldkit-mixins-crud` gives a display's renderer, as far as these read it. */
export interface DisplayContext<Message> {
  readonly display: { readonly kind: string; readonly text: (value: unknown, words: any) => string }
  readonly value: unknown
  readonly words: unknown
  readonly h: HtmlBuilder<Message>
}

/** An ISO moment as a `datetime-local` input writes one, in the viewer's zone; other text as it is. */
const localText = (draft: string): string => {
  const at = new Date(draft)
  if (!/Z$|[+-]\d\d:\d\d$/.test(draft) || Number.isNaN(at.getTime())) return draft
  const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export const Kinds = {
  /** The control kinds: `Cms.Input.Slug.is(control)` narrows one, as `Input.Text.is` does. */
  Input: { Slug, DateTime },
  /** The display kinds. */
  Display: { State: StateDisplay, Moment },

  slugify,

  /**
   * Under a form's `inputs`: the key is a slug that follows `from` until the
   * author writes it, and is shown after `prefix`. A form filled with a published
   * slug does not follow: an address must not move because its title did.
   */
  slug: (
    from: string,
    options: { readonly prefix?: string; readonly through?: (text: string) => string } = {},
  ): ControlChange => ({
    change: (resolved, inputKey) => {
      const following = Input.following(from, options.through ?? slugify).change(resolved, inputKey)
      return Object.freeze({
        ...Slug.of({ prefix: options.prefix ?? '/' }),
        follows: following.follows,
      })
    },
  }),
  /** Under a form's `inputs`, or as Entity metadata with `Input.of`: a moment. */
  dateTime: (): Control => DateTime.of({}),

  /** For `FormView`'s `renderers`, beside its own. */
  controlRenderers: <Message>(): Readonly<
    Record<string, (context: ControlContext<Message>) => Html>
  > => ({
    [Slug.kind]: ({ control, state, draft, change, blurred, slots, h }) =>
      h.span(
        [],
        [
          h.span(
            [h.DataAttribute('cms-slug-prefix', '')],
            [Slug.is(control) ? control.data.prefix : ''],
          ),
          h.input(
            slots.text.attrs([
              ...state,
              h.Type('text'),
              h.Value(String(draft)),
              h.OnInput(change),
              h.OnBlur(blurred),
            ]),
          ),
        ],
      ),
    [DateTime.kind]: ({ state, draft, change, blurred, slots, h }) =>
      h.input(
        slots.text.attrs([
          ...state,
          h.Type('datetime-local'),
          h.Value(localText(String(draft))),
          h.OnInput(change),
          h.OnBlur(blurred),
        ]),
      ),
  }),

  /** For `ListView`'s and `DetailView`'s `renderers`: a state as a badge, a moment as a `time`. */
  displayRenderers: <Message>(): Readonly<
    Record<string, (context: DisplayContext<Message>) => Html>
  > => ({
    [StateDisplay.kind]: ({ display, value, words, h }) =>
      h.span(
        isState(value)
          ? [
              h.DataAttribute('cms-state', value._tag),
              ...(scheduleOf(value) === undefined
                ? []
                : [h.DataAttribute('cms-schedule', scheduleOf(value)!)]),
            ]
          : [],
        [display.text(value, words)],
      ),
    [Moment.kind]: ({ display, value, words, h }) =>
      h.time([h.Attribute('datetime', String(value))], [display.text(value, words)]),
  }),
}
