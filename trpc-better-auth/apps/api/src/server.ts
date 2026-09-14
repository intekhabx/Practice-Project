import "dotenv/config";
import http from "node:http";
import { createApplication } from "./app.js";



function main(){
  const PORT = process.env.PORT ?? 5000;

  const app = createApplication();
  const server = http.createServer(app);


  server.listen(PORT, ()=> {
    console.log(`Server is listening on port ${PORT}`);
  })
}

main();
