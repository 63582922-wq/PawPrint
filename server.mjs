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

    const method = String(req.method || "GET").toUpperCase();
    const contentType = String(req.headers["content-type"] || "");
    let body = undefined;
    if (!["GET", "HEAD"].includes(method)) {
      if (contentType.toLowerCase().includes("application/json")) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(req.body ?? {});
      } else {
        const MAX_BYTES = 25 * 1024 * 1024;
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buf.length;
          if (size > MAX_BYTES) {
            res.status(413).json({ error: "payload_too_large" });
            return;
          }
          chunks.push(buf);
        }
        body = chunks.length ? Buffer.concat(chunks) : undefined;
      }
    }
    if (body && Buffer.isBuffer(body) && !headers["content-length"]) {
      headers["content-length"] = String(body.length);
    }

    const upstreamRes = await undiciFetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      ...(dispatcher ? { dispatcher } : {}),
    });

    const ab = await upstreamRes.arrayBuffer();
    const buf = Buffer.from(ab);

    const path = req.originalUrl.replace(/^\/api\/openai/, "");
    const isImagesEndpoint = /^\/v1\/images\/(edits|generations)\b/i.test(path);
    const upstreamContentType = String(upstreamRes.headers.get("content-type") || "");

    if (upstreamRes.ok && isImagesEndpoint && upstreamContentType.toLowerCase().includes("application/json")) {
      try {
        const json = JSON.parse(buf.toString("utf8") || "{}");
        const b64 = String(json?.data?.[0]?.b64_json || "");
        if (b64) {
          const imgBuf = Buffer.from(b64, "base64");
          const ext = (() => {
            if (imgBuf.length >= 12 && imgBuf[0] === 0x52 && imgBuf[1] === 0x49 && imgBuf[2] === 0x46 && imgBuf[3] === 0x46) {
              const ascii = imgBuf.slice(8, 12).toString("ascii");
              if (ascii === "WEBP") return "webp";
            }
            if (imgBuf.length >= 8 && imgBuf[0] === 0x89 && imgBuf[1] === 0x50 && imgBuf[2] === 0x4e && imgBuf[3] === 0x47) return "png";
            if (imgBuf.length >= 2 && imgBuf[0] === 0xff && imgBuf[1] === 0xd8) return "jpg";
            return "png";
          })();
          const safeBase = "openai-image";
          const id = crypto.randomBytes(12).toString("hex");
          const filename = `${safeBase}-${id}.${ext}`;
          const filePath = path.join(uploadsDir, filename);
          fs.writeFileSync(filePath, imgBuf);
          const url = `${APP_URL}/uploads/${filename}`;
          res.status(200).json({ url });
          return;
        }
      } catch (e) {}
    }

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      if (key.toLowerCase() === "content-encoding") return;
      if (key.toLowerCase() === "content-length") return;
      res.setHeader(key, value);
    });
    res.end(buf);
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
