import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDB } from "../config/db.js";
import { JWT_SECRET } from "../config/env.js";

export async function register(req, res) {
  const { name, email, password } = req.body;
  const users = getDB().collection("users");

  const exists = await users.findOne({ email });
  if (exists) return res.status(400).json({ error: "User exists" });

  const hashed = await bcrypt.hash(password, 10);
  await users.insertOne({ name, email, password: hashed });

  res.json({ success: true });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const users = getDB().collection("users");

  const user = await users.findOne({ email });
  if (!user) return res.status(400).json({ error: "User not found" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Invalid password" });

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ success: true, token });
}
