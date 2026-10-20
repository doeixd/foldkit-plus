// Written by `pnpm icons` from icons.json. Do not edit.
// Lucide (ISC, Lucide Contributors): @iconify-json/lucide 1.2.147, https://github.com/lucide-icons/lucide/blob/main/LICENSE
import type { IconData } from 'foldkit-media'

export type IconName =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'quote'
  | 'bulleted-list'
  | 'numbered-list'
  | 'checklist'
  | 'code-block'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'highlight'
  | 'kbd'
  | 'link'
  | 'comment'
  | 'table'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'callout'
  | 'toggle'
  | 'divider'
  | 'footnote'
  | 'undo'
  | 'redo'
  | 'search'
  | 'replace'
  | 'match-case'
  | 'download'
  | 'copy'
  | 'trash'
  | 'plus'
  | 'more'
  | 'grip'
  | 'close'
  | 'check'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-right'
  | 'back'
  | 'contents'
  | 'reset'

export const icons: { readonly [Name in IconName]: IconData } = {
  paragraph: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M13 4v16m4-16v16m2-16H9.5a4.5 4.5 0 0 0 0 9H13',
        },
        children: [],
      },
    ],
  },
  'heading-1': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M4 12h8m-8 6V6m8 12V6m5 6l3-2v8',
        },
        children: [],
      },
    ],
  },
  'heading-2': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M4 12h8m-8 6V6m8 12V6m9 12h-4c0-4 4-3 4-6c0-1.5-2-2.5-4-1',
        },
        children: [],
      },
    ],
  },
  'heading-3': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M4 12h8m-8 6V6m8 12V6m5.5 4.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2m-2 3.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2',
        },
        children: [],
      },
    ],
  },
  quote: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M17 5H3m18 7H8m13 7H8m-5-7v7',
        },
        children: [],
      },
    ],
  },
  'bulleted-list': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13',
        },
        children: [],
      },
    ],
  },
  'numbered-list': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M11 5h10m-10 7h10m-10 7h10M4 4h1v5M4 9h2m.5 11H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02',
        },
        children: [],
      },
    ],
  },
  checklist: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M13 5h8m-8 7h8m-8 7h8M3 17l2 2l4-4M3 7l2 2l4-4',
        },
        children: [],
      },
    ],
  },
  'code-block': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'm10 9l-3 3l3 3m4 0l3-3l-3-3' }, children: [] },
          {
            tag: 'rect',
            attributes: { width: '18', height: '18', x: '3', y: '3', rx: '2' },
            children: [],
          },
        ],
      },
    ],
  },
  bold: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8',
        },
        children: [],
      },
    ],
  },
  italic: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M19 4h-9m4 16H5M15 4L9 20',
        },
        children: [],
      },
    ],
  },
  underline: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16',
        },
        children: [],
      },
    ],
  },
  strikethrough: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6m-2-8h16',
        },
        children: [],
      },
    ],
  },
  code: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'm16 18l6-6l-6-6M8 6l-6 6l6 6',
        },
        children: [],
      },
    ],
  },
  highlight: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'm9 11l-6 6v3h9l3-3' }, children: [] },
          {
            tag: 'path',
            attributes: { d: 'm22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4' },
            children: [],
          },
        ],
      },
    ],
  },
  kbd: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: {
              d: 'M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10m-9-4h.01',
            },
            children: [],
          },
          {
            tag: 'rect',
            attributes: { width: '20', height: '16', x: '2', y: '4', rx: '2' },
            children: [],
          },
        ],
      },
    ],
  },
  link: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
            children: [],
          },
          {
            tag: 'path',
            attributes: { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
            children: [],
          },
        ],
      },
    ],
  },
  comment: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
        },
        children: [],
      },
    ],
  },
  table: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'M12 3v18' }, children: [] },
          {
            tag: 'rect',
            attributes: { width: '18', height: '18', x: '3', y: '3', rx: '2' },
            children: [],
          },
          { tag: 'path', attributes: { d: 'M3 9h18M3 15h18' }, children: [] },
        ],
      },
    ],
  },
  image: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'rect',
            attributes: { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' },
            children: [],
          },
          { tag: 'circle', attributes: { cx: '9', cy: '9', r: '2' }, children: [] },
          {
            tag: 'path',
            attributes: { d: 'm21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21' },
            children: [],
          },
        ],
      },
    ],
  },
  video: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: {
              d: 'm16 13l5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5',
            },
            children: [],
          },
          {
            tag: 'rect',
            attributes: { width: '14', height: '12', x: '2', y: '6', rx: '2' },
            children: [],
          },
        ],
      },
    ],
  },
  audio: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'M9 18V5l12-2v13' }, children: [] },
          { tag: 'circle', attributes: { cx: '6', cy: '18', r: '3' }, children: [] },
          { tag: 'circle', attributes: { cx: '18', cy: '16', r: '3' }, children: [] },
        ],
      },
    ],
  },
  file: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'm16 6l-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551',
        },
        children: [],
      },
    ],
  },
  callout: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M15 14c.2-1 .7-1.7 1.5-2.5c1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4',
        },
        children: [],
      },
    ],
  },
  toggle: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M10 5h11m-11 7h11m-11 7h11M3 10l3-3l-3-3m0 16l3-3l-3-3',
        },
        children: [],
      },
    ],
  },
  divider: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M5 12h14',
        },
        children: [],
      },
    ],
  },
  footnote: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'm4 19l8-8m0 8l-8-8m16 1h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06',
        },
        children: [],
      },
    ],
  },
  undo: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'M3 7v6h6' }, children: [] },
          {
            tag: 'path',
            attributes: { d: 'M21 17a9 9 0 0 0-9-9a9 9 0 0 0-6 2.3L3 13' },
            children: [],
          },
        ],
      },
    ],
  },
  redo: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'M21 7v6h-6' }, children: [] },
          {
            tag: 'path',
            attributes: { d: 'M3 17a9 9 0 0 1 9-9a9 9 0 0 1 6 2.3l3 2.7' },
            children: [],
          },
        ],
      },
    ],
  },
  search: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'path', attributes: { d: 'm21 21l-4.34-4.34' }, children: [] },
          { tag: 'circle', attributes: { cx: '11', cy: '11', r: '8' }, children: [] },
        ],
      },
    ],
  },
  replace: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: {
              d: 'M14 4a1 1 0 0 1 1-1m0 7a1 1 0 0 1-1-1m7-5a1 1 0 0 0-1-1m1 6a1 1 0 0 1-1 1M3 7l3 3l3-3',
            },
            children: [],
          },
          { tag: 'path', attributes: { d: 'M6 10V5a2 2 0 0 1 2-2h2' }, children: [] },
          {
            tag: 'rect',
            attributes: { width: '7', height: '7', x: '3', y: '14', rx: '1' },
            children: [],
          },
        ],
      },
    ],
  },
  'match-case': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: { d: 'm2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16m11-7v7M3.304 13h6.392' },
            children: [],
          },
          { tag: 'circle', attributes: { cx: '18.5', cy: '12.5', r: '3.5' }, children: [] },
        ],
      },
    ],
  },
  download: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: { d: 'M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
            children: [],
          },
          { tag: 'path', attributes: { d: 'm7 10l5 5l5-5' }, children: [] },
        ],
      },
    ],
  },
  copy: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'rect',
            attributes: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' },
            children: [],
          },
          {
            tag: 'path',
            attributes: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' },
            children: [],
          },
        ],
      },
    ],
  },
  trash: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
        },
        children: [],
      },
    ],
  },
  plus: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M5 12h14m-7-7v14',
        },
        children: [],
      },
    ],
  },
  more: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'circle', attributes: { cx: '12', cy: '12', r: '1' }, children: [] },
          { tag: 'circle', attributes: { cx: '19', cy: '12', r: '1' }, children: [] },
          { tag: 'circle', attributes: { cx: '5', cy: '12', r: '1' }, children: [] },
        ],
      },
    ],
  },
  grip: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          { tag: 'circle', attributes: { cx: '9', cy: '12', r: '1' }, children: [] },
          { tag: 'circle', attributes: { cx: '9', cy: '5', r: '1' }, children: [] },
          { tag: 'circle', attributes: { cx: '9', cy: '19', r: '1' }, children: [] },
          { tag: 'circle', attributes: { cx: '15', cy: '12', r: '1' }, children: [] },
          { tag: 'circle', attributes: { cx: '15', cy: '5', r: '1' }, children: [] },
          { tag: 'circle', attributes: { cx: '15', cy: '19', r: '1' }, children: [] },
        ],
      },
    ],
  },
  close: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M18 6L6 18M6 6l12 12',
        },
        children: [],
      },
    ],
  },
  check: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'M20 6L9 17l-5-5',
        },
        children: [],
      },
    ],
  },
  'chevron-down': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'm6 9l6 6l6-6',
        },
        children: [],
      },
    ],
  },
  'chevron-up': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'm18 15l-6-6l-6 6',
        },
        children: [],
      },
    ],
  },
  'chevron-right': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'm9 18l6-6l-6-6',
        },
        children: [],
      },
    ],
  },
  back: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
          d: 'm12 19l-7-7l7-7m7 7H5',
        },
        children: [],
      },
    ],
  },
  contents: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: { d: 'M8 5h13m-8 7h8m-8 7h8M3 10a2 2 0 0 0 2 2h3' },
            children: [],
          },
          { tag: 'path', attributes: { d: 'M3 5v12a2 2 0 0 0 2 2h3' }, children: [] },
        ],
      },
    ],
  },
  reset: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '2',
        },
        children: [
          {
            tag: 'path',
            attributes: { d: 'M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8' },
            children: [],
          },
          { tag: 'path', attributes: { d: 'M3 3v5h5' }, children: [] },
        ],
      },
    ],
  },
}
