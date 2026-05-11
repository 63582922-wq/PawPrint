import React, { useState } from 'react';
import { PetID } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Download, RotateCcw, Send, Loader2, Upload, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { chatWithPet } from '../services/geminiService';

interface PetIDCardProps {
  pet: PetID;
  onReset: () => void;
  onUpdate: (pet: PetID) => void;
  t: any;
}

export default function PetIDCard({ pet, onReset, onUpdate, t }: PetIDCardProps) {
  const [chatMessage, setChatMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [lastPetReply, setLastPetReply] = useState<string | null>(null);
  const [characterSheetSize, setCharacterSheetSize] = useState<{ w: number; h: number } | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const getDataUrlMime = (dataUrl: string) => {
    const m = dataUrl.match(/^data:([^;]+);base64,/i);
    return m?.[1] || '';
  };

  const convertDataUrlToPng = async (dataUrl: string) => {
    if (getDataUrlMime(dataUrl).toLowerCase() === 'image/png') return dataUrl;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Failed to load image for PNG conversion.'));
      i.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 1;
    canvas.height = img.naturalHeight || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  };

  const downloadToFile = (url: string | undefined, filename: string) => {
    if (!url) return;
    if (/^https?:\/\//i.test(url)) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const handleSend = async () => {
    if (!chatMessage.trim() || isTyping) return;
    const userMsg = chatMessage;
    setChatMessage('');
    setIsTyping(true);
    try {
      const description = `${pet.breed}, ${pet.characteristics.join(', ')}`;
      const reply = await chatWithPet(description, userMsg);
      setLastPetReply(reply);
    } catch (error: any) {
      console.error(error);
      const msg = String(error?.message || '');
      if (msg.includes('missing_apiyi_api_key')) {
        setLastPetReply('⚠️ 服务端未配置 APIYI_API_KEY，暂时无法对话。');
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
          title: `PawPrint: ${pet.name}'s Digital Twin`,
          text: `Check out ${pet.name}'s digital identity card!`,
          url: window.location.href,
        });
      } catch (err) { console.error(err); }
    } else {
      try { await navigator.clipboard.writeText(window.location.href); alert(t.linkCopied); }
      catch (e) { alert(window.location.href); }
    }
  };

  const handleDownloadCharacterSheet = async () => {
    if (!pet.characterSheetUrl) return;
    if (/^https?:\/\//i.test(pet.characterSheetUrl)) {
      downloadToFile(pet.characterSheetUrl, `${pet.name || 'pet'}-character-sheet.png`);
      return;
    }
    const png = await convertDataUrlToPng(pet.characterSheetUrl);
    downloadToFile(png, `${pet.name || 'pet'}-character-sheet.png`);
  };

  const handleRegenerateCharacterSheet = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    try {
      const { generateCharacterSheet } = await import('../services/geminiService');
      const ref = pet.referencePhotoUrl || pet.avatarUrl || '';
      const prompt = (pet as any)?.visualPrompt || `Match the pet in the reference image exactly.`;
      const newUrl = await generateCharacterSheet(String(prompt || ''), String(ref || ''));
      onUpdate({ ...pet, characterSheetUrl: newUrl });
    } catch (e) {
      console.error('Regenerate failed', e);
    } finally {
      setIsRegenerating(false);
    }
  };

  const genderLabel = pet.gender === 'Male' ? t.genderMale
    : pet.gender === 'Female' ? t.genderFemale
    : '—';

  return (
    <div className="space-y-6">
      {/* ID Card hero */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--color-brand-forest)] to-[#214E2C] p-6 text-white shadow-bloom">
        {/* decorative paw watermark */}
        <svg width="220" height="220" viewBox="0 0 24 24" className="absolute -right-12 -top-12 opacity-[0.08]" fill="currentColor">
          <ellipse cx="6" cy="9" rx="2" ry="2.6" />
          <ellipse cx="10.5" cy="6.5" rx="2" ry="2.6" />
          <ellipse cx="15.5" cy="6.5" rx="2" ry="2.6" />
          <ellipse cx="20" cy="9" rx="2" ry="2.6" />
          <path d="M12 11.2c-3.2 0-6 2.4-6 5.4 0 2 1.5 3.2 3.4 3.2 1 0 1.7-.4 2.6-.4s1.6.4 2.6.4c1.9 0 3.4-1.2 3.4-3.2 0-3-2.8-5.4-6-5.4z" />
        </svg>

        <div className="relative flex items-start gap-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="h-24 w-24 overflow-hidden rounded-2xl ring-2 ring-white/30 shadow-2xl">
              <img
                src={pet.avatarUrl || pet.characterSheetUrl}
                alt={pet.name}
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">
                {t.identityCard}
              </p>
              <h2 className="mt-1 truncate font-display text-[28px] font-bold leading-tight">
                {pet.name}
              </h2>
            </div>

            {/* Tags */}
            {pet.characteristics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pet.characteristics.slice(0, 3).map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-white/12 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-white/90 ring-1 ring-white/15"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info row */}
        <div className="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
          <InfoCell label={t.breed} value={pet.breed} />
          <InfoCell label={t.gender || 'Gender'} value={genderLabel} />
          <InfoCell label={t.birthDate} value={pet.birthday || '—'} />
        </div>

        <div className="relative mt-3 flex items-center justify-between text-[10px] text-white/40">
          <span className="font-mono tracking-wider">ID · {pet.id.toUpperCase()}</span>
          <span className="font-mono tracking-wider">
            {new Date(pet.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Telepathy chat */}
      <div className="rounded-[24px] bg-white p-5 shadow-soft ring-1 ring-[var(--color-brand-sand)]">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative">
            <div className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-[var(--color-brand-forest-soft)]">
              <img src={pet.avatarUrl || pet.characterSheetUrl} alt={pet.name} className="h-full w-full object-cover" />
            </div>
            <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-[var(--color-success)] ring-2 ring-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-[var(--color-brand-stone)]">{pet.name}</p>
            <p className="truncate text-[11px] text-[var(--color-brand-stone-soft)]">
              {t.telepathyMode}
            </p>
          </div>
          <Sparkles size={16} className="text-[var(--color-brand-coral)]" />
        </div>

        {/* Reply bubble */}
        <div className="mb-3 rounded-2xl bg-[var(--color-brand-cream)] px-4 py-3 text-[14px] leading-relaxed text-[var(--color-brand-stone)] min-h-[56px] flex items-center">
          <AnimatePresence mode="wait">
            {isTyping ? (
              <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-brand-stone-soft)]/40" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-brand-stone-soft)]/40 [animation-delay:0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-brand-stone-soft)]/40 [animation-delay:0.3s]" />
              </motion.div>
            ) : (
              <motion.p key="reply" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                {lastPetReply || t.diarySample.replace('{name}', pet.name)}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t.talkToPet.replace('{name}', pet.name)}
            className="flex-1 rounded-full bg-[var(--color-brand-sand)] px-4 py-3 text-[14px] text-[var(--color-brand-stone)] placeholder:text-[var(--color-brand-stone-soft)]/60 focus:bg-[var(--color-brand-forest-soft)] focus:outline-none transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={isTyping || !chatMessage.trim()}
            className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-forest)] text-white shadow-bloom disabled:opacity-40"
            aria-label="Send"
          >
            {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {/* Character sheet */}
      <div className="space-y-3">
        <div className="flex items-end justify-between px-1">
          <h3 className="text-[14px] font-semibold text-[var(--color-brand-stone)]">
            {t.referenceGrid || 'Character Sheet'}
          </h3>
          <span className="text-[11px] text-[var(--color-brand-stone-soft)]">
            {characterSheetSize ? `${characterSheetSize.w}×${characterSheetSize.h}` : t.scanCompleted}
          </span>
        </div>
        <div className="relative aspect-square w-full overflow-hidden rounded-[24px] bg-[var(--color-brand-cream)] shadow-soft ring-1 ring-[var(--color-brand-sand)]">
          <AnimatePresence>
            {isRegenerating && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 backdrop-blur-md"
              >
                <Loader2 size={32} className="animate-spin text-[var(--color-brand-forest)]" />
                <span className="mt-3 text-[12px] font-medium text-[var(--color-brand-forest)]">
                  {t.regeneratingCard}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <img
            src={pet.characterSheetUrl}
            alt="Character Sheet"
            className={cn(
              'h-full w-full object-contain transition-all duration-700',
              isRegenerating && 'scale-105 blur-md opacity-40'
            )}
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth || 0;
              const h = e.currentTarget.naturalHeight || 0;
              if (w && h) setCharacterSheetSize({ w, h });
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={handleShare}
          className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-brand-forest)] py-4 text-[15px] font-semibold text-white shadow-bloom"
        >
          <Share2 size={18} />
          {t.shareProfile}
        </button>
        <div className="grid grid-cols-3 gap-2.5">
          <SecondaryButton
            onClick={handleDownloadCharacterSheet}
            icon={<Download size={16} />}
            label={t.downloadCharacterSheet}
          />
          <SecondaryButton
            onClick={handleRegenerateCharacterSheet}
            icon={<RotateCcw size={16} className={isRegenerating ? 'animate-spin' : ''} />}
            label={t.regenerateCard}
            disabled={isRegenerating}
          />
          <SecondaryButton
            onClick={onReset}
            icon={<Upload size={16} />}
            label={t.reuploadPhotos}
          />
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/55">{label}</p>
      <p className="line-clamp-1 text-[13px] font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function SecondaryButton({
  onClick, icon, label, disabled = false,
}: { onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="tap flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white py-3 px-2 text-[var(--color-brand-stone)] shadow-soft ring-1 ring-[var(--color-brand-sand)] disabled:opacity-50"
    >
      <span className="text-[var(--color-brand-forest)]">{icon}</span>
      <span className="text-center text-[10px] font-medium leading-tight">{label}</span>
    </button>
  );
}
