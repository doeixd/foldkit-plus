import { fillWords } from 'foldkit-form'

/**
 * Every word the drawn Builder shows of its own, so an application can put
 * the editor in another language. Words are text; a word that takes a value
 * names it as a blank, `'Add {label}'`, so a translation puts it where its
 * language does. Text, not functions, because the words are a view input, and
 * Foldkit admits no function nested in one (`h.submodel` throws); it also lets
 * one object hold a form's words and these. The Catalog's words (a Block's
 * label and description) and the command table's labels are the
 * application's already, and are not here.
 */
export interface BuilderWords {
  /** The list of the narrow editor's panel tabs, and each tab. */
  readonly panels: string
  readonly addPanel: string
  readonly layersPanel: string
  readonly settingsPanel: string

  /** The palette, a tile (`'Add {label}'`), and its groups: Blocks given none, and the patterns. */
  readonly palette: string
  readonly addBlock: string
  readonly ungrouped: string
  readonly patterns: string
  /** Where a tile adds its Block, on its title; `{label}` is the node it goes after or inside. */
  readonly addsToEnd: string
  readonly addsAfter: string
  readonly addsInside: string
  /** Why a tile adds nothing: nothing selected holds it, or the selected (`{label}`) cannot. */
  readonly selectAHolder: string
  readonly cannotGoAt: string

  /** The layers' tree. */
  readonly layers: string

  /** The inspector, and what it says with nothing selected. */
  readonly properties: string
  readonly selectedBlock: string
  readonly selectToChange: string
  readonly shortcuts: string
  readonly treeUpDown: string
  readonly treeLeftRight: string
  /** A node whose Block this version of the application lacks. */
  readonly unknownBlock: string
  /** The inspector's sections. */
  readonly content: string
  readonly style: string
  readonly visibility: string
  readonly interactions: string
  /** A look: no choice, its field at a breakpoint (`{label}`, `{breakpoint}`), and a breakpoint that changes nothing. */
  readonly lookDefault: string
  readonly lookAt: string
  readonly lookUnchanged: string
  /** A condition over a context key (`{key}`), and the choice that is no condition. */
  readonly shownWhen: string
  readonly always: string
  /** What an event runs (`{event}`), and the choice that runs nothing. */
  readonly onEvent: string
  readonly runsNothing: string
  /** An action input's blank choice. */
  readonly none: string

  /** A command's button title, with its first key: `{label}` and `{keys}`. */
  readonly withKeys: string
  /** Keys with a name rather than a glyph or a letter, by `KeyboardEvent.key`: `{ Delete: 'Entf' }`. A key not here is its own name. */
  readonly keyNames: Readonly<Record<string, string>>
  /** Ctrl, Alt and Shift, as keys are named off a Mac. */
  readonly ctrlKey: string
  readonly altKey: string
  readonly shiftKey: string

  /** The toolbar, the crumbs and their first, the page. */
  readonly pageActions: string
  readonly crumbs: string
  readonly crumbPage: string
  /** The viewport buttons. */
  readonly viewports: string
  readonly wide: string
  readonly medium: string
  readonly narrow: string
  /** The preview's group, and a context key left unset. */
  readonly previewAs: string
  readonly unset: string
  /** The canvas, and what it says while the page is empty. */
  readonly canvas: string
  readonly emptyPage: string
}

export const builderWords: BuilderWords = Object.freeze({
  panels: 'Panels',
  addPanel: 'Add',
  layersPanel: 'Layers',
  settingsPanel: 'Settings',
  palette: 'Add a block',
  addBlock: 'Add {label}',
  ungrouped: 'Blocks',
  patterns: 'Patterns',
  addsToEnd: 'Adds it to the end of the page',
  addsAfter: 'Adds it after the {label}',
  addsInside: 'Adds it inside the {label}',
  selectAHolder: 'Select a block that can hold it',
  cannotGoAt: 'It cannot go in or after the {label}',
  layers: 'Layers',
  properties: 'Properties',
  selectedBlock: 'Selected block',
  selectToChange: 'Select a block on the page or in the layers to change it.',
  shortcuts: 'Shortcuts, in the layers or on the page',
  treeUpDown: 'Go to the layer above or below',
  treeLeftRight: 'Close or open a layer',
  unknownBlock:
    'This block is not in this version of the application, so its settings cannot be edited here.',
  content: 'Content',
  style: 'Style',
  visibility: 'Visibility',
  interactions: 'Interactions',
  lookDefault: 'Default',
  lookAt: '{label} at {breakpoint}',
  lookUnchanged: 'unchanged',
  shownWhen: 'Shown when {key} is',
  always: 'always',
  onEvent: 'On {event}',
  runsNothing: 'nothing',
  none: 'none',
  withKeys: '{label} ({keys})',
  keyNames: Object.freeze({}),
  ctrlKey: 'Ctrl',
  altKey: 'Alt',
  shiftKey: 'Shift',
  pageActions: 'Page actions',
  crumbs: 'Where the selection is',
  crumbPage: 'Page',
  viewports: 'Viewport',
  wide: 'Wide',
  medium: 'Medium',
  narrow: 'Narrow',
  previewAs: 'Preview as',
  unset: 'unset',
  canvas: 'Page',
  emptyPage: 'This page is empty. Add a block to begin: the palette offers what can go here.',
})

// One resolved record per given one, so a part that reads `words` sees the same value each draw.
const resolved = new WeakMap<Partial<BuilderWords>, BuilderWords>()

/** Words with their blanks filled: `say(w.addBlock, { label: 'Hero' })`. */
export const say = fillWords

/** The words a view input gives, over the English ones. */
export const wordsOf = (given: Partial<BuilderWords> | undefined): BuilderWords => {
  if (given === undefined) return builderWords
  const known = resolved.get(given)
  if (known !== undefined) return known
  const words: BuilderWords = Object.freeze({ ...builderWords, ...given })
  resolved.set(given, words)
  return words
}
