import { getDB } from "../config/db.js";
import { normalizeEducationArray } from "../utils/normalizeEducation.js";
import { ObjectId } from "mongodb";

// ==============================
// 🔹 SAVE PORTFOLIO
// ==============================

export async function savePortfolio(req, res) {
  try {

    if (!req.user?.id) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }

    const portfolios =
      getDB().collection("portfolios");

    const data = {

      ...req.body,

      education:
        normalizeEducationArray(
          req.body.education
        ),

      // ✅ Convert to ObjectId
      userId: new ObjectId(
        req.user.id
      ),

      createdAt: new Date(),

    };

    const result =
      await portfolios.insertOne(data);

    res.json({
      success: true,
      id: result.insertedId,
    });

  } catch (err) {

    console.error(
      "SAVE ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to save portfolio"
    });

  }
}


// ==============================
// 🔹 GET PORTFOLIOS
// ==============================

export async function getPortfolios(req, res) {

  try {

    if (!req.user?.id) {

      return res.status(401).json({
        error: "Unauthorized"
      });

    }

    const portfolios =
      getDB().collection("portfolios");

    let userId;

    try {

      // ✅ Safely convert userId
      userId =
        new ObjectId(req.user.id);

    } catch {

      return res.status(400).json({
        error: "Invalid user ID"
      });

    }

    const data = await portfolios
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(data);

  } catch (err) {

    console.error(
      "FETCH ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to fetch portfolio"
    });

  }

}