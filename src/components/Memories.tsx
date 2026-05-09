import React from 'react';
import { PetID, InteractionVideo } from '../types';
import { motion } from 'motion/react';
import { Play, Calendar, MapPin, Trash2, Heart } from 'lucide-react';

interface MemoriesProps {
  interactions: InteractionVideo[];
  t: any;
  pet: PetID | null;
  onDelete: (id: string) => void;
}

export default function Memories({ interactions, t, pet, onDelete }: MemoriesProps) {
  const petInteractions = interactions.filter(i => i.petId === pet?.id);

  const handleDelete = (id: string) => {
    if (window.confirm(t.clearDataConfirm)) {
      onDelete(id);
    }
  };

  if (petInteractions.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center p-8 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100 text-gray-300">
           <Heart size={32} />
        </div>
        <h3 className="text-xl font-bold">{t.noMemories}</h3>
        <p className="mt-2 text-sm text-gray-400">
          {t.noMemoriesDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t.memories}</h2>
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
          {petInteractions.length} {t.moments}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {petInteractions.map((interaction, i) => (
          <motion.div
            key={interaction.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="group relative aspect-[3/4] overflow-hidden rounded-3xl bg-gray-200 shadow-sm"
          >
            <video 
              src={interaction.videoUrl} 
              autoPlay 
              loop 
              muted 
              playsInline
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            
            <div className="absolute top-3 right-3">
              <button 
                onClick={() => handleDelete(interaction.id)}
                className="rounded-full bg-black/40 p-2 text-white backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="absolute bottom-4 left-4 right-4">
               <div className="flex items-center gap-2 text-white mb-2">
                 <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                   <Play size={12} fill="currentColor" />
                 </div>
                 <div className="space-y-0.5">
                   <p className="text-[10px] font-bold opacity-60">
                     {new Date(interaction.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                   </p>
                   <p className="text-xs font-bold tracking-tight">{t.interactionComplete}</p>
                 </div>
               </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-10 rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 p-8 text-white">
        <h3 className="text-lg font-bold">{t.petDiary}</h3>
        <p className="mt-2 text-sm opacity-60">
          {t.diarySample.replace('{name}', pet?.name || 'Buddy')}
        </p>
        <div className="mt-6 flex items-center gap-4 border-t border-white/10 pt-6">
           <div className="flex -space-x-3">
             {[1,2,3].map(i => (
               <div key={i} className="h-8 w-8 rounded-full border-2 border-gray-900 bg-gray-700 overflow-hidden">
                 <img src={`https://i.pravatar.cc/100?u=${i}`} alt="User" />
               </div>
             ))}
           </div>
           <p className="text-[10px] uppercase font-bold tracking-widest text-orange-400">
             {t.sharedMoments.replace('{count}', '12')}
           </p>
        </div>
      </div>
    </div>
  );
}
