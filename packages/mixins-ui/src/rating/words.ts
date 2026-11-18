/** The fixed text a Rating says. `{value}` is a number of stars, `{label}` what is rated, `{stars}` the rating as `one` or `other` says it, `{max}` the most stars. */
export interface RatingWords {
  /** A rating of exactly one star: read aloud, and shown beside the stars with `showValue`. */
  readonly one: string
  /** Any other rating, a fraction included. */
  readonly other: string
  /** The name of a read-only rating, which is one image. */
  readonly rated: string
  /** The name of a read-only rating no one has given. */
  readonly notRated: string
}

/** The words a Rating uses when none are given. */
export const words: RatingWords = {
  one: '{value} star',
  other: '{value} stars',
  rated: '{label}: {stars} of {max}',
  notRated: '{label}: not rated',
}
