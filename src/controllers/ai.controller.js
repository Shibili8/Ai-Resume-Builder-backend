import { generateWithRetry } from "../services/gemini.service.js";

export const generateSummary = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const summary = await generateWithRetry(prompt);

    res.json({
      success: true,
      summary: summary.trim(),
    });
  } catch (error) {
    console.error("❌ AI Generation Error:", error.message);
    res.status(500).json({
      error: "AI generation failed",
      details: error.message,
    });
  }
};
