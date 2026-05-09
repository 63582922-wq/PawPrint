import React, { useState } from 'react';
import { PetID } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Download, RotateCcw, ShieldCheck, Fingerprint, Send, Loader2, Heart, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { chatWithPet } from '../services/geminiService';

interface PetIDCardProps {
  pet: PetID;
  onReset: () => void;
  onUpdate: (pet: PetID) => void;
  t: any;
}

export default function PetIDCard({ pet, onReset, onUpdate, t }: PetIDCardProps) {
  const showDevTools = !!import.meta.env.DEV;
  const [chatMessage, setChatMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [lastPetReply, setLastPetReply] = useState<string | null>(null);
  const [characterSheetSize, setCharacterSheetSize] = useState<{ w: number; h: number } | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const getDataUrlMime = (dataUrl: string) => {
    const m = dataUrl.match(/^data:([^;]+);base64,/i);
    return m?.[1] || "";
  };

  const convertDataUrlToPng = async (dataUrl: string) => {
    if (getDataUrlMime(dataUrl).toLowerCase() === "image/png") return dataUrl;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Failed to load image for PNG conversion."));
      i.src = dataUrl;
    });
    const w = img.naturalWidth || (img as any).width || 0;
    const h = img.naturalHeight || (img as any).height || 0;
    const canvas = document.createElement("canvas");
    canvas.width = w || 1;
    canvas.height = h || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };

  const downloadToFile = (url: string | undefined, filename: string) => {
    if (!url) return;
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSend = async () => {
    if (!chatMessage.trim() || isTyping) return;
    
    const userMsg = chatMessage;
    setChatMessage("");
    setIsTyping(true);

    try {
      const description = `${pet.breed}, ${pet.characteristics.join(", ")}`;
      const reply = await chatWithPet(description, userMsg);
      setLastPetReply(reply);
    } catch (error: any) {
      console.error(error);
      const msg = String(error?.message || "");
      if (msg.includes("missing_apiyi_api_key")) {
        setLastPetReply("⚠️ 服务端未配置 APIYI_API_KEY，暂时无法对话。");
      } else {
        setLastPetReply("⚠️ Sorry, I'm having trouble understanding right now.");
      }
    } finally {
      setIsTyping(false);
    }
  };
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${pet.name}'s Profile`,
          text: `Check out ${pet.name}, my AI Pet!`,
          url: window.location.href,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
      } catch (e) {
        alert(window.location.href);
      }
    }
  };

  const handleDownloadCharacterSheet = async () => {
    if (!pet.characterSheetUrl) return;
    if (/^https?:\/\//i.test(pet.characterSheetUrl)) {
      downloadToFile(pet.characterSheetUrl, `${pet.name || "pet"}-character-sheet.png`);
      return;
    }
    const png = await convertDataUrlToPng(pet.characterSheetUrl);
    downloadToFile(png, `${pet.name || "pet"}-character-sheet.png`);
  };

  const handleDownloadOriginalPhoto = () => {
    downloadToFile(pet.avatarUrl, `${pet.name || "pet"}-original.jpg`);
  };

  const handleRegenerateCharacterSheet = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    try {
      const { generateCharacterSheet } = await import("../services/geminiService");
      const ref = pet.referencePhotoUrl || pet.avatarUrl || "";
      const prompt = (pet as any)?.visualPrompt || `Match the pet in the reference image exactly.`;
      const newUrl = await generateCharacterSheet(String(prompt || ""), String(ref || ""));
      onUpdate({ ...pet, characterSheetUrl: newUrl });
    } catch (e) {
      console.error("Regenerate failed", e);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Actual ID Card Design */}
      <div className="relative overflow-hidden rounded-[var(--radius-3xl)] bg-[var(--color-brand-forest)] p-8 text-white shadow-bloom">
        <div className="absolute -right-8 -top-8 opacity-10">
          <Heart size={160} fill="currentColor" />
        </div>
        
        <div className="relative flex justify-between gap-6">
          <div className="flex-1 space-y-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 opacity-60">
                <ShieldCheck size={14} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t.identityCard}</span>
              </div>
              <h2 className="text-4xl font-black italic tracking-tighter uppercase">{pet.name}</h2>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <InfoItem label={t.breed} value={pet.breed} />
              <InfoItem label={t.idNumber} value={pet.id.toUpperCase()} />
              <InfoItem
                label={t.gender || "Gender"}
                value={
                  pet.gender === "Male"
                    ? (t.genderMale || "Male")
                    : pet.gender === "Female"
                      ? (t.genderFemale || "Female")
                      : "—"
                }
              />
              <InfoItem label={t.birthDate} value={pet.birthday || "—"} />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {pet.characteristics.slice(0, 3).map((tag, i) => (
                <span key={i} className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-md ring-1 ring-white/10">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="relative shrink-0">
            <div className="h-32 w-32 overflow-hidden rounded-2xl border-4 border-white/20 bg-white/5 backdrop-blur-md shadow-2xl">
              <img 
                src={pet.avatarUrl || pet.characterSheetUrl} 
                alt={pet.name} 
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-3 -right-3 rounded-2xl bg-[var(--color-brand-clay)] p-2 text-white shadow-bloom">
              <Fingerprint size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* Immersive Interaction Section */}
      <div className="rounded-[var(--radius-3xl)] bg-[var(--color-brand-sand)] p-6 space-y-6 shadow-soft ring-1 ring-[var(--color-brand-stone)]/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-3">
              <div className="h-10 w-10 rounded-full border-2 border-white overflow-hidden bg-white shadow-sm">
                <img src={pet.avatarUrl || pet.characterSheetUrl} alt="Pet" className="h-full w-full object-cover" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[var(--color-brand-forest)] text-white text-[10px] font-black shadow-sm">
                AI
              </div>
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-black uppercase tracking-widest text-[var(--color-brand-forest)]">{t.telepathyMode}</h3>
              <p className="text-[10px] text-[var(--color-brand-stone)]/40 font-bold uppercase tracking-wider">{t.connectedSoul.replace('{name}', pet.name)}</p>
            </div>
          </div>
        </div>
        
        <div className="rounded-2xl bg-white p-5 shadow-soft italic text-sm text-[var(--color-brand-stone)] leading-relaxed min-h-[80px] flex items-center ring-1 ring-[var(--color-brand-stone)]/5">
          <AnimatePresence mode="wait">
            {isTyping ? (
              <motion.div 
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex gap-1.5"
              >
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-brand-forest)]/20" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-brand-forest)]/20 [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-brand-forest)]/20 [animation-delay:0.4s]" />
              </motion.div>
            ) : (
              <motion.p
                key="reply"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
              >
                {lastPetReply || t.diarySample.replace('{name}', pet.name)}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="flex gap-3">
           <input 
             value={chatMessage}
             onChange={(e) => setChatMessage(e.target.value)}
             onKeyDown={(e) => e.key === 'Enter' && handleSend()}
             placeholder={t.talkToPet.replace('{name}', pet.name)}
             className="flex-1 rounded-2xl border-none bg-white p-4 text-sm font-medium shadow-soft ring-1 ring-[var(--color-brand-stone)]/5 focus:ring-2 focus:ring-[var(--color-brand-forest)]/10 placeholder:text-[var(--color-brand-stone)]/20"
           />
           <button 
             onClick={handleSend}
             disabled={isTyping}
             className="rounded-2xl bg-[var(--color-brand-forest)] px-5 text-white shadow-bloom disabled:opacity-50 transition-transform active:scale-90"
           >
             {isTyping ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
           </button>
        </div>
      </div>

      {/* Grid Display */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[var(--color-brand-stone)]/40">{t.referenceGrid || "Character Sheet"}</h3>
          <span className="text-[10px] font-black text-[var(--color-brand-stone)]/20 uppercase tracking-widest">
            {characterSheetSize ? `${characterSheetSize.w}×${characterSheetSize.h}` : t.scanCompleted}
          </span>
        </div>
        <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-3xl)] bg-[var(--color-brand-sand)] shadow-bloom ring-8 ring-white">
          <AnimatePresence>
            {isRegenerating && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md"
              >
                <Loader2 size={40} className="animate-spin text-[var(--color-brand-forest)]" />
                <span className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-brand-forest)]">
                  {t.regeneratingCard}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <img 
            src={pet.characterSheetUrl} 
            alt="Character Sheet"
            className={cn(
              "h-full w-full object-cover transition-all duration-1000",
              isRegenerating && "scale-110 blur-md opacity-40"
            )}
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth || 0;
              const h = e.currentTarget.naturalHeight || 0;
              if (w && h) setCharacterSheetSize({ w, h });
            }}
          />
        </div>
        
        <button
          onClick={handleRegenerateCharacterSheet}
          disabled={isRegenerating}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-white py-4 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-brand-stone)]/40 hover:text-[var(--color-brand-forest)] ring-1 ring-[var(--color-brand-stone)]/5 shadow-soft transition-all active:scale-95"
        >
          <RotateCcw size={14} />
          <span>{t.regenerateCard}</span>
        </button>
      </div>

      {/* Action Buttons */}
      <div className="space-y-4 pb-12">
        <div className="grid grid-cols-2 gap-4">
          <ActionButton 
            onClick={handleShare} 
            icon={<Share2 size={20} />} 
            label={t.shareProfile}
            variant="secondary"
          />
          <ActionButton 
            onClick={handleDownloadCharacterSheet} 
            icon={<Download size={20} />} 
            label={t.downloadCharacterSheet}
            variant="secondary"
          />
        </div>
        
        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-brand-stone)]/20 hover:text-red-400 transition-colors"
        >
          <X size={14} />
          <span>{t.resetAndRescan}</span>
        </button>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">{label}</span>
      <p className="line-clamp-1 text-sm font-bold tracking-tight">{value}</p>
    </div>
  );
}

function ActionButton({ 
  onClick, 
  icon, 
  label, 
  variant = 'primary' 
}: { 
  onClick: () => void; 
  icon: React.ReactNode; 
  label: string;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-2xl py-4 font-bold transition-all active:scale-[0.98]",
        variant === 'primary' 
          ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" 
          : "bg-white text-gray-600 ring-1 ring-gray-100 shadow-sm"
      )}
    >
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  );
}
