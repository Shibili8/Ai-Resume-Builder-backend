import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,

  defaultHeaders: {
    "HTTP-Referer": "https://ai-resume-builder.vercel.app",
    "X-Title": "AI Resume Builder",
  },
});

export async function generateWithRetry(
  prompt,
  retries = 3
) {

  for (let i = 0; i < retries; i++) {

    try {

      const completion =
        await openai.chat.completions.create({

          model: "deepseek/deepseek-chat",

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          max_tokens: 300,

        });

      return completion
        .choices[0]
        .message.content;

    } catch (error) {

      console.error(
        "OpenRouter Error:",
        error.message
      );

      if (
        error.status === 429 &&
        i < retries - 1
      ) {

        await new Promise((r) =>
          setTimeout(r, 3000)
        );

      } else {

        throw error;

      }

    }

  }

}