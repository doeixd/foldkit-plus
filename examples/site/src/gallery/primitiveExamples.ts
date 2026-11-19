/**
 * Every live example of a primitive: the modules under
 * `src/examples/primitives/<family>/<name>.ts`, found by their path, so a new
 * module is listed on its family's shelf without a line here.
 */
import { families } from './primitives.js'
import type { PrimitiveExample } from './primitiveExample.js'
import { exampleKey } from './showcase.js'

/** The page whose Subscriptions an example's state runs on (`examplesState.ts`). */
export const PRIMITIVES_SLUG = 'primitives'

export interface ListedPrimitive {
  readonly family: string
  readonly name: string
  /** The anchor of the example in the page, and the key of its state. */
  readonly id: string
  readonly key: string
  /** From the repository root. */
  readonly file: string
  readonly example: PrimitiveExample
}

const modules = import.meta.glob<PrimitiveExample>('../examples/primitives/*/*.ts', {
  eager: true,
  import: 'default',
})

export const listed: ReadonlyArray<ListedPrimitive> = Object.entries(modules).map(
  ([path, example]) => {
    const [, family, name] = /\/primitives\/([a-z-]+)\/([a-z0-9-]+)\.ts$/.exec(path) ?? []
    if (family === undefined || name === undefined) throw new Error(`${path} is no example path`)
    if (!families.some(each => each.id === family))
      throw new Error(`${path} is an example of a family the gallery does not list`)
    const id = `${family}-${name}`
    return {
      family,
      name,
      id,
      key: exampleKey(PRIMITIVES_SLUG, id),
      file: `examples/site/src/examples/primitives/${family}/${name}.ts`,
      example,
    }
  },
)
