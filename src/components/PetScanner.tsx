import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, Sparkles, Wand2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PetID } from '../types';
import { generateCharacterSheet } from '../services/geminiService';
import { cn } from '../lib/utils';

interface PetScannerProps {
  onComplete: (pet: PetID) => void;
  t: any;
}

export default function PetScanner({ onComplete, t }: PetScannerProps) {
  const [images, setImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [petName, setPetName] = useState("");
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
      const analysis = {
        breed: "Unknown Breed",
        characteristics: [],
        visualPrompt: "Match the pet in the reference image exactly.",
      };
      
      // Generate Character Sheet Image
      const characterSheetUrl = await generateCharacterSheet(analysis.visualPrompt, images[0]);
      
      setStatus(t.generatingCard || "Finalizing ID Card...");
      await new Promise(r => setTimeout(r, 1000));

      const newPet: PetID = {
        id: Math.random().toString(36).substr(2, 9),
        name: petName,
        breed: analysis?.breed || "Unknown Breed",
        gender: "Unknown",
        birthday: new Date().toISOString().split('T')[0],
        characteristics: analysis?.characteristics || ["Cute", "Friendly"],
        avatarUrl: images[0], // Use first uploaded image as avatar
        referencePhotoUrl: images[0],
        characterSheetUrl: characterSheetUrl,
        createdAt: Date.now(),
      };

      onComplete(newPet);
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes("API key is missing") || error.message?.includes("API_KEY_NOT_FOUND")) {
        setErrorStatus("API Key is missing. Please configure VITE_GEMINI_API_KEY in your .env file.");
      } else if (String(error?.message || "").includes('"code":503') || String(error?.message || "").includes("UNAVAILABLE")) {
        setErrorStatus("Gemini is temporarily overloaded (503). Please retry in a moment.");
      } else if (error?.message?.includes("Failed to fetch") || error?.name === "TypeError") {
        setErrorStatus("Network error: Failed to fetch. Please retry, switch network, or try smaller images.");
      } else {
        setErrorStatus(typeof error === 'string' ? error : (error.message || "Analysis failed. Please try again."));
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{t.scan}</h2>
        <p className="text-gray-500">{t.uploadPhotos}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={cn(
            "mb-1.5 block text-xs font-bold uppercase tracking-wider transition-colors",
            !petName && images.length > 0 ? "text-orange-500 animate-pulse font-black" : "text-gray-400"
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
              "w-full rounded-2xl border-none bg-white p-4 text-lg font-medium shadow-sm ring-1 transition-all focus:outline-none focus:ring-2 focus:ring-orange-500",
              !petName && images.length > 0 ? "ring-orange-500" : "ring-gray-100"
            )}
          />
        </div>

        <div
          {...getRootProps()}
          className={cn(
            "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed transition-all",
            isDragActive ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white hover:border-orange-300"
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <div className="rounded-full bg-orange-100 p-4 text-orange-600">
              <Upload size={32} />
            </div>
            <p className="font-semibold">
              {isDragActive ? t.dropPhotos : t.tapToUpload}
            </p>
            <p className="text-xs text-gray-400">{t.supportInfo}</p>
          </div>
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {images.map((src, i) => (
              <div key={i} className="group relative aspect-square">
                <img
                  src={src}
                  alt={`Upload ${i}`}
                  className="h-full w-full rounded-xl object-cover ring-1 ring-gray-100"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-gray-400 shadow-md hover:text-red-500"
                >
                  <X size={12} strokeWidth={3} />
                </button>
              </div>
            ))}
            {images.length < 5 && (
              <div 
                {...getRootProps()}
                className="flex aspect-square items-center justify-center rounded-xl bg-gray-100 border-2 border-dashed border-gray-200 text-gray-400"
              >
                <Plus size={20} />
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleStartAnalysis}
          disabled={images.length < 1 || !petName || isAnalyzing}
          className={cn(
            "group relative w-full overflow-hidden rounded-2xl py-4 font-bold transition-all active:scale-[0.98]",
            images.length < 1 || !petName || isAnalyzing
              ? "bg-gray-200 text-gray-400 cursor-not-allowed opacity-80"
              : "bg-orange-500 text-white shadow-xl shadow-orange-500/25 ring-2 ring-orange-400 ring-offset-2"
          )}
        >
          <AnimatePresence mode="wait">
            {isAnalyzing ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-center gap-2"
              >
                <Loader2 size={20} className="animate-spin text-orange-600" />
                <span className="text-orange-600 font-bold">{status}</span>
              </motion.div>
            ) : (
              <motion.div
                key="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-center gap-2 text-sm uppercase tracking-tight"
              >
                {images.length < 1 ? (
                  <span>{t.uploadPhotos}</span>
                ) : errorStatus ? (
                  <span className="text-red-100">{errorStatus}</span>
                ) : !petName ? (
                   <span className="animate-pulse text-orange-600 font-black">
                     {t.petName} (Required / 必填)
                   </span>
                ) : (
                  <>
                    <Wand2 size={20} />
                    <span className="font-bold">{t.createDigitalTwin}</span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

      <div className="rounded-2xl bg-blue-50 p-4 text-blue-700">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <Sparkles size={16} />
          <span>{t.howItWorks}</span>
        </div>
        <p className="text-xs leading-relaxed opacity-80">
          {t.howItWorksDesc}
        </p>
      </div>
    </div>
  );
}
