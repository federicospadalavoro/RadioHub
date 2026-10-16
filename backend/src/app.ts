import express from "express";

export const app = express();

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});
