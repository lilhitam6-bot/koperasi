# LendMap MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, testable LendMap MVP that demonstrates the v1.0 core workflows while keeping Supabase integration boundaries explicit.

**Architecture:** The MVP uses Next.js App Router with a client-side operational workspace backed by seeded local state. Pure business logic lives in `src/lib`, shared contracts live in `src/types`, and Supabase-dependent production work is documented as the next integration phase.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Vitest, lucide-react.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`

- [ ] Add scripts for `dev`, `build`, `lint`, `test`, and `typecheck`.
- [ ] Configure strict TypeScript and path alias `@/*`.
- [ ] Configure Tailwind content paths.

### Task 2: Domain Contracts And Tests

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/domain.test.ts`
- Create: `src/lib/domain.ts`

- [ ] Write failing tests for scoring, payment status, dashboard summaries, and offline queue projection.
- [ ] Implement only the pure logic needed for those tests.
- [ ] Run `npm run test`.

### Task 3: MVP Application

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/components/lendmap-app.tsx`
- Create: `src/data/seed.ts`

- [ ] Build the role-aware owner/surveyor workspace.
- [ ] Include map tracker, nasabah list, setoran input, owner dashboard, export CSV, offline indicator, and audit feed.
- [ ] Keep business logic out of JSX by calling `src/lib/domain.ts`.

### Task 4: PWA And Documentation

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/icon.svg`
- Create: `.env.local.example`
- Modify: `README.md`
- Modify: `08-CHANGELOG.md`

- [ ] Add manifest and app metadata.
- [ ] Document demo login model and Supabase integration gap.
- [ ] Update changelog with implemented MVP work only.

### Task 5: Verification

- [ ] Run `npm run test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Fix failures until all commands pass.
