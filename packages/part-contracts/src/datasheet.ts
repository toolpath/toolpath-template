/**
 * Reading a feature's datasheet, with no opinion about how it is shown.
 *
 * Separate from `report.ts` because that module needs `@toolpath/viewer` for
 * direction comparison, and a viewer installs camera controls against a DOM the
 * moment it loads. A Hono server and a tool-fit calculation both need these
 * readers and neither can afford that import.
 */
import type { FeatureDatasheetFacts } from '@toolpath/api'
import type { PartFeature } from './contracts.js'

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

export const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export const facts = (feature: PartFeature): FeatureDatasheetFacts | null =>
  feature.datasheet?.facts ?? null
