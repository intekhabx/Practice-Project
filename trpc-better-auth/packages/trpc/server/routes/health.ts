import { publicProcedure, router } from "../trpc.js";
import {z} from 'zod';


export const healthRouter = router({
  getHealth: publicProcedure
  .input(z.undefined())
  .output(z.object({ status: z.string()}))
  .query(async ()=> {
    return {
      status: "Server is healthy"
    }
  })
})
