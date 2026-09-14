import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import db from "@repo/database/index.js";
import {account, session, user, verification} from "@repo/database/schema.js"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
    schema: {account, user, session, verification},
  }),

  trustedOrigins: [
    process.env.FRONTEND_URL ?? "http://localhost:3000",
  ],

  emailAndPassword: { 
    enabled: true, 
  }, 

});
