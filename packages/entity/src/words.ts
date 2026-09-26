import { Option, Schema } from 'effect'

/** What a schema says of itself to a person: its `title` and `description`. */
export interface SchemaWords {
  readonly title: Option.Option<string>
  readonly description: Option.Option<string>
}

const text = (value: unknown): Option.Option<string> =>
  typeof value === 'string' ? Option.some(value) : Option.none()

export const Words = {
  /**
   * A schema's words, as a label and its help text. Under Effect 4 a checked
   * schema resolves to its last check's annotations, which say what the check
   * expects and carry no `title`, so a title given before the check is read from
   * the schema's own annotations. Read words through this, never through
   * `Schema.resolveAnnotations` directly.
   */
  of: (schema: Schema.Top): SchemaWords => {
    const resolved = Schema.resolveAnnotations(schema) ?? {}
    const own = schema.ast.annotations ?? {}
    return {
      title: Option.orElse(text(resolved.title), () => text(own['title'])),
      description: Option.orElse(text(resolved.description), () => text(own['description'])),
    }
  },
}
