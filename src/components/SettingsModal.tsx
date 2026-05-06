import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Trash2, Globe, Info, Shield, ChevronRight } from 'lucide-react';
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
      className="fixed inset-0 z-50 flex flex-col bg-white"
    >
      <header className="flex items-center justify-between p-4 border-b border-gray-100">
        <h2 className="text-xl font-bold">{t.settings}</h2>
        <button onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100">
          <X size={24} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        {/* Profile Section */}
        <section className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{t.about}</h3>
          <div className="rounded-3xl bg-gray-50 p-6 flex flex-col items-center text-center">
             <div className="h-16 w-16 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
                <Info size={32} />
             </div>
             <h4 className="font-bold text-lg">{t.appName}</h4>
             <p className="text-sm text-gray-500 mt-1">{t.appDescription}</p>
             <div className="mt-4 rounded-full bg-white px-3 py-1 text-[10px] font-bold text-gray-400 ring-1 ring-gray-100 uppercase">
                {t.version}: {commit ? commit.slice(0, 7) : "1.2.0-STABLE"}
             </div>
          </div>
        </section>

        {/* Preferences Section */}
        <section className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">{t.settings}</h3>
          <div className="space-y-1 overflow-hidden rounded-3xl ring-1 ring-gray-100">
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
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">Danger Zone</h3>
          <button 
            onClick={handleClearData}
            className="flex w-full items-center gap-4 rounded-3xl bg-red-50 p-4 text-red-600 transition-transform active:scale-[0.98]"
          >
            <div className="rounded-xl bg-red-100 p-2">
              <Trash2 size={20} />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-sm">{t.clearData}</p>
              <p className="text-[10px] opacity-60">Permanently delete pet ID and interaction memories</p>
            </div>
            <ChevronRight size={16} className="opacity-40" />
          </button>
        </section>
      </div>

      <footer className="p-8 text-center">
        <button 
          onClick={onClose}
          className="w-full rounded-2xl bg-gray-900 py-4 font-bold text-white shadow-xl shadow-gray-900/20 active:scale-95 transition-transform"
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
      className="flex w-full items-center gap-4 bg-white p-4 transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      <div className="text-gray-400">{icon}</div>
      <div className="flex-1 text-left font-medium text-sm text-gray-700">{label}</div>
      {value && <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">{value}</span>}
      <ChevronRight size={16} className="text-gray-300" />
    </button>
  );
}
