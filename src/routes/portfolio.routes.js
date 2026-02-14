import { Router } from "express";
import {
  savePortfolio,
  getPortfolios,
} from "../controllers/portfolio.controller.js";

const router = Router();

router.post("/", savePortfolio);
router.get("/", getPortfolios);

export default router;
