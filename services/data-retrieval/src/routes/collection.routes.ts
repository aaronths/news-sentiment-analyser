import { Router } from "express";
import {
	getArticlesByKeyword,
	getOutletSummary,
} from "../controllers/retrieval.controller";

export const retrievalRouter = Router();

retrievalRouter.get("/articles", getArticlesByKeyword);
retrievalRouter.get("/outlets", getOutletSummary);
