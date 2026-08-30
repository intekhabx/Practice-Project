"use client"

import React, { useEffect, useState } from 'react'
import { trpc } from '../trpc/client'


interface ITodo {
  id: number;
  title: string;
  desc: string;
}



function page() {

  const [todos , setTodos] = useState<ITodo[]>();

  useEffect(() => {
    async function getAllTodosFromBackend(){
      const data = await trpc.getAllTodos.query();
      // console.log(data);
      setTodos(data);
    }

    getAllTodosFromBackend();
  }, [])


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