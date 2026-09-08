# tRPC Setup Guide — Step by Step

Is README ka goal: agli baar jab bhi naye project me tRPC setup karna ho, top se
bottom follow karo — har step pe sirf utne hi packages install karne honge jitni
us step ko chahiye, aur har code block ke upar clearly likha hai **konsi file**
me jaana hai.

Overall flow:

```
STEP 1 → @repo/trpc internal package banao
STEP 2 → bare-minimum tRPC server (initTRPC.create())
STEP 3 → Context (bare-minimum se shuru, phir cookies add karte jao)
STEP 4 → Authenticated procedure (middleware)
STEP 5 → Ek route + root router
STEP 6 → OpenAPI support (trpc-to-openapi)
STEP 7 → apps/api me Express server mount (dev + start script)
STEP 8 → @repo/trpc/client (type-only exports)
STEP 9 → apps/web me TanStack Query client wiring
```

<br>

═══════════════════════════════════════════════════════════════════════════

## ⚠️ Pehle samajh lo: `@repo/trpc` external package NAHI hai

Jab bhi is README me `@repo/trpc` dikhega, wo **koi npm se install hone wala
package nahi hai** — ye monorepo ke andar khud banaya hua ek **workspace
package** hai jo `packages/trpc/` folder me rehta hai. `apps/api` aur
`apps/web`, dono isko apne `package.json` me `"@repo/trpc": "workspace:*"`
likh ke import karte hain, pnpm workspaces ki wajah se.

Root `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Isse pnpm ko pata chal jaata hai ki `packages/trpc` bhi ek installable package
hai jise dusre apps `workspace:*` se link kar sakte hain.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 1 — `@repo/trpc` package banao

```bash
mkdir -p packages/trpc/server
cd packages/trpc
```

📄 **File: `packages/trpc/package.json`** (khud likhna hai, ye package hi hai)

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

`"name": "@repo/trpc"` hi wo naam hai jo baad me `apps/api` aur `apps/web`
`workspace:*` ke through import karenge. `"type": "module"` zaroori hai kyunki
ESM imports me `.js` extension explicitly likhna padega (`./trpc.js` even
though file `.ts` hai) — Node ka ESM resolution isi tarah kaam karta hai.

**📦 Package install karo (sirf server ke liye):**

```bash
# packages/trpc ke andar
pnpm add @trpc/server zod
```

Bas itna hi abhi chahiye — na express, na openapi, na client. Jaise-jaise
flow aage badhega, waise-waise naye packages add karte jayenge.

<br>

═══════════════════════════════════════════════════════════════════════════

# 🟦 STEP 2 — Bare-minimum tRPC instance

📄 **File: `packages/trpc/server/trpc.ts`**

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

Bas. Yehi sabse chhota tRPC setup hai — no context, no meta, no middleware.
Koi package extra nahi chahiye is step ke liye — `@trpc/server` already
STEP 1 me install ho chuka hai.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 3 — Context (bare-minimum se shuru karke build karo)

Context ek object hai jo **har request ke saath** har procedure ko milta hai.
Ise ek dum se pura mat likho — pehle khaali context banao, phir usme
ek-ek karke cheez add karo. Isse samajhna easy rehta hai ki har piece kyun hai.

<br>

### 3.1 — Bare-minimum context (kuch bhi extra nahi, sirf skeleton)

Koi naya package nahi chahiye abhi.

📄 **File: `packages/trpc/server/context.ts`**

```ts
export const createContext = async () => {
  const ctx = {};
  return ctx;
};

export type Context = Awaited<ReturnType<typeof createContext>>;
```

Isse tRPC ko bata diya ki context ek async function se aayega, aur uska type
khud function se derive hoga (`Awaited<ReturnType<...>>`) — interface hath se
nahi likhni, warna dono jagah maintain karni padegi.

📄 **File: `packages/trpc/server/trpc.ts`** (update — Context wire karo)

```ts
import { initTRPC } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

Yahan tak context bilkul empty hai — bas plumbing set ho gayi hai.

<br>

---

### 3.2 — Express se context connect karo (req/res milne lagega)

**📦 Package install karo:**

```bash
pnpm add express
pnpm add -D @types/express
```

📄 **File: `packages/trpc/server/context.ts`** (update)

```ts
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
  const ctx = { req, res };
  return ctx;
};

export type Context = Awaited<ReturnType<typeof createContext>>;
```

Ab context ke paas raw Express `req`/`res` hai — abhi ye raw hai, isko clean
helper methods me convert karenge next sub-step me.

<br>

---

### 3.3 — Cookie helper functions (alag file me)

Cookie logic ko seedha `context.ts` me na likh ke ek alag utility file me
rakhte hain — reusable + testable rehta hai.

Koi naya package nahi chahiye (Express already install ho chuka hai).

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

<br>

---

### 3.4 — Cookie helpers ko context me wire karo

📄 **File: `packages/trpc/server/context.ts`** (final update)

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

export type Context = Awaited<ReturnType<typeof createContext>>;
```

**Yaad rakhne wali cheez:** `getCookie`, `setCookie`, `clearCookie` — teeno
functions pehle `utils/cookie.ts` me plain Express wrappers ki tarah likhe
gaye hain, phir `context.ts` me `as getCookieUtils` / `as setCookieUtils` /
`as clearCookieUtils` naam badal ke import kiye gaye, taaki context ke andar
banaye gaye method names (`getCookie`, `setCookie`, `clearCookie`) original
imports se clash na karein.

`user?: ITRPCUserContext | undefined` abhi optional hai aur `undefined` set
hai by default — STEP 4 me `authenticatedProcedure` isi field ko populate
karega jab cookie valid hogi.

**Context yahan tak ka safar:** empty `{}` → `{ req, res }` raw Express →
clean `{ getCookie, setCookie, clearCookie, user }` API. Ye hi teen stages
hain jo yaad rakhni hain jab kisi naye project me context banao.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 4 — Authenticated procedure (middleware)

Koi naya package nahi chahiye — `TRPCError` `@trpc/server` se hi aata hai.

📄 **File: `packages/trpc/server/trpc.ts`** (update)

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

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 5 — Ek route + root router

Koi naya package nahi chahiye.

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

export { createContext } from './context.js';
export type ServerRouter = typeof serverRouter;
```

Naya feature add karna ho future me: `server/routes/<feature>/route.ts`
banao → `server/index.ts` me import karke `serverRouter` ke andar merge kar
do. Types automatically flow ho jayenge, kahin manual typing nahi karni.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 6 — OpenAPI support (`trpc-to-openapi`)

**📦 Package install karo:**

```bash
pnpm add trpc-to-openapi
```

📄 **File: `packages/trpc/server/trpc.ts`** (final — `.meta` add karo)

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

📄 **File: `packages/trpc/server/routes/health/route.ts`** (final — `.meta` + zod schema)

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

`.meta({ openapi: {...} })` wahi cheez hai jo `trpc-to-openapi` read karke
REST endpoint aur `openapi.json` doc generate karta hai. Jis procedure pe ye
meta nahi hoga, wo sirf `/trpc` route se hi accessible rahega, `/api` ya
`openapi.json` me nahi dikhega.

**`packages/trpc` ka server-side kaam yahan tak complete ho gaya.** Final
`package.json` dependencies:

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

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 7 — `apps/api` (Express server) setup

**📦 Packages (sirf api app ke andar):**

```bash
cd apps/api
pnpm add @repo/trpc @trpc/server express cors cookie-parser trpc-to-openapi
pnpm add -D @types/express @types/cors @types/cookie-parser tsx typescript
```

> `@repo/trpc` yahan `workspace:*` version se link hoga kyunki wo internal
> package hai — pnpm workspace root ke `packages/trpc` folder ko point karega.

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

**Dev + start commands:**

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

- `dev` → `tsx watch` seedha TypeScript source (`src/server.ts`) run karta hai,
  file change hone pe auto-restart karta hai. Local dev ke liye yehi use karo.
- `start` → production ke liye — pehle `tsc` se build karke `dist/` me
  compile karna hoga (build script add karo, e.g. `"build": "tsc"`), phir
  `node dist/server.js` compiled JS run karega.

```bash
pnpm dev     # local development
pnpm build   # (build script add karne ke baad) -> tsc
pnpm start   # production
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 8 — `@repo/trpc/client` (type-only exports)

**📦 Package install karo (isi `packages/trpc` me):**

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

Isse frontend `@repo/trpc/client` import karega — `@trpc/client` ke saare
primitives (`createTRPCClient`, `httpBatchLink`, `loggerLink`, ...) yahin se
re-export ho jaate hain, taaki frontend ko `@trpc/client` seedha install na
karna pade. Koi server logic is file me nahi jaata — sirf types + vanilla
client.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 9 — `apps/web` (Next.js + TanStack Query) setup

**📦 Packages (sirf web app ke andar):**

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

📄 **File: `apps/web/app/layout.tsx`** (root layout me wrap karo)

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

**Usage kisi bhi component me:**

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

`createTRPCOptionsProxy` ki wajah se har procedure ko `.queryOptions()` /
`.mutationOptions()` milta hai jo seedha `useQuery` / `useMutation` me chala
jaata hai — pura type inference `ServerRouter` se aata hai, frontend me kahin
bhi manual typing nahi karni padti.

═══════════════════════════════════════════════════════════════════════════
<br>

# 📁 Final file map (sabkuch ek jagah)

```
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

═══════════════════════════════════════════════════════════════════════════
<br>

# 🧠 Gotchas / yaad rakhne wali baatein

- `.meta({ openapi: {...} })` opt-in hai per procedure — jisme nahi likha,
  wo sirf `/trpc` se accessible hoga, REST/OpenAPI me nahi dikhega.
- `httpBatchLink`'s custom `fetch` + `credentials: "include"` cookie-based
  auth ke liye zaroori hai (cross-origin `:3000` → `:5000`).
- ESM (`"type": "module"`) ki wajah se imports me `.js` extension zaroori
  hai, chahe source file `.ts` ho (`./trpc.js`, `./context.js`).
- `authenticatedProcedure` me abhi JWT verify TODO hai (`const id = "hello"`)
  — production me real verification lagani hogi.
- `@repo/trpc` **kabhi bhi `npm install @repo/trpc` se nahi aayega** — ye
  hamesha workspace ke andar khud maintain karna hoga.