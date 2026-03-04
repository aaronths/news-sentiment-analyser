import { Router } from "express";
import { performTest } from "../controllers/retrieval.controller";

export const retrievalRouter = Router();

retrievalRouter.get("/test", performTest);
