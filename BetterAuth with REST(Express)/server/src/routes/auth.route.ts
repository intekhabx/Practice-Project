import express from "express";
import type { Router, Request, Response } from "express";

const router: Router = express.Router();


// we don't need to create route and controller - betterAuth handles everything

// http://localhost:5000/api/auth/sign-up/email
// http://localhost:5000/api/auth/sign-in/email
// and so on routes and route provided by betterauth 


export default router;