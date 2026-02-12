import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({
  model: "models/gemini-2.5-flash",
});

/**
 * Generate AI text with retry logic
 */
export async function generateWithRetry(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      if (error.message.includes("503") && i < retries - 1) {
        console.log(`⚠ Gemini overloaded, retrying (${i + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        throw error;
      }
    }
  }
}
