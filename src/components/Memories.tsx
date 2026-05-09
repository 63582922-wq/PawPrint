import React, { useState } from 'react';
import { PetID, InteractionVideo } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Trash2, Heart, X, AlertCircle } from 'lucide-react';

interface MemoriesProps {
  interactions: InteractionVideo[];
  t: any;
  pet: PetID | null;
  onDelete: (id: string) => void;
}

export default function Memories({ interactions, t, pet, onDelete }: MemoriesProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const petInteractions = interactions.filter(i => i.petId === pet?.id);

  const confirmDelete = (id: string) => {
    setDeletingId(id);
  };

  const handleFinalDelete = () => {
    if (deletingId) {
      onDelete(deletingId);
      setDeletingId(null);
    }
  };

  if (petInteractions.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center p-8 text-center space-y-6">
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center rounded-[var(--radius-3xl)] bg-[var(--color-brand-sand)] text-[var(--color-brand-stone)]/20 shadow-soft">
             <Heart size={40} />
          </div>
          <div className="absolute -right-2 -top-2 rounded-full bg-white p-2 text-[var(--color-brand-forest)] shadow-sm">
            <Play size={16} fill="currentColor" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-[var(--color-brand-forest)]">{t.noMemories}</h3>
          <p className="text-sm text-[var(--color-brand-stone)]/60 max-w-xs">
            {t.noMemoriesDesc}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between px-2">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-[var(--color-brand-forest)]">{t.memories}</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-brand-stone)]/40">
            {petInteractions.length} {t.moments}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {petInteractions.map((interaction, i) => (
          <motion.div
            key={interaction.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="group relative flex flex-col bg-white p-3 pb-6 shadow-soft rounded-2xl ring-1 ring-[var(--color-brand-sand)] transition-all hover:shadow-bloom"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-[var(--color-brand-sand)]">
              <video 
                src={interaction.videoUrl} 
                autoPlay 
                loop 
                muted 
                playsInline
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              
              <button 
                onClick={() => confirmDelete(interaction.id)}
                className="absolute right-2 top-2 rounded-full bg-white/20 p-2 text-white backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>

              <div className="absolute bottom-2 left-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                  <Play size={10} fill="currentColor" className="text-white" />
                </div>
              </div>
            </div>

            <div className="mt-4 px-1 space-y-1">
               <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-brand-forest)]/40">
                 {new Date(interaction.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
               </p>
               <p className="text-xs font-bold text-[var(--color-brand-stone)] line-clamp-1">
                 {t.interactionComplete}
               </p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="rounded-[var(--radius-3xl)] bg-[var(--color-brand-forest)] p-8 text-white shadow-bloom relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10">
          <Heart size={160} fill="currentColor" />
        </div>
        <div className="relative space-y-4">
          <div className="space-y-1">
            <h3 className="text-xl font-black">{t.petDiary}</h3>
            <p className="text-sm opacity-60 leading-relaxed">
              {t.diarySample.replace('{name}', pet?.name || 'Buddy')}
            </p>
          </div>
          <div className="flex items-center gap-4 pt-4 border-t border-white/10">
             <div className="flex -space-x-3">
               {[1,2,3].map(i => (
                 <div key={i} className="h-10 w-10 rounded-full border-2 border-[var(--color-brand-forest)] bg-white/10 overflow-hidden backdrop-blur-sm">
                   <img src={`https://i.pravatar.cc/100?u=${i+10}`} alt="User" className="opacity-80" />
                 </div>
               ))}
             </div>
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-brand-clay)]">
               {t.sharedMoments.replace('{count}', '12')}
             </p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Overlay */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-[var(--radius-3xl)] bg-white p-8 shadow-2xl text-center space-y-6"
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="rounded-full bg-red-50 p-4 text-red-500">
                  <AlertCircle size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-[var(--color-brand-stone)]">Delete Memory?</h3>
                  <p className="text-sm text-[var(--color-brand-stone)]/60">
                    This will permanently remove this moment from your collection.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setDeletingId(null)}
                  className="flex-1 rounded-2xl bg-[var(--color-brand-sand)] py-4 font-bold text-[var(--color-brand-stone)]"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleFinalDelete}
                  className="flex-1 rounded-2xl bg-red-500 py-4 font-bold text-white shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
