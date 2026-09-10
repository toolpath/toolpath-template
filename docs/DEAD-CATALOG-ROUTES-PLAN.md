# Dead Catalog Routes Cleanup Plan

## Goal

Remove the catalog application's unused standalone browsing and tool-detail
flows. The active product starts from a part and provides tool details,
assembly selection, and drawing in the part screen's right panel.

## Routes To Remove

- `/catalog`, registered as `routes/home.tsx`.
- `/tools/:guid`, registered as `routes/tool.tsx`.

Neither route will have an in-application entry point after this cleanup. The
tool-detail page duplicates the active part screen's tool detail, holder/collet
assembly picker, and drawing workflow.

## Removal Set

1. Remove the two route registrations from `apps/catalog/app/routes.ts`.
2. Delete `apps/catalog/app/routes/home.tsx`.
3. Delete `apps/catalog/app/routes/tool.tsx`.
4. Delete code exclusively owned by the standalone tool-detail route:
   - `components/assembly-picker.tsx`
   - `components/drawing-card.tsx`
   - `components/tool-sheet.tsx`
   - `shared/use-build-selection.ts`
   - Their focused tests.
5. Remove the now-unused `searchableTools` export from `shared/catalog.ts`.
6. Remove the standalone catalog browser and tool-detail assertions from
   `apps/catalog/tests/catalog.spec.ts`. Preserve or replace the clean-path
   reload coverage with an active `/parts/:partId` route.
7. Remove stale comments and documentation that say `/catalog` or
   `/tools/:guid` is available, including `AGENTS.md`, the catalog README,
   `TOOL-CATALOG-PLAN.md`, `TOOL-DRAWING-PLAN.md`, and
   `PART-TOOL-TABLE-PLAN.md`.

## Boundaries To Preserve

- Do not remove the SPA `index.html` fallback. Active `/parts/:partId` and
  `/parts/:partId/order-list` URLs still require clean-path reload support.
- Do not remove the active part-screen table, filter, matching, holder, collet,
  drawing, or order-list code.
- Do not remove shared catalog data, filters, holding logic, or the native
  `ToolTable` until the part-table migration has replaced its active use.

## Verification

- Search for removed route paths and deleted module imports across the
  repository; remaining references must be intentional historical prose only.
- Run the focused catalog unit tests and route type generation/typecheck.
- Run the catalog Playwright suite, including a reload of an active part route.
- Run lint and the repository checks appropriate to the changed application.
