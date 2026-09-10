import express, { type Express } from "express";
import cors from "cors";
import { auth } from "./config/auth.js";
import { toNodeHandler } from "better-auth/node";



export function createApplication(): Express {
  const app = express();


  app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
  }))
  
  // for BetterAuth
  app.all("/api/auth/*splat", toNodeHandler(auth));


  app.use(express.json());
  

  app.get("/", (req, res) => {
    res.json({ status: "BetterAuth with REST is up and running" });
  })


  return app;
}
