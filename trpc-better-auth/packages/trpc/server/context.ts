
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import {auth} from "@repo/services/auth/auth.js";
import { fromNodeHeaders } from "better-auth/node"


export const createContext = async ({req, res}: CreateExpressContextOptions) => {
  const ctx = {
    session: await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    })
  }

  return ctx;
};


export type Context = Awaited<ReturnType<typeof createContext>>;