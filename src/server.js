import app from "./app.js";
import { connectDB } from "./config/db.js";
import { PORT } from "./config/env.js";
import dotenv from "dotenv";
dotenv.config();

await connectDB();

app.listen(PORT || 4000, () =>
  console.log(`Server running on http://localhost:${PORT || 4000}`)
);
