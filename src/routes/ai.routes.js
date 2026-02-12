import { Router } from "express";
import { generateSummary } from "../controllers/ai.controller.js";

const router = Router();
router.post("/generate", generateSummary);
export default router;
