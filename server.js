import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import PDFDocument from "pdfkit";
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
app.post("/pdf/export", (req, res) => {
  try {
    const {
      name,
      role,
      email,
      phone,
      address,
      summary,
      skills = [],
      education = [],
      experience = [],
      projects = [],
      certificates = []
    } = req.body;

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const filePath = join(__dirname, `resume_${Date.now()}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // ============================
    // HEADER
    // ============================
    doc.fontSize(22).text(name || "", { align: "center" });
    if (role) doc.fontSize(13).text(role, { align: "center" });
    doc.moveDown(0.6);

    const contact = [email, phone, address].filter(Boolean).join(" | ");
    if (contact) {
      doc.fontSize(10).text(contact, { align: "center" });
      doc.moveDown(1);
    }

    // ============================
    // SUMMARY
    // ============================
    if (summary) {
      doc.fontSize(14).text("Professional Summary");
      doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fontSize(11).text(summary, { lineGap: 4 });
      doc.moveDown(1);
    }

    // ============================
    // SKILLS
    // ============================
    if (skills.length) {
      doc.fontSize(14).text("Skills");
      doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fontSize(11).text(skills.join(", "));
      doc.moveDown(1);
    }

    // ============================
    // EDUCATION (PREVIEW MATCH)
    // ============================
    if (education.length) {
      doc.fontSize(14).text("Education");
      doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.7);

      education.forEach((e) => {
        // Row 1 — institute left, years right
        doc.fontSize(12).text(e.institute || "", { continued: true });
        doc.text(
          `${e.startYear || ""}${e.endYear ? ` - ${e.endYear}` : ""}`,
          { align: "right" }
        );

        // Row 2 — left aligned: eduType, department, score
        const row2 = [
          e.eduType || "",
          e.department ? `• ${e.department}` : "",
          e.score ? `• ${e.score}` : ""
        ]
          .filter(Boolean)
          .join("     ");

        doc.fontSize(11).text(row2);
        doc.moveDown(0.8);
      });
    }

    // ============================
    // EXPERIENCE (PREVIEW MATCH)
    // ============================
    if (experience.length) {
      doc.fontSize(14).text("Experience");
      doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.7);

      experience.forEach((ex) => {
        // row 1 — role (left), duration (right)
        doc.fontSize(12).text(ex.role || "", { continued: true });
        doc.text(ex.duration || "", { align: "right" });

        // row 2 — company (left)
        doc.fontSize(11).text(ex.company || "");

        // description below
        if (ex.activities)
          doc.text(ex.activities, { lineGap: 3 });

        doc.moveDown(0.9);
      });
    }

    // ============================
    // PROJECTS (PREVIEW MATCH)
    // ============================
    if (projects.length) {
      doc.fontSize(14).text("Projects");
      doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.7);

      projects.forEach((p) => {
        // row 1: title left, link right
        doc.fontSize(12).text(p.name || "", { continued: true });
        if (p.link) doc.text(p.link, { align: "right" });

        // row 2: description
        if (p.description)
          doc.fontSize(11).text(p.description, { lineGap: 3 });

        // row 3: key points
        if (Array.isArray(p.keyPoints) && p.keyPoints.filter(Boolean).length) {
          doc.fontSize(11).text("Key Points:");
          p.keyPoints.filter(Boolean).forEach((kp) => {
            doc.text(`• ${kp}`, { indent: 15, lineGap: 2 });
          });
        }

        // row 4: tech used
        if (p.technologies)
          doc.fontSize(11).text(`Tech Used: ${p.technologies}`);

        doc.moveDown(1);
      });
    }

    // ============================
    // CERTIFICATES (PREVIEW MATCH)
    // ============================
    if (certificates.length) {
      doc.fontSize(14).text("Certificates");
      doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.7);

      certificates.forEach((c) => {
        doc.fontSize(12).text(c.title || "");
        doc.fontSize(11).text(
          `${c.issuedBy || ""}${c.issuedOn ? ` — ${c.issuedOn}` : ""}`
        );
        if (c.credential) doc.text(c.credential);
        doc.moveDown(0.9);
      });
    }

    // END PDF
    doc.end();

    stream.on("finish", () => {
      res.download(filePath, () => fs.unlinkSync(filePath));
    });

  } catch (err) {
    console.error("❌ PDF export error:", err);
    res.status(500).json({ error: "PDF export failed" });
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
