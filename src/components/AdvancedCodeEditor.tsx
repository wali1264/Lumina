import React, { useState, useRef } from 'react';
import { 
  Code, 
  ExternalLink, 
  Upload, 
  CheckCircle2, 
  Trash2, 
  Download, 
  Info,
  FileArchive
} from 'lucide-react';

interface AdvancedCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface ZipMetadata {
  fileName: string;
  fileSize: string;
  base64: string;
}

export default function AdvancedCodeEditor({ value, onChange, disabled }: AdvancedCodeEditorProps) {
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse custom Zip metadata JSON if available
  let zipData: ZipMetadata | null = null;
  let isLegacyText = false;

  if (value) {
    if (value.startsWith('{')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && parsed.base64) {
          zipData = parsed as ZipMetadata;
        }
      } catch (e) {
        isLegacyText = true;
      }
    } else if (value.trim() !== '') {
      isLegacyText = true;
    }
  }

  // Handle Drag Events for Upload
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    setErrorMsg('');
    
    const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
    if (!isZip) {
      setErrorMsg('لطفاً فقط فایل فشرده با پسوند ZIP. آپلود کنید.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('حجم فایل نباید بیشتر از ۲۵ مگابایت باشد.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result && typeof event.target.result === 'string') {
        let sizeStr = '';
        if (file.size < 1024) {
          sizeStr = `${file.size} B`;
        } else if (file.size < 1024 * 1024) {
          sizeStr = `${(file.size / 1024).toFixed(1)} KB`;
        } else {
          sizeStr = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
        }

        const metadata: ZipMetadata = {
          fileName: file.name,
          fileSize: sizeStr,
          base64: event.target.result
        };

        onChange(JSON.stringify(metadata));
      } else {
        setErrorMsg('خطا در خواندن فایل. مجدداً تلاش کنید.');
      }
    };
    reader.onerror = () => {
      setErrorMsg('خطا در بارگذاری فایل.');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    if (disabled) return;
    onChange('');
    setErrorMsg('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const triggerVSCodeOpen = () => {
    window.location.href = 'vscode://';
  };

  const downloadUploadedFile = () => {
    if (!zipData) return;
    const link = document.createElement('a');
    link.href = zipData.base64;
    link.download = zipData.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full bg-slate-50/80 border border-slate-200/90 rounded-3xl p-5 space-y-4 text-right shadow-2xs" dir="rtl">
      
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          <Code className="text-indigo-600 h-5 w-5" />
          <span className="text-sm font-black text-slate-900">حل چالش برنامه‌نویسی در VS Code</span>
        </div>
        <span className="text-[10px] text-indigo-700 bg-indigo-100/70 border border-indigo-200/60 font-mono font-bold px-2 py-0.5 rounded-lg">VS Code Integration</span>
      </div>

      {/* Main Interactive Controls Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        {/* Button 1: Open Local VS Code */}
        <button
          type="button"
          onClick={triggerVSCodeOpen}
          className="flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all duration-200 active:scale-95 shadow-md shadow-indigo-200 cursor-pointer"
        >
          <ExternalLink size={14} />
          <span>ورود و باز کردن VS Code</span>
        </button>

        {/* Button 2 / File Upload Area */}
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className="relative"
        >
          <input
            ref={fileInputRef}
            type="file"
            id="zip-uploader"
            accept=".zip"
            disabled={disabled}
            onChange={handleChange}
            className="hidden"
          />

          {zipData ? (
            /* Uploaded State - Compact Light Design */
            <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <div className="min-w-0 text-right">
                  <span className="block text-[11px] font-black text-slate-900 truncate max-w-[120px]" dir="ltr">
                    {zipData.fileName}
                  </span>
                  <span className="block text-[9px] text-slate-500 font-mono font-bold">{zipData.fileSize}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={downloadUploadedFile}
                  className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition shadow-2xs cursor-pointer"
                  title="دانلود و بررسی فایل"
                >
                  <Download size={13} />
                </button>
                {!disabled && (
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition border border-rose-200 cursor-pointer"
                    title="حذف فایل"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Standard Upload Action Button - Light */
            <button
              type="button"
              onClick={triggerFileInput}
              disabled={disabled}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed transition-all duration-200 text-xs font-black cursor-pointer ${
                dragActive 
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-inner' 
                  : 'border-indigo-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/50 text-indigo-900 shadow-2xs'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Upload size={14} className="text-indigo-600" />
              <span>{dragActive ? 'فایل را رها کنید' : 'آپلود فایل پاسخ (ZIP)'}</span>
            </button>
          )}
        </div>

      </div>

      {errorMsg && (
        <p className="text-[10px] text-rose-600 font-bold text-center animate-pulse bg-rose-50 p-2 rounded-xl border border-rose-200">
          {errorMsg}
        </p>
      )}

      {/* Legacy Text Answer Warning (Fallback check) */}
      {isLegacyText && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-right">
          <p className="text-[10px] text-amber-800 font-bold leading-relaxed">
            ⚠️ یک پاسخ متنی قدیمی ثبت شده است. آپلود فایل ZIP جدید، جایگزین پاسخ قدیمی خواهد شد.
          </p>
        </div>
      )}

      {/* Single Clean Installation Link Footer */}
      <div className="flex items-center gap-1.5 justify-start text-[10px] text-slate-500 border-t border-slate-200/80 pt-2.5">
        <Info size={13} className="text-indigo-500 shrink-0" />
        <span className="font-bold">نرم‌افزار VS Code را نصب ندارید؟</span>
        <a 
          href="https://code.visualstudio.com/Download" 
          target="_blank" 
          rel="noreferrer" 
          className="text-indigo-600 hover:text-indigo-800 hover:underline transition font-black"
        >
          دریافت و نصب رایگان از سایت رسمی
        </a>
      </div>

    </div>
  );
}
