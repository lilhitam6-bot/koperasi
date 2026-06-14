# Supabase Auth Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Supabase email/password login, session protection, profile role bootstrap, and logout for the existing LendMap shell.

**Architecture:** Keep the MVP operational data seeded for now, but move identity and role selection to Supabase. Use small testable helpers for route classification and profile validation, with Next pages/middleware as thin integration layers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, `@supabase/ssr`, `@supabase/supabase-js`, Vitest.

---

### Task 1: Auth Route And Profile Helpers

**Files:**
- Create: `src/lib/auth.ts`
- Test: `src/lib/auth.test.ts`

- [ ] Write tests for public/protected route classification and active profile validation.
- [ ] Run the targeted test and confirm it fails because `src/lib/auth.ts` does not exist.
- [ ] Implement `isPublicAuthPath`, `getPostLoginPath`, and `requireActiveProfile`.
- [ ] Run the targeted test and confirm it passes.

### Task 2: Supabase Middleware

**Files:**
- Create: `middleware.ts`

- [ ] Add middleware that creates a Supabase server client from `NextRequest` cookies.
- [ ] Redirect unauthenticated users from protected routes to `/login?next=<path>`.
- [ ] Redirect authenticated users away from `/login` to `/`.
- [ ] Exclude static assets and Next internals through `config.matcher`.

### Task 3: Login And Unauthorized Pages

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/login-form.tsx`
- Create: `src/app/unauthorized/page.tsx`

- [ ] Add a login page that renders a focused email/password form.
- [ ] Use `createLendMapBrowserClient().auth.signInWithPassword`.
- [ ] Redirect to the `next` query string if it is an internal path, otherwise `/`.
- [ ] Add inactive/missing profile stop page at `/unauthorized`.

### Task 4: Server Bootstrap And App Shell

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/lendmap-app.tsx`

- [ ] Fetch the authenticated Supabase user and matching profile in `src/app/page.tsx`.
- [ ] Redirect unauthenticated users to `/login` and inactive/missing profiles to `/unauthorized`.
- [ ] Pass `currentProfile` into `LendMapApp`.
- [ ] Remove demo role switching and derive the role from `currentProfile.role`.
- [ ] Add Supabase logout in the header.

### Task 5: Verification

**Files:**
- Existing test, lint, and typecheck configuration.

- [ ] Run `npm run test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Report any remaining setup requirements, especially missing `.env.local` values.
