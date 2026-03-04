import { Router } from "express";
import { performTest } from "../controllers/collection.controller";

export const collectionRouter = Router();

collectionRouter.get("/test", performTest);
