import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
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

async function getBrowser() {
  if (process.env.RENDER) {
    return await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  // Local Windows/Mac/Linux (for development)
  const fullPuppeteer = (await import("puppeteer")).default;
  return await fullPuppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}
// 🔧 Normalize Education Type (handles "Other")
function normalizeEducationArray(education = []) {
  return education.map((e) => {
    if (e.eduType === "Other" && e.eduTypeOther?.trim()) {
      return { ...e, eduType: e.eduTypeOther.trim() };
    }
    return e;
  });
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
app.post("/portfolio", async (req, res) => {
  try {
    const portfolios = db.collection("portfolios");

    // Normalize education array BEFORE saving
    const normalizedEducation = normalizeEducationArray(req.body.education);

    const data = {
      ...req.body,
      education: normalizedEducation,
      userId: req.user?.id || null,   // prevent crash if no auth
      createdAt: new Date(),
    };

    const result = await portfolios.insertOne(data);

    return res.json({
      success: true,
      id: result.insertedId,
      message: "Portfolio saved successfully",
    });

  } catch (err) {
    console.error("PORTFOLIO SAVE ERROR:", err);
    return res.status(500).json({ error: "Failed to save portfolio" });
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
    console.log("📥 PDF export request received");

    const { form, gensummary } = req.body;
    form.education = normalizeEducationArray(form.education);
    if (!form) {
      return res.status(400).json({ error: "Form data missing" });
    }

    const safe = (v) => (v ? v : "");
    const cleanSummary = (gensummary || "").replace(/\*/g, "");

    // -------------------------------
    // 🔹 Generate HTML
    // -------------------------------
    const html = `
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; background: white; word-wrap: break-word;
  overflow-wrap: break-word; }
    h1,h2,h3 { margin: 0; }
    .section { margin-top: 25px; }
    .title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
    hr { border: 1.5px solid #000; margin-bottom: 10px; }
    .flex-between { display: flex; justify-content: space-between; }
    ul { margin-top: 5px; }
    .section p,
.section div,
.section span,
.section li {
  word-break: break-word;
  white-space: normal;
}

.activities-text {
  text-align: justify;
  line-height: 1.6;
  margin-top: 5px;
  display: block;
  width: 100%;
}
  </style>
</head>

<body>

  <div style="text-align:center; margin-bottom:20px;">
    <h1>${safe(form.name)}</h1>
    <h3>${safe(form.role)}</h3>
    <p>
      ${safe(form.emailId)}  ${safe("| "+form.phoneNo)} 
      ${safe("| "+form.linkedIn)} ${safe("| "+form.portfolioLink)}
    </p>
  </div>

  <div class="section">
    <div class="title">Summary</div>
    <hr/>
    <p style="text-align:justify;">${cleanSummary}</p>
  </div>

  <div class="section">
    <div class="title">Education</div>
    <hr/>
    ${
      form.education?.length
        ? form.education
            .map(
              (e) => `
      <div style="margin-bottom:15px;">
        <div class="flex-between" style="font-weight:600;">
          <span>${safe(e.institute)}</span>
          <span>${safe(e.startYear)} - ${safe(e.endYear)}</span>
        </div>
        <div style="display:flex; gap:10px; margin-top:4px;">
          <span>${safe(e.eduType)}</span>
          <span> in ${safe(e.department)}</span>
          <span>${safe(e.score) ? `| ${safe(e.score)} (${safe(e.scoreType)})` : ""}</span>
        </div>
      </div>`
            )
            .join("")
        : "<p>No education details</p>"
    }
  </div>

  ${(() => {
  // Normalize skills → If array, use array. If string, split by commas.
  let skills = [];

  if (Array.isArray(form.skills)) {
    skills = form.skills.filter(s => s?.trim());
  } else if (typeof form.skills === "string") {
    skills = form.skills
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }

  // No valid skills → hide entire section
  if (skills.length === 0) return "";

  return `
    <div class="section">
      <div class="title">Skills</div>
      <hr/>
      <ul style="display:flex; align-items:center; padding-left:0px; list-style-type: none;">
        ${skills.map(s => `<li >${safe(s)}</li>`).join(", "+"  ")}
      </ul>
    </div>
  `;
})()}


  ${(() => {
  const validExp = (form.experience || []).filter(exp =>
    (exp.role && exp.role.trim()) ||
    (exp.company && exp.company.trim()) ||
    (exp.duration && exp.duration.trim()) ||
    (exp.activities && exp.activities.trim())
  );

  if (validExp.length === 0) return "";

  return `
    <div class="section">
      <div class="title">Experience</div>
      <hr/>

      ${validExp
        .map(
          (exp) => `
        <div style="
          margin-bottom:18px; 
          line-height:1.6; 
          display:block; 
          width:100%;
          word-break: break-word;
        ">

          <div class="flex-between" style="
            font-weight:600; 
            margin-bottom:4px;
            width:100%;
            word-break: break-word;
          ">
            <span>${safe(exp.role || "")}</span>
            <span>${safe(exp.duration || "")}</span>
          </div>

          <div style="margin-bottom:6px; word-break: break-word;">
            ${safe(exp.company || "")}
          </div>

          ${
            exp.activities && exp.activities.trim().length > 0
              ? `<p class="activities-text">
                  ${safe(exp.activities)}
                </p>`
              : ""
          }
        </div>
        `
        )
        .join("")}
    </div>
  `;
})()}

  ${(() => {
  // Filter out empty projects (all fields blank)
  const validProjects = (form.projects || []).filter(p =>
    p.name?.trim() ||
    p.description?.trim() ||
    p.link?.trim() ||
    (p.keyPoints && p.keyPoints.some(k => k?.trim())) ||
    p.technologies?.trim()
  );

  // If no valid projects → show nothing
  if (validProjects.length === 0) return "";

  return `
  <div class="section">
    <div class="title">Projects</div>
    <hr/>
    ${validProjects
      .map(
        (p) => `
        <div style="margin-bottom:14px;">

          <div class="flex-between" style="font-weight:600;">
            <span>${safe(p.name || "")}</span>

            ${
              p.link
                ? `<a href="${
                    p.link ? p.link : "https://" + p.link
                  }">${safe(p.link)}</a>`
                : ""
            }
          </div>

          ${p.description ? `<p style="text-align: justify;">${safe(p.description)}</p>` : ""}

          ${
            p.keyPoints?.length
              ? `<ul>
                  ${p.keyPoints
                    .filter(kp => kp?.trim())
                    .map(kp => `<li>${safe(kp)}</li>`)
                    .join("")}
                </ul>`
              : ""
          }

          ${
            p.technologies.length>0
              ? `<p><strong>Tech Used:</strong> ${safe(p.technologies)}</p>`
              : ""
          }

        </div>
      `
      )
      .join("")}
  </div>
  `;
})()}


  ${(() => {
  const validCerts = (form.certificates || []).filter(c =>
    c.title?.trim() ||
    c.issuedBy?.trim() ||
    c.issuedOn?.trim() ||
    c.credential?.trim()
  );

  if (validCerts.length === 0) return "";

  return `
    <div class="section">
      <div class="title">Certificates</div>
      <hr/>
      ${validCerts.map(c => `
        <div style="margin-bottom:10px; line-height:1.5;">
          <strong >${safe(c.title || "")}</strong>
          <div>${safe(c.issuedBy || "")} <small> | ${safe(c.issuedOn || "")}</small></div>
          
          ${
              c.credential
                ? `<a href="${
                    c.credential.startsWith("https://") ? c.credential : "https://" + c.credential
                  }">${safe(c.credential)}</a>`
                : ""
            }
        </div>
      `).join("")}
    </div>
  `;
})()}

</body>
</html>
`;


    // -------------------------------------
    // 🔹 START CHROMIUM (Render + Local)
    // -------------------------------------
    let browser;

    try {
      if (process.env.RENDER === "true") {
        let execPath = await chromium.executablePath();

        if (!execPath) {
          console.warn("⚠ chromium.executablePath returned null. Using fallback.");
          execPath = "/usr/bin/chromium-browser"; // 🔹 Render fallback path
        }

        browser = await puppeteer.launch({
          args: [
            ...chromium.args,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
          ],
          executablePath: execPath,
          defaultViewport: chromium.defaultViewport,
          headless: chromium.headless,
        });
      } else {
        const puppeteerLocal = (await import("puppeteer")).default;
        browser = await puppeteerLocal.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      }
    } catch (err) {
      console.error("❌ Browser launch failed:", err);
      return res.status(500).json({ error: "Failed to launch Chromium" });
    }

    // -------------------------------------
    // 🔹 Generate the PDF
    // -------------------------------------
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfUint8 = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    await browser.close();

    if (!pdfUint8 || pdfUint8.length === 0) {
      return res.status(500).json({ error: "Generated PDF is empty" });
    }

    const pdfBuffer = Buffer.from(pdfUint8);

    // -------------------------------------
    // 🔹 Safe Filename
    // -------------------------------------
    const fileName =
      (form.name || "resume")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 40) + ".pdf";

    // -------------------------------------
    // 🔹 Correct Headers
    // -------------------------------------
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.end(pdfBuffer);
  } catch (error) {
    console.error("❌ PDF EXPORT ERROR:", error);
    return res.status(500).json({
      error: "PDF generation failed",
      details: error.message,
    });
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
