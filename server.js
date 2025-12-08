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
app.post("/portfolio",authMiddleware, async (req, res) => {
  try {
    const portfolios = db.collection("portfolios");

    const normalizedEducation = normalizeEducationArray(req.body.education);

    const data = {
      ...req.body,
      education: normalizedEducation,
      userId: req.user.id || null,
      createdAt: new Date(),
    };

    const result = await portfolios.insertOne(data);

    res.json({
      success: true,
      id: result.insertedId,
      message: "Portfolio saved successfully",
    });
  } catch (err) {
    console.error("PORTFOLIO ERROR:", err);
    res.status(500).json({ error: "Failed to save portfolio" });
  }
});



app.get("/portfolio", async (req, res) => {
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

    const safe = (v) => (v ? String(v) : "");
    const cleanSummary = (gensummary || "").replace(/\*/g, "");

    // -------------------------------
    // 🔹 Generate HTML (PreviewPage style)
    // -------------------------------
    const html = `
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      background: white;
    }
    h1, h2, h3 {
      margin: 0;
    }
    h1 {
      font-weight: 600;
      font-size: 18px;
    }
    h2 {
      font-weight: 600;
      color: #111111;
      font-size: 16px;
      margin-top: 18px;
    }
    p, span, li, div {
      font-size: 12px;
    }
    hr {
      border: 1px solid #000;
      margin: 4px 0 10px;
    }
    .section {
      margin-top: 10px;
      margin-bottom: 10px;
    }
    .flex-between {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .mb-10 { margin-bottom: 10px; }
    .mb-12 { margin-bottom: 12px; }
    .mb-14 { margin-bottom: 14px; }
    .mb-20 { margin-bottom: 20px; }
    ul {
      margin-top: 5px;
      padding-left: 18px;
    }
  </style>
</head>

<body>

  <!-- ===================== HEADER ===================== -->
  <div style="text-align:center; margin-bottom:20px;">
    <h1>${safe(form.name)}</h1>
    <h3 style="margin:0; font-weight:500; font-size:14px;">${safe(form.role)}</h3>
    <p style="margin-top:10px; font-size:14px;">
      ${safe(form.city)}, ${safe(form.state)}, ${safe(form.pincode)} 
      ${safe(form.emailId)? (" | "+`<a href="mailto:${form.emailId}"> ${form.emailId}</a>`)  :""}
      ${form.phoneNo ? " | " + safe(form.phoneNo) : ""}
      ${form.linkedIn ? (" | " + `<a href="${form.linkedIn}"> LinkedIn</a>`)  :""}
      ${form.portfolioLink ? (" | "+ `<a href="${form.portfolioLink}"> Portfolio</a>`)  :""}
    </p>
  </div>

  <!-- ===================== SUMMARY ===================== -->
  <div class="section">
    <h2>SUMMARY</h2>
    <hr/>
    <p style="text-align:justify;">${cleanSummary}</p>
  </div>

  <!-- ===================== EXPERIENCE ===================== -->
  ${(() => {
    const validExp = (form.experience || []).filter((exp) =>
      (exp.role && exp.role.trim()) ||
      (exp.company && exp.company.trim()) ||
      (exp.duration && exp.duration.trim()) ||
      (exp.activities && exp.activities.trim())
    );
    if (!validExp.length) return "";

    return `
      <div class="section">
        <h2>EXPERIENCE</h2>
        <hr/>
        ${validExp
          .map(
            (exp) => `
          <div class="mb-12">
            <div class="flex-between" style="font-weight:600;">
              <span>${safe(exp.role)}</span>
              <span>${safe(exp.duration)} Year</span>
            </div>
            <div>${safe(exp.company)}</div>
            ${
              exp.activities && exp.activities.trim().length
                ? `<p style="margin-top:4px; text-align:justify;">${safe(
                    exp.activities
                  )}</p>`
                : ""
            }
          </div>`
          )
          .join("")}
      </div>
    `;
  })()}

  <!-- ===================== PROJECTS ===================== -->
  ${(() => {
    const validProjects = (form.projects || []).filter((p) =>
      (p.name && p.name.trim()) ||
      (p.description && p.description.trim()) ||
      (p.link && p.link.trim()) ||
      (p.keyPoints && p.keyPoints.some((k) => k && k.trim())) ||
      (p.technologies && p.technologies.trim())
    );
    if (!validProjects.length) return "";

    return `
      <div class="section">
        <h2>PROJECTS</h2>
        <hr/>
        ${validProjects
          .map(
            (p) => `
          <div class="mb-14">
            <div class="flex-between" style="font-weight:600;">
              <span>${safe(p.name)}</span>
              ${
                p.link
                  ? `<a href="${safe(
                      p.link.startsWith("http")
                        ? p.link
                        : "https://" + p.link
                    )}" style="color:blue;" target="_blank">${safe(p.link)}</a>`
                  : ""
              }
            </div>
            ${
              p.description
                ? `<p style="margin-top:4px; text-align:justify;">${safe(
                    p.description
                  )}</p>`
                : ""
            }
            ${
              p.keyPoints && p.keyPoints.filter((kp) => kp && kp.trim()).length
                ? `<ul>
                    ${p.keyPoints
                      .filter((kp) => kp && kp.trim())
                      .map((kp) => `<li>${safe(kp)}</li>`)
                      .join("")}
                   </ul>`
                : ""
            }
            ${
              p.technologies && p.technologies.trim().length
                ? `<p><strong style="font-weight:540;">Tech Used:</strong> ${safe(
                    p.technologies
                  )}</p>`
                : ""
            }
          </div>`
          )
          .join("")}
      </div>
    `;
  })()}

  <!-- ===================== EDUCATION ===================== -->
  <div class="section">
    <h2>EDUCATION</h2>
    <hr/>
    ${
      (form.education && form.education.length)
        ? form.education
            .map(
              (e) => `
      <div class="mb-12">
        <div class="flex-between" style="font-weight:600;">
          <span style="color:#2B2B2B;">${safe(e.institute)}</span>
          <span>${safe(e.startYear)} - ${safe(e.endYear)}</span>
        </div>
        <div style="display:flex; gap:4px; margin-top:4px;">
          <span>${safe(e.eduType)}</span>
          <span>${safe(e.department)}.</span>
          <span>${safe(e.scoreType)}:</span>
          <span>${safe(e.score)}</span>
        </div>
      </div>`
            )
            .join("")
        : "<p>No education details</p>"
    }
  </div>

  <!-- ===================== SKILLS ===================== -->
  ${(() => {
    let skills = [];
    if (Array.isArray(form.skills)) {
      skills = form.skills.filter((s) => s && s.toString().trim());
    } else if (typeof form.skills === "string") {
      skills = form.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (!skills.length) return "";

    return `
      <div class="section">
        <h2>SKILLS</h2>
        <hr/>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
          <span>${skills.join(", ")}</span>
        </div>
      </div>
    `;
  })()}

  <!-- ===================== CERTIFICATES ===================== -->
  ${(() => {
    const validCerts = (form.certificates || []).filter((c) =>
      (c.title && c.title.trim()) ||
      (c.issuedBy && c.issuedBy.trim()) ||
      (c.issuedOn && c.issuedOn.trim()) ||
      (c.credential && c.credential.trim())
    );
    if (!validCerts.length) return "";

    return `
      <div class="section">
        <h2>CERTIFICATES</h2>
        <hr/>
        ${validCerts
          .map(
            (c) => `
          <div class="mb-10">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 5px;">
              <strong>${safe(c.title)}</strong>
              <span>${safe(c.issuedOn)}</span>
            </div>
            <p style="margin-bottom: 5px;">Issued By: ${safe(c.issuedBy)}</p>
            ${
              c.credential && c.credential.trim().length
                ? `<p>Credential: <a href="${c.credential}">${safe(c.credential)}</a></p>`
                : ""
            }
          </div>`
          )
          .join("")}
      </div>
    `;
  })()}

  <!-- ===================== ADDITIONAL INFORMATION ===================== -->
  ${(() => {
    const hasLanguages =
      (form.languages || []).some(
        (l) => l && l.language && l.language.toString().trim()
      );
    const hasNationality = !!(form.nationality && form.nationality.trim());
    const hasAvailability = !!(form.availabilityType && form.availabilityType.trim());

    if (!hasLanguages && !hasNationality && !hasAvailability) return "";

    let languagesBlock = "";
    if (hasLanguages) {
      const items = (form.languages || [])
        .filter((l) => l && l.language && l.language.toString().trim())
        .map((lang) => {
          const levels = [];
          if (lang.read) levels.push("Read");
          if (lang.write) levels.push("Write");
          if (lang.speak) levels.push("Speak");

          const levelsStr = levels.length ? ` (${levels.join(", ")})` : ` (Not specified)`;

          return `${safe(lang.language)}${levelsStr}`;
        });

      languagesBlock = `
        <div style="
          margin-bottom: 10px;
          display: flex;
          align-items: flex-start;
          font-size: 14px;
          line-height: 20px;
        ">
          <strong style="white-space: nowrap; margin-right: 6px;">Languages:</strong>

          <div style="
            display: inline-flex;
            flex-wrap: wrap;
            gap: 4px 6px;
          ">
            ${items
              .map((item, idx) => {
                return `<span>${item}${idx !== items.length - 1 ? "," : ""}</span>`;
              })
              .join("")}
          </div>
        </div>
      `;
    }


    // nationality
    let nationalityBlock = "";
    if (hasNationality) {
      nationalityBlock = `
        <div style="margin-bottom:10px;">
          <strong style="font-size:14px;">Nationality:</strong>
          <span> ${safe(form.nationality)}</span>
        </div>
      `;
    }

    // availability
    let availabilityBlock = "";
    if (hasAvailability) {
      let text = "";
      if (form.availabilityType === "Notice Period" && form.noticePeriod) {
        text = "Notice Period for " + safe(form.noticePeriod);
      } else if (
        form.availabilityType === "Available From" &&
        form.availableFromDate
      ) {
        text = "Available from " + safe(form.availableFromDate);
      } else {
        text = safe(form.availabilityType);
      }

      availabilityBlock = `
        <div style="margin-bottom:10px;">
          <strong style="font-size:14px;">Availability:</strong>
          <span> ${text}</span>
        </div>
      `;
    }

    return `
      <div class="section">
        <h2>ADDITIONAL INFORMATION</h2>
        <hr/>
        ${languagesBlock}
        ${nationalityBlock}
        ${availabilityBlock}
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
          execPath = "/usr/bin/chromium-browser";
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

    const fileName =
      (form.name || "resume")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 40) + ".pdf";

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
