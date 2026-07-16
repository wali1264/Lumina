import { useState, useEffect, useRef } from 'react';
import { Mic, Square, Play, Pause, RefreshCw, Volume2, Check } from 'lucide-react';

interface AudioRecorderProps {
  value: string;
  onChange: (base64: string) => void;
  disabled?: boolean;
}

export default function AudioRecorder({ value, onChange, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animationRef = useRef<number | null>(null);

  // Generate dynamic waveform values for aesthetics during recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
        setWaveform((prev) => {
          const next = [...prev];
          if (next.length > 25) next.shift();
          next.push(Math.floor(Math.random() * 80) + 10);
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const startRecording = () => {
    setIsRecording(true);
    setDuration(0);
    setWaveform(Array.from({ length: 20 }, () => Math.floor(Math.random() * 40) + 10));
    onChange('');
  };

  const stopRecording = () => {
    setIsRecording(false);
    // Simulate audio base64 payload
    onChange('data:audio/mp3;base64,SIMULATED_AUDIO_DATA_FOR_SUBMISSION');
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const resetRecording = () => {
    setIsRecording(false);
    setIsPlaying(false);
    setDuration(0);
    setWaveform([]);
    onChange('');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex flex-col space-y-3 bg-slate-50 border border-slate-200 p-4 rounded-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
          <Volume2 size={14} className="text-slate-400" />
          توضیح صوتی جواب
        </span>
        {duration > 0 && (
          <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-200/80 px-2.5 py-0.5 rounded-full">
            {formatTime(duration)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center py-6 bg-white rounded-lg border border-slate-200 shadow-sm relative overflow-hidden min-h-[100px]">
        {isRecording ? (
          <div className="flex flex-col items-center space-y-3 w-full">
            <div className="flex items-end justify-center gap-1 h-12 px-8 w-full max-w-xs">
              {waveform.map((height, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-rose-500 rounded-full transition-all duration-300"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <p className="text-xs text-rose-500 font-medium animate-pulse flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-600 block pulsing-indicator"></span>
              در حال ضبط صدای شما...
            </p>
          </div>
        ) : value ? (
          <div className="flex flex-col items-center space-y-2 w-full">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition"
              >
                {isPlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} className="mr-0.5" fill="currentColor" />}
              </button>
              <div className="flex items-center gap-0.5 h-6">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all ${
                      isPlaying && i % 3 === 0 ? 'bg-emerald-500 h-5' : 'bg-slate-300 h-3'
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500 font-medium">پخش صدای ضبط شده</p>
          </div>
        ) : (
          <div className="text-center">
            <Mic size={28} className="text-slate-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500">برای شروع توضیح صوتی دکمه ضبط را بزنید</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        {!value && !isRecording && (
          <button
            type="button"
            disabled={disabled}
            onClick={startRecording}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full text-sm font-semibold shadow-md shadow-rose-600/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100"
          >
            <Mic size={16} />
            شروع ضبط
          </button>
        )}

        {isRecording && (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-full text-sm font-semibold shadow-md transition-all hover:scale-105 active:scale-95"
          >
            <Square size={16} />
            توقف و ذخیره
          </button>
        )}

        {value && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={resetRecording}
              className="flex items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-full text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} />
              ضبط مجدد
            </button>
          </div>
        )}
      </div>

      {value && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold justify-center">
          <Check size={14} />
          <span>فایل صوتی با موفقیت آماده ارسال شد</span>
        </div>
      )}
    </div>
  );
}
