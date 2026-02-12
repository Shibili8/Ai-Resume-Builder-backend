import { getDB } from "../config/db.js";
import { normalizeEducationArray } from "../utils/normalizeEducation.js";

export async function savePortfolio(req, res) {
  const portfolios = getDB().collection("portfolios");

  const data = {
    ...req.body,
    education: normalizeEducationArray(req.body.education),
    userId: req.user.id,
    createdAt: new Date(),
  };

  const result = await portfolios.insertOne(data);
  res.json({ success: true, id: result.insertedId });
}

export async function getPortfolios(req, res) {
  const portfolios = getDB().collection("portfolios");
  const data = await portfolios.find({ userId: req.user.id }).toArray();
  res.json(data);
}
