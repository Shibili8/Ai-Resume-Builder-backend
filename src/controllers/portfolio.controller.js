import { getDB } from "../config/db.js";
import { normalizeEducationArray } from "../utils/normalizeEducation.js";

// ==============================
// 🔹 SAVE PORTFOLIO
// ==============================
export async function savePortfolio(req, res) {
  try {
    const portfolios = getDB().collection("portfolios");

    const data = {
      ...req.body,
      education: normalizeEducationArray(req.body.education),
      userId: req.user.id, // ✅ now safe
      createdAt: new Date(),
    };

    const result = await portfolios.insertOne(data);

    res.json({
      success: true,
      id: result.insertedId,
    });
  } catch (err) {
    console.error("SAVE ERROR:", err);
    res.status(500).json({ error: "Failed to save portfolio" });
  }
}

// ==============================
// 🔹 GET PORTFOLIOS
// ==============================
export async function getPortfolios(req, res) {
  try {
    const portfolios = getDB().collection("portfolios");

    const data = await portfolios
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(data);
  } catch (err) {
    console.error("FETCH ERROR:", err);
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
}
