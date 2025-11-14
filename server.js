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

    const doc = new PDFDocument({ margin: 40 });
    const filePath = join(__dirname, `resume_${Date.now()}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    /* -----------------------------------
     *  HEADER — Centered Name + Role
     * ----------------------------------- */
    doc.fontSize(24).text(name || "Name", { align: "center" });
    doc.fontSize(16).text(role || "", { align: "center" });
    doc.moveDown(1);

    /* -----------------------------------
     *  CONTACT
     * ----------------------------------- */
    if (email || phone || address) {
      doc.fontSize(12).text(`Email: ${email || ""}`);
      doc.text(`Phone: ${phone || ""}`);
      doc.text(`Address: ${address || ""}`);
      doc.moveDown();
    }

    /* -----------------------------------
     * SUMMARY
     * ----------------------------------- */
    if (summary) {
      doc.fontSize(16).text("Summary", { underline: true });
      doc.fontSize(12).text(summary, { lineGap: 2 });
      doc.moveDown();
    }

    /* -----------------------------------
     * SKILLS
     * ----------------------------------- */
    if (skills.length > 0) {
      doc.fontSize(16).text("Skills", { underline: true });
      doc.fontSize(12).text(skills.join(", "), { lineGap: 2 });
      doc.moveDown();
    }

    /* -----------------------------------
     * EDUCATION
     * Matching Preview Layout
     * ----------------------------------- */
    if (education.length > 0) {
      doc.fontSize(18).text("Education", { underline: true });
      doc.moveDown(0.7);

      education.forEach((edu) => {
        // Row 1: Institute, City — Years
        doc.fontSize(14).text(
          `${edu.institute || "Institute"}, ${edu.city || ""}`,
          { continued: true }
        );
        doc.fontSize(12).text(
          `  (${edu.startYear || "N/A"} - ${edu.endYear || "N/A"})`
        );

        // Row 2: Type + Department
        doc.fontSize(12).text(
          `${edu.type || ""} in ${edu.department || ""}`
        );

        // Row 3: Grade
        doc.fontSize(12).text(`Grade: ${edu.grade || "N/A"}`);

        doc.moveDown(0.8);
      });
    }

    /* -----------------------------------
     * EXPERIENCE
     * ----------------------------------- */
    if (experience.length > 0) {
      doc.fontSize(18).text("Experience", { underline: true });
      doc.moveDown(0.7);

      experience.forEach((exp) => {
        // Row 1: Role + (Years)
        doc.fontSize(14).text(`${exp.role || "Role"} `, { continued: true });
        doc.fontSize(12).text(
          ` (${exp.startYear || "N/A"} - ${exp.endYear || "N/A"})`
        );

        // Row 2: Company Name
        doc.fontSize(12).text(`Company: ${exp.company || ""}`);

        // Row 3: Description
        doc.fontSize(12).text(exp.description || "");

        doc.moveDown(0.8);
      });
    }

    /* -----------------------------------
     * PROJECTS
     * ----------------------------------- */
    if (projects.length > 0) {
      doc.fontSize(18).text("Projects", { underline: true });
      doc.moveDown(0.7);

      projects.forEach((proj) => {
        // Row 1: Title + Link
        doc.fontSize(14).text(`${proj.title}`, { continued: true });
        if (proj.link)
          doc.fontSize(12).text(`  —  ${proj.link}`);

        // Row 2: Description
        if (proj.description) {
          doc.fontSize(12).text(proj.description);
        }

        // Row 3: Key Points (Bullets)
        if (proj.keyPoints && proj.keyPoints.length > 0) {
          doc.fontSize(12).text("Key Points:");
          proj.keyPoints.forEach((kp) => {
            doc.text(`• ${kp}`, { indent: 20, lineGap: 2 });
          });
        }

        // Row 4: Tech Used
        if (proj.techStack)
          doc.fontSize(12).text(`Tech Used: ${proj.techStack}`);

        doc.moveDown(0.8);
      });
    }

    /* -----------------------------------
     * CERTIFICATES
     * ----------------------------------- */
    if (certificates.length > 0) {
      doc.fontSize(18).text("Certificates", { underline: true });
      doc.moveDown(0.7);

      certificates.forEach((cert) => {
        doc.fontSize(14).text(cert.title);
        doc.fontSize(12).text(`Issued By: ${cert.issuer}`);
        doc.text(`Year: ${cert.year}`);
        doc.moveDown();
      });
    }

    /* -----------------------------------
     * END PDF
     * ----------------------------------- */
    doc.end();

    stream.on("finish", () => {
      res.download(filePath, () => fs.unlinkSync(filePath));
    });
  } catch (err) {
    console.error("❌ PDF export error:", err.message);
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
