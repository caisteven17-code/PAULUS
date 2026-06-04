# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Financial analytics system for the **Diocese of San Pablo** — tracks financial health of parishes, schools, and seminaries with role-based dashboards, data submission, projects/donations, a geospatial heat map, a "Digital Twin" simulation mode, and an AI chatbot. It is a capstone prototype, so several layers fall back to mock/localStorage data when Supabase or API keys are absent.

## Monorepo layout

npm workspaces with two packages under `src/`:

- `src/frontend` — Next.js 16 (App Router) + React 19 + Tailwind. Most of the actual app is a client-side SPA in `src/frontend/src/`.
- `src/backend` — NestJS 11 microservices (TypeScript, compiled with `tsc`).

All packages read from a **single root `.env`** (every script runs through `dotenv -e ../../.env`). Despite `.env.example` mentioning `.env.local`, the working file is `.env` at the repo root.

## Commands

Run from the repo root unless noted.

```bash
npm install                 # installs all workspaces

npm run dev                 # frontend + all backend services concurrently
npm run dev:frontend        # Next.js dev server on :3000
npm run dev:backend         # builds backend, then runs all 6 node services

npm run build               # build frontend then backend
npm run build:backend       # tsc -p src/backend/tsconfig.json  → src/backend/dist
npm run build:frontend      # next build

npm run start               # production: run built frontend + backend
npm run docker:up           # docker compose up --build
```

Frontend lint (only configured linter in the repo):
```bash
npm run lint --workspace=src/frontend
```

**Testing:** there is no configured test runner. `@testing-library/*` is installed but unused. The `test-*.js` / `check-*.js` / `sync-*.js` / `geocode-*.cjs` files at the repo root are standalone diagnostic scripts run directly with `node` (they parse the root `.env` themselves), e.g. `node test-db.js`.

## Architecture — the parts that span multiple files

### Frontend is an SPA wrapped in Next.js
`app/page.tsx` does `dynamic(() => import('../src/App'), { ssr: false })`. So:
- The **App Router `app/` directory is just a shell** — its only real job is the `app/api/**/route.ts` handlers.
- **All UI lives in `src/frontend/src/`**: `views/` (top-level pages), `components/`, `hooks/`, `lib/`. There is no Next.js routing for pages — navigation is `activeTab` state in `src/App.tsx`, which is a large switch on tab + role.
- `next.config.ts` sets `typescript.ignoreBuildErrors: true`, so TS errors will NOT fail the build. Run lint / check types deliberately.

### Two proxy hops on every data call
```
Browser → apiClient (src/lib/api-client.ts)
        → Next.js route handler (app/api/**/route.ts)
        → proxyToBackend (src/lib/backend-proxy.ts)   [BACKEND_PROXY_BASE_URL, default http://127.0.0.1:4000/api]
        → NestJS API Gateway  (:4000)
        → requestDownstream → downstream microservice
        → Supabase
```
- `apiClient` is the single frontend entry point for data; views call it, never `fetch` to the backend directly. It preserves the old `dataService` interface and fakes realtime via polling (`createPoller`, 30s).
- Next API routes are thin — they almost always just call `proxyToBackend` with a path. Add `export const dynamic = 'force-dynamic'` to route handlers that proxy (see existing ones).

### Backend has a monolith AND a microservices split — the microservices are what run
- Business logic lives once in `src/backend/src/services/*.service.ts` and `src/backend/src/controllers/*.controller.ts`. `app.module.ts` wires these as a single monolith (not used by the run scripts).
- The deployed shape is `src/backend/src/apps/*`: an **api-gateway** plus five domain services (**auth, entity, financial, project, analytics**), each its own NestJS app with its own `main.ts` + `*.module.ts`. The domain service modules import the shared `services/` providers.
- Ports come from `shared/http/service-urls.ts`: gateway 4000, auth 4101, entity 4102, financial 4103, project 4104, analytics 4105 (override via `*_SERVICE_PORT` / `*_SERVICE_URL` env vars).
- Gateway controllers (`apps/api-gateway/controllers/*-gateway.controller.ts`) forward requests to downstream services with `requestDownstream` (`shared/http/request-downstream.ts`) and re-apply Set-Cookie via `applyDownstreamCookies`. The gateway uses global prefix `api`; downstream services have no prefix.
- All services share `SupabaseService` (`services/supabase.service.ts`), which exposes `.client` (anon key) and `.admin` (service-role key, bypasses RLS).
- Backend must be compiled before running (`npm run build:backend` → `dist/`). The `dev:*` scripts build first; running `dist/apps/<svc>/main.js` directly requires an existing build.

### Auth & RBAC (note: "firebase" is not Firebase)
- `src/frontend/src/firebase.ts` is a **custom Supabase Auth shim**, not Firebase. It tries a live Supabase session, then falls back to a `localStorage` (`currentUser`) demo session so prototype demos work offline. `auth.onAuthStateChanged` / `auth.signOut` mimic the Firebase API.
- Roles are layered. `lib/access.ts` maps a fine-grained `AccessRole` (e.g. `parish_priest`, `seminary_rector`) → coarse `AppRole` → the app's internal `Role` (`bishop|admin|priest|school|seminary`). It also handles legacy aliases and custom roles stored in `localStorage` (`diocese_roles`).
- Permissions are resolved client-side by `hooks/usePermissions.ts`: fetch `/api/admin/roles`, fall back to `localStorage`, then to `INITIAL_ROLES` in `src/constants.ts`, then to a hardcoded default map. `App.tsx` gates every view on `permissions.*` booleans (e.g. `view_diocese`, `view_parish_dashboard`, `digital_twin`).
- When adding a permission or role, update `src/constants.ts` (`INITIAL_ROLES`/permission list), the `App.tsx` gating switch, and `lib/access.ts` mappings together.

### Supabase database
- Postgres organized into **domain-partitioned schemas**: `diocese` (roles, permissions, role_permissions, profiles, projects, donations, project_expenses, announcements, audit_logs), `parishes`, `schools`, `seminaries` (each with `details` + `financial_records`).
- SQL lives in `supabase/` (`schema.sql`, `complete-domain-partitioned-schema.sql`, `admin-schema.sql`, `migration-roles-permissions.sql`, seeds). Human-readable docs and ER diagrams are the `DATABASE_*.md` / `*SchemaDiagram*.md` files at the repo root.
- A Supabase MCP server is available in this environment for inspecting the live project (`list_tables`, `execute_sql`, `apply_migration`, etc.) — prefer `list_tables`/`get_advisors` before schema changes.

## Conventions
- Financial health scoring (analytics) is currently driven by a hardcoded `INSTITUTION_DATA` map keyed by entity name in `src/backend/src/services/analytics.service.ts` — it is mock data, not computed from `financial_records` yet.
- Entity types are consistently the string union `'parish' | 'school' | 'seminary'` across frontend and backend; keep new code aligned to it.
- Shared types live in `src/frontend/src/types.ts` and `src/backend/src/types.ts` (kept in parallel, not shared via a package).
