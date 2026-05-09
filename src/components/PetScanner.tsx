import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, Sparkles, Wand2, Plus, PartyPopper, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  const [petName, setPetName] = useState("");
  const [petGender, setPetGender] = useState<string>("Unknown");
  const [petBirthday, setPetBirthday] = useState<string>("");
  const [status, setStatus] = useState<string>("");
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
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
    },
    maxFiles: 5
  } as any);

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartAnalysis = async () => {
    if (images.length < 1 || !petName) return;

    setIsAnalyzing(true);
    setStatus(t.extracting || t.analyzing);
    setErrorStatus(null);
    
    try {
      let isProd = false;
      try {
        isProd = !!(import.meta as any)?.env?.PROD;
      } catch (e) {}

      let analysis: { breed: string; characteristics: string[]; visualPrompt: string } = {
        breed: "Unknown",
        characteristics: [],
        visualPrompt: "Match the pet in the reference image exactly.",
      };

      const enableAnalysis = (() => {
        try {
          return String((import.meta as any)?.env?.VITE_ENABLE_PET_ANALYSIS || "") === "true";
        } catch (e) {}
        return false;
      })();

      if (enableAnalysis) {
        try {
          setStatus(t.analyzing || "Analyzing appearance...");
          analysis = await analyzePetProfileFromImages(images);
        } catch (e) {
          analysis = {
            breed: "Unknown",
            characteristics: [],
            visualPrompt: "Match the pet in the reference image exactly.",
          };
        }
      }
      
      // Generate Character Sheet Image
      const characterSheetUrl = await generateCharacterSheet(analysis.visualPrompt, images[0]);
      
      setStatus(t.generatingCard || "Finalizing ID Card...");

      const avatarOrRef = images[0];
      const finalAvatarUrl = isProd ? await ensureTempPublicImageUrl(avatarOrRef, "pawprint-avatar") : avatarOrRef;
      const finalRefUrl = isProd ? await ensureTempPublicImageUrl(avatarOrRef, "pawprint-ref") : avatarOrRef;
      const finalCharacterSheetUrl = isProd
        ? await ensureTempPublicImageUrl(characterSheetUrl, "pawprint-card")
        : characterSheetUrl;

      const newPet: PetID = {
        id: Math.random().toString(36).substr(2, 9),
        name: petName,
        breed: analysis?.breed || "Unknown",
        gender: petGender || "Unknown",
        birthday: petBirthday || "",
        characteristics: analysis?.characteristics || [],
        visualPrompt: analysis?.visualPrompt || "Match the pet in the reference image exactly.",
        avatarUrl: finalAvatarUrl,
        referencePhotoUrl: finalRefUrl,
        characterSheetUrl: finalCharacterSheetUrl,
        createdAt: Date.now(),
      };

      setCreatedPet(newPet);
      setIsComplete(true);
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes("API key is missing") || error.message?.includes("API_KEY_NOT_FOUND")) {
        setErrorStatus("API Key is missing. Please configure APIYI_API_KEY in your environment variables.");
      } else if (String(error?.message || "").includes('"code":503') || String(error?.message || "").includes("UNAVAILABLE")) {
        setErrorStatus("The model gateway is temporarily overloaded (503). Please retry in a moment.");
      } else if (error?.message?.includes("Failed to fetch") || error?.name === "TypeError") {
        setErrorStatus("Network error: Failed to fetch. Please retry, switch network, or try smaller images.");
      } else {
        setErrorStatus(typeof error === 'string' ? error : (error.message || "Analysis failed. Please try again."));
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isComplete && createdPet) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center space-y-8 py-12 text-center"
      >
        <div className="relative">
          <motion.div 
            animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="rounded-full bg-[var(--color-brand-sand)] p-8 text-[var(--color-brand-forest)] shadow-bloom"
          >
            <PartyPopper size={80} strokeWidth={1.5} />
          </motion.div>
          <div className="absolute -right-2 -top-2 rounded-full bg-[var(--color-brand-clay)] p-3 text-white">
            <Sparkles size={24} />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight text-[var(--color-brand-forest)]">
            {t.creationSuccess}
          </h2>
          <p className="text-lg text-[var(--color-brand-stone)]/60">
            {t.goInteract.replace('{name}', createdPet.name)}
          </p>
        </div>

        <div className="relative aspect-square w-full max-w-[280px] overflow-hidden rounded-[var(--radius-3xl)] bg-[var(--color-brand-sand)] shadow-bloom ring-8 ring-white">
          <img 
            src={createdPet.characterSheetUrl} 
            alt="Character Sheet" 
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        </div>

        <button
          onClick={() => onComplete(createdPet)}
          className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-3xl)] bg-[var(--color-brand-forest)] py-5 text-lg font-bold text-white shadow-bloom transition-all active:scale-95"
        >
          <span>{t.getStarted}</span>
          <ArrowRight size={24} />
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black tracking-tight text-[var(--color-brand-forest)]">{t.scan}</h2>
        <p className="text-[var(--color-brand-stone)]/60">{t.uploadPhotos}</p>
      </div>

      <div className="space-y-6">
        <div className="rounded-[var(--radius-3xl)] bg-white p-6 shadow-soft ring-1 ring-[var(--color-brand-sand)]">
          <label className={cn(
            "mb-2 block text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
            !petName && images.length > 0 ? "text-[var(--color-brand-clay)] animate-pulse" : "text-[var(--color-brand-stone)]/40"
          )}>
            {t.petName} {!petName && images.length > 0 && " (Required / 必填)"}
          </label>
          <input
            type="text"
            required
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            placeholder={t.petNamePlaceholder}
            className={cn(
              "w-full border-none bg-transparent p-0 text-2xl font-bold placeholder:text-[var(--color-brand-stone)]/20 focus:outline-none focus:ring-0",
              !petName && images.length > 0 ? "text-[var(--color-brand-clay)]" : "text-[var(--color-brand-forest)]"
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-[var(--radius-3xl)] bg-white p-5 shadow-soft ring-1 ring-[var(--color-brand-sand)]">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-brand-stone)]/40">
              {t.gender || "Gender"}
            </label>
            <select
              value={petGender}
              onChange={(e) => setPetGender(e.target.value)}
              className="w-full appearance-none border-none bg-transparent p-0 text-sm font-bold text-[var(--color-brand-forest)] focus:outline-none focus:ring-0"
            >
              <option value="Unknown">{t.genderUnknown || "Unknown / 未知"}</option>
              <option value="Male">{t.genderMale || "Male / 公"}</option>
              <option value="Female">{t.genderFemale || "Female / 母"}</option>
            </select>
          </div>
          <div className="rounded-[var(--radius-3xl)] bg-white p-5 shadow-soft ring-1 ring-[var(--color-brand-sand)]">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-brand-stone)]/40">
              {t.birthDate}
            </label>
            <input
              type="date"
              value={petBirthday}
              onChange={(e) => setPetBirthday(e.target.value)}
              className="w-full border-none bg-transparent p-0 text-sm font-bold text-[var(--color-brand-forest)] focus:outline-none focus:ring-0"
            />
          </div>
        </div>

        <div
          {...getRootProps()}
          className={cn(
            "relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[var(--radius-3xl)] border-2 border-dashed transition-all",
            isDragActive ? "border-[var(--color-brand-forest)] bg-[var(--color-brand-sand)]" : "border-[var(--color-brand-sand)] bg-white hover:border-[var(--color-brand-forest)]/30"
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="rounded-full bg-[var(--color-brand-sand)] p-5 text-[var(--color-brand-forest)]">
              <Upload size={36} strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold text-[var(--color-brand-forest)]">
                {isDragActive ? t.dropPhotos : t.tapToUpload}
              </p>
              <p className="text-xs text-[var(--color-brand-stone)]/40">{t.supportInfo}</p>
            </div>
          </div>
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-5 gap-3">
            {images.map((src, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-2xl ring-1 ring-[var(--color-brand-sand)]">
                <img
                  src={src}
                  alt={`Upload ${i}`}
                  className="h-full w-full object-cover transition-transform group-hover:scale-110"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-1.5 text-red-500 shadow-sm backdrop-blur-sm"
                >
                  <X size={14} strokeWidth={3} />
                </button>
              </div>
            ))}
            {images.length < 5 && (
              <div 
                {...getRootProps()}
                className="flex aspect-square items-center justify-center rounded-2xl bg-[var(--color-brand-sand)] border-2 border-dashed border-[var(--color-brand-stone)]/10 text-[var(--color-brand-stone)]/40 hover:text-[var(--color-brand-forest)]"
              >
                <Plus size={24} />
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleStartAnalysis}
          disabled={images.length < 1 || !petName || isAnalyzing}
          className={cn(
            "group relative w-full overflow-hidden rounded-[var(--radius-3xl)] py-5 font-bold transition-all active:scale-[0.98]",
            images.length < 1 || !petName || isAnalyzing
              ? "bg-[var(--color-brand-sand)] text-[var(--color-brand-stone)]/20 cursor-not-allowed"
              : "bg-[var(--color-brand-forest)] text-white shadow-bloom"
          )}
        >
          <AnimatePresence mode="wait">
            {isAnalyzing ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-center gap-3"
              >
                <Loader2 size={24} className="animate-spin" />
                <span className="text-lg">{status}</span>
              </motion.div>
            ) : (
              <motion.div
                key="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-center gap-3 text-lg"
              >
                {images.length < 1 ? (
                  <span>{t.uploadPhotos}</span>
                ) : errorStatus ? (
                  <span className="text-red-100">{errorStatus}</span>
                ) : !petName ? (
                   <span className="animate-pulse font-black">
                     {t.petName} (Required / 必填)
                   </span>
                ) : (
                  <>
                    <Wand2 size={24} />
                    <span className="font-bold">{t.createDigitalTwin}</span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

      <div className="rounded-[var(--radius-3xl)] bg-[var(--color-brand-sand)] p-6 text-[var(--color-brand-forest)]/80">
        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em]">
          <Sparkles size={16} />
          <span>{t.howItWorks}</span>
        </div>
        <p className="text-sm leading-relaxed opacity-70">
          {t.howItWorksDesc}
        </p>
      </div>
    </div>
  );
}
