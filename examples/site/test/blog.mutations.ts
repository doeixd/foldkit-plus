/**
 * The blog, broken in turn: `pnpm mutate examples/site/test/blog.mutations.ts`.
 * The front matter, the posts, the head, the feed and the sitemap are held by
 * `blog.test.ts` and `blogFrontMatter.test.ts` over a repository of their own;
 * the typography by `blog.browser.test.ts` in a real browser.
 */
const frontMatter = '../src/blog/frontMatter.ts'
const posts = '../src/blog/posts.ts'
const meta = '../src/blog/meta.ts'
const feed = '../src/blog/feed.ts'
const library = '../src/blog/library.ts'
const render = '../src/blog/render.ts'
const style = '../src/blog/style.ts'
const site = '../src/site.ts'

const parsing = ['examples/site/test/blogFrontMatter.test.ts']
const unit = ['examples/site/test/blog.test.ts']
const browser = ['examples/site/test/blog.browser.test.ts']

export default [
  // FRONT MATTER
  {
    name: 'a key the front matter does not know is accepted',
    edits: [
      {
        file: frontMatter,
        find: "{ onExcessProperty: 'error' }",
        replace: "{ onExcessProperty: 'ignore' }",
      },
    ],
    tests: parsing,
  },
  {
    name: 'an update may be before the post',
    edits: [{ file: frontMatter, find: 'data.updated < data.date', replace: 'false' }],
    tests: parsing,
  },
  {
    name: 'a date that is not on the calendar is accepted',
    edits: [
      {
        file: frontMatter,
        find: '.toISOString().startsWith(value)',
        replace: '.toISOString().startsWith(value.slice(0, 4))',
      },
    ],
    tests: parsing,
  },
  {
    name: 'a quoted value keeps its quotes',
    edits: [
      {
        file: frontMatter,
        find: '? value.slice(1, -1)\n    : value',
        replace: '? value\n    : value',
      },
    ],
    tests: parsing,
  },

  // POSTS
  {
    name: 'posts are listed oldest first',
    edits: [
      {
        file: posts,
        find: 'b.date.localeCompare(a.date)',
        replace: 'a.date.localeCompare(b.date)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a dot in a file name stays a dot in the address',
    edits: [{ file: posts, find: "rest.replaceAll('.', '-')", replace: 'rest' }],
    tests: unit,
  },
  {
    name: 'a file dated differently from its front matter is accepted',
    edits: [{ file: posts, find: 'data.date !== day', replace: 'false' }],
    tests: unit,
  },
  {
    name: 'a post whose heading is not its title is accepted',
    edits: [{ file: posts, find: 'textOf(leading) !== data.title', replace: 'false' }],
    tests: unit,
  },
  {
    name: 'two posts at one address are accepted',
    edits: [{ file: posts, find: 'if (other !== undefined)', replace: 'if (false)' }],
    tests: unit,
  },
  {
    name: 'an image that is not there is accepted',
    edits: [{ file: posts, find: '!existsSync(disk)', replace: 'false' }],
    tests: unit,
  },
  {
    name: 'a post never updated has no modification day',
    edits: [{ file: posts, find: 'data.updated ?? data.date', replace: 'data.date' }],
    tests: unit,
  },
  {
    name: 'the contents take the h3s too',
    edits: [
      {
        file: posts,
        find: "node.type === 'heading' && node.depth === 2",
        replace: "node.type === 'heading' && node.depth <= 3",
      },
    ],
    tests: unit,
  },
  {
    name: 'reading time rounds down',
    edits: [{ file: posts, find: 'Math.ceil(', replace: 'Math.floor(' }],
    tests: unit,
  },
  {
    name: 'code takes no time to read',
    edits: [
      { file: posts, find: 'SECONDS_PER_CODE_LINE = 4', replace: 'SECONDS_PER_CODE_LINE = 0' },
    ],
    tests: unit,
  },
  {
    name: 'an image’s width and height are read the wrong way round',
    edits: [
      {
        file: '../src/blog/imageSize.ts',
        find: '{ width: view.getUint32(16), height: view.getUint32(20) }',
        replace: '{ width: view.getUint32(20), height: view.getUint32(16) }',
      },
    ],
    tests: unit,
  },

  // THE PAGES
  {
    name: 'a post links its neighbours the wrong way round',
    edits: [
      {
        file: library,
        find: 'previous: Option.fromNullishOr(posts[at + 1])',
        replace: 'previous: Option.fromNullishOr(posts[at - 1])',
      },
      {
        file: library,
        find: 'next: Option.fromNullishOr(posts[at - 1])',
        replace: 'next: Option.fromNullishOr(posts[at + 1])',
      },
    ],
    tests: unit,
  },
  {
    name: 'a same-page anchor is led to where the guides would lead it',
    edits: [
      { file: library, find: "url.startsWith('#') ? url : resolve(url)", replace: 'resolve(url)' },
    ],
    tests: unit,
  },
  {
    name: 'the rail does not mark the open post',
    edits: [
      { file: library, find: "post.path === path ? [ih.AriaCurrent('page')] : []", replace: '[]' },
    ],
    tests: unit,
  },
  {
    name: 'the navigation does not mark the Blog',
    edits: [
      { file: '../src/view/frame.ts', find: "Blog: () => 'blog'", replace: "Blog: () => 'none'" },
    ],
    tests: unit,
  },
  {
    name: 'a figure below the fold is not deferred',
    edits: [{ file: render, find: 'at < ABOVE_THE_FOLD', replace: 'true' }],
    tests: unit,
  },
  {
    name: 'a figure is given its height as its width',
    edits: [{ file: render, find: 'ih.Width(String(width))', replace: 'ih.Width(String(height))' }],
    tests: unit,
  },

  // THE HEAD
  {
    name: 'a post is a website to a preview',
    edits: [{ file: meta, find: "type: 'article',", replace: "type: 'website'," }],
    tests: unit,
  },
  {
    name: 'a post names no author to a preview',
    edits: [{ file: meta, find: 'authors: [post.author]', replace: 'authors: []' }],
    tests: unit,
  },
  {
    name: 'the structured data dates the change as the writing',
    edits: [
      { file: meta, find: 'dateModified: post.modified', replace: 'dateModified: post.published' },
    ],
    tests: unit,
  },
  {
    name: 'the image’s size is given the wrong way round',
    edits: [
      {
        file: meta,
        find: 'imageSize: { width: post.image.width, height: post.image.height }',
        replace: 'imageSize: { width: post.image.height, height: post.image.width }',
      },
    ],
    tests: unit,
  },
  {
    name: 'the image is a path, not an address',
    edits: [
      { file: meta, find: 'new URL(post.image.path, origin).href', replace: 'post.image.path' },
    ],
    tests: unit,
  },
  {
    name: 'a post’s title is the page’s title, without the site’s',
    edits: [
      {
        file: '../src/shell.ts',
        find: 'Post: ({ title }) => `${title} · Foldkit Plus`',
        replace: 'Post: ({ title }) => title',
      },
    ],
    tests: unit,
  },

  // THE FEED AND THE SITEMAP
  {
    name: 'the feed does not escape an ampersand',
    edits: [{ file: feed, find: ".replaceAll('&', '&amp;')", replace: '' }],
    tests: unit,
  },
  {
    name: 'the feed is last changed when its oldest post was',
    edits: [{ file: feed, find: '.at(-1)', replace: '.at(0)' }],
    tests: unit,
  },
  {
    name: 'an entry’s link is relative',
    edits: [
      {
        file: feed,
        find: 'href="${xml(at(post.path))}"',
        replace: 'href="${xml(post.path)}"',
      },
    ],
    tests: unit,
  },
  {
    name: 'the sitemap gives a post no last change',
    edits: [{ file: site, find: '{ path, modified: at }', replace: 'path' }],
    tests: unit,
  },
  {
    name: 'the feed is not written',
    edits: [
      {
        file: site,
        find: 'contents: (await library()).feed(Shell.ORIGIN)',
        replace: "contents: ''",
      },
    ],
    tests: unit,
  },

  // TYPOGRAPHY
  {
    name: 'the measure is wider',
    edits: [{ file: style, find: "'--blog-measure': '48ch'", replace: "'--blog-measure': '72ch'" }],
    tests: browser,
  },
  {
    name: 'the text is 16px',
    edits: [
      {
        file: style,
        find: "fontSize: '1.125rem',\n      lineHeight: '1.65',",
        replace: "fontSize: '1rem',\n      lineHeight: '1.65',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the line height is tighter',
    edits: [{ file: style, find: "lineHeight: '1.65',", replace: "lineHeight: '1.4'," }],
    tests: browser,
  },
  {
    name: 'a phone sets the text as a desktop does',
    edits: [
      {
        file: style,
        find: "Style.media(PHONE, { fontSize: '1.0625rem', lineHeight: '1.6' })",
        replace: 'Style.media(PHONE, {})',
      },
    ],
    tests: browser,
  },
  {
    name: 'a table does not scroll in its own box',
    edits: [
      {
        file: style,
        find: "Style.nest('> .table', {\n      overflowX: 'auto',",
        replace: "Style.nest('> .table', {",
      },
    ],
    tests: browser,
  },
  {
    name: 'the contents are not beside the column on a wide screen',
    edits: [
      {
        file: style,
        find: "Style.media(BESIDE, { display: 'block' })",
        replace: 'Style.media(BESIDE, {})',
      },
    ],
    tests: browser,
  },
  {
    name: 'the folded contents stay on a wide screen',
    edits: [
      {
        file: style,
        find: "Style.media(BESIDE, { display: 'none' })",
        replace: 'Style.media(BESIDE, {})',
      },
    ],
    tests: browser,
  },
  {
    name: 'a heading has as little room above as below',
    edits: [
      { file: style, find: "marginBlockStart: '3rem',", replace: "marginBlockStart: '0.75rem'," },
    ],
    tests: browser,
  },
  {
    name: 'dates are not tabular',
    edits: [
      {
        file: style,
        find: "color: t.text.muted,\n    fontVariantNumeric: 'tabular-nums',",
        replace: 'color: t.text.muted,',
      },
    ],
    tests: browser,
  },
  {
    name: 'a contents drawn twice is read as two lists of sections',
    edits: [{ file: '../src/spy.ts', find: ' || ids.includes(idOf(link))', replace: '' }],
    tests: ['examples/site/test/spy.browser.test.ts'],
  },
]
