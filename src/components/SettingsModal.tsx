import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Trash2, Globe, Info, Shield, ChevronRight, BookOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { Language } from '../lib/i18n';
import { PawLogo } from '../App';

interface SettingsModalProps {
  t: any;
  onClose: () => void;
  onReset: () => void;
  lang: Language;
  toggleLang: () => void;
}

export default function SettingsModal({ t, onClose, onReset, lang, toggleLang }: SettingsModalProps) {
  const [commit, setCommit] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    fetch('/version')
      .then(r => r.json())
      .then(j => { if (!cancelled) { const c = String(j?.commit || ''); if (c) setCommit(c); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleClearData = () => {
    if (window.confirm(t.clearDataConfirm)) onReset();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[var(--color-brand-warm-white)] pt-safe pb-safe"
    >
      {/* Header */}
      <header className="sticky top-0 z-10 glass">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between px-5 py-3">
          <h2 className="font-display text-[20px] font-bold text-[var(--color-brand-stone)]">
            {t.settings}
          </h2>
          <button
            onClick={onClose}
            className="tap flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-[var(--color-brand-stone-soft)] shadow-soft"
            aria-label={t.close}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-screen-sm overflow-y-auto px-5 py-6 space-y-7">
        {/* Brand card */}
        <section className="rounded-[24px] bg-white p-6 text-center shadow-soft ring-1 ring-[var(--color-brand-sand)]">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--color-brand-forest)] text-white shadow-bloom">
            <PawLogo size={32} />
          </div>
          <h4 className="font-display text-[18px] font-bold text-[var(--color-brand-stone)]">
            {t.appName}
          </h4>
          <p className="mt-1 text-[13px] text-[var(--color-brand-stone-soft)]">{t.appDescription}</p>
          <p className="mt-3 inline-block rounded-full bg-[var(--color-brand-sand)] px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-brand-stone-soft)]">
            v{commit ? commit.slice(0, 7) : '1.2.0'}
          </p>
        </section>

        {/* Preferences */}
        <section className="space-y-2">
          <h3 className="px-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-brand-stone-soft)]">
            {t.settings}
          </h3>
          <div className="overflow-hidden rounded-[20px] bg-white shadow-soft ring-1 ring-[var(--color-brand-sand)]">
            {/* Language as inline segmented control */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--color-brand-sand)]">
              <div className="flex items-center gap-3">
                <span className="text-[var(--color-brand-stone-soft)]">
                  <Globe size={18} />
                </span>
                <span className="text-[14px] font-medium text-[var(--color-brand-stone)]">
                  {lang === 'zh' ? '语言' : 'Language'}
                </span>
              </div>
              <div className="inline-flex rounded-full bg-[var(--color-brand-sand)] p-1">
                {(['zh', 'en'] as const).map(l => (
                  <button
                    key={l}
                    onClick={() => { if (l !== lang) toggleLang(); }}
                    className={cn(
                      'rounded-full px-3 py-1 text-[12px] font-semibold transition-all',
                      lang === l
                        ? 'bg-white text-[var(--color-brand-stone)] shadow-soft'
                        : 'text-[var(--color-brand-stone-soft)]'
                    )}
                  >
                    {l === 'zh' ? '中文' : 'EN'}
                  </button>
                ))}
              </div>
            </div>

            <SettingRow
              icon={<Shield size={18} />}
              label={t.privacy}
              onClick={() => alert(lang === 'zh' ? '隐私政策：所有数据保存在本机。' : 'Privacy: all data stays on this device.')}
            />
            <SettingRow
              icon={<BookOpen size={18} />}
              label={lang === 'zh' ? '重看新手引导' : 'Replay tutorial'}
              onClick={() => {
                localStorage.removeItem('pawprint_onboarded');
                window.location.reload();
              }}
              isLast
            />
          </div>
        </section>

        {/* About */}
        <section className="space-y-2">
          <h3 className="px-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-brand-stone-soft)]">
            {t.about}
          </h3>
          <div className="overflow-hidden rounded-[20px] bg-white shadow-soft ring-1 ring-[var(--color-brand-sand)]">
            <SettingRow
              icon={<Info size={18} />}
              label={lang === 'zh' ? '关于爪印 AI' : 'About PawPrint AI'}
              onClick={() => alert(t.appDescription)}
              isLast
            />
          </div>
        </section>

        {/* Danger zone */}
        <section className="space-y-2">
          <h3 className="px-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-danger)]/70">
            {lang === 'zh' ? '危险区域' : 'Danger Zone'}
          </h3>
          <button
            onClick={handleClearData}
            className="tap flex w-full items-center gap-4 rounded-[20px] bg-white p-5 text-left text-[var(--color-danger)] shadow-soft ring-1 ring-red-100"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50">
              <Trash2 size={18} />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold">{t.clearData}</p>
              <p className="text-[12px] opacity-70">
                {lang === 'zh' ? '永久删除宠物档案和回忆' : 'Permanently delete pet profile and memories'}
              </p>
            </div>
            <ChevronRight size={16} className="opacity-40" />
          </button>
        </section>

        {/* Footer */}
        <div className="pt-2 pb-10 text-center">
          <p className="text-[11px] text-[var(--color-brand-stone-soft)]/70">
            Made with <span className="text-[var(--color-brand-coral)]">♥</span> for pet lovers
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function SettingRow({
  icon, label, value, onClick, isLast,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'tap flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--color-brand-sand)]/40 active:bg-[var(--color-brand-sand)]/60',
        !isLast && 'border-b border-[var(--color-brand-sand)]'
      )}
    >
      <span className="text-[var(--color-brand-stone-soft)]">{icon}</span>
      <span className="flex-1 text-[14px] font-medium text-[var(--color-brand-stone)]">{label}</span>
      {value && (
        <span className="text-[12px] font-medium text-[var(--color-brand-stone-soft)]">{value}</span>
      )}
      <ChevronRight size={16} className="text-[var(--color-brand-mist)]" />
    </button>
  );
}
