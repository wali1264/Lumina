import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, RefreshCw, Check, AlertCircle, X } from 'lucide-react';

interface NotebookCameraCaptureProps {
  value: string; // Base64 image
  onChange: (base64: string) => void;
  disabled?: boolean;
}

export default function NotebookCameraCapture({ value, onChange, disabled }: NotebookCameraCaptureProps) {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error(err);
      setCameraError('دسترسی به دوربین قطع است یا سیستم دوربین یافت نشد. لطفاً از دکمه آپلود فایل یا تایید دسترسی مرورگر استفاده کنید.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        onChange(base64);
        stopCamera();
      }
    } catch (err) {
      console.error(err);
      alert('خطا در گرفتن عکس از دوربین. لطفاً مجدداً تلاش کنید.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('حداکثر حجم تصویر آپلود شده ۵ مگابایت است.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onChange(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
            <span>📷</span>
            <span>تصویر واقعی از دفترچه تکالیف</span>
          </h4>
          <p className="text-[9px] text-slate-500 font-semibold mt-0.5">پاسخ یا طرح خود را در دفترچه بنویسید و عکاسی کرده یا تصویر را ارسال کنید.</p>
        </div>

        {value && (
          <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded-lg border border-emerald-200 flex items-center gap-1">
            <Check size={10} />
            تصویر ثبت شد
          </span>
        )}
      </div>

      <div className="relative border-2 border-dashed border-slate-200 bg-white rounded-2xl overflow-hidden min-h-[220px] flex flex-col items-center justify-center p-4">
        {isCameraActive ? (
          <div className="w-full max-w-md flex flex-col items-center space-y-3">
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-4 border-2 border-dashed border-indigo-400/40 rounded-lg pointer-events-none flex items-center justify-center">
                <span className="bg-black/60 text-[9px] text-indigo-300 font-bold px-2 py-0.5 rounded-full">دفترچه خود را در این کادر تنظیم کنید</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={capturePhoto}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center gap-1 shadow-md shadow-indigo-200"
              >
                <Camera size={13} />
                <span>گرفتن عکس</span>
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black rounded-xl transition"
              >
                انصراف
              </button>
            </div>
          </div>
        ) : value ? (
          <div className="w-full max-w-md flex flex-col items-center space-y-3">
            <div className="relative w-full aspect-video bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
              <img src={value} className="w-full h-full object-contain" alt="دفترچه تکلیف" />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="absolute top-2 left-2 bg-rose-600 text-white p-1 hover:bg-rose-700 rounded-lg shadow-md"
                  title="حذف تصویر"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {!disabled && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black rounded-lg transition flex items-center gap-1"
                >
                  <RefreshCw size={10} />
                  <span>عکاسی دوباره</span>
                </button>
                <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black rounded-lg cursor-pointer transition flex items-center gap-1">
                  📸 انتخاب فایل دیگر
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
              <Camera size={24} />
            </div>

            <div>
              <p className="text-xs font-black text-slate-700">روش عکس‌برداری را انتخاب کنید</p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">می‌توانید به صورت مستقیم با دوربین عکاسی کنید یا فایل آپلود کنید</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
              <button
                type="button"
                disabled={disabled}
                onClick={startCamera}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center gap-1.5 justify-center shadow-md shadow-indigo-100 disabled:opacity-50"
              >
                <Camera size={14} />
                <span>شروع دوربین سیستم</span>
              </button>

              <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl cursor-pointer transition flex items-center gap-1.5 justify-center">
                📂 آپلود از گالری/فایل
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={disabled}
                />
              </label>
            </div>
          </div>
        )}

        {cameraError && (
          <div className="absolute bottom-2 left-2 right-2 bg-amber-50 border border-amber-200 p-2 rounded-xl text-[9px] text-amber-900 font-bold flex items-start gap-1.5">
            <AlertCircle size={12} className="text-amber-600 shrink-0 mt-0.5" />
            <span>{cameraError}</span>
          </div>
        )}
      </div>

      <div className="bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100/50 text-[10px] text-indigo-950 font-bold leading-relaxed">
        💡 <strong>نکته کلاسی:</strong> در صورتی که از گوشی موبایل استفاده می‌کنید، با زدن دکمه <strong>آپلود از گالری/فایل</strong> دوربین پشتی گوشی به صورت مستقیم باز شده و می‌توانید زیباترین زاویه را عکاسی کنید.
      </div>
    </div>
  );
}
