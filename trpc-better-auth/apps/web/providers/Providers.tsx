"use client";

import { queryClient } from '../trpc/create-client';
import { QueryClientProvider } from '@tanstack/react-query';


export function Providers({children}: {children: React.ReactNode}) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

export default Providers;
