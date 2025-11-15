import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";



dotenv.config();

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));

// ======================
// 🔹 MongoDB Connection
// ======================
const mongoUri =
  process.env.MONGODB_URI || "mongodb://localhost:27017/ai_resume_portfolio";
const client = new MongoClient(mongoUri);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db();
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}
await connectDB();

// ======================
// 🔹 Gemini AI Setup
// ======================
if (!process.env.GOOGLE_API_KEY) {
  console.warn("⚠️ GOOGLE_API_KEY missing — AI routes will fail");
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

// Retry helper for Gemini
async function generateWithRetry(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      if (error.message.includes("503") && i < retries - 1) {
        console.log(`⚠️ Gemini overloaded, retrying (${i + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, 3000)); // Wait 3 sec before retry
      } else {
        throw error;
      }
    }
  }
}

// ---------- UNIVERSAL PUPPETEER LAUNCHER (Fix for Windows + Render) ----------
const getPuppeteerOptions = async () => {
  const isLocal =
    process.platform === "win32" ||
    process.platform === "darwin" ||
    process.env.LOCAL_PDF === "true";

  if (isLocal) {
    console.log("📌 Running PDF generation in LOCAL mode");

    const fullPuppeteer = await import("puppeteer");

    return {
      headless: true,
      executablePath: fullPuppeteer.executablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      product: "chrome",
    };
  }

  console.log("📌 Running PDF generation in SERVERLESS mode");

  return {
    headless: chromium.headless,
    executablePath: await chromium.executablePath(),
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  };
};



// ======================
// 🔹 JWT Middleware
// ======================
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

// ======================
// 🔹 Auth Routes
// ======================
app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "All fields are required" });

    const users = db.collection("users");
    const existing = await users.findOne({ email });
    if (existing)
      return res.status(400).json({ error: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const result = await users.insertOne({ name, email, password: hashed });

    res.json({
      success: true,
      id: result.insertedId,
      message: "User registered successfully",
    });
  } catch (err) {
    console.error("❌ Register error:", err.message);
    res
      .status(500)
      .json({ error: "Registration failed", details: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = db.collection("users");

    const user = await users.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign(
      { id: user._id.toString(), email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ success: true, token });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// ======================
// 🔹 AI Resume Builder (Summary Generation)
// ======================
app.post("/ai/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    console.log("🧠 Generating summary using Gemini...");
    console.log("Prompt received:", prompt);

    const aiText = await generateWithRetry(prompt);

    res.json({
      success: true,
      summary: aiText.trim(),
    });
  } catch (error) {
    console.error("❌ AI Generation Error:", error.message);
    res.status(500).json({
      error: "AI generation failed",
      details: error.message,
    });
  }
});

// ======================
// 🔹 Portfolio CRUD
// ======================
app.post("/portfolio", authMiddleware, async (req, res) => {
  try {
    const portfolios = db.collection("portfolios");
    const data = { ...req.body, userId: req.user.id, createdAt: new Date() };
    const result = await portfolios.insertOne(data);
    res.json({
      success: true,
      id: result.insertedId,
      message: "Portfolio saved successfully",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to save portfolio" });
  }
});

app.get("/portfolio", authMiddleware, async (req, res) => {
  try {
    const portfolios = db.collection("portfolios");
    const data = await portfolios.find({ userId: req.user.id }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

// ======================
// 🔹 PDF Resume Export
// ======================
app.post("/pdf/export", async (req, res) => {
  try {
    console.log("📥 PDF Export request received");

    const { form, gensummary } = req.body;
    if (!form) return res.status(400).json({ error: "Form data is required" });

    const safe = (v) => (v ? v : "");
    const cleanSummary = (gensummary || "").replace(/\*/g, "");
    const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; background: white; }
        h1,h2,h3 { margin: 0; }
        .section { margin-top: 25px; }
        .title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
        hr { border: 1.5px solid #000; margin-bottom: 10px; }
        .flex-between { display: flex; justify-content: space-between; }
        ul { margin-top: 5px; }
      </style>
    </head>

    <body>

      <div style="text-align:center; margin-bottom:20px;">
        <h1>${safe(form.name)}</h1>
        <h3>${safe(form.role)}</h3>
        <p>
          ${safe(form.emailId)} | ${safe(form.phoneNo)} |
          ${safe(form.linkedIn)} | ${safe(form.portfolioLink)}
        </p>
      </div>

      <div class="section">
        <div class="title">Summary</div>
        <hr/>
        <p>${cleanSummary}</p>
      </div>

      <div class="section">
        <div class="title">Education</div>
        <hr/>
        ${form.education
          ?.map(
            (e) => `
          <div style="margin-bottom:15px;">
            <div class="flex-between" style="font-weight:600;">
              <span>${safe(e.institute)}</span>
              <span>${safe(e.startYear)} - ${safe(e.endYear)}</span>
            </div>
            <div style="display:flex; gap:10px; margin-top:4px;">
              <span>${safe(e.eduType)}</span>
              <span>${safe(e.department)}</span>
              <span>${safe(e.score)}</span>
            </div>
          </div>`
          )
          .join("")}
      </div>

      <div class="section">
        <div class="title">Experience</div>
        <hr/>
        ${form.experience
          ?.map(
            (exp) => `
        <div style="margin-bottom:12px;">
          <div class="flex-between" style="font-weight:600;">
            <span>${safe(exp.role)}</span>
            <span>${safe(exp.duration)}</span>
          </div>
          <div>${safe(exp.company)}</div>
          ${exp.activities ? `<p>${safe(exp.activities)}</p>` : ""}
        </div>`
          )
          .join("")}
      </div>

      <div class="section">
        <div class="title">Projects</div>
        <hr/>
        ${form.projects
          ?.map(
            (p) => `
        <div style="margin-bottom:14px;">
          <div class="flex-between" style="font-weight:600;">
            <span>${safe(p.name)}</span>
            ${
              p.link
                ? `<a href="${p.link.startsWith("http") ? p.link : "https://" + p.link}">
                    ${p.link}
                   </a>`
                : ""
            }
          </div>
          <p>${safe(p.description)}</p>

          ${
            p.keyPoints?.length
              ? `<ul>${p.keyPoints
                  .filter(Boolean)
                  .map((kp) => `<li>${kp}</li>`)
                  .join("")}</ul>`
              : ""
          }

          <p><strong>Tech Used:</strong> ${safe(p.technologies)}</p>
        </div>`
          )
          .join("")}
      </div>

      <div class="section">
        <div class="title">Certificates</div>
        <hr/>
        ${form.certificates
          ?.map(
            (c) => `
        <div style="margin-bottom:10px;">
          <strong>${safe(c.title)}</strong>
          <p>${safe(c.issuedBy)}</p>
          ${c.credential ? `<p>${safe(c.credential)}</p>` : ""}
        </div>`
          )
          .join("")}
      </div>

    </body>
    </html>
    `;

     const puppeteerOptions = await getPuppeteerOptions();
    const fullPuppeteer = puppeteerOptions.executablePath
      ? puppeteer
      : await import("puppeteer");

    const browser = await fullPuppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${form.name || "resume"}.pdf"`,
    });

    res.send(pdfBuffer);

  } catch (err) {
    console.error("❌ PDF EXPORT ERROR:", err);
    res.status(500).json({ error: "PDF export failed", details: err.message });
  }
});

// ======================
// 🔹 Default Route
// ======================
app.get("/", (req, res) =>
  res.json({
    ok: true,
    message: "🚀 AI Resume & Portfolio Builder Backend Running",
  })
);

// ======================
// 🔹 Start Server
// ======================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
