// Written by `pnpm icons` from icons.json. Do not edit.
// Huge Icons (MIT, Hugeicons): @iconify-json/hugeicons 1.2.35
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
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'm17 17l4 4m-2-10a8 8 0 1 0-16 0a8 8 0 0 0 16 0',
        },
        children: [],
      },
    ],
  },
  eye: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' },
        children: [
          {
            tag: 'path',
            attributes: {
              d: 'M21.544 11.045c.304.426.456.64.456.955c0 .316-.152.529-.456.955C20.178 14.871 16.689 19 12 19c-4.69 0-8.178-4.13-9.544-6.045C2.152 12.529 2 12.315 2 12c0-.316.152-.529.456-.955C3.822 9.129 7.311 5 12 5c4.69 0 8.178 4.13 9.544 6.045Z',
            },
            children: [],
          },
          { tag: 'path', attributes: { d: 'M15 12a3 3 0 1 0-6 0a3 3 0 0 0 6 0Z' }, children: [] },
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
          'stroke-width': '1.5',
        },
        children: [
          { tag: 'path', attributes: { d: 'M22 8s-4 6-10 6S2 8 2 8' }, children: [] },
          {
            tag: 'path',
            attributes: {
              'stroke-linejoin': 'round',
              d: 'm15 13.5l1.5 2.5m3.5-5l2 2M2 13l2-2m5 2.5L7.5 16',
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
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'm13.435 7l-6.276 6.276m0 0l-2.332 2.332c-.901.901-1.352 1.352-1.59 1.925C3 18.107 3 18.744 3 20.02V21h.98c1.276 0 1.913 0 2.487-.237c.573-.238 1.024-.689 1.925-1.59l5.897-5.897m-7.13 0h7.13m0 0L17 10.565m2.209-2.176L20.82 10m-1.611-1.611l.861-.862c.293-.293.44-.439.541-.582a2.1 2.1 0 0 0 0-2.434c-.102-.143-.248-.289-.54-.582c-.293-.292-.44-.438-.582-.54a2.1 2.1 0 0 0-2.434 0c-.143.102-.29.248-.582.54l-.862.862M19.21 8.39l-3.6-3.6M14 3.18l1.611 1.611',
        },
        children: [],
      },
    ],
  },
  'rotate-ccw': {
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
          'stroke-width': '1.5',
          d: 'M3.992 2v3.132c0 .294.367.427.555.201A9.97 9.97 0 0 1 11.997 2c5.52 0 9.995 4.477 9.995 10a10 10 0 0 1-5.633 9m-4.632 1q.7 0 1.376-.091M2.258 8.667q-.169.597-.266 1.202m.035 3.67q.105.6.274 1.186m1.524 3.272q.358.53.774 1.018m2.822 2.346a10 10 0 0 0 1.103.548',
        },
        children: [],
      },
    ],
  },
  'rotate-cw': {
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
          'stroke-width': '1.5',
          d: 'M19.991 2v3.132a.314.314 0 0 1-.555.201A9.97 9.97 0 0 0 11.986 2c-5.52 0-9.995 4.477-9.995 10c0 3.958 2.299 7.38 5.633 9m4.634 1q-.7 0-1.376-.091M21.728 8.667q.168.597.265 1.202m-.034 3.67q-.105.6-.274 1.186m-1.525 3.272q-.358.53-.774 1.018m-2.822 2.346q-.53.304-1.103.548',
        },
        children: [],
      },
    ],
  },
  success: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' },
        children: [
          {
            tag: 'path',
            attributes: {
              d: 'M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12s4.477 10 10 10s10-4.477 10-10Z',
            },
            children: [],
          },
          {
            tag: 'path',
            attributes: {
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              d: 'm8 12.5l2.5 2.5L16 9',
            },
            children: [],
          },
        ],
      },
    ],
  },
  warning: {
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
          'stroke-width': '1.5',
        },
        children: [
          {
            tag: 'path',
            attributes: {
              d: 'M13.925 21h-3.85c-4.63 0-6.945 0-7.799-1.506c-.853-1.506.331-3.503 2.7-7.495L6.9 8.753C9.176 4.918 10.313 3 12 3s2.824 1.918 5.1 5.753L19.023 12c2.369 3.992 3.553 5.989 2.7 7.495C20.87 21 18.555 21 13.924 21M12 9v4',
            },
            children: [],
          },
          {
            tag: 'path',
            attributes: { d: 'M12.125 16.75H12m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0' },
            children: [],
          },
        ],
      },
    ],
  },
  error: {
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
          'stroke-width': '1.5',
          d: 'M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12s4.477 10 10 10s10-4.477 10-10m-7 3L9 9m0 6l6-6',
        },
        children: [],
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
          'stroke-width': '1.5',
        },
        children: [
          { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' }, children: [] },
          {
            tag: 'path',
            attributes: { d: 'M12 16v-4m.125-3.75H12m.25 0a.25.25 0 1 0-.5 0a.25.25 0 0 0 .5 0' },
            children: [],
          },
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
        attributes: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' },
        children: [
          {
            tag: 'path',
            attributes: {
              d: 'M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10Z',
            },
            children: [],
          },
          {
            tag: 'path',
            attributes: {
              'stroke-linecap': 'round',
              d: 'M12 13a2 2 0 1 0 0-4a2 2 0 0 0 0 4Zm0 0v3',
            },
            children: [],
          },
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
          'stroke-width': '1.5',
          d: 'M18 6L6 18m12 0L6 6',
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
  search: { set: 'hugeicons', name: 'search01' },
  eye: { set: 'hugeicons', name: 'view' },
  'eye-off': { set: 'hugeicons', name: 'viewOff' },
  pipette: { set: 'hugeicons', name: 'colorPicker' },
  'rotate-ccw': { set: 'hugeicons', name: 'rotateCcw' },
  'rotate-cw': { set: 'hugeicons', name: 'rotateCw' },
  success: { set: 'hugeicons', name: 'checkmarkCircle02' },
  warning: { set: 'hugeicons', name: 'alert02' },
  error: { set: 'hugeicons', name: 'cancelCircle' },
  info: { set: 'hugeicons', name: 'informationCircle' },
  lock: { set: 'hugeicons', name: 'lock' },
  close: { set: 'hugeicons', name: 'cancel01' },
}
