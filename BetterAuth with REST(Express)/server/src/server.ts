import "dotenv/config";
import http from "node:http";
import { createApplication } from "./app.js";


function main() {
  const PORT = 5000;

  const app = createApplication();
  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`Server is listening on the port ${PORT}`);
  })
}

main();
