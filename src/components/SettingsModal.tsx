import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Globe, Info, Shield, ChevronRight, Heart } from 'lucide-react';
import { cn } from '../lib/utils';
import { Language } from '../lib/i18n';

interface SettingsModalProps {
  t: any;
  onClose: () => void;
  onReset: () => void;
  lang: Language;
  toggleLang: () => void;
}

export default function SettingsModal({ t, onClose, onReset, lang, toggleLang }: SettingsModalProps) {
  const [commit, setCommit] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch("/version")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const c = String(j?.commit || "");
        if (c) setCommit(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClearData = () => {
    if (window.confirm(t.clearDataConfirm)) {
      onReset();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-brand-warm-white)]"
    >
      <header className="flex items-center justify-between p-6 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <h2 className="text-2xl font-black tracking-tight text-[var(--color-brand-forest)]">{t.settings}</h2>
        <button onClick={onClose} className="rounded-full bg-[var(--color-brand-sand)] p-2 text-[var(--color-brand-stone)]/40">
          <X size={24} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-10">
        {/* Profile Section */}
        <section className="space-y-4">
          <h3 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-brand-stone)]/40">{t.about}</h3>
          <div className="rounded-[var(--radius-3xl)] bg-white p-8 flex flex-col items-center text-center shadow-soft ring-1 ring-[var(--color-brand-sand)] relative overflow-hidden">
             <div className="absolute -right-4 -top-4 opacity-5">
               <Heart size={120} fill="var(--color-brand-forest)" />
             </div>
             <div className="h-20 w-20 rounded-[var(--radius-2xl)] bg-[var(--color-brand-forest)] text-white flex items-center justify-center shadow-bloom mb-6">
                <Info size={40} strokeWidth={1.5} />
             </div>
             <h4 className="font-black text-xl text-[var(--color-brand-forest)]">{t.appName}</h4>
             <p className="text-sm text-[var(--color-brand-stone)]/60 mt-2">{t.appDescription}</p>
             <div className="mt-6 rounded-full bg-[var(--color-brand-sand)] px-4 py-1.5 text-[10px] font-black text-[var(--color-brand-forest)]/40 uppercase tracking-widest">
                {t.version}: {commit ? commit.slice(0, 7) : "1.2.0-STABLE"}
             </div>
          </div>
        </section>

        {/* Preferences Section */}
        <section className="space-y-4">
          <h3 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-brand-stone)]/40">{t.settings}</h3>
          <div className="overflow-hidden rounded-[var(--radius-3xl)] bg-white shadow-soft ring-1 ring-[var(--color-brand-sand)]">
            <SettingRow 
              icon={<Globe size={20} />}
              label={lang === 'en' ? 'Language / 语言' : '语言 / Language'}
              value={lang === 'en' ? 'English' : '简体中文'}
              onClick={toggleLang}
            />
            <SettingRow 
              icon={<Shield size={20} />}
              label={t.privacy}
              onClick={() => alert('Privacy Policy: All data is stored locally on your device.')}
            />
            <SettingRow 
              icon={<Info size={20} />}
              label="Tutorial / 教程"
              onClick={() => {
                localStorage.removeItem('pawprint_onboarded');
                window.location.reload();
              }}
            />
          </div>
        </section>

        {/* Danger Zone */}
        <section className="space-y-4">
          <h3 className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-400/60">Danger Zone</h3>
          <button 
            onClick={handleClearData}
            className="flex w-full items-center gap-5 rounded-[var(--radius-3xl)] bg-red-50 p-6 text-red-600 transition-all active:scale-[0.98] ring-1 ring-red-100 shadow-sm"
          >
            <div className="rounded-2xl bg-red-100 p-3">
              <Trash2 size={24} />
            </div>
            <div className="flex-1 text-left">
              <p className="font-black text-sm uppercase tracking-tight">{t.clearData}</p>
              <p className="text-xs opacity-60 mt-0.5">Permanently delete pet ID and memories</p>
            </div>
            <ChevronRight size={16} className="opacity-30" />
          </button>
        </section>
      </div>

      <footer className="p-8 text-center bg-white/50 backdrop-blur-md border-t border-[var(--color-brand-sand)]">
        <button 
          onClick={onClose}
          className="w-full rounded-[var(--radius-3xl)] bg-[var(--color-brand-forest)] py-5 font-black text-white shadow-bloom active:scale-95 transition-transform text-lg"
        >
          {t.close}
        </button>
      </footer>
    </motion.div>
  );
}

function SettingRow({ icon, label, value, onClick }: { 
  icon: React.ReactNode; 
  label: string; 
  value?: string;
  onClick: () => void;
}) {
  return (
    <button 
      onClick={onClick}
      className="flex w-full items-center gap-5 bg-white p-5 transition-colors hover:bg-[var(--color-brand-sand)] active:bg-[var(--color-brand-sand)] border-b last:border-none border-[var(--color-brand-sand)]"
    >
      <div className="text-[var(--color-brand-forest)]/40">{icon}</div>
      <div className="flex-1 text-left font-bold text-sm text-[var(--color-brand-stone)]">{label}</div>
      {value && <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-brand-forest)] bg-[var(--color-brand-sand)] px-3 py-1.5 rounded-full">{value}</span>}
      <ChevronRight size={16} className="text-[var(--color-brand-stone)]/20" />
    </button>
  );
}
