import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Sparkles, Wand2, Loader2, Play, Save, RefreshCcw, Image as ImageIcon, Key, X, Palette, Rocket, Paintbrush } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PetID, InteractionVideo } from '../types';
import { compileVideoUserIntentToPrompt, describeSceneImage, ensureTempPublicImageUrl, generateInteractivePrompt, generatePetVideo, sanitizeVideoPromptText, setDashscopeApiKey, generateFluxPortrait } from '../services/geminiService';
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

const MAGIC_PRESETS = [
  { id: 'astronaut', icon: <Rocket size={20} />, label: '宇航员', prompt: 'Wearing a highly detailed futuristic NASA astronaut suit, standing on the moon surface with Earth in the background' },
  { id: 'pixar', icon: <Sparkles size={20} />, label: '皮克斯', prompt: '3D animated movie style, Pixar style, high quality 3D render, cute and expressive, soft lighting' },
  { id: 'oil', icon: <Paintbrush size={20} />, label: '油画', prompt: 'Classic oil painting style, visible brush strokes, rich textures, artistic masterpiece' },
  { id: 'cyberpunk', icon: <Palette size={20} />, label: '赛博', prompt: 'Cyberpunk style, neon lights, futuristic city background, cinematic lighting, glowing details' },
];

export default function InteractionStudio({ pet, onSave, t }: InteractionStudioProps) {
  const showDevTools = !!import.meta.env.DEV;
  const isProd = !!import.meta.env.PROD;
  const [interactionMode, setInteractionMode] = useState<'video' | 'portrait'>('video');
  const [selectedPreset, setSelectedPreset] = useState(MAGIC_PRESETS[0]);
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
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
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
      <div className="flex flex-col items-center justify-center p-10 text-center space-y-4">
        <div className="rounded-full bg-[var(--color-brand-sand)] p-6 text-[var(--color-brand-forest)]">
          <Sparkles size={48} />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[var(--color-brand-forest)]">{t.noPetTitle}</h2>
          <p className="text-sm text-[var(--color-brand-stone)]/60">{t.noPetDesc}</p>
        </div>
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
        setIsConfirming(false);
        setIsSaved(false);
        setShowDrawer(true);
        setScenePublicUrl("");
        setCharacterCardPublicUrl("");
        setReferencePhotoPublicUrl("");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (interactionMode === 'video' && !sceneImage) return;

    // Show confirmation modal first
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }

    setIsConfirming(false);
    setShowDrawer(false);

    setIsGenerating(true);
    setInteractionStep('analyzing');
    setErrorMessage(null);

    try {
      if (interactionMode === 'portrait') {
        setInteractionStep('rendering');
        const style = actionText.trim() || selectedPreset.prompt;
        const portraitUrl = await generateFluxPortrait(pet.visualPrompt || "", style);
        setGeneratedResult(portraitUrl);
      } else {
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
              setIsGenerating(false);
              return;
            }
          } catch (e) {
            console.warn("API key check failed, proceeding anyway", e);
          }
        }

        let prompt = actionText?.trim()
          ? actionText.trim()
          : `${pet.name} naturally interacts with the scene.`;

        if (autoPrompt) {
          let sceneDesc = "";
          try {
            sceneDesc = await describeSceneImage(sceneImage!);
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
        
        setGeneratedResult(toVideoProxyUrl(videoUrl, false));
        setIsMuted(true);
      }
      
      setInteractionStep('finalizing');
      setIsSaved(false);
    } catch (error: any) {
      console.error(error);
      if (showDevTools && error?.message?.includes("VITE_DASHSCOPE_API_KEY")) {
        setNeedsKey(true);
      } else {
        setErrorMessage(error?.message || "Failed to generate.");
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
    if (!generatedResult || isSaved) return;
    
    setIsSaved(true);
    // For portraits, sceneImage is null or not relevant
    const sceneUrl = (interactionMode === 'video' && sceneImage) 
      ? (isProd ? await ensureTempPublicImageUrl(sceneImage, "pawprint-scene") : sceneImage)
      : "";

    const newInteraction: InteractionVideo = {
      id: Math.random().toString(36).substr(2, 9),
      petId: pet.id,
      sceneImageUrl: sceneUrl,
      videoUrl: generatedResult,
      createdAt: Date.now(),
    };
    
    onSave(newInteraction);
  };

  const downloadMedia = () => {
    if (!generatedResult) return;
    const isVideo = !generatedResult.match(/\.(jpg|jpeg|png|webp)/i);
    
    if (generatedResult.startsWith("blob:") || generatedResult.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = generatedResult;
      a.download = `${pet.name || "pet"}-${isVideo ? "interaction.mp4" : "portrait.jpg"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    if (isVideo) {
      const dl = toVideoProxyUrl(generatedResult, true);
      const a = document.createElement("a");
      a.href = dl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      const a = document.createElement("a");
      a.href = generatedResult;
      a.target = "_blank";
      a.download = "portrait.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-[var(--color-brand-forest)]">
            {interactionMode === 'video' ? t.interactionStudio : '创意实验室'}
          </h2>
          <p className="text-sm text-[var(--color-brand-stone)]/60">
            {interactionMode === 'video' ? t.interactionStudioDesc.replace('{name}', pet.name) : `为 ${pet.name} 开启跨次元变身魔法`}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-full bg-[var(--color-brand-sand)] p-1 shadow-inner">
            <button
              onClick={() => {
                setInteractionMode('video');
                setGeneratedResult(null);
                setSceneImage(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-full px-6 py-2 text-xs font-black transition-all",
                interactionMode === 'video' ? "bg-white text-[var(--color-brand-forest)] shadow-sm" : "text-[var(--color-brand-stone)]/40"
              )}
            >
              <Play size={14} fill={interactionMode === 'video' ? "currentColor" : "none"} />
              视频互动
            </button>
            <button
              onClick={() => {
                setInteractionMode('portrait');
                setGeneratedResult(null);
                setSceneImage(null);
                setShowDrawer(true);
              }}
              className={cn(
                "flex items-center gap-2 rounded-full px-6 py-2 text-xs font-black transition-all",
                interactionMode === 'portrait' ? "bg-white text-[var(--color-brand-forest)] shadow-sm" : "text-[var(--color-brand-stone)]/40"
              )}
            >
              <Wand2 size={14} />
              实验室
            </button>
          </div>
        </div>
      </div>

      <div className="relative mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-[var(--radius-3xl)] bg-[var(--color-brand-stone)]/90 shadow-bloom ring-8 ring-white">
        <AnimatePresence mode="wait">
          {interactionMode === 'video' && !sceneImage ? (
            <motion.div
              key="empty-video"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center p-8 text-center text-white"
            >
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md">
                <Camera size={40} strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">{t.captureScene}</h3>
                <p className="text-sm opacity-60">
                  {t.captureDesc.replace('{name}', pet.name)}
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-10 rounded-full bg-white px-10 py-4 font-black text-[var(--color-brand-forest)] shadow-xl transition-transform active:scale-95"
              >
                {t.scanEnvironment}
              </button>
            </motion.div>
          ) : interactionMode === 'portrait' && !generatedResult ? (
            <motion.div
              key="empty-portrait"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center p-8 text-center text-white"
            >
              {isGenerating ? (
                <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                    <Loader2 size={64} className="animate-spin text-white" />
                    <Sparkles size={24} className="absolute -right-2 -top-2 animate-pulse text-[var(--color-brand-clay)]" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-xl font-black uppercase tracking-[0.2em]">实验室工作中</p>
                    <p className="text-xs opacity-60">正在为 {pet.name} 施展次元魔法...</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md">
                    <Wand2 size={40} strokeWidth={1.5} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">魔法实验室</h3>
                    <p className="text-sm opacity-60">
                      选择一个模板，看看 {pet.name} 的异次元分身
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDrawer(true)}
                    className="mt-10 rounded-full bg-white px-10 py-4 font-black text-[var(--color-brand-forest)] shadow-xl transition-transform active:scale-95"
                  >
                    开始变身
                  </button>
                </>
              )}
            </motion.div>
          ) : !generatedResult ? (
            <motion.div
              key="scene"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="group relative h-full w-full"
            >
              <img src={sceneImage!} alt="Scene" className="h-full w-full object-cover opacity-60 blur-md" />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-white">
                {showDevTools && needsKey ? (
                  <div className="flex flex-col items-center justify-center text-center w-full">
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--color-brand-clay)] text-white shadow-bloom">
                      <Key size={32} />
                    </div>
                    <h3 className="text-xl font-bold uppercase tracking-tight">{t.apiKeyRequiredTitle}</h3>
                    <p className="mt-2 text-sm opacity-80 max-w-[250px]">
                      {t.dashscopeKeyRequiredDesc}
                    </p>
                    <div className="mt-8 w-full space-y-4">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/70">
                          {t.dashscopeKeyLabel}
                        </label>
                        <input
                          value={dashscopeKeyDraft}
                          onChange={(e) => setDashscopeKeyDraft(e.target.value)}
                          placeholder={t.dashscopeKeyPlaceholder}
                          type="password"
                          className="w-full rounded-2xl bg-white/10 px-4 py-4 text-sm text-white placeholder:text-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-[var(--color-brand-clay)]"
                        />
                      </div>
                      <button
                        onClick={openKeySelector}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-brand-clay)] py-4 font-bold shadow-xl transition-all active:scale-95"
                      >
                        <Save size={20} />
                        {t.saveAndContinue}
                      </button>
                      <a 
                        href="https://dashscope.console.aliyun.com/apiKey" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block text-[10px] underline opacity-40"
                      >
                        {t.getApiKeyLink}
                      </a>
                    </div>
                  </div>
                ) : isGenerating ? (
                  <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                      <Loader2 size={64} className="animate-spin text-white" />
                      <Sparkles size={24} className="absolute -right-2 -top-2 animate-pulse text-[var(--color-brand-clay)]" />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-xl font-black uppercase tracking-[0.2em]">
                        {interactionStep === 'analyzing' ? t.analyzing : interactionStep === 'rendering' ? t.generatingVideo : t.extracting}
                      </p>
                      <p className="text-xs opacity-60">
                        {interactionStep === 'analyzing' ? 'Understanding the environment...' : interactionStep === 'rendering' ? 'Breathing life into pixels...' : 'Almost there...'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full space-y-6">
                    <div className="rounded-full bg-white/10 p-6 text-white backdrop-blur-md">
                      <Sparkles size={48} />
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-xl font-bold">{t.envMappingReady}</h3>
                      <p className="text-sm opacity-60">{t.envMappingDesc.replace('{name}', pet.name)}</p>
                    </div>
                    <button
                      onClick={() => setShowDrawer(true)}
                      className="rounded-full bg-white px-10 py-4 font-black text-[var(--color-brand-forest)] shadow-xl transition-transform active:scale-95"
                    >
                      {t.generateInteraction}
                    </button>
                    <button
                      onClick={() => setSceneImage(null)}
                      className="text-xs font-black uppercase tracking-widest opacity-40 hover:opacity-100"
                    >
                      {t.retakePhoto}
                    </button>
                  </div>
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
              {generatedResult.match(/\.(jpg|jpeg|png|webp)/i) ? (
                <img 
                  src={generatedResult} 
                  alt="Magic Result" 
                  className="h-full w-full object-cover"
                />
              ) : (
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
              )}
              {/* Cinematic Vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
              
              <div className="absolute top-6 left-0 right-0 px-6 flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-[10px] font-black tracking-widest text-white backdrop-blur-md">
                   <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                   {interactionMode === 'video' ? 'AI MOTION GEN' : 'MAGIC FLUX GEN'}
                </div>
                <div className="flex gap-2">
                  {!generatedResult.match(/\.(jpg|jpeg|png|webp)/i) && (
                    <button
                      onClick={() => setIsMuted((v) => !v)}
                      className="rounded-full bg-white/20 p-2 text-white backdrop-blur-md"
                    >
                      {isMuted ? <Loader2 size={16} /> : <Play size={16} fill="currentColor" />}
                    </button>
                  )}
                  <button 
                    onClick={() => setGeneratedResult(null)}
                    className="rounded-full bg-white/20 p-2 text-white backdrop-blur-md"
                  >
                    <RefreshCcw size={16} />
                  </button>
                </div>
              </div>

              <div className="absolute bottom-10 left-0 right-0 px-8 space-y-6">
                <div className="space-y-1">
                  <h4 className="text-2xl font-black text-white">{interactionMode === 'video' ? t.interactionComplete : '变身成功'}</h4>
                  <p className="text-sm text-white/60">
                    {interactionMode === 'video' ? t.happyHere.replace('{name}', pet.name) : `${pet.name} 已经化身为新角色了`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={saveToMemories}
                    disabled={isSaved}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-2xl py-4 font-black shadow-xl transition-all active:scale-95",
                      isSaved ? "bg-green-500 text-white" : "bg-white text-[var(--color-brand-forest)]"
                    )}
                  >
                    <Save size={20} />
                    {isSaved ? "Saved" : t.saveMemory}
                  </button>
                  <button
                    onClick={downloadMedia}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-white/20 py-4 font-black text-white backdrop-blur-md transition-all active:scale-95"
                  >
                    {generatedResult.match(/\.(jpg|jpeg|png|webp)/i) ? <ImageIcon size={20} /> : <Play size={20} fill="currentColor" />}
                    {t.downloadVideo}
                  </button>
                </div>
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

      {/* Action Drawer */}
      <AnimatePresence>
        {showDrawer && (interactionMode === 'portrait' || sceneImage) && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="w-full max-w-lg rounded-t-[var(--radius-3xl)] bg-white p-8 shadow-2xl"
            >
              <div className="mb-8 flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-[var(--color-brand-forest)]">
                    {interactionMode === 'video' ? t.generateInteraction : '魔法变身'}
                  </h3>
                  <p className="text-xs text-[var(--color-brand-stone)]/40 uppercase tracking-widest">
                    {interactionMode === 'video' ? t.actionLabel : '选择变身模板'}
                  </p>
                </div>
                <button 
                  onClick={() => setShowDrawer(false)}
                  className="rounded-full bg-[var(--color-brand-sand)] p-2 text-[var(--color-brand-stone)]/40"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                {interactionMode === 'portrait' ? (
                  <div className="grid grid-cols-2 gap-3">
                    {MAGIC_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPreset(p)}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl p-4 transition-all border-2",
                          selectedPreset.id === p.id 
                            ? "bg-[var(--color-brand-forest)] text-white border-[var(--color-brand-forest)]" 
                            : "bg-[var(--color-brand-sand)] text-[var(--color-brand-forest)] border-transparent"
                        )}
                      >
                        {p.icon}
                        <span className="font-bold">{p.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={actionText}
                    onChange={(e) => setActionText(e.target.value)}
                    placeholder={t.actionPlaceholder}
                    rows={4}
                    className="w-full resize-none rounded-[var(--radius-3xl)] bg-[var(--color-brand-sand)] p-6 text-lg font-bold text-[var(--color-brand-forest)] placeholder:text-[var(--color-brand-forest)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-forest)]/10"
                  />
                )}

                {interactionMode === 'video' && (
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--color-brand-sand)] p-4">
                    <span className="text-xs font-black uppercase tracking-widest text-[var(--color-brand-forest)]/60">
                      {t.autoPromptOn}
                    </span>
                    <button
                      onClick={() => setAutoPrompt(!autoPrompt)}
                      className={cn(
                        "h-6 w-12 rounded-full transition-colors relative",
                        autoPrompt ? "bg-[var(--color-brand-forest)]" : "bg-[var(--color-brand-stone)]/20"
                      )}
                    >
                      <motion.div 
                        animate={{ x: autoPrompt ? 24 : 4 }}
                        className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm"
                      />
                    </button>
                  </div>
                )}

                {errorMessage && (
                  <p className="rounded-2xl bg-red-50 p-4 text-xs font-bold text-red-500 ring-1 ring-red-100">
                    {errorMessage}
                  </p>
                )}

                <button
                  onClick={handleGenerate}
                  className="w-full flex items-center justify-center gap-3 rounded-[var(--radius-3xl)] bg-[var(--color-brand-forest)] py-5 text-xl font-black text-white shadow-bloom transition-all active:scale-95"
                >
                  <Sparkles size={24} />
                  <span>{interactionMode === 'video' ? t.confirmStart : '开始变身'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Overlay (Visual) */}
      <AnimatePresence>
        {isConfirming && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm space-y-8 text-center"
            >
              <div className="space-y-2">
                <h3 className="text-3xl font-black text-white">{t.confirmReferences}</h3>
                <p className="text-sm text-white/60">AI is ready to direct the scene</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {interactionMode === 'video' ? (
                  <>
                    <div className="space-y-2">
                      <div className="aspect-[9/16] overflow-hidden rounded-2xl ring-4 ring-white/10">
                        <img src={sceneImage!} alt="Scene" className="h-full w-full object-cover" />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{t.sceneReference}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="aspect-[9/16] overflow-hidden rounded-2xl ring-4 ring-white/10">
                        <img src={pet.characterSheetUrl} alt="Pet" className="h-full w-full object-cover" />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{t.identityReference}</p>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 space-y-2">
                    <div className="aspect-[16/9] overflow-hidden rounded-2xl ring-4 ring-white/10">
                      <img src={pet.characterSheetUrl} alt="Pet" className="h-full w-full object-cover" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">使用宠物角色卡作为变身基准</p>
                    <div className="mt-4 rounded-2xl bg-white/10 p-4 text-left">
                      <p className="text-xs text-white/60 uppercase tracking-widest mb-1">变身风格</p>
                      <p className="text-lg font-bold text-white">{selectedPreset.label}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setIsConfirming(false)}
                  className="flex-1 rounded-2xl bg-white/10 py-4 font-black text-white backdrop-blur-md"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleGenerate}
                  className="flex-[2] rounded-2xl bg-white py-4 font-black text-[var(--color-brand-forest)] shadow-2xl"
                >
                  {t.confirmStart}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
