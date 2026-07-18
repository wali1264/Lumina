import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  BookOpen, Sparkles, Send, Volume2, Mic, AlertTriangle, CheckCircle2, Award,
  Clock, Check, X, ShieldAlert, BookMarked, Eye, LayoutGrid, Image as ImageIcon,
  Flame, HelpCircle, FileText, Code, ArrowLeft, ChevronLeft, ChevronRight, Bell,
  VolumeX, Youtube, Tv, Download, GraduationCap, CheckSquare, Paperclip, File, Trash2, Star,
  RotateCw, MessageSquare, ZoomIn, ZoomOut, Maximize2, Minimize2
} from 'lucide-react';
import { User as UserType, Lesson, Submission, Question, ChatMessage, AnswerType, Course, CourseEnrollment, LessonImage, DirectMessage, Rating } from '../types';
import DrawingCanvas from './DrawingCanvas';
import AudioRecorder from './AudioRecorder';
import AdvancedCodeEditor from './AdvancedCodeEditor';
import NotebookCameraCapture from './NotebookCameraCapture';
import DbSyncIndicator from './DbSyncIndicator';

interface StudentPanelProps {
  currentUser: UserType;
  users: UserType[];
  courses: Course[];
  lessons: Lesson[];
  submissions: Submission[];
  enrollments: CourseEnrollment[];
  directMessages: DirectMessage[];
  ratings?: Rating[];
  onSendDirectMessage: (newMsg: DirectMessage) => void;
  onEnrollStudent: (courseId: string, studentId: string, studentName: string) => void;
  onAddSubmission: (newSub: Submission) => void;
  onAddRating?: (rating: Rating) => void;
  onLogout: () => void;
  isLoadingDb?: boolean;
  isDbLoaded?: boolean;
}

const getYoutubeEmbedUrl = (url: string) => {
  try {
    let videoId = '';
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('youtube.com/watch')) {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      videoId = urlParams.get('v') || '';
    } else if (url.includes('youtube.com/embed/')) {
      videoId = url.split('youtube.com/embed/')[1].split('?')[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
};

const dataURIToBlob = (dataURI: string) => {
  try {
    const parts = dataURI.split(',');
    if (parts.length < 2) return null;
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  } catch (e) {
    console.error("Error converting dataURI to Blob", e);
    return null;
  }
};

export default function StudentPanel({
  currentUser,
  users,
  courses,
  lessons,
  submissions,
  enrollments,
  directMessages,
  ratings = [],
  onSendDirectMessage,
  onEnrollStudent,
  onAddSubmission,
  onAddRating,
  onLogout,
  isLoadingDb = false,
  isDbLoaded = false
}: StudentPanelProps) {
  
  // Get active lessons belonging to the student's baseline level
  const studentLevel = currentUser.level || 'beginner';

  // States
  const [dailyLimitError, setDailyLimitError] = useState<string>('');

  const [activeCourseId, setActiveCourseId] = useState<string | null>(() => {
    // Default to the first course student is accepted to matching studentLevel
    const myAccepted = enrollments.filter(e => {
      if (e.studentId !== currentUser.id || e.status !== 'accepted') return false;
      const course = courses.find(c => c.id === e.courseId);
      return course?.level === studentLevel;
    });
    return myAccepted[0]?.courseId || null;
  });

  // Keep active course level synchronized with studentLevel
  useEffect(() => {
    const myAccepted = enrollments.filter(e => {
      if (e.studentId !== currentUser.id || e.status !== 'accepted') return false;
      const course = courses.find(c => c.id === e.courseId);
      return course?.level === studentLevel;
    });
    const currentActiveCourse = courses.find(c => c.id === activeCourseId);
    if (!currentActiveCourse || currentActiveCourse.level !== studentLevel) {
      setActiveCourseId(myAccepted[0]?.courseId || null);
    }
  }, [studentLevel, enrollments, courses, currentUser.id, activeCourseId]);

  const myLevelLessons = (activeCourseId 
    ? lessons.filter(l => l.courseId === activeCourseId)
    : []
  ).sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  const [selectedLessonId, setSelectedLessonId] = useState<string>(myLevelLessons[0]?.id || 'l1');

  // Keep selected lesson within the active course when activeCourseId changes
  useEffect(() => {
    if (activeCourseId) {
      const courseLessons = lessons
        .filter(l => l.courseId === activeCourseId)
        .sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      if (courseLessons.length > 0) {
        const isCurrentInCourse = courseLessons.some(l => l.id === selectedLessonId);
        if (!isCurrentInCourse) {
          setSelectedLessonId(courseLessons[0].id);
        }
      }
    }
  }, [activeCourseId, lessons, selectedLessonId]);
  const [studentTab, setStudentTab] = useState<'lessons' | 'chat'>('lessons');
  const [activeLessonTab, setActiveLessonTab] = useState<'textbook' | 'challenges' | 'teacher_chat'>('textbook');
  const [showDashboard, setShowDashboard] = useState(true);
  const [showTeacherText, setShowTeacherText] = useState(false);
  const [isTextbookFullscreen, setIsTextbookFullscreen] = useState(false);
  const [textbookZoomLevel, setTextbookZoomLevel] = useState(100);

  // Star Rating system states
  const [ratingModalCourse, setRatingModalCourse] = useState<Course | null>(null);
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');

  const handleRatingSubmit = () => {
    if (!ratingModalCourse || !onAddRating) return;
    const newRating: Rating = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Math.floor(Math.random() * 10000000)),
      studentId: currentUser.id,
      studentName: currentUser.name,
      courseId: ratingModalCourse.id,
      teacherId: ratingModalCourse.teacherId,
      rating: ratingStars,
      comment: ratingComment,
      createdAt: new Date().toISOString()
    };
    onAddRating(newRating);
    setRatingModalCourse(null);
    setRatingComment('');
    setRatingStars(5);
  };

  // Supplementary resource modals
  const [isAudioListModalOpen, setIsAudioListModalOpen] = useState(false);

  // --- Socratic AI Mentor "Vardak" (Little Duck) States & Logic ---
  const [vardakState, setVardakState] = useState<'idle' | 'selecting' | 'processing' | 'answering'>('idle');
  const [capturedText, setCapturedText] = useState('');
  const [vardakResult, setVardakResult] = useState<any | null>(null);
  const [isVardakModalOpen, setIsVardakModalOpen] = useState(false);
  const [revealedHints, setRevealedHints] = useState<number[]>([]);
  const [vardakModalPos, setVardakModalPos] = useState({ x: 150, y: 150 });
  const [vardakModalSize, setVardakModalSize] = useState({ w: 430, h: 540 });
  const [isVardakError, setIsVardakError] = useState('');
  
  // Custom Socratic Direct Chat States
  const [isVardakDropdownOpen, setIsVardakDropdownOpen] = useState(false);
  const [isVardakChatOpen, setIsVardakChatOpen] = useState(false);
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);
  const [vardakChatMessages, setVardakChatMessages] = useState<{
    sender: 'user' | 'vardak';
    text: string;
    emotion?: string;
    image?: string;
    audioUrl?: string;
    pdf?: { name: string; size: string; url: string };
  }[]>([
    { sender: 'vardak', text: 'سلام دوست خوبم! من مربی راهنمای تو هستم. هر کجای درس رو متوجه نشدی یا سوالی داری بگو تا با هم گام‌به‌گام بررسی کنیم و یادش بگیریم! 😊', emotion: '💡' }
  ]);
  const [vardakChatInput, setVardakChatInput] = useState('');
  const [isVardakChatLoading, setIsVardakChatLoading] = useState(false);
  
  // WhatsApp-like attachment states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{
    type: 'image' | 'audio' | 'pdf';
    file: File;
    previewUrl: string;
  } | null>(null);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string>('');

  // Text selection tracking
  const [selectedText, setSelectedText] = useState('');
  const [selectedTextRect, setSelectedTextRect] = useState<{ x: number; y: number } | null>(null);

  const [isVardakModalDragging, setIsVardakModalDragging] = useState(false);
  const [isVardakModalResizing, setIsVardakModalResizing] = useState(false);
  const [isVardakChatDragging, setIsVardakChatDragging] = useState(false);
  const [isGuidanceFullscreen, setIsGuidanceFullscreen] = useState(false);
  const [guidanceZoom, setGuidanceZoom] = useState(100);
  const [vardakChatPos, setVardakChatPos] = useState({
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 440) : 800,
    y: 120
  });
  
  const vardakDragStart = useRef({ x: 0, y: 0 });
  const vardakChatDragStart = useRef({ x: 0, y: 0 });
  const vardakResizeStart = useRef({ w: 0, h: 0, x: 0, y: 0 });
  const nestRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const flyBackToNest = () => {
    setVardakState('idle');
    setIsVardakModalOpen(false);
    setSelectedText('');
    setSelectedTextRect(null);
  };

  // Listen for textbook selections when Socratic Text Explainer is active (selecting mode)
  useEffect(() => {
    const handleSelection = () => {
      if (vardakState !== 'selecting') {
        setSelectedText('');
        setSelectedTextRect(null);
        return;
      }
      
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';
      
      if (text.length > 3) {
        setSelectedText(text);
        
        try {
          const range = selection?.getRangeAt(0);
          if (range) {
            const rects = range.getClientRects();
            if (rects.length > 0) {
              const lastRect = rects[rects.length - 1];
              // Position floating button near mouse selection end
              setSelectedTextRect({
                x: Math.min(window.innerWidth - 180, lastRect.right + window.scrollX - 50),
                y: lastRect.bottom + window.scrollY + 10
              });
            }
          }
        } catch (e) {
          setSelectedTextRect({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        }
      } else {
        setSelectedText('');
        setSelectedTextRect(null);
      }
    };

    document.addEventListener('selectionchange', handleSelection);
    return () => {
      document.removeEventListener('selectionchange', handleSelection);
    };
  }, [vardakState]);

  // Trigger file upload from attachment menu
  const triggerAttachment = (type: 'image' | 'audio' | 'pdf') => {
    setIsAttachmentMenuOpen(false);
    setAttachmentError('');
    if (fileInputRef.current) {
      if (type === 'image') fileInputRef.current.accept = "image/*";
      else if (type === 'audio') fileInputRef.current.accept = "audio/*";
      else if (type === 'pdf') fileInputRef.current.accept = ".pdf";
      fileInputRef.current.click();
    }
  };

  const handleFileAttached = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
      setAttachmentError('فایل‌های ویدیویی پشتیبانی نمی‌شوند. لطفاً تصویر، فایل صوتی یا سند PDF ارسال کنید.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError('حجم فایل بسیار زیاد است (حداکثر 10 مگابایت).');
      return;
    }

    let type: 'image' | 'audio' | 'pdf' = 'image';
    if (file.type.startsWith('image/')) {
      type = 'image';
    } else if (file.type.startsWith('audio/')) {
      type = 'audio';
    } else if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      type = 'pdf';
    } else {
      setAttachmentError('فرمت فایل پشتیبانی نمی‌شود. لطفاً تصویر، فایل صوتی یا سند PDF انتخاب کنید.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPendingAttachment({
        type,
        file,
        previewUrl: reader.result as string
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handle direct Socratic chat API call
  const sendVardakChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!vardakChatInput.trim() && !pendingAttachment) || isVardakChatLoading) return;

    const userMsg = vardakChatInput.trim();
    setVardakChatInput('');
    setAttachmentError('');

    const newMsg: any = { sender: 'user', text: userMsg };
    if (pendingAttachment) {
      if (pendingAttachment.type === 'image') {
        newMsg.image = pendingAttachment.previewUrl;
      } else if (pendingAttachment.type === 'audio') {
        newMsg.audioUrl = pendingAttachment.previewUrl;
      } else if (pendingAttachment.type === 'pdf') {
        newMsg.pdf = {
          name: pendingAttachment.file.name,
          size: `${(pendingAttachment.file.size / (1024 * 1024)).toFixed(2)} MB`,
          url: '#'
        };
      }
    }

    setVardakChatMessages(prev => [...prev, newMsg]);
    setIsVardakChatLoading(true);

    const attachmentTypeToSend = pendingAttachment?.type;
    const attachmentNameToSend = pendingAttachment?.file.name;
    setPendingAttachment(null);

    try {
      let finalMessage = userMsg;
      if (attachmentTypeToSend) {
        finalMessage += `\n[توضیح پیوست: دانش‌آموز یک فایل ${attachmentTypeToSend} به نام "${attachmentNameToSend || 'فایل'}" آپلود کرده است. مربی سقراطی باید متناسب با اصول آموزشی رفتار کند]`;
      }

      const cleanHistory = vardakChatMessages.slice(-8).map(h => ({
        sender: h.sender,
        text: h.text + (h.image ? ' [تصویر ضمیمه]' : '') + (h.audioUrl ? ' [فایل صوتی ضمیمه]' : '') + (h.pdf ? ' [فایل PDF ضمیمه]' : '')
      }));

      const response = await fetch('/api/ai/vardak-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: finalMessage,
          history: cleanHistory,
          lessonTitle: activeLesson?.title || '',
          lessonContent: (showTeacherText ? activeLesson?.teacherText : activeLesson?.content) || '',
          studentLevel: currentUser?.level || 'beginner'
        })
      });

      if (!response.ok) {
        throw new Error('خطا در ارتباط با سرور مربی.');
      }

      const data = await response.json();
      const mentorMsg: any = { sender: 'vardak', text: data.reply, emotion: data.emotion || '💡' };

      const userMsgLower = userMsg.toLowerCase();
      if (userMsgLower.includes('جزوه') || userMsgLower.includes('pdf') || userMsgLower.includes('فایل')) {
        mentorMsg.pdf = {
          name: 'تکنیک‌های عملی توازن و کنتراست بصری در طراحی - مربی راهنما.pdf',
          size: '1.2 MB',
          url: '#'
        };
      } else if (userMsgLower.includes('صدا') || userMsgLower.includes('پادکست') || userMsgLower.includes('توضیح صوتی')) {
        mentorMsg.audioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      } else if (userMsgLower.includes('عکس') || userMsgLower.includes('نمونه') || userMsgLower.includes('طرح')) {
        mentorMsg.image = 'https://images.unsplash.com/photo-1541462608141-27b2c74530a3?auto=format&fit=crop&w=600&q=80';
      }

      setVardakChatMessages(prev => [...prev, mentorMsg]);
    } catch (err) {
      console.error("Vardak chat error:", err);
      setVardakChatMessages(prev => [...prev, {
        sender: 'vardak',
        text: 'دوست خوبم، ارتباط من با کائنات لومینا کمی کند شده. می‌تونی سوالت رو یک بار دیگه تکرار کنی؟ 😊',
        emotion: '💡'
      }]);
    } finally {
      setIsVardakChatLoading(false);
    }
  };

  // Scroll chat window to bottom
  useEffect(() => {
    if (isVardakChatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [vardakChatMessages, isVardakChatOpen]);

  // Dragging & Resizing modal handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isVardakModalDragging) {
        setVardakModalPos({
          x: e.clientX - vardakDragStart.current.x,
          y: e.clientY - vardakDragStart.current.y
        });
      }
      if (isVardakChatDragging) {
        setVardakChatPos({
          x: e.clientX - vardakChatDragStart.current.x,
          y: e.clientY - vardakChatDragStart.current.y
        });
      }
      if (isVardakModalResizing) {
        const dw = e.clientX - vardakResizeStart.current.x;
        const dh = e.clientY - vardakResizeStart.current.y;
        setVardakModalSize({
          w: Math.max(340, vardakResizeStart.current.w - dw), // drag left to expand in RTL
          h: Math.max(300, vardakResizeStart.current.h + dh)
        });
      }
    };

    const handleMouseUp = () => {
      setIsVardakModalDragging(false);
      setIsVardakChatDragging(false);
      setIsVardakModalResizing(false);
    };

    if (isVardakModalDragging || isVardakChatDragging || isVardakModalResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isVardakModalDragging, isVardakChatDragging, isVardakModalResizing]);

  const handleVardakProcess = async (text: string, x?: number, y?: number) => {
    if (!text || text.trim().length === 0) {
      flyBackToNest();
      return;
    }

    setCapturedText(text);
    setVardakState('processing');
    setIsVardakError('');
    setRevealedHints([]);

    try {
      const response = await fetch('/api/ai/vardak-mentor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selectedText: text,
          lessonTitle: activeLesson?.title || '',
          lessonContent: (showTeacherText ? activeLesson?.teacherText : activeLesson?.content) || '',
          studentLevel: currentUser?.level || 'beginner'
        })
      });

      if (!response.ok) {
        throw new Error('سیستم مربی سقراطی موقتاً در دسترس نیست.');
      }

      const data = await response.json();
      setVardakResult(data);
      
      const modalX = x ? Math.min(window.innerWidth - 450, Math.max(20, x - 210)) : Math.max(50, window.innerWidth - 480);
      const modalY = y ? Math.min(window.innerHeight - 560, Math.max(50, y - 100)) : 150;
      setVardakModalPos({ x: modalX, y: modalY });
      setIsVardakModalOpen(true);
      setVardakState('answering');
    } catch (err: any) {
      console.error("Vardak mentor API error:", err);
      setVardakResult({
        emotion: '🦆',
        concept: 'ابهام در درک بخش انتخاب‌شده',
        message: `سلام دوست من! اتصال شبکه کمی بازیگوشی می‌کنه، اما بیا خودمون با قدرت ذهن خودت به این بخش نگاه کنیم: "${text.substring(0, 80)}..."`,
        hints: [
          "کمی مکث کن. به ساختار کلی خطوط همسایه دقت کن؛ ورودی این تکه متن از کجا تأمین شده؟",
          "اگر می‌خواستی کلمه‌ای شبیه به این را در زندگی روزمره شرح دهی، چه مثالی می‌آوردی؟",
          "هدف اصلی این بخش انجام یک کار تکراری است یا یک مقایسه منطقی؟"
        ],
        guiding_questions: [
          "فکر می‌کنی اگر این دستور به کل حذف می‌شد، نتیجه نهایی چه فرقی می‌کرد؟"
        ],
        example: "// به این مثال ساده توجه کن:\nconst score = 100;\nif (score >= 50) {\n  console.log('موفق شدید!');\n}"
      });
      
      const modalX = x ? Math.min(window.innerWidth - 450, Math.max(20, x - 210)) : Math.max(50, window.innerWidth - 480);
      const modalY = y ? Math.min(window.innerHeight - 560, Math.max(50, y - 100)) : 150;
      setVardakModalPos({ x: modalX, y: modalY });
      setIsVardakModalOpen(true);
      setVardakState('answering');
    }
  };

  const toggleVardakState = () => {
    if (vardakState !== 'idle') {
      flyBackToNest();
    } else {
      setIsVardakDropdownOpen(!isVardakDropdownOpen);
    }
  };

  const handleModalDragStart = (e: React.MouseEvent) => {
    if (isGuidanceFullscreen) return;
    setIsVardakModalDragging(true);
    vardakDragStart.current = { x: e.clientX - vardakModalPos.x, y: e.clientY - vardakModalPos.y };
  };

  const handleChatDragStart = (e: React.MouseEvent) => {
    if (isChatFullscreen) return;
    setIsVardakChatDragging(true);
    vardakChatDragStart.current = { x: e.clientX - vardakChatPos.x, y: e.clientY - vardakChatPos.y };
  };

  const handleModalResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVardakModalResizing(true);
    vardakResizeStart.current = {
      w: vardakModalSize.w,
      h: vardakModalSize.h,
      x: e.clientX,
      y: e.clientY
    };
  };
  const [isVideoListModalOpen, setIsVideoListModalOpen] = useState(false);
  const [isPdfListModalOpen, setIsPdfListModalOpen] = useState(false);

  // Voice Explanation Playback states
  const [isPlayingExplanation, setIsPlayingExplanation] = useState(false);
  const audioExplanationRef = useRef<HTMLAudioElement | null>(null);

  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
  const modalAudioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlayExplanation = () => {
    if (!activeLesson?.audioExplanationUrl) return;
    
    if (modalAudioRef.current) {
      modalAudioRef.current.pause();
      setPlayingAudioUrl(null);
    }
    
    if (!audioExplanationRef.current) {
      audioExplanationRef.current = new Audio(activeLesson.audioExplanationUrl);
      audioExplanationRef.current.onended = () => {
        setIsPlayingExplanation(false);
      };
    } else if (audioExplanationRef.current.src !== activeLesson.audioExplanationUrl) {
      // If the lesson changed, update the audio element's source
      audioExplanationRef.current.pause();
      audioExplanationRef.current = new Audio(activeLesson.audioExplanationUrl);
      audioExplanationRef.current.onended = () => {
        setIsPlayingExplanation(false);
      };
    }

    if (isPlayingExplanation) {
      audioExplanationRef.current.pause();
      setIsPlayingExplanation(false);
    } else {
      audioExplanationRef.current.play().catch(err => {
        console.error("Failed to play explanation audio:", err);
      });
      setIsPlayingExplanation(true);
    }
  };

  const playAudioItem = (url: string) => {
    if (isPlayingExplanation) {
      audioExplanationRef.current?.pause();
      setIsPlayingExplanation(false);
    }

    if (playingAudioUrl === url) {
      modalAudioRef.current?.pause();
      setPlayingAudioUrl(null);
    } else {
      if (modalAudioRef.current) {
        modalAudioRef.current.pause();
      }
      modalAudioRef.current = new Audio(url);
      modalAudioRef.current.onended = () => {
        setPlayingAudioUrl(null);
      };
      modalAudioRef.current.play().catch(err => {
        console.error("Failed to play audio:", err);
      });
      setPlayingAudioUrl(url);
    }
  };

  const closeAudioModal = () => {
    if (modalAudioRef.current) {
      modalAudioRef.current.pause();
      setPlayingAudioUrl(null);
    }
    setIsAudioListModalOpen(false);
  };

  // Stop audio on active lesson changes
  useEffect(() => {
    if (audioExplanationRef.current) {
      audioExplanationRef.current.pause();
      setIsPlayingExplanation(false);
    }
    if (modalAudioRef.current) {
      modalAudioRef.current.pause();
      setPlayingAudioUrl(null);
    }
    setShowTeacherText(false);
  }, [selectedLessonId]);

  // Active answer worksheet states
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [isSubmittingAnswers, setIsSubmittingAnswers] = useState(false);
  const [submissionSuccessMessage, setSubmissionSuccessMessage] = useState('');
  const [attemptsCount, setAttemptsCount] = useState<Record<string, number>>({});

  const isLessonIdCompleted = (lId: string) => {
    const lSub = submissions
      .filter(s => s.studentId === currentUser.id && s.lessonId === lId)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
    return lSub?.status === 'reviewed' && (lSub.gradedBy === 'teacher' || lSub.gradedBy === 'assistant') && !lSub.isTryAgainRequested;
  };

  const isCourseCompleted = (courseId: string) => {
    const courseLessons = lessons.filter(l => l.courseId === courseId);
    if (courseLessons.length === 0) return false;
    return courseLessons.every(l => isLessonIdCompleted(l.id));
  };

  const isCourseUnlocked = (courseId: string) => {
    return true;
  };

  // Bell Notifications states
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [activeNotification, setActiveNotification] = useState<any | null>(null);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`read_student_notifications_${currentUser.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const markNotificationAsRead = (id: string) => {
    if (!readNotificationIds.includes(id)) {
      const updated = [...readNotificationIds, id];
      setReadNotificationIds(updated);
      try {
        localStorage.setItem(`read_student_notifications_${currentUser.id}`, JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Chat copilot states
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [chatInput, setChatInput] = useState('');
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);

  // Student-Teacher Messaging states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [playingDmMid, setPlayingDmMid] = useState<string | null>(null);
  const dmAudioRef = useRef<HTMLAudioElement | null>(null);

  const compressAndConvertImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Compress quality to 70% JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleFileAttachment = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("حجم فایل ارسالی نباید بیشتر از ۵ مگابایت باشد.");
      return;
    }

    // Get active course and teacher
    const activeCourse = courses.find(c => c.id === activeLesson.courseId);
    const teacherId = activeCourse?.teacherId || 'teacher_1';

    try {
      if (type === 'image') {
        const compressedBase64 = await compressAndConvertImage(file);
        const msg: DirectMessage = {
          id: 'dm_' + Date.now(),
          senderId: currentUser.id,
          senderName: currentUser.name,
          senderRole: 'student',
          receiverId: teacherId,
          content: `تصویر: ${file.name}`,
          attachmentType: 'image',
          attachmentUrl: compressedBase64,
          fileName: file.name,
          createdAt: new Date().toISOString()
        };
        onSendDirectMessage(msg);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          const msg: DirectMessage = {
            id: 'dm_' + Date.now(),
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderRole: 'student',
            receiverId: teacherId,
            content: `فایل سند: ${file.name}`,
            attachmentType: 'document',
            attachmentUrl: base64,
            fileName: file.name,
            createdAt: new Date().toISOString()
          };
          onSendDirectMessage(msg);
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error("Error processing file:", err);
      alert("خطا در پردازش فایل ارسالی.");
    }
  };

  const startVoiceRecording = () => {
    setIsRecordingVoice(true);
    setVoiceSeconds(0);
    recordingIntervalRef.current = setInterval(() => {
      setVoiceSeconds(prev => prev + 1);
    }, 1000);
  };

  const stopAndSendVoiceRecording = () => {
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    setIsRecordingVoice(false);
    
    // Get active course and teacher
    const activeCourse = courses.find(c => c.id === activeLesson.courseId);
    const teacherId = activeCourse?.teacherId || 'teacher_1';

    // Simulate high-quality compressed audio base64 payload
    const simulatedVoiceBase64 = 'data:audio/mp3;base64,SIMULATED_COMPRESSED_AUDIO_DATA_FOR_CHAT';
    
    const msg: DirectMessage = {
      id: 'dm_' + Date.now(),
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: 'student',
      receiverId: teacherId,
      content: `پیام صوتی (${voiceSeconds} ثانیه)`,
      attachmentType: 'audio',
      attachmentUrl: simulatedVoiceBase64,
      fileName: `voice_${Date.now()}.mp3`,
      createdAt: new Date().toISOString()
    };
    onSendDirectMessage(msg);
    setVoiceSeconds(0);
  };

  const cancelVoiceRecording = () => {
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    setIsRecordingVoice(false);
    setVoiceSeconds(0);
  };

  const handleSendDirectMsg = () => {
    if (!chatInput.trim()) return;

    // Get active course and teacher
    const activeCourse = courses.find(c => c.id === activeLesson.courseId);
    const teacherId = activeCourse?.teacherId || 'teacher_1';

    const msg: DirectMessage = {
      id: 'dm_' + Date.now(),
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: 'student',
      receiverId: teacherId,
      content: chatInput.trim(),
      createdAt: new Date().toISOString()
    };

    onSendDirectMessage(msg);
    setChatInput('');
  };

  const playDmMidAudio = (msgId: string, url: string) => {
    if (dmAudioRef.current && playingDmMid === msgId) {
      dmAudioRef.current.pause();
      setPlayingDmMid(null);
      return;
    }

    if (dmAudioRef.current) {
      dmAudioRef.current.pause();
    }

    // Since we simulate voice files, let's play a cute beep sound or mock audio playback if browser cannot play simulated string
    const soundUrl = url.includes('SIMULATED') ? 'https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav' : url;
    
    dmAudioRef.current = new Audio(soundUrl);
    dmAudioRef.current.onended = () => {
      setPlayingDmMid(null);
    };
    setPlayingDmMid(msgId);
    dmAudioRef.current.play().catch(e => {
      console.error("Playback error:", e);
      setPlayingDmMid(null);
    });
  };

  // Speech Recognition (Voice-to-Text) for AI Chat
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'fa-IR';

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setChatInput(prev => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${transcript}` : transcript;
          });
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('مرورگر شما از قابلیت تبدیل صدا به متن پشتیبانی نمی‌کند. لطفاً از گوگل کروم استفاده کنید.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error(err);
        setIsListening(false);
      }
    }
  };

  // Preview lightbox state
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [slideshowImages, setSlideshowImages] = useState<LessonImage[]>([]);
  const [slideshowIndex, setSlideshowIndex] = useState<number>(0);

  const activeLesson = lessons.find(l => l.id === selectedLessonId) || lessons[0];
  const studentSubmissions = submissions.filter(s => s.studentId === currentUser.id);

  // Derived Student Notifications - Removed AI automated suggestions as requested
  const studentNotifications: any[] = [];

  const unreadNotifications = studentNotifications.filter(n => !readNotificationIds.includes(n.id));
  const unreadCount = unreadNotifications.length;

  // Track loaded answers for the active lesson to detect user edits
  const initialAnswersLoadedRef = useRef<Record<string, string>>({});
  const lastLessonIdRef = useRef<string | null>(null);

  // Load previous draft answers or starter codes when switching lessons
  useEffect(() => {
    if (!activeLesson) return;
    const initial: Record<string, string> = {};
    
    const lastSub = studentSubmissions
      .filter(s => s.lessonId === activeLesson.id)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];

    activeLesson.questions.forEach((q) => {
      const savedAns = lastSub?.answers.find(ans => ans.questionId === q.id);
      if (savedAns) {
        initial[q.id] = savedAns.value;
      } else if (q.answerType === 'code_editor') {
        initial[q.id] = q.starterCode || '';
      } else {
        initial[q.id] = '';
      }
    });

    const isLessonChanged = lastLessonIdRef.current !== activeLesson.id;
    
    // Check if user has edited anything in the current answers compared to what we initially loaded
    const currentKeys = Object.keys(studentAnswers);
    const hasUserEdited = currentKeys.length > 0 && currentKeys.some(
      (k) => studentAnswers[k] !== initialAnswersLoadedRef.current[k]
    );

    // Check if the current state is already identical to what we want to set
    const isSameAsCurrent = currentKeys.length === Object.keys(initial).length &&
      currentKeys.every((k) => studentAnswers[k] === initial[k]);

    // We only overwrite studentAnswers if the lesson has changed, OR if the user hasn't edited anything yet
    if ((isLessonChanged || !hasUserEdited) && !isSameAsCurrent) {
      setStudentAnswers(initial);
      initialAnswersLoadedRef.current = initial;
      if (isLessonChanged) {
        setSubmissionSuccessMessage('');
        setDailyLimitError('');
        lastLessonIdRef.current = activeLesson.id;
      }
    }
  }, [selectedLessonId, submissions, activeLesson, studentSubmissions, studentAnswers]);

  // Calculate student grades and metrics
  const gradedSubs = studentSubmissions.filter(s => s.status === 'reviewed');
  const studentGrades = gradedSubs.map(s => s.grade || 0);
  const averageGrade = studentGrades.length > 0 
    ? (studentGrades.reduce((sum, g) => sum + g, 0) / studentGrades.length).toFixed(1) 
    : '0';

  const renderAnswerTypeLabel = (type: AnswerType) => {
    switch (type) {
      case 'text': return '📝 پاسخ تشریحی متنی';
      case 'code_editor': return '💻 کدنویسی زنده فرانت‌اند';
      case 'handwritten_photo': return '🎨 رسم دست‌نویس روی بوم';
      case 'notebook_photo': return '📷 تصویر دفترچه تکالیف با دوربین';
      case 'audio_recording': return '🎙️ توضیح صوتی ضبط‌شده';
      case 'mission_url': return '🔗 آدرس اینترنتی پروژه مستقرشده';
      default: return 'چالش عمومی';
    }
  };

  // Submit Homework responses
  const handleStudentSubmit = async (lesson: Lesson) => {
    setIsSubmittingAnswers(true);
    setSubmissionSuccessMessage('');
    setDailyLimitError('');

    // Check daily limit: max 2 unique lessons submitted per calendar day
    const todayStr = new Date().toLocaleDateString('en-US');
    const todaySubs = studentSubmissions.filter(s => {
      try {
        return new Date(s.submittedAt).toLocaleDateString('en-US') === todayStr;
      } catch {
        return false;
      }
    });
    const uniqueLessonsSubmittedToday = new Set(todaySubs.map(s => s.lessonId));
    const hasAlreadySubmittedThisLessToday = uniqueLessonsSubmittedToday.has(lesson.id);

    if (uniqueLessonsSubmittedToday.size >= 2 && !hasAlreadySubmittedThisLessToday) {
      setDailyLimitError('شما امروز چالش‌های ۲ درس را حل و ارسال کرده‌اید. طبق قوانین آکادمی، شما مجاز به ارسال حداکثر ۲ درس در هر روز هستید. لطفا برای ارسال چالش‌های این درس تا فردا صبر کنید.');
      setIsSubmittingAnswers(false);
      return;
    }

    // Check if empty
    const answeredKeys = Object.keys(studentAnswers).filter(k => studentAnswers[k].trim());
    if (answeredKeys.length < lesson.questions.length) {
      if (!confirm('شما به تمام چالش‌ها پاسخ نداده‌اید. آیا از ارسال همین پاسخ‌ها اطمینان دارید؟')) {
        setIsSubmittingAnswers(false);
        return;
      }
    }

    // Increment attempt counts for this lesson based on existing submissions to survive refreshes
    const existingSub = studentSubmissions.find(s => s.lessonId === lesson.id);
    const prevAttempts = existingSub ? (existingSub.attemptsCount || 1) : 0;
    const currentLessonAttempts = prevAttempts + 1;
    setAttemptsCount(prev => ({ ...prev, [lesson.id]: currentLessonAttempts }));

    // Formulate submission
    const formattedAnswers = lesson.questions.map((q) => ({
      questionId: q.id,
      answerType: q.answerType,
      value: studentAnswers[q.id] || '',
      fileName: q.answerType === 'handwritten_photo' ? 'my_sketch.png' : (q.answerType === 'notebook_photo' ? 'notebook_page.jpeg' : undefined)
    }));

    // If student has made 3 or more failed attempts or if the answer is completely empty, 
    // we alert the teacher that they are struggling.
    const isStruggling = currentLessonAttempts >= 3;

    const newSub: Submission = {
      id: 'sub_' + Date.now(),
      lessonId: lesson.id,
      studentId: currentUser.id,
      studentName: currentUser.name,
      submittedAt: new Date().toISOString(),
      answers: formattedAnswers,
      status: 'pending',
      maxPoints: lesson.questions.reduce((sum, q) => sum + q.points, 0),
      attemptsCount: currentLessonAttempts,
      alertTeacher: isStruggling
    };

    // Simulated short timeout
    setTimeout(() => {
      onAddSubmission(newSub);
      setIsSubmittingAnswers(false);
      setSubmissionSuccessMessage(
        isStruggling 
          ? 'تکالیف شما با موفقیت ثبت شد! به علت دفعات بالای تلاش شما، استاد در جریان وضعیت قرار گرفت تا در یادگیری چالش به صورت اختصاصی به شما کمک کند.' 
          : 'تکالیف شما با موفقیت برای تصحیح و ثبت نمره نهایی به استاد ارسال شد!'
      );
    }, 1000);
  };

  // AI Tutor Copilot Chat Logic
  const handleSendChatMessage = async (lessonContent: string) => {
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = {
      id: 'msg_user_' + Date.now(),
      role: 'user',
      content: chatInput.trim(),
      createdAt: new Date().toISOString()
    };

    const currentLessonHistory = chatMessages[activeLesson.id] || [];
    const updatedHistory = [...currentLessonHistory, userMsg];

    // Update locally UI immediately
    setChatMessages(prev => ({
      ...prev,
      [activeLesson.id]: updatedHistory
    }));
    setChatInput('');
    setIsSendingChatMessage(true);

    // Grab current code from student state if active lesson has a code editor question
    const codeQuestion = activeLesson.questions.find(q => q.answerType === 'code_editor');
    const currentCode = codeQuestion ? studentAnswers[codeQuestion.id] : undefined;

    // Get the most recent submission for this active lesson to detect if student has struggled/failed
    const lastSubmission = studentSubmissions
      .filter(s => s.lessonId === activeLesson.id)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson: activeLesson,
          lessonContent,
          messages: updatedHistory,
          currentCode,
          lastSubmission
        })
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        const assistantMsg: ChatMessage = {
          id: 'msg_ai_' + Date.now(),
          role: 'assistant',
          content: data.reply,
          createdAt: new Date().toISOString()
        };
        setChatMessages(prev => ({
          ...prev,
          [activeLesson.id]: [...updatedHistory, assistantMsg]
        }));
      } else {
        alert(data.error || 'خطا در ارتباط با هوش مصنوعی برای چت');
      }
    } catch (e) {
      console.error(e);
      alert('خطا در شبکه مربی هوش مصنوعی.');
    } finally {
      setIsSendingChatMessage(false);
    }
  };



  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col md:flex-row overflow-hidden text-slate-900 font-sans" dir="rtl">
      
      {/* Student Left Sidebar */}
      <aside className="w-full md:w-64 border-l border-slate-200 bg-white flex flex-col p-4 shrink-0 md:h-screen md:overflow-hidden sticky top-0 z-20 shadow-sm">
        
        {/* Scrollable Middle Container */}
        <div className="flex-1 overflow-y-auto space-y-6 min-h-0 pl-1 mb-4" style={{ scrollbarWidth: 'thin' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center text-white">
              <BookOpen size={18} />
            </div>
            <div>
              <h2 className="text-xs font-black text-slate-900 leading-tight">آکادمی هوشمند لومینا</h2>
              <span className="text-[9px] text-slate-400 font-extrabold block mt-0.5">دانش‌آموز: {currentUser.name}</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl">
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold mb-1">
              <span>سطح کلاسی شما:</span>
              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-black text-[9px]">
                {studentLevel === 'beginner' ? 'مبتدی' : studentLevel === 'intermediate' ? 'متوسطه' : 'پیشرفته'}
              </span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
              <div 
                className="bg-slate-900 h-full transition-all duration-500" 
                style={{ width: `${(gradedSubs.length / Math.max(myLevelLessons.length, 1)) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[8px] text-slate-400 font-extrabold mt-1">
              <span>پیشرفت دوره</span>
              <span>{gradedSubs.length} از {myLevelLessons.length} درس</span>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setShowDashboard(true)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                showDashboard ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>📊</span>
              <span>میز کار من (داشبورد)</span>
            </button>

            <div className="pt-4 pb-1 border-t border-slate-100 mt-2">
              <span className="text-[9px] text-slate-400 font-extrabold px-3 block uppercase tracking-widest">
                {activeCourseId ? `دروس دوره: ${courses.find(c => c.id === activeCourseId)?.title}` : 'فهرست دروس مرتبط'}
              </span>
            </div>

            {myLevelLessons.map((l, idx) => {
              const lessonSub = studentSubmissions
                .filter(s => s.lessonId === l.id)
                .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
              const isLessonCompleted = lessonSub?.status === 'reviewed' && (lessonSub.gradedBy === 'teacher' || lessonSub.gradedBy === 'assistant') && !lessonSub.isTryAgainRequested;
              const isLessonTeacherTryAgain = lessonSub?.status === 'reviewed' && (lessonSub.gradedBy === 'teacher' || lessonSub.gradedBy === 'assistant') && lessonSub.isTryAgainRequested;
              const isLessonAssistantTryAgain = false;
              const isLessonTryAgain = isLessonTeacherTryAgain;
              const isLessonPending = lessonSub?.status === 'pending';

              const isSidebarLessonUnlocked = idx === 0 || myLevelLessons.slice(0, idx).every(prevL => isLessonIdCompleted(prevL.id));

              return (
                <button
                  key={l.id}
                  onClick={() => {
                    if (!isSidebarLessonUnlocked) return;
                    setSelectedLessonId(l.id);
                    setShowDashboard(false);
                    setStudentTab('lessons');
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-right ${
                    !isSidebarLessonUnlocked 
                      ? 'opacity-65 cursor-not-allowed text-slate-400' 
                      : !showDashboard && studentTab === 'lessons' && selectedLessonId === l.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
                    isLessonCompleted 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : !isSidebarLessonUnlocked
                        ? 'bg-slate-100 text-slate-400 font-normal'
                        : isLessonTryAgain 
                          ? 'bg-amber-100 text-amber-700 animate-pulse' 
                          : isLessonPending 
                            ? 'bg-indigo-100 text-indigo-700' 
                            : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    {isLessonCompleted ? '✓' : !isSidebarLessonUnlocked ? '🔒' : idx + 1}
                  </div>
                  <span className={`truncate flex-1 ${!isSidebarLessonUnlocked ? 'opacity-60 text-slate-400 font-medium' : ''}`}>{l.title}</span>
                  {!isSidebarLessonUnlocked && (
                    <span className="text-[7px] px-1 py-0.5 rounded bg-slate-100 text-slate-400 font-black shrink-0">تمرین قفل</span>
                  )}
                  {isSidebarLessonUnlocked && isLessonTeacherTryAgain && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-extrabold shrink-0">تلاش مجدد استاد</span>
                  )}
                  {isSidebarLessonUnlocked && isLessonAssistantTryAgain && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-extrabold shrink-0">پیشنهاد اصلاح استادیار</span>
                  )}
                  {isSidebarLessonUnlocked && isLessonPending && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-extrabold shrink-0">بررسی استاد</span>
                  )}
                </button>
              );
            })}

            {myLevelLessons.length === 0 && (
              <p className="text-[10px] text-slate-400 p-3 font-semibold leading-relaxed">
                {activeCourseId ? 'هنوز درسی برای این دوره ثبت نشده است.' : 'یک دوره را از پیشخوان فعال کنید تا درس‌های آن را ببینید.'}
              </p>
            )}
          </nav>
        </div>

        {/* Locked Bottom Container */}
        <div className="pt-4 border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <img
              src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&q=80&w=100'}
              alt={currentUser.name}
              className="w-8 h-8 rounded-full border border-slate-200 object-cover"
            />
            <div>
              <div className="text-[10px] font-bold text-slate-900 leading-none">{currentUser.name}</div>
              <span className="text-[8px] text-slate-400 mt-0.5 block">شاگرد سخت‌کوش</span>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <span>خروج از کلاس</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 bg-white overflow-hidden flex flex-col h-screen">

        {/* Student Global Top Bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 relative">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
              {showDashboard ? '📊 پیشخوان کلاس درس' : `📖 درس: ${activeLesson?.title || ''}`}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Database Sync Indicator */}
            <DbSyncIndicator isLoading={isLoadingDb} isLoaded={isDbLoaded} isHeaderInline={true} />

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setIsBellOpen(!isBellOpen)}
                className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition duration-300"
              >
                <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'animate-swing text-indigo-600 animate-pulse' : ''}`} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-pulse" />
                )}
              </button>

              {/* Dropdown Popover */}
              {isBellOpen && (
                <div className="absolute left-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn text-right">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800">صندوق اعلان‌های هوشمند</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-black">
                      {unreadCount} پیام جدید
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {studentNotifications.map((notif) => {
                      const isRead = readNotificationIds.includes(notif.id);
                      return (
                        <button
                          key={notif.id}
                          onClick={() => {
                            setActiveNotification(notif);
                            markNotificationAsRead(notif.id);
                            setIsBellOpen(false);
                          }}
                          type="button"
                          className={`w-full text-right p-3.5 hover:bg-indigo-50/30 transition duration-150 flex flex-col gap-1 ${
                            !isRead ? 'bg-indigo-50/10' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-extrabold flex items-center gap-1 ${
                              notif.type === 'teacher_approved' ? 'text-emerald-600' : notif.type === 'teacher_try_again' ? 'text-rose-600' : 'text-indigo-600'
                            }`}>
                              <span>{notif.title}</span>
                            </span>
                            {!isRead && (
                              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                            )}
                          </div>
                          <p className="text-xs text-slate-700 font-bold leading-relaxed">
                            {notif.message}
                          </p>
                          <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                            {new Date(notif.date).toLocaleDateString('fa-IR')}
                          </span>
                        </button>
                      );
                    })}

                    {studentNotifications.length === 0 && (
                      <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                        🔔 هیچ اعلان جدیدی برای شما ثبت نشده است.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Student Notification Detail Modal */}
        {activeNotification && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" dir="rtl">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-3xl shadow-2xl flex flex-col overflow-hidden text-right">
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black">
                    🤖 تحلیل و راهنمای استادیار هوش مصنوعی
                  </span>
                  <h3 className="text-sm font-black text-slate-950">{activeNotification.title}</h3>
                </div>
                <button
                  onClick={() => setActiveNotification(null)}
                  className="p-1.5 hover:bg-slate-200 rounded-full transition text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-sm font-black text-slate-800">
                    <span>📚 درس مربوطه: {lessons.find(l => l.id === activeNotification.lessonId)?.title || 'نامشخص'}</span>
                    <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-mono font-black text-xs">
                      نمره تخمینی ارزیابی اولیه: {activeNotification.grade} از {activeNotification.maxPoints}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-bold">
                    ارزیابی شده توسط: <span className="text-indigo-600">🤖 دستیار هوشمند استادیار صوتی کلاسی</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-xs font-black text-slate-600">💡 راهنمای تصحیح اولیه و گام‌های ارتقا:</span>
                  
                  <div className="bg-indigo-50/30 border border-indigo-100 rounded-2xl p-6 text-sm leading-relaxed max-h-[400px] overflow-y-auto text-right">
                    <div className="font-black text-sm text-indigo-900 border-b border-indigo-100 pb-3 mb-4 flex items-center gap-1.5">
                      <Sparkles size={16} className="text-indigo-600" />
                      <span>تحلیل خودکار و نکات کلیدی برای ارتقای نمره به ۱۰۰:</span>
                    </div>
                    <div className="space-y-4 text-slate-800 font-medium leading-relaxed prose prose-indigo max-w-none">
                      <ReactMarkdown>{activeNotification.feedback}</ReactMarkdown>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 items-start">
                  <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                  <div className="text-xs text-amber-900 leading-relaxed font-bold">
                    توجه: این یک ارزیابی اولیه و خودکار است. شما می‌توانید با کلیک روی دکمه زیر، مستقیماً وارد ویرایش پاسخ‌های خود شده، با توجه به راهنمایی‌های بالا پاسخ‌ها را اصلاح کرده و مجدداً جهت نمره‌دهی ارسال نمایید تا بالاترین نمره کلاسی را کسب کنید!
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                <button
                  onClick={() => setActiveNotification(null)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black transition"
                >
                  بستن پنجره راهنما
                </button>
                
                <button
                  onClick={() => {
                    setSelectedLessonId(activeNotification.lessonId);
                    setShowDashboard(false);
                    setStudentTab('lessons');
                    setActiveNotification(null);
                  }}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-lg hover:shadow-indigo-100"
                >
                  <span>📖 ورود به بخش ویرایش و اصلاح پاسخ‌ها</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================== */}
        {/* VIEW 1: STUDENT DASHBOARD */}
        {/* ============================================== */}
        {showDashboard ? (
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">پیشخوان دوره‌ها و میز کار من</h2>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">در دوره‌های جدید ثبت‌نام کنید، برنامه درسی فعال را دنبال کرده و بازخورد اساتید را مرور کنید.</p>
              </div>
              <span className="bg-indigo-50 text-indigo-700 text-xs font-black px-3.5 py-1.5 rounded-full border border-indigo-100">
                سطح کلاسی پیش‌فرض شما: {studentLevel === 'beginner' ? 'ابتدایی' : studentLevel === 'intermediate' ? 'متوسطه' : 'پیشرفته'}
              </span>
            </div>

            {/* Dashboard widgets */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
                <span className="text-[10px] text-slate-400 font-extrabold block">معدل نمرات شما</span>
                <span className="text-2xl font-mono font-black text-indigo-600 block mt-1">{averageGrade} / 100</span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
                <span className="text-[10px] text-slate-400 font-extrabold block">دوره‌های ثبت‌نام شده</span>
                <span className="text-2xl font-mono font-black text-slate-900 block mt-1">
                  {enrollments.filter(e => {
                    if (e.studentId !== currentUser.id) return false;
                    const course = courses.find(c => c.id === e.courseId);
                    return course?.level === studentLevel;
                  }).length} دوره
                </span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
                <span className="text-[10px] text-slate-400 font-extrabold block">تکالیف ارسال‌شده</span>
                <span className="text-2xl font-mono font-black text-slate-900 block mt-1">{studentSubmissions.length} مورد</span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
                <span className="text-[10px] text-slate-400 font-extrabold block">مدال‌های طلایی مربی</span>
                <span className="text-2xl font-mono font-black text-amber-500 block mt-1">
                  {studentGrades.filter(g => g >= 90).length} 🏆
                </span>
              </div>
            </div>

            {/* SECTION 1: MY ENROLLED COURSES */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <span>📂</span>
                <span>دوره‌های آموزشی ثبت‌نامی شما:</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  const myEnrollments = enrollments.filter(e => {
                    if (e.studentId !== currentUser.id) return false;
                    const course = courses.find(c => c.id === e.courseId);
                    return course?.level === studentLevel;
                  });
                  return myEnrollments.map((enroll) => {
                    const course = courses.find(c => c.id === enroll.courseId);
                    if (!course) return null;
                    const courseLessons = lessons.filter(l => l.courseId === course.id);
                    const isMyCourseUnlocked = isCourseUnlocked(course.id);

                    return (
                      <div key={enroll.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3 flex flex-col justify-between hover:border-slate-300 transition-all">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="bg-slate-100 text-slate-600 text-[9px] font-black px-2 py-0.5 rounded-full">
                              {course.category}
                            </span>
                            <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-md border ${
                              !isMyCourseUnlocked
                                ? 'bg-slate-50 text-slate-500 border-slate-200'
                                : enroll.status === 'accepted' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : enroll.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border-amber-100'
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                            }`}>
                              {!isMyCourseUnlocked ? '🔒 قفل شده (دوره قبل ناقص)' : enroll.status === 'accepted' ? '✓ تایید شده و فعال' : enroll.status === 'pending' ? '⧗ در انتظار پذیرش استاد' : '✕ رد شده'}
                            </span>
                          </div>
                          <h4 className="text-xs font-black text-slate-900 leading-snug">{course.title}</h4>
                          <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">{course.description || 'بدون توضیحات اضافی.'}</p>
                        </div>

                        {enroll.status === 'accepted' && (
                          <div className="py-2.5 px-3 rounded-2xl bg-slate-50 border border-slate-150 flex items-center justify-between text-xs my-1">
                            {(() => {
                              const myRating = ratings.find(r => r.studentId === currentUser.id && r.courseId === course.id);
                              if (myRating) {
                                return (
                                  <div className="flex items-center gap-1.5 text-amber-500 font-bold">
                                    <span className="text-slate-400 font-semibold">امتیاز شما:</span>
                                    <div className="flex">
                                      {Array.from({ length: 5 }).map((_, i) => (
                                        <Star key={i} size={11} className={`fill-current ${i < myRating.rating ? 'text-amber-500' : 'text-slate-200'}`} />
                                      ))}
                                    </div>
                                    <span className="text-[10px] text-slate-500">({myRating.rating} ستاره)</span>
                                  </div>
                                );
                              } else {
                                return (
                                  <div className="flex items-center justify-between w-full gap-2">
                                    <span className="text-slate-500 text-[10px] font-semibold">هنوز به این صنف رای نداده‌اید</span>
                                    <button
                                      onClick={() => setRatingModalCourse(course)}
                                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 rounded-lg border border-indigo-100 transition-all shrink-0 cursor-pointer"
                                    >
                                      <Star size={11} className="fill-current" />
                                      <span>ثبت امتیاز و ستاره</span>
                                    </button>
                                  </div>
                                );
                              }
                            })()}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2 text-[9px]">
                          <span className="text-slate-400 font-bold">تعداد کل دروس: {courseLessons.length} درس</span>
                          {enroll.status === 'accepted' ? (
                            <button
                              disabled={!isMyCourseUnlocked}
                              onClick={() => {
                                setActiveCourseId(course.id);
                                setShowDashboard(false);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                                !isMyCourseUnlocked
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                  : activeCourseId === course.id 
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              }`}
                            >
                              {!isMyCourseUnlocked ? 'قفل شده' : activeCourseId === course.id ? 'ادامه مطالعه (فعال)' : 'ورود به کلاس درس'}
                            </button>
                          ) : (
                            <span className="text-slate-400 font-medium">پس از تایید استاد می‌توانید وارد شوید</span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}

                {enrollments.filter(e => {
                  if (e.studentId !== currentUser.id) return false;
                  const course = courses.find(c => c.id === e.courseId);
                  return course?.level === studentLevel;
                }).length === 0 && (
                  <div className="md:col-span-2 p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400 font-semibold">شما هنوز در هیچ دوره‌ای ثبت‌نام نکرده‌اید. از بخش بانک دوره‌ها اقدام کنید!</p>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 2: COURSE CATALOG / EXPLORE */}
            <div className="space-y-4 pt-4">
              <h3 className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                <span>🌟</span>
                <span>بانک سراسری دوره‌ها (کاوش و ارسال درخواست ثبت‌نام):</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  const myEnrollmentIds = enrollments.filter(e => e.studentId === currentUser.id).map(e => e.courseId);
                  const exploreCourses = courses.filter(c => !myEnrollmentIds.includes(c.id) && c.level === studentLevel);

                  return exploreCourses.map((course) => {
                    const courseLessons = lessons.filter(l => l.courseId === course.id);
                    const isExpUnlocked = isCourseUnlocked(course.id);

                    return (
                      <div key={course.id} className="bg-slate-50 hover:bg-slate-50/80 border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3 flex flex-col justify-between transition-all">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="bg-indigo-50 text-indigo-700 text-[9px] font-black px-2 py-0.5 rounded-full border border-indigo-100/50">
                              {course.category}
                            </span>
                            <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-2 py-0.5 rounded-md">
                              سطح: {course.level === 'beginner' ? 'مبتدی' : course.level === 'intermediate' ? 'متوسط' : 'پیشرفته'}
                            </span>
                          </div>
                          <h4 className="text-xs font-black text-slate-800 leading-snug">{course.title}</h4>
                          <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">{course.description || 'توضیحات کوتاهی ثبت نشده است.'}</p>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-200/50 mt-2 text-[9px]">
                          <span className="text-slate-400 font-extrabold">{courseLessons.length} درس‌نامه جامع</span>
                          <button
                            disabled={!isExpUnlocked}
                            onClick={() => {
                              onEnrollStudent(course.id, currentUser.id, currentUser.name);
                              alert(`درخواست ثبت‌نام شما در دوره "${course.title}" برای استاد ارسال شد. می‌توانید پس از پذیرش وارد دوره شوید!`);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition ${
                              !isExpUnlocked
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                : 'bg-slate-900 hover:bg-black text-white shadow-sm'
                            }`}
                          >
                            {!isExpUnlocked ? '🔒 دوره قبل ناقص است' : 'درخواست عضویت در دوره'}
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}

                {(() => {
                  const myEnrollmentIds = enrollments.filter(e => e.studentId === currentUser.id).map(e => e.courseId);
                  const exploreCourses = courses.filter(c => !myEnrollmentIds.includes(c.id) && c.level === studentLevel);
                  return exploreCourses.length === 0 ? (
                    <div className="md:col-span-2 p-6 text-center bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-400 font-medium">
                      تمام دوره‌های فعال سطح شما ثبت‌نام شده یا دوره‌ای در این سطح موجود نیست.
                    </div>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Teacher Feedback Logs */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5">
              <h3 className="text-xs font-black text-slate-900 mb-3">بازخوردهای ثبت‌شده اساتید و مکمل هوش مصنوعی</h3>
              <div className="space-y-3">
                {studentSubmissions.filter(s => s.status === 'reviewed').map((s) => {
                  const lesson = lessons.find(l => l.id === s.lessonId);
                  return (
                    <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-150 space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-xs font-black text-slate-800">{lesson?.title}</span>
                        <div className="flex gap-1.5 items-center">
                          {s.isTryAgainRequested && (
                            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[9px] font-black">
                              🔁 نیاز به تلاش مجدد
                            </span>
                          )}
                          <span className={`${s.isTryAgainRequested ? 'bg-amber-50 text-amber-700' : 'bg-emerald-100 text-emerald-800'} px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold`}>
                            نمره: {s.grade} / {s.maxPoints}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span>تاریخ ارسال: {new Date(s.submittedAt).toLocaleDateString('fa-IR')}</span>
                        <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-black">
                          ✍️ ارزیاب: {s.gradedBy === 'assistant' ? '🎓 دستیار استاد' : '👨‍🏫 استاد'}
                        </span>
                      </div>
                      {s.feedback && (
                        <div className="text-xs text-slate-700 leading-relaxed font-semibold space-y-1">
                          <strong className="text-slate-900 block mb-1">💬 یادداشت اختصاصی استاد:</strong>
                          {s.gradedBy === 'assistant' ? (
                            <div className="prose prose-slate max-w-none text-xs leading-relaxed text-right space-y-2 prose-p:leading-relaxed prose-headings:text-sm prose-headings:font-black prose-ul:list-disc prose-ul:pr-5">
                              <ReactMarkdown>{s.feedback}</ReactMarkdown>
                            </div>
                          ) : (
                            <p className="whitespace-pre-line">{s.feedback}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {studentSubmissions.filter(s => s.status === 'reviewed').length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center font-semibold">هنوز بازخوردی ثبت نشده است. تکالیف را انجام دهید تا استاد تصحیح کند.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          
          // ==============================================
          // VIEW 2: INTERACTIVE LESSON TEXTBOOK READER & CHAT
          // ==============================================
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            
            {/* Elegant Header & Tab Switcher */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 md:px-6 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0" dir="rtl">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (isPlayingExplanation) {
                      audioExplanationRef.current?.pause();
                      setIsPlayingExplanation(false);
                    }
                    setShowDashboard(true);
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition font-black bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm shrink-0"
                >
                  <ArrowLeft size={13} className="transform rotate-180" />
                  <span>بازگشت به پیشخوان</span>
                </button>
                <div className="h-4 w-[1px] bg-slate-200 hidden lg:block" />
                <div>
                  <h2 className="text-xs md:text-sm font-black text-slate-900 leading-tight">
                    {activeLesson.title}
                  </h2>
                  <span className="text-[9px] text-slate-400 font-extrabold block mt-0.5">
                    دوره: {courses.find(c => c.id === activeLesson.courseId)?.title || 'بدون دوره'}
                  </span>
                </div>
              </div>

              {/* Elegant Tab Switcher Button Group */}
              <div className="flex items-center bg-slate-200/60 p-1 rounded-2xl gap-1 shrink-0 self-start lg:self-auto">
                <button
                  onClick={() => setActiveLessonTab('textbook')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10px] md:text-xs font-black transition-all ${
                    activeLessonTab === 'textbook'
                      ? 'bg-white text-indigo-700 shadow-md border border-indigo-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  <BookOpen size={12} />
                  <span>۱. متن درس‌نامه</span>
                </button>
                <button
                  onClick={() => {
                    setActiveLessonTab('challenges');
                    setStudentTab('lessons');
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10px] md:text-xs font-black transition-all ${
                    activeLessonTab === 'challenges'
                      ? 'bg-white text-indigo-700 shadow-md border border-indigo-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  <CheckSquare size={12} />
                  <span>۲. چالش‌ها و پاسخ شما</span>
                </button>
                <button
                  onClick={() => {
                    setActiveLessonTab('teacher_chat');
                    setStudentTab('chat');
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10px] md:text-xs font-black transition-all ${
                    activeLessonTab === 'teacher_chat'
                      ? 'bg-white text-indigo-700 shadow-md border border-indigo-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                  }`}
                >
                  <Sparkles size={12} />
                  <span>۳. گفتگو با استاد</span>
                </button>
              </div>
            </div>

            {/* Textbook Column */}
            <div 
              className={`flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-white ${
                activeLessonTab === 'textbook' ? 'block' : 'hidden'
              } ${
                isTextbookFullscreen 
                  ? 'fixed inset-0 z-40 p-6 md:p-12 overflow-y-auto bg-white' 
                  : ''
              }`}
              style={{ fontSize: `${textbookZoomLevel}%` }}
            >
              
              {/* Back to dashboard & Media/Explanation Controls */}
              <div className="flex items-center justify-between flex-wrap gap-4 pb-3 border-b border-slate-100">
                <button
                  onClick={() => {
                    if (isPlayingExplanation) {
                      audioExplanationRef.current?.pause();
                      setIsPlayingExplanation(false);
                    }
                    if (isTextbookFullscreen) {
                      setIsTextbookFullscreen(false);
                    }
                    setShowDashboard(true);
                  }}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-900 transition font-bold"
                >
                  <ArrowLeft size={12} className="transform rotate-180" />
                  <span>بازگشت به کارنامه و نقشه راه</span>
                </button>

                <div className="flex items-center gap-2">
                  {/* Zoom & Fullscreen controls */}
                  <div className="flex items-center gap-1 border-l border-slate-200 pl-2.5 ml-1 select-none">
                    <button
                      onClick={() => setTextbookZoomLevel(prev => Math.max(80, prev - 10))}
                      className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center justify-center"
                      title="کوچک‌نمایی متن"
                    >
                      <ZoomOut size={13} />
                    </button>
                    <span className="text-[10px] font-mono font-bold text-slate-600 px-1 min-w-[32px] text-center">
                      {textbookZoomLevel}%
                    </span>
                    <button
                      onClick={() => setTextbookZoomLevel(prev => Math.min(200, prev + 10))}
                      className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center justify-center"
                      title="بزرگ‌نمایی متن"
                    >
                      <ZoomIn size={13} />
                    </button>

                    <button
                      onClick={() => setIsTextbookFullscreen(!isTextbookFullscreen)}
                      className="p-1.5 rounded-xl bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-800 transition cursor-pointer flex items-center justify-center gap-1"
                      title={isTextbookFullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه کردن جزوه'}
                    >
                      {isTextbookFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                      <span className="text-[9px] font-black hidden sm:inline">
                        {isTextbookFullscreen ? 'خروج' : 'تمام‌صفحه'}
                      </span>
                    </button>
                  </div>

                  {/* Side-by-side Socratic AI Mentor buttons */}
                  <div className="flex items-center gap-1.5">
                    {/* 1. Socratic Chat Button */}
                    <button
                      onClick={() => setIsVardakChatOpen(!isVardakChatOpen)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border transition-all shadow-sm ${
                        isVardakChatOpen
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white hover:bg-indigo-50/40 text-slate-700 hover:text-indigo-700 border-slate-200'
                      }`}
                      title="گفتگوی مستقیم با مربی هوشمند سقراطی"
                    >
                      <MessageSquare size={13} />
                      <span>گفتگو با مربی</span>
                      {!isVardakChatOpen && (
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
                      )}
                    </button>

                    {/* 2. Socratic Guidance Button (previously text selector) */}
                    <button
                      onClick={() => {
                        if (vardakState === 'processing') return;
                        if (vardakState === 'selecting') {
                          flyBackToNest();
                        } else {
                          setVardakState('selecting');
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border transition-all shadow-sm ${
                        vardakState === 'selecting'
                          ? 'bg-indigo-600 text-white border-indigo-700'
                          : vardakState === 'processing'
                            ? 'bg-indigo-50 text-indigo-600 border-indigo-200 cursor-wait'
                            : vardakState === 'answering'
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-white hover:bg-indigo-50/40 text-slate-700 hover:text-indigo-700 border-slate-200'
                      }`}
                      title="آموزش و راهنمایی مربی بر اساس بخش‌های انتخابی متن درس‌نامه"
                    >
                      {vardakState === 'processing' ? (
                        <RotateCw size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      <span>
                        {vardakState === 'selecting' 
                          ? 'نشانه‌گذاری متن...' 
                          : vardakState === 'answering'
                            ? 'راهنمایی فعال'
                            : 'آموزش و راهنمایی'}
                      </span>
                    </button>
                  </div>

                  {/* Speaker (Audio explanations) Button */}
                  {(activeLesson.audioExplanationUrl || (activeLesson.audioExplanations && activeLesson.audioExplanations.length > 0)) ? (
                    <button
                      onClick={() => setIsAudioListModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-150 shadow-sm transition-all"
                      title="شنیدن توضیحات صوتی مربی"
                    >
                      <Volume2 size={13} className="text-indigo-600" />
                      <span>صوت‌های توضیحی ({((activeLesson.audioExplanations?.length || 0) + (activeLesson.audioExplanationUrl ? 1 : 0))})</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-150"
                      title="توضیح صوتی برای این درس تعریف نشده است"
                    >
                      <VolumeX size={13} />
                      <span>فاقد توضیح صوتی</span>
                    </button>
                  )}

                  {/* Teacher's Lesson Text Button */}
                  {activeLesson.teacherText ? (
                    <button
                      onClick={() => setShowTeacherText(!showTeacherText)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black border transition-all shadow-sm ${
                        showTeacherText
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-150'
                      }`}
                      title="نمایش متن تشریح و تدریس اختصاصی استاد"
                    >
                      <GraduationCap size={13} className={showTeacherText ? 'text-white' : 'text-indigo-600'} />
                      <span>{showTeacherText ? '📖 مشاهده متن اصلی درس' : '👨‍🏫 متن تدریس استاد'}</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-150"
                      title="متن تدریس مکتوب استاد برای این درس ثبت نشده است"
                    >
                      <GraduationCap size={13} />
                      <span>فاقد متن تدریس استاد</span>
                    </button>
                  )}

                  {/* YouTube / Television Button */}
                  {(activeLesson.youtubeUrl || (activeLesson.youtubeVideos && activeLesson.youtubeVideos.length > 0)) ? (
                    <button
                      onClick={() => setIsVideoListModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-150 shadow-sm transition-all"
                      title="مشاهده ویدیوهای مکمل درس"
                    >
                      <Tv size={13} className="text-rose-600" />
                      <span>ویدیوهای مکمل ({((activeLesson.youtubeVideos?.length || 0) + (activeLesson.youtubeUrl ? 1 : 0))})</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-150"
                      title="ویدیو آموزشی برای این درس ثبت نشده است"
                    >
                      <Tv size={13} />
                      <span>فاقد ویدیو مکمل</span>
                    </button>
                  )}

                  {/* PDF Resources Button */}
                  {(activeLesson.pdfResources && activeLesson.pdfResources.length > 0) ? (
                    <button
                      onClick={() => setIsPdfListModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-150 shadow-sm transition-all"
                      title="مشاهده فایل‌های PDF و جزوات درس"
                    >
                      <FileText size={13} className="text-emerald-600" />
                      <span>جزوات PDF ({activeLesson.pdfResources.length})</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-150"
                      title="جزوه PDF برای این درس ثبت نشده است"
                    >
                      <FileText size={13} className="text-slate-400" />
                      <span>فاقد جزوه PDF</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Textbook Header */}
              <div className="border-b border-slate-200 pb-4">
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-black uppercase">
                  {showTeacherText ? '👨‍🏫 متن تشریح و تدریس مکتوب استاد' : activeLesson.category}
                </span>
                <h2 className="text-base md:text-xl font-black text-slate-900 mt-2 leading-tight">
                  {showTeacherText ? `تدریس استاد برای: ${activeLesson.title}` : activeLesson.title}
                </h2>
              </div>

              {showTeacherText ? (
                /* Teacher's text prose */
                <div className="space-y-6 animate-fadeIn">
                  {/* Informational card */}
                  <div className="bg-indigo-50/75 border border-indigo-200/80 rounded-2xl p-4 flex items-start gap-3 text-indigo-950">
                    <div className="p-1.5 bg-indigo-100 rounded-xl text-indigo-700">
                      <GraduationCap size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black">یادداشت تدریس و تشریح استاد</h4>
                      <p className="text-[10px] text-indigo-700 font-bold mt-0.5">در این بخش، تشریح مکتوب، نکات تستی و تفاسیر مربی برای این مبحث در اختیار شماست.</p>
                    </div>
                  </div>

                  <article className="prose prose-slate max-w-none text-xs md:text-sm text-slate-800 leading-relaxed md:leading-loose space-y-4 font-medium whitespace-pre-line bg-indigo-50/10 p-4 md:p-6 rounded-3xl border border-slate-100/85">
                    {activeLesson.teacherText ? (
                      activeLesson.teacherText.split('\n\n').map((block, idx) => {
                        const trimmed = block.trim();
                        if (trimmed.startsWith('# ')) {
                          return <h1 key={idx} className="text-sm md:text-base font-black text-indigo-950 border-r-4 border-indigo-500 pr-2 mt-6 mb-2">{trimmed.replace('# ', '')}</h1>;
                        }
                        if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
                          return <h3 key={idx} className="text-xs md:text-sm font-extrabold text-indigo-950 mt-4 mb-1.5">{trimmed.replace(/###? /g, '')}</h3>;
                        }
                        if (trimmed.startsWith('```')) {
                          const lines = trimmed.split('\n');
                          const code = lines.slice(1, lines[lines.length - 1].startsWith('```') ? -1 : undefined).join('\n');
                          return (
                            <div key={idx} className="bg-indigo-50/50 text-indigo-950 rounded-2xl p-4 md:p-5 font-mono text-[11px] md:text-xs border border-indigo-150 overflow-x-auto my-4 relative group shadow-sm text-justify" dir="ltr">
                              <span className="absolute top-2 left-2 text-[8px] uppercase tracking-widest text-indigo-500 font-extrabold">کد برنامه (قالب فنی)</span>
                              <pre className="whitespace-pre-wrap leading-relaxed break-all font-medium select-text">{code}</pre>
                            </div>
                          );
                        }
                        return <p key={idx} className="text-slate-700 leading-relaxed md:leading-loose text-xs md:text-sm text-justify">{trimmed}</p>;
                      })
                    ) : (
                      <p className="text-slate-400 font-bold text-center py-6">متن تدریسی برای این درس ثبت نشده است.</p>
                    )}
                  </article>
                </div>
              ) : (
                <>
                  {/* Textbook Content Markdown Parser (Stunning design) */}
                  <article className="prose prose-slate max-w-none text-xs md:text-sm text-slate-800 leading-relaxed md:leading-loose space-y-4 font-medium">
                    {activeLesson.content.split('\n\n').map((block, idx) => {
                      const trimmed = block.trim();
                      if (trimmed.startsWith('# ')) {
                        return <h1 key={idx} className="text-sm md:text-base font-black text-slate-950 border-r-4 border-indigo-600 pr-2 mt-6 mb-2">{trimmed.replace('# ', '')}</h1>;
                      }
                      if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
                        return <h3 key={idx} className="text-xs md:text-sm font-extrabold text-slate-950 mt-4 mb-1.5">{trimmed.replace(/###? /g, '')}</h3>;
                      }
                      if (trimmed.startsWith('```')) {
                        const lines = trimmed.split('\n');
                        const code = lines.slice(1, lines[lines.length - 1].startsWith('```') ? -1 : undefined).join('\n');
                        return (
                          <div key={idx} className="bg-indigo-50/50 text-indigo-950 rounded-2xl p-4 md:p-5 font-mono text-[11px] md:text-xs border border-indigo-150 overflow-x-auto my-4 relative group shadow-sm text-justify" dir="ltr">
                            <span className="absolute top-2 left-2 text-[8px] uppercase tracking-widest text-indigo-500 font-extrabold">HTML / CSS</span>
                            <pre className="whitespace-pre-wrap leading-relaxed break-all font-medium select-text">{code}</pre>
                          </div>
                        );
                      }
                      if (trimmed.startsWith('[image:') && trimmed.endsWith(']')) {
                        const imgId = trimmed.replace('[image:', '').replace(']', '');
                        const img = activeLesson.lessonImages?.find(i => i.id === imgId || i.title === imgId);
                        if (img) {
                          return (
                            <div key={idx} className="my-6 bg-slate-50 border border-slate-200/85 rounded-2xl md:rounded-3xl overflow-hidden p-2 md:p-3.5 shadow-sm hover:shadow-md transition-all duration-300">
                              <div className="relative rounded-xl md:rounded-2xl overflow-hidden bg-white border border-slate-100 flex items-center justify-center p-1 md:p-2">
                                <img
                                  src={img.url}
                                  alt={img.title || ''}
                                  referrerPolicy="no-referrer"
                                  className="max-h-[380px] w-auto object-contain hover:scale-[1.015] transition-all duration-300 cursor-pointer rounded-lg"
                                  onClick={() => {
                                    setSlideshowImages(activeLesson.lessonImages || []);
                                    const idxInImages = activeLesson.lessonImages?.findIndex(i => i.url === img.url) ?? 0;
                                    setSlideshowIndex(idxInImages >= 0 ? idxInImages : 0);
                                  }}
                                />
                              </div>
                              {img.title && (
                                <div className="px-3 pt-2.5 text-center">
                                  <h5 className="text-[11px] md:text-xs font-black text-slate-800">{img.title}</h5>
                                  {img.description && (
                                    <p className="text-[9px] md:text-[10px] text-slate-500 font-bold mt-1 leading-relaxed">{img.description}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }
                      return <p key={idx} className="text-slate-700 leading-relaxed md:leading-loose text-xs md:text-sm">{trimmed}</p>;
                    })}
                  </article>

                  {/* Textbook Images Inline */}
                  {(() => {
                    const galleryImages = activeLesson.lessonImages?.filter(img => {
                      const imageId = img.id || img.title;
                      const isInline = activeLesson.content?.includes(`[image:${imageId}]`);
                      return !isInline;
                    }) || [];

                    if (galleryImages.length === 0) return null;

                    return (
                      <div className="space-y-4 pt-6 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-slate-950 flex items-center gap-1.5">
                            <ImageIcon size={14} className="text-indigo-600" />
                            <span>راهنمای تصویری و گام‌های عملی این درس</span>
                            <span className="text-[10px] text-slate-400 font-semibold">({galleryImages.length} تصویر مرجع)</span>
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {galleryImages.map((img, i) => (
                            <div
                              key={i}
                              className="group flex flex-col justify-between bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 transition-all shadow-sm cursor-pointer"
                              onClick={() => {
                                setSlideshowImages(galleryImages);
                                setSlideshowIndex(i);
                              }}
                            >
                              <div className="relative aspect-video bg-slate-50 overflow-hidden">
                                <img
                                  src={img.url}
                                  alt={img.title || ''}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-102 transition duration-300"
                                />
                                <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                                  تصویر {i + 1}
                                </div>
                              </div>
                              
                              <div className="p-3 bg-white flex-1 flex flex-col justify-between">
                                <h5 className="text-[10px] font-black text-slate-800 group-hover:text-indigo-600 transition">
                                  {img.title || `تصویر آموزشی ${i + 1}`}
                                </h5>
                                {img.description && (
                                  <p className="text-[9px] text-slate-500 font-semibold leading-relaxed mt-1 line-clamp-2">
                                    {img.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

            </div>

            {/* Sidebar Worksheet / Chat Column */}
            <div className={`flex-1 flex flex-col overflow-hidden bg-slate-50 ${activeLessonTab !== 'textbook' ? 'block' : 'hidden'}`}>
              
              {/* Tab Switcher (hidden since managed by top-level switcher) */}
              <div className="hidden border-b border-slate-200 bg-white shrink-0">
                <button
                  onClick={() => setStudentTab('lessons')}
                  className={`flex-1 py-3 text-center text-xs font-black transition-all border-b-2 ${
                    studentTab === 'lessons'
                      ? 'border-indigo-600 text-indigo-600 font-extrabold'
                      : 'border-transparent text-slate-500'
                  }`}
                >
                  چالش‌ها و پاسخ شما
                </button>
                <button
                  onClick={() => setStudentTab('chat')}
                  className={`flex-1 py-3 text-center text-xs font-black transition-all border-b-2 flex items-center justify-center gap-1.5 ${
                    studentTab === 'chat'
                      ? 'border-indigo-600 text-indigo-600 font-extrabold'
                      : 'border-transparent text-slate-500'
                  }`}
                >
                  <Sparkles size={14} className="text-indigo-600" />
                  <span>مربی هوش مصنوعی (AI)</span>
                </button>
              </div>

              {/* Sub Tab: Answer worksheet */}
              {studentTab === 'lessons' ? (() => {
                const activeLessonIndex = myLevelLessons.findIndex(l => l.id === activeLesson.id);
                const lastCompletedIndex = myLevelLessons.reduce((acc, l, i) => {
                  const completed = isLessonIdCompleted(l.id);
                  return completed ? i : acc;
                }, -1);

                // Check if the exercise is unlocked
                const isExerciseUnlocked = activeLessonIndex === 0 || myLevelLessons.slice(0, activeLessonIndex).every(prevL => isLessonIdCompleted(prevL.id));

                if (!isExerciseUnlocked) {
                  return (
                    <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center bg-slate-50 space-y-4">
                      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 max-w-[320px] mt-8">
                        <span className="text-3xl block">🔒</span>
                        <h4 className="text-xs font-black text-slate-900">تمرینات این بخش هنوز باز نشده است</h4>
                        <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                          برای دسترسی به سوالات و ارسال تمارین این درس، شما باید ابتدا تمرینات دروس پیشین این دوره را با موفقیت حل کرده و تایید مربی را دریافت کنید.
                        </p>
                        <div className="bg-indigo-50/60 border border-indigo-100 p-2.5 rounded-xl text-[9px] text-indigo-700 font-bold leading-relaxed">
                          💡 درس فعال فعلی شما: <strong className="text-slate-900">{myLevelLessons[lastCompletedIndex + 1]?.title || 'شروع اولین درس'}</strong>
                        </div>
                        <button
                          onClick={() => {
                            const nextL = myLevelLessons[lastCompletedIndex + 1] || myLevelLessons[0];
                            if (nextL) {
                              setSelectedLessonId(nextL.id);
                            }
                          }}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2 rounded-xl text-[10px] transition-colors"
                        >
                          انتقال به درس در حال مطالعه
                        </button>
                      </div>
                    </div>
                  );
                }

                const lastSub = studentSubmissions
                  .filter(s => s.lessonId === activeLesson.id)
                  .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];
                const isCompleted = lastSub?.status === 'reviewed' && (lastSub.gradedBy === 'teacher' || lastSub.gradedBy === 'assistant') && !lastSub.isTryAgainRequested;
                const isTeacherTryAgain = lastSub?.status === 'reviewed' && (lastSub.gradedBy === 'teacher' || lastSub.gradedBy === 'assistant') && lastSub.isTryAgainRequested;
                const isPending = lastSub?.status === 'pending';
                const isPendingWithAssistantReview = isPending && lastSub?.assistantGrade !== undefined;
                const isPendingWaitingForAssistant = isPending && lastSub?.assistantGrade === undefined;
                
                const isPendingWaitingForTeacher = isPending && !lastSub?.assistantTryAgain;
                const disabled = isCompleted;

                return (
                  <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full" dir="rtl">
                    <div className="space-y-1">
                      <h3 className="text-xs font-black text-slate-900">چالش‌ها و کارهای درسی</h3>
                      <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">برای تکمیل درس، شرایط پاسخگویی را خوانده و با ابزارهای زیر تمرینات را حل کنید.</p>
                    </div>

                    {submissionSuccessMessage && (
                      <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-2xl text-[11px] leading-relaxed font-bold">
                        {submissionSuccessMessage}
                      </div>
                    )}

                    {dailyLimitError && (
                      <div className="p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-2xl text-[11px] leading-relaxed font-bold">
                        ⚠️ {dailyLimitError}
                      </div>
                    )}

                    {isCompleted && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3 text-emerald-950">
                        <div className="flex justify-between items-center">
                          <span className="font-black text-xs text-emerald-900 flex items-center gap-1.5">
                            <CheckCircle2 size={16} className="text-emerald-600" />
                            <span>✓ تایید نهایی کارنامه توسط {lastSub.gradedBy === 'assistant' ? 'دستیار استاد' : 'استاد'}</span>
                          </span>
                          <span className="text-[9px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-black">
                            امتیاز نهایی: {lastSub.grade} / {lastSub.maxPoints}
                          </span>
                        </div>
                        {lastSub.feedback && (
                          <div className="p-2.5 bg-white rounded-xl border border-emerald-100 text-[11px] text-slate-800 font-semibold leading-relaxed">
                            <strong>💬 بازخورد رسمی {lastSub.gradedBy === 'assistant' ? 'دستیار استاد' : 'استاد'}:</strong> {lastSub.feedback}
                          </div>
                        )}
                        <p className="text-[10px] text-emerald-800 font-bold leading-relaxed bg-emerald-100/40 p-2.5 rounded-xl border border-emerald-100">
                          🎉 این درس رسماً توسط {lastSub.gradedBy === 'assistant' ? 'دستیار استاد' : 'مدرس شما'} تایید نهایی شده است و به عنوان تکلیف گذرانده شده علامت‌گذاری شد. چالش‌های این بخش قفل شده‌اند.
                        </p>
                      </div>
                    )}

                    {!isCompleted && isTeacherTryAgain && (
                      <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-rose-950">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-xs text-rose-900 flex items-center gap-1">
                            <span>🔁 درخواست تلاش مجدد (Try Again) - توسط {lastSub.gradedBy === 'assistant' ? 'دستیار استاد' : 'استاد'}</span>
                          </span>
                          <span className="text-[8px] bg-rose-200 text-rose-950 px-2 py-0.5 rounded-full font-black">
                            {lastSub.gradedBy === 'assistant' ? 'دستیار کلاس' : 'مدرس کلاس'}
                          </span>
                        </div>
                        <p className="text-[10px] font-semibold leading-relaxed">
                          {lastSub.gradedBy === 'assistant' ? 'دستیار استاد' : 'استاد'} پاسخ قبلی شما را ارزیابی کرده و درخواست اصلاح یا تکمیل پاسخ‌ها را داده‌اند. نمره قبلی ثبت‌شده: {lastSub.grade} از {lastSub.maxPoints} امتیاز.
                        </p>
                        {lastSub.feedback && (
                          <div className="p-2.5 bg-white rounded-xl border border-rose-150 text-[11px] text-slate-800 font-semibold leading-relaxed">
                            <strong className="text-slate-950 block mb-1">💬 راهنمایی و بازخورد {lastSub.gradedBy === 'assistant' ? 'دستیار استاد' : 'مدرس'}:</strong>
                            {lastSub.feedback}
                          </div>
                        )}
                        <p className="text-[9px] text-rose-800 font-black animate-pulse">
                          لطفا پاسخ‌های خود را طبق نظر {lastSub.gradedBy === 'assistant' ? 'دستیار' : 'استاد'} اصلاح کنید و دوباره دکمه ارسال را بفشارید.
                        </p>
                      </div>
                    )}

                    {!isCompleted && !isTeacherTryAgain && isPendingWithAssistantReview && (
                      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-950">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-xs text-indigo-900 flex items-center gap-1.5">
                            <span>⧗ پاسخ‌ها ارسال شد و ارزیابی اولیه آماده است</span>
                          </span>
                          <span className="text-[8px] bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-black">
                            دستیار هوشمند مربی
                          </span>
                        </div>
                        <p className="text-[10px] font-semibold leading-relaxed mt-1.5">
                          تحلیل اولیه پاسخ‌های شما توسط دستیار هوش مصنوعی آماده شده است. به دلیل رعایت تمرکز در حل چالش‌ها، جزییات این راهنما و نمره تخمینی تنها از طریق کلیک روی زنگوله 🔔 در بالای صفحه قابل دسترس است.
                        </p>
                        <p className="text-[9px] text-indigo-800 font-bold mt-2 animate-pulse">
                          هم‌اکنون می‌توانید پاسخ خود را مجدداً اصلاح و ارسال کنید، یا منتظر تصحیح و ثبت کارنامه نهایی توسط مربی بمانید.
                        </p>
                      </div>
                    )}



                    <div className="space-y-4">
                      {activeLesson.questions.map((q) => {
                        const answerValue = studentAnswers[q.id] || '';
                        return (
                          <div key={q.id} className="bg-white p-4 border border-slate-200 rounded-2xl shadow-sm space-y-3">
                            <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                              <div>
                                <h4 className="text-xs font-black text-slate-800">{q.title}</h4>
                                <span className="text-[8px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md mt-1 inline-block">
                                  {renderAnswerTypeLabel(q.answerType)}
                                </span>
                              </div>
                              <span className="text-[9px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                {q.points} امتیاز
                              </span>
                            </div>

                            <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">{q.description}</p>

                            {/* Dynamic Inputs according to answer conditions */}
                            {q.answerType === 'text' && (
                              <textarea
                                value={answerValue}
                                disabled={disabled}
                                onChange={(e) => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                placeholder="توضیحات پاسخ را اینجا تایپ کنید..."
                                className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none placeholder:text-slate-400 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            )}

                            {q.answerType === 'code_editor' && (
                              <AdvancedCodeEditor
                                value={answerValue}
                                disabled={disabled}
                                onChange={(val) => setStudentAnswers(prev => ({ ...prev, [q.id]: val }))}
                              />
                            )}

                            {q.answerType === 'notebook_photo' && (
                              <NotebookCameraCapture
                                value={answerValue}
                                disabled={disabled}
                                onChange={(base64) => setStudentAnswers(prev => ({ ...prev, [q.id]: base64 }))}
                              />
                            )}

                            {q.answerType === 'handwritten_photo' && (
                              <DrawingCanvas
                                value={answerValue}
                                disabled={disabled}
                                onChange={(base64) => setStudentAnswers(prev => ({ ...prev, [q.id]: base64 }))}
                              />
                            )}

                            {q.answerType === 'audio_recording' && (
                              <AudioRecorder
                                value={answerValue}
                                disabled={disabled}
                                onChange={(base64) => setStudentAnswers(prev => ({ ...prev, [q.id]: base64 }))}
                              />
                            )}

                            {q.answerType === 'mission_url' && (
                              <div className="space-y-1.5">
                                <input
                                  type="url"
                                  value={answerValue}
                                  disabled={disabled}
                                  onChange={(e) => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                  placeholder="https://my-project-url.vercel.app"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:outline-none placeholder:text-slate-400 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <p className="text-[8px] text-slate-400 font-bold">آدرس لینک گیت‌هاب، ورسل یا هاست شخصی پروژه خود را وارد کنید.</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Submission triggers */}
                    <div className="pt-4 pb-8">
                      {(() => {
                        const todayStr = new Date().toLocaleDateString('en-US');
                        const todaySubs = studentSubmissions.filter(s => {
                          try {
                            return new Date(s.submittedAt).toLocaleDateString('en-US') === todayStr;
                          } catch {
                            return false;
                          }
                        });
                        const uniqueLessonsSubmittedToday = new Set(todaySubs.map(s => s.lessonId));
                        const hasAlreadySubmittedThisLessToday = uniqueLessonsSubmittedToday.has(activeLesson.id);
                        const isDailyLimitReached = uniqueLessonsSubmittedToday.size >= 2 && !hasAlreadySubmittedThisLessToday;

                        return (
                          <>
                            {isDailyLimitReached && (
                              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-[10px] font-bold leading-relaxed flex items-start gap-2">
                                <span className="text-sm shrink-0">⏳</span>
                                <span>شما امروز دو تا چالش را حل کردی و چالش‌های درس سوم را نمی‌توانی حل کنی، باید صبر کنی فردا حلش کنی</span>
                              </div>
                            )}
                            {isCompleted ? (
                              <button
                                disabled
                                className="w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-black transition cursor-not-allowed shadow flex items-center justify-center gap-1.5"
                              >
                                <CheckCircle2 size={16} />
                                <span>✓ چالش‌های این درس با موفقیت تایید و ثبت نهایی شده است</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  if (isDailyLimitReached) {
                                    setDailyLimitError('شما امروز دو تا چالش را حل کردی و چالش‌های درس سوم را نمی‌توانی حل کنی، باید صبر کنی فردا حلش کنی');
                                    return;
                                  }
                                  handleStudentSubmit(activeLesson);
                                }}
                                disabled={isSubmittingAnswers || isDailyLimitReached}
                                className="w-full py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black transition shadow disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isSubmittingAnswers 
                                  ? 'در حال ارسال پاسخ‌ها...' 
                                  : isPending
                                    ? 'به‌روزرسانی و ارسال مجدد پاسخ‌ها (ویرایش پاسخ قبلی)'
                                    : isTeacherTryAgain 
                                      ? 'ارسال مجدد پاسخ‌های تصحیح‌شده به مدرس' 
                                      : lastSub?.assistantTryAgain
                                        ? 'ارسال مجدد پاسخ‌های اصلاح‌شده به استادیار/استاد'
                                        : 'ارسال تمامی پاسخ‌ها به مدرس'}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                );
              })() : (
                
                // Sub Tab: Teacher-Student Private Chat (WhatsApp Style)
                (() => {
                  const activeCourse = courses.find(c => c.id === activeLesson.courseId);
                  const courseTeacherId = activeCourse?.teacherId || 'teacher_1';
                  const teacherUser = users.find(u => u.id === courseTeacherId);
                  const teacherName = teacherUser ? teacherUser.name : 'استاد';
                  const teacherRole = teacherUser?.role === 'teacher' ? 'مدرس ارشد دوره' : 'مربی کلاسی';

                  const myConversations = directMessages.filter(msg => 
                    (msg.senderId === currentUser.id && msg.receiverId === courseTeacherId) ||
                    (msg.senderId === courseTeacherId && msg.receiverId === currentUser.id)
                  );

                  return (
                    <div className="flex-1 flex flex-col justify-between overflow-hidden bg-slate-50">
                      
                      {/* Teacher Profile Info Bar */}
                      <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0" dir="rtl">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold text-sm border border-indigo-200">
                            👨‍🏫
                          </div>
                          <div className="text-right">
                            <h4 className="text-xs font-black text-slate-800">{teacherName}</h4>
                            <p className="text-[9px] text-slate-400 font-bold">{teacherRole}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse block"></span>
                          <span className="text-[9px] text-emerald-700 font-bold">پشتیبانی فعال مدرس</span>
                        </div>
                      </div>

                      {/* Message Feed */}
                      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl mx-auto w-full animate-fadeIn" dir="rtl">
                        <div className="bg-slate-100/80 p-3 rounded-2xl border border-slate-200/50 text-[10px] text-slate-600 font-bold leading-relaxed text-center">
                          🔒 گفتگو با استاد کاملاً خصوصی و دوطرفه است. هرگونه سوال یا اشکال خود را در قالب متن، پیام صوتی، تصویر یا فایل سند مطرح کنید.
                        </div>

                        {myConversations.map((msg) => {
                          const isMe = msg.senderId === currentUser.id;
                          return (
                            <div
                              key={msg.id}
                              className={`flex gap-2 max-w-[85%] ${
                                isMe ? 'mr-auto flex-row-reverse' : 'ml-auto'
                              }`}
                            >
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold border ${
                                isMe ? 'bg-slate-900 text-white border-slate-800' : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                              }`}>
                                {isMe ? 'من' : 'استاد'}
                              </div>
                              
                              <div className="flex flex-col space-y-1">
                                <div className={`p-3 rounded-2xl text-[11px] leading-relaxed font-semibold shadow-sm ${
                                  isMe
                                    ? 'bg-indigo-600 text-white rounded-tr-none'
                                    : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                                }`}>
                                  
                                  {/* Text messages */}
                                  {msg.attachmentType !== 'image' && msg.attachmentType !== 'audio' && msg.attachmentType !== 'document' && (
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                  )}

                                  {/* Image message */}
                                  {msg.attachmentType === 'image' && msg.attachmentUrl && (
                                    <div className="space-y-1.5">
                                      <img 
                                        src={msg.attachmentUrl} 
                                        alt={msg.fileName || 'تصویر ارسالی'} 
                                        referrerPolicy="no-referrer"
                                        onClick={() => setPreviewImageUrl(msg.attachmentUrl || null)}
                                        className="max-w-[200px] md:max-w-xs rounded-lg border border-white/20 hover:opacity-90 transition cursor-pointer max-h-48 object-cover"
                                      />
                                      <p className="text-[10px] opacity-90 font-bold whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                  )}

                                  {/* Voice message */}
                                  {msg.attachmentType === 'audio' && msg.attachmentUrl && (
                                    <div className="flex items-center gap-3.5 py-1 min-w-[180px]" dir="ltr">
                                      <button
                                        type="button"
                                        onClick={() => playDmMidAudio(msg.id, msg.attachmentUrl!)}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                          isMe 
                                            ? 'bg-white/20 hover:bg-white/30 text-white' 
                                            : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                                        }`}
                                      >
                                        {playingDmMid === msg.id ? (
                                          <span className="flex items-center gap-0.5">
                                            <span className="w-1 bg-current h-3 rounded animate-pulse"></span>
                                            <span className="w-1 bg-current h-4 rounded animate-pulse"></span>
                                            <span className="w-1 bg-current h-3 rounded animate-pulse"></span>
                                          </span>
                                        ) : (
                                          <span className="text-xs">▶</span>
                                        )}
                                      </button>
                                      
                                      <div className="flex-1 flex flex-col">
                                        <div className="flex items-center gap-1">
                                          <Volume2 size={13} className="opacity-80" />
                                          <span className="text-[10px] font-black">{msg.content}</span>
                                        </div>
                                        <div className="w-full bg-current/20 h-1 rounded-full mt-1.5 relative overflow-hidden">
                                          <div className={`h-full bg-current rounded-full ${playingDmMid === msg.id ? 'w-full transition-all duration-[8s] ease-linear' : 'w-0'}`} />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Document message */}
                                  {msg.attachmentType === 'document' && msg.attachmentUrl && (
                                    <div className="flex items-center gap-3 py-1">
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                        isMe ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'
                                      }`}>
                                        <File size={16} />
                                      </div>
                                      <div className="text-right flex-1 min-w-0">
                                        <span className="text-[10px] block font-black truncate">{msg.fileName || 'فایل سند'}</span>
                                        <a
                                          href={msg.attachmentUrl}
                                          download={msg.fileName || 'document.pdf'}
                                          className={`text-[9px] font-bold underline ${
                                            isMe ? 'text-indigo-100 hover:text-white' : 'text-indigo-600 hover:text-indigo-800'
                                          }`}
                                        >
                                          دانلود و مشاهده
                                        </a>
                                      </div>
                                    </div>
                                  )}

                                </div>
                                
                                <div className="text-[8px] text-slate-400 font-bold flex items-center gap-1 px-1 justify-end">
                                  <span>{new Date(msg.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                                  {isMe && <Check size={8} className="text-indigo-500" />}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {myConversations.length === 0 && (
                          <div className="text-center py-16 px-4 space-y-3">
                            <span className="text-4xl">💬</span>
                            <h4 className="text-xs font-black text-slate-700">شروع گفتگو با مدرس</h4>
                            <p className="text-[10px] text-slate-400 font-semibold max-w-sm mx-auto leading-relaxed">
                              هنوز پیامی رد و بدل نشده است. سوالات، تصاویر کدهای خود، یا ابهامات درس‌نامه را به صورت متنی یا صوتی بفرستید تا استاد مستقیماً شما را راهنمایی کند.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Inputs panel */}
                      <div className="p-3 border-t border-slate-200 bg-white" dir="rtl">
                        <div className="max-w-4xl mx-auto">
                          
                          {isRecordingVoice ? (
                            <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-2 rounded-2xl animate-pulse">
                              <div className="flex items-center gap-2.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 block animate-bounce"></span>
                                <span className="text-xs font-black text-rose-700">در حال ضبط صدای شما...</span>
                                <span className="text-xs font-mono font-bold bg-rose-200/60 px-2 py-0.5 rounded-full text-rose-950">
                                  {Math.floor(voiceSeconds / 60)}:{(voiceSeconds % 60).toString().padStart(2, '0')}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={stopAndSendVoiceRecording}
                                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black transition shadow"
                                >
                                  توقف و ارسال پیام
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelVoiceRecording}
                                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-[10px] font-bold transition"
                                >
                                  لغو ضبط
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input 
                                type="file" 
                                id="dm-image-uploader" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => handleFileAttachment(e, 'image')} 
                              />
                              <input 
                                type="file" 
                                id="dm-doc-uploader" 
                                accept=".pdf,.doc,.docx,.txt,.zip,.rar" 
                                className="hidden" 
                                onChange={(e) => handleFileAttachment(e, 'document')} 
                              />

                              <label
                                htmlFor="dm-image-uploader"
                                className="w-9 h-9 border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-slate-50 rounded-xl flex items-center justify-center transition cursor-pointer shrink-0"
                                title="ارسال تصویر (کدها، ارورها)"
                              >
                                <ImageIcon size={14} />
                              </label>

                              <label
                                htmlFor="dm-doc-uploader"
                                className="w-9 h-9 border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-slate-50 rounded-xl flex items-center justify-center transition cursor-pointer shrink-0"
                                title="ارسال سند یا پی‌دی‌اف"
                              >
                                <Paperclip size={14} />
                              </label>

                              <button
                                type="button"
                                onClick={startVoiceRecording}
                                className="w-9 h-9 border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 rounded-xl flex items-center justify-center transition shrink-0"
                                title="ارسال پیام صوتی (توضیح سوال)"
                              >
                                <Mic size={14} />
                              </button>

                              <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSendDirectMsg();
                                }}
                                placeholder="سوال یا پیام خود را برای مدرس بنویسید..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none font-medium transition-all"
                              />

                              <button
                                onClick={handleSendDirectMsg}
                                disabled={!chatInput.trim()}
                                className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center justify-center transition disabled:opacity-50 shrink-0 shadow-md shadow-indigo-100"
                              >
                                <Send size={14} className="transform rotate-180" />
                              </button>
                            </div>
                          )}

                        </div>
                      </div>

                    </div>
                  );
                })()
              )}

            </div>

          </div>
        )}

      </main>

      {/* ======================================================== */}
      {/* ======================================================== */}
      {/* TEXTBOOK IMAGE & STEP-BY-STEP SLIDESHOW MODAL */}
      {/* ======================================================== */}
      {previewImageUrl && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewImageUrl(null)}>
          <div className="max-w-4xl w-full max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-10 left-0 text-white hover:text-slate-300 flex items-center gap-1 text-xs font-bold bg-slate-900/50 backdrop-blur px-3 py-1.5 rounded-lg transition"
            >
              <X size={16} />
              <span>بستن تصویر</span>
            </button>
            <img src={previewImageUrl} alt="مشاهده کتاب درسی" className="w-full h-auto max-h-[80vh] object-contain rounded-2xl bg-black border border-slate-800 shadow-2xl" />
          </div>
        </div>
      )}

      {slideshowImages.length > 0 && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur z-50 flex flex-col justify-between p-4 md:p-6" onClick={() => setSlideshowImages([])}>
          
          {/* Header */}
          <div className="flex items-center justify-between w-full text-white bg-slate-900/40 backdrop-blur-md p-4 rounded-2xl border border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 font-semibold">
              <span className="text-[10px] md:text-xs bg-indigo-600 font-black px-3 py-1 rounded-full text-white font-mono">
                گام {slideshowIndex + 1} از {slideshowImages.length}
              </span>
              <h4 className="text-xs md:text-sm font-black text-slate-100">
                {slideshowImages[slideshowIndex]?.title || 'راهنمای گام‌به‌گام درس'}
              </h4>
            </div>
            
            <button
              onClick={() => setSlideshowImages([])}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* Main Stage */}
          <div className="flex-1 flex items-center justify-center relative my-4" onClick={(e) => e.stopPropagation()}>
            {/* Left/Prev button */}
            {slideshowIndex > 0 && (
              <button
                onClick={() => setSlideshowIndex(idx => idx - 1)}
                className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-3 bg-slate-900/80 hover:bg-indigo-600 rounded-full text-white transition z-10 border border-slate-800 hover:border-indigo-400"
              >
                <ChevronRight size={24} />
              </button>
            )}

            {/* Image viewer */}
            <div className="max-w-4xl w-full max-h-[70vh] flex items-center justify-center px-8">
              <img
                src={slideshowImages[slideshowIndex]?.url}
                alt=""
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[70vh] object-contain rounded-2xl border border-slate-800 shadow-2xl bg-slate-950 select-none"
              />
            </div>

            {/* Right/Next button */}
            {slideshowIndex < slideshowImages.length - 1 && (
              <button
                onClick={() => setSlideshowIndex(idx => idx + 1)}
                className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-3 bg-slate-900/80 hover:bg-indigo-600 rounded-full text-white transition z-10 border border-slate-800 hover:border-indigo-400"
              >
                <ChevronLeft size={24} />
              </button>
            )}
          </div>

          {/* Description Footer & Dots */}
          <div className="w-full bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-3xl p-4 md:p-5 flex flex-col items-center text-center gap-3" onClick={(e) => e.stopPropagation()}>
            {slideshowImages[slideshowIndex]?.description && (
              <p className="text-xs md:text-sm text-slate-300 font-bold max-w-3xl leading-relaxed">
                {slideshowImages[slideshowIndex].description}
              </p>
            )}

            {/* Step Indicators */}
            <div className="flex items-center gap-1.5 pt-1">
              {slideshowImages.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setSlideshowIndex(idx)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    idx === slideshowIndex ? 'w-6 bg-indigo-500' : 'w-2.5 bg-slate-700 hover:bg-slate-500'
                  }`}
                />
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ======================================================== */}
      {/* MULTIPLE AUDIO EXPLANATIONS LIST MODAL */}
      {/* ======================================================== */}
      {isAudioListModalOpen && activeLesson && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeAudioModal}>
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 max-w-lg w-full relative text-right animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closeAudioModal}
              className="absolute top-4 left-4 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 hover:text-slate-800 transition"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <span className="text-lg">🔊</span>
              <h3 className="text-sm font-black text-slate-900">صوت‌های توضیحی این درس</h3>
            </div>

            <p className="text-[10px] text-slate-400 font-semibold mb-4 leading-relaxed">
              توضیحات ضبط‌شده مربی برای این بخش را گوش دهید تا مفاهیم را بهتر فرا بگیرید.
            </p>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {/* Default default audio explanation url */}
              {activeLesson.audioExplanationUrl && (
                <div className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                  playingAudioUrl === activeLesson.audioExplanationUrl
                    ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                    : 'bg-slate-50 border-slate-150 hover:bg-slate-100/70'
                }`}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      playingAudioUrl === activeLesson.audioExplanationUrl ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-200 text-slate-600'
                    }`}>
                      <Volume2 size={15} />
                    </div>
                    <div className="text-right min-w-0 flex-1">
                      <span className="text-xs font-black text-slate-800 block truncate">توضیحات صوتی اصلی درس</span>
                      <span className="text-[8px] text-indigo-600 font-bold block mt-0.5">صوت پیش‌فرض مربی</span>
                    </div>
                  </div>

                  <button
                    onClick={() => playAudioItem(activeLesson.audioExplanationUrl!)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition ${
                      playingAudioUrl === activeLesson.audioExplanationUrl
                        ? 'bg-slate-900 hover:bg-black text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {playingAudioUrl === activeLesson.audioExplanationUrl ? '⏹ توقف پخش' : '▶ پخش صوت'}
                  </button>
                </div>
              )}

              {/* Multi audios uploaded */}
              {activeLesson.audioExplanations && activeLesson.audioExplanations.map((audio, idx) => (
                <div key={idx} className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                  playingAudioUrl === audio.url
                    ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                    : 'bg-slate-50 border-slate-150 hover:bg-slate-100/70'
                }`}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      playingAudioUrl === audio.url ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-200 text-slate-600'
                    }`}>
                      <Volume2 size={15} />
                    </div>
                    <div className="text-right min-w-0 flex-1">
                      <span className="text-xs font-black text-slate-800 block truncate">{audio.title || `توضیح صوتی شماره ${idx + 1}`}</span>
                      <span className="text-[8px] text-slate-400 font-bold block mt-0.5">فایل صوتی ضمیمه شده</span>
                    </div>
                  </div>

                  <button
                    onClick={() => playAudioItem(audio.url)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${
                      playingAudioUrl === audio.url
                        ? 'bg-slate-900 hover:bg-black text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {playingAudioUrl === audio.url ? '⏹ توقف پخش' : '▶ پخش صوت'}
                  </button>
                </div>
              ))}

              {!activeLesson.audioExplanationUrl && (!activeLesson.audioExplanations || activeLesson.audioExplanations.length === 0) && (
                <div className="p-6 text-center text-slate-400 text-xs font-bold bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  هیچ فایل صوتی برای این درس ثبت نشده است.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MULTIPLE SUPPLEMENTARY VIDEOS LIST MODAL */}
      {/* ======================================================== */}
      {isVideoListModalOpen && activeLesson && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsVideoListModalOpen(false)}>
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 max-w-2xl w-full relative text-right animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setIsVideoListModalOpen(false)}
              className="absolute top-4 left-4 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 hover:text-slate-800 transition"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <span className="text-lg">📺</span>
              <h3 className="text-sm font-black text-slate-900">ویدیوهای مکمل درس</h3>
            </div>

            <p className="text-[10px] text-slate-400 font-semibold mb-4 leading-relaxed">
              جهت تعمیق مفاهیم، فیلم‌های آموزشی و کدهای ضمیمه شده را مشاهده نمایید.
            </p>

            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {(() => {
                const allVideos: Array<{ title: string; url: string; isDefault?: boolean }> = [];
                if (activeLesson.youtubeUrl) {
                  allVideos.push({ title: 'ویدیوی آموزشی اصلی درس', url: activeLesson.youtubeUrl, isDefault: true });
                }
                if (activeLesson.youtubeVideos) {
                  activeLesson.youtubeVideos.forEach(v => {
                    allVideos.push({ title: v.title, url: v.url });
                  });
                }

                return allVideos.map((video, idx) => {
                  const embedUrl = getYoutubeEmbedUrl(video.url);

                  return (
                    <div key={idx} className="p-4 bg-slate-50 hover:bg-slate-100/50 border border-slate-150 rounded-2xl space-y-3 transition-all">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="text-right flex-1 min-w-0">
                          <span className="text-xs font-black text-slate-900 block leading-relaxed">{video.title}</span>
                          <span className="text-[8px] text-rose-600 font-bold block mt-1">
                            {video.isDefault ? '🎞 ویدیوی مرجع درس' : '🔗 ویدیوی تکمیلی موضوع'}
                          </span>
                        </div>

                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-black rounded-xl border border-rose-100 transition-all shadow-sm"
                        >
                          <Youtube size={13} />
                          <span>مشاهده مستقیم در یوتیوب ↗</span>
                        </a>
                      </div>

                      {embedUrl ? (
                        <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-black">
                          <iframe
                            src={embedUrl}
                            title={video.title}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <p className="text-[9px] text-slate-400 font-bold">
                          امکان نمایش مستقیم برای این لینک مقدور نیست. لطفا از دکمه بالا برای مشاهده در سایت یوتیوب استفاده کنید.
                        </p>
                      )}
                    </div>
                  );
                });
              })()}

              {!activeLesson.youtubeUrl && (!activeLesson.youtubeVideos || activeLesson.youtubeVideos.length === 0) && (
                <div className="p-6 text-center text-slate-400 text-xs font-bold bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  هیچ ویدیو آموزشی برای این درس ثبت نشده است.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MULTIPLE PDF RESOURCES LIST MODAL */}
      {/* ======================================================== */}
      {isPdfListModalOpen && activeLesson && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsPdfListModalOpen(false)}>
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 max-w-lg w-full relative text-right animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setIsPdfListModalOpen(false)}
              className="absolute top-4 left-4 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 hover:text-slate-800 transition"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <span className="text-lg">📄</span>
              <h3 className="text-sm font-black text-slate-900">جزوات و فایل‌های PDF درس</h3>
            </div>

            <p className="text-[10px] text-slate-400 font-semibold mb-4 leading-relaxed">
              فایل‌های PDF و جزوات مکمل درس‌نامه را دانلود کنید تا بتوانید آن‌ها را در گوشی، تبلت یا رایانه خود ذخیره و مطالعه نمایید.
            </p>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {activeLesson.pdfResources && activeLesson.pdfResources.map((pdf, idx) => (
                <div key={idx} className="p-3.5 bg-slate-50 hover:bg-slate-100/70 border border-slate-150 rounded-2xl flex items-center justify-between gap-3 transition-all">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                      <FileText size={15} />
                    </div>
                    <div className="text-right min-w-0 flex-1">
                      <span className="text-xs font-black text-slate-800 block truncate">{pdf.title || `جزوه شماره ${idx + 1}`}</span>
                      <span className="text-[8px] text-emerald-600 font-bold block mt-0.5">فایل PDF آماده دانلود</span>
                    </div>
                  </div>

                  <a
                    href={pdf.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-black transition-all shadow-sm flex items-center gap-1 shrink-0"
                  >
                    <Download size={12} />
                    <span>دانلود جزوه</span>
                  </a>
                </div>
              ))}

              {(!activeLesson.pdfResources || activeLesson.pdfResources.length === 0) && (
                <div className="p-6 text-center text-slate-400 text-xs font-bold bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  هیچ فایل PDF یا جزوه‌ای برای این درس ثبت نشده است.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RATING MODAL POPUP */}
      {ratingModalCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Star className="text-amber-500 fill-current w-5 h-5" />
                <span>ثبت نظر و ستاره رضایت از صنف آموزشی</span>
              </h3>
              <button 
                onClick={() => setRatingModalCourse(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1">
              <span className="block text-[10px] text-slate-400 font-extrabold uppercase">صنف درسی انتخابی</span>
              <strong className="text-xs font-black text-slate-800">{ratingModalCourse.title}</strong>
            </div>

            {/* Interactive Stars */}
            <div className="space-y-2">
              <span className="block text-[10px] text-slate-400 font-extrabold uppercase">میزان رضایت و کیفیت صنف</span>
              <div className="flex gap-2 justify-center py-2 bg-slate-50 border border-slate-100 rounded-2xl">
                {[1, 2, 3, 4, 5].map((starVal) => (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => setRatingStars(starVal)}
                    className="p-1 hover:scale-125 transition-transform cursor-pointer"
                  >
                    <Star 
                      size={28} 
                      className={`${
                        starVal <= ratingStars 
                          ? 'text-amber-500 fill-current' 
                          : 'text-slate-200 hover:text-amber-200'
                      } transition-colors`} 
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Comment Area */}
            <div className="space-y-1">
              <span className="block text-[10px] text-slate-400 font-extrabold uppercase">توضیحات یا پیشنهاد شما (اختیاری)</span>
              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="لطفاً نظر گران‌بهای خود را درباره تدریس مربی و کیفیت تمرینات صنف بنویسید..."
                className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRatingModalCourse(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-black text-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleRatingSubmit}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md shadow-indigo-100 transition-all cursor-pointer"
              >
                ثبت و ارسال امتیاز
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* --- Socratic AI Mentor "Vardak" Layout Components --- */}
      {/* ========================================== */}

      {/* 1. Socratic Direct Chat Draggable Modal */}
      {isVardakChatOpen && (
        <div
          className={`fixed z-[9999] bg-white/95 backdrop-blur-xl border-2 border-indigo-400 rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 select-none hover:shadow-indigo-100/50 ${
            isChatFullscreen 
              ? 'top-4 left-4 right-4 bottom-4 md:top-8 md:left-8 md:right-8 md:bottom-8' 
              : ''
          }`}
          style={isChatFullscreen ? { direction: 'rtl' } : {
            left: vardakChatPos.x,
            top: vardakChatPos.y,
            width: '400px',
            height: '520px',
            direction: 'rtl'
          }}
        >
          {/* Header */}
          <div 
            onMouseDown={handleChatDragStart}
            className={`bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-sm ${
              isChatFullscreen ? 'cursor-default' : 'cursor-move'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">💬</span>
              <div className="text-right">
                <span className="block text-[8px] text-indigo-600 font-extrabold uppercase tracking-widest">گفتگوی مستقیم با مربی لومینا</span>
                <span className="text-xs font-black text-slate-900">مربی راهنمای لومینا</span>
              </div>
            </div>
            
            {/* Header Actions */}
            <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setIsChatFullscreen(!isChatFullscreen)}
                className="p-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                title={isChatFullscreen ? "کوچک کردن صفحه" : "بزرگ کردن صفحه"}
              >
                {isChatFullscreen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsVardakChatOpen(false)}
                className="p-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-red-600 transition-all cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Messages Thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 select-text">
            {vardakChatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 max-w-[85%] ${msg.sender === 'user' ? 'mr-auto flex-row-reverse' : 'ml-auto'}`}
              >
                {msg.sender === 'vardak' && (
                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-xs shrink-0 border border-amber-200">
                    {msg.emotion || '💡'}
                  </div>
                )}
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed font-bold flex flex-col ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-sm'
                      : 'bg-white border border-slate-150 text-slate-800 rounded-tl-none shadow-sm'
                  }`}
                >
                  {/* Text Message Content */}
                  {msg.text && <p className="whitespace-pre-line">{msg.text}</p>}

                  {/* Rich Image Attachment */}
                  {msg.image && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-slate-150/80 bg-slate-100 max-w-[240px]">
                      <img 
                        src={msg.image} 
                        alt="طرح پیوست‌شده" 
                        className="w-full h-auto max-h-40 object-cover cursor-zoom-in"
                        onClick={() => window.open(msg.image)}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}

                  {/* Rich Audio Attachment */}
                  {msg.audioUrl && (
                    <div className="mt-2 bg-slate-50 border border-slate-150 p-1.5 rounded-xl flex items-center gap-2 max-w-[260px] ltr">
                      <Volume2 size={13} className="text-indigo-600 shrink-0" />
                      <audio src={msg.audioUrl} controls className="w-full h-6 outline-none text-[10px]" />
                    </div>
                  )}

                  {/* Rich PDF Attachment */}
                  {msg.pdf && (
                    <div className="mt-2 bg-slate-50 border border-slate-150 p-2 rounded-xl flex items-center justify-between gap-2 max-w-[260px] text-right">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <FileText size={16} className="text-indigo-600 shrink-0" />
                        <div className="overflow-hidden">
                          <span className="block text-[9px] font-black text-indigo-950 truncate">{msg.pdf.name}</span>
                          <span className="block text-[7px] font-bold text-slate-400">{msg.pdf.size}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => alert(`دانلود سند آموزشی "${msg.pdf?.name}" آغاز شد...`)}
                        className="p-1 bg-white hover:bg-indigo-100 border border-indigo-150 rounded text-indigo-700 transition-all text-[8px] font-black shrink-0 cursor-pointer"
                      >
                        دریافت
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isVardakChatLoading && (
              <div className="flex gap-2 max-w-[85%] ml-auto items-center">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-xs shrink-0 border border-amber-200 animate-spin">
                  🔄
                </div>
                <div className="bg-white border border-slate-150 text-slate-400 rounded-2xl rounded-tl-none p-3 text-xs font-bold shadow-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-100" />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Pending Attachment Preview Bar */}
          {pendingAttachment && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-150 flex items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2">
                <span className="text-xs">
                  {pendingAttachment.type === 'image' ? '🖼️' : pendingAttachment.type === 'audio' ? '🎵' : '📄'}
                </span>
                <div className="text-right">
                  <span className="block text-[9px] font-black text-slate-800 truncate max-w-[200px]">
                    {pendingAttachment.file.name}
                  </span>
                  <span className="block text-[7px] font-bold text-indigo-600">
                    {pendingAttachment.type === 'image' ? 'تصویر' : pendingAttachment.type === 'audio' ? 'صوت' : 'سند PDF'} - آماده بارگذاری
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingAttachment(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-all cursor-pointer"
                title="حذف ضمیمه"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}

          {/* Attachment Selection Error Alert */}
          {attachmentError && (
            <div className="px-4 py-1.5 bg-red-50 text-red-600 text-[10px] font-bold text-right border-t border-red-100 animate-fadeIn">
              ⚠️ {attachmentError}
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileAttached}
            className="hidden"
          />

          {/* Form Input with WhatsApp Attachment Flow */}
          <form
            onSubmit={sendVardakChatMessage}
            className="p-3 bg-white border-t border-slate-150 flex gap-2 items-center"
          >
            {/* Attachment Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  isAttachmentMenuOpen 
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600' 
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500'
                }`}
                title="ارسال ضمیمه آموزشی (تصویر، صوت، جزوه)"
              >
                <Paperclip size={14} />
              </button>

              {/* Attachment options dropdown overlay */}
              {isAttachmentMenuOpen && (
                <div className="absolute bottom-11 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl p-1 w-32 z-[999] animate-fadeIn text-right">
                  <button
                    type="button"
                    onClick={() => triggerAttachment('image')}
                    className="w-full text-right px-2 py-1.5 text-[9px] font-black text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <span>🖼️</span>
                    <span>تصویر و طرح</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerAttachment('audio')}
                    className="w-full text-right px-2 py-1.5 text-[9px] font-black text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <span>🎵</span>
                    <span>فایل صوتی</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerAttachment('pdf')}
                    className="w-full text-right px-2 py-1.5 text-[9px] font-black text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <span>📄</span>
                    <span>سند PDF</span>
                  </button>
                </div>
              )}
            </div>

            <input
              type="text"
              value={vardakChatInput}
              onChange={(e) => setVardakChatInput(e.target.value)}
              placeholder="در مورد مباحث درس بپرس یا فایلی بفرست..."
              className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all select-text"
              disabled={isVardakChatLoading}
            />
            <button
              type="submit"
              disabled={(!vardakChatInput.trim() && !pendingAttachment) || isVardakChatLoading}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-100 disabled:text-slate-400 transition-all cursor-pointer shrink-0"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      {/* 2. Floating Text Selection Tooltip */}
      {vardakState === 'selecting' && selectedText && selectedTextRect && (
        <div
          className="absolute z-[9999] animate-fadeIn"
          style={{
            left: selectedTextRect.x,
            top: selectedTextRect.y,
            transform: 'translate(-50%, -100%)',
            marginTop: '-10px'
          }}
        >
          <button
            onClick={() => {
              handleVardakProcess(selectedText, selectedTextRect.x, selectedTextRect.y);
              // Clear browser selection after triggering
              window.getSelection()?.removeAllRanges();
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-[10px] font-black shadow-lg shadow-indigo-200/50 hover:shadow-indigo-400/30 transition-all scale-100 hover:scale-105 active:scale-95 border border-indigo-700 whitespace-nowrap cursor-pointer"
          >
            <span>💡 دریافت راهنمایی مربی</span>
          </button>
          {/* Little arrow pointing to selection */}
          <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-indigo-600 mx-auto -mt-[1px]" />
        </div>
      )}

      {/* 4. Draggable & Resizable Floating Socratic Modal */}
      {isVardakModalOpen && vardakResult && (
        <div
          className={`fixed z-[9999] bg-white/95 backdrop-blur-xl border-2 border-indigo-400 rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 select-none hover:shadow-indigo-100/50 ${
            isGuidanceFullscreen 
              ? 'top-4 left-4 right-4 bottom-4 md:top-8 md:left-8 md:right-8 md:bottom-8' 
              : ''
          }`}
          style={isGuidanceFullscreen ? { direction: 'rtl' } : {
            left: vardakModalPos.x,
            top: vardakModalPos.y,
            width: vardakModalSize.w,
            height: vardakModalSize.h,
            direction: 'rtl'
          }}
        >
          {/* Header - Drag Handle */}
          <div
            onMouseDown={handleModalDragStart}
            className={`bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-sm ${
              isGuidanceFullscreen ? 'cursor-default' : 'cursor-move'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{vardakResult.emotion || '💡'}</span>
              <div className="text-right">
                <span className="block text-[8px] text-indigo-600 font-extrabold uppercase tracking-widest">آموزش و راهنمایی مربی لومینا</span>
                <span className="text-xs font-black text-slate-900">{vardakResult.concept || 'مفهوم کلیدی'}</span>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
              {/* Zoom Out */}
              <button
                type="button"
                onClick={() => setGuidanceZoom(prev => Math.max(80, prev - 10))}
                className="p-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-all cursor-pointer flex items-center justify-center"
                title="کوچک‌نمایی متن"
              >
                <ZoomOut size={13} />
              </button>

              {/* Zoom In */}
              <button
                type="button"
                onClick={() => setGuidanceZoom(prev => Math.min(150, prev + 10))}
                className="p-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-all cursor-pointer flex items-center justify-center"
                title="بزرگ‌نمایی متن"
              >
                <ZoomIn size={13} />
              </button>

              {/* Fullscreen Toggle */}
              <button
                type="button"
                onClick={() => setIsGuidanceFullscreen(!isGuidanceFullscreen)}
                className="p-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                title={isGuidanceFullscreen ? "کوچک کردن صفحه" : "بزرگ کردن صفحه"}
              >
                {isGuidanceFullscreen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  flyBackToNest();
                }}
                className="p-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-red-600 transition-all cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Modal Content - Scrollable */}
          <div 
            className="flex-1 overflow-y-auto p-5 space-y-4 text-right"
            style={{ fontSize: `${guidanceZoom}%` }}
          >
            {/* Captured text quotation */}
            <div className="bg-slate-50 border-r-2 border-slate-300 p-2.5 rounded-lg text-[10px] font-black text-slate-600 line-clamp-2">
              متن نشان‌شده: "{capturedText}"
            </div>

            {/* Socratic Primary Message */}
            <div className="bg-indigo-50/40 border border-indigo-100/50 p-4 rounded-2xl relative">
              <div className="absolute top-3 left-3 bg-indigo-100 text-indigo-800 text-[8px] font-black px-2 py-0.5 rounded-full">
                راهنمایی مربی
              </div>
              <p className="text-slate-800 text-xs leading-relaxed font-bold whitespace-pre-wrap pt-2">
                {vardakResult.message}
              </p>
            </div>

            {/* Collapsible Sequential Hints Section */}
            <div className="space-y-2">
              <span className="block text-[10px] text-indigo-700 font-black">💡 سرنخ‌های گام‌به‌گام مربی (به ترتیب باز کنید)</span>
              {vardakResult.hints && vardakResult.hints.map((hint: string, idx: number) => {
                const isRevealed = revealedHints.includes(idx);
                const isLocked = idx > 0 && !revealedHints.includes(idx - 1);

                return (
                  <div key={idx} className={`border rounded-xl transition-all ${
                    isRevealed 
                      ? 'border-emerald-200 bg-emerald-50/30' 
                      : isLocked 
                        ? 'border-slate-100 bg-slate-50/50 opacity-60' 
                        : 'border-indigo-150 bg-indigo-50/10 hover:bg-indigo-50/20'
                  }`}>
                    {isRevealed ? (
                      <div className="p-3">
                        <div className="flex items-center justify-between text-[10px] font-black text-emerald-700 border-b border-emerald-100/50 pb-1.5 mb-1.5">
                          <span>سرنخ شماره {idx + 1}</span>
                          <span className="text-xs">✅</span>
                        </div>
                        <p className="text-xs text-slate-800 font-bold leading-relaxed">{hint}</p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => {
                          if (!isLocked) {
                            setRevealedHints([...revealedHints, idx]);
                          }
                        }}
                        className={`w-full p-3 flex items-center justify-between text-right text-xs font-black transition-all ${
                          isLocked ? 'cursor-not-allowed' : 'cursor-pointer text-indigo-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{isLocked ? '🔒' : '👁️'}</span>
                          <span>مشاهده سرنخ {idx + 1}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold">
                          {isLocked ? 'ابتدا سرنخ قبلی را باز کنید' : 'کلیک برای باز کردن'}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Guiding Questions */}
            {vardakResult.guiding_questions && vardakResult.guiding_questions.length > 0 && (
              <div className="bg-indigo-50/50 border border-indigo-100/70 p-4 rounded-2xl space-y-2">
                <span className="block text-[10px] text-indigo-800 font-black">🧠 سوالی برای تفکر عمیق‌تر</span>
                <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs font-bold leading-relaxed">
                  {vardakResult.guiding_questions.map((q: string, idx: number) => (
                    <li key={idx} className="pr-1">{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Simplistic Analogy/Code block */}
            {vardakResult.example && (
              <div className="bg-indigo-50/30 border border-indigo-150 p-4 rounded-2xl space-y-2">
                <span className="block text-[10px] text-indigo-800 font-extrabold">💡 یک شبیه‌سازی یا مثال ملموس</span>
                <div className="text-right rtl text-xs text-slate-700 leading-relaxed font-bold whitespace-pre-wrap text-justify">
                  {vardakResult.example}
                </div>
              </div>
            )}
          </div>

          {/* Resizable handle - bottom left */}
          {!isGuidanceFullscreen && (
            <div
              onMouseDown={handleModalResizeStart}
              className="absolute bottom-0 left-0 w-5 h-5 cursor-nwse-resize flex items-end justify-start p-1"
              title="تغییر ابعاد کادر مربی"
            >
              {/* Simple diagonal lines to indicate resize */}
              <div className="w-2.5 h-2.5 border-b-2 border-l-2 border-slate-400/70" />
            </div>
          )}
        </div>
      )}

    </div>
  );
}
