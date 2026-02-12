import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  savePortfolio,
  getPortfolios,
} from "../controllers/portfolio.controller.js";

const router = Router();
router.post("/", authMiddleware, savePortfolio);
router.get("/", authMiddleware, getPortfolios);
export default router;
