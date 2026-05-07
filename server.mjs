import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { fetch as undiciFetch, ProxyAgent } from "undici";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");

const PORT = Number(process.env.PORT || 3000);
const APP_URL = String(process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.VITE_DASHSCOPE_API_KEY || "";
const APIYI_API_KEY =
  process.env.APIYI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.OPENAI_APIYI_API_KEY ||
  "";

const HTTP_PROXY =
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.ALL_PROXY ||
  process.env.all_proxy ||
  "";

const dispatcher = HTTP_PROXY ? new ProxyAgent({ uri: HTTP_PROXY, allowH2: false }) : undefined;

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/version", (_req, res) => {
  res.json({
    commit:
      process.env.RENDER_GIT_COMMIT ||
      process.env.GIT_COMMIT ||
      process.env.COMMIT_SHA ||
      "",
    service: process.env.RENDER_SERVICE_ID || "",
    instance: process.env.RENDER_INSTANCE_ID || "",
  });
});

app.use(express.json({ limit: "15mb" }));

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir, { fallthrough: false, maxAge: "1h" }));

app.post("/api/upload-dataurl", async (req, res) => {
  try {
    const dataUrl = String(req.body?.dataUrl || "");
    const filenameBase = String(req.body?.filenameBase || "pawprint");
    if (!dataUrl.startsWith("data:")) {
      res.status(400).json({ error: "invalid_data_url" });
      return;
    }
    const comma = dataUrl.indexOf(",");
    if (comma < 0) {
      res.status(400).json({ error: "invalid_data_url" });
      return;
    }
    const header = dataUrl.slice(0, comma);
    const base64 = dataUrl.slice(comma + 1);
    const mtMatch = header.match(/^data:([^;]+);base64$/i);
    const mimeType = (mtMatch?.[1] || "application/octet-stream").toLowerCase();
    const ext = mimeType.includes("png")
      ? "png"
      : mimeType.includes("webp")
        ? "webp"
        : mimeType.includes("gif")
          ? "gif"
          : "jpg";

    const buf = Buffer.from(base64, "base64");
    const safeBase = filenameBase.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32) || "pawprint";
    const id = crypto.randomBytes(12).toString("hex");
    const filename = `${safeBase}-${id}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buf);
    const url = `${APP_URL}/uploads/${filename}`;
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: "upload_failed", message: String(e?.message || e) });
  }
});

app.use("/api/dashscope", async (req, res) => {
  try {
    if (!DASHSCOPE_API_KEY) {
      res.status(500).json({ error: "missing_dashscope_api_key" });
      return;
    }

    const upstreamUrl = `https://dashscope.aliyuncs.com${req.originalUrl.replace(/^\/api\/dashscope/, "")}`;
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!v) continue;
      if (k.toLowerCase() === "host") continue;
      if (k.toLowerCase() === "content-length") continue;
      if (k.toLowerCase() === "origin") continue;
      headers[k] = Array.isArray(v) ? v.join(",") : String(v);
    }
    headers["authorization"] = `Bearer ${DASHSCOPE_API_KEY}`;

    const upstreamRes = await undiciFetch(upstreamUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(String(req.method || "").toUpperCase())
        ? undefined
        : JSON.stringify(req.body ?? {}),
      ...(dispatcher ? { dispatcher } : {}),
    });

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      if (key.toLowerCase() === "content-encoding") return;
      if (key.toLowerCase() === "content-length") return;
      res.setHeader(key, value);
    });
    const ab = await upstreamRes.arrayBuffer();
    res.end(Buffer.from(ab));
  } catch (e) {
    res.status(502).json({ error: "dashscope_proxy_failed", message: String(e?.message || e) });
  }
});

app.use("/api/openai", async (req, res) => {
  try {
    if (!APIYI_API_KEY) {
      res.status(500).json({ error: "missing_apiyi_api_key" });
      return;
    }

    const upstreamUrl = `https://api.apiyi.com${req.originalUrl.replace(/^\/api\/openai/, "")}`;
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!v) continue;
      if (k.toLowerCase() === "host") continue;
      if (k.toLowerCase() === "content-length") continue;
      if (k.toLowerCase() === "origin") continue;
      headers[k] = Array.isArray(v) ? v.join(",") : String(v);
    }
    headers["authorization"] = `Bearer ${APIYI_API_KEY}`;

    const upstreamRes = await undiciFetch(upstreamUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(String(req.method || "").toUpperCase())
        ? undefined
        : req,
      duplex: "half",
      ...(dispatcher ? { dispatcher } : {}),
    });

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      if (key.toLowerCase() === "content-encoding") return;
      if (key.toLowerCase() === "content-length") return;
      res.setHeader(key, value);
    });
    const ab = await upstreamRes.arrayBuffer();
    res.end(Buffer.from(ab));
  } catch (e) {
    res.status(502).json({ error: "openai_proxy_failed", message: String(e?.message || e) });
  }
});

const distDir = path.join(__dirname, "dist");
app.use(
  express.static(distDir, {
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("cache-control", "no-store");
      }
    },
  })
);
app.get("*", (_req, res) => {
  res.setHeader("cache-control", "no-store");
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
