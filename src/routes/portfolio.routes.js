import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";

import {
  savePortfolio,
  getPortfolios,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio
} from "../controllers/portfolio.controller.js";

const router = Router();

// Create
router.post("/", authMiddleware, savePortfolio);

// Get all
router.get("/", authMiddleware, getPortfolios);

// Get one
router.get("/:id", authMiddleware, getPortfolioById);

// Update
router.put("/:id", authMiddleware, updatePortfolio);

// Delete
router.delete("/:id", authMiddleware, deletePortfolio);

export default router;