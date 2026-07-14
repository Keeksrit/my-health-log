# Tests Screenshot Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom-nav "Tests" page where the user drops/adds multiple screenshots that upload to Supabase Storage and show up as a gallery, laid out as wide as the Nutrition page.

**Architecture:** A new `/tests` route renders a `Tests` page that reuses the Nutrition wide-breakout CSS pattern. Images go to a private Supabase Storage bucket `test-screenshots` (no DB table — the bucket's object list *is* the data). A thin data layer `src/lib/testScreenshots.ts` wraps `supabase.storage`, with pure filename/sort helpers unit-tested. A one-time SQL migration creates the bucket and its RLS policies.

**Tech Stack:** React 18 + TypeScript + Vite, `@supabase/supabase-js` v2 (Storage API), CSS Modules + CSS vars, react-router-dom v6, vitest (node env).

## Global Constraints

- Styling: CSS Modules + CSS vars only (`--bg`, `--card`, `--ink`, `--ink2`, `--accent`, `--red`, `--border`). No Tailwind.
- Supabase client is the existing singleton `src/lib/supabase.ts` (schema-pinned to `health`; Storage API is unaffected by that pin). Do NOT create a second client.
- RLS-only security model: authenticated-user-only; the migration grants `select, insert, delete` (no update) and adds an authenticated-only policy.
- Data-layer functions throw on Supabase error (mirror `supabase.ts`). Page-level fetches are best-effort: on failure `console.warn` and show empty state — never crash the page.
- Tests are vitest **node env** (no DOM). Only pure functions get unit tests; Supabase-calling functions and React components are not unit-tested (verified via `npm run build`).
- Build verification: `npm run build` (runs `tsc && vite build`) must be green. Test command: `npm test` (`vitest run`).
- Bucket name literal, used everywhere: `test-screenshots`.

---

### Task 1: Data layer — pure helpers (TDD)

**Files:**
- Create: `src/lib/testScreenshots.ts`
- Test: `src/lib/testScreenshots.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by Task 2 & Task 3):
  - `extForFile(file: { name?: string; type?: string }): string` — safe lowercase extension without a dot; falls back to `'png'`.
  - `buildFileName(originalName: string, timestamp: number, rand: string): string` — returns `` `${timestamp}-${rand}.${ext}` `` where `ext` comes from `extForFile({ name: originalName })`.
  - `sortByNewest(names: string[]): string[]` — returns a new array sorted descending by the leading numeric timestamp prefix (the part before the first `-`); names without a numeric prefix sort last, ties keep input order.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { extForFile, buildFileName, sortByNewest } from './testScreenshots'

describe('extForFile', () => {
  it('derives extension from the file name', () => {
    expect(extForFile({ name: 'Screenshot 2026.PNG' })).toBe('png')
    expect(extForFile({ name: 'scan.jpeg' })).toBe('jpeg')
  })

  it('falls back to png when there is no usable extension', () => {
    expect(extForFile({ name: 'noext' })).toBe('png')
    expect(extForFile({})).toBe('png')
    expect(extForFile({ name: '.hidden' })).toBe('png')
  })

  it('strips anything unsafe and lowercases', () => {
    expect(extForFile({ name: 'x.JP G' })).toBe('png') // space => not a clean ext
    expect(extForFile({ name: 'a.b.Webp' })).toBe('webp')
  })
})

describe('buildFileName', () => {
  it('builds timestamp-rand.ext', () => {
    expect(buildFileName('shot.png', 1700000000000, 'ab12')).toBe('1700000000000-ab12.png')
  })

  it('uses png fallback when name has no extension', () => {
    expect(buildFileName('noext', 42, 'zz')).toBe('42-zz.png')
  })
})

describe('sortByNewest', () => {
  it('sorts by leading timestamp descending', () => {
    expect(sortByNewest(['100-a.png', '300-c.png', '200-b.png']))
      .toEqual(['300-c.png', '200-b.png', '100-a.png'])
  })

  it('puts names without a numeric prefix last and does not mutate input', () => {
    const input = ['5-a.png', 'weird.png', '9-b.png']
    const out = sortByNewest(input)
    expect(out).toEqual(['9-b.png', '5-a.png', 'weird.png'])
    expect(input).toEqual(['5-a.png', 'weird.png', '9-b.png'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- testScreenshots`
Expected: FAIL — module `./testScreenshots` has no such exports (cannot resolve / not a function).

- [ ] **Step 3: Write minimal implementation (helpers only)**

Create `src/lib/testScreenshots.ts` with ONLY the pure helpers for now:

```typescript
import { supabase } from './supabase'

export const BUCKET = 'test-screenshots'

const EXT_RE = /^[a-z0-9]{1,5}$/

/** Safe, lowercase file extension (no dot). Falls back to 'png'. */
export function extForFile(file: { name?: string; type?: string }): string {
  const name = file.name ?? ''
  const dot = name.lastIndexOf('.')
  if (dot > 0 && dot < name.length - 1) {
    const ext = name.slice(dot + 1).toLowerCase()
    if (EXT_RE.test(ext)) return ext
  }
  return 'png'
}

/** `${timestamp}-${rand}.${ext}` — timestamp prefix enables newest-first sort. */
export function buildFileName(originalName: string, timestamp: number, rand: string): string {
  return `${timestamp}-${rand}.${extForFile({ name: originalName })}`
}

/** New array sorted newest-first by the numeric prefix before the first '-'. */
export function sortByNewest(names: string[]): string[] {
  const ts = (n: string): number => {
    const num = Number(n.slice(0, n.indexOf('-')))
    return Number.isFinite(num) ? num : -Infinity
  }
  return names
    .map((n, i) => ({ n, i }))
    .sort((a, b) => ts(b.n) - ts(a.n) || a.i - b.i)
    .map((x) => x.n)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- testScreenshots`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/testScreenshots.ts src/lib/testScreenshots.test.ts
git commit -m "feat: pure helpers for test-screenshot filenames and sorting"
```

---

### Task 2: Data layer — Supabase Storage functions

**Files:**
- Modify: `src/lib/testScreenshots.ts` (append the async functions)

**Interfaces:**
- Consumes: `BUCKET`, `buildFileName`, `extForFile`, `sortByNewest` (Task 1); `supabase` from `./supabase`.
- Produces (relied on by Task 3):
  - `type Screenshot = { path: string; url: string }`
  - `uploadScreenshot(file: File): Promise<void>` — uploads under a `buildFileName`-generated key; throws on error.
  - `listScreenshots(): Promise<Screenshot[]>` — lists the bucket, sorts newest-first, returns each with a signed URL; throws on error.
  - `deleteScreenshot(path: string): Promise<void>` — removes the object; throws on error.

- [ ] **Step 1: Add the async functions (no unit test — Supabase calls, verified via build + manual smoke)**

Append to `src/lib/testScreenshots.ts`:

```typescript
export type Screenshot = { path: string; url: string }

const SIGNED_URL_TTL = 60 * 60 // 1 hour

/** Short random suffix (no Math.random dependency issues in tests — this is runtime-only). */
function randSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

export async function uploadScreenshot(file: File): Promise<void> {
  const name = buildFileName(file.name, Date.now(), randSuffix())
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(name, file, { contentType: file.type || `image/${extForFile(file)}` })
  if (error) throw error
}

export async function listScreenshots(): Promise<Screenshot[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } })
  if (error) throw error
  const names = sortByNewest((data ?? []).map((o) => o.name))
  const out: Screenshot[] = []
  for (const path of names) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL)
    if (signErr || !signed) continue
    out.push({ path, url: signed.signedUrl })
  }
  return out
}

export async function deleteScreenshot(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run build`
Expected: PASS (tsc + vite build succeed). If it fails, fix type errors before continuing.

- [ ] **Step 3: Run the unit tests (ensure Task 1 tests still green)**

Run: `npm test -- testScreenshots`
Expected: PASS (unchanged — pure helpers untouched).

- [ ] **Step 4: Commit**

```bash
git add src/lib/testScreenshots.ts
git commit -m "feat: Supabase Storage upload/list/delete for test screenshots"
```

---

### Task 3: Tests page component + styles

**Files:**
- Create: `src/pages/Tests.tsx`
- Create: `src/pages/Tests.module.css`

**Interfaces:**
- Consumes: `Screenshot`, `uploadScreenshot`, `listScreenshots`, `deleteScreenshot` (Task 2).
- Produces: default-exported `Tests` React component (relied on by Task 4).

- [ ] **Step 1: Create the stylesheet**

Create `src/pages/Tests.module.css` (mirrors the Nutrition wide-breakout `.page`):

```css
/* Break out of the 430px app frame to match the Nutrition page width.
   position:fixed + left/right:0 + margin:auto centers a wide page and
   scrolls internally between the fixed header and nav (a transform here
   would trap the position:fixed lightbox rendered inside this page). */
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

.title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
}

.dropzone {
  border: 2px dashed var(--border);
  border-radius: 14px;
  background: var(--card);
  color: var(--ink2);
  padding: 28px 16px;
  text-align: center;
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.15s, background 0.15s;
}

.dropzoneActive {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--card));
}

.hint { display: block; margin-top: 4px; font-size: 12px; color: var(--ink2); }

.grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.tile {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--card);
  border: 1px solid var(--border);
}

.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
}

.del {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.placeholder { display: flex; align-items: center; justify-content: center; }

.spinner {
  width: 22px;
  height: 22px;
  border: 2.5px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.empty { margin-top: 20px; color: var(--ink2); font-size: 14px; text-align: center; }

.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  cursor: zoom-out;
}

.lightboxImg { max-width: 92vw; max-height: 92vh; object-fit: contain; }

.lightboxClose {
  position: fixed;
  top: 16px;
  right: 20px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
}
```

- [ ] **Step 2: Create the component**

Create `src/pages/Tests.tsx`:

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { listScreenshots, uploadScreenshot, deleteScreenshot, type Screenshot } from '../lib/testScreenshots'
import styles from './Tests.module.css'

export default function Tests() {
  const [shots, setShots] = useState<Screenshot[]>([])
  const [pending, setPending] = useState(0) // in-flight upload count
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      setShots(await listScreenshots())
    } catch (e) {
      console.warn('listScreenshots failed', e)
      setShots([])
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    setPending((n) => n + images.length)
    await Promise.all(
      images.map(async (f) => {
        try {
          await uploadScreenshot(f)
        } catch (e) {
          console.warn('uploadScreenshot failed', e)
        } finally {
          setPending((n) => Math.max(0, n - 1))
        }
      }),
    )
    await reload()
  }, [reload])

  // Paste screenshots from clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) handleFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFiles])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  const remove = async (path: string) => {
    try {
      await deleteScreenshot(path)
      setShots((prev) => prev.filter((s) => s.path !== path))
    } catch (e) {
      console.warn('deleteScreenshot failed', e)
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Tests</h1>

      <div
        className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        Tap to add screenshots
        <span className={styles.hint}>or drop / paste them here</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />

      {shots.length === 0 && pending === 0 ? (
        <p className={styles.empty}>No screenshots yet.</p>
      ) : (
        <div className={styles.grid}>
          {Array.from({ length: pending }).map((_, i) => (
            <div key={`p${i}`} className={`${styles.tile} ${styles.placeholder}`}>
              <div className={styles.spinner} />
            </div>
          ))}
          {shots.map((s) => (
            <div key={s.path} className={styles.tile}>
              <img className={styles.thumb} src={s.url} alt="" onClick={() => setZoom(s.url)} />
              <button className={styles.del} onClick={() => remove(s.path)} aria-label="Delete">×</button>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className={styles.lightbox} onClick={() => setZoom(null)}>
          <button className={styles.lightboxClose} aria-label="Close">×</button>
          <img className={styles.lightboxImg} src={zoom} alt="" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: PASS. (The component isn't routed yet, but tsc still type-checks the file since it's imported nowhere — confirm no TS errors in `Tests.tsx`. If tsc skips unimported files, Task 4's build will catch it; still run here.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Tests.tsx src/pages/Tests.module.css
git commit -m "feat: Tests page with dropzone, gallery, and lightbox"
```

---

### Task 4: Wire up nav + route

**Files:**
- Modify: `src/App.tsx` (import + route)
- Modify: `src/components/layout/BottomNav.tsx` (nav item)

**Interfaces:**
- Consumes: default `Tests` export (Task 3).
- Produces: reachable `/tests` route + bottom-nav entry.

- [ ] **Step 1: Add the import and route in `src/App.tsx`**

Add with the other page imports (after the `Nutrition` import line):

```tsx
import Tests from './pages/Tests'
```

Add the route inside `<Routes>` (after the `/nutrition` route line):

```tsx
<Route path="/tests"       element={<Tests />} />
```

- [ ] **Step 2: Add the nav item in `src/components/layout/BottomNav.tsx`**

Insert this `NavLink` after the `/nutrition` `NavLink` block and before the Symptom `<button>`:

```tsx
<NavLink to="/tests"        className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
  <span className={styles.icon}>🧪</span>
  <span className={styles.label}>Tests</span>
</NavLink>
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS (tsc + vite). This is the real type-check of `Tests.tsx` now that it's imported.

- [ ] **Step 4: Manual visual check (dev server)**

Run: `npm run dev`, open the app, confirm: a 🧪 Tests item appears in the bottom nav (7 items fit; if visibly cramped, note it — shortening a label is acceptable), clicking it shows the Tests page at the same width as Nutrition, and the dropzone renders. (Uploads won't work until Task 5's migration is run — that's expected.)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/BottomNav.tsx
git commit -m "feat: add Tests page to nav and routing"
```

---

### Task 5: Storage migration (manual deploy step)

**Files:**
- Create: `migrations/2026-07-14-test-screenshots-storage.sql`

**Interfaces:**
- Consumes: nothing (SQL, run manually in Supabase SQL editor).
- Produces: the private `test-screenshots` bucket + `authenticated`-only RLS policies making Task 2's functions work against the live project.

- [ ] **Step 1: Create the migration file**

Create `migrations/2026-07-14-test-screenshots-storage.sql`:

```sql
-- Storage bucket for the "Tests" page: screenshots of medical test results.
-- Private bucket (health data) — the app displays images via short-lived signed
-- URLs. No DB table; the bucket's object list is the data.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

-- 1. Private bucket.
insert into storage.buckets (id, name, public)
values ('test-screenshots', 'test-screenshots', false)
on conflict (id) do nothing;

-- 2. RLS-only security: authenticated-user-only access to objects in this
-- bucket. Only select/insert/delete are used (upload = insert new object,
-- delete = remove; objects are never updated in place), so no update policy.
drop policy if exists test_screenshots_select on storage.objects;
create policy test_screenshots_select
  on storage.objects for select to authenticated
  using (bucket_id = 'test-screenshots' and auth.role() = 'authenticated');

drop policy if exists test_screenshots_insert on storage.objects;
create policy test_screenshots_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'test-screenshots' and auth.role() = 'authenticated');

drop policy if exists test_screenshots_delete on storage.objects;
create policy test_screenshots_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'test-screenshots' and auth.role() = 'authenticated');
```

- [ ] **Step 2: Commit**

```bash
git add migrations/2026-07-14-test-screenshots-storage.sql
git commit -m "feat: storage migration for test-screenshots bucket"
```

- [ ] **Step 3: Deploy note (record, do not automate)**

This SQL must be run once in the Supabase SQL editor before the feature works end-to-end. `storage.objects` already has RLS enabled by default in Supabase, so no `enable row level security` is needed. Until it's run, the Tests page renders but list/upload/delete fail best-effort (empty gallery, `console.warn`).

---

### Task 6: End-to-end verification (after migration is run)

**Files:** none (verification only).

- [ ] **Step 1: Full build + tests**

Run: `npm run build && npm test`
Expected: build green, all tests pass (including `testScreenshots` helper tests).

- [ ] **Step 2: Manual smoke test (requires Task 5 migration applied in Supabase)**

With `npm run dev`: on the Tests page — (a) click the dropzone and pick 2+ images → they appear in the grid newest-first; (b) reload the page → they persist; (c) click a thumbnail → lightbox opens, click backdrop → closes; (d) click ✕ on a tile → it disappears; (e) drag-drop an image file onto the box → it uploads. Confirm the page width matches Nutrition.

- [ ] **Step 3: Update project memory**

Add a note to the health-log memory summarizing the feature and its manual deploy step (bucket + policies), consistent with how prior features are recorded.

---

## Self-Review

**Spec coverage:**
- Nav item "Tests" → Task 4. ✓
- `/tests` route → Task 4. ✓
- Wide-as-Nutrition layout → Task 3 (`.page` breakout CSS). ✓
- Drop / tap / paste multiple screenshots → Task 3 (`handleFiles`, input, drop, paste). ✓
- Screenshots show up (gallery, newest-first, lightbox, delete, in-flight tiles) → Task 3. ✓
- Supabase private bucket + signed URLs → Task 2 + Task 5. ✓
- Data layer `listScreenshots`/`uploadScreenshot`/`deleteScreenshot` + pure helpers unit-tested → Task 1 + Task 2. ✓
- Manual migration (bucket + authenticated-only select/insert/delete policies) → Task 5. ✓
- Best-effort fetch (warn, never crash) → Task 3. ✓
- Verification via `npm run build` + unit tests → Task 6. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — all code is inline and complete.

**Type consistency:** `Screenshot = { path; url }`, `BUCKET`, `buildFileName`, `extForFile`, `sortByNewest`, `uploadScreenshot(file)`, `listScreenshots()`, `deleteScreenshot(path)` are named identically across Tasks 1–3. Nav/route strings `/tests` and label `Tests` consistent across Task 4. Bucket literal `test-screenshots` consistent across Tasks 2 & 5.
