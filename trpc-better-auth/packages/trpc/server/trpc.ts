import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import type { OpenApiMeta } from 'trpc-to-openapi';

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();


export const router = t.router;
export const publicProcedure = t.procedure;
// protected procedure
export const authenticatedProcedure = t.procedure.use((options)=> {
  const {ctx, next} = options;

  if(!ctx.session){
    throw new TRPCError({message: "you must be loggedin", code: 'UNAUTHORIZED'});
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.session.user,
    }
  })
})
