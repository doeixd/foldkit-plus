/**
 * The topics that run across the widgets, and the component pages each one
 * matters to. The package README holds the explanation (its "Mechanisms shared
 * by many widgets"); a component page links the topics that apply to it
 * rather than repeating them.
 */

export interface Topic {
  readonly label: string
  /** What the topic means for the widget on the page, in a sentence. */
  readonly about: string
  /** The heading in `packages/mixins-ui/README.md` that explains it. */
  readonly heading: string
}

export const README = 'packages/mixins-ui/README.md'

const ROUTES: Topic = {
  label: 'Keys of your own',
  about:
    'Add the application’s keys with the routes option, beside the ones the widget handles; the widget’s `conflict(routes)` judges a candidate set without drawing it.',
  heading: 'Application key routes',
}

const FOCUS: Topic = {
  label: 'Keeping focus when something is removed',
  about:
    'A control that leaves the page takes its focus with it: say where focus goes next, to a neighbour (`FocusRecovery`), to the opener (`focusReturn`) or to a control (`keepFocus`).',
  heading: 'Focus after removal',
}

const FORMS: Topic = {
  label: 'What a form submits',
  about: 'Give the widget a name and a form reads it as it reads a native field.',
  heading: 'Form participation',
}

const RTL: Topic = {
  label: 'Right to left',
  about: 'The direction switch above turns the preview over; this is what each widget reads.',
  heading: 'Right to left',
}

const topicsOf = (topic: Topic, slugs: ReadonlyArray<string>): ReadonlyArray<[string, Topic]> =>
  slugs.map(slug => [slug, topic])

const byPage = new Map<string, ReadonlyArray<Topic>>()

/** The topics of a component page, in the order the page lists them. */
export const topicsFor = (slug: string): ReadonlyArray<Topic> => byPage.get(slug) ?? []

/** Every page that has topics, for a check that each is a page there is. */
export const pagesWithTopics = (): ReadonlyArray<string> => [...byPage.keys()]

for (const [slug, topic] of [
  ...topicsOf(ROUTES, [
    'command',
    'search-field',
    'menubar',
    'cascade-select',
    'tour',
    'floating-panel',
    'tabs',
    'tags-input',
    'toolbar',
    'navigation-menu',
  ]),
  ...topicsOf(FOCUS, [
    'toast',
    'alert',
    'card',
    'tags-input',
    'file-input',
    'file-upload',
    'search-field',
    'dialog',
    'sheet',
    'tour',
    'floating-panel',
  ]),
  ...topicsOf(FORMS, [
    'input',
    'textarea',
    'password-input',
    'number-field',
    'otp-field',
    'checkbox',
    'checkbox-group',
    'radio-group',
    'switch',
    'select',
    'rating',
    'slider',
    'segmented',
    'tags-input',
    'file-input',
    'file-upload',
    'date-picker',
  ]),
  ...topicsOf(RTL, [
    'tabs',
    'menu',
    'menubar',
    'segmented',
    'toolbar',
    'tree-view',
    'carousel',
    'resizable',
    'sidebar',
    'breadcrumb',
    'pagination',
    'steps',
    'slider',
    'navigation-menu',
    'popover',
    'tooltip',
  ]),
])
  byPage.set(slug, [...(byPage.get(slug) ?? []), topic])
