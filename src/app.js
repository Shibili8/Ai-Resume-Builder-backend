import express from "express";
import cors from "cors";
import { FRONTEND_ORIGIN } from "./config/env.js";

import authRoutes from "./routes/auth.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import portfolioRoutes from "./routes/portfolio.routes.js";
import pdfRoutes from "./routes/pdf.routes.js";

const app = express();

app.use(express.json({ limit: "2mb" }));

const allowedOrigins = [
  "http://localhost:3000",
  "https://ai-resume-builder-shibili-eight.vercel.app",
  "https://shibili-ai-resume-builder-app-shibili8s-projects.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));


app.use("/auth", authRoutes);
app.use("/ai", aiRoutes);
app.use("/portfolio", portfolioRoutes);
app.use("/pdf", pdfRoutes);

app.get("/", (_, res) =>
  res.json({ ok: true, message: "🚀 AI Resume Builder Backend Running" })
);

export default app;
