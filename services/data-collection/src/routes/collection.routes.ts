import { Router } from "express";
import {
	collectArticles,
	getRawArticles,
	listSources,
} from "../controllers/collection.controller";

export const collectionRouter = Router();

collectionRouter.get("/sources", listSources);
collectionRouter.get("/articles/raw", getRawArticles);
collectionRouter.post("/collect", collectArticles);
