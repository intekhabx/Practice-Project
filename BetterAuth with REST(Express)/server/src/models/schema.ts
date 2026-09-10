// import 'dotenv/config';
// import { defineConfig } from 'drizzle-kit';

// export default defineConfig({
//   out: './drizzle',
//   schema: './src/models/schema.ts', 
//   dialect: 'postgresql',
//   dbCredentials: {
//     url: process.env.DATABASE_URL,
//   },
// });

// we can also add only schema.ts file so drizzle generate and migrate tables
// aur ek file se saare schema model ko export krenge (schema.ts)



export * from "./auth-schema.js";
// and other schema jo v banana ho