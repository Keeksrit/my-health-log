# Tests screenshot page — design

**Date:** 2026-07-14
**Status:** Approved (design), pending spec review

## Goal

Add a new **Tests** page to the health-log app, reachable from the bottom nav.
The page is intentionally minimal: one box to drop/add multiple screenshots, and
the screenshots show up below it as a gallery. The page is as wide as the
Nutrition page (breaks out of the 430px app frame).

Primary use: keep photos/screenshots of medical test results in one place.

## Non-goals (YAGNI)

- No grouping, tagging, dates, titles, or per-test folders — flat gallery only.
- No editing/annotation of images.
- No captions or notes.
- No pagination (a simple full list is fine for a single user's test screenshots).

## Navigation & routing

- `BottomNav.tsx`: add a 7th `NavLink` — icon 🧪, label **Tests**, `to="/tests"`,
  placed after Nutrition (before the Symptom button). Follows the existing
  `NavLink` + `styles.btn`/`styles.active` pattern.
- `App.tsx`: import `Tests`, add `<Route path="/tests" element={<Tests />} />`.
- 7 items on a 430px bar is tighter but acceptable; verify visually during build.
  If cramped, shorten a label rather than dropping an item.

## Page layout & width

New files: `src/pages/Tests.tsx` + `src/pages/Tests.module.css`.

Reuse the Nutrition wide-breakout pattern so the page matches Nutrition's width:

```css
.page {
  box-sizing: border-box;
  position: fixed;
  top: var(--header-h);
  bottom: var(--nav-h);
  left: 0;
  right: 0;
  width: min(100vw, 1290px);
  margin: 0 auto;
  overflow-y: auto;
  padding: 16px 20px 24px;
}
```

Uses the shared CSS vars (`--bg`, `--card`, `--ink`, `--ink2`, `--accent`,
`--red`, `--border`). No Tailwind.

### Components on the page

1. **Dropzone box** (top): a bordered, rounded card, full width, comfortable
   height, with hint text ("Tap to add screenshots, or drop / paste them here").
   Interactions:
   - **Click/tap** → opens a hidden `<input type="file" accept="image/*" multiple>`
     (primary path on mobile — drag-drop does not exist on phones).
   - **Drag & drop** → `onDragOver`/`onDrop` accept dropped image files (laptop).
     Show an active/highlight state while dragging over.
   - **Paste** → a `paste` listener grabs image blobs from the clipboard.
   - All three funnel into one `handleFiles(FileList | File[])`.
   - Non-image files are ignored.

2. **Gallery grid** (below): responsive grid of thumbnails, **newest first**.
   - `display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`.
   - Each tile: the image (`object-fit: cover`), a small **✕ delete** button
     (top-right, appears/tappable), and click on the image opens the lightbox.
   - **In-flight uploads** render as placeholder tiles with a spinner until the
     upload resolves and the real thumbnail replaces them.
   - Empty state: a short muted line ("No screenshots yet.").

3. **Lightbox**: clicking a thumbnail opens a full-size overlay (dark backdrop,
   image centered, click backdrop or ✕ to close). Simple fixed overlay rendered
   inside the page.

## Storage design

**Bucket:** private bucket named `test-screenshots`. Private (not public) because
these are medical screenshots; images are shown via short-lived **signed URLs**.

Supabase Storage has its own API (`supabase.storage.from(bucket)`) and is
**not** affected by the client's `db: { schema: 'health' }` pin, so the existing
singleton client in `src/lib/supabase.ts` is reused as-is.

**File naming:** `${timestamp}-${rand}.${ext}` where `timestamp` is ms since
epoch, `rand` is a short random suffix, `ext` derived from the file's MIME/name.
The timestamp prefix makes newest-first ordering a plain string sort with no DB.

**No database table.** The bucket's object list *is* the data. Ordering and
identity come from the filename + the list API's metadata.

### Data layer — `src/lib/testScreenshots.ts`

Mirrors the style of `supabase.ts` (thin async functions that throw on error):

- `buildFileName(originalName: string, timestamp: number, rand: string): string`
  — **pure**, unit-tested. Produces `${timestamp}-${rand}.${ext}`, sanitized.
- `extForFile(file): string` — **pure**, unit-tested (derive a safe extension;
  fall back to `png`).
- `sortByNewest(names: string[]): string[]` — **pure**, unit-tested (descending
  by the timestamp prefix).
- `uploadScreenshot(file: File): Promise<void>` — `storage.from('test-screenshots')
  .upload(name, file, { contentType })`.
- `listScreenshots(): Promise<{ path: string; url: string }[]>` — `list()` then
  `createSignedUrl` per object (or `createSignedUrls` batch), sorted newest-first.
- `deleteScreenshot(path: string): Promise<void>` — `storage.from(...).remove([path])`.

The pure helpers get tests (`src/lib/testScreenshots.test.ts`, vitest node env,
matching the repo convention). The Supabase-calling functions are not unit-tested,
consistent with the rest of the data layer.

### Page state / data flow

- On mount: `listScreenshots()` → set gallery state. Best-effort: on failure,
  `console.warn` and show empty state (page never crashes), consistent with the
  app's best-effort fetch pattern elsewhere.
- `handleFiles`: for each image file, add an optimistic in-flight tile, call
  `uploadScreenshot`, then on success refresh (or insert the resolved thumbnail).
  On failure, drop the in-flight tile and `console.warn`.
- Delete: call `deleteScreenshot(path)`, then remove from state.

## Manual deploy step (feature inert until done)

Add `migrations/2026-07-14-test-screenshots-storage.sql`, run once in the
Supabase SQL editor. It must:

1. Create the private bucket:
   `insert into storage.buckets (id, name, public) values
   ('test-screenshots','test-screenshots', false) on conflict (id) do nothing;`
2. Add RLS policies on `storage.objects` scoped to
   `bucket_id = 'test-screenshots'` granting **authenticated** users
   `select`, `insert`, and `delete` (no update needed — uploads are new objects,
   deletes are removals). This matches the app's RLS-only, single-authenticated-
   user model.

Until this is run, the page renders but `list`/`upload`/`delete` fail
best-effort (empty gallery, warns in console).

## Testing / verification

- Unit tests for the pure helpers in `testScreenshots.test.ts`.
- `npm run build` (tsc + vite) must be green — the repo's standard UI
  verification (no React component test infra).
- Manual smoke after the migration: drop a screenshot, confirm it appears,
  reload to confirm persistence, confirm it shows on a second device, delete it.

## Files touched

- `src/components/layout/BottomNav.tsx` — add Tests nav item.
- `src/App.tsx` — import + route.
- `src/pages/Tests.tsx` — new page.
- `src/pages/Tests.module.css` — new styles.
- `src/lib/testScreenshots.ts` — new data layer.
- `src/lib/testScreenshots.test.ts` — new unit tests.
- `migrations/2026-07-14-test-screenshots-storage.sql` — new manual deploy step.
