/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, 
  IdCard, 
  History, 
  Plus, 
  Scan, 
  Settings as SettingsIcon,
  Heart,
  ChevronRight,
  Info
} from 'lucide-react';
import { PetID, InteractionVideo } from './types';
import { cn } from './lib/utils';
import { translations, Language } from './lib/i18n';
import PetScanner from './components/PetScanner';
import PetIDCard from './components/PetIDCard';
import InteractionStudio from './components/InteractionStudio';
import Memories from './components/Memories';
import SettingsModal from './components/SettingsModal';
import Onboarding from './components/Onboarding';

export default function App() {
  console.log("App mounting...");
  const [activeTab, setActiveTab] = useState<'home' | 'interact' | 'memories'>('home');
  const [petID, setPetID] = useState<PetID | null>(null);
  const [interactions, setInteractions] = useState<InteractionVideo[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [lang, setLang] = useState<Language>('zh');

  const t = translations[lang];

  const safeSetLocalStorage = (key: string, value: string) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, value);
      return;
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      const looksLikeQuota =
        /quota/i.test(msg) ||
        /exceeded/i.test(msg) ||
        e?.name === "QuotaExceededError" ||
        e?.code === 22;
      if (!looksLikeQuota) return;

      try {
        localStorage.removeItem("pawprint_interactions");
      } catch (e2) {}

      try {
        localStorage.setItem(key, value);
      } catch (e3) {
        try {
          alert("本地存储空间已满，已尝试清理旧回忆。若仍失败，请到「设置」里点「清除数据」。");
        } catch (e4) {}
      }
    }
  };

  useEffect(() => {
    // Load from local storage if exists
    let savedPet: string | null = null;
    let savedInteractions: string | null = null;
    let savedLang: Language | null = null;
    try {
      savedPet = localStorage.getItem('pawprint_pet');
      savedInteractions = localStorage.getItem('pawprint_interactions');
      savedLang = localStorage.getItem('pawprint_lang') as Language;
    } catch (e) {}
    
    if (savedLang) setLang(savedLang);

    if (savedPet) {
      try {
        setPetID(JSON.parse(savedPet));
        setActiveTab('home');
      } catch (e) {
        try {
          localStorage.removeItem("pawprint_pet");
        } catch (e2) {}
        setActiveTab('home');
      }
    } else {
      setActiveTab('home');
    }
    
    if (savedInteractions) {
      try {
        setInteractions(JSON.parse(savedInteractions));
      } catch (e) {
        try {
          localStorage.removeItem("pawprint_interactions");
        } catch (e2) {}
      }
    }

    const onboarded = localStorage.getItem('pawprint_onboarded');
    if (!onboarded) {
      setShowOnboarding(true);
    }
    
    setIsInitializing(false);
  }, []);

  const toggleLang = () => {
    const newLang = lang === 'en' ? 'zh' : 'en';
    setLang(newLang);
    safeSetLocalStorage('pawprint_lang', newLang);
  };

  const handlePetCreated = (newPet: PetID) => {
    setPetID(newPet);
    safeSetLocalStorage('pawprint_pet', JSON.stringify(newPet));
    setActiveTab('home');
  };

  const handlePetUpdated = (updatedPet: PetID) => {
    setPetID(updatedPet);
    safeSetLocalStorage('pawprint_pet', JSON.stringify(updatedPet));
  };

  const handleInteractionSaved = (newInteraction: InteractionVideo) => {
    const updated = [newInteraction, ...interactions];
    setInteractions(updated);
    safeSetLocalStorage('pawprint_interactions', JSON.stringify(updated));
    setActiveTab('memories');
  };

  const handleDeleteInteraction = (id: string) => {
    const updated = interactions.filter(i => i.id !== id);
    setInteractions(updated);
    safeSetLocalStorage('pawprint_interactions', JSON.stringify(updated));
  };

  const handleResetData = () => {
    localStorage.removeItem('pawprint_pet');
    localStorage.removeItem('pawprint_interactions');
    setPetID(null);
    setInteractions([]);
    setActiveTab('home');
    setIsSettingsOpen(false);
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    localStorage.setItem('pawprint_onboarded', 'true');
  };

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-brand-warm-white)]">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-[var(--color-brand-forest)]"
        >
          <Heart size={48} fill="currentColor" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-brand-warm-white)] text-[var(--color-brand-stone)] overflow-x-hidden font-sans">
      {/* Onboarding */}
      <AnimatePresence>
        {showOnboarding && <Onboarding t={t} onComplete={handleOnboardingComplete} />}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between bg-[var(--color-brand-warm-white)]/80 p-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-[var(--color-brand-forest)] p-1.5 text-white shadow-bloom">
            <Heart size={20} fill="currentColor" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--color-brand-forest)]">{t.appName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleLang}
            className="rounded-full bg-[var(--color-brand-sand)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-brand-forest)] hover:bg-[var(--color-brand-sand)]/80"
          >
            {lang === 'en' ? '中文' : 'EN'}
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-full p-2 text-[var(--color-brand-stone)]/40 hover:bg-[var(--color-brand-sand)]"
          >
            <SettingsIcon size={24} />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal 
            t={t} 
            onClose={() => setIsSettingsOpen(false)} 
            onReset={handleResetData}
            lang={lang}
            toggleLang={toggleLang}
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="relative flex-1 pb-24">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="px-4 py-6"
            >
              {petID ? (
                <PetIDCard pet={petID} onReset={() => setPetID(null)} onUpdate={handlePetUpdated} t={t} />
              ) : (
                <PetScanner onComplete={handlePetCreated} t={t} />
              )}
            </motion.div>
          )}

          {activeTab === 'interact' && (
            <motion.div
              key="interact"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="px-4 py-6"
            >
              <InteractionStudio pet={petID} onSave={handleInteractionSaved} t={t} />
            </motion.div>
          )}

          {activeTab === 'memories' && (
            <motion.div
              key="memories"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="px-4 py-6"
            >
              <Memories interactions={interactions} t={t} pet={petID} onDelete={handleDeleteInteraction} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--color-brand-sand)] bg-[var(--color-brand-warm-white)]/90 p-4 pb-8 backdrop-blur-lg">
        <div className="mx-auto flex max-w-sm justify-around">
          <NavButton 
            active={activeTab === 'home'} 
            onClick={() => setActiveTab('home')}
            icon={<IdCard size={24} />}
            label={t.petId}
          />
          <NavButton 
            active={activeTab === 'interact'} 
            onClick={() => setActiveTab('interact')}
            icon={<Camera size={24} />}
            label={t.interact}
            primary
          />
          <NavButton 
            active={activeTab === 'memories'} 
            onClick={() => setActiveTab('memories')}
            icon={<History size={24} />}
            label={t.memories}
          />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ 
  active, 
  onClick, 
  icon, 
  label,
  primary 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: React.ReactNode; 
  label: string;
  primary?: boolean;
}) {
  if (primary) {
    return (
      <button 
        onClick={onClick}
        className={cn(
          "relative -top-8 flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--color-brand-forest)] text-white shadow-bloom transition-all",
          active ? "scale-110 rotate-0" : "hover:scale-105"
        )}
      >
        {icon}
      </button>
    );
  }

  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-colors",
        active ? "text-[var(--color-brand-forest)]" : "text-[var(--color-brand-stone)]/40 hover:text-[var(--color-brand-stone)]/60"
      )}
    >
      <div className={cn(
        "rounded-2xl p-1",
        active && "bg-[var(--color-brand-sand)]"
      )}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-dot"
          className="h-1 w-1 rounded-full bg-[var(--color-brand-forest)]"
        />
      )}
    </button>
  );
}
