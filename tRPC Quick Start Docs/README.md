# tRPC Setup Guide — Step by Step

The goal of this README is simple: whenever you need to set up tRPC in a new project, follow this guide from top to bottom. At each step, install only the packages required for that step. Every code block clearly shows which file it belongs to.

The flow is:

```text
1. Create the @repo/trpc internal package (this does not come from npm; you create it yourself)
2. Create a bare-minimum tRPC server inside it (initTRPC.create())
3. Add Context (for cookies)
4. Add an authenticated procedure (middleware)
5. Create a route and merge it into the root router
6. Add OpenAPI support (trpc-to-openapi)
7. Mount the Express server in apps/api (dev + start script)
8. Create @repo/trpc/client (type-only exports)
9. Connect the client in apps/web with TanStack Query
```

---

## ⚠️ First understand this: `@repo/trpc` is NOT an external package

Whenever you see `@repo/trpc` in this README, it is **not a package that you install from npm**. It is a **workspace package** that you create yourself inside the monorepo. It lives in the `packages/trpc/` folder.

Both `apps/api` and `apps/web` import it in their `package.json` using `"@repo/trpc": "workspace:*"`. This works because of pnpm workspaces.

Root `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

This tells pnpm that `packages/trpc` is also an installable workspace package that other apps can link using `workspace:*`.

---

## Step 1 — Create the `@repo/trpc` package

```bash
mkdir -p packages/trpc/server
cd packages/trpc
```

📄 **File: `packages/trpc/package.json`** (create this file yourself; this is the package)

```json
{
  "name": "@repo/trpc",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "dependencies": {},
  "devDependencies": {}
}
```

`"name": "@repo/trpc"` is the name that `apps/api` and `apps/web` will later use to import this package through `workspace:*`.

`"type": "module"` is required because ESM imports need the `.js` extension explicitly (`./trpc.js` even though the actual source file is `.ts`). This is how Node's ESM resolution works.

### Now install the first package (only for the server)

```bash
# packages/trpc ke andar
pnpm add @trpc/server zod
```

That is all we need for now — no Express, no OpenAPI, and no client package. We will add new packages as we move through the guide.

---

## Step 2 — Bare-minimum tRPC instance

📄 **File: `packages/trpc/server/trpc.ts`**

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

That is it. This is the smallest tRPC setup — no context, no meta, and no middleware.

To test it, you can also create a simple dummy route:

📄 **File: `packages/trpc/server/routes/health/route.ts`**

```ts
import { publicProcedure, router } from '../../trpc.js';

export const healthRouter = router({
  getHealth: publicProcedure.query(() => ({ status: 'healthy' })),
});
```

📄 **File: `packages/trpc/server/index.ts`**

```ts
import { router } from './trpc.js';
import { healthRouter } from './routes/health/route.js';

export const serverRouter = router({
  health: healthRouter,
});

export type ServerRouter = typeof serverRouter;
```

Up to this point, the setup works completely without Context.

---

## Step 3 — Add Context (for cookies)

We need Context because we want to read, write, and clear cookies from the request, such as `refresh_token`.

### Packages (Context needs Express types)

```bash
pnpm add express
pnpm add -D @types/express
```

First, create the cookie helper functions in a separate file, and then import them into the Context — exactly like you did earlier (`as getCookieUtils`, etc.).

📄 **File: `packages/trpc/server/utils/cookie.ts`**

```ts
import type { Request, Response, CookieOptions } from 'express';

export const setCookie = (res: Response, name: string, value: string, opts: CookieOptions) => {
  res.cookie(name, value, opts);
};

export const getCookie = (req: Request, name: string) => {
  return req.cookies?.[name];
};

export const clearCookie = (res: Response, name: string) => {
  res.clearCookie(name);
};
```

📄 **File: `packages/trpc/server/context.ts`**

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
  user?: ITRPCUserContext | undefined;
}

export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
  const ctx: ITRPCContext = {
    setCookie(name: string, value: string, opts: CookieOptions) {
      return setCookieUtils(res, name, value, opts);
    },

    getCookie(name: string) {
      return getCookieUtils(req, name);
    },

    clearCookie(name: string) {
      return clearCookieUtils(res, name);
    },

    user: undefined,
  };

  return ctx;
};

// Context type khud function se derive hoti hai — interface hath se nahi likhni
export type Context = Awaited<ReturnType<typeof createContext>>;
```

**Important thing to remember:** `getCookie`, `setCookie`, and `clearCookie` are first defined in `utils/cookie.ts` as simple Express wrappers.

Then, in `context.ts`, they are imported with aliases such as `as getCookieUtils`, `as setCookieUtils`, and `as clearCookieUtils`. This prevents the Context method names (`getCookie`, `setCookie`, and `clearCookie`) from conflicting with the original imported functions.

### Now update `trpc.ts` so it uses Context

📄 **File: `packages/trpc/server/trpc.ts`** (update)

```ts
import { initTRPC } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

Only `.context<Context>()` was added. Everything else remains the same.

---

## Step 4 — Authenticated procedure (middleware)

Now we need a protected procedure that checks the cookie.

📄 **File: `packages/trpc/server/trpc.ts`** (final version is step)

```ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const authenticatedProcedure = t.procedure.use(async (options) => {
  const { ctx, next } = options;

  const token = ctx.getCookie('refresh_token');
  if (!token) {
    throw new TRPCError({ message: 'refresh_token is missing', code: 'UNAUTHORIZED' });
  }

  // TODO: JWT verify karke real user id nikalo
  const id = 'hello';

  return next({
    ctx: {
      ...ctx,
      user: { id },
    },
  });
});
```

No new package is required. `TRPCError` already comes from `@trpc/server`.

---

## Step 5 — OpenAPI support (`trpc-to-openapi`)

Now we want to expose tRPC procedures through REST/OpenAPI as well.

### Package

```bash
pnpm add trpc-to-openapi
```

📄 **File: `packages/trpc/server/trpc.ts`** (add meta)

```ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import type { OpenApiMeta } from 'trpc-to-openapi';

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const authenticatedProcedure = t.procedure.use(async (options) => {
  const { ctx, next } = options;

  const token = ctx.getCookie('refresh_token');
  if (!token) {
    throw new TRPCError({ message: 'refresh_token is missing', code: 'UNAUTHORIZED' });
  }

  const id = 'hello';

  return next({ ctx: { ...ctx, user: { id } } });
});
```

Only `.meta<OpenApiMeta>()` was added to the `initTRPC` chain.

📄 **File: `packages/trpc/server/routes/health/route.ts`** (update — add `.meta` + zod schema)

```ts
import { publicProcedure, router } from '../../trpc.js';
import { z } from 'zod';

export const healthRouter = router({
  getHealth: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/health' } })
    .input(z.undefined())
    .output(z.object({ status: z.literal('healthy') }))
    .query(async () => {
      return { status: 'healthy' };
    }),
});
```

`.meta({ openapi: {...} })` is what `trpc-to-openapi` reads to generate the REST endpoint and the `openapi.json` document.

If a procedure does not have this meta information, it will only be available through the `/trpc` route. It will not appear in `/api` or `openapi.json`.

📄 **File: `packages/trpc/server/index.ts`** (no change needed; it already merges the routers)

```ts
import { router } from './trpc.js';
import { healthRouter } from './routes/health/route.js';

export const serverRouter = router({
  health: healthRouter,
});

export { createContext } from './context.js';
export type ServerRouter = typeof serverRouter;
```

The server-side work inside `packages/trpc` is now complete.

The final `package.json` dependencies at this point are:

```json
{
  "name": "@repo/trpc",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@trpc/server": "^11.18.0",
    "express": "^5.2.1",
    "trpc-to-openapi": "^3.3.0",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@types/express": "^5.0.6"
  }
}
```

---

## Step 6 — `apps/api` (Express server) setup

Now we create the actual server application that will mount `@repo/trpc`.

### Packages (only inside the API app)

```bash
cd apps/api
pnpm add @repo/trpc @trpc/server express cors cookie-parser trpc-to-openapi
pnpm add -D @types/express @types/cors @types/cookie-parser tsx typescript
```

> `@repo/trpc` will be linked using the `workspace:*` version because it is an internal package. pnpm will point to the `packages/trpc` folder inside the workspace.

📄 **File: `apps/api/src/app.ts`**

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

  app.get('/', (req, res) => {
    res.json({ status: 'API is up and running' });
  });

  // OpenAPI doc
  const openApiDocument = generateOpenApiDocument(serverRouter, {
    title: 'My API',
    version: '1.0.0',
    baseUrl: process.env.BASE_URL?.concat('/api') || 'http://localhost:5000/api',
  });

  app.get('/openapi.json', (req, res) => {
    return res.json(openApiDocument);
  });

  // REST-style routes generated from procedures that have .meta({openapi})
  app.use('/api', createOpenApiExpressMiddleware({ router: serverRouter, createContext }));

  // native tRPC endpoint (frontend tRPC client isi se baat karega)
  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({ router: serverRouter, createContext }),
  );

  return app;
}

export default createApplication;
```

📄 **File: `apps/api/src/server.ts`**

```ts
import http from 'node:http';
import createApplication from './app.js';

function main() {
  const PORT = process.env.PORT ?? 5000;

  const app = createApplication();
  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`server is listening on port: ${PORT}`);
  });
}

main();
```

### Dev + start commands setup

📄 **File: `apps/api/package.json`**

```json
{
  "name": "api",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "dev": "tsx watch ./src/server.ts",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@repo/trpc": "workspace:*",
    "@trpc/server": "^11.18.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "express": "^5.2.1",
    "trpc-to-openapi": "^3.3.0"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.10",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "tsx": "^4.23.13",
    "typescript": "7.0.2"
  }
}
```

* `dev` → `tsx watch` directly runs the TypeScript source (`src/server.ts`) and automatically restarts when a file changes. Use this for local development.
* `start` → used for production. First compile the project with `tsc` so the files are created inside `dist/` (you can add a separate build script such as `"build": "tsc"`). Then `node dist/server.js` runs the compiled JavaScript.

```bash
pnpm dev     # local development
pnpm build   # (agar build script add kiya ho) -> tsc
pnpm start   # production
```

---

## Step 7 — `@repo/trpc/client` (type-only exports)

Now we create a separate client entry inside the same `@repo/trpc` package.

This entry will contain **no server logic**. It will only contain types and vanilla client primitives.

### Package (add this inside `packages/trpc`)

```bash
cd packages/trpc
pnpm add @trpc/client
```

📄 **File: `packages/trpc/client/index.ts`**

```ts
import { type ServerRouter } from '../server/index.js';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export type RouterInput = inferRouterInputs<ServerRouter>;
export type RouterOutput = inferRouterOutputs<ServerRouter>;

export { type ServerRouter } from '../server/index.js';
export * from '@trpc/client';
```

The frontend will import `@repo/trpc/client`.

All `@trpc/client` primitives (`createTRPCClient`, `httpBatchLink`, `loggerLink`, ...) are re-exported from here, so the frontend does not need to install `@trpc/client` directly.

---

## Step 8 — `apps/web` (Next.js + TanStack Query) setup

### Packages (only inside the web app)

```bash
cd apps/web
pnpm add @repo/trpc @trpc/tanstack-react-query @tanstack/react-query
```

📄 **File: `apps/web/trpc/client.ts`**

```ts
import type { ServerRouter } from '@repo/trpc/server/index';
import { createTRPCContext } from '@trpc/tanstack-react-query';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<ServerRouter>();
```

📄 **File: `apps/web/trpc/create-client.ts`**

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

      // cors ke liye — har fetch me credentials: "include" bhejna padta hai
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<ServerRouter>({
  client: trpcClient,
  queryClient,
});
```

📄 **File: `apps/web/providers/provider.tsx`**

```tsx
'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../trpc/create-client';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

📄 **File: `apps/web/app/layout.tsx`** (wrap the root layout)

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

### Usage in any component

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

Because of `createTRPCOptionsProxy`, every procedure gets `.queryOptions()` / `.mutationOptions()` methods. These can be used directly with `useQuery` / `useMutation`.

All type inference comes from `ServerRouter`, so you do not need to manually write types anywhere in the frontend.

---

## Final file map (everything in one place)

```text
packages/trpc/
  package.json                 → @repo/trpc definition (internal, not npm)
  server/
    trpc.ts                    → initTRPC instance, publicProcedure, authenticatedProcedure
    context.ts                 → createContext + Context type (cookies)
    utils/cookie.ts             → getCookie / setCookie / clearCookie helpers
    routes/health/route.ts      → example router with .meta({openapi})
    index.ts                    → serverRouter (merged) + ServerRouter type
  client/
    index.ts                    → re-exports @trpc/client + RouterInput/RouterOutput types

apps/api/
  src/app.ts                    → express app: cors, cookieParser, mounts /trpc + /api + /openapi.json
  src/server.ts                 → http server, PORT, main()
  package.json                  → "dev": tsx watch, "start": node dist

apps/web/
  trpc/client.ts                 → createTRPCContext (TRPCProvider, useTRPC)
  trpc/create-client.ts          → trpcClient (httpBatchLink) + trpc (options proxy) + queryClient
  providers/provider.tsx         → QueryClientProvider wrapper
  app/layout.tsx                 → wraps app with <Providers>
```

## Gotchas / Important things to remember

* `.meta({ openapi: {...} })` is opt-in for each procedure. If it is not added, the procedure will only be accessible through `/trpc` and will not appear in REST/OpenAPI.
* `httpBatchLink`'s custom `fetch` + `credentials: "include"` is required for cookie-based authentication (cross-origin `:3000` → `:5000`).
* Because of ESM (`"type": "module"`), imports must use the `.js` extension even when the source file is `.ts` (`./trpc.js`, `./context.js`).
* `authenticatedProcedure` currently has a JWT verification TODO (`const id = "hello"`). In production, you must add real JWT verification.
* `@repo/trpc` **will never come from `npm install @repo/trpc`**. You must always maintain it yourself inside the workspace.
