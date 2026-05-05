import React, { useState } from 'react';
import { PetID } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Share2, Download, RotateCcw, ShieldCheck, MapPin, Calendar, Fingerprint, Send, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { chatWithPet } from '../services/geminiService';

interface PetIDCardProps {
  pet: PetID;
  onReset: () => void;
  t: any;
}

export default function PetIDCard({ pet, onReset, t }: PetIDCardProps) {
  const [chatMessage, setChatMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [lastPetReply, setLastPetReply] = useState<string | null>(null);
  const [characterSheetSize, setCharacterSheetSize] = useState<{ w: number; h: number } | null>(null);

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
      if (error.message?.includes("API key is missing")) {
        setLastPetReply("⚠️ Please configure VITE_GEMINI_API_KEY in your .env file to chat with me!");
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
      alert(t.shareProfile + " - URL Copied!");
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

  return (
    <div className="space-y-6">
      {/* Actual ID Card Design */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-800 p-6 text-white shadow-2xl">
        {/* Holographic effect overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/5" />
        
        <div className="relative flex justify-between gap-4">
          <div className="flex-1 space-y-4">
            <div>
              <div className="flex items-center gap-1.5 opacity-60">
                <ShieldCheck size={14} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{t.identityCard}</span>
              </div>
              <h2 className="text-4xl font-black italic tracking-tighter uppercase">{pet.name}</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InfoItem label={t.breed} value={pet.breed} />
              <InfoItem label={t.idNumber} value={pet.id.toUpperCase()} />
              <InfoItem label={t.birthDate} value={pet.birthday} />
              <InfoItem label={t.issueDate} value={new Date(pet.createdAt).toLocaleDateString()} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {pet.characteristics.slice(0, 3).map((tag, i) => (
                <span key={i} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="relative shrink-0">
            <div className="h-28 w-28 overflow-hidden rounded-2xl border-2 border-white/20 bg-white/5 backdrop-blur-md">
              <img 
                src={pet.avatarUrl || pet.characterSheetUrl} 
                alt={pet.name} 
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-2 -right-2 rounded-lg bg-orange-500 p-1.5 text-white shadow-lg">
              <Fingerprint size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Immersive Interaction Section */}
      <div className="rounded-3xl bg-orange-50 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="h-10 w-10 rounded-full border-2 border-white overflow-hidden bg-white">
              <img src={pet.avatarUrl || pet.characterSheetUrl} alt="Pet" className="h-full w-full object-cover" />
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-white text-xs font-bold">
              AI
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold">{t.telepathyMode}</h3>
            <p className="text-xs text-gray-500">{t.connectedSoul.replace('{name}', pet.name)}</p>
          </div>
        </div>
        
        <div className="rounded-2xl bg-white p-4 shadow-sm italic text-sm text-gray-700 leading-relaxed min-h-[60px] flex items-center">
          <AnimatePresence mode="wait">
            {isTyping ? (
              <motion.div 
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex gap-1"
              >
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:0.4s]" />
              </motion.div>
            ) : (
              <motion.p
                key="reply"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
              >
                {lastPetReply || t.diarySample.replace('{name}', pet.name)} {!lastPetReply && "🦋"}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="flex gap-2">
           <input 
             value={chatMessage}
             onChange={(e) => setChatMessage(e.target.value)}
             onKeyDown={(e) => e.key === 'Enter' && handleSend()}
             placeholder={t.talkToPet.replace('{name}', pet.name)}
             className="flex-1 rounded-xl border-none bg-white p-3 text-xs shadow-sm ring-1 ring-gray-100 focus:ring-2 focus:ring-orange-500"
           />
           <button 
             onClick={handleSend}
             disabled={isTyping}
             className="rounded-xl bg-orange-500 px-4 py-2 text-white shadow-lg disabled:opacity-50 transition-transform active:scale-90"
           >
             {isTyping ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
           </button>
        </div>
      </div>

      {/* Grid Display */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">{t.referenceGrid || "Character Sheet"}</h3>
          <span className="text-[10px] font-medium text-gray-400">
            {characterSheetSize ? `${characterSheetSize.w}×${characterSheetSize.h}` : t.scanCompleted}
          </span>
        </div>
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gray-200 shadow-inner">
          <img 
            src={pet.characterSheetUrl} 
            alt="Character Sheet"
            className="h-full w-full object-cover"
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth || 0;
              const h = e.currentTarget.naturalHeight || 0;
              if (w && h) setCharacterSheetSize({ w, h });
            }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 pb-4">
        <ActionButton 
          onClick={handleShare} 
          icon={<Share2 size={18} />} 
          label={t.shareProfile}
          variant="secondary"
        />
        <ActionButton 
          onClick={handleDownloadCharacterSheet} 
          icon={<Download size={18} />} 
          label={t.downloadCharacterSheet}
          variant="secondary"
        />
        <ActionButton
          onClick={handleDownloadOriginalPhoto}
          icon={<Download size={18} />}
          label={t.downloadOriginalPhoto}
          variant="secondary"
        />
        <button
          onClick={onReset}
          className="flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-orange-500"
        >
          <RotateCcw size={14} />
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
