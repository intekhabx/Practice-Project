import express, {type Express} from "express";
import cors from "cors";
import * as trpcExpress from "@trpc/server/adapters/express";
import {serverRouter, createContext} from "@repo/trpc/server/index.js";
import { createOpenApiExpressMiddleware, generateOpenApiDocument } from "trpc-to-openapi";
import { toNodeHandler } from "better-auth/node";
import {auth} from "@repo/services/auth/auth.js"
import cookieParser from "cookie-parser";


export function createApplication(): Express{
  const app = express();

  app.use(cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  }))

  // this middleware route is for better-auth
  app.all("/api/auth/*splat", toNodeHandler(auth));

  app.use(express.json());
  app.use(cookieParser());
  

  app.get("/", (req, res)=> {
    res.json({message: "Server is up and running", status: "healthy"});
  })

  // openapi documents
  const openApiDocument = generateOpenApiDocument(serverRouter, {
    title: 'tRPC OpenAPI',
    version: '1.0.0',
    baseUrl: process.env.BASE_URL ?? 'http://localhost:5000',
  });

  app.get("/openapi.json", (req, res) => {
    res.json(openApiDocument);
  })


  app.use("/api", 
    createOpenApiExpressMiddleware({router: serverRouter, createContext})
  );

  // trpc route
  app.use("/trpc", 
    trpcExpress.createExpressMiddleware({
      router: serverRouter,
      createContext
    })
  )

  return app;
}
