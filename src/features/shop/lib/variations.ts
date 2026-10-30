import { formatDuration } from './formatDuration'

export type VariationAxis = { name: string; options: string[] }
export type VariantOptions = { option_values?: string[] | null; account_type: string; duration_days: number }

export function variantLabel(variant: VariantOptions): string {
  return variant.option_values?.length
    ? variant.option_values.join(' · ')
    : `${variant.account_type === 'private' ? 'Private' : 'Sharing'} · ${formatDuration(variant.duration_days)}`
}

export function combinations(axes: VariationAxis[]): string[][] {
  if (!axes.length) return []
  return axes.reduce<string[][]>((rows, axis) =>
    rows.flatMap((row) => axis.options.map((option) => [...row, option])), [[]])
}
