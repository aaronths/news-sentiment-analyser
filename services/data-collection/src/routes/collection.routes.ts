import { Router } from "express";
import { performTest, getRawArticles, listSources, collectArticles} from "../controllers/collection.controller";

export const collectionRouter = Router();

collectionRouter.get("/test", performTest);
collectionRouter.get("/sources", listSources);
collectionRouter.get("/articles/raw", getRawArticles);
collectionRouter.post("/collect", collectArticles);