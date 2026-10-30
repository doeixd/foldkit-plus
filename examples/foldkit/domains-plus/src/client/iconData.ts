// Written by `pnpm icons` from icons.json. Do not edit.
// Lucide (ISC, Lucide Contributors): @iconify-json/lucide 1.2.147, https://github.com/lucide-icons/lucide/blob/main/LICENSE
import type { IconData } from 'foldkit-media'

export type IconName =
  | 'search'
  | 'close'
  | 'cart'
  | 'check'
  | 'filter'
  | 'chevronDown'
  | 'arrowUpRight'

export const icons: { readonly [Name in IconName]: IconData } = {
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
  cart: {
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
              d: 'm2.05 2.05l1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18',
            },
            children: [],
          },
          {
            tag: 'path',
            attributes: {
              d: 'M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25',
            },
            children: [],
          },
          { tag: 'circle', attributes: { cx: '18', cy: '20', r: '2' }, children: [] },
          { tag: 'circle', attributes: { cx: '8', cy: '20', r: '2' }, children: [] },
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
  filter: {
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
          d: 'M2 5h20M6 12h12m-9 7h6',
        },
        children: [],
      },
    ],
  },
  chevronDown: {
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
  arrowUpRight: {
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
          d: 'M7 7h10v10M7 17L17 7',
        },
        children: [],
      },
    ],
  },
}
