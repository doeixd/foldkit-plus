import { describe } from './describe.js'
import { mutation } from './mutation.js'
import { show } from './show.js'

/**
 * What a Domain Api imports into Remote, beyond the Writes the page declares:
 * `mutation` declares a command the author wrote no `Write` for, `describe`
 * lists what the Api's bindings import with each command's footprint, and
 * `show` writes that as Markdown.
 */
export const Imported = { mutation, describe, show }

export type { ImportedConfig, ImportedMutation } from './mutation.js'
export type {
  DescribeConfig,
  ImportedDescription,
  OperationDescription,
  ReadDescription,
  RejectionDescription,
  RejectionFields,
} from './describe.js'
export type { JsonSchema } from './schemas.js'
