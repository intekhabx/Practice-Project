import { initTRPC } from '@trpc/server';
import { type Context } from './context.js';
import type { OpenApiMeta } from 'trpc-to-openapi';


const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
