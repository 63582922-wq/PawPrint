import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Readable } from "stream";
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

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") throw new Error("invalid_data_url");
  if (!dataUrl.startsWith("data:")) throw new Error("invalid_data_url");
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("invalid_data_url");
  const header = dataUrl.slice(0, commaIndex);
  const base64Data = dataUrl.slice(commaIndex + 1);
  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  const mimeType = (mimeMatch?.[1] || "application/octet-stream").toLowerCase();
  return { mimeType, base64Data };
}

function extractImageFromGeminiJson(json) {
  const candidates = json?.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      const data = inline?.data;
      if (data) {
        return {
          base64Data: String(data),
          mimeType: String(inline?.mimeType || inline?.mime_type || "image/png").toLowerCase(),
        };
      }
    }
  }
  return { base64Data: "", mimeType: "image/png" };
}

function writeBase64ImageToUploads(base64Data, mimeType, filenameBase) {
  const safeBase = String(filenameBase || "pawprint").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32) || "pawprint";
  const id = crypto.randomBytes(12).toString("hex");
  const mt = String(mimeType || "image/png").toLowerCase();
  const ext = mt.includes("png") ? "png" : mt.includes("webp") ? "webp" : mt.includes("gif") ? "gif" : "jpg";
  const buf = Buffer.from(String(base64Data || ""), "base64");
  const filename = `${safeBase}-${id}.${ext}`;
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, buf);
  return `${APP_URL}/uploads/${filename}`;
}

function tryReadUploadsImageAsBase64(urlString) {
  try {
    if (!urlString) return null;
    const u = new URL(String(urlString));
    const app = new URL(APP_URL);
    if (u.hostname !== app.hostname) return null;
    if (!u.pathname.startsWith("/uploads/")) return null;
    const filename = path.basename(u.pathname);
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const MAX_BYTES = 3 * 1024 * 1024;
    if (buf.length > MAX_BYTES) return null;
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const mimeType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/jpeg";
    return { base64: buf.toString("base64"), mimeType };
  } catch (e) {
    return null;
  }
}

app.post("/api/nano-banana/generate-character-sheet", async (req, res) => {
  try {
    if (!APIYI_API_KEY) {
      res.status(500).json({ error: "missing_apiyi_api_key" });
      return;
    }

    const promptText = String(req.body?.promptText || "").trim();
    const referenceImageDataUrl = req.body?.referenceImageDataUrl ? String(req.body.referenceImageDataUrl) : "";
    const referenceImageUrl = req.body?.referenceImageUrl ? String(req.body.referenceImageUrl) : "";
    const imageModel = String(req.body?.imageModel || "gemini-3.1-flash-image-preview").trim();
    const imageSizeRaw = String(req.body?.imageSize || "2K").trim();
    const imageSize = imageSizeRaw === "1K" || imageSizeRaw === "2K" ? imageSizeRaw : "2K";

    if (!promptText) {
      res.status(400).json({ error: "missing_prompt" });
      return;
    }

    const parts = [{ text: promptText }];
    if (referenceImageDataUrl) {
      const parsed = parseDataUrl(referenceImageDataUrl);
      parts.push({ inline_data: { data: parsed.base64Data, mime_type: parsed.mimeType } });
    } else if (referenceImageUrl && /^https?:\/\//i.test(referenceImageUrl)) {
      const local = tryReadUploadsImageAsBase64(referenceImageUrl);
      if (local) {
        parts.push({ inline_data: { data: local.base64, mime_type: local.mimeType } });
      } else {
        const imgRes = await undiciFetch(referenceImageUrl, {
          method: "GET",
          ...(dispatcher ? { dispatcher } : {}),
        });
        if (!imgRes.ok) {
          res.status(502).json({ error: "reference_image_fetch_failed", status: imgRes.status });
          return;
        }
        const ab = await imgRes.arrayBuffer();
        const buf = Buffer.from(ab);
        const MAX_BYTES = 3 * 1024 * 1024;
        if (buf.length > MAX_BYTES) {
          res.status(413).json({ error: "reference_image_too_large" });
          return;
        }
        const mt = String(imgRes.headers.get("content-type") || "image/jpeg").toLowerCase();
        parts.push({ inline_data: { data: buf.toString("base64"), mime_type: mt } });
      }
    }

    const upstreamUrl = `https://api.apiyi.com/v1beta/models/${encodeURIComponent(imageModel)}:generateContent`;
    const upstreamRes = await undiciFetch(upstreamUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${APIYI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "1:1", imageSize },
        },
      }),
      ...(dispatcher ? { dispatcher } : {}),
    });

    const text = await upstreamRes.text();
    if (!upstreamRes.ok) {
      res.status(upstreamRes.status).setHeader("content-type", "application/json; charset=utf-8");
      res.end(text || JSON.stringify({ error: "upstream_failed" }));
      return;
    }

    const json = JSON.parse(text || "{}");
    const img = extractImageFromGeminiJson(json);
    if (!img.base64Data) {
      res.status(502).json({ error: "no_image_data" });
      return;
    }

    const url = writeBase64ImageToUploads(img.base64Data, img.mimeType, "pawprint-card");
    res.json({ url });
  } catch (e) {
    res.status(502).json({ error: "nano_banana_failed", message: String(e?.message || e) });
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
      if (k.toLowerCase() === "accept-encoding") continue;
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
      if (k.toLowerCase() === "accept-encoding") continue;
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

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      if (key.toLowerCase() === "content-length") return;
      res.setHeader(key, value);
    });
    if (upstreamRes.body) {
      const nodeStream = Readable.fromWeb(upstreamRes.body);
      nodeStream.on("error", () => {
        try {
          res.end();
        } catch (e) {}
      });
      nodeStream.pipe(res);
      return;
    }
    res.end();
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
