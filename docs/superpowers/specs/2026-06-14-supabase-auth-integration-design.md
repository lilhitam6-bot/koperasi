# Supabase Auth Integration Design

## Goal

Connect the existing LendMap MVP shell to Supabase Auth so the app uses the signed-in user's real `profiles.role` instead of the demo role switcher, while keeping seeded operational data in place for this integration step.

## Scope

This step covers authentication, profile bootstrap, route protection, logout, and inactive-profile handling. It does not replace seeded marker, nasabah, setoran, audit, storage, or offline queue flows with Supabase CRUD yet.

## Architecture

- `/login` is a client page with an email/password form that calls Supabase Auth through the browser client.
- `middleware.ts` refreshes Supabase auth state and redirects unauthenticated users away from protected app routes.
- The root page remains a server component. It reads the current session, fetches the matching row from `public.profiles`, blocks inactive profiles, and passes the active profile into `LendMapApp`.
- `LendMapApp` receives `currentProfile` and derives role/view access from it. The header removes the demo owner/surveyor switch and adds a logout action.
- `/unauthorized` gives a clear stop state for missing or inactive profiles.

## Data Flow

1. User signs in at `/login`.
2. Supabase stores auth cookies through `@supabase/ssr`.
3. Middleware refreshes the session on navigation.
4. `/` fetches `auth.getUser()` and `profiles`.
5. Active owners see the dashboard first; active surveyors see the map first.
6. Logout signs out through Supabase and returns the user to `/login`.

## Error Handling

- Missing Supabase environment variables keep using the existing clear env errors.
- Invalid login credentials show an inline form error.
- Missing or inactive profile redirects to `/unauthorized`.
- Logout failures show an inline header error and keep the user on the current page.

## Testing

- Add tests for pure auth route/profile helpers.
- Keep existing Supabase env and migration tests.
- Run targeted tests first, then `npm run test`, `npm run lint`, and `npm run typecheck`.
