import React, { useState, useEffect } from 'react';
import { Database, Check, Loader2, Wifi, WifiOff } from 'lucide-react';

interface DbSyncIndicatorProps {
  isLoading: boolean;
  isLoaded: boolean;
  isHeaderInline?: boolean;
}

export default function DbSyncIndicator({ isLoading, isLoaded, isHeaderInline = false }: DbSyncIndicatorProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      setStatus('loading');
    } else if (isLoaded) {
      setStatus('success');
      // Set to idle after 4 seconds
      const timer = setTimeout(() => {
        setStatus('idle');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isLoaded]);

  // Determine styles and content based on status
  let bgClass = 'bg-white/90 text-slate-700 border-slate-200/80 hover:bg-slate-50';
  let dotClass = 'bg-slate-400';
  let icon = <Database size={13} className="text-slate-500" />;
  let label = 'بروزرسانی';

  if (!isOnline) {
    bgClass = 'bg-rose-50/95 text-rose-700 border-rose-200 shadow-rose-100/50';
    dotClass = 'bg-rose-500 animate-ping';
    icon = <WifiOff size={13} className="text-rose-600 animate-pulse" />;
    label = 'آفلاین (عدم اتصال)';
  } else if (status === 'loading') {
    bgClass = 'bg-indigo-50/95 text-indigo-700 border-indigo-200 shadow-indigo-100/50';
    dotClass = 'bg-indigo-500 animate-ping';
    icon = <Loader2 size={13} className="text-indigo-600 animate-spin" />;
    label = 'در حال دریافت اطلاعات از پایگاه داده...';
  } else if (status === 'success') {
    bgClass = 'bg-emerald-50/95 text-emerald-800 border-emerald-200 shadow-emerald-100/50';
    dotClass = 'bg-emerald-500';
    icon = <Check size={13} className="text-emerald-600 stroke-[3]" />;
    label = 'بروزرسانی پایگاه داده تکمیل شد';
  } else {
    // idle / connected
    bgClass = 'bg-slate-900/90 text-slate-100 border-slate-800 hover:bg-slate-900';
    dotClass = 'bg-emerald-400 shadow-sm shadow-emerald-400/50';
    icon = <Database size={13} className="text-emerald-400" />;
    label = 'پایگاه داده آنلاین';
  }

  return (
    <div 
      className={isHeaderInline 
        ? `flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-sm shadow-sm transition-all duration-300 cursor-pointer select-none font-sans text-[10px] md:text-xs font-bold ${bgClass}`
        : `fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-2xl border backdrop-blur-md shadow-lg transition-all duration-300 cursor-pointer select-none font-sans text-[10px] md:text-xs font-bold ${bgClass}`
      }
      dir="rtl"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onClick={() => {
        setIsExpanded(!isExpanded);
        // Toast style flash
      }}
      id="db-sync-indicator-container"
    >
      <div className="relative flex items-center justify-center">
        {icon}
        <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${dotClass}`} />
      </div>

      {/* Text block */}
      <div className="flex items-center gap-1.5 overflow-hidden transition-all duration-300">
        {(status === 'loading' || status === 'success' || !isOnline || isExpanded) ? (
          <span className="whitespace-nowrap transition-all duration-300 animate-fade-in">
            {label}
          </span>
        ) : (
          <span className="whitespace-nowrap text-[9px] text-slate-400 font-medium transition-all duration-300">
            پایگاه داده
          </span>
        )}

        {isExpanded && isOnline && status === 'idle' && (
          <span className="text-[9px] text-emerald-400 font-medium border-r border-slate-700 pr-1.5 mr-0.5 whitespace-nowrap">
            ارتباط امن و پایدار
          </span>
        )}
      </div>
    </div>
  );
}
