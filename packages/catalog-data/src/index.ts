export {
  CATALOG_VERSION,
  GEOMETRY_FIELDS,
  type Catalog,
  type CatalogTool,
  type Facets,
  type GeometryField,
  type Provenance,
  type RangeAxis,
  type TermAxis,
  type ToolFamily,
  MATERIAL_GROUPS,
  type ToolType,
  type UnitSystem,
} from './types.js'
export {
  IngestError,
  ingest,
  type Ingested,
  type IngestNote,
  type Scrape,
  type ScrapedFamily,
  type ScrapedTool,
  type ScrapedUnit,
} from './ingest.js'
export {
  CatalogBuildError,
  buildCatalog,
  withDerived,
  undefinedGeometryCodes,
  type CatalogInput,
  type FamilyInput,
} from './build.js'
export { facetsFor } from './facets.js'
export {
  NO_PROFILES,
  PROFILES_VERSION,
  belowGageLine,
  ingestProfiles,
  profileFor,
  type HolderProfile,
  type ProfileDatum,
  type ProfilePoint,
  type Profiles,
} from './profiles.js'
export {
  demandOf,
  demandsOf,
  fitAgainst,
  fitTools,
  toolsForFeatures,
  type DemandContext,
  type FeatureDemand,
  type FitFailure,
  type ToolFit,
} from './fit.js'
export {
  assembliesFor,
  canHold,
  colletFitsHolder,
  gripRanges,
  gripsAnyShank,
  gripsShank,
  holderTakesTool,
  maxStickout,
  defaultStickout,
  stickoutLimits,
  holdBand,
  type HoldBand,
  withStickout,
  type Assembly,
  type Clamping,
  type Collet,
  type Contact,
  type GripRanges,
  type Holder,
  type StickoutLimits,
} from './toolholding.js'
/**
 * The one owner of "how far does this tool stand out of its holder".
 *
 * `geometry.LBH`, `Assembly.stickout` and the reach ceiling are all this one
 * function with different arguments — see the table at the top of
 * `stickout.ts` for the four unreconciled derivations it replaced.
 */
export {
  DEFAULT_STICKOUT_POLICY,
  HELD_SHARE,
  minStickout,
  setupStickout,
  stickoutCeiling,
  stickoutRange,
  type StickoutLimit,
  type StickoutPolicy,
  type StickoutRange,
  type StickoutRequest,
  type StickoutTool,
} from './stickout.js'
export {
  NOT_MODELLED,
  assembliesForFeatures,
  assemblyAgainst,
  unholdableTools,
  type AssemblyFit,
} from './assembly-fit.js'
export {
  PASSES,
  mapTool,
  mappingFor,
  passProgress,
  planProgress,
  strayMappings,
  toolsInPlan,
  unmap,
  unmappedFeatures,
  type Mapping,
  type Pass,
  type PassProgress,
  type Plan,
} from './mapping.js'
export {
  NO_PREFERENCES,
  materialStanding,
  preferredFor,
  recommend,
  recommended,
  togglePreferred,
  type MaterialStanding,
  type Preferences,
  type Recommendation,
} from './preferences.js'
export {
  MILLING_FORMS,
  TOOL_FORMS,
  isToolForm,
  hasNeck,
  shankOf,
  type Shank,
  type ToolForm,
} from './forms.js'
export type { ToolInput } from './types.js'
export {
  clearance,
  NO_MARGINS,
  type Margins,
  describeCollision,
  heightAt,
  toolCollisions,
  toolSilhouette,
  type Clearance,
  type Collision,
  type Silhouette,
  type SilhouettePart,
} from './clearance.js'
export { materialProfile, type OutlinePoint } from './outline.js'
/**
 * `clampWanted` is deliberately not re-exported: turning a clamping length into
 * a stickout is `stickout.ts`'s job and nobody else's — `NO_CLAMP_MATH` in
 * `eslint.config.js` says why. Ask `setupStickout` or `stickoutCeiling`.
 */
export {
  DEFAULT_CLAMPING,
  clampShortfall,
  headLength,
  heldDiameter,
  type ClampingRule,
} from './clamping.js'

export {
  HOLDER_AXES,
  applicableFilters,
  axisConstrains,
  collapse,
  colletsFor,
  colletsForShank,
  compareHolders,
  holderFacet,
  holderCanTake,
  holderNeedsCollet,
  holdersFor,
  holdersToShow,
  seriesUnstocked,
  isOnSize,
  matchesFilters,
  seriesSize,
  type HolderAxis,
  type HolderFilters,
} from './assembly-picking.js'
export {
  axisApplies,
  buildParamNames,
  emptyBuildSelection,
  fromBuildParams,
  holderFiltersFrom,
  selectCollet,
  selectHolder,
  toBuildParams,
  toggleBuildTerm,
  withBuildStickout,
  writeBuildParams,
  type BuildSelection,
} from './assembly-selection.js'

export {
  sectionOutline,
  FLOOR_BAND,
  REACH,
  type FeatureSection,
  type Section,
  type SectionKind,
  type SectionPoint,
} from './section.js'
