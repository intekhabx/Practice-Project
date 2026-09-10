import { useState, type ChangeEvent, type FormEvent } from "react";
import { authClient } from "./lib/auth-client";


function App() {

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [user, setUser] = useState({
    name: "",
    email: "",
    password: "",
  })


  const handleOnChange = (e: ChangeEvent<HTMLInputElement>) => {
    const {value, name} = e.target;
    return setUser((item)=> ({...item, [name]: value}));
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const {data, error} = await authClient.signUp.email(user);

    if(error){
      console.log(error);
      setError(error.message || "failed to create user");
      return;
    }

    console.log(data);
    setSuccess("User Registered successfully");
  }


  if(success){
    return (
      <div className="text-green-400 p-2">
        {success}
      </div>
    )
  }


  if(error){
    return (
      <div className="text-red-400 p-2">
        {error}
      </div>
    )
  }


  return (
    <div>
      <form onSubmit={handleSubmit}>
        <label>
          <input type="text" placeholder="name" name="name" onChange={(e)=> handleOnChange(e)}/>
        </label>
        <label>
          <input type="email" placeholder="email" name="email" onChange={(e)=> handleOnChange(e)}/>
        </label>
        <label>
          <input type="password" placeholder="*******" name="password" onChange={(e)=> handleOnChange(e)}/>
        </label>

        <button type="submit">Register User</button>
      </form>
    </div>
  );
}

export default App;
