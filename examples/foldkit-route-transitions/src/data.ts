import { Array, Option, Schema, pipe } from 'effect'

export const Painting = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  artist: Schema.String,
  /** A CSS `background` value: upstream's Tailwind gradient classes, spelled out. */
  gradient: Schema.String,
})
export type Painting = typeof Painting.Type

export const paintings: ReadonlyArray<Painting> = [
  {
    id: 1,
    title: 'Dawn Over the Harbor',
    artist: 'Mara Ellsworth',
    gradient: 'linear-gradient(to bottom right, #fda4af, #fde68a, #7dd3fc)',
  },
  {
    id: 2,
    title: 'Static in Bloom',
    artist: 'Jun Okabe',
    gradient: 'linear-gradient(to bottom right, #e879f9, #d8b4fe, #818cf8)',
  },
  {
    id: 3,
    title: 'Winter Circuit',
    artist: 'Ada Lindqvist',
    gradient: 'linear-gradient(to bottom right, #cbd5e1, #a5f3fc, #60a5fa)',
  },
  {
    id: 4,
    title: 'Ferric Meadow',
    artist: 'Tomás Reyes',
    gradient: 'linear-gradient(to bottom right, #bef264, #6ee7b7, #2dd4bf)',
  },
  {
    id: 5,
    title: 'Ultraviolet Tide',
    artist: 'Nadia Boulos',
    gradient: 'linear-gradient(to bottom right, #818cf8, #a78bfa, #f9a8d4)',
  },
  {
    id: 6,
    title: 'Ember Study No. 4',
    artist: 'Hal Whitaker',
    gradient: 'linear-gradient(to bottom right, #fb923c, #fca5a5, #fb7185)',
  },
]

export const findPaintingWithIndex = (
  paintingId: number,
): Option.Option<Readonly<{ painting: Painting; paintingIndex: number }>> =>
  pipe(
    Array.findFirstIndex(paintings, painting => painting.id === paintingId),
    Option.flatMap(paintingIndex =>
      Option.map(Array.get(paintings, paintingIndex), painting => ({
        painting,
        paintingIndex,
      })),
    ),
  )
