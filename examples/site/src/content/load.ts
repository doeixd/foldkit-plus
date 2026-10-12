/**
 * The library, built once per process: the build renders every page from the
 * same one, and the dev server keeps it until it restarts.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { makeLibrary, type ServerLibrary } from './library.js'

/** The repository's root, whose Markdown and packages the pages are read from. */
export const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

let loading: Promise<ServerLibrary> | undefined

export const library = (): Promise<ServerLibrary> => (loading ??= makeLibrary(REPOSITORY))
