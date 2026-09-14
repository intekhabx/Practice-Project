"use client"

import React, { useState } from 'react'
import { authClient } from '../lib/auth-client'
import { useQuery } from '@tanstack/react-query';
import { trpc } from '../trpc/create-client';

const page = () => {
  const [email, setEmail] = useState("khan@gmail.com");
  const [password, setPassword] = useState("Intekhab@123");
  const [name, setName] = useState("khan intekhab");


  async function createAccount(){
    const result = await authClient.signUp.email({
      email,
      password,
      name
    });

    console.log(result);
  }

  const {data} = useQuery(trpc.todo.getTodo.queryOptions());
  console.log(data);

  return (
    <div>
      <button onClick={createAccount}>Create an Account</button>
        <br />
        <br />
      <button>{data ? data.TODO : ""}</button>
    </div>
  )
}

export default page;
