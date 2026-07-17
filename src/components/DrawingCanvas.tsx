import React, { useRef, useState, useEffect } from 'react';
import { Trash2, ShieldAlert, Check, Undo } from 'lucide-react';

interface DrawingCanvasProps {
  value: string;
  onChange: (base64: string) => void;
  disabled?: boolean;
}

export default function DrawingCanvas({ value, onChange, disabled }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#10b981'); // Emerald 500
  const [brushSize, setBrushSize] = useState(4);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set high resolution canvas drawing
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;

    // Load initial drawing if any
    if (value && value.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasDrawn(true);
      };
      img.src = value;
    } else {
      // Clear with dark slate 950 bg
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, rect.width, rect.height);
    }
  }, []);

  // Update color and brush size in ctx when state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
  }, [color, brushSize]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x = 0;
    let y = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return;
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x = 0;
    let y = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return;
      // Prevent scrolling when drawing on touch screens
      e.preventDefault();
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveCanvas();
  };

  const saveCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Compress by saving as jpeg with 0.5 quality
    const base64 = canvas.toDataURL('image/jpeg', 0.5);
    onChange(base64);
  };

  const clearCanvas = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
    onChange('');
  };

  return (
    <div className="flex flex-col space-y-3 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-2 rounded-lg">
        {/* Colors */}
        <div className="flex items-center space-x-2 space-x-reverse">
          <span className="text-xs text-slate-400 ml-1">قلم:</span>
          {['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#ffffff'].map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                color === c ? 'border-emerald-400 scale-110 shadow-sm shadow-emerald-400/50' : 'border-transparent hover:scale-105'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Thickness */}
        <div className="flex items-center space-x-2 space-x-reverse">
          <span className="text-xs text-slate-400 ml-1">ضخامت:</span>
          <input
            type="range"
            min="1"
            max="12"
            value={brushSize}
            disabled={disabled}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <span className="text-xs font-mono text-slate-300 w-4 text-center">{brushSize}px</span>
        </div>

        {/* Action */}
        <button
          type="button"
          disabled={disabled}
          onClick={clearCanvas}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={14} />
          <span>پاک کردن بوم</span>
        </button>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
        />

        {!hasDrawn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none select-none p-4 text-center">
            <ShieldAlert size={36} className="text-slate-600 mb-2" />
            <p className="text-sm font-medium">طرح خود را با انگشت یا ماوس روی این کادر بکشید</p>
            <p className="text-xs mt-1 text-slate-600">شبیه‌ساز دفترچه یادداشت جهت یادگیری و تفکر بصری</p>
          </div>
        )}
      </div>

      {hasDrawn && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
          <Check size={14} />
          <span>طرح شما به عنوان پاسخ ذخیره شد (فایل تصویر PNG)</span>
        </div>
      )}
    </div>
  );
}
