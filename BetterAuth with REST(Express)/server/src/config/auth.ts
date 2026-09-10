import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db.js";
import * as schema from "../models/auth-schema.js"; // path adjust karo

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema
    }),

    trustedOrigins: ["http://localhost:5000", "http://localhost:5173"], // apne frontend/server URLs add krna h

    emailAndPassword: { 
      enabled: true, 
    }, 
    // socialProviders: { 
    //   github: { 
    //     clientId: process.env.GITHUB_CLIENT_ID as string, 
    //     clientSecret: process.env.GITHUB_CLIENT_SECRET as string, 
    //   },
    // }, 
});