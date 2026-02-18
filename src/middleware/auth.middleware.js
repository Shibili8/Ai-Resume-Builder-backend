import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

export function authMiddleware(req, res, next) {
  const aiToken = req.headers.authorization?.split(" ")[1];

  // ❌ No token
  if (!aiToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(aiToken, JWT_SECRET);

    req.user = decoded; // attach user
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
