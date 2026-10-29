/**
 * The generated site's link check, broken in turn on pages the tests do not
 * read whole: `pnpm mutate examples/site/test/prerender.mutations.ts` checks
 * that the check reads every page, in every thread that renders a share.
 */
const tests = ['examples/site/test/prerender.test.ts']

export default [
  {
    name: "a Sync page's outline leads to headings it lacks",
    edits: [
      {
        file: '../src/content/library.ts',
        find: '[ih.a([ih.Href(`#${anchor.id}`)], [anchor.text])],',
        replace:
          "[ih.a([ih.Href(current.subsite.id === 'sync' ? `#${anchor.id}-gone` : `#${anchor.id}`)], [anchor.text])],",
      },
    ],
    tests,
  },
  {
    name: "the accordion's usage section is named by an id it lacks",
    edits: [
      {
        file: '../src/view/components.ts',
        find: "h.section(slots.section.attrs([h.AriaLabelledBy('usage')]), [",
        replace:
          "h.section(slots.section.attrs([h.AriaLabelledBy(showcase.slug === 'accordion' ? 'gone' : 'usage')]), [",
      },
    ],
    tests,
  },
  {
    name: 'a closed dialog counts as named by what it draws only once open',
    edits: [
      {
        file: './prerendered.ts',
        find: 'if (labelledBy !== undefined && !closed)',
        replace: 'if (labelledBy !== undefined)',
      },
    ],
    tests,
  },
  {
    name: 'a share leaves a page out',
    edits: [
      {
        file: './prerendered.ts',
        find: 'specs.filter((_, at) => at % options.count === options.index)',
        replace: 'specs.filter((_, at) => at % options.count === options.index && at !== 100)',
      },
    ],
    tests,
  },
]
