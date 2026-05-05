import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });
async function run() {
  try {
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: "A cute dog",
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: "1:1"
      }
    });
    console.log("Success:", !!response.generatedImages[0].image.imageBytes);
  } catch (e) {
    console.error("Error:", e.message);
  }
}
run();
