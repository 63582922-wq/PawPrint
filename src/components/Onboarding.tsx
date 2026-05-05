import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Camera, CreditCard, PlayCircle, ChevronRight, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface OnboardingProps {
  t: any;
  onComplete: () => void;
}

export default function Onboarding({ t, onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: t.onboardingWelcome,
      description: t.appDesc,
      icon: <Sparkles className="h-12 w-12 text-orange-500" />,
      image: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=80&w=800",
      color: "bg-orange-500"
    },
    {
      title: t.onboardingStep1Title,
      description: t.onboardingStep1Desc,
      icon: <Camera className="h-12 w-12 text-blue-500" />,
      image: "https://images.unsplash.com/photo-1544568100-847a948585b9?auto=format&fit=crop&q=80&w=800",
      color: "bg-blue-500"
    },
    {
      title: t.onboardingStep2Title,
      description: t.onboardingStep2Desc,
      icon: <CreditCard className="h-12 w-12 text-purple-500" />,
      image: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&q=80&w=800",
      color: "bg-purple-500"
    },
    {
      title: t.onboardingStep3Title,
      description: t.onboardingStep3Desc,
      icon: <PlayCircle className="h-12 w-12 text-green-500" />,
      image: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&q=80&w=800",
      color: "bg-green-500"
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-white"
    >
      <div className="absolute top-4 right-4 z-10">
        <button 
          onClick={onComplete}
          className="rounded-full bg-black/10 p-2 text-black/60 backdrop-blur-md hover:bg-black/20"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex h-full flex-col"
          >
            <div className="relative h-1/2 overflow-hidden">
               <img 
                 src={steps[currentStep].image} 
                 className="h-full w-full object-cover" 
                 alt="onboarding" 
                 referrerPolicy="no-referrer"
               />
               <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
            </div>
            
            <div className="flex flex-1 flex-col items-center px-8 pt-8 text-center">
              <div className={cn(
                "mb-6 flex h-20 w-20 items-center justify-center rounded-3xl shadow-xl shadow-opacity-20",
                "bg-white ring-1 ring-gray-100"
              )}>
                {steps[currentStep].icon}
              </div>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">{steps[currentStep].title}</h2>
              <p className="max-w-xs text-sm leading-relaxed text-gray-500">{steps[currentStep].description}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="p-8">
        <div className="mb-8 flex justify-center gap-2">
          {steps.map((_, i) => (
            <div 
              key={i}
              className={cn(
                "h-1.5 transition-all duration-300 rounded-full",
                i === currentStep ? "w-8 bg-black" : "w-1.5 bg-gray-200"
              )}
            />
          ))}
        </div>

        <button 
          onClick={nextStep}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold text-white shadow-xl transition-all active:scale-95",
            steps[currentStep].color
          )}
        >
          {currentStep === steps.length - 1 ? t.getStarted : t.nextStep}
          <ChevronRight size={20} />
        </button>
        
        <button 
          onClick={onComplete}
          className="mt-4 w-full text-center text-sm font-medium text-gray-400"
        >
          {t.skip}
        </button>
      </div>
    </motion.div>
  );
}
