import express from "express";
import { exportPdf } from "../controllers/pdf.controller.js";

const router = express.Router();

router.post("/export", exportPdf);

export default router;
