import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import type { AppRouter } from '../../api/src/trpc/router';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';


export const queryClient = new QueryClient();

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    loggerLink(),
    httpBatchLink({
      url: 'http://localhost:5000/trpc',

      // this is for the cors, every fetch all includes credetials: "include"
      fetch(url, options){
        return fetch(url, {
          ...options,
          credentials: "include"
        })
      }
    }),
  ],
});


export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
})
