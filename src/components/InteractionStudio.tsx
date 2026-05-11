import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, Sparkles, Wand2, Loader2, Play, Save, RefreshCcw,
  Image as ImageIcon, Key, X, Palette, Rocket, Paintbrush,
  Volume2, VolumeX, Download, ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PetID, InteractionVideo } from '../types';
import {
  compileVideoUserIntentToPrompt, describeSceneImage, ensureTempPublicImageUrl,
  generateInteractivePrompt, generatePetVideo, sanitizeVideoPromptText,
  setDashscopeApiKey, generateFluxPortrait,
} from '../services/geminiService';
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
  { id: 'astronaut', icon: <Rocket size={18} />,    label: '宇航员', gradient: 'from-indigo-400 to-purple-500',
    prompt: 'Wearing a highly detailed futuristic NASA astronaut suit, standing on the moon surface with Earth in the background' },
  { id: 'pixar',     icon: <Sparkles size={18} />,  label: '皮克斯', gradient: 'from-amber-400 to-orange-500',
    prompt: '3D animated movie style, Pixar style, high quality 3D render, cute and expressive, soft lighting' },
  { id: 'oil',       icon: <Paintbrush size={18} />,label: '油画',   gradient: 'from-rose-400 to-pink-500',
    prompt: 'Classic oil painting style, visible brush strokes, rich textures, artistic masterpiece' },
  { id: 'cyberpunk', icon: <Palette size={18} />,   label: '赛博',   gradient: 'from-cyan-400 to-fuchsia-500',
    prompt: 'Cyberpunk style, neon lights, futuristic city background, cinematic lighting, glowing details' },
];

export default function InteractionStudio({ pet, onSave, t }: InteractionStudioProps) {
  const showDevTools = !!import.meta.env.DEV;
  const isProd = !!import.meta.env.PROD;
  const [interactionMode, setInteractionMode] = useState<'video' | 'portrait'>('video');
  const [selectedPreset, setSelectedPreset] = useState(MAGIC_PRESETS[0]);
  const [sceneImage, setSceneImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionText, setActionText] = useState<string>('');
  const [autoPrompt, setAutoPrompt] = useState(() => {
    try { return String((import.meta as any)?.env?.VITE_ENABLE_VIDEO_AUTO_PROMPT || '') === 'true'; } catch (e) {}
    return false;
  });
  const [dashscopeKeyDraft, setDashscopeKeyDraft] = useState<string>('');
  const [isMuted, setIsMuted] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [interactionStep, setInteractionStep] = useState<'idle' | 'analyzing' | 'rendering' | 'finalizing'>('idle');
  const [needsKey, setNeedsKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toVideoProxyUrl = useMemo(() => {
    return (url: string, download?: boolean) => {
      if (!url) return url;
      if (url.startsWith('blob:') || url.startsWith('data:')) return url;
      if (url.startsWith('/api/media/video')) {
        if (!download) return url;
        return url.includes('download=1') ? url : `${url}${url.includes('?') ? '&' : '?'}download=1`;
      }
      const base = `/api/media/video?url=${encodeURIComponent(url)}`;
      return download ? `${base}&download=1` : base;
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    try {
      el.setAttribute('playsinline', 'true');
      el.setAttribute('webkit-playsinline', 'true');
      el.setAttribute('x5-playsinline', 'true');
      el.setAttribute('x5-video-player-type', 'h5');
      el.setAttribute('x-webkit-airplay', 'allow');
    } catch (e) {}
  }, [generatedResult]);

  /* No pet */
  if (!pet) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center px-8 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 -m-6 rounded-full bg-[var(--color-brand-forest-soft)] blur-2xl opacity-70" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] bg-white text-[var(--color-brand-forest)] shadow-soft ring-1 ring-[var(--color-brand-sand)]">
            <Sparkles size={36} strokeWidth={1.6} />
          </div>
        </div>
        <h2 className="font-display text-[22px] font-bold text-[var(--color-brand-stone)]">{t.noPetTitle}</h2>
        <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-[var(--color-brand-stone-soft)]">{t.noPetDesc}</p>
      </div>
    );
  }

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSceneImage(reader.result as string);
      setGeneratedResult(null);
      setInteractionStep('idle');
      setNeedsKey(false);
      setErrorMessage(null);
      setActionText('');
      setIsMuted(true);
      setIsConfirming(false);
      setIsSaved(false);
      setShowDrawer(true);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (interactionMode === 'video' && !sceneImage) return;
    if (!isConfirming) { setIsConfirming(true); return; }

    setIsConfirming(false);
    setShowDrawer(false);
    setIsGenerating(true);
    setInteractionStep('analyzing');
    setErrorMessage(null);

    try {
      if (interactionMode === 'portrait') {
        setInteractionStep('rendering');
        const style = actionText.trim() || selectedPreset.prompt;
        const portraitUrl = await generateFluxPortrait(pet.visualPrompt || '', style);
        setGeneratedResult(portraitUrl);
      } else {
        if (showDevTools) {
          try {
            const envKey = import.meta.env.VITE_DASHSCOPE_API_KEY;
            const storedKey = (() => { try { return localStorage.getItem('pawprint_dashscope_api_key'); } catch (e) { return null; } })();
            if (!envKey && !storedKey) {
              setNeedsKey(true);
              setIsGenerating(false);
              return;
            }
          } catch (e) {}
        }

        let prompt = actionText?.trim() || `${pet.name} naturally interacts with the scene.`;

        if (autoPrompt) {
          let sceneDesc = '';
          try { sceneDesc = await describeSceneImage(sceneImage!); } catch (e) {}
          const petDesc =
            `宠物身份必须完全以参考图为准（角色卡与原始照片）。不要改变物种、不要改变毛色/花纹/脸部细节。` +
            `不要出现人类或文字水印。宠物名称：${pet.name}。`;
          const sceneWithAction = actionText?.trim() ? `${sceneDesc}\n用户希望的动作：${actionText.trim()}` : sceneDesc || 'the provided scene';
          try {
            const generated = await generateInteractivePrompt(petDesc, sceneWithAction);
            if (generated) prompt = sanitizeVideoPromptText(generated);
          } catch (e) {}
        }

        prompt = compileVideoUserIntentToPrompt(prompt);
        setInteractionStep('rendering');

        const cardForVideo = pet.characterSheetUrl || '';
        const sceneForVideo = sceneImage || '';
        const refForVideo = pet.referencePhotoUrl || pet.avatarUrl || '';

        const videoUrl = await generatePetVideo(cardForVideo, sceneForVideo, prompt, refForVideo);
        setGeneratedResult(toVideoProxyUrl(videoUrl, false));
        setIsMuted(true);
      }
      setInteractionStep('finalizing');
      setIsSaved(false);
    } catch (error: any) {
      console.error(error);
      if (showDevTools && error?.message?.includes('VITE_DASHSCOPE_API_KEY')) setNeedsKey(true);
      else setErrorMessage(error?.message || 'Failed to generate.');
    } finally {
      setIsGenerating(false);
      setInteractionStep('idle');
    }
  };

  const openKeySelector = async () => {
    const key = dashscopeKeyDraft.trim();
    if (!key) return;
    setDashscopeApiKey(key);
    setNeedsKey(false);
    setErrorMessage(null);
    handleGenerate();
  };

  const saveToMemories = async () => {
    if (!generatedResult || isSaved) return;
    setIsSaved(true);
    const sceneUrl = (interactionMode === 'video' && sceneImage)
      ? (isProd ? await ensureTempPublicImageUrl(sceneImage, 'pawprint-scene') : sceneImage)
      : '';
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

    if (generatedResult.startsWith('blob:') || generatedResult.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = generatedResult;
      a.download = `${pet.name || 'pet'}-${isVideo ? 'interaction.mp4' : 'portrait.jpg'}`;
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }

    if (isVideo) {
      const dl = toVideoProxyUrl(generatedResult, true);
      const a = document.createElement('a');
      a.href = dl; a.target = '_blank'; a.rel = 'noopener noreferrer';
      document.body.appendChild(a); a.click(); a.remove();
    } else {
      const a = document.createElement('a');
      a.href = generatedResult; a.target = '_blank'; a.download = 'portrait.jpg';
      document.body.appendChild(a); a.click(); a.remove();
    }
  };

  const isResultImage = generatedResult ? !!generatedResult.match(/\.(jpg|jpeg|png|webp)/i) : false;

  return (
    <div className="space-y-5">
      {/* Header + Mode toggle */}
      <div className="space-y-4 text-center">
        <div className="space-y-1">
          <h2 className="font-display text-[24px] font-bold tracking-tight text-[var(--color-brand-stone)]">
            {interactionMode === 'video' ? t.interactionStudio : '创意实验室'}
          </h2>
          <p className="text-[13px] text-[var(--color-brand-stone-soft)]">
            {interactionMode === 'video'
              ? t.interactionStudioDesc.replace('{name}', pet.name)
              : `为 ${pet.name} 开启跨次元变身`}
          </p>
        </div>

        <div className="inline-flex rounded-full bg-[var(--color-brand-sand)] p-1">
          <ModeButton
            active={interactionMode === 'video'}
            onClick={() => { setInteractionMode('video'); setGeneratedResult(null); setSceneImage(null); }}
            icon={<Play size={13} fill={interactionMode === 'video' ? 'currentColor' : 'none'} />}
            label="视频"
          />
          <ModeButton
            active={interactionMode === 'portrait'}
            onClick={() => { setInteractionMode('portrait'); setGeneratedResult(null); setSceneImage(null); setShowDrawer(true); }}
            icon={<Wand2 size={13} />}
            label="实验室"
          />
        </div>
      </div>

      {/* Stage */}
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-[28px] bg-[var(--color-brand-stone)] shadow-bloom ring-4 ring-white">
        <AnimatePresence mode="wait">
          {interactionMode === 'video' && !sceneImage ? (
            <EmptyStage
              key="empty-video"
              icon={<Camera size={36} strokeWidth={1.5} />}
              title={t.captureScene}
              desc={t.captureDesc.replace('{name}', pet.name)}
              cta={t.scanEnvironment}
              onClick={() => fileInputRef.current?.click()}
            />
          ) : interactionMode === 'portrait' && !generatedResult ? (
            isGenerating ? (
              <GeneratingStage key="gen-portrait" pet={pet} step={interactionStep} t={t} />
            ) : (
              <EmptyStage
                key="empty-portrait"
                icon={<Wand2 size={36} strokeWidth={1.5} />}
                title="魔法实验室"
                desc={`选择一个模板，看看 ${pet.name} 的异次元分身`}
                cta="开始变身"
                onClick={() => setShowDrawer(true)}
              />
            )
          ) : !generatedResult ? (
            <motion.div
              key="scene"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="relative h-full w-full"
            >
              <img src={sceneImage!} alt="Scene" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">
                {showDevTools && needsKey ? (
                  <KeyForm
                    t={t}
                    keyDraft={dashscopeKeyDraft}
                    setKeyDraft={setDashscopeKeyDraft}
                    onSubmit={openKeySelector}
                  />
                ) : isGenerating ? (
                  <GeneratingInline step={interactionStep} t={t} />
                ) : (
                  <div className="flex w-full flex-col items-center justify-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur-md">
                      <Sparkles size={28} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-[18px] font-semibold">{t.envMappingReady}</h3>
                      <p className="text-[13px] opacity-70">{t.envMappingDesc.replace('{name}', pet.name)}</p>
                    </div>
                    <button
                      onClick={() => setShowDrawer(true)}
                      className="tap mt-2 flex items-center gap-2 rounded-full bg-white px-7 py-3 text-[14px] font-semibold text-[var(--color-brand-forest)] shadow-xl"
                    >
                      {t.generateInteraction}
                      <ArrowRight size={14} />
                    </button>
                    <button
                      onClick={() => setSceneImage(null)}
                      className="text-[11px] font-medium uppercase tracking-wider text-white/50"
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
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="relative h-full w-full"
            >
              {isResultImage ? (
                <img src={generatedResult!} alt="Magic Result" className="h-full w-full object-cover" />
              ) : (
                <video
                  src={generatedResult!}
                  autoPlay loop muted={isMuted} playsInline controls={false}
                  ref={videoRef}
                  className="h-full w-full object-cover"
                />
              )}
              {/* Cinematic overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

              {/* Top bar */}
              <div className="absolute inset-x-0 top-4 flex items-center justify-between px-4">
                <div className="flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-medium tracking-wider text-white backdrop-blur-md">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-brand-coral)]" />
                  {interactionMode === 'video' ? 'AI MOTION' : 'AI MAGIC'}
                </div>
                <div className="flex gap-1.5">
                  {!isResultImage && (
                    <button
                      onClick={() => setIsMuted(v => !v)}
                      className="tap flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md"
                      aria-label={isMuted ? t.unmute : t.mute}
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                  )}
                  <button
                    onClick={() => { setGeneratedResult(null); setIsSaved(false); }}
                    className="tap flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md"
                    aria-label="Restart"
                  >
                    <RefreshCcw size={14} />
                  </button>
                </div>
              </div>

              {/* Bottom panel */}
              <div className="absolute inset-x-0 bottom-0 px-5 pb-5 pt-12 space-y-4">
                <div className="space-y-1">
                  <h4 className="font-display text-[20px] font-bold text-white">
                    {interactionMode === 'video' ? t.interactionComplete : '变身成功'}
                  </h4>
                  <p className="text-[12px] text-white/70">
                    {interactionMode === 'video'
                      ? t.happyHere.replace('{name}', pet.name)
                      : `${pet.name} 已经化身为新角色了`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={saveToMemories}
                    disabled={isSaved}
                    className={cn(
                      'tap flex items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-semibold shadow-xl transition-all',
                      isSaved ? 'bg-[var(--color-success)] text-white' : 'bg-white text-[var(--color-brand-forest)]'
                    )}
                  >
                    <Save size={16} />
                    {isSaved ? 'Saved' : t.saveMemory}
                  </button>
                  <button
                    onClick={downloadMedia}
                    className="tap flex items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-[14px] font-semibold text-white backdrop-blur-md"
                  >
                    {isResultImage ? <ImageIcon size={16} /> : <Download size={16} />}
                    {t.downloadVideo}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleCapture} accept="image/*" className="hidden" />

      {/* Drawer */}
      <AnimatePresence>
        {showDrawer && (interactionMode === 'portrait' || sceneImage) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm pb-safe"
            onClick={() => setShowDrawer(false)}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="w-full max-w-screen-sm rounded-t-[28px] bg-white p-6 shadow-bloom"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-brand-mist)]/60" />

              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-[20px] font-bold text-[var(--color-brand-stone)]">
                    {interactionMode === 'video' ? t.generateInteraction : '魔法变身'}
                  </h3>
                  <p className="text-[12px] text-[var(--color-brand-stone-soft)]">
                    {interactionMode === 'video' ? t.actionLabel : '选择变身风格'}
                  </p>
                </div>
                <button
                  onClick={() => setShowDrawer(false)}
                  className="tap flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-brand-sand)] text-[var(--color-brand-stone-soft)]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5">
                {interactionMode === 'portrait' ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {MAGIC_PRESETS.map(p => {
                      const active = selectedPreset.id === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPreset(p)}
                          className={cn(
                            'tap relative overflow-hidden rounded-2xl p-4 text-left transition-all',
                            active
                              ? 'ring-2 ring-[var(--color-brand-forest)] ring-offset-2'
                              : 'ring-1 ring-[var(--color-brand-sand)]'
                          )}
                        >
                          <div className={cn('absolute inset-0 bg-gradient-to-br opacity-90', p.gradient)} />
                          <div className="relative flex items-center justify-between text-white">
                            <div>
                              <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                                {p.icon}
                              </div>
                              <p className="text-[15px] font-semibold">{p.label}</p>
                            </div>
                            {active && (
                              <div className="rounded-full bg-white/30 p-1.5 backdrop-blur-sm">
                                <Sparkles size={12} />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    value={actionText}
                    onChange={(e) => setActionText(e.target.value)}
                    placeholder={t.actionPlaceholder}
                    rows={4}
                    className="w-full resize-none rounded-2xl bg-[var(--color-brand-sand)] p-4 text-[15px] text-[var(--color-brand-stone)] placeholder:text-[var(--color-brand-stone-soft)]/60 focus:bg-[var(--color-brand-cream)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-forest)]/20 transition-colors"
                  />
                )}

                {interactionMode === 'video' && (
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--color-brand-cream)] px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-[var(--color-brand-stone)]">
                        {autoPrompt ? t.autoPromptOn : t.autoPromptOff}
                      </p>
                      <p className="text-[11px] text-[var(--color-brand-stone-soft)]">AI 自动理解场景</p>
                    </div>
                    <button
                      onClick={() => setAutoPrompt(!autoPrompt)}
                      className={cn(
                        'relative h-6 w-11 rounded-full transition-colors',
                        autoPrompt ? 'bg-[var(--color-brand-forest)]' : 'bg-[var(--color-brand-mist)]'
                      )}
                    >
                      <motion.div
                        animate={{ x: autoPrompt ? 22 : 2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft"
                      />
                    </button>
                  </div>
                )}

                {errorMessage && (
                  <p className="rounded-2xl bg-red-50 px-4 py-3 text-[12px] text-[var(--color-danger)] ring-1 ring-red-100">
                    {errorMessage}
                  </p>
                )}

                <button
                  onClick={handleGenerate}
                  className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-brand-forest)] py-4 text-[16px] font-semibold text-white shadow-bloom"
                >
                  <Sparkles size={18} />
                  {interactionMode === 'video' ? t.confirmStart : '开始变身'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation overlay */}
      <AnimatePresence>
        {isConfirming && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="w-full max-w-sm space-y-6 text-center"
            >
              <div className="space-y-1">
                <h3 className="font-display text-[24px] font-bold text-white">{t.confirmReferences}</h3>
                <p className="text-[13px] text-white/60">AI is ready to direct the scene</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {interactionMode === 'video' ? (
                  <>
                    <RefThumb img={sceneImage!} label={t.sceneReference} />
                    <RefThumb img={pet.characterSheetUrl} label={t.identityReference} />
                  </>
                ) : (
                  <div className="col-span-2 space-y-3">
                    <RefThumb img={pet.characterSheetUrl} label="角色卡" wide />
                    <div className="rounded-2xl bg-white/10 p-4 text-left text-white">
                      <p className="text-[10px] uppercase tracking-wider text-white/60">变身风格</p>
                      <p className="text-[16px] font-semibold">{selectedPreset.label}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsConfirming(false)}
                  className="tap flex-1 rounded-2xl bg-white/10 py-3.5 text-[14px] font-semibold text-white backdrop-blur-md"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleGenerate}
                  className="tap flex-[2] rounded-2xl bg-white py-3.5 text-[14px] font-semibold text-[var(--color-brand-forest)] shadow-2xl"
                >
                  {t.confirmStart}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------- Sub-components -------------------- */

function ModeButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all',
        active ? 'bg-white text-[var(--color-brand-forest)] shadow-soft' : 'text-[var(--color-brand-stone-soft)]'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyStage({
  icon, title, desc, cta, onClick,
}: { icon: React.ReactNode; title: string; desc: string; cta: string; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-gradient-to-b from-[#3A3631] to-[#1F1D1A]"
    >
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-md">
        {icon}
      </div>
      <h3 className="font-display text-[20px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-[240px] text-[13px] leading-relaxed text-white/60">{desc}</p>
      <button
        onClick={onClick}
        className="tap mt-7 flex items-center gap-2 rounded-full bg-white px-7 py-3 text-[14px] font-semibold text-[var(--color-brand-forest)] shadow-xl"
      >
        {cta}
        <ArrowRight size={14} />
      </button>
    </motion.div>
  );
}

function GeneratingStage({
  pet, step, t,
}: { pet: PetID; step: 'idle' | 'analyzing' | 'rendering' | 'finalizing'; t: any }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#3A3631] to-[#1F1D1A] text-white"
    >
      <GeneratingInline step={step} t={t} pet={pet} />
    </motion.div>
  );
}

function GeneratingInline({
  step, t, pet,
}: { step: 'idle' | 'analyzing' | 'rendering' | 'finalizing'; t: any; pet?: PetID }) {
  const labels = {
    analyzing: { title: t.analyzing, sub: 'Understanding the environment…' },
    rendering: { title: t.generatingVideo, sub: 'Breathing life into pixels…' },
    finalizing: { title: t.extracting, sub: 'Almost there…' },
    idle: { title: t.synthesizing, sub: t.synthesizingDesc },
  } as const;
  const label = labels[step] || labels.idle;
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="relative">
        <Loader2 size={56} className="animate-spin text-white" />
        <Sparkles size={20} className="absolute -right-1 -top-1 animate-pulse text-[var(--color-brand-coral)]" />
      </div>
      <div className="space-y-1">
        <p className="text-[15px] font-semibold">{label.title}</p>
        <p className="text-[12px] text-white/60">{label.sub}</p>
      </div>
    </div>
  );
}

function KeyForm({
  t, keyDraft, setKeyDraft, onSubmit,
}: { t: any; keyDraft: string; setKeyDraft: (s: string) => void; onSubmit: () => void }) {
  return (
    <div className="flex w-full flex-col items-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-brand-coral)] text-white shadow-bloom">
        <Key size={26} />
      </div>
      <h3 className="text-[18px] font-semibold">{t.apiKeyRequiredTitle}</h3>
      <p className="mt-1.5 max-w-[260px] text-[12px] opacity-75">{t.dashscopeKeyRequiredDesc}</p>
      <div className="mt-5 w-full space-y-3">
        <input
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          placeholder={t.dashscopeKeyPlaceholder}
          type="password"
          className="w-full rounded-2xl bg-white/10 px-4 py-3 text-[14px] text-white placeholder:text-white/40 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-[var(--color-brand-coral)]"
        />
        <button
          onClick={onSubmit}
          className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-brand-coral)] py-3 text-[14px] font-semibold shadow-xl"
        >
          <Save size={16} />
          {t.saveAndContinue}
        </button>
        <a
          href="https://dashscope.console.aliyun.com/apiKey"
          target="_blank" rel="noopener noreferrer"
          className="block text-[11px] underline opacity-50"
        >
          {t.getApiKeyLink}
        </a>
      </div>
    </div>
  );
}

function RefThumb({ img, label, wide }: { img: string; label: string; wide?: boolean }) {
  return (
    <div className="space-y-2">
      <div className={cn('overflow-hidden rounded-2xl ring-2 ring-white/15', wide ? 'aspect-[16/9]' : 'aspect-[9/16]')}>
        <img src={img} alt={label} className="h-full w-full object-cover" />
      </div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/45">{label}</p>
    </div>
  );
}
