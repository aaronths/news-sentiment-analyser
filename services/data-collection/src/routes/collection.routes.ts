import { Router } from "express";
import {
	collectArticles,
	getIngestionReport,
	getRawArticles,
	listSources,
} from "../controllers/collection.controller";

export const collectionRouter = Router();

collectionRouter.get("/sources", listSources);
collectionRouter.get("/articles/raw", getRawArticles);
collectionRouter.get("/ingestion/report", getIngestionReport);
collectionRouter.post("/collect", collectArticles);
