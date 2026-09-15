# tRPC + better-auth Integration Guide — Step by Step

Ye guide batata hai ki `better-auth` (session-based auth library) ko tRPC ke
saath kaise integrate karte hain — end to end: database schema
auto-generation se lekar frontend me signup/login call karne tak.

**Prerequisite:** Base tRPC setup (`initTRPC`, `router`, `publicProcedure`)
ka basic idea `tRPC.md` me hai. Ye guide us knowledge ko assume karta hai,
lekin context/trpc.ts yahan **better-auth ke liye completely alag** banenge
(cookie/JWT wala pichla approach yahan use nahi ho raha).

**better-auth kya hai, in short:** ek session-based auth library jo khud
apne database tables (`user`, `session`, `account`, `verification`) manage
karti hai, khud cookies set/verify karti hai, aur email-password / social
login jaisi cheezein built-in deti hai — humein khud JWT ya password hashing
likhne ki zaroorat nahi padti.

Overall flow:

```
STEP 1 → Environment variables
STEP 2 → @repo/database skeleton (drizzle client, config — schema abhi khaali)
STEP 3 → @repo/services — betterAuth instance banao (minimal, bina schema ke)
STEP 4 → better-auth CLI se DB schema auto-generate karo
STEP 5 → Drizzle migration generate + run karo (actual Postgres tables banao)
STEP 6 → auth.ts ko generated schema ke saath finalize karo
STEP 7 → Express app me better-auth ka handler mount karo (apps/api)
STEP 8 → tRPC context — better-auth session ko ctx me lao
STEP 9 → tRPC trpc.ts — authenticatedProcedure (session check)
STEP 10 → Routes (health + protected todo example)
STEP 11 → Root router + client package
STEP 12 → Web app — better-auth client (signup/login/logout)
STEP 13 → Web app — tRPC client wiring (cookies, no manual header)
STEP 14 → Usage — component me signup + protected query
```

<br>

═══════════════════════════════════════════════════════════════════════════

## ⚠️ Naye internal packages (recap)

`@repo/database` aur `@repo/services` yahan bhi **workspace packages** hain
(npm se nahi aate) — `packages/database/` aur `packages/services/` ke andar
khud likhna hai, `pnpm-workspace.yaml` already `packages/*` cover karta hai.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 1 — Environment variables

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/luqma

# better-auth ka apna secret (session/cookie signing ke liye)
BETTER_AUTH_SECRET=a-long-random-string

# backend khud ka URL (better-auth client isse baat karega)
BETTER_AUTH_URL=http://localhost:5000
BASE_URL=http://localhost:5000

# frontend ka URL — CORS + better-auth trustedOrigins dono ke liye chahiye
FRONTEND_URL=http://localhost:3000

NODE_ENV=development
```

`BETTER_AUTH_SECRET` production me zaroor set karo — na ho to better-auth
dev mode me warning dega aur ek insecure default use karega.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 2 — `@repo/database` skeleton (schema abhi khaali)

Yahan hum sirf DB **connection** aur **config** banayenge — actual tables
(`user`, `session`, ...) better-auth khud generate karega (STEP 4 me).

<br>

### 2.1 — Package setup + install

```bash
mkdir -p packages/database/models
cd packages/database
pnpm add drizzle-orm pg dotenv
pnpm add -D drizzle-kit @types/pg tsx
```

📄 **File: `packages/database/package.json`** — `@repo/database` definition + migration scripts

```json
{
  "name": "@repo/database",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "db:generate": "pnpm exec drizzle-kit generate",
    "db:migrate": "pnpm exec drizzle-kit migrate"
  },
  "dependencies": {
    "dotenv": "^17.4.2",
    "drizzle-orm": "^0.45.2",
    "pg": "^8.23.0"
  },
  "devDependencies": {
    "@types/pg": "^8.23.1",
    "drizzle-kit": "^0.31.10",
    "tsx": "^4.23.13"
  }
}
```

<br>

---

### 2.2 — DB client

📄 **File: `packages/database/index.ts`** — actual Postgres connection jo baaki packages import karenge

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';

const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL!,
    // ssl: true   // production DB (Neon, Supabase, etc.) me enable karo
  },
});

export default db;
```

<br>

---

### 2.3 — Drizzle config

📄 **File: `packages/database/drizzle.config.ts`** — drizzle-kit ko batata hai schema kahan hai aur migrations kahan generate karni hain

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

📄 **File: `packages/database/schema.ts`** — abhi khaali rakho (placeholder), STEP 4 ke baad isme generated model export hoga

```ts
// STEP 4 ke baad yahan: export * from './models/auth-schema.js';
export {};
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 3 — `@repo/services`: minimal `betterAuth` instance banao

<br>

### 3.1 — Package setup + install

```bash
mkdir -p packages/services/auth
cd packages/services
pnpm add @repo/database better-auth
```

📄 **File: `packages/services/package.json`** — `@repo/services` definition + schema-generate script

```json
{
  "name": "@repo/services",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "db:schema": "pnpm dlx auth@latest generate --output ../database/models/auth-schema.ts"
  },
  "dependencies": {
    "@repo/database": "workspace:*",
    "better-auth": "^1.7.4"
  }
}
```

`db:schema` script better-auth ke CLI (`auth@latest generate`) ko chalata
hai — ye is folder ke andar `auth.ts` ko dhoondhta hai (jo `betterAuth(...)`
export karta hai), uski config padhta hai, aur uske hisaab se Drizzle
schema file generate kar deta hai.

<br>

---

### 3.2 — Minimal `auth.ts` (bina explicit schema ke — CLI ke liye)

📄 **File: `packages/services/auth/auth.ts`** — better-auth ka core config, CLI isi file ko scan karega

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import db from '@repo/database/index.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg', // or "mysql", "sqlite"
  }),

  emailAndPassword: {
    enabled: true,
  },
});
```

Is stage pe `schema` property nahi di — sirf `provider: "pg"` diya hai.
CLI ko sirf itna pata hona chahiye ki kaunsi features enabled hain
(`emailAndPassword`, future me `socialProviders`, etc.) taaki wo uske
hisaab se sahi tables generate kar sake.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 4 — better-auth CLI se DB schema generate karo

```bash
# packages/services ke andar
pnpm db:schema
```

Ye command `packages/database/models/auth-schema.ts` file **auto-generate**
kar degi jisme ye tables honge:

- `user` — id, name, email, emailVerified, image, timestamps
- `session` — id, token, expiresAt, userId (FK), ipAddress, userAgent
- `account` — id, accountId, providerId, userId (FK), password (email/password ke liye), OAuth tokens
- `verification` — email/OTP verification records

📄 **File: `packages/database/models/auth-schema.ts`** — ye poori file CLI generate karti hai, khud se likhne ki zaroorat nahi. Chhoti jhalak:

```ts
import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
```

**Yaad rakho:** password yahan `account.password` me store hota hai
(better-auth khud hash karta hai), `user` table me koi password column nahi
hota — ye better-auth ka apna design hai, humari pehle wali custom
`users` table se alag hai.

Ab `schema.ts` update karo:

📄 **File: `packages/database/schema.ts`** (update)

```ts
export * from './models/auth-schema.js';
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 5 — Migration generate + run karo

Ab jo schema generate hui (STEP 4), usse actual Postgres tables banao.

```bash
# packages/database ke andar
pnpm db:generate    # schema.ts se SQL migration file banata hai
pnpm db:migrate      # Postgres DB pe apply karta hai
```

Isse `user`, `session`, `account`, `verification` — chaaron tables tumhare
Postgres DB me ban jaayenge.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 6 — `auth.ts` ko generated schema ke saath finalize karo

Ab jab schema exist karti hai, `auth.ts` ko update karo taaki `drizzleAdapter`
ko explicitly tables pass ho — isse better-auth ko type-safety aur multi-schema
projects me clarity milti hai.

Koi naya package nahi chahiye.

📄 **File: `packages/services/auth/auth.ts`** (final update)

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import db from '@repo/database/index.js';
import { account, session, user, verification } from '@repo/database/schema.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg', // or "mysql", "sqlite"
    schema: { account, user, session, verification },
  }),

  trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:3000'],

  emailAndPassword: {
    enabled: true,
  },
});
```

**`trustedOrigins` kyun zaroori hai:** better-auth apne aap CORS/CSRF
protection karta hai — agar frontend ka origin yahan list nahi hai, to
signup/login requests reject ho jaayengi chahe Express `cors()` allow kar
raha ho.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 7 — Express app me better-auth ka handler mount karo

**📦 Packages (`apps/api` ke andar):**

```bash
cd apps/api
pnpm add @repo/services @repo/trpc @trpc/server better-auth cors cookie-parser express trpc-to-openapi dotenv
pnpm add -D @types/cors @types/cookie-parser @types/express @types/node tsx typescript
```

📄 **File: `apps/api/src/app.ts`** — Express app: better-auth handler + tRPC/OpenAPI dono mount hote hain

```ts
import express, { type Express } from 'express';
import cors from 'cors';
import * as trpcExpress from '@trpc/server/adapters/express';
import { serverRouter, createContext } from '@repo/trpc/server/index.js';
import { createOpenApiExpressMiddleware, generateOpenApiDocument } from 'trpc-to-openapi';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '@repo/services/auth/auth.js';
import cookieParser from 'cookie-parser';

export function createApplication(): Express {
  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true,
    }),
  );

  // ⚠️ better-auth ka handler `express.json()` se PEHLE mount hona zaroori hai
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.use(express.json());
  app.use(cookieParser());

  app.get('/', (req, res) => {
    res.json({ message: 'Server is up and running', status: 'healthy' });
  });

  const openApiDocument = generateOpenApiDocument(serverRouter, {
    title: 'tRPC OpenAPI',
    version: '1.0.0',
    baseUrl: process.env.BASE_URL ?? 'http://localhost:5000',
  });

  app.get('/openapi.json', (req, res) => {
    res.json(openApiDocument);
  });

  app.use('/api', createOpenApiExpressMiddleware({ router: serverRouter, createContext }));

  app.use('/trpc', trpcExpress.createExpressMiddleware({ router: serverRouter, createContext }));

  return app;
}
```

**⚠️ Sabse important gotcha is poori guide ki:** `toNodeHandler(auth)`
**hamesha `express.json()` se pehle** aana chahiye. better-auth ko raw
(unparsed) request body chahiye hota hai apna khud ka body-parsing karne ke
liye — agar `express.json()` pehle chal gaya, to body already consume ho
chuka hoga aur better-auth fail ho jaayega ya galat behave karega.

`app.all("/api/auth/*splat", ...)` — ye ek single handler hai jo
`/api/auth/` ke niche ke **sab** routes (`/sign-up/email`, `/sign-in/email`,
`/sign-out`, `/get-session`, etc.) handle karta hai. Ye saare endpoints
better-auth khud banata hai, humein inhe manually likhna nahi padta.

📄 **File: `apps/api/src/server.ts`** — HTTP server start karta hai

```ts
import 'dotenv/config';
import http from 'node:http';
import { createApplication } from './app.js';

function main() {
  const PORT = process.env.PORT ?? 5000;

  const app = createApplication();
  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
  });
}

main();
```

📄 **File: `apps/api/package.json`** — dev/start scripts

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
    "@repo/services": "workspace:*",
    "@repo/trpc": "workspace:*",
    "@trpc/server": "^11.18.0",
    "better-auth": "^1.7.4",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "trpc-to-openapi": "^3.3.0",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.10",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/node": "26.4.1",
    "tsx": "^4.23.13"
  }
}
```

```bash
pnpm dev
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 8 — tRPC Context: better-auth session ko ctx me lao

**📦 Package (`packages/trpc` ke andar):**

```bash
cd packages/trpc
pnpm add @repo/services better-auth
```

📄 **File: `packages/trpc/server/context.ts`** — har request ke liye better-auth se current session fetch karta hai

```ts
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { auth } from '@repo/services/auth/auth.js';
import { fromNodeHeaders } from 'better-auth/node';

export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
  const ctx = {
    session: await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    }),
  };

  return ctx;
};

export type Context = Awaited<ReturnType<typeof createContext>>;
```

`fromNodeHeaders(req.headers)` Express ke raw headers ko better-auth ke
expected `Headers` format me convert karta hai. `auth.api.getSession(...)`
request ki cookie (better-auth khud set karta hai) padh ke session verify
karta hai — agar valid session hai to `{session, user}` return karta hai,
warna `null`.

**Note:** Ye context pehle wale JWT-based `context.ts` se bilkul alag hai —
yahan koi `getCookie`/`setCookie` helper hum khud nahi likh rahe, kyunki
better-auth khud cookies manage karta hai `toNodeHandler(auth)` middleware
ke through.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 9 — `trpc.ts`: `authenticatedProcedure` (session check)

Koi naya package nahi chahiye.

📄 **File: `packages/trpc/server/trpc.ts`**

```ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import type { OpenApiMeta } from 'trpc-to-openapi';

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// protected procedure
export const authenticatedProcedure = t.procedure.use((options) => {
  const { ctx, next } = options;

  if (!ctx.session) {
    throw new TRPCError({ message: 'you must be loggedin', code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.session.user,
    },
  });
});
```

Pehle wale JWT-based `authenticatedProcedure` se comparison: wahan header
se Bearer token nikal ke verify karna padta tha aur DB se user fetch karna
padta tha. Yahan sirf `ctx.session` check karna hai — session already STEP
8 me `createContext` ke andar better-auth se fetch ho chuki hai. Bahut
simpler hai.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 10 — Routes (health + protected example)

Koi naya package nahi chahiye.

📄 **File: `packages/trpc/server/routes/health.ts`** — public route, koi auth nahi chahiye

```ts
import { publicProcedure, router } from '../trpc.js';
import { z } from 'zod';

export const healthRouter = router({
  getHealth: publicProcedure
    .input(z.undefined())
    .output(z.object({ status: z.string() }))
    .query(async () => {
      return { status: 'Server is healthy' };
    }),
});
```

📄 **File: `packages/trpc/server/routes/todo.ts`** — protected example route, `authenticatedProcedure` use karta hai

```ts
import { authenticatedProcedure, router } from '../trpc.js';

const TODO = ['hello', 'i am todo'];

export const todoRouter = router({
  getTodo: authenticatedProcedure.query(({ ctx }) => {
    if (!ctx.session) {
      throw new Error('session is not available');
    }
    if (!ctx.user) {
      throw new Error('user is not available');
    }

    return { TODO };
  }),
});
```

Ye demonstrate karta hai ki `authenticatedProcedure` ke andar `ctx.session`
aur `ctx.user` (STEP 9 me set kiya) dono available hain.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 11 — Root router + client package

📄 **File: `packages/trpc/server/index.ts`** — sab routers merge

```ts
import { healthRouter } from './routes/health.js';
import { todoRouter } from './routes/todo.js';
import { router } from './trpc.js';

export const serverRouter = router({
  health: healthRouter,
  todo: todoRouter,
  // other routes
});

export { createContext } from './context.js';
export type ServerRouter = typeof serverRouter;
```

**📦 Package:**

```bash
cd packages/trpc
pnpm add @trpc/client
```

📄 **File: `packages/trpc/client/index.ts`** — type-only exports, frontend yahan se import karega

```ts
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { ServerRouter } from '../server/index.js';

export type RouterInput = inferRouterInputs<ServerRouter>;
export type RouterOutput = inferRouterOutputs<ServerRouter>;

export type { ServerRouter } from '../server/index.js';
export * from '@trpc/client';
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 12 — Web app: better-auth client

Ab frontend side. better-auth ka apna React client hai jo signup, login,
logout, session-fetch sab handle karta hai — humein khud fetch calls likhne
ki zaroorat nahi.

**📦 Package:**

```bash
cd apps/web
pnpm add better-auth
```

📄 **File: `apps/web/lib/auth-client.ts`** — better-auth ka React client instance

```ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  /** The base URL of the server (optional if you're using the same domain) */
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5000',
});
```

Isse `authClient.signUp.email(...)`, `authClient.signIn.email(...)`,
`authClient.signOut()` jaise methods milte hain — sab automatically cookies
handle karte hain.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 13 — Web app: tRPC client wiring

**📦 Packages:**

```bash
cd apps/web
pnpm add @repo/trpc @trpc/tanstack-react-query @tanstack/react-query
```

📄 **File: `apps/web/trpc/client.ts`** — typed React context/hooks

```ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { ServerRouter } from '@repo/trpc/client/index';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<ServerRouter>();
```

📄 **File: `apps/web/trpc/create-client.ts`** — trpc client + query client + options proxy

```ts
import { createTRPCClient, httpBatchLink, loggerLink } from '@repo/trpc/client';
import type { ServerRouter } from '@repo/trpc/client/index';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';

export const queryClient = new QueryClient();

const trpcClient = createTRPCClient<ServerRouter>({
  links: [
    loggerLink(),
    httpBatchLink({
      url: process.env.BASE_URL?.concat('/trpc') || 'http://localhost:5000/trpc',

      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include', // session cookie yahi se travel karti hai
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

**Important difference pehle wale JWT setup se:** yahan `headers()` me koi
manual `Authorization: Bearer` token nahi bhejna padta! better-auth ka
session cookie (`credentials: 'include'` ki wajah se) automatically har
request ke saath jaata hai, aur backend context (STEP 8) usko khud verify
kar leta hai. Iska matlab yahan token-store jaisi cheez ki zaroorat nahi.

📄 **File: `apps/web/providers/Providers.tsx`** — QueryClientProvider wrapper

```tsx
'use client';

import { queryClient } from '../trpc/create-client';
import { QueryClientProvider } from '@tanstack/react-query';

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export default Providers;
```

📄 **File: `apps/web/app/layout.tsx`** — root layout me wrap karo

```tsx
import type { Metadata } from 'next';
import './globals.css';
import Providers from '../providers/Providers';

export const metadata: Metadata = {
  title: 'Create Next App',
  description: 'Generated by create next app',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 14 — Usage: signup + protected query

📄 **File: `apps/web/app/page.tsx`** — better-auth se signup + protected tRPC query dono ek jagah

```tsx
'use client';

import React, { useState } from 'react';
import { authClient } from '../lib/auth-client';
import { useQuery } from '@tanstack/react-query';
import { trpc } from '../trpc/create-client';

const page = () => {
  const [email, setEmail] = useState('khan@gmail.com');
  const [password, setPassword] = useState('Intekhab@123');
  const [name, setName] = useState('khan intekhab');

  async function createAccount() {
    const result = await authClient.signUp.email({
      email,
      password,
      name,
    });

    console.log(result);
  }

  const { data } = useQuery(trpc.todo.getTodo.queryOptions());

  return (
    <div>
      <button onClick={createAccount}>Create an Account</button>
      <br />
      <br />
      <button>{data ? data.TODO : ''}</button>
    </div>
  );
};

export default page;
```

`authClient.signUp.email()` call hote hi better-auth backend me
`/api/auth/sign-up/email` hit karta hai, user + account rows create hoti
hain, aur session cookie automatically browser me set ho jaati hai.
Uske baad `trpc.todo.getTodo` (protected route) apne aap kaam karega — koi
extra login step ya token save karne ki zaroorat nahi, kyunki cookie
already set hai.

Login/logout isi tarah:

```ts
await authClient.signIn.email({ email, password });
await authClient.signOut();
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 📁 Final file map

```
packages/database/
  package.json                     → @repo/database definition + migration scripts
  drizzle.config.ts                → drizzle-kit config
  schema.ts                        → re-exports generated auth-schema
  index.ts                         → drizzle client (db)
  models/auth-schema.ts            → 🤖 auto-generated by `pnpm db:schema` (better-auth CLI)

packages/services/
  package.json                     → @repo/services definition + db:schema script
  auth/auth.ts                     → betterAuth() instance — core config

packages/trpc/
  server/
    context.ts                     → auth.api.getSession() se session fetch
    trpc.ts                        → authenticatedProcedure (ctx.session check)
    routes/health.ts                → public route
    routes/todo.ts                  → protected example route
    index.ts                        → serverRouter merge
  client/index.ts                   → type-only exports

apps/api/
  src/app.ts                        → toNodeHandler(auth) mount (json() se pehle!) + trpc/openapi
  src/server.ts                     → http server start

apps/web/
  lib/auth-client.ts                → createAuthClient (signup/login/logout)
  trpc/client.ts                    → TRPCProvider/useTRPC
  trpc/create-client.ts             → trpc client (credentials: include, no manual header)
  providers/Providers.tsx           → QueryClientProvider wrapper
  app/layout.tsx                    → wraps app with Providers
  app/page.tsx                      → usage example
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🧠 Gotchas / yaad rakhne wali baatein

- **`toNodeHandler(auth)` hamesha `express.json()` se pehle mount karo** —
  is guide ki sabse critical baat. Order galat hone par better-auth ka body
  parsing fail ho jaata hai.
- **`trustedOrigins` set karna mat bhoolo** `auth.ts` me — warna frontend se
  signup/login CORS/CSRF ki wajah se reject ho jaayega, chahe Express `cors()`
  sahi ho.
- **Cookie-based, JWT nahi** — pehle wale guide (`tRPC-Auth-Database.md`) me
  humne khud JWT + Bearer header banaya tha. Yahan better-auth khud session
  cookie manage karta hai — frontend me `credentials: 'include'` kaafi hai,
  koi token-store ya manual header nahi chahiye.
- **Schema regenerate karna hoga jab bhi better-auth config badle** — agar
  `auth.ts` me naya plugin ya social provider add karo, `pnpm db:schema`
  dobara chalao, phir `db:generate` + `db:migrate`.
- **`user` table me password nahi hota** — better-auth password
  `account.password` me store karta hai (email/password provider ke liye
  ek "account" banta hai), `user` table sirf profile info rakhta hai.
- **Server aur client dono jagah `better-auth` install hona chahiye** —
  server side `better-auth/node` + `better-auth/adapters/drizzle` use
  karta hai, client side `better-auth/react` use karta hai — same package,
  do alag entry points.