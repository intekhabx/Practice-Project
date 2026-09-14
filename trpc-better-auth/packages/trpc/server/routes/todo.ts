import { authenticatedProcedure, router } from "../trpc.js";


const TODO = ["hello", "i am todo"];


export const todoRouter = router({
  getTodo: authenticatedProcedure.query(({ctx}) => {
    console.log(ctx.session, ctx.user);

    if(!ctx.session){
      throw new Error("session is not availabe");
    }

    if(!ctx.user){
      throw new Error("user is not available");
    }

    return {
      TODO
    }
  })
})