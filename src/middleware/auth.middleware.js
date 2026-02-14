import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

export function authMiddleware(req, res, next) {
  const aiToken = req.headers.authorization?.split(" ")[1];
  if (aiToken) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(aiToken, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
