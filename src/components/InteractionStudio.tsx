import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Sparkles, Wand2, Loader2, Play, Save, RefreshCcw, Image as ImageIcon, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PetID, InteractionVideo } from '../types';
import { compileVideoUserIntentToPrompt, describeSceneImage, ensureTempPublicImageUrl, generateInteractivePrompt, generatePetVideo, sanitizeVideoPromptText, setDashscopeApiKey } from '../services/geminiService';
import { cn } from '../lib/utils';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface InteractionStudioProps {
  pet: PetID | null;
  onSave: (interaction: InteractionVideo) => void;
  t: any;
}

export default function InteractionStudio({ pet, onSave, t }: InteractionStudioProps) {
  const showDevTools = !!import.meta.env.DEV;
  const isProd = !!import.meta.env.PROD;
  const [sceneImage, setSceneImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionText, setActionText] = useState<string>("");
  const [autoPrompt, setAutoPrompt] = useState(() => {
    try {
      return String((import.meta as any)?.env?.VITE_ENABLE_VIDEO_AUTO_PROMPT || "") === "true";
    } catch (e) {}
    return false;
  });
  const [dashscopeKeyDraft, setDashscopeKeyDraft] = useState<string>("");
  const [isMuted, setIsMuted] = useState(true);
  const [interactionStep, setInteractionStep] = useState<'idle' | 'analyzing' | 'rendering' | 'finalizing'>('idle');
  const [needsKey, setNeedsKey] = useState(false);
  const [scenePublicUrl, setScenePublicUrl] = useState<string>("");
  const [characterCardPublicUrl, setCharacterCardPublicUrl] = useState<string>("");
  const [referencePhotoPublicUrl, setReferencePhotoPublicUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toVideoProxyUrl = useMemo(() => {
    return (url: string, download?: boolean) => {
      if (!url) return url;
      if (url.startsWith("blob:") || url.startsWith("data:")) return url;
      if (url.startsWith("/api/media/video")) {
        if (!download) return url;
        return url.includes("download=1") ? url : `${url}${url.includes("?") ? "&" : "?"}download=1`;
      }
      const base = `/api/media/video?url=${encodeURIComponent(url)}`;
      return download ? `${base}&download=1` : base;
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    try {
      el.setAttribute("playsinline", "true");
      el.setAttribute("webkit-playsinline", "true");
      el.setAttribute("x5-playsinline", "true");
      el.setAttribute("x5-video-player-type", "h5");
      el.setAttribute("x-webkit-airplay", "allow");
    } catch (e) {}
  }, [generatedResult]);

  if (!pet) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center">
        <h2 className="text-xl font-bold">{t.noPetTitle}</h2>
        <p className="mt-2 text-gray-500">{t.noPetDesc}</p>
      </div>
    );
  }

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSceneImage(reader.result as string);
        setGeneratedResult(null);
        setInteractionStep('idle');
        setNeedsKey(false);
        setErrorMessage(null);
        setActionText("");
        setAutoPrompt(() => {
          try {
            return String((import.meta as any)?.env?.VITE_ENABLE_VIDEO_AUTO_PROMPT || "") === "true";
          } catch (e) {}
          return false;
        });
        setDashscopeKeyDraft("");
        setIsMuted(true);
        setScenePublicUrl("");
        setCharacterCardPublicUrl("");
        setReferencePhotoPublicUrl("");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!sceneImage) return;

    if (showDevTools) {
      try {
        const envKey = import.meta.env.VITE_DASHSCOPE_API_KEY;
        const storedKey = (() => {
          try {
            return localStorage.getItem("pawprint_dashscope_api_key");
          } catch (e) {
            return null;
          }
        })();

        if (!envKey && !storedKey) {
          setNeedsKey(true);
          return;
        }
      } catch (e) {
        console.warn("API key check failed, proceeding anyway", e);
      }
    }

    setIsGenerating(true);
    setInteractionStep('analyzing');
    setErrorMessage(null);

    try {
      let prompt = actionText?.trim()
        ? actionText.trim()
        : `${pet.name} naturally interacts with the scene.`;

      if (autoPrompt) {
        let sceneDesc = "";
        try {
          sceneDesc = await describeSceneImage(sceneImage);
        } catch (e) {
          sceneDesc = "";
        }

        const petDesc =
          `宠物身份必须完全以参考图为准（角色卡与原始照片）。不要改变物种、不要改变毛色/花纹/脸部细节。` +
          `不要出现人类或文字水印。宠物名称：${pet.name}。`;
        const sceneWithAction = actionText?.trim()
          ? `${sceneDesc}\n用户希望的动作：${actionText.trim()}`
          : sceneDesc || "the provided scene";

        try {
          const generated = await generateInteractivePrompt(petDesc, sceneWithAction);
          if (generated) prompt = sanitizeVideoPromptText(generated);
        } catch (e) {}
      }

      prompt = compileVideoUserIntentToPrompt(prompt);
      
      console.log("Generating with prompt:", prompt);
      setInteractionStep('rendering');
      
      // 2. Real Video Generation with Veo (Ingredients mode)
      const cardForVideo = showDevTools
        ? (characterCardPublicUrl.trim() || (pet.characterSheetUrl || ""))
        : (pet.characterSheetUrl || "");
      const sceneForVideo = showDevTools ? (scenePublicUrl.trim() || (sceneImage || "")) : (sceneImage || "");
      const refForVideo = showDevTools
        ? (referencePhotoPublicUrl.trim() || (pet.referencePhotoUrl || pet.avatarUrl || ""))
        : (pet.referencePhotoUrl || pet.avatarUrl || "");

      const videoUrl = await generatePetVideo(
        cardForVideo,
        sceneForVideo,
        prompt,
        refForVideo
      );
      
      setInteractionStep('finalizing');
      setGeneratedResult(toVideoProxyUrl(videoUrl, false));
      setIsMuted(true);
    } catch (error: any) {
      console.error(error);
      if (showDevTools && error?.message?.includes("VITE_DASHSCOPE_API_KEY")) {
        setNeedsKey(true);
      } else {
        setErrorMessage(error?.message || "Failed to generate video.");
      }
    } finally {
      setIsGenerating(false);
      setInteractionStep('idle');
    }
  };

  const openKeySelector = async () => {
    try {
      const key = dashscopeKeyDraft.trim();
      if (!key) return;
      setDashscopeApiKey(key);
      setNeedsKey(false);
      setErrorMessage(null);
      handleGenerate();
    } catch (e) {
      console.error("Failed to open key selector", e);
    }
  };

  const saveToMemories = async () => {
    if (!generatedResult || !sceneImage) return;
    
    const sceneUrl = isProd ? await ensureTempPublicImageUrl(sceneImage, "pawprint-scene") : sceneImage;
    const newInteraction: InteractionVideo = {
      id: Math.random().toString(36).substr(2, 9),
      petId: pet.id,
      sceneImageUrl: sceneUrl,
      videoUrl: generatedResult,
      createdAt: Date.now(),
    };
    
    onSave(newInteraction);
  };

  const copyVideoLink = async () => {
    if (!generatedResult) return;
    try {
      await navigator.clipboard.writeText(generatedResult);
      alert(t.linkCopied || "Video link copied.");
    } catch (e) {
      prompt(t.copyManually || "Copy this video link:", generatedResult);
    }
  };

  const downloadVideo = () => {
    if (!generatedResult) return;
    if (generatedResult.startsWith("blob:") || generatedResult.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = generatedResult;
      a.download = `${pet.name || "pet"}-interaction.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    const dl = toVideoProxyUrl(generatedResult, true);
    const a = document.createElement("a");
    a.href = dl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{t.interactionStudio}</h2>
        <p className="text-gray-500">{t.interactionStudioDesc.replace('{name}', pet.name)}</p>
      </div>

      <div className="relative aspect-[9/16] overflow-hidden rounded-[2.5rem] bg-gray-900 shadow-2xl">
        <AnimatePresence mode="wait">
          {!sceneImage ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center p-8 text-center text-white"
            >
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md">
                <Camera size={40} />
              </div>
              <h3 className="text-xl font-bold">{t.captureScene}</h3>
              <p className="mt-4 text-sm opacity-60">
                {t.captureDesc.replace('{name}', pet.name)}
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-10 rounded-2xl bg-white px-8 py-4 font-bold text-gray-900 shadow-xl transition-transform active:scale-95"
              >
                {t.scanEnvironment}
              </button>
            </motion.div>
          ) : !generatedResult ? (
            <motion.div
              key="scene"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="group relative h-full w-full"
            >
              <img src={sceneImage} alt="Scene" className="h-full w-full object-cover opacity-60 blur-sm grayscale" />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-white">
                {showDevTools && needsKey ? (
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg">
                      <Key size={32} />
                    </div>
                    <h3 className="text-xl font-bold uppercase tracking-tight">{t.apiKeyRequiredTitle}</h3>
                    <p className="mt-2 text-sm opacity-80 max-w-[250px]">
                      {t.dashscopeKeyRequiredDesc}
                    </p>
                    <a 
                      href="https://dashscope.console.aliyun.com/apiKey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="mt-2 text-[10px] underline opacity-60"
                    >
                      {t.getApiKeyLink}
                    </a>
                    <div className="mt-6 w-full max-w-[320px]">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-white/70">
                        {t.dashscopeKeyLabel}
                      </label>
                      <input
                        value={dashscopeKeyDraft}
                        onChange={(e) => setDashscopeKeyDraft(e.target.value)}
                        placeholder={t.dashscopeKeyPlaceholder}
                        type="password"
                        className="mt-2 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-orange-400"
                      />
                      <p className="mt-2 text-[10px] opacity-60">
                        {t.dashscopeKeyNote}
                      </p>
                    </div>
          <button
            onClick={openKeySelector}
            className={cn(
              "mt-8 flex items-center gap-2 rounded-2xl bg-orange-500 px-8 py-4 font-bold shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100",
              isGenerating && "opacity-50 cursor-not-allowed"
            )}
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 className="animate-spin" /> : <Key size={20} />}
            {isGenerating ? t.checking : t.saveAndContinue}
          </button>
                  </div>
                ) : isGenerating ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <Loader2 size={48} className="animate-spin text-orange-500" />
                      <Sparkles size={20} className="absolute -right-2 -top-2 animate-pulse text-yellow-400" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold uppercase tracking-widest text-orange-500">
                        {interactionStep === 'analyzing' ? t.analyzing : interactionStep === 'rendering' ? t.generatingVideo : t.extracting}
                      </p>
                      <p className="mt-2 text-xs opacity-60">
                        {interactionStep === 'analyzing' ? 'Understanding your room...' : interactionStep === 'rendering' ? 'Directing the action...' : 'Finalizing pixels...'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/30">
                      <Wand2 size={32} />
                    </div>
                    <h3 className="text-xl font-bold uppercase tracking-tight">{t.envMappingReady}</h3>
                    <p className="mt-2 text-center text-sm opacity-80">
                      {t.envMappingDesc.replace('{name}', pet.name)}
                    </p>
                    <button
                      onClick={() => setAutoPrompt((v) => !v)}
                      className={cn(
                        "mt-4 flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest backdrop-blur-md transition-colors",
                        autoPrompt ? "bg-white/20 text-white" : "bg-white/10 text-white/60"
                      )}
                    >
                      {autoPrompt ? t.autoPromptOn : t.autoPromptOff}
                    </button>
                    <div className="mt-6 w-full max-w-[320px]">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-white/70">
                        {t.actionLabel}
                      </label>
                      <textarea
                        value={actionText}
                        onChange={(e) => setActionText(e.target.value)}
                        placeholder={t.actionPlaceholder}
                        rows={3}
                        className="mt-2 w-full resize-none rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-orange-400"
                      />
                      <p className="mt-2 text-[10px] leading-relaxed opacity-60">
                        {t.videoUsesReferences ||
                          "视频生成会自动使用：角色卡 + 原始照片 + 场景图作为参考图（无需导出/粘贴 ID）。"}
                      </p>
                      {showDevTools && (
                      <div className="mt-4 space-y-2">
                        <p className="text-[10px] leading-relaxed opacity-60">
                          {t.publicUrlHint || "提示：Vidu 参考生视频通常要求参考图是公网 http(s) URL。若你遇到参考不生效/报错，可把角色卡、原图、场景图上传到图床/OSS，并在下方粘贴 URL。"}
                        </p>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/70">
                          {t.sceneUrlLabel || "（可选）场景图公网 URL"}
                        </label>
                        <input
                          value={scenePublicUrl}
                          onChange={(e) => setScenePublicUrl(e.target.value)}
                          placeholder={t.sceneUrlPlaceholder || "https://..."}
                          className="mt-1 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-orange-400"
                        />
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/70">
                          {t.cardUrlLabel || "（可选）角色卡公网 URL"}
                        </label>
                        <input
                          value={characterCardPublicUrl}
                          onChange={(e) => setCharacterCardPublicUrl(e.target.value)}
                          placeholder={t.cardUrlPlaceholder || "https://..."}
                          className="mt-1 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-orange-400"
                        />
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/70">
                          {t.refUrlLabel || "（可选）宠物原始照片公网 URL"}
                        </label>
                        <input
                          value={referencePhotoPublicUrl}
                          onChange={(e) => setReferencePhotoPublicUrl(e.target.value)}
                          placeholder={t.refUrlPlaceholder || "https://..."}
                          className="mt-1 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-orange-400"
                        />
                      </div>
                      )}
                    </div>
                    {errorMessage && (
                      <p className="mt-4 max-w-[280px] rounded-2xl bg-red-500/20 px-4 py-3 text-xs leading-relaxed text-red-100">
                        {(t.generationError || "Generation error: ") + errorMessage}
                      </p>
                    )}
                    <button
                      onClick={handleGenerate}
                      className="mt-10 flex items-center gap-2 rounded-2xl bg-orange-500 px-8 py-4 font-bold shadow-xl shadow-orange-500/20 transition-transform active:scale-95"
                    >
                      <Sparkles size={20} />
                      {t.generateInteraction}
                    </button>
                    <button
                      onClick={() => setSceneImage(null)}
                      className="mt-4 text-xs font-bold uppercase tracking-widest opacity-60 hover:opacity-100"
                    >
                      {t.retakePhoto}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative h-full w-full"
            >
              <video 
                src={generatedResult} 
                autoPlay 
                loop 
                muted={isMuted}
                playsInline
                controls
                ref={videoRef}
                className="h-full w-full object-cover"
              />
              {/* Cinematic Vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
              
              <div className="absolute top-8 left-0 right-0 px-6 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-md">
                   <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                   AI MOTION GEN: ACTIVE
                </div>
                <button
                  onClick={() => setIsMuted((v) => !v)}
                  className="rounded-full bg-white/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md hover:bg-white/40"
                >
                  {isMuted ? t.unmute : t.mute}
                </button>
                <button 
                  onClick={() => setGeneratedResult(null)}
                  className="rounded-full bg-white/20 p-2 text-white backdrop-blur-md hover:bg-white/40"
                >
                  <RefreshCcw size={16} />
                </button>
              </div>

              <div className="absolute bottom-10 left-0 right-0 px-6 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-xl font-bold text-white">{t.interactionComplete}</h4>
                  <p className="text-sm text-white/70">{t.happyHere.replace('{name}', pet.name)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={saveToMemories}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-white py-4 font-black text-gray-900 shadow-xl transition-transform active:scale-95"
                  >
                    <Save size={18} />
                    {t.saveMemory}
                  </button>
                  <button
                    onClick={downloadVideo}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-white/20 py-4 font-black text-white backdrop-blur-md transition-transform active:scale-95"
                  >
                    <Play size={18} fill="currentColor" />
                    {t.downloadVideo}
                  </button>
                </div>
                {showDevTools && (
                  <button
                    onClick={copyVideoLink}
                    className="w-full rounded-2xl bg-white/10 py-3 text-xs font-black uppercase tracking-widest text-white/80 backdrop-blur-md transition-transform active:scale-95"
                  >
                    {t.copyVideoLink}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleCapture} 
        accept="image/*" 
        className="hidden" 
      />

      <div className="flex items-start gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="rounded-2xl bg-orange-100 p-3 text-orange-500">
          <Sparkles size={24} />
        </div>
        <div>
          <h4 className="text-sm font-bold">{t.aiTip}</h4>
          <p className="mt-0.5 text-xs text-gray-500">
            {t.aiTipDesc.replace('{name}', pet.name)}
          </p>
        </div>
      </div>
    </div>
  );
}
