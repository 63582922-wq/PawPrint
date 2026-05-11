import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface OnboardingProps {
  t: any;
  onComplete: () => void;
}

export default function Onboarding({ t, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: t.onboardingWelcome,
      description: t.appDesc,
      illustration: <HeroPaw />,
    },
    {
      title: t.onboardingStep1Title,
      description: t.onboardingStep1Desc,
      illustration: <HeroCamera />,
    },
    {
      title: t.onboardingStep2Title,
      description: t.onboardingStep2Desc,
      illustration: <HeroIDCard />,
    },
    {
      title: t.onboardingStep3Title,
      description: t.onboardingStep3Desc,
      illustration: <HeroSparkle />,
    },
  ];

  const next = () => {
    if (step < steps.length - 1) setStep(s => s + 1);
    else onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-aurora pt-safe pb-safe"
    >
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === step
                  ? 'w-8 bg-[var(--color-brand-forest)]'
                  : i < step
                  ? 'w-1.5 bg-[var(--color-brand-forest)]/40'
                  : 'w-1.5 bg-[var(--color-brand-mist)]/60'
              )}
            />
          ))}
        </div>
        <button
          onClick={onComplete}
          className="tap rounded-full px-3 py-1 text-xs font-medium text-[var(--color-brand-stone-soft)]"
        >
          {t.skip}
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-between px-6 pb-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
            className="flex flex-1 flex-col items-center justify-center text-center"
          >
            <div className="mb-8 animate-float">{steps[step].illustration}</div>
            <h2 className="font-display text-[28px] font-bold leading-tight text-[var(--color-brand-stone)]">
              {steps[step].title}
            </h2>
            <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-[var(--color-brand-stone-soft)]">
              {steps[step].description}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="space-y-3 pt-6">
          <button
            onClick={next}
            className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-brand-forest)] py-4 text-[16px] font-semibold text-white shadow-bloom"
          >
            {step === steps.length - 1 ? t.getStarted : t.nextStep}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------- Inline SVG illustrations -------------------- */

function FrameRing({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 -m-6 rounded-full bg-white/60 blur-xl" />
      <div className="relative flex h-44 w-44 items-center justify-center rounded-[40px] bg-white/80 shadow-bloom ring-1 ring-white">
        {children}
      </div>
    </div>
  );
}

function HeroPaw() {
  return (
    <FrameRing>
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="var(--color-brand-forest-soft)" />
        <g fill="var(--color-brand-forest)">
          <ellipse cx="34" cy="48" rx="9"  ry="11" />
          <ellipse cx="50" cy="36" rx="9"  ry="11" />
          <ellipse cx="70" cy="36" rx="9"  ry="11" />
          <ellipse cx="86" cy="48" rx="9"  ry="11" />
          <path d="M60 56c-15 0-27 11-27 24 0 9 6.5 14 14 14 4.5 0 7-1.8 13-1.8s8.5 1.8 13 1.8c7.5 0 14-5 14-14 0-13-12-24-27-24z" />
        </g>
        <circle cx="92" cy="28" r="5" fill="var(--color-brand-coral)" />
        <circle cx="22" cy="78" r="3" fill="var(--color-brand-coral)" opacity="0.6" />
      </svg>
    </FrameRing>
  );
}

function HeroCamera() {
  return (
    <FrameRing>
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="var(--color-brand-coral-soft)" />
        <rect x="22" y="40" width="76" height="48" rx="12" fill="var(--color-brand-stone)" />
        <rect x="42" y="32" width="22" height="12" rx="3" fill="var(--color-brand-stone)" />
        <circle cx="60" cy="64" r="16" fill="var(--color-brand-coral)" />
        <circle cx="60" cy="64" r="8"  fill="white" />
        <circle cx="60" cy="64" r="3"  fill="var(--color-brand-stone)" />
        <circle cx="86" cy="50" r="3"  fill="var(--color-brand-cream)" />
        {/* sparkles */}
        <path d="M30 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--color-brand-coral)" />
        <path d="M96 96l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="var(--color-brand-forest)" />
      </svg>
    </FrameRing>
  );
}

function HeroIDCard() {
  return (
    <FrameRing>
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="var(--color-brand-forest-soft)" />
        <rect x="20" y="34" width="80" height="52" rx="10" fill="var(--color-brand-forest)" />
        <circle cx="36" cy="58" r="11" fill="var(--color-brand-cream)" />
        <circle cx="33" cy="55" r="2" fill="var(--color-brand-forest)" />
        <circle cx="39" cy="55" r="2" fill="var(--color-brand-forest)" />
        <ellipse cx="36" cy="62" rx="3" ry="2" fill="var(--color-brand-coral)" />
        <rect x="54" y="48" width="34" height="4" rx="2" fill="white" opacity="0.9" />
        <rect x="54" y="58" width="22" height="3" rx="1.5" fill="white" opacity="0.55" />
        <rect x="54" y="66" width="28" height="3" rx="1.5" fill="white" opacity="0.55" />
        <circle cx="92" cy="42" r="4" fill="var(--color-brand-coral)" />
      </svg>
    </FrameRing>
  );
}

function HeroSparkle() {
  return (
    <FrameRing>
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" fill="var(--color-brand-coral-soft)" />
        <path d="M60 24c2 14 8 20 22 22-14 2-20 8-22 22-2-14-8-20-22-22 14-2 20-8 22-22z" fill="var(--color-brand-coral)" />
        <path d="M30 80c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z" fill="var(--color-brand-forest)" />
        <path d="M90 90c.7 4 2.5 5.7 6.5 6.5-4 .7-5.8 2.5-6.5 6.5-.7-4-2.5-5.8-6.5-6.5 4-.8 5.8-2.5 6.5-6.5z" fill="var(--color-brand-forest)" opacity="0.6" />
      </svg>
    </FrameRing>
  );
}
