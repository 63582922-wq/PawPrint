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
  Settings as SettingsIcon,
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

type Tab = 'home' | 'interact' | 'memories';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [petID, setPetID] = useState<PetID | null>(null);
  const [interactions, setInteractions] = useState<InteractionVideo[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [lang, setLang] = useState<Language>('zh');

  const t = translations[lang];

  const safeSetLocalStorage = (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, value);
      return;
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      const looksLikeQuota =
        /quota/i.test(msg) ||
        /exceeded/i.test(msg) ||
        e?.name === 'QuotaExceededError' ||
        e?.code === 22;
      if (!looksLikeQuota) return;
      try { localStorage.removeItem('pawprint_interactions'); } catch (e2) {}
      try { localStorage.setItem(key, value); } catch (e3) {
        try { alert('本地存储空间已满，请到设置里清除数据。'); } catch (e4) {}
      }
    }
  };

  useEffect(() => {
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
      try { setPetID(JSON.parse(savedPet)); } catch (e) {
        try { localStorage.removeItem('pawprint_pet'); } catch (e2) {}
      }
    }
    if (savedInteractions) {
      try { setInteractions(JSON.parse(savedInteractions)); } catch (e) {
        try { localStorage.removeItem('pawprint_interactions'); } catch (e2) {}
      }
    }

    const onboarded = localStorage.getItem('pawprint_onboarded');
    if (!onboarded) setShowOnboarding(true);

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
      <div className="flex h-screen items-center justify-center bg-aurora">
        <motion.div
          animate={{ scale: [1, 1.06, 1], rotate: [0, 6, -6, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          className="text-[var(--color-brand-forest)]"
          aria-label="Loading"
        >
          <PawLogo size={56} />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--color-brand-warm-white)] text-[var(--color-brand-stone)] overflow-x-hidden">
      {/* Onboarding */}
      <AnimatePresence>
        {showOnboarding && <Onboarding t={t} onComplete={handleOnboardingComplete} />}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-30 pt-safe">
        <div className="glass">
          <div className="mx-auto flex max-w-screen-sm items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--color-brand-forest)] text-white shadow-bloom">
                <PawLogo size={18} />
              </div>
              <div className="leading-tight">
                <h1 className="text-[15px] font-semibold tracking-tight text-[var(--color-brand-stone)]">
                  {t.appName}
                </h1>
                <p className="text-[11px] text-[var(--color-brand-stone-soft)]">
                  {t.appDesc}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="tap flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-brand-stone-soft)] hover:bg-white/60"
              aria-label={t.settings}
            >
              <SettingsIcon size={20} />
            </button>
          </div>
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
      <main className="relative mx-auto w-full max-w-screen-sm flex-1 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.section
              key="home"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
              className="px-5 py-6"
            >
              {petID ? (
                <PetIDCard pet={petID} onReset={() => setPetID(null)} onUpdate={handlePetUpdated} t={t} />
              ) : (
                <PetScanner onComplete={handlePetCreated} t={t} />
              )}
            </motion.section>
          )}

          {activeTab === 'interact' && (
            <motion.section
              key="interact"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
              className="px-5 py-6"
            >
              <InteractionStudio pet={petID} onSave={handleInteractionSaved} t={t} />
            </motion.section>
          )}

          {activeTab === 'memories' && (
            <motion.section
              key="memories"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
              className="px-5 py-6"
            >
              <Memories interactions={interactions} t={t} pet={petID} onDelete={handleDeleteInteraction} />
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 pb-safe">
        <div className="mx-auto max-w-screen-sm px-4">
          <div className="glass flex items-center justify-around rounded-t-[28px] border-t border-white/40 px-3 py-2.5 shadow-soft">
            <NavButton
              active={activeTab === 'home'}
              onClick={() => setActiveTab('home')}
              icon={<IdCard size={22} />}
              label={t.petId}
            />
            <NavButton
              active={activeTab === 'interact'}
              onClick={() => setActiveTab('interact')}
              icon={<Camera size={22} />}
              label={t.interact}
              accent
            />
            <NavButton
              active={activeTab === 'memories'}
              onClick={() => setActiveTab('memories')}
              icon={<History size={22} />}
              label={t.memories}
            />
          </div>
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
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'tap relative flex flex-1 flex-col items-center gap-1 py-1.5 transition-colors',
        active
          ? 'text-[var(--color-brand-forest)]'
          : 'text-[var(--color-brand-stone-soft)]/70'
      )}
      aria-pressed={active}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          className={cn(
            'absolute inset-x-2 inset-y-0 -z-0 rounded-2xl',
            accent ? 'bg-[var(--color-brand-coral-soft)]' : 'bg-[var(--color-brand-forest-soft)]'
          )}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <div className={cn(
        'relative z-10 flex h-7 w-7 items-center justify-center',
        active && accent && 'text-[var(--color-brand-coral)]'
      )}>
        {icon}
      </div>
      <span className="relative z-10 text-[10px] font-semibold tracking-wide">
        {label}
      </span>
    </button>
  );
}

/* ---------------- Logo ---------------- */
export function PawLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="6"   cy="9"  rx="2"   ry="2.6" />
      <ellipse cx="10.5" cy="6.5" rx="2"   ry="2.6" />
      <ellipse cx="15.5" cy="6.5" rx="2"   ry="2.6" />
      <ellipse cx="20"  cy="9"  rx="2"   ry="2.6" />
      <path d="M12 11.2c-3.2 0-6 2.4-6 5.4 0 2 1.5 3.2 3.4 3.2 1 0 1.7-.4 2.6-.4s1.6.4 2.6.4c1.9 0 3.4-1.2 3.4-3.2 0-3-2.8-5.4-6-5.4z" />
    </svg>
  );
}
