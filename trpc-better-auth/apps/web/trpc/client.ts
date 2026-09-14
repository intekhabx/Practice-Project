import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { ServerRouter } from '@repo/trpc/client/index';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<ServerRouter>();
