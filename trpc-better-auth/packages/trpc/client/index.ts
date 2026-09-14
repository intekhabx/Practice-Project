import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { ServerRouter } from "../server/index.js";


export type RouterInput = inferRouterInputs<ServerRouter>;
export type RouterOutput = inferRouterOutputs<ServerRouter>;


export type {ServerRouter} from "../server/index.js"
export * from "@trpc/client";
