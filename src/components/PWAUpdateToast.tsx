import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

export default function PWAUpdateToast() {
  const [show, setShow] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handleUpdateAvailable = (event: any) => {
      console.log('[PWAUpdateToast] Update available event caught!');
      if (event.detail && event.detail.registration) {
        setRegistration(event.detail.registration);
        setShow(true);
      }
    };

    window.addEventListener('pwa-update-available', handleUpdateAvailable);
    
    // Check if there's already a waiting service worker on mount
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          setRegistration(reg);
          setShow(true);
        }
      });
    }

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdateAvailable);
    };
  }, []);

  const handleApplyUpdate = () => {
    if (registration && registration.waiting) {
      console.log('[PWAUpdateToast] Sending SKIP_WAITING to waiting Service Worker...');
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  const handleClose = () => {
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 left-6 md:left-auto md:w-[420px] bg-slate-900/95 backdrop-blur-md border border-slate-800 text-white p-5 rounded-2xl shadow-2xl z-[9999] flex flex-col gap-4 font-sans"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/20">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">بروزرسانی جدید در دسترس است</h4>
                <p className="text-xs text-indigo-300 font-medium mt-0.5">آکادمی هوشمند لومینا</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-slate-300 leading-relaxed">
            نسخه جدیدی از سامانه با ویژگی‌های پیشرفته‌تر، بهبود عملکرد و رفع مشکلات گزارش‌شده در پس‌زمینه با موفقیت دانلود شده است. برای اعمال تغییرات و لود سریع نسخه جدید، لطفا دکمه زیر را کلیک کنید.
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2.5 mt-1">
            <button
              onClick={handleApplyUpdate}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white py-2 px-4 rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all duration-200 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>راه‌اندازی مجدد و اعمال بروزرسانی</span>
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition cursor-pointer"
            >
              بعداً
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
