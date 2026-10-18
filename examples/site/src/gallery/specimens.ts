/**
 * What `/create`'s preview shows besides every component: the theme's type,
 * its palette and shape tokens, and one application screen drawn in it. Each
 * is drawn inside the preview, so every token here reads the reader's knobs.
 * Nothing in them takes state: the screen's fields and buttons are for
 * looking at.
 */
import { Calendar as UiCalendar } from '@foldkit/ui'
import * as UiSelect from '@foldkit/ui/select'
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonSlots,
  Calendar,
  Card,
  Chart,
  Input,
  Recipes,
  Select,
  Table,
  Typography,
  TypographySlots,
} from 'foldkit-mixins-ui'

import {
  AlertStyle,
  AvatarStyle,
  BadgeStyle,
  ButtonStyle,
  CalendarStyle,
  CardStyle,
  ChartStyle,
  InputStyle,
  SelectStyle,
  TableStyle,
} from '../snippets/components.js'
import { forSlots } from '../snippets/theme.js'
import { showcaseOf, type Live } from './showcases.js'
import * as Widgets from './widgets.js'
import type { Message } from '../main.js'
import type { H, Slots } from '../view/layout.js'

type TypographyLevel = Typography.TypographyLevel

const levels: ReadonlyArray<TypographyLevel> = [
  'display',
  'title',
  'subtitle',
  'body',
  'caption',
  'micro',
  'h1',
  'h2',
  'h3',
  'h4',
  'lead',
  'small',
  'muted',
  'quote',
  'code',
]
/** One style per level, made once: a level is a selection of the recipe. */
const typeStyles = new Map<TypographyLevel, NamedStyle<typeof TypographySlots>>(
  levels.map(level => [level, forSlots(TypographySlots)(Recipes.Typography({ level }))]),
)

const typeStyleOf = (level: TypographyLevel) => typeStyles.get(level)!

const set = (h: H, level: TypographyLevel, text: string): Html =>
  Typography.view({ level, text, style: typeStyleOf(level) }, h)

/** A specimen's caption: which token or level a sample shows. */
const named = (slots: Slots, h: H, name: string, sample: Html) =>
  h.div(slots.specimenRow.attrs(), [h.code(slots.specimenName.attrs(), [name]), sample])

/**
 * The type: the interface's roles, each as it sets a control's words, then a
 * passage set as a reader meets it, every level from `h1` to inline code.
 */
export const typography = (slots: Slots, h: H): Html =>
  h.div(slots.specimen.attrs(), [
    h.section(slots.specimenGroup.attrs([h.AriaLabel('Interface roles')]), [
      h.h3(slots.specimenHeading.attrs(), ['Interface roles']),
      named(slots, h, 'display', set(h, 'display', '1,284 orders')),
      named(slots, h, 'title', set(h, 'title', 'Billing and invoices')),
      named(slots, h, 'subtitle', set(h, 'subtitle', 'Payment method')),
      named(slots, h, 'body', set(h, 'body', 'Your card is charged on the first of each month.')),
      named(slots, h, 'caption', set(h, 'caption', 'Updated 2 minutes ago')),
      named(slots, h, 'micro', set(h, 'micro', 'BETA')),
    ]),
    h.article(slots.specimenGroup.attrs([h.AriaLabel('Reading')]), [
      h.h3(slots.specimenHeading.attrs(), ['Reading']),
      set(h, 'h1', 'A theme is a few knobs'),
      set(
        h,
        'lead',
        'Every color, space, corner and shadow is an expression over them, so one change reaches every component.',
      ),
      set(h, 'h2', 'Type that follows the page'),
      set(
        h,
        'body',
        'Headings take the heading font, its weight and its tracking; the body takes the text size and the line height. Turn the heading scale down and a title sits a step above its paragraph; turn it up and the page reads like a magazine.',
      ),
      set(h, 'h3', 'Quieter voices'),
      set(h, 'quote', 'Typography exists to honor content.'),
      set(h, 'muted', 'Robert Bringhurst, The Elements of Typographic Style'),
      set(h, 'h4', 'In code'),
      h.p(typeStyleAttrs(h, 'body'), [
        'Set the scale with ',
        set(h, 'code', "'text-scale'"),
        ' and the headings with ',
        set(h, 'code', "'heading-scale'"),
        '.',
      ]),
      set(h, 'small', 'Prices include VAT where it applies.'),
    ]),
  ])

/** A level's attributes, for a paragraph that holds more than words (inline code). */
const typeStyleAttrs = (h: H, level: TypographyLevel) =>
  SlotView.buildersFor(TypographySlots, [typeStyleOf(level).mixin], {
    input: undefined,
    h,
  }).text.attrs([])

/** A swatch of one token: what fills it, its name, and the property it is. */
const swatch = (
  slots: Slots,
  h: H,
  token: string,
  draw: 'fill' | 'text' | 'line' | 'shadow' | 'corner',
): Html => {
  const value = `var(--fk-${token})`
  const looks: Readonly<Record<typeof draw, Record<string, string>>> = {
    fill: { background: value },
    text: { color: value },
    line: { borderColor: value },
    shadow: { boxShadow: value },
    corner: { borderRadius: value },
  }
  return h.figure(slots.swatchTile.attrs([h.DataAttribute('draw', draw)]), [
    h.div(slots.swatchSample.attrs([h.AriaHidden(true), h.Style(looks[draw])]), [
      ...(draw === 'text' ? ['Aa'] : []),
    ]),
    h.figcaption(slots.swatchName.attrs(), [
      h.span([], [token]),
      h.code(slots.specimenName.attrs(), [`--fk-${token}`]),
    ]),
  ])
}

const palettes: ReadonlyArray<{
  readonly name: string
  readonly draw: 'fill' | 'text' | 'line' | 'shadow' | 'corner'
  readonly tokens: ReadonlyArray<string>
}> = [
  {
    name: 'Surfaces',
    draw: 'fill',
    tokens: ['bedrock', 'base', 'field', 'subtle', 'muted', 'default', 'overt'].map(
      name => `surface-${name}`,
    ),
  },
  {
    name: 'Text',
    draw: 'text',
    tokens: ['overt', 'default', 'subtle', 'muted', 'link'].map(name => `text-${name}`),
  },
  {
    name: 'Outlines',
    draw: 'line',
    tokens: ['subtle', 'default', 'overt', 'focus'].map(name => `outline-${name}`),
  },
  {
    name: 'Accent',
    draw: 'fill',
    tokens: ['default', 'hover', 'active', 'subtle', 'outline', 'ink', 'on-fill'].map(
      name => `accent-${name}`,
    ),
  },
  {
    name: 'Secondary and tertiary',
    draw: 'fill',
    tokens: ['secondary-default', 'secondary-subtle', 'tertiary-default', 'tertiary-subtle'],
  },
  {
    name: 'Feedback',
    draw: 'fill',
    tokens: ['success', 'warning', 'error', 'info'].flatMap(name => [
      `${name}-default`,
      `${name}-subtle`,
    ]),
  },
  { name: 'Charts', draw: 'fill', tokens: ['1', '2', '3', '4', '5'].map(n => `chart-${n}`) },
  {
    name: 'Shadows',
    draw: 'shadow',
    tokens: ['xs', 'sm', 'md', 'lg', 'xl'].map(name => `shadow-${name}`),
  },
  {
    name: 'Controls',
    draw: 'shadow',
    tokens: ['raised', 'pressed', 'field'].map(name => `shadow-${name}`),
  },
  {
    name: 'Corners',
    draw: 'corner',
    tokens: ['sm', 'md', 'lg', 'xl', 'control', 'full'].map(name => `radius-${name}`),
  },
]

/** The palette and shape tokens, each drawn as what it is: a fill, a text color, a line. */
export const palette = (slots: Slots, h: H): Html =>
  h.div(
    slots.specimen.attrs(),
    palettes.map(group =>
      h.section(slots.specimenGroup.attrs([h.AriaLabel(group.name)]), [
        h.h3(slots.specimenHeading.attrs(), [group.name]),
        h.div(
          slots.swatchGrid.attrs(),
          group.tokens.map(token => swatch(slots, h, token, group.draw)),
        ),
      ]),
    ),
  )

const OutlineButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)

interface Member {
  readonly name: string
  readonly role: string
  readonly status: string
}

const members: ReadonlyArray<Member> = [
  { name: 'Ada Lovelace', role: 'Owner', status: 'Active' },
  { name: 'Grace Hopper', role: 'Admin', status: 'Active' },
  { name: 'Alan Turing', role: 'Editor', status: 'Invited' },
]

/** A workspace's settings: what a theme looks like on a screen people use. */
export const settings = (slots: Slots, h: H): Html =>
  h.div(slots.specimen.attrs(), [
    h.header(slots.appHeader.attrs(), [
      h.div(
        [],
        [
          set(h, 'h3', 'Workspace settings'),
          set(h, 'muted', 'Manage your team and how Acme appears to it.'),
        ],
      ),
      Avatar.view({ name: 'Ada Lovelace', style: AvatarStyle }, h),
    ]),
    Alert.view(
      {
        layout: 'inline',
        title: 'Invitation sent',
        description: 'Alan Turing can join until Friday.',
        style: AlertStyle,
      },
      h,
    ),
    h.div(slots.appGrid.attrs(), [
      Card.view(
        {
          title: 'Profile',
          description: 'Shown on invoices and in emails.',
          content: h.div(slots.appForm.attrs(), [
            Input.view(
              {
                id: 'app-name',
                placeholder: 'Acme Inc.',
                style: InputStyle,
                draw: (resolved, h) =>
                  h.div([], [h.label(resolved.label, ['Workspace name']), h.input(resolved.input)]),
              },
              h,
            ),
            Input.view(
              {
                id: 'app-email',
                type: 'email',
                placeholder: 'billing@acme.example',
                described: true,
                style: InputStyle,
                draw: (resolved, h) =>
                  h.div(
                    [],
                    [
                      h.label(resolved.label, ['Billing email']),
                      h.input(resolved.input),
                      h.span(resolved.description, ['Receipts go here.']),
                    ],
                  ),
              },
              h,
            ),
            UiSelect.view(
              {
                id: 'app-region',
                toView: Select.toView([SelectStyle.mixin], { h }, resolved =>
                  h.div(
                    [],
                    [
                      h.label(resolved.label, ['Data region']),
                      h.select(
                        resolved.select,
                        ['Europe', 'Americas', 'Asia Pacific'].map(region =>
                          h.option([], [region]),
                        ),
                      ),
                    ],
                  ),
                ),
              },
              h,
            ),
          ]),
          footer: h.div(slots.appActions.attrs(), [
            Button.view({ label: 'Cancel', style: OutlineButtonStyle }, h),
            Button.view({ label: 'Save changes', style: ButtonStyle }, h),
          ]),
          style: CardStyle,
        },
        h,
      ),
      Card.view(
        {
          title: 'Plan',
          description: 'Renews on November 1.',
          action: Badge.view({ text: 'Pro', tone: 'live', style: BadgeStyle }, h),
          content: h.div(slots.appForm.attrs(), [
            set(h, 'display', '$48'),
            set(h, 'caption', 'per month, for 12 seats'),
          ]),
          footer: Button.view({ label: 'Change plan', style: OutlineButtonStyle }, h),
          style: CardStyle,
        },
        h,
      ),
    ]),
    Table.view<Member, Message>(
      {
        caption: 'Members',
        columns: [
          { header: 'Name', value: member => member.name },
          { header: 'Role', value: member => member.role },
          { header: 'Status', value: member => member.status },
        ],
        rows: members,
        style: TableStyle,
      },
      h,
    ),
  ])

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A chart's state: the model of the gallery's example of its kind, and its Messages. */
const charted = (live: Live<Message>, example: Widgets.ChartExample) => ({
  model: live.widgets.charts[example],
  onMessage: (message: Chart.Message) =>
    live.onWidget(Widgets.Message.GotChart({ example, message })),
  style: ChartStyle,
})

/** A showcase's named example, drawn as its page draws it. */
const example = (live: Live<Message>, slug: string, name: string): Html =>
  Option.match(
    Option.flatMap(showcaseOf(slug), showcase =>
      Option.fromNullishOr(showcase.examples.find(each => each.name === name)),
    ),
    {
      onNone: () => {
        throw new Error(`No example ${slug}#${name}`)
      },
      onSome: found => found.render({}, live),
    },
  )

/** A screen's panel: a Card holding examples, the whole row wide when `wide`. */
const panel = (
  slots: Slots,
  h: H,
  title: string,
  description: string,
  content: ReadonlyArray<Html>,
  wide = false,
): Html =>
  h.div(wide ? slots.screenWide.attrs() : [], [
    Card.view(
      { title, description, content: h.div(slots.appForm.attrs(), content), style: CardStyle },
      h,
    ),
  ])

const screenHeader = (slots: Slots, h: H, title: string, line: string, aside: Html): Html =>
  h.header(slots.appHeader.attrs(), [
    h.div([], [set(h, 'h3', title), set(h, 'muted', line)]),
    aside,
  ])

/** An analytics dashboard: figures, charts and the rows behind them. */
export const dashboard = (slots: Slots, h: H, live: Live<Message>): Html =>
  h.div(slots.specimen.attrs(), [
    screenHeader(
      slots,
      h,
      'Analytics',
      'Sales and sign-ups across every store, this quarter.',
      example(live, 'avatar', 'group'),
    ),
    h.div(slots.screenGrid.attrs(), [
      example(live, 'card', 'stat'),
      panel(slots, h, 'Quota', 'Of the quarter’s target.', [example(live, 'progress', 'ring')]),
      // The charts drawn here, not as the gallery frames them: a panel's width, not a preview's.
      panel(
        slots,
        h,
        'Revenue',
        'By month, in thousands.',
        [
          Chart.view(
            {
              ...charted(live, 'area'),
              id: 'dash-revenue',
              label: 'Revenue',
              kind: 'area',
              categories: MONTHS,
              series: [
                { name: 'Revenue', values: [32, 38, 35, 44, 49, 47, 56, 61, 58, 66, 72, 81] },
              ],
            },
            live.h,
          ),
        ],
        true,
      ),
      panel(slots, h, 'By region', 'Orders this quarter.', [
        Chart.view(
          {
            ...charted(live, 'bar'),
            id: 'dash-regions',
            label: 'Orders',
            kind: 'bar',
            categories: ['Europe', 'Americas', 'Asia', 'Africa', 'Oceania'],
            series: [
              { name: 'Online', values: [412, 538, 371, 96, 128] },
              { name: 'In store', values: [180, 244, 210, 62, 71] },
            ],
          },
          live.h,
        ),
      ]),
      panel(slots, h, 'Channels', 'Where sign-ups came from.', [
        Chart.view(
          {
            ...charted(live, 'donut'),
            id: 'dash-channels',
            label: 'Sign-ups',
            kind: 'donut',
            slices: [
              { name: 'Search', value: 380 },
              { name: 'Social', value: 210 },
              { name: 'Referral', value: 160 },
              { name: 'Email', value: 110 },
              { name: 'Direct', value: 65 },
            ],
          },
          live.h,
        ),
      ]),
      panel(
        slots,
        h,
        'Invoices',
        'The latest, by amount.',
        [example(live, 'table', 'sortable')],
        true,
      ),
    ]),
  ])

/** An assistant at work: a thread, its reasoning and the answer arriving. */
export const assistant = (slots: Slots, h: H, live: Live<Message>): Html =>
  h.div(slots.specimen.attrs(), [
    screenHeader(
      slots,
      h,
      'Assistant',
      'Ask about your workspace; it shows its work.',
      example(live, 'thinking-indicator', 'basic'),
    ),
    h.div(slots.screenGrid.attrs(), [
      panel(slots, h, 'Conversation', 'With the release notes open.', [
        example(live, 'chat-message', 'thread'),
      ]),
      panel(slots, h, 'Working', 'Each step it takes, as it takes it.', [
        example(live, 'thinking-steps', 'tools'),
      ]),
      panel(
        slots,
        h,
        'Answering',
        'Streamed as it is written.',
        [example(live, 'chat-message', 'streaming')],
        true,
      ),
    ]),
  ])

/** A booking flow: a plan, the dates, and how it went. */
export const booking = (slots: Slots, h: H, live: Live<Message>): Html =>
  h.div(slots.specimen.attrs(), [
    screenHeader(
      slots,
      h,
      'Book a stay',
      'Three steps, and the cabin is yours.',
      example(live, 'rating', 'basic'),
    ),
    panel(
      slots,
      h,
      'Progress',
      'Plan, dates, then payment.',
      [example(live, 'steps', 'basic')],
      true,
    ),
    // The month as wide as itself, the rooms the rest.
    h.div(slots.screenSplit.attrs(), [
      panel(slots, h, 'Dates', 'Check in and check out.', [
        // One month, the trip's range on it.
        live.h.submodel({
          slotId: live.widgets.trip.id,
          model: live.widgets.trip,
          view: UiCalendar.view,
          viewInputs: Calendar.inputs(
            live.widgets.tripDates,
            [CalendarStyle.mixin, Calendar.readingKeys],
            {
              h: live.h,
            },
          ),
          toParentMessage: message => live.onWidget(Widgets.Message.GotTripCalendar({ message })),
        }),
      ]),
      panel(slots, h, 'Room', 'Each with breakfast.', [example(live, 'radio-group', 'cards')]),
    ]),
    panel(slots, h, 'Budget', 'A night, before taxes.', [example(live, 'slider', 'marks')], true),
  ])
