# Part Tool Table Plan

## Goal

Replace the native tool tables on the catalog application's post-upload part
screen with `@toolpath/ui`'s `Table`. The new table must provide the same
sorting, virtualized rendering, selection, and keyboard navigation behavior as
the table used in `toolpath_ui`.

The former standalone catalog route was removed. Keep the native `ToolTable`
until the part-table migration replaces its active use.

## Scope

The change applies only to `apps/catalog/app/routes/part.tsx` and both tool
list contexts it renders:

- The normal compatible-tools list.
- The tap list for threaded holes.

The existing part viewer rail will be removed. Its controls move into the tool
table toolbar:

- **Filters** contains the existing catalog-specific filters: material,
  vendor, family, product line, tool type, flute count, shank, holder, collet,
  diameter, and flute length.
- **Matching settings** contains floor-radius allowance, minimum clamping
  length, and drill deviation. These alter compatibility calculations rather
  than filtering rows, so they remain visually distinct from Filters.

## Filter Contract

Keep the catalog's existing query model and filter semantics. Do not replace
them with the generic condition-builder implementation from `toolpath_ui`.

- Filter state remains URL-backed through `ToolQuery` and `searchWithQuery`.
- Preserve facet counts, saved filters, vendor-scoped family and product-line
  options, unit conversion, and the existing holder/collet single-choice
  behavior.
- Reuse the current catalog filter controls in a table-toolbar popover rather
  than copying `DynamicTable` or `FilterableTable`; those components are
  private to the `toolpath_ui` application and are not package exports.

## Table Implementation

- Add a UI-table implementation used by the part screen only. Keep the
  existing native `ToolTable` until the migration replaces its active use.
- Use the exported `Table` compound component from the already pinned
  `@toolpath/ui@0.1.1`; no dependency update is needed.
- Keep the current part-table cells and behaviors: dynamic columns and column
  picker, geometry marks, holder/collet selectors, BOM state, and tool-detail
  selection.
- Use the UI table's sortable headers and virtualized rendering instead of the
  manual `SortButton`, route-owned sort state, and 200-row truncation.
- Adapt each `CatalogTool` to the UI table's required `id` contract using its
  `guid`.
- Bridge UI table selection to the existing `chosenTool` state so row clicks
  and Arrow Up/Arrow Down update the part-side tool details.
- Prevent links, holder/collet controls, and BOM controls from bubbling into
  row selection.

## Keyboard Boundary

The part route currently owns document-level Escape and Arrow Up/Arrow Down
handlers for feature navigation. Scope those handlers away from the table so a
focused UI table exclusively owns Arrow Up/Arrow Down and Escape. Otherwise a
single keypress would advance both a feature and a tool row.

## Verification

- Add component coverage for UI-table sorting, keyboard row selection, filter
  toolbar behavior, matching-settings behavior, and interactive row controls.
- Update the part-screen Playwright coverage to confirm filters and matching
  settings no longer overlay the viewer and remain usable from the table
  toolbar.
- Run the focused catalog test suite first, then the relevant typecheck, lint,
  and part-screen end-to-end coverage.
