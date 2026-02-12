import { getBrowser } from "../utils/browser.js";
import { normalizeEducationArray } from "../utils/normalizeEducation.js";

/**
 * POST /pdf/export
 */
export const exportPdf = async (req, res) => {
  try {
    console.log("📥 PDF export request received");

    const { form, gensummary } = req.body;

    if (!form) {
      return res.status(400).json({ error: "Form data missing" });
    }

    // 🔹 Normalize education
    form.education = normalizeEducationArray(form.education);

    const cleanSummary = (gensummary || "").replace(/\*/g, "");

    // =======================
    // 🔹 Build HTML
    // =======================
    const html = buildResumeHtml(form, cleanSummary);

    // =======================
    // 🔹 Launch Browser (single source of truth)
    // =======================
    let browser;
    try {
      browser = await getBrowser();
    } catch (err) {
      console.error("❌ Browser launch failed:", err);
      return res.status(500).json({ error: "Failed to launch browser" });
    }

    // =======================
    // 🔹 Generate PDF
    // =======================
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

    // =======================
    // 🔹 Response
    // =======================
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.end(pdfBuffer);
  } catch (error) {
    console.error("❌ PDF EXPORT ERROR:", error);
    return res.status(500).json({
      error: "PDF generation failed",
      details: error.message,
    });
  }
};

// ======================================================
// 🔹 HTML BUILDER (unchanged, safe to keep here)
// ======================================================
function buildResumeHtml(form, cleanSummary) {
  const safe = (v) => (v ? String(v) : "");

  const hasExperience =
    form.experience?.some(
      (e) => e.role || e.company || e.duration || e.activities
    );

  const hasProjects =
    form.projects?.some(
      (p) => p.name || p.description || p.technologies
    );

  const hasCertificates =
    form.certificates?.some(
      (c) => c.title || c.issuedBy || c.issuedOn
    );

  const hasSkills =
    Array.isArray(form.skills) &&
    form.skills.some((s) => s && s.trim());

  const hasLanguages =
    form.languages?.some((l) => l.language && l.language.trim());

  const hasAdditional =
    hasLanguages ||
    (form.nationality && form.nationality.trim()) ||
    (form.availabilityType && form.availabilityType.trim());

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
body { font-family: Arial, sans-serif; padding: 40px; }
h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
h2 { font-size: 15px; font-weight: 700; margin-top: 20px; }
p, span, li, div { font-size: 12px; }
hr { border: 1px solid #000; margin: 6px 0 10px; }
.section { margin-bottom: 10px; }
.flex-between { display: flex; justify-content: space-between; }
ul { padding-left: 18px; margin-top: 4px; }
</style>
</head>

<body>

<!-- HEADER -->
<div style="text-align:center; margin-bottom:20px;">
  <h1>${safe(form.name)}</h1>
  <div>${safe(form.role)}</div>
  <div>
    ${safe(form.city)}, ${safe(form.state)}, ${safe(form.pincode)}
    ${form.emailId ? ` | ${safe(form.emailId)}` : ""}
    ${form.phoneNo ? ` | ${safe(form.phoneNo)}` : ""}
    ${form.linkedIn ? ` | ${safe(form.linkedIn)}` : ""}
  </div>
</div>

<!-- SUMMARY -->
${cleanSummary ? `
<div class="section">
  <h2>SUMMARY</h2>
  <hr/>
  <p>${cleanSummary}</p>
</div>` : ""}

<!-- EXPERIENCE -->
${hasExperience ? `
<div class="section">
<h2>EXPERIENCE</h2>
<hr/>
${form.experience
  .filter((e) => e.role || e.company)
  .map(
    (e) => `
<div style="margin-bottom:10px;">
  <div class="flex-between">
    <strong>${safe(e.role)}</strong>
    <span>${safe(e.duration)} Year</span>
  </div>
  <div>Company: ${safe(e.company)}</div>
  ${e.activities ? `<p>${safe(e.activities)}</p>` : ""}
</div>`
  )
  .join("")}
</div>` : ""}

<!-- PROJECTS -->
${hasProjects ? `
<div class="section">
<h2>PROJECTS</h2>
<hr/>
${form.projects
  .filter((p) => p.name)
  .map(
    (p) => `
<div style="margin-bottom:10px;">
  <div class="flex-between">
    <strong>${safe(p.name)}</strong>
    ${p.link ? `<a href=${safe(p.link)} target="_blank">Live Demo</a>` : ""}
  </div>
  ${p.description ? `<p>${safe(p.description)}</p>` : ""}
  ${
    p.keyPoints?.filter((k) => k && k.trim()).length
      ? `<ul>
        ${p.keyPoints
          .filter((k) => k && k.trim())
          .map((k) => `<li>${safe(k)}</li>`)
          .join("")}
      </ul>`
      : ""
  }
  ${p.technologies ? `<p><strong>Tech Used:</strong> ${safe(p.technologies)}</p>` : ""}
</div>`
  )
  .join("")}
</div>` : ""}

<!-- EDUCATION -->
<div class="section">
<h2>EDUCATION</h2>
<hr/>
${form.education
  ?.map(
    (e) => `
<div style="margin-bottom:10px;">
  <div class="flex-between">
    <strong>${safe(e.institute)}</strong>
    <span>${safe(e.startYear)} - ${safe(e.endYear)}</span>
  </div>
  <div>
    ${safe(e.eduType)}
    ${e.department ? ` — ${safe(e.department)}` : ""}
    ${e.score ? ` — ${safe(e.scoreType)}: ${safe(e.score)}` : ""}
  </div>
</div>`
  )
  .join("")}
</div>

<!-- SKILLS -->
${hasSkills ? `
<div class="section">
<h2>SKILLS</h2>
<hr/>
<div>
${form.skills.filter(Boolean).join(", ")}
</div>
</div>` : ""}

<!-- CERTIFICATES -->
${hasCertificates ? `
<div class="section">
<h2>CERTIFICATES</h2>
<hr/>
${form.certificates
  .filter((c) => c.title)
  .map(
    (c) => `
<div style="margin-bottom:10px;">
  <div class="flex-between">
    <strong>${safe(c.title)}</strong>
    <span>${safe(c.issuedOn)}</span>
  </div>
  <div>${safe(c.issuedBy)}</div>
</div>`
  )
  .join("")}
</div>` : ""}

<!-- ADDITIONAL INFORMATION -->
${hasAdditional ? `
<div class="section">
<h2>ADDITIONAL INFORMATION</h2>
<hr/>
${hasLanguages ? `
<div>
<strong>Languages:</strong>
${form.languages
  .filter((l) => l.language)
  .map((l) => {
    const levels = [];
    if (l.read) levels.push("Read");
    if (l.write) levels.push("Write");
    if (l.speak) levels.push("Speak");
    return `${safe(l.language)} (${levels.join(", ")})`;
  })
  .join(", ")}
</div>` : ""}

${form.nationality ? `<div><strong>Nationality:</strong> ${safe(form.nationality)}</div>` : ""}

${form.availabilityType ? `<div><strong>Availability:</strong> ${safe(form.availabilityType)}</div>` : ""}

</div>` : ""}

</body>
</html>
${console.log("PDF Exported")}
`;

}

