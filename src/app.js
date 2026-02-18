import express from "express";
import cors from "cors";
import { FRONTEND_ORIGIN } from "./config/env.js";

import authRoutes from "./routes/auth.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import portfolioRoutes from "./routes/portfolio.routes.js";
import pdfRoutes from "./routes/pdf.routes.js";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://ai-resume-builder-shibili-eight.vercel.app",
    ],
    credentials: true,
  })
);

app.use("/auth", authRoutes);
app.use("/ai", aiRoutes);
app.use("/portfolio", portfolioRoutes);
app.use("/pdf", pdfRoutes);

app.get("/", (_, res) =>
  res.json({ ok: true, message: "🚀 AI Resume Builder Backend Running" })
);

export default app;
