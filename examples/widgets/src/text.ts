import { Option } from 'effect'

/** A value a demo trace prints, `none` for no value. */
export const textOf = (value: Option.Option<string>): string =>
  Option.getOrElse(value, () => 'none')
