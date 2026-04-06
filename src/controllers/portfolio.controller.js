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

    let userId;

    // ✅ Safely handle ObjectId
    if (ObjectId.isValid(req.user.id)) {

      userId =
        new ObjectId(req.user.id);

    } else {

      userId =
        req.user.id;

    }

    const data = {

      ...req.body,

      education:
        normalizeEducationArray(
          req.body.education
        ),

      userId,

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

    // ✅ Handle both ObjectId and string IDs

    if (ObjectId.isValid(req.user.id)) {

      userId =
        new ObjectId(req.user.id);

    } else {

      userId =
        req.user.id;

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