import express, {type Express} from 'express';
import { appRouter } from './trpc/router.js';
import * as trpcExpress from '@trpc/server/adapters/express';
import {createContext} from "./trpc/context.js"
import { createOpenApiHttpHandler, generateOpenApiDocument } from 'trpc-to-openapi';
import cors from 'cors';


function createApplication(): Express {
  const app = express();

  app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
  }))

  app.use(express.json());

  app.get("/health", (req, res)=> {
    res.json({server: "healthy"});
  })


  // openApiDocumnet    trpc-to-openapi
  const openApiDocumnet = generateOpenApiDocument(appRouter, {
    title: "tRPC practice application",
    version: "1.0.0",
    baseUrl: "http://localhost:5000/api"
  })

  app.get("/openapi.json", (req, res)=> {
    return res.json(openApiDocumnet);
  })


  app.use("/api", createOpenApiHttpHandler({
    router: appRouter,
    // createContext,
  }))



  // trpc route linking to the server
  app.use(
    "/trpc",
    trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext
    }),
  );

  return app;
}

export default createApplication;
