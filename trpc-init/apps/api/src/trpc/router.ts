import { router, publicProcedure } from "./trpc.js";
import {z} from 'zod';


const TODOS = [
  {id: 1, title: "todo1", desc: "hello how are you"},
  {id: 2, title: "todo2", desc: "hello there"},
  {id: 3, title: "todo3", desc: "hello bro"},
]



export const appRouter = router({
  getAllTodos: publicProcedure.query(()=> {
    return TODOS;
  }),

  getTodoById: publicProcedure.input(z.string()).query(async (opt)=> {
    const {input} = opt;

    const todo = TODOS.find((todo)=> todo.id === Number(input));
    return todo;
  }),

  addTodo: publicProcedure.input(z.object({id: z.number(), title: z.string(), desc: z.string()}))
          .mutation(async (opt)=> {
            const {input} = opt;

            TODOS.push(input);
            return true;
          }),
  

  deleteTodo: publicProcedure.meta({
    openapi: {
      method:"DELETE",
      path: "/delete/{id}"
    }
  })
  .input(z.object({id: z.string()}))
  .output(z.boolean())
  .mutation(async(opt)=> {
    const {input} = opt
    const index = TODOS.findIndex((todo)=> todo.id === Number(input.id));
    if(index === -1){
      return false;
    }

    TODOS.splice(index, 1);
    return true;
  })
});



export type AppRouter = typeof appRouter;
