export interface ToggleInput {
  readonly on: boolean
  readonly large: boolean
}

export const isOn = (input: ToggleInput): boolean => input.on

export const isLarge = (input: ToggleInput): boolean => input.large
