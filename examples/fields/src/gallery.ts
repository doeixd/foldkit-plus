/**
 * Every recipe in `foldkit-form-recipes`, each with the schema of the key it
 * edits, a stored value, something a person might type, something the recipe
 * refuses, and what it does when things go wrong. `read.ts` runs each through a
 * real form; nothing here is computed.
 */
import { Schema } from 'effect'
import { FieldRecipes, type FieldRecipe } from 'foldkit-form-recipes'
import { image } from 'foldkit-form-recipes/image'
import { HashedAsset } from 'foldkit-media'
import { CalendarDate, make } from 'foldkit/calendar'

export interface Entry {
  /** The page's address and heading. */
  readonly name: string
  /** How the recipe is made, as an application writes it. */
  readonly call: string
  readonly schema: Schema.Codec<any, any>
  readonly recipe: FieldRecipe<any>
  /** What the key holds, decoded. */
  readonly stored: unknown
  /** A draft a person might type, and one the recipe refuses; none for a control with no text. */
  readonly typed?: string | undefined
  readonly refused?: string | undefined
  /** For a recipe that follows another key (`slug`): that key, and what it says. */
  readonly follows?: { readonly key: string; readonly text: string } | undefined
  /** What it does when things go wrong, in the README's words. */
  readonly failures: ReadonlyArray<string>
}

const hash = 'd'.repeat(64)

export const gallery: ReadonlyArray<Entry> = [
  {
    name: 'date',
    call: 'FieldRecipes.date()',
    schema: CalendarDate,
    recipe: FieldRecipes.date(),
    stored: make(2026, 10, 26),
    typed: '2026-02-28',
    refused: '2026-02-30',
    failures: ['A day that does not exist, or a date typed day first, reads "Enter a date".'],
  },
  {
    name: 'dateTime-local',
    call: "FieldRecipes.dateTime({ stored: 'local' })",
    schema: Schema.String,
    recipe: FieldRecipes.dateTime({ stored: 'local' }),
    stored: '2026-10-26T09:30',
    typed: '2026-10-27T18:00',
    refused: '2026-10-27',
    failures: ['Kept as typed, in no zone: a clock reading wherever it is read.'],
  },
  {
    name: 'dateTime-instant',
    call: "FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' })",
    schema: Schema.String,
    recipe: FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' }),
    stored: '2026-10-26T09:30:00.000Z',
    typed: '2026-10-25T01:30',
    refused: '2026-03-29T01:30',
    failures: [
      'A time the clocks skip is refused: "Enter a date and a time that exists".',
      'A time the clocks repeat reads as the earlier.',
      'An unknown zone throws when the recipe is made.',
    ],
  },
  {
    name: 'email',
    call: 'FieldRecipes.email()',
    schema: Schema.String,
    recipe: FieldRecipes.email(),
    stored: 'ada@example.com',
    typed: 'grace@example.org',
    refused: 'grace at example.org',
    failures: ['Well-formed is not known to exist: whether it receives mail is the server’s.'],
  },
  {
    name: 'url',
    call: 'FieldRecipes.url()',
    schema: Schema.String,
    recipe: FieldRecipes.url(),
    stored: 'https://example.com',
    typed: 'http://example.org/a',
    refused: 'javascript:alert(1)',
    failures: ['A scheme outside `protocols` (default https: and http:) is refused.'],
  },
  {
    name: 'tel',
    call: 'FieldRecipes.tel()',
    schema: Schema.String,
    recipe: FieldRecipes.tel(),
    stored: '+44 20 7946 0000',
    typed: '020 7946 0001',
    failures: ['Takes anything: a number is too varied to check without refusing a real one.'],
  },
  {
    name: 'password',
    call: "FieldRecipes.password({ purpose: 'new' })",
    schema: Schema.String,
    recipe: FieldRecipes.password({ purpose: 'new' }),
    stored: 'correct horse',
    typed: 'battery staple',
    failures: [
      'Hidden in a list; no reveal toggle, since whether it shows is state the form does not hold.',
      'Keep it out of a saved draft: that rule is the application’s.',
    ],
  },
  {
    name: 'slug',
    call: "FieldRecipes.slug('title', { prefix: '/posts/' })",
    schema: Schema.String,
    recipe: FieldRecipes.slug('title', { prefix: '/posts/' }),
    stored: 'notes-on-the-engine',
    typed: 'engine-notes',
    follows: { key: 'title', text: 'Crème Brûlée, Again' },
    failures: ['A stored slug does not follow its key, so a published address does not move.'],
  },
  {
    name: 'money-minor',
    call: "FieldRecipes.money({ currency: 'EUR', unit: 'minor', locale: 'de-DE' })",
    schema: Schema.Int,
    recipe: FieldRecipes.money({ currency: 'EUR', unit: 'minor', locale: 'de-DE' }),
    stored: 123456,
    typed: '1.234,5',
    refused: '12.3',
    failures: [
      'Grouping other than the locale’s is refused, not read as another number.',
      'More decimals than the currency has are refused, never rounded.',
      'A minor amount past what a JavaScript number holds exactly is refused.',
    ],
  },
  {
    name: 'money-decimal',
    call: "FieldRecipes.money({ currency: 'JPY', unit: 'decimal', locale: 'ja-JP' })",
    schema: Schema.String,
    recipe: FieldRecipes.money({ currency: 'JPY', unit: 'decimal', locale: 'ja-JP' }),
    stored: '1235',
    typed: '2,000',
    refused: '12.5',
    failures: ['The currency sets the decimals: none for JPY, so `12.5` is refused.'],
  },
  {
    name: 'decimal',
    call: 'FieldRecipes.decimal({ scale: 3 })',
    schema: Schema.Number,
    recipe: FieldRecipes.decimal({ scale: 3 }),
    stored: 2.5,
    typed: '1,234.125',
    refused: '-1',
    failures: ['A minus is refused unless `negative: true`.'],
  },
  {
    name: 'percent',
    call: "FieldRecipes.percent({ unit: 'fraction' })",
    schema: Schema.Number,
    recipe: FieldRecipes.percent({ unit: 'fraction' }),
    stored: 0.125,
    typed: '7.5',
    refused: '7.5.1',
    failures: ['Stored as the share (`0.125`); `points` stores `12.5`.'],
  },
  {
    name: 'image',
    call: "image({ id: 'cover' })",
    schema: HashedAsset,
    recipe: image({ id: 'cover' }),
    stored: Schema.decodeUnknownSync(HashedAsset)({
      key: hash,
      width: 1200,
      height: 630,
      alpha: false,
      hash,
      placeholder: null,
    }),
    failures: [
      'A refusal keeps the route’s reason and offers Try again; it is never a value.',
      'Cancel aborts the request and leaves the key empty.',
      'A stored draft holds no File, so a send on its way is dropped from it.',
    ],
  },
]
