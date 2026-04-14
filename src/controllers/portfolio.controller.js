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
// ==============================
// 🔹 GET SINGLE PORTFOLIO
// ==============================

export async function getPortfolioById(req, res) {

  try {

    const portfolios =
      getDB().collection("portfolios");

    const { id } = req.params;

    const data = await portfolios.findOne({
      _id: new ObjectId(id),
    });

    if (!data) {

      return res.status(404).json({
        error: "Portfolio not found"
      });

    }

    res.json(data);

  } catch (err) {

    console.error(
      "FETCH ONE ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to fetch portfolio"
    });

  }

}

export async function updatePortfolio(req, res) {

  try {

    if (!req.user?.id) {

      return res.status(401).json({
        error: "Unauthorized"
      });

    }

    const portfolios =
      getDB().collection("portfolios");

    const { id } = req.params;

    let userId;

    // ✅ Handle ObjectId correctly

    if (ObjectId.isValid(req.user.id)) {

      userId =
        new ObjectId(req.user.id);

    } else {

      userId =
        req.user.id;

    }

    const updatedData = {

      ...req.body,

      education:
        normalizeEducationArray(
          req.body.education
        ),

      updatedAt:
        new Date()

    };

    const result =
      await portfolios.updateOne(

        {
          _id: new ObjectId(id),
          userId
        },

        {
          $set: updatedData
        }

      );

    // ✅ Check update actually happened

    if (result.matchedCount === 0) {

      return res.status(404).json({
        error: "Resume not found or unauthorized"
      });

    }

    res.json({
      success: true
    });

  } catch (err) {

    console.error(
      "UPDATE ERROR:",
      err
    );

    res.status(500).json({
      error: "Update failed"
    });

  }

}

// ==============================
// 🔹 DELETE PORTFOLIO
// ==============================

export async function deletePortfolio(req, res) {

  try {

    const portfolios =
      getDB().collection("portfolios");

    const { id } = req.params;

    await portfolios.deleteOne({
      _id: new ObjectId(id),
    });

    res.json({
      success: true
    });

  } catch (err) {

    console.error(
      "DELETE ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to delete portfolio"
    });

  }

}