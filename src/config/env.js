import dotenv from "dotenv";
dotenv.config();

export const {
  PORT,
  MONGODB_URI,
  JWT_SECRET,
  GOOGLE_API_KEY,
  FRONTEND_ORIGIN,
} = process.env;
