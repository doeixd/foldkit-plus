import { Style } from 'foldkit-mixins'

export const NARROW = '(max-width: 700px)'

/** A helper exported from a style module: no value the build could write as data. */
export const gap = (size: string) => Style.self({ gap: size })
