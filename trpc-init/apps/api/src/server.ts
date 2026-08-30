import http from 'node:http';
import createApplication from './app.js';


async function main() {
  const PORT = 5000;

  const app = createApplication();
  const server = http.createServer(app);


  server.listen(PORT, ()=> {
    console.log(`Server is running on port: ${PORT}`);
  })
}

main();
