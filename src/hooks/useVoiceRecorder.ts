import { useState, useRef } from 'react';

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const startRecording = async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.');
        return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      return true;
    } catch (err) {
      console.error('Error starting audio recording:', err);
      alert('دسترسی به میکروفون صادر نشد یا میکروفون در دسترس نیست.');
      return false;
    }
  };

  const stopRecording = (): Promise<{ base64: string; duration: number } | null> => {
    return new Promise((resolve) => {
      if (timerRef.current) clearInterval(timerRef.current);

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        setIsRecording(false);
        resolve(null);
        return;
      }

      const duration = recordingSeconds;

      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setIsRecording(false);
          setRecordingSeconds(0);
          resolve({ base64: reader.result as string, duration });
        };
        reader.onerror = () => {
          setIsRecording(false);
          setRecordingSeconds(0);
          resolve(null);
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.stop();
    });
  };

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
      };
      recorder.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  return {
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
    cancelRecording
  };
}
