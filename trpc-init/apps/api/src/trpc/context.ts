import * as trpcExpress from '@trpc/server/adapters/express';


export const createContext = ({req, res}: trpcExpress.CreateExpressContextOptions)=> ({});


export type Context = Awaited<ReturnType<typeof createContext>>;
