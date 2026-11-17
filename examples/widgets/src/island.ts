/**
 * What a section of the page is. An eager section's code is in the page's first
 * bundle (`widgets.ts`); a lazy one names a loader, and its code arrives when
 * its section nears the window (`entry.ts`), so the first load stays small as
 * sections are added (`lazy.ts`).
 */
import { type StylesheetSource } from 'foldkit-mixins'

/** The code of a section: its trace, its sheet and the call that boots it. */
export interface IslandBody {
  readonly runDemo: () => ReadonlyArray<string>
  readonly style: () => StylesheetSource
  readonly mount: (container: HTMLElement) => void
}

export interface Island extends IslandBody {
  readonly id: string
  readonly title: string
}

/** A section whose body is fetched on demand. */
export interface LazyIsland {
  readonly id: string
  readonly title: string
  readonly load: () => Promise<IslandBody>
}

export const define = <T extends Island>(island: T): T => island

/** One source of several, for an island drawn with more than one style. */
export const merged = (...sources: ReadonlyArray<StylesheetSource>): StylesheetSource => ({
  rules: sources.flatMap(source => source.rules),
  globalRules: sources.flatMap(source => source.globalRules),
})
