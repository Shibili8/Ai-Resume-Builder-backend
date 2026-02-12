import { MongoClient } from "mongodb";
import { MONGODB_URI } from "./env.js";

const client = new MongoClient(
  MONGODB_URI || "mongodb://localhost:27017/ai_resume_portfolio"
);

let db;

export async function connectDB() {
  try {
    await client.connect();
    db = client.db();
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

export const getDB = () => db;
