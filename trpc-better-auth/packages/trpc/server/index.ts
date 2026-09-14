import { healthRouter } from "./routes/health.js";
import { todoRouter } from "./routes/todo.js";
import { router } from "./trpc.js";


export const serverRouter = router({
  health: healthRouter,
  todo: todoRouter,
  // other routes
})


export { createContext } from "./context.js"
export type ServerRouter = typeof serverRouter;
