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

const safe = (v) =>
  v ? String(v) : "";


/* ================= SECTION CHECKERS ================= */

const hasExperience =
  form.experience?.some(
    e => e.role || e.company
  );

const hasProjects =
  form.projects?.some(
    p => p.name
  );

const hasCertificates =
  form.certificates?.some(
    c => c.title
  );

const hasSkills =
  Array.isArray(form.skills) &&
  form.skills.some(s => s);

const hasLanguages =
  form.languages?.some(
    l => l.language
  );

const hasAdditional =
  hasLanguages ||
  form.nationality ||
  form.availabilityType;


/* ================= PERSONAL INFO ================= */

const personalInfo = [

`${safe(form.city)}${
  form.state ? ", " + safe(form.state) : ""
}${
  form.pincode ? ", " + safe(form.pincode) : ""
}`,

form.emailId,
form.phoneNo,
form.linkedIn,
form.portfolioLink

].filter(Boolean).join(" | ");



return `

<!DOCTYPE html>

<html>

<head>
<meta charset="utf-8"/>
</head>

<body
style="
font-family:Arial;
padding:40px;
line-height:1.5;
"
>


<!-- HEADER -->

<div
style="
text-align:center;
margin-bottom:20px;
"
>

<h1
style="
margin:0;
font-weight:600;
font-size:20px;
color:#1d59b5;
"
>

${safe(form.name)}

</h1>

<h3
style="
font-size:14px;
margin:4px 0;
font-weight:400;
"
>

${safe(form.role)}

</h3>

<p
style="
font-size:14px;
"
>

${personalInfo}

</p>

</div>



<!-- SUMMARY -->

${cleanSummary ? `

<h2
style="
font-weight:600;
color:#1d59b5;
font-size:16px;
margin-bottom: 5px;
"
>

SUMMARY

</h2>

<hr
style="
border:1px solid;
margin-bottom:10px;
"
/>

<p>

${safe(cleanSummary)}

</p>

` : ""}



<!-- EXPERIENCE -->

${hasExperience ? `

<h2
style="
font-weight:600;
color:#1d59b5;
font-size:16px;
margin-bottom: 5px;
"
>

EXPERIENCE

</h2>

<hr
style="
border:1px solid;
margin-bottom:10px;
"
/>

${form.experience
.filter(e => e.role || e.company)
.map(e => `

<div
style="
margin-bottom:12px;
"
>

<div
style="
display:flex;
justify-content:space-between;
font-weight:600;
"
>

<span>

${safe(e.role)}

</span>

<span>

${safe(e.duration)} Year

</span>

</div>

<div>

${safe(e.company)}

</div>

${e.activities ? `<p>${safe(e.activities)}</p>` : ""}

</div>

`).join("")}

` : ""}



<!-- SKILLS -->

${hasSkills ? `

<h2
style="
font-weight:600;
color:#1d59b5;
font-size:16px;
margin-bottom: 5px;
"
>

SKILLS

</h2>

<hr
style="
border:1px solid;
margin-bottom:10px;
"
/>

<p>

${form.skills
.filter(Boolean)
.join(", ")}

</p>

` : ""}



<!-- EDUCATION -->

${form.education?.length ? `

<h2
style="
font-weight:600;
color:#1d59b5;
font-size:16px;
margin-bottom: 5px;
"
>

EDUCATION

</h2>

<hr
style="
border:1px solid;
margin-bottom:10px;
"
/>

${form.education.map(e => `

<div
style="
margin-bottom:12px;
"
>

<div
style="
display:flex;
justify-content:space-between;
font-weight:600;
"
>

<span>

${safe(e.institute)}

</span>

<span>

${safe(e.startYear)} - ${safe(e.endYear)}

</span>

</div>

<div
style="
display:flex;
justify-content:space-between;
"
>

<div>

${safe(e.eduType)}
${e.department ? ` ${safe(e.department)}` : ""}

</div>

<div>

${e.score
? `${safe(e.scoreType)}: ${safe(e.score)}`
: ""}

</div>

</div>

</div>

`).join("")}

` : ""}



<!-- CERTIFICATES -->

${hasCertificates ? `

<h2
style="
font-weight:600;
color:#1d59b5;
font-size:16px;
margin-bottom: 5px;
"
>

CERTIFICATES

</h2>

<hr
style="
border:1px solid;
margin-bottom:10px;
"
/>

${form.certificates
.filter(c => c.title)
.map(c => `

<div
style="
margin-bottom:10px;
"
>

<div
style="
display:flex;
justify-content:space-between;
font-weight:600;
"
>

<span>

${safe(c.title)}

</span>

<span>

${safe(c.issuedOn)}

</span>

</div>

<div>

${safe(c.issuedBy)}

</div>

</div>

`).join("")}

` : ""}



<!-- PROJECTS -->

${hasProjects ? `

<h2
style="
font-weight:600;
color:#1d59b5;
font-size:16px;
margin-bottom: 5px;
"
>

PROJECTS

</h2>

<hr
style="
border:1px solid;
margin-bottom:10px;
"
/>

${form.projects
.filter(p => p.name)
.map(p => `

<div
style="
margin-bottom:12px;
"
>

<div
style="
display:flex;
justify-content:space-between;
font-weight:600;
"
>

<span>

${safe(p.name)}

</span>

${p.link
? `<a href="${safe(p.link)}">Live Demo</a>`
: ""}

</div>

${p.description
? `<p>${safe(p.description)}</p>`
: ""}

${p.technologies
? `<p><strong>Tech Used:</strong> ${safe(p.technologies)}</p>`
: ""}

</div>

`).join("")}

` : ""}



<!-- ADDITIONAL -->

${hasAdditional ? `

<h2
style="
font-weight:600;
color:#1d59b5;
font-size:16px;
margin-bottom: 5px;
"
>

ADDITIONAL INFORMATION

</h2>

<hr
style="
border:1px solid;
margin-bottom:10px;
"
/>

${hasLanguages ? `

<div>

<strong>Languages:</strong>

${form.languages
.filter(l => l.language)
.map(l => {

const levels=[];

if(l.read) levels.push("Read");
if(l.write) levels.push("Write");
if(l.speak) levels.push("Speak");

return `${safe(l.language)} (${levels.join(", ")})`;

})
.join(", ")}

</div>

` : ""}

${form.nationality
? `<div><strong>Nationality:</strong> ${safe(form.nationality)}</div>`
: ""}

${form.availabilityType
? `<div><strong>Availability:</strong> ${safe(form.availabilityType)}</div>`
: ""}

` : ""}



</body>

</html>

`;

}