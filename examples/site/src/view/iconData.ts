// Written by `pnpm icons` from icons.json. Do not edit.
// Lucide (ISC, Lucide Contributors): @iconify-json/lucide 1.2.147, https://github.com/lucide-icons/lucide/blob/main/LICENSE
import type { IconData } from 'foldkit-media'

export type IconName = 'copy' | 'link' | 'check' | 'shuffle'

export const icons: { readonly [Name in IconName]: IconData } = {
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
  shuffle: {
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
          { tag: 'path', attributes: { d: 'm18 14l4 4l-4 4m0-20l4 4l-4 4' }, children: [] },
          {
            tag: 'path',
            attributes: {
              d: 'M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22M2 6h1.972a4 4 0 0 1 3.6 2.2M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45',
            },
            children: [],
          },
        ],
      },
    ],
  },
}
