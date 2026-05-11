import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, Sparkles, Wand2, Plus, ArrowRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PetID } from '../types';
import { analyzePetProfileFromImages, ensureTempPublicImageUrl, generateCharacterSheet } from '../services/geminiService';
import { cn } from '../lib/utils';

interface PetScannerProps {
  onComplete: (pet: PetID) => void;
  t: any;
}

export default function PetScanner({ onComplete, t }: PetScannerProps) {
  const [images, setImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [createdPet, setCreatedPet] = useState<PetID | null>(null);
  const [petName, setPetName] = useState('');
  const [petGender, setPetGender] = useState<string>('Unknown');
  const [petBirthday, setPetBirthday] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      setErrorStatus(null);
      const reader = new FileReader();
      reader.onload = () => {
        setImages((prev) => [...prev, reader.result as string].slice(0, 5));
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': ['.jpeg', '.jpg'], 'image/png': ['.png'] },
    maxFiles: 5,
  } as any);

  const removeImage = (i: number) => setImages(prev => prev.filter((_, x) => x !== i));

  const canSubmit = images.length >= 1 && petName.trim().length > 0 && !isAnalyzing;

  const handleStartAnalysis = async () => {
    if (!canSubmit) return;
    setIsAnalyzing(true);
    setStatus(t.extracting || t.analyzing);
    setErrorStatus(null);

    try {
      let isProd = false;
      try { isProd = !!(import.meta as any)?.env?.PROD; } catch (e) {}

      let analysis = {
        breed: 'Unknown',
        characteristics: [] as string[],
        visualPrompt: 'Match the pet in the reference image exactly.',
      };

      const enableAnalysis = (() => {
        try { return String((import.meta as any)?.env?.VITE_ENABLE_PET_ANALYSIS || '') === 'true'; } catch (e) {}
        return false;
      })();

      if (enableAnalysis) {
        try {
          setStatus(t.analyzing || 'Analyzing appearance...');
          analysis = await analyzePetProfileFromImages(images);
        } catch (e) {/* keep defaults */}
      }

      const characterSheetUrl = await generateCharacterSheet(analysis.visualPrompt, images[0]);
      setStatus(t.generatingCard || 'Finalizing ID Card...');

      const avatarOrRef = images[0];
      const finalAvatarUrl = isProd ? await ensureTempPublicImageUrl(avatarOrRef, 'pawprint-avatar') : avatarOrRef;
      const finalRefUrl    = isProd ? await ensureTempPublicImageUrl(avatarOrRef, 'pawprint-ref')    : avatarOrRef;
      const finalCharacterSheetUrl = isProd
        ? await ensureTempPublicImageUrl(characterSheetUrl, 'pawprint-card')
        : characterSheetUrl;

      const newPet: PetID = {
        id: Math.random().toString(36).substr(2, 9),
        name: petName.trim(),
        breed: analysis?.breed || 'Unknown',
        gender: petGender || 'Unknown',
        birthday: petBirthday || '',
        characteristics: analysis?.characteristics || [],
        visualPrompt: analysis?.visualPrompt || 'Match the pet in the reference image exactly.',
        avatarUrl: finalAvatarUrl,
        referencePhotoUrl: finalRefUrl,
        characterSheetUrl: finalCharacterSheetUrl,
        createdAt: Date.now(),
      };

      setCreatedPet(newPet);
      setIsComplete(true);
    } catch (error: any) {
      console.error(error);
      const m = String(error?.message || '');
      if (m.includes('API key is missing') || m.includes('API_KEY_NOT_FOUND')) {
        setErrorStatus('API Key 缺失，请检查环境变量 APIYI_API_KEY。');
      } else if (m.includes('"code":503') || m.includes('UNAVAILABLE')) {
        setErrorStatus('模型网关暂时繁忙（503），请稍后重试。');
      } else if (m.includes('Failed to fetch') || error?.name === 'TypeError') {
        setErrorStatus('网络错误，请重试或换个网络。');
      } else {
        setErrorStatus(typeof error === 'string' ? error : (error.message || '分析失败，请重试。'));
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  /* -------------------- Success state -------------------- */
  if (isComplete && createdPet) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
        className="flex flex-col items-center space-y-7 py-6 text-center"
      >
        <div className="relative">
          <div className="absolute inset-0 -m-8 rounded-full bg-[var(--color-brand-coral-soft)] blur-2xl opacity-70" />
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            className="relative aspect-square w-56 overflow-hidden rounded-[36px] bg-[var(--color-brand-cream)] shadow-bloom ring-8 ring-white"
          >
            <img src={createdPet.characterSheetUrl} alt="Character Sheet" className="h-full w-full object-cover" />
            <div className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-soft">
              <Check size={18} className="text-[var(--color-brand-forest)]" strokeWidth={3} />
            </div>
          </motion.div>
        </div>

        <div className="space-y-1.5">
          <h2 className="font-display text-[24px] font-bold tracking-tight text-[var(--color-brand-stone)]">
            {t.creationSuccess}
          </h2>
          <p className="text-[14px] text-[var(--color-brand-stone-soft)]">
            {t.goInteract.replace('{name}', createdPet.name)}
          </p>
        </div>

        <button
          onClick={() => onComplete(createdPet)}
          className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-brand-forest)] py-4 text-[16px] font-semibold text-white shadow-bloom"
        >
          <span>{t.getStarted}</span>
          <ArrowRight size={18} />
        </button>
      </motion.div>
    );
  }

  /* -------------------- Form state -------------------- */
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-1.5">
        <h2 className="font-display text-[26px] font-bold tracking-tight text-[var(--color-brand-stone)]">
          {t.scan}
        </h2>
        <p className="text-[14px] text-[var(--color-brand-stone-soft)]">{t.uploadPhotos}</p>
      </div>

      {/* Single grouped form card */}
      <div className="overflow-hidden rounded-[24px] bg-white shadow-soft ring-1 ring-[var(--color-brand-sand)]">
        {/* Pet name */}
        <div className="px-5 pt-4 pb-3">
          <label className="block text-[11px] font-medium text-[var(--color-brand-stone-soft)]">
            {t.petName}
          </label>
          <input
            type="text"
            required
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            placeholder={t.petNamePlaceholder}
            className="mt-1 w-full border-none bg-transparent p-0 text-[20px] font-semibold tracking-tight text-[var(--color-brand-stone)] placeholder:text-[var(--color-brand-mist)] focus:outline-none focus:ring-0"
          />
        </div>

        <div className="h-px bg-[var(--color-brand-sand)] mx-5" />

        {/* Gender */}
        <div className="px-5 py-3">
          <label className="block text-[11px] font-medium text-[var(--color-brand-stone-soft)]">
            {t.gender || 'Gender'}
          </label>
          <div className="mt-2 inline-flex w-full rounded-xl bg-[var(--color-brand-sand)] p-1">
            {(['Unknown', 'Male', 'Female'] as const).map(g => {
              const label = g === 'Unknown' ? t.genderUnknown : g === 'Male' ? t.genderMale : t.genderFemale;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPetGender(g)}
                  className={cn(
                    'flex-1 rounded-lg py-2 text-[13px] font-medium transition-all',
                    petGender === g
                      ? 'bg-white text-[var(--color-brand-stone)] shadow-soft'
                      : 'text-[var(--color-brand-stone-soft)]'
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-[var(--color-brand-sand)] mx-5" />

        {/* Birthday */}
        <div className="px-5 py-3 pb-4">
          <label className="block text-[11px] font-medium text-[var(--color-brand-stone-soft)]">
            {t.birthDate} <span className="text-[var(--color-brand-mist)]">{t.optional}</span>
          </label>
          <input
            type="date"
            value={petBirthday}
            onChange={(e) => setPetBirthday(e.target.value)}
            className="mt-1 w-full border-none bg-transparent p-0 text-[15px] font-medium text-[var(--color-brand-stone)] focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      {/* Upload zone */}
      {images.length === 0 ? (
        <div
          {...getRootProps()}
          className={cn(
            'tap relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-[24px] border-2 border-dashed transition-all',
            isDragActive
              ? 'border-[var(--color-brand-forest)] bg-[var(--color-brand-forest-soft)]'
              : 'border-[var(--color-brand-mist)]/60 bg-white/60 hover:border-[var(--color-brand-forest)]/40'
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <div className="rounded-2xl bg-[var(--color-brand-forest-soft)] p-4 text-[var(--color-brand-forest)]">
              <Upload size={28} strokeWidth={1.8} />
            </div>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold text-[var(--color-brand-stone)]">
                {isDragActive ? t.dropPhotos : t.tapToUpload}
              </p>
              <p className="text-[12px] text-[var(--color-brand-stone-soft)]">{t.supportInfo}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[24px] bg-white p-4 shadow-soft ring-1 ring-[var(--color-brand-sand)]">
          <div className="grid grid-cols-5 gap-2.5">
            {images.map((src, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-[var(--color-brand-sand)]"
              >
                <img src={src} alt={`Upload ${i}`} className="h-full w-full object-cover" />
                <button
                  onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                  className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-[var(--color-danger)] shadow-soft"
                  aria-label="Remove"
                >
                  <X size={12} strokeWidth={3} />
                </button>
              </motion.div>
            ))}
            {images.length < 5 && (
              <div
                {...getRootProps()}
                className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-brand-mist)]/60 text-[var(--color-brand-stone-soft)] hover:border-[var(--color-brand-forest)]/40 hover:text-[var(--color-brand-forest)]"
              >
                <input {...getInputProps()} />
                <Plus size={20} />
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-[var(--color-brand-stone-soft)]">
            {images.length} / 5
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleStartAnalysis}
        disabled={!canSubmit}
        className={cn(
          'tap relative w-full overflow-hidden rounded-2xl py-4 text-[16px] font-semibold transition-all',
          canSubmit
            ? 'bg-[var(--color-brand-forest)] text-white shadow-bloom'
            : 'bg-[var(--color-brand-sand)] text-[var(--color-brand-stone-soft)]/50'
        )}
      >
        <AnimatePresence mode="wait">
          {isAnalyzing ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center justify-center gap-3"
            >
              <Loader2 size={18} className="animate-spin" />
              <span>{status}</span>
            </motion.div>
          ) : (
            <motion.div
              key="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center justify-center gap-2"
            >
              {!petName.trim() && images.length > 0 ? (
                <span>{t.petName}</span>
              ) : images.length < 1 ? (
                <span>{t.uploadPhotos}</span>
              ) : (
                <>
                  <Wand2 size={18} />
                  <span>{t.createDigitalTwin}</span>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {errorStatus && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-[var(--color-danger)] ring-1 ring-red-100">
          {errorStatus}
        </p>
      )}

    </div>
  );
}
