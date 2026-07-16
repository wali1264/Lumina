import React, { useState, useEffect, useRef } from 'react';
import { Play, Maximize2, Minimize2, Sparkles, Code, RefreshCw } from 'lucide-react';

interface AdvancedCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function AdvancedCodeEditor({ value, onChange, disabled }: AdvancedCodeEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [lines, setLines] = useState<number[]>([1]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const lineCount = value.split('\n').length;
    setLines(Array.from({ length: Math.max(1, lineCount) }, (_, i) => i + 1));
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Insert 2 spaces
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);

      // Reset selection position after React update
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const insertSnippet = (snippet: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + snippet);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const newValue = value.substring(0, start) + snippet + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
    }, 0);
  };

  const formatCode = () => {
    try {
      let formatted = value
        .split('\n')
        .map(line => line.trim())
        .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
        .join('\n');
      
      onChange(formatted);
    } catch (e) {
      console.error(e);
    }
  };

  const snippets = [
    {
      label: '✨ دکمه گرادینت',
      code: '<button className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-2xl shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all duration-300">\n  کلیک کنید\n</button>',
    },
    {
      label: '🎨 کارت شیشه‌ای',
      code: '<div className="p-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl shadow-xl">\n  <h3 className="text-lg font-black text-white">عنوان کارت</h3>\n  <p className="text-xs text-white/80 mt-2">توضیحات کوتاه در مورد این بخش...</p>\n</div>',
    },
    {
      label: '🌀 هاور زوم',
      code: 'className="hover:scale-105 hover:rotate-1 active:scale-95 transition-all duration-300 cursor-pointer"',
    },
    {
      label: '💫 سایه رنگی',
      code: 'className="shadow-2xl shadow-indigo-500/30 border border-indigo-500/10"',
    },
  ];

  const previewDoc = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          margin: 0;
          padding: 24px;
          background: #0f172a;
          color: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
      </style>
    </head>
    <body>
      <div id="preview-container" class="w-full flex justify-center items-center">
        \${value.includes('className=') ? value.replace(/className=/g, 'class=') : value}
      </div>
    </body>
    </html>
  `;

  const editorContent = (
    <div className={`flex flex-col bg-slate-950 border-2 border-slate-800 rounded-3xl overflow-hidden shadow-2xl h-full \${isFullscreen ? 'p-4' : ''}`}>
      <div className="flex flex-wrap justify-between items-center bg-slate-900 border-b border-slate-800 p-3 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500" />
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-slate-400 font-mono font-bold mr-2 flex items-center gap-1">
            <Code size={12} className="text-indigo-400" />
            Live_Sandbox.tsx
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={formatCode}
            disabled={disabled}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg transition flex items-center gap-1"
            title="مرتب‌سازی خودکار تگ‌ها"
          >
            <RefreshCw size={10} />
            <span>مرتب‌سازی کد</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition flex items-center gap-1 \${
              showPreview ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Play size={10} />
            <span>پیش‌نمایش زنده: {showPreview ? 'روشن' : 'خاموش'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {!disabled && (
        <div className="bg-slate-900/40 px-3 py-2 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar" dir="rtl">
          <span className="text-[9px] text-indigo-400 font-black flex items-center gap-0.5 shrink-0 ml-1">
            <Sparkles size={10} />
            درج سریع:
          </span>
          {snippets.map((snip, index) => (
            <button
              key={index}
              type="button"
              onClick={() => insertSnippet(snip.code)}
              className="px-2 py-0.5 bg-slate-800/80 hover:bg-indigo-950 hover:text-indigo-300 hover:border-indigo-800/60 text-[9px] text-slate-300 font-bold rounded-md border border-slate-700/50 transition shrink-0"
            >
              {snip.label}
            </button>
          ))}
        </div>
      )}

      <div className={`flex flex-col md:flex-row flex-1 \${isFullscreen ? 'h-[calc(100vh-140px)]' : 'h-96'}`}>
        <div className="flex flex-1 relative bg-[#090d16] border-r border-slate-800 min-h-[160px] md:min-h-0">
          <div className="w-9 bg-[#04060b] text-slate-600 font-mono text-[10px] py-4 text-right pr-2 select-none border-r border-slate-800/30 flex flex-col leading-6">
            {lines.map(num => (
              <span key={num}>{num}</span>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="// کدهای خود را با HTML و کلاس‌های زیبای Tailwind CSS بنویسید..."
            dir="ltr"
            className="flex-1 bg-transparent text-emerald-400 font-mono text-[11px] md:text-xs p-4 focus:outline-none resize-none leading-6 w-full h-full placeholder:text-slate-600 overflow-y-auto selection:bg-indigo-500/30"
          />
        </div>

        {showPreview && (
          <div className="flex-1 bg-slate-900 flex flex-col border-t md:border-t-0 md:border-l border-slate-800 min-h-[160px] md:min-h-0">
            <div className="px-3 py-1 bg-slate-950 text-[8px] text-slate-400 font-black border-b border-slate-800 flex justify-between items-center select-none" dir="rtl">
              <span>🖥️ خروجی زنده مرورگر (Sandboxed)</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="flex-1 bg-[#0f172a] overflow-hidden relative">
              <iframe
                srcDoc={previewDoc}
                title="Live Sandbox Preview"
                sandbox="allow-scripts"
                className="w-full h-full bg-transparent border-none"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-950 px-4 py-2 border-t border-slate-900 flex justify-between items-center text-[9px] text-slate-500 font-bold select-none">
        <span dir="rtl">⌨️ برای ایجاد فاصله از کلید Tab استفاده کنید.</span>
        <span className="font-mono text-emerald-500">Lines: {lines.length}</span>
      </div>
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-lg z-50 flex flex-col p-4 md:p-8 animate-fade-in">
        <div className="flex justify-between items-center mb-3" dir="rtl">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>💻</span>
              <span>محیط کدنویسی تمام‌صفحه پیشرفته</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">بدون حواس‌پرتی روی کدها و استایل‌های خود تمرکز کنید.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition shadow-lg shadow-rose-900/20"
          >
            خروج از تمام‌صفحه
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {editorContent}
        </div>
      </div>
    );
  }

  return editorContent;
}
