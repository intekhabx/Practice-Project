# tRPC Quick Start

Fast setup guide. Just commands and code, no long explanations.

---

## 1. Create the shared package

```bash
mkdir -p packages/trpc/server
cd packages/trpc
pnpm add @trpc/server zod
```

`packages/trpc/package.json` — defines the `@repo/trpc` package itself (not from npm, you write this)
```json
{
  "name": "@repo/trpc",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js"
}
```

---

## 2. Basic tRPC instance

`packages/trpc/server/trpc.ts` — sets up the tRPC instance and exports the building blocks (`router`, `publicProcedure`) used everywhere else
```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

---

## 3. Context

```bash
pnpm add express
pnpm add -D @types/express
```

`packages/trpc/server/utils/cookie.ts` — plain helper functions to read/write/clear a cookie on the raw Express request/response
```ts
import type { Request, Response, CookieOptions } from 'express';

export const setCookie = (res: Response, name: string, value: string, opts: CookieOptions) =>
  res.cookie(name, value, opts);

export const getCookie = (req: Request, name: string) => req.cookies?.[name];

export const clearCookie = (res: Response, name: string) => res.clearCookie(name);
```

`packages/trpc/server/context.ts` — builds the object every procedure receives on each request (cookie access + logged-in user, if any)
```ts
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import {
  getCookie as getCookieUtils,
  setCookie as setCookieUtils,
  clearCookie as clearCookieUtils,
} from './utils/cookie.js';
import type { CookieOptions } from 'express';

export interface ITRPCUserContext {
  id: string;
}

export interface ITRPCContext {
  setCookie: (name: string, value: string, opts: CookieOptions) => void;
  getCookie: (name: string) => string | undefined;
  clearCookie: (name: string) => void;
  user?: ITRPCUserContext;
}

export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
  const ctx: ITRPCContext = {
    setCookie: (name, value, opts) => setCookieUtils(res, name, value, opts),
    getCookie: (name) => getCookieUtils(req, name),
    clearCookie: (name) => clearCookieUtils(res, name),
    user: undefined,
  };
  return ctx;
};

export type Context = Awaited<ReturnType<typeof createContext>>;
```

Update `trpc.ts` — same file as step 2, now wired to use `Context` so every procedure knows its shape:
```ts
import { initTRPC } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

---

## 4. Authenticated procedure

`packages/trpc/server/trpc.ts` — same file again, now adds a procedure that blocks the request unless a valid cookie is present
```ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const authenticatedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const token = ctx.getCookie('refresh_token');
  if (!token) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'refresh_token is missing' });

  const id = 'hello'; // TODO: verify JWT and get real id

  return next({ ctx: { ...ctx, user: { id } } });
});
```

---

## 5. A route + root router

`packages/trpc/server/routes/health/route.ts` — one feature's router; each new feature gets its own folder like this
```ts
import { publicProcedure, router } from '../../trpc.js';

export const healthRouter = router({
  getHealth: publicProcedure.query(() => ({ status: 'healthy' })),
});
```

`packages/trpc/server/index.ts` — merges every feature router into one root router and exports its type for the client
```ts
import { router } from './trpc.js';
import { healthRouter } from './routes/health/route.js';

export const serverRouter = router({
  health: healthRouter,
});

export { createContext } from './context.js';
export type ServerRouter = typeof serverRouter;
```

---

## 6. OpenAPI

```bash
pnpm add trpc-to-openapi
```

`packages/trpc/server/trpc.ts` — same file, now able to carry OpenAPI metadata (`.meta()`) on any procedure
```ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import type { OpenApiMeta } from 'trpc-to-openapi';

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const authenticatedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const token = ctx.getCookie('refresh_token');
  if (!token) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'refresh_token is missing' });
  const id = 'hello';
  return next({ ctx: { ...ctx, user: { id } } });
});
```

`packages/trpc/server/routes/health/route.ts` — same route, now marked with `.meta({ openapi })` so it also appears as a REST endpoint
```ts
import { publicProcedure, router } from '../../trpc.js';
import { z } from 'zod';

export const healthRouter = router({
  getHealth: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/health' } })
    .input(z.undefined())
    .output(z.object({ status: z.literal('healthy') }))
    .query(async () => ({ status: 'healthy' })),
});
```

---

## 7. API server (Express)

```bash
cd apps/api
pnpm add @repo/trpc @trpc/server express cors cookie-parser trpc-to-openapi
pnpm add -D @types/express @types/cors @types/cookie-parser tsx typescript
```

`apps/api/src/app.ts` — builds the Express app: CORS, cookies, and mounts both `/trpc` (native) and `/api` + `/openapi.json` (REST)
```ts
import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import * as trpcExpress from '@trpc/server/adapters/express';
import { serverRouter, createContext } from '@repo/trpc/server/index.js';
import { createOpenApiExpressMiddleware, generateOpenApiDocument } from 'trpc-to-openapi';

function createApplication(): Express {
  const app = express();

  app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
  app.use(cookieParser());
  app.use(express.json());

  const openApiDocument = generateOpenApiDocument(serverRouter, {
    title: 'My API',
    version: '1.0.0',
    baseUrl: process.env.BASE_URL?.concat('/api') || 'http://localhost:5000/api',
  });
  app.get('/openapi.json', (_req, res) => res.json(openApiDocument));

  app.use('/api', createOpenApiExpressMiddleware({ router: serverRouter, createContext }));
  app.use('/trpc', trpcExpress.createExpressMiddleware({ router: serverRouter, createContext }));

  return app;
}

export default createApplication;
```

`apps/api/src/server.ts` — creates the actual HTTP server and starts it listening on a port
```ts
import http from 'node:http';
import createApplication from './app.js';

const PORT = process.env.PORT ?? 5000;
const app = createApplication();
http.createServer(app).listen(PORT, () => console.log(`listening on ${PORT}`));
```

`apps/api/package.json` — scripts to run the server in dev mode, build it, and run it in production
```json
{
  "scripts": {
    "dev": "tsx watch ./src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

Run it:
```bash
pnpm dev
```

---

## 8. Client package

```bash
cd packages/trpc
pnpm add @trpc/client
```

`packages/trpc/client/index.ts` — type-only exports for the frontend; no server code lives here, just types + `@trpc/client` re-exports
```ts
import { type ServerRouter } from '../server/index.js';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export type RouterInput = inferRouterInputs<ServerRouter>;
export type RouterOutput = inferRouterOutputs<ServerRouter>;

export { type ServerRouter } from '../server/index.js';
export * from '@trpc/client';
```

---

## 9. Web app (Next.js + TanStack Query)

```bash
cd apps/web
pnpm add @repo/trpc @trpc/tanstack-react-query @tanstack/react-query
```

`apps/web/trpc/client.ts` — creates the typed React context/hooks (`TRPCProvider`, `useTRPC`) tied to your router type
```ts
import type { ServerRouter } from '@repo/trpc/server/index';
import { createTRPCContext } from '@trpc/tanstack-react-query';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<ServerRouter>();
```

`apps/web/trpc/create-client.ts` — the actual tRPC client (talks to `/trpc` over HTTP) plus the query client used by TanStack Query
```ts
import { createTRPCClient, httpBatchLink, loggerLink } from '@repo/trpc/client';
import type { ServerRouter } from '@repo/trpc/server/index';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';

export const queryClient = new QueryClient();

export const trpcClient = createTRPCClient<ServerRouter>({
  links: [
    loggerLink(),
    httpBatchLink({
      url: process.env.BASE_URL?.concat('/trpc') || 'http://localhost:5000/trpc',
      fetch: (url, options) => fetch(url, { ...options, credentials: 'include' }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<ServerRouter>({ client: trpcClient, queryClient });
```

`apps/web/providers/provider.tsx` — a client component that wraps your app in `QueryClientProvider` so hooks like `useQuery` work anywhere
```tsx
'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../trpc/create-client';

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

Wrap it in `apps/web/app/layout.tsx` — the root layout that every page renders inside, so `Providers` needs to sit here:
```tsx
import { Providers } from '../providers/provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Use it in a component:
```tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { trpc } from '../trpc/create-client';

export function HealthCheck() {
  const { data, isLoading } = useQuery(trpc.health.getHealth.queryOptions());
  if (isLoading) return <p>Loading...</p>;
  return <p>Status: {data?.status}</p>;
}
```

Run it:
```bash
pnpm dev
```

---

## File map

```
packages/trpc/server/trpc.ts             → init, procedures, middleware
packages/trpc/server/context.ts          → context (cookies, user)
packages/trpc/server/utils/cookie.ts     → cookie helpers
packages/trpc/server/routes/*/route.ts   → feature routers
packages/trpc/server/index.ts            → merged router + type
packages/trpc/client/index.ts            → client types + re-exports

apps/api/src/app.ts                      → express app, mounts /trpc + /api
apps/api/src/server.ts                   → http server

apps/web/trpc/client.ts                  → TRPCProvider, useTRPC
apps/web/trpc/create-client.ts           → trpc client + query client
apps/web/providers/provider.tsx          → QueryClientProvider wrapper
```

## Remember

- `@repo/trpc` is not from npm — it's a workspace package you write yourself.
- `.meta({ openapi })` is opt-in per procedure — only those show up in REST/OpenAPI.
- `credentials: 'include'` is required for cookie-based auth to work cross-origin.
- ESM imports need `.js` extensions even in `.ts` files.
- JWT check in `authenticatedProcedure` is a stub — replace before production.