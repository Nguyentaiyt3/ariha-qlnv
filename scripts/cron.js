/**
 * Standalone cron runner for Hostinger VPS.
 * Runs via PM2 alongside the Next.js app.
 * Calls the internal API endpoints so all business logic
 * stays in Next.js route handlers.
 */
const cron = require("node-cron");
const https = require("https");
const http = require("http");

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "";

function callEndpoint(path) {
  const url = new URL(path, APP_URL);
  const lib = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      { hostname: url.hostname, port: url.port || (url.protocol === "https:" ? 443 : 80), path: url.pathname, method: "GET", headers: { "x-cron-secret": CRON_SECRET } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(`[cron] ${path} → ${res.statusCode} ${data}`);
          resolve(data);
        });
      },
    );
    req.on("error", (err) => {
      console.error(`[cron] ${path} ERROR:`, err.message);
      reject(err);
    });
    req.end();
  });
}

// Every hour: check risk flags and deadline alerts
cron.schedule("0 * * * *", async () => {
  console.log("[cron] Running deadline check...");
  try {
    await callEndpoint("/api/cron/deadline-check");
  } catch (e) {
    console.error("[cron] deadline-check failed:", e);
  }
});

console.log("[cron] ARiHA WorkHub cron runner started.");
