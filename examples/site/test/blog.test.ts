// @vitest-environment jsdom
/**
 * The blog as the build writes it: posts read from files, the index and a post
 * rendered through the site's own pipeline, the head each carries, the feed
 * and the sitemap. The pages are rendered over a library of the blog alone
 * (`blogSite.ts`); the whole site's prerender is `prerender.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { hashOf } from '../src/blog/cardHash.js'
import { imageSize } from '../src/blog/imageSize.js'
import { DEFAULT_CARD, metaOf } from '../src/blog/meta.js'
import { loadPosts, minutesToRead } from '../src/blog/posts.js'
import { formatDay } from '../src/blog/view.js'
import { parse } from '../src/content/guides.js'
import { Page } from '../src/page.js'
import { ORIGIN } from '../src/shell.js'
import { build, libraryOf, png, REPOSITORY, repositoryOf } from './blogSite.js'

const front = (fields: Readonly<Record<string, string>>): string =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n`

const base = { description: 'What it is.', author: 'Ada Lovelace', tags: '[release]' }

/** Three posts out of date order, the middle one the richest: its own image, an update, a figure. */
const POSTS = {
  '2026-01-10-first.md': `${front({ ...base, title: 'First', date: '2026-01-10' })}
Only a paragraph.
`,
  '2026-03-05-second.md': `${front({
    ...base,
    title: 'Second: a "quoted" <b>claim</b> & more',
    date: '2026-03-05',
    updated: '2026-04-01',
    image: '/blog/shot.png',
    tags: '[release, mixins-ui]',
  })}
# Second: a "quoted" <b>claim</b> & more

Intro with a [relative link](../../packages/x/README.md), a [same-page anchor](#details) and \`code\`.

## Details

Text.

\`\`\`ts
const x = 1
\`\`\`

### Sub

| a | b |
| - | - |
| 1 | 2 |

![An alt](/blog/shot.png "A caption")

<!-- image: a slot that draws nothing -->

## More
`,
  '2026-02-20-middle.md': `${front({
    ...base,
    title: 'Tricky </script><b>x</b> & "title"',
    date: '2026-02-20',
  })}
Middle.
`,
}

const FILES = { '/blog/shot.png': png(600, 315) }

const docOf = (html: string) => new DOMParser().parseFromString(html, 'text/html')

/** The one element that matches: a head tag written twice is a fault of its own. */
const one = (doc: Document, selector: string): Element => {
  const found = doc.querySelectorAll(selector)
  expect(found.length, selector).toBe(1)
  return found[0]!
}
const attribute = (doc: Document, selector: string, name = 'content') =>
  one(doc, selector).getAttribute(name)

const built = async () => {
  const site = await build(repositoryOf(POSTS, FILES))
  return {
    ...site,
    html: (path: string) => site.pages.find(page => page.path === path)!.html,
  }
}

// Rendered once for the tests that read it: each page takes about a second.
let once: ReturnType<typeof built> | undefined
const rendered = () => (once ??= built())

describe('posts', () => {
  test('are read newest first, with the slug the file is named for', () => {
    const posts = loadPosts(repositoryOf(POSTS, FILES))
    expect(posts.map(post => [post.path, post.date, post.modified])).toEqual([
      ['/blog/second', '2026-03-05', '2026-04-01'],
      ['/blog/middle', '2026-02-20', '2026-02-20'],
      ['/blog/first', '2026-01-10', '2026-01-10'],
    ])
  })

  test('a dot in the file name is a hyphen in the address, and a day shared by two is ordered by slug', () => {
    const posts = loadPosts(
      repositoryOf({
        '2026-01-05-v1.2.3.md': `${front({ ...base, title: 'A', date: '2026-01-05' })}\nText.\n`,
        '2026-01-05-b.md': `${front({ ...base, title: 'B', date: '2026-01-05' })}\nText.\n`,
      }),
    )
    expect(posts.map(post => post.path)).toEqual(['/blog/v1-2-3', '/blog/b'])
  })

  test('the real posts load, newest first, each with a social card of the size the meta says', () => {
    const posts = loadPosts(REPOSITORY)
    const paths = posts.map(post => post.path)
    expect(paths).toContain('/blog/foldkit-plus-0-43-0')
    expect(paths.indexOf('/blog/foldkit-plus-0-43-0')).toBeLessThan(
      paths.indexOf('/blog/foldkit-plus-0-7-0'),
    )
    expect(posts.map(post => post.date)).toEqual([...posts.map(post => post.date)].sort().reverse())
    for (const post of posts)
      expect(post.image, post.file).toEqual({
        path: `/blog/og/${post.slug}.png`,
        width: DEFAULT_CARD.width,
        height: DEFAULT_CARD.height,
      })
  })

  test('every real post has its own card, drawn from its current title and date', () => {
    const hashes: Record<string, string> = JSON.parse(
      readFileSync(join(REPOSITORY, 'examples/site/public/blog/og/cards.json'), 'utf8'),
    )
    for (const post of loadPosts(REPOSITORY)) {
      const how = `${post.file}: run \`pnpm --filter foldkit-example-site social\` and commit examples/site/public/blog/og`
      expect(post.image.path, `${how} (no card for ${post.slug})`).toBe(`/blog/og/${post.slug}.png`)
      expect(hashes[post.slug], `${how} (its title or date changed since the card was drawn)`).toBe(
        hashOf(post.title, post.date),
      )
    }
  })

  test('a post with a card of its own, by its slug, shares that and not the default', () => {
    const [post] = loadPosts(
      repositoryOf(
        {
          '2026-01-10-first.md': `${front({ ...base, title: 'First', date: '2026-01-10' })}
Text.
`,
        },
        { '/blog/og/first.png': png(1200, 630) },
      ),
    )
    expect(post!.image.path).toBe('/blog/og/first.png')
  })

  test.each([
    [
      'a file not named for a date',
      { 'first-post.md': `${front({ ...base, title: 'A', date: '2026-01-05' })}\nText.\n` },
      /docs\/blog\/first-post\.md: a post's file is named <yyyy-mm-dd>-<slug>\.md/,
    ],
    [
      'a front matter date that is not the file’s',
      { '2026-01-05-a.md': `${front({ ...base, title: 'A', date: '2026-01-06' })}\nText.\n` },
      /docs\/blog\/2026-01-05-a\.md: the file is dated 2026-01-05 but its front matter says 2026-01-06/,
    ],
    [
      'a heading that is not the title',
      {
        '2026-01-05-a.md': `${front({ ...base, title: 'A', date: '2026-01-05' })}\n# Another\n\nText.\n`,
      },
      /docs\/blog\/2026-01-05-a\.md: the post's own heading "Another" is not its title "A"/,
    ],
    [
      'two files at one address',
      {
        '2026-01-05-a.md': `${front({ ...base, title: 'A', date: '2026-01-05' })}\nText.\n`,
        '2026-01-06-a.md': `${front({ ...base, title: 'B', date: '2026-01-06' })}\nText.\n`,
      },
      /docs\/blog\/2026-01-0[56]-a\.md and docs\/blog\/2026-01-0[56]-a\.md are both at \/blog\/a/,
    ],
    [
      'an image that is not in the public folder',
      {
        '2026-01-05-a.md': `${front({ ...base, title: 'A', date: '2026-01-05', image: '/blog/nope.png' })}\nText.\n`,
      },
      /docs\/blog\/2026-01-05-a\.md: image \/blog\/nope\.png is not in examples\/site\/public/,
    ],
    [
      'front matter with a key it does not know',
      {
        '2026-01-05-a.md': `${front({ ...base, title: 'A', date: '2026-01-05', draft: 'true' })}\nText.\n`,
      },
      /docs\/blog\/2026-01-05-a\.md: .*draft/s,
    ],
  ])('a repository with %s fails the build, naming the file', (_name, posts, problem) => {
    expect(() => loadPosts(repositoryOf(posts))).toThrow(problem)
  })

  test('a card that is not a PNG fails, naming the file', () => {
    const repository = repositoryOf(
      {
        '2026-01-05-a.md': `${front({ ...base, title: 'A', date: '2026-01-05', image: '/blog/x.png' })}\nText.\n`,
      },
      { '/blog/x.png': Buffer.from('not an image at all, just words') },
    )
    expect(() => loadPosts(repository)).toThrow(
      /docs\/blog\/2026-01-05-a\.md: only PNG and JPEG images are read for their size/,
    )
  })

  test('an empty blog and a figure that is not a local file fail at their own step', async () => {
    await expect(libraryOf(repositoryOf({}))).rejects.toThrow(/holds no posts/)
    const remote = repositoryOf({
      '2026-01-05-a.md': `${front({ ...base, title: 'A', date: '2026-01-05' })}\n![x](https://example.com/x.png)\n`,
    })
    await expect(build(remote, ['/blog/a'])).rejects.toThrow(
      /docs\/blog\/2026-01-05-a\.md: image https:\/\/example\.com\/x\.png is not a file under examples\/site\/public/,
    )
  })
})

describe('reading time', () => {
  const minutes = (markdown: string) => minutesToRead(parse(markdown).children)
  const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ')

  test.each([
    [5, 1],
    [230, 1],
    [231, 2],
    [460, 2],
    [461, 3],
  ])('%i words take %i minutes', (count, expected) => {
    expect(minutes(words(count))).toBe(expected)
  })

  test('code is read by the line, not counted as words, and a comment is not read', () => {
    const code = (lines: number) =>
      `\`\`\`ts\n${Array.from({ length: lines }, () => 'x y z').join('\n')}\n\`\`\``
    expect(minutes(code(15))).toBe(1)
    expect(minutes(code(30))).toBe(2)
    expect(minutes(`<!-- ${words(900)} -->\n\nShort.`)).toBe(1)
  })
})

describe('image sizes', () => {
  /** A JPEG with an APP0 segment, then a frame of `width` by `height`. */
  const jpeg = (width: number, height: number): Buffer =>
    Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x04,
      0x00,
      0x00,
      0xff,
      0xc0,
      0x00,
      0x0b,
      0x08,
      height >> 8,
      height & 255,
      width >> 8,
      width & 255,
      0x01,
      0x01,
      0x11,
      0x00,
    ])

  test('a PNG and a JPEG are read from their headers', () => {
    expect(imageSize('a.png', png(1200, 630))).toEqual({ width: 1200, height: 630 })
    expect(imageSize('a.jpg', jpeg(800, 450))).toEqual({ width: 800, height: 450 })
  })

  test('anything else is refused, naming the file', () => {
    expect(() => imageSize('a.gif', Buffer.from('GIF89a......'))).toThrow(/^a\.gif: only PNG/)
  })
})

describe('the date as the page words it', () => {
  test.each([
    ['2026-11-18', 'November 18, 2026'],
    ['2026-01-05', 'January 5, 2026'],
    ['2026-12-31', 'December 31, 2026'],
  ])('%s is %s', (day, words) => expect(formatDay(day)).toBe(words))
})

describe('the index', () => {
  test('lists the posts newest first, each with its date, summary, tags and reading time', async () => {
    const built = await rendered()
    const doc = docOf(built.html('/blog'))
    expect(one(doc, 'h1').textContent).toBe('Blog')
    const items = [...doc.querySelectorAll('main ol > li')]
    expect(items.map(item => item.querySelector('h2 a')?.getAttribute('href'))).toEqual([
      '/blog/second',
      '/blog/middle',
      '/blog/first',
    ])
    expect(items.map(item => item.querySelector('time')?.getAttribute('datetime'))).toEqual([
      '2026-03-05',
      '2026-02-20',
      '2026-01-10',
    ])
    expect(items[0]!.querySelector('h2 a')?.textContent).toBe(
      'Second: a "quoted" <b>claim</b> & more',
    )
    expect(items[0]!.querySelector('p:not(:first-child)')?.textContent).toBe('What it is.')
    expect([...items[0]!.querySelectorAll('ul li')].map(tag => tag.textContent)).toEqual([
      'release',
      'mixins-ui',
    ])
    expect(items[0]!.textContent).toContain('1 min read')
  })

  test('says what it is, as a website and not an article', async () => {
    const doc = docOf((await rendered()).html('/blog'))
    expect(doc.title).toBe('Blog · Foldkit Plus')
    expect(attribute(doc, 'link[rel="canonical"]', 'href')).toBe(`${ORIGIN}/blog`)
    expect(attribute(doc, 'meta[property="og:type"]')).toBe('website')
    expect(attribute(doc, 'meta[property="og:url"]')).toBe(`${ORIGIN}/blog`)
    expect(attribute(doc, 'meta[property="og:image"]')).toBe(`${ORIGIN}${DEFAULT_CARD.path}`)
    expect(doc.querySelectorAll('meta[property^="article:"]')).toHaveLength(0)
    expect(
      doc.querySelector('#rail nav[aria-label="Site"] [aria-current="page"]')?.textContent,
    ).toBe('Blog')
    expect(doc.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0)
  })

  test('is linked to the feed, as every page is', async () => {
    const doc = docOf((await rendered()).html('/blog'))
    expect(attribute(doc, 'link[rel="alternate"][type="application/atom+xml"]', 'href')).toBe(
      '/blog/feed.xml',
    )
  })
})

describe('a post', () => {
  test('has one h1, its title, a standfirst and a meta line with the date as a time', async () => {
    const doc = docOf((await rendered()).html('/blog/second'))
    expect(one(doc, 'h1').textContent).toBe('Second: a "quoted" <b>claim</b> & more')
    expect(doc.querySelector('main header h1 + p')?.textContent).toBe('What it is.')
    const times = [...doc.querySelectorAll('main header time')]
    expect(times.map(time => time.getAttribute('datetime'))).toEqual(['2026-03-05', '2026-04-01'])
    expect(times.map(time => time.textContent)).toEqual(['March 5, 2026', 'April 1, 2026'])
    const [, line] = doc.querySelectorAll('main header h1 ~ p')
    expect([...line!.children].map(part => part.textContent)).toEqual([
      'March 5, 2026',
      'Updated April 1, 2026',
      'Ada Lovelace',
      '1 min read',
    ])
  })

  test('has one of each tag a preview or a crawler reads, with the absolute values', async () => {
    const doc = docOf((await rendered()).html('/blog/second'))
    const title = 'Second: a "quoted" <b>claim</b> & more'
    const url = `${ORIGIN}/blog/second`
    const image = `${ORIGIN}/blog/shot.png`
    expect(doc.title).toBe(`${title} · Foldkit Plus`)
    expect(attribute(doc, 'link[rel="canonical"]', 'href')).toBe(url)
    expect(attribute(doc, 'meta[name="description"]')).toBe('What it is.')
    expect(attribute(doc, 'meta[property="og:type"]')).toBe('article')
    expect(attribute(doc, 'meta[property="og:title"]')).toBe(title)
    expect(attribute(doc, 'meta[property="og:description"]')).toBe('What it is.')
    expect(attribute(doc, 'meta[property="og:url"]')).toBe(url)
    expect(attribute(doc, 'meta[property="og:site_name"]')).toBe('Foldkit Plus')
    expect(attribute(doc, 'meta[property="og:image"]')).toBe(image)
    expect(attribute(doc, 'meta[property="og:image:width"]')).toBe('600')
    expect(attribute(doc, 'meta[property="og:image:height"]')).toBe('315')
    expect(attribute(doc, 'meta[property="og:image:alt"]')).toBe(title)
    expect(attribute(doc, 'meta[property="article:published_time"]')).toBe('2026-03-05')
    expect(attribute(doc, 'meta[property="article:modified_time"]')).toBe('2026-04-01')
    expect(attribute(doc, 'meta[property="article:author"]')).toBe('Ada Lovelace')
    expect(
      [...doc.querySelectorAll('meta[property="article:tag"]')].map(tag =>
        tag.getAttribute('content'),
      ),
    ).toEqual(['release', 'mixins-ui'])
    expect(attribute(doc, 'meta[name="twitter:card"]')).toBe('summary_large_image')
    expect(attribute(doc, 'meta[name="twitter:title"]')).toBe(title)
    expect(attribute(doc, 'meta[name="twitter:description"]')).toBe('What it is.')
    expect(attribute(doc, 'meta[name="twitter:image"]')).toBe(image)
    expect(attribute(doc, 'meta[name="twitter:image:alt"]')).toBe(title)
  })

  test('a post with no image of its own shares the default card, at its real size', async () => {
    const doc = docOf((await rendered()).html('/blog/first'))
    expect(attribute(doc, 'meta[property="og:image"]')).toBe(`${ORIGIN}${DEFAULT_CARD.path}`)
    expect(attribute(doc, 'meta[property="og:image:width"]')).toBe('1200')
    expect(attribute(doc, 'meta[property="og:image:height"]')).toBe('630')
    // Never updated: modified is the day it was written.
    expect(attribute(doc, 'meta[property="article:modified_time"]')).toBe('2026-01-10')
    expect(doc.querySelectorAll('main header time')).toHaveLength(1)
  })

  test('carries a BlogPosting that parses and says what the page says', async () => {
    const doc = docOf((await rendered()).html('/blog/second'))
    const data: unknown = JSON.parse(one(doc, 'script[type="application/ld+json"]').textContent)
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'Second: a "quoted" <b>claim</b> & more',
      description: 'What it is.',
      datePublished: '2026-03-05',
      dateModified: '2026-04-01',
      author: { '@type': 'Person', name: 'Ada Lovelace' },
      image: [`${ORIGIN}/blog/shot.png`],
      keywords: 'release, mixins-ui',
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${ORIGIN}/blog/second` },
      publisher: { '@type': 'Organization', name: 'Foldkit Plus', url: ORIGIN },
    })
  })

  test('escapes a title that tries to close the script, in the JSON and in the tags', async () => {
    const html = (await rendered()).html('/blog/middle')
    expect(html).not.toContain('</script><b>')
    const doc = docOf(html)
    const title = 'Tricky </script><b>x</b> & "title"'
    expect(attribute(doc, 'meta[property="og:title"]')).toBe(title)
    expect(doc.title).toBe(`${title} · Foldkit Plus`)
    const data = JSON.parse(one(doc, 'script[type="application/ld+json"]').textContent) as {
      headline: string
    }
    expect(data.headline).toBe(title)
    expect(doc.querySelectorAll('main b')).toHaveLength(0)
  })

  test('has a contents of its h2s, beside the column and folded above it, each leading to a heading', async () => {
    const doc = docOf((await rendered()).html('/blog/second'))
    const lists = [...doc.querySelectorAll('[aria-label="On this page"]')]
    expect(lists).toHaveLength(2)
    for (const list of lists)
      expect([...list.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual([
        '#details',
        '#more',
      ])
    expect(doc.querySelector('main details > summary')?.textContent).toBe('On this page')
    expect(doc.querySelector('main details')?.hasAttribute('open')).toBe(false)
    expect(doc.querySelector('main aside')?.contains(lists[1]!)).toBe(true)
    expect([...doc.querySelectorAll('main h2')].map(heading => heading.id).filter(Boolean)).toEqual(
      ['details', 'more'],
    )
  })

  test('draws its Markdown as the guides do, with its links led to where the site serves them', async () => {
    const doc = docOf((await rendered()).html('/blog/second'))
    const links = [...doc.querySelectorAll('main article > div p a')].map(link =>
      link.getAttribute('href'),
    )
    expect(links).toEqual(['resolved:../../packages/x/README.md', '#details'])
    expect(doc.querySelector('main pre')?.textContent).toContain('const x = 1')
    expect(doc.querySelector('main .table table th')?.textContent).toBe('a')
    expect(doc.querySelector('main')?.textContent).not.toContain('a slot that draws nothing')
  })

  test('draws a figure with its size, its caption and its loading, and no h1 of its own', async () => {
    const doc = docOf((await rendered()).html('/blog/second'))
    const figure = one(doc, 'main figure.image')
    const image = figure.querySelector('img')!
    expect([image.getAttribute('src'), image.getAttribute('alt')]).toEqual([
      '/blog/shot.png',
      'An alt',
    ])
    expect([image.getAttribute('width'), image.getAttribute('height')]).toEqual(['600', '315'])
    // The sixth block: below the fold, so deferred.
    expect(image.getAttribute('loading')).toBe('lazy')
    expect(figure.querySelector('figcaption')?.textContent).toBe('A caption')
    expect(doc.querySelectorAll('h1')).toHaveLength(1)
  })

  test('ends in its neighbours in time and a way back to the index', async () => {
    const built = await rendered()
    const links = (path: string) => {
      const doc = docOf(built.html(path))
      return {
        previous: doc.querySelector('main a[rel="prev"]')?.getAttribute('href') ?? null,
        next: doc.querySelector('main a[rel="next"]')?.getAttribute('href') ?? null,
        back: [...doc.querySelectorAll('main a')].some(
          link => link.getAttribute('href') === '/blog' && link.textContent?.includes('All posts'),
        ),
      }
    }
    expect(links('/blog/second')).toEqual({ previous: '/blog/middle', next: null, back: true })
    expect(links('/blog/middle')).toEqual({
      previous: '/blog/first',
      next: '/blog/second',
      back: true,
    })
    expect(links('/blog/first')).toEqual({ previous: null, next: '/blog/middle', back: true })
  })

  test('is in the rail among the posts, marked, and the Blog place in the navigation is current', async () => {
    const doc = docOf((await rendered()).html('/blog/middle'))
    const current = [...doc.querySelectorAll('#rail nav[aria-label="Posts"] [aria-current]')]
    expect(current.map(link => link.getAttribute('href'))).toEqual(['/blog/middle'])
    expect(
      doc.querySelector('#rail nav[aria-label="Site"] [aria-current="page"]')?.textContent,
    ).toBe('Blog')
  })

  test('an address with no post is the site’s not-found page, as is the feed’s', async () => {
    const built = await build(repositoryOf(POSTS, FILES), ['/blog/nope', '/blog/feed.xml'])
    for (const page of built.pages) {
      const doc = docOf(page.html)
      expect(one(doc, 'h1').textContent, page.path).toContain('Not found')
      expect(doc.title).toBe('Not found · Foldkit Plus')
    }
    const library = await libraryOf(repositoryOf(POSTS, FILES))
    expect(library.pageAt('/blog/nope')._tag).toBe('Missing')
    expect(library.pageAt('/blog')._tag).toBe('Blog')
    expect(library.pageAt('/blog/second')._tag).toBe('Post')
  })
})

describe('the head, from the page alone', () => {
  test('is none for a page that is not the blog’s, and the browser can ask it of a post', () => {
    expect(metaOf(Page.Home(), ORIGIN)._tag).toBe('None')
    expect(metaOf(Page.Blog(), ORIGIN)._tag).toBe('Some')
  })
})

describe('the feed and the sitemap', () => {
  test('the feed is well-formed Atom with an entry for each post, newest first, with absolute links', async () => {
    const { emitted } = await rendered()
    expect(emitted.map(file => file.file)).toEqual(['blog/feed.xml'])
    const text = String(emitted[0]!.contents)
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    const feed = doc.documentElement
    expect(feed.localName).toBe('feed')
    expect(feed.namespaceURI).toBe('http://www.w3.org/2005/Atom')
    const entries = [...doc.getElementsByTagName('entry')]
    expect(entries.map(entry => entry.getElementsByTagName('title')[0]!.textContent)).toEqual([
      'Second: a "quoted" <b>claim</b> & more',
      'Tricky </script><b>x</b> & "title"',
      'First',
    ])
    for (const entry of entries) {
      const [id, link] = [
        entry.getElementsByTagName('id')[0]!.textContent!,
        entry.getElementsByTagName('link')[0]!.getAttribute('href')!,
      ]
      expect(id).toMatch(/^https:\/\/foldkit-plus\.pages\.dev\/blog\/[a-z0-9-]+$/)
      expect(link).toBe(id)
      expect(entry.getElementsByTagName('updated')[0]!.textContent).toMatch(
        /^\d{4}-\d{2}-\d{2}T00:00:00Z$/,
      )
      expect(entry.getElementsByTagName('author')[0]!.textContent).toBe('Ada Lovelace')
      expect(entry.getElementsByTagName('summary')[0]!.textContent).toBe('What it is.')
    }
    expect(
      new Set(entries.map(entry => entry.getElementsByTagName('id')[0]!.textContent)).size,
    ).toBe(3)
    expect(entries[0]!.getElementsByTagName('published')[0]!.textContent).toBe(
      '2026-03-05T00:00:00Z',
    )
    expect(entries[0]!.getElementsByTagName('updated')[0]!.textContent).toBe('2026-04-01T00:00:00Z')
    expect(
      [...entries[0]!.getElementsByTagName('category')].map(category =>
        category.getAttribute('term'),
      ),
    ).toEqual(['release', 'mixins-ui'])
    // The feed's own address, and when it last changed.
    expect(
      [...feed.children]
        .find(child => child.localName === 'link' && child.getAttribute('rel') === 'self')
        ?.getAttribute('href'),
    ).toBe(`${ORIGIN}/blog/feed.xml`)
    expect(feed.getElementsByTagName('updated')[0]!.textContent).toBe('2026-04-01T00:00:00Z')
  })

  test('the host is told to serve the feed as Atom, at the address it is written to', async () => {
    const { emitted } = await rendered()
    const headers = readFileSync(join(import.meta.dirname, '../public/_headers'), 'utf8')
    expect(headers).toContain(`/${emitted[0]!.file}\n  Content-Type: application/atom+xml`)
  })

  test('the sitemap lists the index and each post with the day it last changed, and robots blocks none', async () => {
    const { sitemap, robots } = await rendered()
    expect(sitemap).toContain(`<loc>${ORIGIN}/blog</loc><lastmod>2026-04-01</lastmod>`)
    expect(sitemap).toContain(`<loc>${ORIGIN}/blog/second</loc><lastmod>2026-04-01</lastmod>`)
    expect(sitemap).toContain(`<loc>${ORIGIN}/blog/middle</loc><lastmod>2026-02-20</lastmod>`)
    expect(sitemap).toContain(`<loc>${ORIGIN}/blog/first</loc><lastmod>2026-01-10</lastmod>`)
    expect(robots).not.toMatch(/Disallow:/)
  })
})
