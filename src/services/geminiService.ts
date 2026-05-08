function getApiYiProxyBaseUrl() {
  return "/api/openai";
}

async function apiyiGeminiGenerateContent(model: string, body: any) {
  const baseUrl = getApiYiProxyBaseUrl();
  const res = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Gemini request failed (${res.status})`);
  return JSON.parse(text || "{}");
}

function extractTextFromGeminiJson(json: any): string {
  const cand = (json?.candidates || [])[0];
  const parts = cand?.content?.parts || [];
  const text = parts.find((p: any) => typeof p?.text === "string")?.text;
  return String(text || "");
}

function extractImageFromGeminiJson(json: any): { base64Data: string; mimeType: string } {
  const candidates = json?.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      const data = inline?.data;
      if (data) {
        return {
          base64Data: String(data),
          mimeType: String(inline?.mimeType || inline?.mime_type || "image/png"),
        };
      }
    }
  }
  return { base64Data: "", mimeType: "image/png" };
}

export async function analyzePetProfileFromImages(imageDatas: string[]) {
  const prompt = `Analyze the pet in the provided photos.
Return ONLY valid JSON with this schema:
{
  "breed": string,
  "characteristics": string[],
  "visualPrompt": string
}
Rules:
- "breed": best guess; use "Unknown" if unsure.
- "characteristics": 4-10 short phrases describing unique visible traits (colors, markings, ear shape, tail, fur length, eye color, muzzle shape).
- "visualPrompt": a short, strict description to recreate the exact same pet consistently (no style words, no anime/cartoon, no text).
No markdown, no extra keys.`;

  const normalizedImages = await Promise.all(
    imageDatas.slice(0, 3).map((d) =>
      downscaleImageDataUrlIfNeeded(d, { maxDimension: 1280, jpegQuality: 0.85, maxBytes: 1_800_000 })
    )
  );

  const visionModel = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_GEMINI_VISION_MODEL || "").trim();
      if (v) return v;
    } catch (e) {}
    return "gemini-2.5-flash";
  })();

  const imageParts = normalizedImages.map((data) => {
    const parsed = parseDataUrl(data);
    return { inline_data: { data: parsed.base64Data, mime_type: parsed.mimeType } };
  });

  const json = await withNetworkRetries(() =>
    apiyiGeminiGenerateContent(visionModel, {
      contents: [{ role: "user", parts: [{ text: prompt }, ...imageParts] }],
      generationConfig: { responseMimeType: "application/json" },
    })
  );

  const text = extractTextFromGeminiJson(json);
  const parsed = JSON.parse(text || "{}");

  const breed = typeof parsed?.breed === "string" ? parsed.breed.trim() : "";
  const characteristics = Array.isArray(parsed?.characteristics)
    ? parsed.characteristics.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 12)
    : [];
  const visualPrompt = typeof parsed?.visualPrompt === "string" ? parsed.visualPrompt.trim() : "";

  return {
    breed: breed || "Unknown",
    characteristics,
    visualPrompt: visualPrompt || "Match the pet in the reference image exactly.",
  };
}

// We instantiate ai inside functions to ensure they pick up dynamic env updates

function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } {
  if (!dataUrl) throw new Error("Image data is missing.");
  if (!dataUrl.startsWith("data:")) throw new Error("Expected a data URL for image input.");
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("Invalid data URL: missing comma separator.");
  const header = dataUrl.slice(0, commaIndex);
  const base64Data = dataUrl.slice(commaIndex + 1);
  const mimeMatch = header.match(/^data:([^;]+);base64$/);
  const mimeType = mimeMatch?.[1] || "application/octet-stream";
  return { mimeType, base64Data };
}

function estimateBase64Bytes(base64Data: string): number {
  const cleaned = (base64Data || "").replace(/[\r\n\s]/g, "");
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

async function downscaleImageDataUrlIfNeeded(
  dataUrl: string,
  options?: { maxDimension?: number; jpegQuality?: number; maxBytes?: number }
): Promise<string> {
  const { maxDimension = 1024, jpegQuality = 0.85, maxBytes = 1_500_000 } = options || {};
  const parsed = parseDataUrl(dataUrl);
  const approxBytes = estimateBase64Bytes(parsed.base64Data);

  if (approxBytes <= maxBytes) return dataUrl;

  if (typeof window === "undefined" || typeof Image === "undefined" || typeof document === "undefined") {
    throw new Error(
      `Image is too large (${approxBytes} bytes). Please upload a smaller image (<= ~${Math.round(maxBytes / 1024)}KB) or run in a browser environment.`
    );
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image for resizing."));
    image.src = dataUrl;
  });

  const srcW = img.naturalWidth || (img as any).width || 0;
  const srcH = img.naturalHeight || (img as any).height || 0;
  if (!srcW || !srcH) return dataUrl;

  const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
  if (scale >= 1) return dataUrl;

  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const resized = canvas.toDataURL("image/jpeg", jpegQuality);
  const resizedParsed = parseDataUrl(resized);
  const resizedBytes = estimateBase64Bytes(resizedParsed.base64Data);
  if (resizedBytes > maxBytes) {
    return canvas.toDataURL("image/jpeg", Math.max(0.5, jpegQuality - 0.2));
  }
  return resized;
}

function extractHttpStatusFromError(e: any): number | null {
  const direct =
    (typeof e?.status === "number" && e.status) ||
    (typeof e?.code === "number" && e.code) ||
    (typeof e?.error?.code === "number" && e.error.code) ||
    (typeof e?.cause?.status === "number" && e.cause.status) ||
    (typeof e?.cause?.code === "number" && e.cause.code);
  if (typeof direct === "number") return direct;

  const message = String(e?.message || "");
  const match = message.match(/"code"\s*:\s*(\d{3})/);
  if (match?.[1]) return Number(match[1]);
  return null;
}

function isRetryableGeminiError(e: any): boolean {
  const message = String(e?.message || "");
  if (/无可用渠道/i.test(message)) return false;
  if (/计费模式\s*\\[按次计费\\]/i.test(message)) return false;
  if (/shell_api_error/i.test(message)) return false;
  const status = extractHttpStatusFromError(e);
  if (status && [429, 500, 502, 503, 504].includes(status)) return true;
  if (/UNAVAILABLE/i.test(message)) return true;
  return e instanceof TypeError && /fetch/i.test(message);
}

async function withNetworkRetries<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseDelayMs?: number; maxDelayMs?: number }
) {
  const retries = options?.retries ?? 4;
  const baseDelayMs = options?.baseDelayMs ?? 800;
  const maxDelayMs = options?.maxDelayMs ?? 15_000;
  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const retryable = isRetryableGeminiError(e);
      if (!retryable || attempt === retries) throw e;
      const jitter = Math.floor(Math.random() * 250);
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt) + jitter);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

export async function describeSceneImage(sceneImageDataUrl: string) {
  const normalized = await downscaleImageDataUrlIfNeeded(sceneImageDataUrl, {
    maxDimension: 1280,
    jpegQuality: 0.85,
    maxBytes: 1_800_000,
  });

  const prompt =
    "Describe the scene in the image in 2-4 short sentences. Include: location type, major objects, lighting, and camera perspective. Do not add any style words (no anime/cartoon/illustration).";

  const visionModel = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_GEMINI_VISION_MODEL || "").trim();
      if (v) return v;
    } catch (e) {}
    return "gemini-2.5-flash";
  })();

  const img = parseDataUrl(normalized);
  const json = await withNetworkRetries(() =>
    apiyiGeminiGenerateContent(visionModel, {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, { inline_data: { data: img.base64Data, mime_type: img.mimeType } }],
        },
      ],
    })
  );
  return extractTextFromGeminiJson(json);
}

export async function generateCharacterSheet(visualPrompt: string, referenceImageDataUrl?: string) {
  let isProd = false;
  try {
    isProd = !!(import.meta as any)?.env?.PROD;
  } catch (e) {}

  const imageModel = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_GEMINI_IMAGE_MODEL || "").trim();
      if (v) return v;
    } catch (e) {}
    return "gemini-3.1-flash-image-preview";
  })();

  const imageSize = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_CHARACTER_SHEET_IMAGE_SIZE || "").trim();
      if (v === "2K" || v === "2048x2048") return "2K";
      if (v === "1K" || v === "1024x1024") return "1K";
    } catch (e) {}
    return "2K";
  })();

  const aspectRatio = "16:9";
  const promptText = `A single widescreen (16:9) character sheet image containing exactly 4 grid panels arranged in a 2x2 layout (NO other panels).
Layout must be EXACTLY:
- Top-left: Front view (full body)
- Top-right: Side view (full body)
- Bottom-left: Back view (full body)
- Bottom-right: Head close-up (face details, eyes/ears/nose clearly visible)
CRITICAL REQUIREMENT: The subject must look EXACTLY like the described pet (same breed, same colors, same markings, same physical traits).
CRITICAL REQUIREMENT: Lock fine facial details: eye shape and color, nose color, whisker pads, muzzle shape, and ear shape/position (including folded ears if present). Do not simplify or change these details across panels.
CRITICAL REQUIREMENT: Do NOT include any text, letters, numbers, or labels anywhere in the image.
CRITICAL REQUIREMENT: The style MUST be photorealistic and photographic. Do NOT use anime, cartoon, illustration, or stylized drawing styles.
CRITICAL REQUIREMENT: The subject must be an animal pet (NOT a human).
Subject details for reinforcement: ${visualPrompt}.
Background must be pure solid white (#FFFFFF) with no gradients, no texture, no props, no floor, and no shadows. Maintain 100% character consistency across all 4 panels.`;

  const normalizedRefForModel = referenceImageDataUrl
    ? await downscaleImageDataUrlIfNeeded(referenceImageDataUrl, {
        maxDimension: 1280,
        jpegQuality: 0.9,
        maxBytes: 1_800_000,
      })
    : undefined;

  if (!isProd) {
    const parts: any[] = [{ text: promptText }];
    if (normalizedRefForModel) {
      const ref = parseDataUrl(normalizedRefForModel);
      parts.push({ inline_data: { data: ref.base64Data, mime_type: ref.mimeType } });
    }

    const json = await withNetworkRetries(() =>
      apiyiGeminiGenerateContent(imageModel, {
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      })
    );
    const img = extractImageFromGeminiJson(json);
    if (!img.base64Data) throw new Error("No image data returned from Nano Banana image model.");
    return `data:${img.mimeType};base64,${img.base64Data}`;
  }

  const httpRefUrl = referenceImageDataUrl && /^https?:\/\//i.test(referenceImageDataUrl) ? referenceImageDataUrl : undefined;

  const normalizedRefForUpload = referenceImageDataUrl && !httpRefUrl ? normalizedRefForModel : undefined;

  const referenceImageUrl = httpRefUrl || (normalizedRefForUpload ? await ensureTempPublicImageUrl(normalizedRefForUpload, "pawprint-ref") : undefined);

  const startRes = await withNetworkRetries(() =>
    fetch("/api/nano-banana/generate-character-sheet?async=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        promptText,
        referenceImageUrl,
        imageModel,
        imageSize,
        aspectRatio,
      }),
    })
  );
  const startText = await startRes.text();
  if (!startRes.ok) throw new Error(startText || `Nano Banana proxy failed (${startRes.status})`);
  const startParsed = JSON.parse(startText || "{}");
  const jobId = String(startParsed?.jobId || "");
  if (!jobId) throw new Error("No jobId returned from Nano Banana proxy.");

  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await fetch(`/api/nano-banana/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
    const statusText = await statusRes.text();
    if (!statusRes.ok) continue;
    const statusJson = JSON.parse(statusText || "{}");
    const status = String(statusJson?.status || "");
    if (status === "done") {
      const url = String(statusJson?.url || "");
      if (!url) throw new Error("No image URL returned from Nano Banana job.");
      return url;
    }
    if (status === "error") {
      const msg = String(statusJson?.error || "");
      throw new Error(msg || "Nano Banana job failed.");
    }
  }

  throw new Error("Nano Banana generation is taking too long. Please retry.");
}

export async function generateInteractivePrompt(petDescription: string, sceneDescription: string) {
  const prompt =
    `你是一个分镜与动作导演。根据“宠物信息”和“场景描述”，为图生视频生成一段动作+镜头提示词。\n` +
    `要求：\n` +
    `- 只描述动作、镜头与环境交互，不要写画风合同。\n` +
    `- 不要出现人类，不要出现文字/字幕/水印。\n` +
    `- 镜头稳定，动作自然，避免夸张形变。\n` +
    `- 输出用中文，3-6 句即可。\n` +
    `\n` +
    `宠物信息：${petDescription}\n` +
    `场景描述：${sceneDescription}\n`;

  const textModel = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_GEMINI_TEXT_MODEL || "").trim();
      if (v) return v;
    } catch (e) {}
    return "gemini-2.5-flash";
  })();

  const json = await withNetworkRetries(() =>
    apiyiGeminiGenerateContent(textModel, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    })
  );
  return extractTextFromGeminiJson(json);
}

export function sanitizeVideoPromptText(text: string) {
  if (!text) return "";
  return text
    .replace(/猫咪|猫|cat/gi, "宠物")
    .replace(/人类|人形|human|person/gi, "（禁止）")
    .trim();
}

export function compileVideoUserIntentToPrompt(intent: string) {
  const cleaned = sanitizeVideoPromptText(String(intent || "")).replace(/\s+/g, " ").trim();
  const sentences = cleaned
    .split(/[\n。！？!?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const core = (sentences.slice(0, 2).join("，") || "宠物在镜头前方自然互动").trim();

  return [
    "第一视角手机镜头，机位与视角必须严格保持在场景图所示范围内。",
    "镜头不得转向到场景图之外（不允许突然换角度/跳切/环绕/俯拍/反打等新视角）。",
    `在不改变场景布局与光照的前提下：${core}。`,
    "动作尽量发生在镜头前方小范围内，镜头稳定为主，只允许非常轻微平滑移动或轻微手持感。",
  ].join("\n");
}

const DASHSCOPE_KEY_STORAGE = "pawprint_dashscope_api_key";

export function setDashscopeApiKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    if (!key) return;
    localStorage.setItem(DASHSCOPE_KEY_STORAGE, key);
  } catch (e) {}
}

function getDashscopeApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DASHSCOPE_API_KEY) {
    return import.meta.env.VITE_DASHSCOPE_API_KEY;
  }

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(DASHSCOPE_KEY_STORAGE);
      if (stored) return stored;
    } catch (e) {}
  }
  
  if (typeof process !== 'undefined' && process.env && process.env.VITE_DASHSCOPE_API_KEY) {
    return process.env.VITE_DASHSCOPE_API_KEY;
  }

  return "";
}

function assertDashscopeMediaUrl(url: string, label: string) {
  if (!url) throw new Error(`${label} is missing.`);
  if (url.startsWith("blob:")) {
    throw new Error(`${label} cannot be a blob: URL. Please provide an http(s) URL or a data: URL.`);
  }
  if (!url.startsWith("data:") && !/^https?:\/\//i.test(url)) {
    throw new Error(`${label} must be an http(s) URL or a data: URL.`);
  }
}

function getDashscopeBaseUrl() {
  try {
    if ((import.meta as any).env?.DEV) return "/api/dashscope";
  } catch (e) {}
  return "/api/dashscope";
}

const tempPublicImageCache = new Map<string, string>();

export async function uploadDataUrlToTempPublicUrl(dataUrl: string, filenameBase: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const cached = tempPublicImageCache.get(dataUrl);
  if (cached) return cached;

  if (typeof window === "undefined" || typeof fetch === "undefined" || typeof FormData === "undefined") {
    throw new Error("当前环境不支持临时图片上传。请在浏览器中运行，或手动提供公网 URL。");
  }

  const res = await fetch("/api/upload-dataurl", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl, filenameBase }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`临时图床上传失败：${res.status} ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text || "{}");
  const url = String(parsed?.url || "");
  if (!/^https?:\/\//i.test(url)) throw new Error(`临时图床返回异常：${text.slice(0, 200)}`);

  tempPublicImageCache.set(dataUrl, url);
  return url;
}

export async function ensureTempPublicImageUrl(url: string, filenameBase: string): Promise<string> {
  if (!url) return url;
  if (!url.startsWith("data:")) return url;
  return uploadDataUrlToTempPublicUrl(url, filenameBase);
}

export async function generatePetVideo(
  characterCardPath: string, 
  scenePhotoPath: string, 
  userPromptSuggestion: string,
  referencePhotoPath?: string
) {
  const dashscopeApiKey = getDashscopeApiKey();
  let isProd = false;
  try {
    isProd = !!(import.meta as any)?.env?.PROD;
  } catch (e) {}
  if (!dashscopeApiKey && !isProd) {
    throw new Error("API key is missing. Please provide a valid Aliyun DashScope API key in .env (VITE_DASHSCOPE_API_KEY).");
  }

  assertDashscopeMediaUrl(scenePhotoPath, "scenePhotoPath");
  assertDashscopeMediaUrl(characterCardPath, "characterCardPath");
  if (referencePhotoPath) assertDashscopeMediaUrl(referencePhotoPath, "referencePhotoPath");
  if (!userPromptSuggestion) throw new Error("userPromptSuggestion is missing.");

  const systemPrompt =
    `你是一个严格的写实导演与一致性审查员。请基于参考图片生成 1 段短视频。\n` +
    `\n` +
    `【参考素材顺序（非常重要）】\n` +
    `- 第1张：场景环境（空间布局、主要物体、光照方向与色温、镜头视角）必须严格遵循\n` +
    `- 第2张：宠物角色卡（身份锁定：品种、体型比例、毛色、花纹、脸部细节一致）\n` +
    (referencePhotoPath ? `- 第3张：宠物原始照片（细节加固：毛色、花纹、眼睛颜色）\n` : "") +
    `\n` +
    `【镜头与叙事（关键）】\n` +
    `- 这是手机拍摄的第一视角：镜头在拍摄者眼高附近，轻微手持感，稳定为主。\n` +
    `- 镜头角度必须严格保持在场景图的视角范围内，不允许转向到场景图之外；不允许切换到新的视角（俯拍/仰拍/侧面/反打/环绕）。\n` +
    `- 不要写复杂分镜，不要大幅改造空间；避免“新增不存在的家具/道具/窗景/光源”。\n` +
    `- 优先做“镜头内互动”：宠物靠近镜头、注视镜头、嗅闻镜头前方、在镜头附近小范围活动。\n` +
    `\n` +
    `【硬性一致性（必须满足）】\n` +
    `1) 视频里只出现 1 只宠物主角，外观必须与参考图一致（品种、体型比例、毛色、花纹、脸部细节、眼睛颜色、尾巴形态）。\n` +
    `2) 不得出现人类/人形角色；不得出现文字/字幕/水印/Logo。\n` +
    `3) 宠物必须自然融入场景参考图：尺度关系、遮挡关系、阴影方向、环境光一致。\n` +
    `\n` +
    `【用户动作/意图（保持简单）】\n` +
    `${userPromptSuggestion}\n` +
    `\n` +
    `优先保证：场景不被改乱 + 身份一致性 + 画面稳定清晰。`;

  try {
    const blobToDataUrl = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        try {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Failed to convert blob to data URL."));
          reader.readAsDataURL(blob);
        } catch (e) {
          reject(e);
        }
      });

    const ensureDashscopeInlineImage = async (input: string, filenameBase: string) => {
      if (!input) return input;
      if (input.startsWith("data:")) {
        return downscaleImageDataUrlIfNeeded(input, { maxDimension: 1280, jpegQuality: 0.85, maxBytes: 1_800_000 });
      }
      if (!/^https?:\/\//i.test(input)) return input;
      if (typeof fetch === "undefined" || typeof Blob === "undefined" || typeof FileReader === "undefined") return input;
      const r = await fetch(input);
      if (!r.ok) throw new Error(`Failed to fetch media for DashScope: ${r.status}`);
      const b = await r.blob();
      const dataUrl = await blobToDataUrl(b);
      return downscaleImageDataUrlIfNeeded(dataUrl, { maxDimension: 1280, jpegQuality: 0.85, maxBytes: 1_800_000 });
    };

    const model = (() => {
      try {
        const v = String((import.meta as any)?.env?.VITE_DASHSCOPE_VIDEO_MODEL || "").trim();
        if (v) return v;
      } catch (e) {}
      return "kling-v3-omni-video-generation";
    })();

    const isKlingOmni = /kling/i.test(model);
    if (!isKlingOmni) {
      throw new Error(
        `当前仅支持 Kling Omni 多图参考视频模型。请把 VITE_DASHSCOPE_VIDEO_MODEL 设置为 kling-v3-omni-video-generation（当前：${model}）。`
      );
    }

    const cardInline = await ensureDashscopeInlineImage(characterCardPath, "pawprint-card");
    const refInline = referencePhotoPath ? await ensureDashscopeInlineImage(referencePhotoPath, "pawprint-ref") : undefined;
    const sceneInline = await ensureDashscopeInlineImage(scenePhotoPath, "pawprint-scene");
    const buildMedia = () => {
      const mediaType = "image";
      const media: Array<{ type: string; url: string }> = [];
      media.push({ type: mediaType, url: sceneInline });
      media.push({ type: mediaType, url: cardInline });
      if (refInline) media.push({ type: mediaType, url: refInline });
      return media;
    };

    const buildPayload = (includeAudio: boolean) => {
      const parameters: Record<string, any> = {
        duration: (() => {
          try {
            const v = Number((import.meta as any)?.env?.VITE_DASHSCOPE_VIDEO_DURATION_SECONDS);
            if (Number.isFinite(v) && v > 0) return v;
          } catch (e) {}
          return 6;
        })(),
        resolution: "1080P",
        size: (() => {
          try {
            const v = String((import.meta as any)?.env?.VITE_DASHSCOPE_VIDEO_SIZE || "").trim();
            if (v) return v;
          } catch (e) {}
          return "1920*1080";
        })(),
        watermark: false,
      };

      const wantAudio = (() => {
        try {
          const v = String((import.meta as any)?.env?.VITE_DASHSCOPE_VIDEO_ENABLE_AUDIO || "").trim();
          if (v === "true") return true;
          if (v === "false") return false;
        } catch (e) {}
        return includeAudio;
      })();

      if (wantAudio) {
        throw new Error("Kling Omni 当前配置为无音频模式。如需音频请启用其他支持音频的模型。");
      }
      const mode = (() => {
        try {
          const v = String((import.meta as any)?.env?.VITE_DASHSCOPE_VIDEO_MODE || "").trim().toLowerCase();
          if (v) return v;
        } catch (e) {}
        return "pro";
      })();
      parameters.mode = mode;

      return {
        model,
        input: {
          prompt: systemPrompt,
          media: buildMedia(),
        },
        parameters,
      };
    };

    const baseUrl = getDashscopeBaseUrl();

    const doCreate = async (includeAudio: boolean) => {
      const createRes = await fetch(`${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`, {
        method: "POST",
        headers: {
          "X-DashScope-Async": "enable",
          "Content-Type": "application/json",
          ...(dashscopeApiKey ? { Authorization: `Bearer ${dashscopeApiKey}` } : {}),
        },
        body: JSON.stringify(buildPayload(includeAudio)),
      });
      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create video task: ${errText}`);
      }
      return createRes.json();
    };

    const pollTaskUntilDone = async (taskId: string) => {
      console.log("Vidu Video Task created:", taskId);

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 15000));

        const statusRes = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`, {
        method: "GET",
        headers: {
          ...(dashscopeApiKey ? { Authorization: `Bearer ${dashscopeApiKey}` } : {}),
        }
        });

        if (!statusRes.ok) {
          console.warn("Error polling task status, retrying...", await statusRes.text());
          continue;
        }

        const statusData = await statusRes.json();
        const taskStatus = statusData.output?.task_status;

        console.log(`Polling task ${taskId}: ${taskStatus}`);

        if (taskStatus === "SUCCEEDED") {
          const videoUrl = statusData.output?.video_url;
          if (!videoUrl) throw new Error("Video task succeeded but no video_url returned.");
          return videoUrl as string;
        }
        if (taskStatus === "FAILED" || taskStatus === "CANCELED" || taskStatus === "UNKNOWN") {
          const message = String(statusData.output?.message || "");
          const code = String(statusData.output?.code || "");
          throw new Error(
            `Video generation failed with status: ${taskStatus}. ${code ? `[${code}] ` : ""}${message}`
          );
        }
      }
    };

    const createData: any = await doCreate(false);

    const taskId = createData.output?.task_id;
    if (!taskId) throw new Error("No task_id returned from DashScope API.");
    return await pollTaskUntilDone(taskId);

  } catch (error) {
    console.error("Video Generation Error:", error);
    throw error;
  }
}

export async function chatWithPet(petDescription: string, userMessage: string) {
  const prompt = `
    You are the following pet: ${petDescription}. 
    The user is talking to you. Reply in a short, expressive, and cute way that matches your personality and breed. 
    Keep it to 1-2 sentences. Use emojis.
    Reply in the same language as the user (English or Chinese).
    User said: "${userMessage}"
  `;

  try {
    const textModel = (() => {
      try {
        const v = String((import.meta as any)?.env?.VITE_GEMINI_TEXT_MODEL || "").trim();
        if (v) return v;
      } catch (e) {}
      return "gemini-2.5-flash";
    })();

    const json = await withNetworkRetries(() =>
      apiyiGeminiGenerateContent(textModel, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })
    );
    return extractTextFromGeminiJson(json);
  } catch (error) {
    console.error("Chat Error:", error);
    return "Woof! (I'm a bit shy right now)";
  }
}
