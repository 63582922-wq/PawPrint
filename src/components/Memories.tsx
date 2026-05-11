import React, { useState } from 'react';
import { PetID, InteractionVideo } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Trash2, AlertCircle, BookHeart } from 'lucide-react';

interface MemoriesProps {
  interactions: InteractionVideo[];
  t: any;
  pet: PetID | null;
  onDelete: (id: string) => void;
}

export default function Memories({ interactions, t, pet, onDelete }: MemoriesProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const petInteractions = interactions.filter(i => i.petId === pet?.id);

  const handleFinalDelete = () => {
    if (deletingId) { onDelete(deletingId); setDeletingId(null); }
  };

  /* Empty state */
  if (petInteractions.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center px-8 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 -m-6 rounded-full bg-[var(--color-brand-coral-soft)] blur-2xl opacity-70" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] bg-white text-[var(--color-brand-coral)] shadow-soft ring-1 ring-[var(--color-brand-sand)]">
            <BookHeart size={36} strokeWidth={1.6} />
          </div>
        </div>
        <h3 className="font-display text-[22px] font-bold text-[var(--color-brand-stone)]">
          {t.noMemories}
        </h3>
        <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-[var(--color-brand-stone-soft)]">
          {t.noMemoriesDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between px-1">
        <div className="space-y-0.5">
          <h2 className="font-display text-[26px] font-bold tracking-tight text-[var(--color-brand-stone)]">
            {t.memories}
          </h2>
          <p className="text-[12px] text-[var(--color-brand-stone-soft)]">
            {petInteractions.length} {t.moments.toLowerCase()}
          </p>
        </div>
      </div>

      {/* Diary card */}
      {pet && (
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[var(--color-brand-coral)] to-[#E76A4F] p-5 text-white shadow-warm">
          <BookHeart size={140} className="absolute -right-6 -bottom-6 opacity-15" />
          <div className="relative space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <BookHeart size={14} />
              </div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/80">
                {t.petDiary}
              </p>
            </div>
            <p className="text-[14px] leading-relaxed text-white/95">
              {t.diarySample.replace('{name}', pet.name)}
            </p>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3">
        {petInteractions.map((interaction, i) => (
          <motion.div
            key={interaction.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, ease: [0.22, 0.61, 0.36, 1] }}
            className="group relative flex flex-col overflow-hidden rounded-[20px] bg-white p-2 shadow-soft ring-1 ring-[var(--color-brand-sand)] transition-shadow hover:shadow-bloom"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[14px] bg-[var(--color-brand-cream)]">
              <video
                src={interaction.videoUrl}
                autoPlay loop muted playsInline
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

              <button
                onClick={() => setDeletingId(interaction.id)}
                className="tap absolute right-2 top-2 rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100"
                aria-label="Delete"
              >
                <Trash2 size={12} />
              </button>

              <div className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/30 backdrop-blur-md">
                <Play size={10} fill="currentColor" className="ml-0.5 text-white" />
              </div>
            </div>

            <div className="px-2 pt-2.5 pb-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-brand-stone-soft)]">
                {new Date(interaction.createdAt).toLocaleDateString([], {
                  month: 'short', day: 'numeric',
                })}
              </p>
              <p className="mt-0.5 truncate text-[12px] font-medium text-[var(--color-brand-stone)]">
                {t.interactionComplete}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Delete dialog */}
      <AnimatePresence>
        {deletingId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full max-w-sm rounded-[28px] bg-white p-7 text-center shadow-bloom"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-[var(--color-danger)]">
                <AlertCircle size={28} />
              </div>
              <h3 className="font-display text-[20px] font-bold text-[var(--color-brand-stone)]">
                Delete Memory?
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-brand-stone-soft)]">
                This will permanently remove this moment from your collection.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setDeletingId(null)}
                  className="tap flex-1 rounded-2xl bg-[var(--color-brand-sand)] py-3.5 text-[14px] font-semibold text-[var(--color-brand-stone)]"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleFinalDelete}
                  className="tap flex-1 rounded-2xl bg-[var(--color-danger)] py-3.5 text-[14px] font-semibold text-white shadow-soft"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
