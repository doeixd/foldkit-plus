// Written by `pnpm icons` from icons.json. Do not edit.
// Lucide (ISC, Lucide Contributors): @iconify-json/lucide 1.2.147, https://github.com/lucide-icons/lucide/blob/main/LICENSE
import type { IconData } from 'foldkit-media'

export type IconName =
  | 'search'
  | 'eye'
  | 'eye-off'
  | 'pipette'
  | 'rotate-ccw'
  | 'rotate-cw'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'lock'
  | 'close'

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
  eye: {
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
              d: 'M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0',
            },
            children: [],
          },
          { tag: 'circle', attributes: { cx: '12', cy: '12', r: '3' }, children: [] },
        ],
      },
    ],
  },
  'eye-off': {
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
              d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575a1 1 0 0 1 0 .696a10.8 10.8 0 0 1-1.444 2.49m-6.41-.679a3 3 0 0 1-4.242-4.242',
            },
            children: [],
          },
          {
            tag: 'path',
            attributes: {
              d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 4.446-5.143M2 2l20 20',
            },
            children: [],
          },
        ],
      },
    ],
  },
  pipette: {
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
              d: 'm12 9l-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12',
            },
            children: [],
          },
          {
            tag: 'path',
            attributes: {
              d: 'm18 9l.4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4l3.4-3.4a1 1 0 1 1 3 3zM2 22l.414-.414',
            },
            children: [],
          },
        ],
      },
    ],
  },
  'rotate-ccw': {
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
  'rotate-cw': {
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
            attributes: { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' },
            children: [],
          },
          { tag: 'path', attributes: { d: 'M21 3v5h-5' }, children: [] },
        ],
      },
    ],
  },
  success: {
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
          { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' }, children: [] },
          { tag: 'path', attributes: { d: 'm16 9l-5.5 5.5L8 12' }, children: [] },
        ],
      },
    ],
  },
  warning: {
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
          d: 'm21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01',
        },
        children: [],
      },
    ],
  },
  error: {
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
          { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' }, children: [] },
          { tag: 'path', attributes: { d: 'm15 9l-6 6m0-6l6 6' }, children: [] },
        ],
      },
    ],
  },
  info: {
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
          { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' }, children: [] },
          { tag: 'path', attributes: { d: 'M12 16v-4m0-4h.01' }, children: [] },
        ],
      },
    ],
  },
  lock: {
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
            attributes: { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' },
            children: [],
          },
          { tag: 'path', attributes: { d: 'M7 11V7a5 5 0 0 1 10 0v4' }, children: [] },
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
}

/** Where an application imports each icon from: its set, and its name in `virtual:foldkit-icons/<set>`. */
export const imports: {
  readonly [Name in IconName]: { readonly set: string; readonly name: string }
} = {
  search: { set: 'lucide', name: 'search' },
  eye: { set: 'lucide', name: 'eye' },
  'eye-off': { set: 'lucide', name: 'eyeOff' },
  pipette: { set: 'lucide', name: 'pipette' },
  'rotate-ccw': { set: 'lucide', name: 'rotateCcw' },
  'rotate-cw': { set: 'lucide', name: 'rotateCw' },
  success: { set: 'lucide', name: 'circleCheck' },
  warning: { set: 'lucide', name: 'triangleAlert' },
  error: { set: 'lucide', name: 'circleX' },
  info: { set: 'lucide', name: 'info' },
  lock: { set: 'lucide', name: 'lock' },
  close: { set: 'lucide', name: 'x' },
}
