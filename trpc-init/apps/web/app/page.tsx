"use client"

import React, { useEffect, useState } from 'react'
import { trpc, trpcClient } from '../trpc/client'
import { useMutation, useQuery } from '@tanstack/react-query';


interface ITodo {
  id: number;
  title: string;
  desc: string;
}



function page() {

  const [todos , setTodos] = useState<ITodo[]>();

  useEffect(() => {
    async function getAllTodosFromBackend(){
      const data = await trpcClient.getAllTodos.query();
      // console.log(data);
      setTodos(data);
    }

    getAllTodosFromBackend();
  }, [])


  // new method to use the tanstack query with trpc
  // const {data: allTodos} = useQuery(trpc.getAllTodos.queryOptions());
  // console.log("new-calling",allTodos);

  const {data: oneTodo} = useQuery(trpc.getTodoById.queryOptions("2"));
  console.log(oneTodo);


  // useMutation usage but dont call deleteTodo.mutate() direct on component mount call on button click or some event
  const deleteTodo = useMutation(trpc.deleteTodo.mutationOptions());
  // deleteTodo.mutate({id: "1"});

  const addTodo = useMutation(trpc.addTodo.mutationOptions());
  // addTodo.mutate({id: 5, title: "new titile", desc: "new desc"})


  return (
    <div>
      <h1>I am a home page</h1>

      <div>
        {todos?.map((todo)=> (
          <div key={todo.id}>
            <p>
              <span> {todo.id} </span> {"->"}
              <span> {todo.title} </span>{"->"}
              <span> {todo.desc} </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default page