function getOpenAIBaseUrl() {
  return "/api/openai";
}

async function openaiChatCompletions(body: any) {
  const baseUrl = getOpenAIBaseUrl();
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `OpenAI request failed (${res.status})`);
  return JSON.parse(text || "{}");
}

async function openaiImagesGenerations(body: any) {
  const baseUrl = getOpenAIBaseUrl();
  const res = await fetch(`${baseUrl}/v1/images/generations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `OpenAI images request failed (${res.status})`);
  return JSON.parse(text || "{}");
}

async function openaiImagesEdits(form: FormData) {
  const baseUrl = getOpenAIBaseUrl();
  const res = await fetch(`${baseUrl}/v1/images/edits`, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `OpenAI image edits request failed (${res.status})`);
  return JSON.parse(text || "{}");
}

function extractTextFromOpenAIChatJson(json: any): string {
  const c = (json?.choices || [])[0];
  const t = c?.message?.content;
  return typeof t === "string" ? t : "";
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

  const model = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_OPENAI_VISION_MODEL || "").trim();
      if (v) return v;
    } catch (e) {}
    return "gpt-4o-mini";
  })();

  const content: any[] = [{ type: "text", text: prompt }];
  for (const img of normalizedImages) {
    content.push({ type: "image_url", image_url: { url: img } });
  }

  const json = await withNetworkRetries(() =>
    openaiChatCompletions({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    })
  );

  const text = extractTextFromOpenAIChatJson(json);
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

  const model = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_OPENAI_VISION_MODEL || "").trim();
      if (v) return v;
    } catch (e) {}
    return "gpt-4o-mini";
  })();

  const json = await withNetworkRetries(() =>
    openaiChatCompletions({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: normalized } },
          ],
        },
      ],
    })
  );

  return extractTextFromOpenAIChatJson(json);
}

export async function generateCharacterSheet(visualPrompt: string, referenceImageDataUrl?: string) {
  const imageModel = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_OPENAI_IMAGE_MODEL || "").trim();
      if (v) return v;
    } catch (e) {}
    return "gpt-image-2";
  })();

  const imageSize = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_CHARACTER_SHEET_IMAGE_SIZE || "").trim();
      const m = v.match(/^(\d+)x(\d+)$/i);
      if (m) return `${m[1]}x${m[2]}`;
      if (v === "2K") return "2048x2048";
      if (v === "1K") return "1024x1024";
    } catch (e) {}
    return "2048x2048";
  })();

  const quality = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_OPENAI_IMAGE_QUALITY || "").trim();
      if (v) return v;
    } catch (e) {}
    return "medium";
  })();

  const outputFormat = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_OPENAI_IMAGE_FORMAT || "").trim().toLowerCase();
      if (v === "png" || v === "jpeg" || v === "webp") return v;
    } catch (e) {}
    return "png";
  })();

  const promptText = `A single character sheet image containing exactly 9 grid panels arranged in a 3x3 layout. 
CRITICAL REQUIREMENT: The subject must look EXACTLY like the described pet (same breed, same colors, same markings, same physical traits).
CRITICAL REQUIREMENT: Do NOT include any text, letters, numbers, or labels anywhere in the image.
CRITICAL REQUIREMENT: The style MUST be photorealistic and photographic. Do NOT use anime, cartoon, illustration, or stylized drawing styles.
CRITICAL REQUIREMENT: The subject must be an animal pet (NOT a human).
Subject details for reinforcement: ${visualPrompt}. 
Background must be pure solid white (#FFFFFF) with no gradients, no texture, no props, no floor, and no shadows. Maintain 100% character consistency across all 9 panels showing different angles.`;

  const getOutputMime = (fmt: string) => {
    if (fmt === "jpeg") return "image/jpeg";
    if (fmt === "webp") return "image/webp";
    return "image/png";
  };

  if (referenceImageDataUrl) {
    const normalizedRef = await downscaleImageDataUrlIfNeeded(referenceImageDataUrl, {
      maxDimension: 1024,
      jpegQuality: 0.85,
      maxBytes: 1_200_000,
    });
    const ref = parseDataUrl(normalizedRef);
    const bytes = (() => {
      if (typeof atob === "function") {
        const bin = atob(ref.base64Data);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      }
      const B = (globalThis as any).Buffer;
      if (B) return new Uint8Array(B.from(ref.base64Data, "base64"));
      throw new Error("Base64 decode not supported in this environment.");
    })();

    const form = new FormData();
    form.append("model", imageModel);
    form.append("prompt", promptText);
    form.append("size", imageSize);
    form.append("quality", quality);
    form.append("n", "1");
    form.append("output_format", outputFormat);
    form.append("image[]", new Blob([bytes], { type: ref.mimeType }), "reference.jpg");

    const json = await openaiImagesEdits(form);
    const b64 = String(json?.data?.[0]?.b64_json || "");
    if (!b64) throw new Error("No image data returned from gpt-image-2 edits.");
    return `data:${getOutputMime(outputFormat)};base64,${b64}`;
  }

  const json = await openaiImagesGenerations({
    model: imageModel,
    prompt: promptText,
    size: imageSize,
    quality,
    n: 1,
    output_format: outputFormat,
  });
  const b64 = String(json?.data?.[0]?.b64_json || "");
  if (!b64) throw new Error("No image data returned from gpt-image-2 generations.");
  return `data:${getOutputMime(outputFormat)};base64,${b64}`;
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

  const model = (() => {
    try {
      const v = String((import.meta as any)?.env?.VITE_OPENAI_TEXT_MODEL || "").trim();
      if (v) return v;
    } catch (e) {}
    return "gpt-4o-mini";
  })();

  const json = await withNetworkRetries(() =>
    openaiChatCompletions({
      model,
      temperature: 0.6,
      messages: [{ role: "user", content: prompt }],
    })
  );
  return extractTextFromOpenAIChatJson(json);
}

export function sanitizeVideoPromptText(text: string) {
  if (!text) return "";
  return text
    .replace(/猫咪|猫|cat/gi, "宠物")
    .replace(/人类|人形|human|person/gi, "（禁止）")
    .trim();
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
    `你是一个极其严格的电影导演与一致性审查员。请基于参考图片生成一段写实摄影风格的视频。\n` +
    `\n` +
    `【参考素材顺序】\n` +
    `- 第1张：宠物角色卡（多角度一致性、体型比例、身份锁定）\n` +
    (referencePhotoPath ? `- 第2张：宠物原始照片（细节锁定：毛色、花纹、脸部细节、眼睛颜色）\n` : "") +
    `- ${referencePhotoPath ? "第3张" : "第2张"}：场景环境（空间布局、主要物体、光照方向与色温、镜头视角）\n` +
    `\n` +
    `【硬性一致性（必须满足）】\n` +
    `1) 视频里只出现 1 只宠物主角，且其外观必须与宠物参考图一致：品种、体型比例、毛色、花纹分布、脸部特征、耳朵形状、眼睛颜色、尾巴形态都要一致。\n` +
    `2) 不得把宠物变成其他物种；不得出现人类或人形角色；不得出现文字/字幕/水印/Logo。\n` +
    `3) 不得给宠物添加在参考图中不存在的固定装饰（衣服、项圈、配饰等），除非用户明确要求。\n` +
    `4) 宠物必须自然融入场景参考图：地面接触、尺度关系、遮挡关系、阴影方向、反射与环境光一致。\n` +
    `\n` +
    `【画质与镜头】\n` +
    `- 写实、高清、细节清晰，毛发细节自然；避免过曝、糊、抖动、重影、形变。\n` +
    `- 镜头稳定，尽量保持同一机位或轻微平滑运镜，避免突然跳切。\n` +
    `\n` +
    `【用户动作/意图】\n` +
    `${userPromptSuggestion}\n` +
    `\n` +
    `请优先保证身份一致性与画质稳定，其次再追求动作表现。`;

  try {
    const normalizedScene = scenePhotoPath.startsWith("data:")
      ? await downscaleImageDataUrlIfNeeded(scenePhotoPath, { maxDimension: 1280, jpegQuality: 0.85, maxBytes: 1_800_000 })
      : scenePhotoPath;
    const normalizedCard = characterCardPath.startsWith("data:")
      ? await downscaleImageDataUrlIfNeeded(characterCardPath, { maxDimension: 1280, jpegQuality: 0.85, maxBytes: 1_800_000 })
      : characterCardPath;
    const normalizedRefPhoto =
      referencePhotoPath && referencePhotoPath.startsWith("data:")
        ? await downscaleImageDataUrlIfNeeded(referencePhotoPath, { maxDimension: 1280, jpegQuality: 0.85, maxBytes: 1_800_000 })
        : referencePhotoPath;
    
    let cardForVidu = normalizedCard;
    let refForVidu = normalizedRefPhoto;
    let sceneForVidu = normalizedScene;

    let model = (() => {
      try {
        const v = String((import.meta as any)?.env?.VITE_DASHSCOPE_VIDEO_MODEL || "").trim();
        if (v) return v;
      } catch (e) {}
      return "wan2.6-i2v-flash";
    })();

    const isWanI2v = (m: string) => /^wan/i.test(m);

    const requireHttpForVidu = (() => {
      try {
        return String((import.meta as any)?.env?.VITE_VIDU_REQUIRE_HTTP_URL || "") === "true";
      } catch (e) {}
      return false;
    })();

    const shouldUploadToPublic =
      isProd || requireHttpForVidu || model === "happyhorse-1.0-r2v" || isWanI2v(model);

    if (shouldUploadToPublic) {
      if (cardForVidu.startsWith("data:")) {
        cardForVidu = await uploadDataUrlToTempPublicUrl(cardForVidu, "pawprint-card");
      }
      if (refForVidu && refForVidu.startsWith("data:")) {
        refForVidu = await uploadDataUrlToTempPublicUrl(refForVidu, "pawprint-ref");
      }
      if (sceneForVidu.startsWith("data:")) {
        sceneForVidu = await uploadDataUrlToTempPublicUrl(sceneForVidu, "pawprint-scene");
      }
    }

    const buildMedia = (m: string) => {
      const mediaType = m === "happyhorse-1.0-r2v" ? "reference_image" : "image";
      const media: Array<{ type: string; url: string }> = [];
      if (isWanI2v(m)) return media;
      if (m === "happyhorse-1.0-r2v") {
        const primaryRef = refForVidu || cardForVidu;
        media.push({ type: mediaType, url: primaryRef });
        return media;
      }
      media.push({ type: mediaType, url: cardForVidu });
      if (refForVidu) media.push({ type: mediaType, url: refForVidu });
      media.push({ type: mediaType, url: sceneForVidu });
      return media;
    };

    if (model.startsWith("vidu/") && requireHttpForVidu) {
      const all = [cardForVidu, refForVidu, sceneForVidu].filter(Boolean) as string[];
      const nonHttp = all.find((u) => !/^https?:\/\//i.test(u));
      if (nonHttp) {
        throw new Error(
          `Vidu 参考图必须是公网可访问的 http(s) URL。当前传入的是：${nonHttp.slice(0, 32)}...。` +
            `请把角色卡/原图/场景图上传到 OSS/图床并粘贴 URL 后再生成视频。`
        );
      }
    }

    const buildPayload = (includeAudio: boolean) => {
      const parameters: Record<string, any> = {
        duration: 10,
        resolution: "1080P",
        size: "1080*1920",
        watermark: false,
      };

      if (includeAudio) parameters.audio = true;

      if (isWanI2v(model)) {
        const imgUrl = sceneForVidu;
        return {
          model,
          input: {
            prompt: systemPrompt,
            img_url: imgUrl,
          },
          parameters,
        };
      }

      return {
        model,
        input: {
          prompt: systemPrompt,
          media: buildMedia(model),
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

    let createData: any;
    try {
      createData = await doCreate(true);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("Model not exist")) {
        const alt =
          model === "wan2.6-I2V-flash"
            ? "wan2.6-i2v-flash"
            : model === "wan2.6-i2v-flash"
              ? "wan2.6-I2V-flash"
              : "happyhorse-1.0-r2v";
        model = alt;
        try {
          createData = await doCreate(true);
        } catch (e2: any) {
          const msg2 = String(e2?.message || "");
          if (msg2.includes("audio") || msg2.includes("InvalidParameter")) {
            createData = await doCreate(false);
          } else {
            throw e2;
          }
        }
      } else if (msg.includes("audio") || msg.includes("InvalidParameter")) {
        createData = await doCreate(false);
      } else {
        throw e;
      }
    }

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
    const model = (() => {
      try {
        const v = String((import.meta as any)?.env?.VITE_OPENAI_TEXT_MODEL || "").trim();
        if (v) return v;
      } catch (e) {}
      return "gpt-4o-mini";
    })();

    const json = await withNetworkRetries(() =>
      openaiChatCompletions({
        model,
        temperature: 0.8,
        messages: [{ role: "user", content: prompt }],
      })
    );
    return extractTextFromOpenAIChatJson(json);
  } catch (error) {
    console.error("Chat Error:", error);
    return "Woof! (I'm a bit shy right now)";
  }
}
