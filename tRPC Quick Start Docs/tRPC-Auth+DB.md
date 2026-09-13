# tRPC Auth + Database Setup Guide — Step by Step

**Prerequisite:** Ye guide `tRPC.md` (base tRPC setup) ke upar build hota hai.
Agar `packages/trpc/server/trpc.ts`, `context.ts`, `index.ts`, aur
`routes/health/route.ts` abhi tak nahi bane, pehle `tRPC.md` follow karo.

Is guide me hum add karenge:
- **Database layer** — Drizzle ORM + Postgres (`@repo/database`)
- **Services layer** — business logic, JWT, password hashing (`@repo/services`)
- **Full auth flow** — register, login, refresh-token, logout, get logged-in user info
- **Client-side Authorization header** — access token ko frontend se backend tak bhejna

Overall flow:

```
STEP 10 → Environment variables (.env)
STEP 11 → @repo/database package (Drizzle schema + client)
STEP 12 → @repo/services package (JWT, ApiError, UserService — sab auth methods)
STEP 13 → @repo/services ko @repo/trpc me wire karo
STEP 14 → Context update — getAuthorizationHeader add karo (existing file)
STEP 15 → authenticatedProcedure update — Bearer token verify (existing file)
STEP 16 → path-generator utility
STEP 17 → Auth routes — register, login, refresh-token, logout, user-info
STEP 18 → Auth router ko root router me merge karo (existing file)
STEP 19 → Web client — Authorization header wiring (missing piece)
STEP 20 → Login/logout flow ek component me use karna
```

<br>

═══════════════════════════════════════════════════════════════════════════

## ⚠️ Naye internal packages: `@repo/database` aur `@repo/services`

Jaise `@repo/trpc` npm se nahi aata, waise hi `@repo/database` aur
`@repo/services` bhi **workspace packages** hain jo tumhe khud likhne hain
`packages/database/` aur `packages/services/` ke andar. Inhe bhi
`"workspace:*"` se link kiya jaata hai. `pnpm-workspace.yaml` me already
`packages/*` cover hai, to naya kuch add karne ki zaroorat nahi.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 10 — Environment variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/luqma

# JWT secrets (kabhi commit mat karo)
ACCESS_TOKEN=your-access-token-secret
REFRESH_TOKEN=your-refresh-token-secret

# Token expiry (seconds)
ACCESS_TOKEN_EXPIRES_IN=300        # 5 minutes
REFRESH_TOKEN_EXPIRES_IN=604800    # 7 days

NODE_ENV=development

# Backend (apps/api)
BASE_URL=http://localhost:5000
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 11 — `@repo/database` package (Drizzle + Postgres)

<br>

### 11.1 — Package setup + install

```bash
mkdir -p packages/database/models
cd packages/database
pnpm add drizzle-orm pg dotenv zod
pnpm add -D drizzle-kit @types/pg tsx
```

📄 **File: `packages/database/package.json`**

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
    "pg": "^8.23.0",
    "zod": "^4.5.4"
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

### 11.2 — Table schema

📄 **File: `packages/database/models/user.ts`**

```ts
import { pgTable, varchar, uuid, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['customer', 'restaurant_owner', 'delivery_partner', 'admin']);

export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),

  fullName: varchar('full_name', { length: 100 }).notNull(),

  email: varchar('email', { length: 322 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),

  phone: varchar('phone', { length: 15 }).notNull().unique(),
  phoneVerified: boolean('phone_verified').notNull().default(false),

  password: text('password'),
  salt: text('salt'),

  profileImageUrl: text('profile_image_url'),

  role: roleEnum().notNull().default('customer'),

  isActive: boolean('is_active').notNull().default(true),

  refreshToken: text('refresh_token'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().$onUpdate(() => new Date()),
});
```

**Yaad rakho:** `password` aur `refreshToken` kabhi bhi plain text me store
nahi hote — `password` hashed hota hai (STEP 12.6 me dekhoge), aur
`refreshToken` bhi hashed store hota hai, exact token nahi.

📄 **File: `packages/database/schema.ts`** — sab models ko ek jagah se re-export karo

```ts
export * from './models/user.js';
```

Naya table add karna ho future me: `models/<table>.ts` banao, `schema.ts` me
export add kar do.

<br>

---

### 11.3 — Drizzle config (migrations kahan generate hongi)

📄 **File: `packages/database/drizzle.config.ts`**

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

<br>

---

### 11.4 — DB client (actual connection)

📄 **File: `packages/database/index.ts`** — Drizzle client jo baaki packages import karenge

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';

const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL!,
    // ssl: true   // production Postgres (e.g. Supabase, Neon) me enable karo
  },
});

// db instance ke saath drizzle-orm ke helpers (eq, or, and, ...) bhi yahin se re-export
export * from 'drizzle-orm';
export default db;
```

`export * from 'drizzle-orm'` isliye taaki consuming packages (jaise
`@repo/services`) `eq`, `or` jaise query helpers `@repo/database` se hi
import kar sakein, alag se `drizzle-orm` install karne ki zaroorat na pade.

<br>

---

### 11.5 — Migration generate + run

```bash
pnpm db:generate
pnpm db:migrate
```

Schema change karne ke baad hamesha `db:generate` phir `db:migrate` chalao.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 12 — `@repo/services` package (business logic layer)

Ye package **actual logic** rakhta hai — password hashing, JWT generate/verify,
user create/fetch. `packages/trpc` ke routes sirf isi service ko call karte
hain, database ya JWT se seedha kaam nahi karte.

<br>

### 12.1 — Package setup + install

```bash
mkdir -p packages/services/user/utils
cd packages/services
pnpm add @repo/database jsonwebtoken zod
pnpm add -D @types/jsonwebtoken @types/node
```

📄 **File: `packages/services/package.json`**

```json
{
  "name": "@repo/services",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "dependencies": {
    "@repo/database": "workspace:*",
    "jsonwebtoken": "^9.0.3",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.10",
    "@types/node": "26.4.1"
  }
}
```

<br>

---

### 12.2 — Constants

📄 **File: `packages/services/user/utils/constants.ts`**

```ts
export type ROLE_TYPE = 'customer' | 'restaurant_owner' | 'delivery_partner' | 'admin';
```

<br>

---

### 12.3 — `ApiError` class (consistent error shape)

Ek custom error class jisse har jagah same tarah HTTP-status-aware errors
throw ho saken.

📄 **File: `packages/services/user/utils/api-error.ts`**

```ts
class ApiError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message);
    Error.captureStackTrace(this.constructor);
  }

  public static unauthorized(message = 'Unauthorized', code?: string) {
    return new ApiError(401, message, code);
  }

  public static notFound(message = 'Not Found', code?: string) {
    return new ApiError(404, message, code);
  }

  public static forbidden(message = 'Forbidden', code?: string) {
    return new ApiError(403, message, code);
  }

  public static badRequest(message = 'Bad Request', code?: string) {
    return new ApiError(400, message, code);
  }

  public static conflict(message = 'Conflict', code?: string) {
    return new ApiError(409, message, code);
  }

  public static tooManyRequests(message = 'Too Many Requests', code?: string) {
    return new ApiError(429, message, code);
  }

  public static internalServerError(message = 'Internal Server Error', code?: string) {
    return new ApiError(500, message, code);
  }
}

export default ApiError;

```

Usage: `throw ApiError.notFound("User with this id doesn't exists")`.

<br>

---

### 12.4 — JWT utils (access + refresh)

📄 **File: `packages/services/user/utils/jwt.ts`**

```ts
import jwt from 'jsonwebtoken';
import type { ROLE_TYPE } from './constants.js';

export type AccessTokenPayload = {
  sub: string;
  role: ROLE_TYPE;
};

export type RefreshTokenPayload = {
  sub: string;
};

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error('ACCESS_TOKEN or REFRESH_TOKEN is missing in .env');
}

export const generateAccessToken = (payload: AccessTokenPayload) => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
    expiresIn: Number(process.env.ACCESS_TOKEN_EXPIRES_IN) ?? 5 * 60, // 5 minutes
  });
};

export const verifyAccessToken = (token: string) => {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
  } catch (error: unknown) {
    if (error instanceof jwt.TokenExpiredError) throw new Error('Access token expired');
    if (error instanceof jwt.JsonWebTokenError) throw new Error('Invalid access token');
    throw new Error('Access token verification failed');
  }
};

export const generateRefreshToken = (payload: RefreshTokenPayload) => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, {
    expiresIn: Number(process.env.REFRESH_TOKEN_EXPIRES_IN) ?? 7 * 24 * 60 * 60, // 7 days
  });
};

export const verifyRefreshToken = (token: string) => {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
  } catch (error: unknown) {
    if (error instanceof jwt.TokenExpiredError) throw new Error('Refresh token expired');
    if (error instanceof jwt.JsonWebTokenError) throw new Error('Invalid refresh token');
    throw new Error('Refresh token verification failed');
  }
};
```

<br>

**Pattern:** access token short-lived (5 min) hota hai aur client memory /
header me rehta hai; refresh token long-lived (7 din) hota hai aur httpOnly
cookie me store hota hai — isse XSS se refresh token safe rehta hai.

---

### 12.5 — Input validation models (zod) — sab auth operations ke liye

📄 **File: `packages/services/user/model.ts`**

```ts
import { z } from 'zod';

export const getUserWithEmailOrPhoneInput = z
  .object({
    email: z.email().max(322).describe('email of the user').optional(),
    phone: z.string().min(10).describe('phone number of the user').optional(),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), { message: 'either email or phone is required' });

export type GetUserWithEmailOrPhoneInputType = z.infer<typeof getUserWithEmailOrPhoneInput>;

export const createUserWithEmailAndPasswordInput = z.object({
  fullName: z.string().min(2).max(100).describe('name of the user'),
  email: z.email().max(322).describe('email of the user'),
  phone: z.string().min(10).max(15).describe('phone number of the user'),
  password: z.string().min(2).max(66).describe('password of the user'),
});

export type CreateUserWithEmailAndPasswordInputType = z.infer<typeof createUserWithEmailAndPasswordInput>;

export const loginUserWithEmailAndPasswordInput = z
  .object({
    email: z.email().max(322).describe('email of the user').optional(),
    phone: z.string().min(10).max(15).describe('phone number of the user').optional(),
    password: z.string().min(8).max(66).describe('password of the user'),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), { message: 'either email or phone is required' });

export type LoginUserWithEmailAndPasswordInputType = z.infer<typeof loginUserWithEmailAndPasswordInput>;

export const renewUserAccessTokenAndRefreshTokenInput = z.object({
  refreshToken: z.string().describe('refresh_token of the user'),
});

export type RenewUserAccessTokenAndRefreshTokenInputType = z.infer<typeof renewUserAccessTokenAndRefreshTokenInput>;

export const logoutUserInput = z.object({
  id: z.string().describe('uuid of the user'),
});

export type LogoutUserInputType = z.infer<typeof logoutUserInput>;

export const getLoggedInUserInfoInput = z.object({
  id: z.string().describe('uuid of the user'),
});

export type GetLoggedInUserInfoInputType = z.infer<typeof getLoggedInUserInfoInput>;
```

Ye service-level validation hai — router-level zod schema (STEP 17) alag
rehta hai, service apna input khud bhi `.parseAsync()` se validate karta hai
taaki service kisi bhi jagah se call ho, safety guaranteed rahe.

Ek-ek schema kis liye hai:
| Schema | Kis method ke liye |
|---|---|
| `getUserWithEmailOrPhoneInput` | internal lookup (private method) |
| `createUserWithEmailAndPasswordInput` | register |
| `loginUserWithEmailAndPasswordInput` | login |
| `renewUserAccessTokenAndRefreshTokenInput` | refresh-token |
| `logoutUserInput` | logout |
| `getLoggedInUserInfoInput` | current user info |

<br>

---

### 12.6 — `UserService` class (ek-ek method karke build karo)

**12.6.1 — Do hashing helpers (password ke liye alag, token ke liye alag)**

📄 **File: `packages/services/user/index.ts`**

```ts
import crypto from 'node:crypto';

class UserService {
  // password ke liye: random salt + HMAC — same password bhi alag user ke liye alag hash degi
  private generateHashedPassword(salt: string, password: string) {
    return crypto.createHmac('sha256', salt).update(password).digest('hex');
  }

  // refresh token ke liye: plain SHA-256 — bas DB me raw token store hone se bachne ke liye
  private generateHash(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export default UserService;
```

Do alag hashing functions kyun: password ke liye salt zaroori hai (rainbow
table attacks se bachne ke liye), lekin refresh token already random +
unguessable hota hai (JWT), isliye usko sirf ek plain hash se DB me store
karna kaafi hai — salt ki zaroorat nahi.

**12.6.2 — Private lookup: `getUserWithEmailOrPhone`**

```bash
# already installed: @repo/database
```

📄 **File: `packages/services/user/index.ts`** (update)

```ts
import crypto from 'node:crypto';
import db, { eq, or } from '@repo/database/index.js';
import { usersTable } from '@repo/database/schema.js';
import { getUserWithEmailOrPhoneInput, type GetUserWithEmailOrPhoneInputType } from './model.js';

class UserService {
  private generateHashedPassword(salt: string, password: string) {
    return crypto.createHmac('sha256', salt).update(password).digest('hex');
  }

  private generateHash(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async getUserWithEmailOrPhone(data: GetUserWithEmailOrPhoneInputType) {
    const { email, phone } = await getUserWithEmailOrPhoneInput.parseAsync(data);

    const conditions = [];
    if (email) conditions.push(eq(usersTable.email, email));
    if (phone) conditions.push(eq(usersTable.phone, phone));

    const user = await db.select().from(usersTable).where(or(...conditions));
    return user[0];
  }
}

export default UserService;
```

**12.6.3 — `getUserInfoById` (public)**

📄 **File: `packages/services/user/index.ts`** (update)

```ts
import ApiError from './utils/api-error.js';

// ... class ke andar, private methods ke baad:

  public async getUserInfoById(id: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));

    if (!user) {
      throw ApiError.notFound("User with this id doesn't exists");
    }

    return user;
  }
```

**12.6.4 — `createUserWithEmailAndPassword` (register)**

```ts
import { createUserWithEmailAndPasswordInput, type CreateUserWithEmailAndPasswordInputType } from './model.js';
import { generateAccessToken, generateRefreshToken } from './utils/jwt.js';

// ... class ke andar:

  public async createUserWithEmailAndPassword(payload: CreateUserWithEmailAndPasswordInputType) {
    // step:1 extract the validated input payload through zod
    const { fullName, email, phone, password } = await createUserWithEmailAndPasswordInput.parseAsync(payload);

    // step:2 check the user is already registered with same email or phone
    const existingUser = await this.getUserWithEmailOrPhone({ email, phone });
    if (existingUser) {
      throw ApiError.conflict('User with this email or phone already registered');
    }

    // step:3 generate salt and hash the user password
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.generateHashedPassword(salt, password);

    // step:4 create user in the DB
    const [user] = await db
      .insert(usersTable)
      .values({ fullName, email, phone, salt, password: hash })
      .returning({ id: usersTable.id, role: usersTable.role });

    if (!user) {
      throw ApiError.internalServerError('Something went wrong while creating account');
    }

    // step:5 - TODO: send otp on email and phone to verify user

    // step:6 generate accesstoken and refreshtoken for user
    const accessToken = generateAccessToken({ sub: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ sub: user.id });

    // step:7 hash the refreshtoken and store in DB
    const hashedRefreshToken = this.generateHash(refreshToken);
    await db.update(usersTable).set({ refreshToken: hashedRefreshToken }).where(eq(usersTable.id, user.id));

    // step:8 send userId, accesstoken and refreshtoken to the procedure
    return { id: user.id, accessToken, refreshToken };
  }
```

**12.6.5 — `loginUserWithEmailAndPassword` (NEW)**

```ts
import { loginUserWithEmailAndPasswordInput, type LoginUserWithEmailAndPasswordInputType } from './model.js';

// ... class ke andar:

  public async loginUserWithEmailAndPassword(payload: LoginUserWithEmailAndPasswordInputType) {
    // step:1 extract user credentials
    const { email, phone, password } = await loginUserWithEmailAndPasswordInput.parseAsync(payload);

    // step:2 find the user with email or phone
    const user = await this.getUserWithEmailOrPhone({ email, phone });
    if (!user) throw ApiError.notFound("User doesn't exists, Please check your credentials");

    // step:3 - TODO: check email/phone verified status here before allowing login

    // step:4 compare input password's hash with stored hash
    const hash = this.generateHashedPassword(user.salt!, password);
    if (hash !== user.password) {
      throw ApiError.unauthorized('invalid or incorrect user credentials');
    }

    // step:5 generate accesstoken and refreshtoken
    const accessToken = generateAccessToken({ sub: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ sub: user.id });

    // step:6 hash the refreshtoken and store in DB
    const hashedRefreshToken = this.generateHash(refreshToken);
    await db.update(usersTable).set({ refreshToken: hashedRefreshToken }).where(eq(usersTable.id, user.id));

    // step:7 return to procedure
    return { id: user.id, accessToken, refreshToken };
  }
```

**12.6.6 — `renewUserAccessTokenAndRefreshToken` (NEW — refresh token rotation)**

```ts
import { renewUserAccessTokenAndRefreshTokenInput, type RenewUserAccessTokenAndRefreshTokenInputType } from './model.js';
import { verifyRefreshToken, type RefreshTokenPayload } from './utils/jwt.js';

// ... class ke andar:

  public async renewUserAccessTokenAndRefreshToken(payload: RenewUserAccessTokenAndRefreshTokenInputType) {
    // step:1 extract refresh-token
    const { refreshToken } = await renewUserAccessTokenAndRefreshTokenInput.parseAsync(payload);

    // step:2 verify it was signed by our secret
    const decoded = verifyRefreshToken(refreshToken) as RefreshTokenPayload;
    if (!decoded.sub) throw ApiError.unauthorized('invalid or expired refresh token');

    // step:3 find user in DB
    const [user] = await db
      .select({ id: usersTable.id, role: usersTable.role, refreshToken: usersTable.refreshToken })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.sub));

    if (!user) throw ApiError.unauthorized('User no longer exists');

    // step:4 compare hash of incoming token with what's stored
    const hashedRefreshToken = this.generateHash(refreshToken);
    if (hashedRefreshToken !== user.refreshToken) {
      throw ApiError.unauthorized('invalid or incorrect refresh token');
    }

    // step:5 issue brand-new tokens (rotation — old refresh token becomes useless)
    const newAccessToken = generateAccessToken({ sub: user.id, role: user.role });
    const newRefreshToken = generateRefreshToken({ sub: user.id });

    // step:6 store the new hashed refresh token
    const newHashedRefreshToken = this.generateHash(newRefreshToken);
    await db.update(usersTable).set({ refreshToken: newHashedRefreshToken }).where(eq(usersTable.id, user.id));

    // step:7 return new tokens
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
```

**Refresh token rotation** — har refresh call pe naya refresh token bhi
issue hota hai aur DB me purana replace ho jaata hai. Isse agar koi purana
refresh token chura le, wo sirf ek baar use ho sakta hai.

**12.6.7 — `logoutUser` (NEW)**

```ts
import { logoutUserInput, type LogoutUserInputType } from './model.js';

// ... class ke andar:

  public async logoutUser(payload: LogoutUserInputType) {
    const { id } = await logoutUserInput.parseAsync(payload);

    // DB se refreshToken hata do — purana refresh token turant invalid ho jaata hai
    await db.update(usersTable).set({ refreshToken: null }).where(eq(usersTable.id, id));
    return;
  }
```

**12.6.8 — `getLoggedInUserInfo` (NEW)**

```ts
import { getLoggedInUserInfoInput, type GetLoggedInUserInfoInputType } from './model.js';

// ... class ke andar:

  public async getLoggedInUserInfo(payload: GetLoggedInUserInfoInputType) {
    const { id } = await getLoggedInUserInfoInput.parseAsync(payload);

    const { id: userId, fullName, email, emailVerified, phone, phoneVerified, profileImageUrl, role, isActive } =
      await this.getUserInfoById(id);

    return { id: userId, fullName, email, emailVerified, phone, phoneVerified, profileImageUrl, role, isActive };
  }
```

`getUserInfoById` (12.6.3) already sensitive fields (`password`, `salt`)
return karta hai, isliye `getLoggedInUserInfo` sirf safe fields destructure
karke wahi return karta hai — ye "public shape" hai jo API se bahar jaata hai.

**Poora `UserService` final version:**

📄 **File: `packages/services/user/index.ts`** (complete)

```ts
import crypto from 'node:crypto';
import db, { eq, or } from '@repo/database/index.js';
import { usersTable } from '@repo/database/schema.js';
import {
  createUserWithEmailAndPasswordInput,
  getLoggedInUserInfoInput,
  getUserWithEmailOrPhoneInput,
  loginUserWithEmailAndPasswordInput,
  logoutUserInput,
  renewUserAccessTokenAndRefreshTokenInput,
  type CreateUserWithEmailAndPasswordInputType,
  type GetLoggedInUserInfoInputType,
  type GetUserWithEmailOrPhoneInputType,
  type LoginUserWithEmailAndPasswordInputType,
  type LogoutUserInputType,
  type RenewUserAccessTokenAndRefreshTokenInputType,
} from './model.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, type RefreshTokenPayload } from './utils/jwt.js';
import ApiError from './utils/api-error.js';

class UserService {
  private generateHashedPassword(salt: string, password: string) {
    return crypto.createHmac('sha256', salt).update(password).digest('hex');
  }

  private generateHash(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async getUserWithEmailOrPhone(data: GetUserWithEmailOrPhoneInputType) {
    const { email, phone } = await getUserWithEmailOrPhoneInput.parseAsync(data);

    const conditions = [];
    if (email) conditions.push(eq(usersTable.email, email));
    if (phone) conditions.push(eq(usersTable.phone, phone));

    const user = await db.select().from(usersTable).where(or(...conditions));
    return user[0];
  }

  public async getUserInfoById(id: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) throw ApiError.notFound("User with this id doesn't exists");
    return user;
  }

  public async createUserWithEmailAndPassword(payload: CreateUserWithEmailAndPasswordInputType) {
    const { fullName, email, phone, password } = await createUserWithEmailAndPasswordInput.parseAsync(payload);

    const existingUser = await this.getUserWithEmailOrPhone({ email, phone });
    if (existingUser) throw ApiError.conflict('User with this email or phone already registered');

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.generateHashedPassword(salt, password);

    const [user] = await db
      .insert(usersTable)
      .values({ fullName, email, phone, salt, password: hash })
      .returning({ id: usersTable.id, role: usersTable.role });

    if (!user) throw ApiError.internalServerError('Something went wrong while creating account');

    const accessToken = generateAccessToken({ sub: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ sub: user.id });

    const hashedRefreshToken = this.generateHash(refreshToken);
    await db.update(usersTable).set({ refreshToken: hashedRefreshToken }).where(eq(usersTable.id, user.id));

    return { id: user.id, accessToken, refreshToken };
  }

  public async loginUserWithEmailAndPassword(payload: LoginUserWithEmailAndPasswordInputType) {
    const { email, phone, password } = await loginUserWithEmailAndPasswordInput.parseAsync(payload);

    const user = await this.getUserWithEmailOrPhone({ email, phone });
    if (!user) throw ApiError.notFound("User doesn't exists, Please check your credentials");

    const hash = this.generateHashedPassword(user.salt!, password);
    if (hash !== user.password) throw ApiError.unauthorized('invalid or incorrect user credentials');

    const accessToken = generateAccessToken({ sub: user.id, role: user.role });
    const refreshToken = generateRefreshToken({ sub: user.id });

    const hashedRefreshToken = this.generateHash(refreshToken);
    await db.update(usersTable).set({ refreshToken: hashedRefreshToken }).where(eq(usersTable.id, user.id));

    return { id: user.id, accessToken, refreshToken };
  }

  public async renewUserAccessTokenAndRefreshToken(payload: RenewUserAccessTokenAndRefreshTokenInputType) {
    const { refreshToken } = await renewUserAccessTokenAndRefreshTokenInput.parseAsync(payload);

    const decoded = verifyRefreshToken(refreshToken) as RefreshTokenPayload;
    if (!decoded.sub) throw ApiError.unauthorized('invalid or expired refresh token');

    const [user] = await db
      .select({ id: usersTable.id, role: usersTable.role, refreshToken: usersTable.refreshToken })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.sub));

    if (!user) throw ApiError.unauthorized('User no longer exists');

    const hashedRefreshToken = this.generateHash(refreshToken);
    if (hashedRefreshToken !== user.refreshToken) throw ApiError.unauthorized('invalid or incorrect refresh token');

    const newAccessToken = generateAccessToken({ sub: user.id, role: user.role });
    const newRefreshToken = generateRefreshToken({ sub: user.id });

    const newHashedRefreshToken = this.generateHash(newRefreshToken);
    await db.update(usersTable).set({ refreshToken: newHashedRefreshToken }).where(eq(usersTable.id, user.id));

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  public async logoutUser(payload: LogoutUserInputType) {
    const { id } = await logoutUserInput.parseAsync(payload);
    await db.update(usersTable).set({ refreshToken: null }).where(eq(usersTable.id, id));
    return;
  }

  public async getLoggedInUserInfo(payload: GetLoggedInUserInfoInputType) {
    const { id } = await getLoggedInUserInfoInput.parseAsync(payload);

    const { id: userId, fullName, email, emailVerified, phone, phoneVerified, profileImageUrl, role, isActive } =
      await this.getUserInfoById(id);

    return { id: userId, fullName, email, emailVerified, phone, phoneVerified, profileImageUrl, role, isActive };
  }
}

export default UserService;
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 13 — `@repo/services` ko `@repo/trpc` me wire karo

**📦 Package:**

```bash
cd packages/trpc
pnpm add @repo/services
```

📄 **File: `packages/trpc/server/services/index.ts`** — singleton instance jo routes use karenge

```ts
import UserService from '@repo/services/user/index.js';

export const userService = new UserService();
```

Isse har jagah `new UserService()` banane ke bajaye, ek hi shared instance
import hota hai.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 14 — Context update: `getAuthorizationHeader` add karo

**(`packages/trpc/server/context.ts` — existing file, update karo)**

📄 **File: `packages/trpc/server/context.ts`**

```ts
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { getCookie as getCookieUtils, setCookie as setCookieUtils, clearCookie as clearCookieUtils } from './utils/cookie.js';
import type { CookieOptions } from 'express';

export interface ITRPCUserContext {
  id: string;
}

export interface ITRPCContext {
  setCookie: (name: string, value: string, opts?: CookieOptions) => void;
  getCookie: (name: string) => string | undefined;
  clearCookie: (name: string) => void;

  getAuthorizationHeader: () => string | undefined;
  user?: ITRPCUserContext | undefined;
}

export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
  const ctx: ITRPCContext = {
    setCookie(name: string, value: string, opts?: CookieOptions) {
      return setCookieUtils(res, name, value, opts);
    },

    getCookie(name: string) {
      return getCookieUtils(req, name);
    },

    clearCookie(name: string) {
      return clearCookieUtils(res, name);
    },

    getAuthorizationHeader() {
      return req.headers.authorization;
    },

    user: undefined,
  };

  return ctx;
};

export type Context = Awaited<ReturnType<typeof createContext>>;
```
**Diff summary:** sirf `getAuthorizationHeader()` method add hua — baaki
context wahi hai jo `tRPC.md` me bana tha.

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 15 — `authenticatedProcedure` update: Bearer token verify

**(`packages/trpc/server/trpc.ts` — existing file, update karo)**

Pehle ye procedure sirf cookie check karta tha aur user object add krta tha. Ab hum ise **Bearer access
token** verify karne wala banayenge, aur DB se real user fetch karke context
me daalenge.

📄 **File: `packages/trpc/server/trpc.ts`**

```ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import type { OpenApiMeta } from 'trpc-to-openapi';
import { verifyAccessToken, type AccessTokenPayload } from '@repo/services/user/utils/jwt.js';
import { userService } from './services/index.js';

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const authenticatedProcedure = t.procedure.use(async (options) => {
  const { ctx, next } = options;

  // step:1 header nikalo
  const authHeader = ctx.getAuthorizationHeader();
  if (!authHeader) {
    throw new TRPCError({ message: 'Authorization header is missing', code: 'UNAUTHORIZED' });
  }

  // step:2 "Bearer <token>" se token nikalo
  let token;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token) {
    throw new TRPCError({ message: 'invalid bearer token', code: 'UNAUTHORIZED' });
  }

  // step:3 token verify karo
  const decoded = verifyAccessToken(token) as AccessTokenPayload;

  // step:4 DB se real user fetch karo — sirf token trust nahi karte
  const userInfo = await userService.getUserInfoById(decoded.sub);
  if (!userInfo || !userInfo.isActive) {
    throw new TRPCError({ message: "user doesn't exists or have been blocked", code: 'UNAUTHORIZED' });
  }

  // step:5 context me user daal do
  const user = {
    id: userInfo.id,
    email: userInfo.email,
    role: userInfo.role,
    isActive: userInfo.isActive,
  };

  return next({ ctx: { ...ctx, user } });
});
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 16 — `path-generator` utility

Route paths ko safely combine karne ke liye ek chhota helper — extra slashes
handle karta hai.

📄 **File: `packages/trpc/server/utils/path-generator.ts`**

```ts
// this function combines a base path + sub-path safely (no double/missing slashes)
export function generatePath(base: string) {
  return function (path: string): `/${string}` {
    const cleanBase = base.replace(/^\/+|\/+$/g, '');
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    return `/${[cleanBase, cleanPath].filter(Boolean).join('/')}`;
  };
}

// Example:
// const authPath = generatePath("/auth");
// authPath("//create") -> "/auth/create"
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 17 — Auth routes (register, login, refresh-token, logout, user-info)

<br>

### 17.1 — Models (input/output for every endpoint)

📄 **File: `packages/trpc/server/routes/auth/model.ts`**

```ts
import { z } from 'zod';

export const undefinedModel = z.undefined();

export const createUserWithEmailAndPasswordInputModel = z.object({
  fullName: z.string().min(2).max(100).describe('name of the user'),
  email: z.email().max(322).describe('email of the user'),
  phone: z.string().min(10).max(15).describe('phone number of the user'),
  password: z.string().min(2).max(66).describe('password of the user'),
});

export const createUserWithEmailAndPasswordOutputModel = z.object({
  id: z.string().describe('uuid of the created user'),
  accessToken: z.string().describe('access_token of the created user'),
});

export const loginUserWithEmailAndPasswordInputModel = z
  .object({
    email: z.email().max(322).describe('email of the user').optional(),
    phone: z.string().min(10).max(15).describe('phone number of the user').optional(),
    password: z.string().min(8).max(66).describe('password of the user'),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), { message: 'either email or phone is required' });

export const loginUserWithEmailAndPasswordOutputModel = z.object({
  id: z.string().describe('uuid of the user'),
  accessToken: z.string().describe('access_token of the user'),
});

export const renewUserAccessTokenAndRefreshTokenOutputModel = z.object({
  accessToken: z.string().describe('access_token of the user'),
});

export const logoutUserOutputModel = z.object({
  ok: z.literal(true),
});

export const getLoggedInUserInfoOutputModel = z.object({
  id: z.string().describe('uuid of the user'),
  fullName: z.string().describe('name of the user'),
  email: z.email().describe('email of the user'),
  emailVerified: z.boolean().describe('is user email verified'),
  phone: z.string().describe('phone number of the user'),
  phoneVerified: z.boolean().describe('is user phone number verified'),
  profileImageUrl: z.string().describe('profile image of the user').nullable(),
  role: z.string().describe('role of the user'),
  isActive: z.boolean().describe('user account is active or not'),
});
```

<br>

---

### 17.2 — `createUserWithEmailAndPassword` (register)

📄 **File: `packages/trpc/server/routes/auth/route.ts`**

```ts
import ApiError from '@repo/services/user/utils/api-error.js';
import { userService } from '../../services/index.js';
import { authenticatedProcedure, publicProcedure, router } from '../../trpc.js';
import { generatePath } from '../../utils/path-generator.js';
import {
  createUserWithEmailAndPasswordInputModel,
  createUserWithEmailAndPasswordOutputModel,
} from './model.js';

const TAGS = ['Authentication'];
const getPath = generatePath('/auth');

export const authRouter = router({
  createUserWithEmailAndPassword: publicProcedure
    .meta({ openapi: { method: 'POST', path: getPath('/create'), tags: TAGS } })
    .input(createUserWithEmailAndPasswordInputModel)
    .output(createUserWithEmailAndPasswordOutputModel)
    .mutation(async ({ input, ctx }) => {
      const { fullName, email, password, phone } = input;

      const { accessToken, refreshToken, id } = await userService.createUserWithEmailAndPassword({
        fullName,
        email,
        password,
        phone,
      });

      ctx.setCookie('refresh-token', refreshToken);

      return { id, accessToken };
    }),
});
```

`publicProcedure` — koi bhi is endpoint ko call kar sakta hai, auth ki
zaroorat nahi (naya user hi to register ho raha hai).

<br>

---

### 17.3 — `loginUserWithEmailAndPassword` (login) add karo

📄 **File: `packages/trpc/server/routes/auth/route.ts`** (update — router ke andar add karo)

```ts
  loginUserWithEmailAndPassword: publicProcedure
    .meta({ openapi: { method: 'POST', path: getPath('/login'), tags: TAGS } })
    .input(loginUserWithEmailAndPasswordInputModel)
    .output(loginUserWithEmailAndPasswordOutputModel)
    .mutation(async ({ input, ctx }) => {
      const { email, phone, password } = input;

      const { id, accessToken, refreshToken } = await userService.loginUserWithEmailAndPassword({
        email,
        phone,
        password,
      });

      ctx.setCookie('refresh-token', refreshToken);

      return { id, accessToken };
    }),
```

(Import `loginUserWithEmailAndPasswordInputModel`, `loginUserWithEmailAndPasswordOutputModel` model.ts se — top ke imports me add karo.)

<br>

---

### 17.4 — `renewUserAccessTokenAndRefreshToken` (refresh-token) add karo

Ye endpoint request body me kuch nahi leta — refresh token cookie se hi
uthata hai.

📄 **File: `packages/trpc/server/routes/auth/route.ts`** (update)

```ts
  renewUserAccessTokenAndRefreshToken: publicProcedure
    .meta({ openapi: { method: 'POST', path: getPath('/refresh-token'), tags: TAGS } })
    .input(undefinedModel)
    .output(renewUserAccessTokenAndRefreshTokenOutputModel)
    .mutation(async ({ ctx }) => {
      const refreshToken = ctx.getCookie('refresh-token');
      if (!refreshToken) throw ApiError.badRequest('refresh_token is missing');

      const { accessToken, refreshToken: newRefreshToken } = await userService.renewUserAccessTokenAndRefreshToken({
        refreshToken,
      });

      ctx.setCookie('refresh-token', newRefreshToken);

      return { accessToken };
    }),
```

`publicProcedure` hai (`authenticatedProcedure` nahi) — kyunki jab access
token expire ho chuka ho, tab bhi ye endpoint call hona chahiye. Security
refresh-token cookie (httpOnly) se aati hai, Bearer header se nahi.

<br>

---

### 17.5 — `logoutUser` (protected) add karo

Ab pehli baar `authenticatedProcedure` use ho raha hai kisi route me —
matlab valid Bearer access token zaroori hai isko call karne ke liye.

📄 **File: `packages/trpc/server/routes/auth/route.ts`** (update)

```ts
  logoutUser: authenticatedProcedure
    .meta({ openapi: { method: 'POST', path: getPath('/logout'), tags: TAGS, protect: true } })
    .input(undefinedModel)
    .output(logoutUserOutputModel)
    .mutation(async ({ ctx }) => {
      const userId = ctx.user.id;

      await userService.logoutUser({ id: userId });

      ctx.clearCookie('refresh-token');

      return { ok: true };
    }),
```

`.meta({ openapi: { ..., protect: true } })` — `protect: true` `trpc-to-openapi`
ko batata hai ki `openapi.json` me is endpoint ko "requires auth" dikhana hai
(Swagger UI me lock icon aayega).

<br>

---

### 17.6 — `getLoggedInUserInfo` (protected) add karo

📄 **File: `packages/trpc/server/routes/auth/route.ts`** (final update)

```ts
  getLoggedInUserInfo: authenticatedProcedure
    .meta({ openapi: { method: 'GET', path: getPath('/user-info'), tags: TAGS, protect: true } })
    .input(undefinedModel)
    .output(getLoggedInUserInfoOutputModel)
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;

      const { id, fullName, email, emailVerified, phone, phoneVerified, isActive, profileImageUrl, role } =
        await userService.getLoggedInUserInfo({ id: userId });

      return { id, fullName, email, emailVerified, phone, phoneVerified, profileImageUrl, role, isActive };
    }),
```

**Poora `route.ts` final version — sab imports ke saath:**

📄 **File: `packages/trpc/server/routes/auth/route.ts`** (complete)

```ts
import ApiError from '@repo/services/user/utils/api-error.js';
import { userService } from '../../services/index.js';
import { authenticatedProcedure, publicProcedure, router } from '../../trpc.js';
import { generatePath } from '../../utils/path-generator.js';
import {
  createUserWithEmailAndPasswordInputModel,
  createUserWithEmailAndPasswordOutputModel,
  getLoggedInUserInfoOutputModel,
  loginUserWithEmailAndPasswordInputModel,
  loginUserWithEmailAndPasswordOutputModel,
  logoutUserOutputModel,
  renewUserAccessTokenAndRefreshTokenOutputModel,
  undefinedModel,
} from './model.js';

const TAGS = ['Authentication'];
const getPath = generatePath('/auth');

export const authRouter = router({
  createUserWithEmailAndPassword: publicProcedure
    .meta({ openapi: { method: 'POST', path: getPath('/create'), tags: TAGS } })
    .input(createUserWithEmailAndPasswordInputModel)
    .output(createUserWithEmailAndPasswordOutputModel)
    .mutation(async ({ input, ctx }) => {
      const { fullName, email, password, phone } = input;
      const { accessToken, refreshToken, id } = await userService.createUserWithEmailAndPassword({ fullName, email, password, phone });
      ctx.setCookie('refresh-token', refreshToken);
      return { id, accessToken };
    }),

  loginUserWithEmailAndPassword: publicProcedure
    .meta({ openapi: { method: 'POST', path: getPath('/login'), tags: TAGS } })
    .input(loginUserWithEmailAndPasswordInputModel)
    .output(loginUserWithEmailAndPasswordOutputModel)
    .mutation(async ({ input, ctx }) => {
      const { email, phone, password } = input;
      const { id, accessToken, refreshToken } = await userService.loginUserWithEmailAndPassword({ email, phone, password });
      ctx.setCookie('refresh-token', refreshToken);
      return { id, accessToken };
    }),

  renewUserAccessTokenAndRefreshToken: publicProcedure
    .meta({ openapi: { method: 'POST', path: getPath('/refresh-token'), tags: TAGS } })
    .input(undefinedModel)
    .output(renewUserAccessTokenAndRefreshTokenOutputModel)
    .mutation(async ({ ctx }) => {
      const refreshToken = ctx.getCookie('refresh-token');
      if (!refreshToken) throw ApiError.badRequest('refresh_token is missing');
      const { accessToken, refreshToken: newRefreshToken } = await userService.renewUserAccessTokenAndRefreshToken({ refreshToken });
      ctx.setCookie('refresh-token', newRefreshToken);
      return { accessToken };
    }),

  logoutUser: authenticatedProcedure
    .meta({ openapi: { method: 'POST', path: getPath('/logout'), tags: TAGS, protect: true } })
    .input(undefinedModel)
    .output(logoutUserOutputModel)
    .mutation(async ({ ctx }) => {
      const userId = ctx.user.id;
      await userService.logoutUser({ id: userId });
      ctx.clearCookie('refresh-token');
      return { ok: true };
    }),

  getLoggedInUserInfo: authenticatedProcedure
    .meta({ openapi: { method: 'GET', path: getPath('/user-info'), tags: TAGS, protect: true } })
    .input(undefinedModel)
    .output(getLoggedInUserInfoOutputModel)
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const { id, fullName, email, emailVerified, phone, phoneVerified, isActive, profileImageUrl, role } =
        await userService.getLoggedInUserInfo({ id: userId });
      return { id, fullName, email, emailVerified, phone, phoneVerified, profileImageUrl, role, isActive };
    }),
});
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 18 — Auth router ko root router me merge karo

**(`packages/trpc/server/index.ts` — existing file, no naya change chahiye agar pehle se `authRouter` merge hai)**

📄 **File: `packages/trpc/server/index.ts`**

```ts
import { router } from './trpc.js';
import { healthRouter } from './routes/health/route.js';
import { authRouter } from './routes/auth/route.js';

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
});

export { createContext } from './context.js';
export type ServerRouter = typeof serverRouter;
```

Bas `authRouter` import karke `serverRouter` ke andar `auth: authRouter` add
hua h

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 19 — Web client: Authorization header 

Backend ab access token expect karta hai `Authorization: Bearer <token>`
header me (STEP 15). Lekin `apps/web/trpc/create-client.ts` me abhi
`headers()` function ek **hardcoded placeholder string** bhej raha hai —

<br>

### 19.1 — Problem (current buggy code)

```ts
headers() {
  return { Authorization: `Bearer "here token came"` }; // ❌ hardcoded, kabhi kaam nahi karega
},
```

<br>

---

### 19.2 — Token store banao (in-memory)

Access token short-lived hota hai (5 min), isliye ise localStorage me
store karna zaroori nahi (aur XSS risk bhi rehta hai). Ek simple in-memory
module store kaafi hai — jab tak tab open hai, token yaad rahega; refresh
hone par naya access token `refresh-token` endpoint se dobara le lenge
(STEP 20.3).

Koi naya package nahi chahiye.

📄 **File: `apps/web/trpc/token-store.ts`**

```ts
// simple in-memory access token store — no browser storage, avoids XSS exposure
let accessToken: string | null = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token: string) => {
  accessToken = token;
};

export const clearAccessToken = () => {
  accessToken = null;
};
```

<br>

---

### 19.3 — `create-client.ts` me real header wire karo

📄 **File: `apps/web/trpc/create-client.ts`** (update — `headers()` fix)

```ts
import { createTRPCClient, httpBatchLink, loggerLink } from '@repo/trpc/client';
import type { ServerRouter } from '@repo/trpc/server/index';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { getAccessToken } from './token-store';

export const queryClient = new QueryClient();

export const trpcClient = createTRPCClient<ServerRouter>({
  links: [
    loggerLink(),
    httpBatchLink({
      url: process.env.BASE_URL?.concat('/trpc') || 'http://localhost:5000/trpc',

      fetch(url, options) {
        return fetch(url, { ...options, credentials: 'include' });
      },

      // real access token — read fresh on every request from the in-memory store
      headers() {
        const token = getAccessToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<ServerRouter>({
  client: trpcClient,
  queryClient,
});
```

`headers()` ek function hai, object nahi — isliye har request ke waqt
dobara call hota hai aur latest token uthata hai (agar login ke baad token
change ho gaya ho to bhi sahi value jaayegi).

═══════════════════════════════════════════════════════════════════════════
<br>

# 🟦 STEP 20 — Login/logout flow ek component me use karna

<br>

### 20.1 — Login karke token store me save karo

```tsx
'use client';
import { useMutation } from '@tanstack/react-query';
import { trpc } from '../trpc/create-client';
import { setAccessToken } from '../trpc/token-store';

export function LoginForm() {
  const loginMutation = useMutation(
    trpc.auth.loginUserWithEmailAndPassword.mutationOptions({
      onSuccess: (data) => {
        setAccessToken(data.accessToken); // ab agli har request me ye Bearer header me jaayega
      },
    }),
  );

  const handleSubmit = (email: string, password: string) => {
    loginMutation.mutate({ email, password });
  };

  return (
    // ... form JSX
    <div />
  );
}
```

<br>

---

### 20.2 — Logout karo aur token clear karo

```tsx
'use client';
import { useMutation } from '@tanstack/react-query';
import { trpc } from '../trpc/create-client';
import { clearAccessToken } from '../trpc/token-store';

export function LogoutButton() {
  const logoutMutation = useMutation(
    trpc.auth.logoutUser.mutationOptions({
      onSuccess: () => {
        clearAccessToken();
      },
    }),
  );

  return <button onClick={() => logoutMutation.mutate()}>Logout</button>;
}
```

<br>

---

### 20.3 — (Recommended) Page load pe silently refresh karo

Access token in-memory hai, matlab **page refresh hote hi wo gayab ho
jaayega** — lekin refresh token httpOnly cookie me safe hai. Isliye app
load hote hi ek baar `refresh-token` endpoint call karke naya access token
uthaana chahiye, taaki user ko dobara login na karna pade.

```tsx
'use client';
import { useEffect } from 'react';
import { trpcClient } from '../trpc/create-client';
import { setAccessToken } from '../trpc/token-store';

export function SilentRefresh() {
  useEffect(() => {
    trpcClient.auth.renewUserAccessTokenAndRefreshToken
      .mutate(undefined)
      .then((data) => setAccessToken(data.accessToken))
      .catch(() => {
        // no valid refresh token cookie — user needs to log in
      });
  }, []);

  return null;
}
```

Isko `Providers` ke andar (ya root layout me) ek baar render karwa do,
taaki app open hote hi automatically silent-refresh ho jaaye.

═══════════════════════════════════════════════════════════════════════════
<br>

# 📁 Final file map (auth + database + client layer)

```
packages/database/
  package.json                     → @repo/database definition
  drizzle.config.ts                → drizzle-kit config
  schema.ts                        → re-exports all models
  models/user.ts                   → usersTable definition
  index.ts                         → drizzle client (db) + drizzle-orm re-exports

packages/services/
  package.json                     → @repo/services definition
  user/
    index.ts                       → UserService (register, login, refresh, logout, user-info)
    model.ts                       → zod input schemas (service-level)
    utils/
      jwt.ts                       → generate/verify access + refresh tokens
      api-error.ts                 → ApiError class
      constants.ts                 → ROLE_TYPE

packages/trpc/
  server/
    context.ts                     → (updated) getAuthorizationHeader
    trpc.ts                        → (updated) authenticatedProcedure verifies Bearer token
    services/index.ts              → userService singleton
    utils/path-generator.ts        → safe path builder
    routes/auth/
      model.ts                     → router-level zod schemas (all 5 endpoints)
      route.ts                     → createUser, login, refresh-token, logout, user-info
    index.ts                       → (updated) authRouter merged in

apps/web/
  trpc/
    token-store.ts                 → in-memory access token get/set/clear
    create-client.ts               → (updated) headers() now sends the real Bearer token
```

═══════════════════════════════════════════════════════════════════════════
<br>

# 🧠 Gotchas / yaad rakhne wali baatein

- **Client-side header pehle sirf placeholder tha** (`Bearer "here token came"`)
  — STEP 19 isko fix karta hai, ab real token bhejta hai in-memory store se.
- **Access token in-memory hai, refresh token httpOnly cookie me** — page
  refresh hote hi access token gayab ho jaata hai, isliye STEP 20.3 wala
  silent-refresh-on-load pattern zaroori hai.
- **Refresh token rotation ho rahi hai** — har refresh call pe naya refresh
  token bhi generate hota hai, purana DB me replace ho jaata hai.
- **Do alag hash functions** — password ke liye salted HMAC
  (`generateHashedPassword`), refresh token ke liye plain SHA-256
  (`generateHash`) — dono ka purpose alag hai, mila mat do.
- **`logoutUser` aur `getLoggedInUserInfo` `authenticatedProcedure` use
  karte hain** aur `.meta({ openapi: { protect: true } })` bhi set hai —
  Swagger docs me ye clearly "auth required" dikhega.
- **OTP verification abhi TODO hai** — production me email/phone verify
  kiye bina register/login allow mat karo.
- **`ITRPCUserContext` type sirf `{ id: string }` declare karta hai**, lekin
  `authenticatedProcedure` `email`, `role`, `isActive` bhi context me daal
  raha hai — agar routes me in extra fields ka use karna hai to interface
  ko bhi update karo taaki TypeScript sahi se type-check kare.