import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  BookOpen, Users, CheckSquare, Plus, Trash2, Edit, Save, Award, Sparkles, Code, FileText,
  Image as ImageIcon, Link as LinkIcon, Mic, Send, ChevronLeft, ChevronRight, User, LogOut,
  X, Check, CheckCircle2, ShieldAlert, Sparkle, Eye, LayoutGrid, AlertTriangle, TrendingUp, HelpCircle, GraduationCap, Compass, Bell, Star,
  Volume2, Tv, Youtube
} from 'lucide-react';
import { User as UserType, Lesson, Submission, Question, AnswerType, LessonImage, Course, CourseEnrollment, DirectMessage, Rating } from '../types';
import AudioRecorder from './AudioRecorder';
import { Paperclip, File, Download, UploadCloud, RefreshCw, Play, RotateCw } from 'lucide-react';
import DbSyncIndicator from './DbSyncIndicator';

interface TeacherPanelProps {
  currentUser: UserType;
  users: UserType[];
  courses: Course[];
  lessons: Lesson[];
  submissions: Submission[];
  enrollments: CourseEnrollment[];
  directMessages: DirectMessage[];
  onSendDirectMessage: (newMsg: DirectMessage) => void;
  onAddCourse: (newCourse: Course) => void;
  onUpdateCourse: (updatedCourse: Course) => void;
  onDeleteCourse: (courseId: string) => void;
  onAddLesson: (newLesson: Lesson) => void;
  onUpdateLesson: (updatedLesson: Lesson) => void;
  onDeleteLesson: (lessonId: string) => void;
  onApproveEnrollment: (enrollmentId: string, accept: boolean) => void;
  onApproveStudent: (studentId: string, accept: boolean) => void;
  onUpdateStudentLevel: (studentId: string, newLevel: 'beginner' | 'intermediate' | 'advanced') => void;
  onGradeSubmission: (
    submissionId: string, 
    grade: number, 
    feedback: string, 
    aiReview?: string, 
    gradedBy?: 'teacher' | 'assistant', 
    isTryAgainRequested?: boolean
  ) => void;
  onLogout: () => void;
  isLoadingDb?: boolean;
  isDbLoaded?: boolean;
  ratings?: Rating[];
}

const compressImageBase64 = (base64Str: string, maxWidth = 1020, quality = 0.8): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

export default function TeacherPanel({
  currentUser, users, courses, lessons, submissions, enrollments, directMessages, onSendDirectMessage,
  onAddCourse, onUpdateCourse, onDeleteCourse, onAddLesson, onUpdateLesson, onDeleteLesson,
  onApproveEnrollment, onApproveStudent, onUpdateStudentLevel, onGradeSubmission, onLogout,
  isLoadingDb = false,
  isDbLoaded = false,
  ratings = []
}: TeacherPanelProps) {
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'dashboard' | 'courses' | 'lessons' | 'submissions' | 'approvals' | 'messages' | 'backup'>('dashboard');

  // Submissions state
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [manualGrade, setManualGrade] = useState<number>(0);
  const [manualFeedback, setManualFeedback] = useState('');
  const [aiReviewResult, setAiReviewResult] = useState('');
  const [isAiReviewing, setIsAiReviewing] = useState(false);
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);
  const [gradedBy, setGradedBy] = useState<'teacher' | 'assistant'>('teacher');
  const [isTryAgainRequested, setIsTryAgainRequested] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [approvingStudentId, setApprovingStudentId] = useState<string | null>(null);
  const [approvingEnrollmentId, setApprovingEnrollmentId] = useState<string | null>(null);

  // Custom confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Teacher-Student direct chat states
  const [selectedChatStudentId, setSelectedChatStudentId] = useState<string | null>(null);
  const [teacherChatMessage, setTeacherChatMessage] = useState('');
  const [teacherChatAttachment, setTeacherChatAttachment] = useState<{ type: 'image' | 'voice' | 'document'; dataUrl: string; name?: string } | null>(null);

  // Course Management states
  const [isEditingCourse, setIsEditingCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [courseTitleInput, setCourseTitleInput] = useState('');
  const [courseDescInput, setCourseDescInput] = useState('');
  const [courseCategoryInput, setCourseCategoryInput] = useState('طراحی فرانت‌اند');
  const [courseLevelInput, setCourseLevelInput] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');

  // AI Course Review state
  const [isCourseReviewing, setIsCourseReviewing] = useState(false);
  const [courseReviewFeedback, setCourseReviewFeedback] = useState('');
  const [reviewedCourseId, setReviewedCourseId] = useState<string | null>(null);

  // Lesson editor state
  const [isEditingLesson, setIsEditingLesson] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imagePlacement, setImagePlacement] = useState<'inline' | 'gallery'>('inline');
  const [lessonModalTab, setLessonModalTab] = useState<'content' | 'images' | 'challenges' | 'audioVideo'>('content');
  const [stepImageTitle, setStepImageTitle] = useState('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('all');
  const [aiCourseId, setAiCourseId] = useState<string>('');

  // Backup & Import states
  const [selectedExportCourseIds, setSelectedExportCourseIds] = useState<string[]>([]);
  const [importFileContent, setImportFileContent] = useState<{ courses: Course[]; lessons: Lesson[] } | null>(null);
  const [selectedImportCourseIds, setSelectedImportCourseIds] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importErrorMessage, setImportErrorMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [stepImageDesc, setStepImageDesc] = useState('');
  const [isGeneratingAiLesson, setIsGeneratingAiLesson] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiLevel, setAiLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [aiChallengeCount, setAiChallengeCount] = useState<number>(3);
  const [isGeneratingAiChallenges, setIsGeneratingAiChallenges] = useState(false);

  // New states for multiple supplementary resources
  const [newAudioTitle, setNewAudioTitle] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newPdfTitle, setNewPdfTitle] = useState('');
  const [newPdfUrl, setNewPdfUrl] = useState('');

  const lessonTextareaRef = useRef<HTMLTextAreaElement>(null);

  // New interactive designer states (CS50 style)
  const [designerMode, setDesignerMode] = useState<'text' | 'designer' | 'teacher'>('text');
  const [isInlineImageModalOpen, setIsInlineImageModalOpen] = useState(false);
  const [inlineInsertIndex, setInlineInsertIndex] = useState<number | null>(null);
  const [inlineImageTitle, setInlineImageTitle] = useState('');
  const [inlineImageDesc, setInlineImageDesc] = useState('');
  const [inlineImageUrl, setInlineImageUrl] = useState('');
  const [isInlineWebcamActive, setIsInlineWebcamActive] = useState(false);
  const inlineVideoRef = useRef<HTMLVideoElement | null>(null);
  const [inlineWebcamStream, setInlineWebcamStream] = useState<MediaStream | null>(null);

  const startInlineWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setInlineWebcamStream(stream);
      setIsInlineWebcamActive(true);
      setTimeout(() => {
        if (inlineVideoRef.current) {
          inlineVideoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      alert('امکان دسترسی به دوربین وجود ندارد.');
    }
  };

  const stopInlineWebcam = () => {
    if (inlineWebcamStream) {
      inlineWebcamStream.getTracks().forEach(track => track.stop());
      setInlineWebcamStream(null);
    }
    setIsInlineWebcamActive(false);
  };

  const captureInlinePhoto = () => {
    if (!inlineVideoRef.current) return;
    const video = inlineVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setInlineImageUrl(dataUrl);
      stopInlineWebcam();
    }
  };

  const insertMarkdownSnippet = (snippet: string) => {
    if (!editingLesson) return;
    const textarea = lessonTextareaRef.current;
    if (!textarea) {
      setEditingLesson({ ...editingLesson, content: (editingLesson.content || '') + snippet });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = editingLesson.content || '';

    const newValue = currentContent.substring(0, start) + snippet + currentContent.substring(end);
    setEditingLesson({ ...editingLesson, content: newValue });

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
    }, 0);
  };

  // Webcam states for Teacher Lesson Images
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startWebcam = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setWebcamStream(mediaStream);
      setIsWebcamActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (err) {
      console.error("Error accessing webcam:", err);
      alert("خطا در دسترسی به دوربین سیستم. لطفا اطمینان حاصل کنید که دوربین متصل است و اجازه دسترسی به آن داده شده است.");
    }
  };

  const stopWebcam = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    }
    setIsWebcamActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setImageUrlInput(dataUrl);
      stopWebcam();
    }
  };

  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamStream]);

  // AI Peer Review state
  const [isPeerReviewing, setIsPeerReviewing] = useState(false);
  const [peerReviewFeedback, setPeerReviewFeedback] = useState('');
  const [peerReviewLessonId, setPeerReviewLessonId] = useState<string | null>(null);

  // Bell Notifications states
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [activeNotification, setActiveNotification] = useState<Submission | null>(null);

  // Filter courses, lessons and students for THIS teacher
  const teacherCourses = courses.filter(c => c.teacherId === currentUser.id);
  const teacherLessons = lessons
    .filter(l => l.teacherId === currentUser.id || !l.teacherId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  const myStudents = users.filter(u => u.role === 'student' && u.selectedTeacherId === currentUser.id);
  const pendingStudents = myStudents.filter(s => s.statusByTeacher === 'pending');
  const acceptedStudents = myStudents.filter(s => s.statusByTeacher === 'accepted');

  // Filter enrollments for THIS teacher's courses
  const teacherCourseIds = teacherCourses.map(c => c.id);
  const relevantEnrollments = enrollments.filter(e => teacherCourseIds.includes(e.courseId));
  const pendingEnrollments = relevantEnrollments.filter(e => e.status === 'pending');
  const acceptedEnrollments = relevantEnrollments.filter(e => e.status === 'accepted');

  // Submissions associated with this teacher's lessons
  const relevantSubmissions = submissions.filter(sub => {
    const lesson = lessons.find(l => l.id === sub.lessonId);
    return lesson && (lesson.teacherId === currentUser.id || !lesson.teacherId);
  });
  const pendingSubmissions = relevantSubmissions.filter(s => s.status === 'pending');

  // Identify struggling students: attemptsCount >= 3 or marked alertTeacher === true
  const strugglingStudents = myStudents.filter(student => {
    const studentSubs = relevantSubmissions.filter(s => s.studentId === student.id);
    return studentSubs.some(s => (s.attemptsCount && s.attemptsCount >= 3) || s.alertTeacher);
  });

  // Identify top performers: average grade >= 90
  const topPerformers = myStudents.filter(student => {
    const studentSubs = relevantSubmissions.filter(s => s.studentId === student.id && s.status === 'reviewed');
    if (studentSubs.length === 0) return false;
    const avg = studentSubs.reduce((sum, s) => sum + (s.grade || 0), 0) / studentSubs.length;
    return avg >= 90;
  });

  // If teacher is NOT approved by administrator
  if (!currentUser.active) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center text-rose-600 animate-pulse">
            <ShieldAlert size={32} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900">حساب کاربری شما در انتظار تأیید است</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              استاد گرامی <strong>{currentUser.name}</strong>، درخواست عضویت شما به عنوان مدرس در آکادمی هوشمند لومینا با موفقیت ثبت شده است.
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-right text-xs text-slate-700 leading-relaxed space-y-2.5 font-semibold">
            <div className="flex items-center gap-2 text-indigo-700 font-extrabold mb-1">
              <CheckCircle2 size={16} />
               <span>مراحل فعال‌سازی پنل اساتید:</span>
            </div>
            <p>1. بررسی روزمه و اطلاعات تماس توسط مدیر سیستم.</p>
            <p>2. تغییر وضعیت حساب کاربری شما از غیرفعال به تایید شده.</p>
            <p>3. ارسال اعلان تایید از طرف ایمیل پلتفرم.</p>
            <p className="text-rose-600">نکته تستی: برای فعال‌سازی آنی حساب، می‌توانید دکمه "خروج" بالا را بزنید، با اکانت ادمین وارد شوید و فورا صلاحیت خود را تأیید کنید.</p>
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={onLogout}
              className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow"
            >
              خروج از حساب
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle manual / AI review
  const startReview = (sub: Submission) => {
    setActiveSubId(sub.id);
    // Pre-fill with existing human grade/feedback OR default to AI Assistant's suggested grade/feedback!
    setManualGrade(sub.grade !== undefined ? sub.grade : (sub.assistantGrade !== undefined ? sub.assistantGrade : 0));
    setManualFeedback(sub.feedback || sub.assistantFeedback || '');
    setAiReviewResult(sub.aiReview || '');
    setGradedBy(sub.gradedBy || 'teacher');
    setIsTryAgainRequested(sub.isTryAgainRequested || false);
  };

  const handleRequestAiReview = async (sub: Submission) => {
    setIsAiReviewing(true);
    setAiReviewResult('');
    try {
      const lesson = lessons.find(l => l.id === sub.lessonId);
      const res = await fetch('/api/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson,
          studentName: sub.studentName,
          answers: sub.answers
        })
      });
      const data = await res.json();
      const feedbackText = data.teacherFeedback || data.feedback;
      if (res.ok && feedbackText) {
        setAiReviewResult(feedbackText);
        setManualFeedback(feedbackText); // Directly pre-fill the final feedback text area
        if (data.grade !== undefined) {
          setManualGrade(data.grade); // Directly pre-fill the final grade input
        }
      } else {
        alert(data.error || 'خطا در ارزیابی هوش مصنوعی');
      }
    } catch (e) {
      console.error(e);
      setAiReviewResult('خطا در اتصال به سرور هوش مصنوعی. لطفاً دوباره تلاش کنید.');
    } finally {
      setIsAiReviewing(false);
    }
  };

  const handleAutomaticTaskExecution = async (sub: Submission) => {
    setIsAutoExecuting(true);
    try {
      let reviewResult = aiReviewResult;
      let suggestedGrade = manualGrade;
      let feedbackText = manualFeedback;

      if (!aiReviewResult) {
        setIsAiReviewing(true);
        const lesson = lessons.find(l => l.id === sub.lessonId);
        const res = await fetch('/api/ai/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lesson,
            studentName: sub.studentName,
            answers: sub.answers
          })
        });
        const data = await res.json();
        const extractedFeedback = data.teacherFeedback || data.feedback;
        if (res.ok && extractedFeedback) {
          reviewResult = extractedFeedback;
          suggestedGrade = data.grade !== undefined ? data.grade : Math.round(sub.maxPoints * 0.8);
          feedbackText = extractedFeedback;
          
          setAiReviewResult(extractedFeedback);
          setManualFeedback(extractedFeedback);
          if (data.grade !== undefined) {
            setManualGrade(data.grade);
          }
        } else {
          throw new Error(data.error || 'خطا در ارزیابی هوش مصنوعی');
        }
      }

      // Automatically set grading signature to teacher
      setGradedBy('teacher');

      // Auto-determine try again (if grade < 80% of max points, request Try Again)
      const passingScore = sub.maxPoints * 0.8;
      const shouldTryAgain = suggestedGrade < passingScore;
      setIsTryAgainRequested(shouldTryAgain);

      alert(`⚡ اجرای خودکار وظایف با موفقیت انجام شد:
- نمره پیشنهادی (${suggestedGrade} از ${sub.maxPoints}) در فیلد نمره ثبت شد.
- بازخورد تفصیلی استادیار در فیلد بازخورد ثبت شد.
- امضای برگه به عنوان «استاد» تنظیم گردید.
- وضعیت ارزیابی به «${shouldTryAgain ? 'درخواست تلاش مجدد (Try Again)' : 'تکمیل و تأیید نهایی چالش'}» تنظیم شد.
اکنون می‌توانید بررسی نهایی را انجام داده و با زدن دکمه ذخیره، تکلیف را ثبت کنید.`);

    } catch (err: any) {
      console.error(err);
      alert('خطا در اجرای خودکار وظایف: ' + (err.message || err));
    } finally {
      setIsAutoExecuting(false);
      setIsAiReviewing(false);
    }
  };

  // Create lesson with AI
  const handleGenerateLessonWithAi = async () => {
    if (teacherCourses.length === 0) {
      alert('⚠️ شما هنوز هیچ دوره آموزشی ثبت نکرده‌اید! برای تولید درس با هوش مصنوعی، ابتدا از بخش "مدیریت دوره‌ها" یک دوره آموزشی تعریف کنید.');
      setActiveTab('courses');
      return;
    }
    if (!aiTopic.trim()) return;
    setIsGeneratingAiLesson(true);
    const activeAiCourseId = aiCourseId || teacherCourses[0]?.id;
    const selectedCourse = teacherCourses.find(c => c.id === activeAiCourseId) || teacherCourses[0];
    try {
      const res = await fetch('/api/ai/generate-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic,
          gradeLevel: aiLevel
        })
      });
      const data = await res.json();
      if (res.ok && data.title) {
        const newLesson: Lesson = {
          id: 'l_' + Date.now(),
          courseId: selectedCourse.id, // Mandatory association
          title: data.title,
          category: data.category || selectedCourse.category || 'هوش مصنوعی',
          content: data.content,
          level: aiLevel,
          images: [],
          lessonImages: [
            { url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=600', placement: 'inline' }
          ],
          questions: (data.questions || []).map((q: any, idx: number) => ({
            id: `q_gen_${Date.now()}_${idx}`,
            title: q.title,
            description: q.description,
            answerType: q.answerType || 'text',
            starterCode: q.starterCode || '',
            points: Number(q.points) || 20
          })),
          teacherId: currentUser.id,
          order: (() => {
            const courseLessons = lessons.filter(l => l.courseId === selectedCourse.id);
            const maxOrder = courseLessons.reduce((max, l) => Math.max(max, l.order || 0), 0);
            return maxOrder + 1;
          })(),
          createdAt: new Date().toISOString()
        };
        onAddLesson(newLesson);
        setAiTopic('');
        alert(`درس جدید "${newLesson.title}" با هوش مصنوعی ساخته و به دوره "${selectedCourse.title}" اضافه شد.`);
      } else {
        alert(data.error || 'خطا در برقراری ارتباط با هوش مصنوعی');
      }
    } catch (e) {
      console.error(e);
      alert('خطا در تولید درس.');
    } finally {
      setIsGeneratingAiLesson(false);
    }
  };

  // Generate challenges using AI based on lesson content
  const handleGenerateChallengesWithAi = async () => {
    if (!editingLesson) return;
    if (!editingLesson.content || editingLesson.content.trim() === "") {
      alert("⚠️ لطفا ابتدا متن درس را در تب اول بنویسید یا تولید کنید تا هوش مصنوعی بتواند بر اساس آن چالش طراحی کند.");
      return;
    }
    
    setIsGeneratingAiChallenges(true);
    try {
      const res = await fetch('/api/ai/generate-challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editingLesson.content,
          count: aiChallengeCount
        })
      });
      
      const data = await res.json();
      if (res.ok && data.questions) {
        const formattedQuestions: Question[] = data.questions.map((q: any, idx: number) => ({
          id: `q_ai_gen_${Date.now()}_${idx}`,
          title: q.title,
          description: q.description,
          answerType: q.answerType || 'text',
          starterCode: q.starterCode || '',
          points: Number(q.points) || 20
        }));
        
        setEditingLesson({
          ...editingLesson,
          questions: formattedQuestions
        });
        
        alert(`✨ ${formattedQuestions.length} چالش هوشمند جدید با موفقیت توسط هوش مصنوعی طراحی و جایگزین شد. لطفا آن‌ها را بررسی و در صورت نیاز ویرایش کنید.`);
      } else {
        alert(data.error || 'خطا در برقراری ارتباط با هوش مصنوعی برای تولید چالش‌ها');
      }
    } catch (e) {
      console.error(e);
      alert('خطا در تولید چالش‌های هوشمند.');
    } finally {
      setIsGeneratingAiChallenges(false);
    }
  };

  // Ask AI for Peer Review on Lesson
  const handleRequestPeerReview = async (lesson: Lesson) => {
    setIsPeerReviewing(true);
    setPeerReviewFeedback('');
    setPeerReviewLessonId(lesson.id);
    try {
      const otherLessons = lessons.filter(l => l.id !== lesson.id && (l.teacherId === currentUser.id || !l.teacherId));
      const res = await fetch('/api/ai/peer-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentLesson: lesson,
          previousLessons: otherLessons
        })
      });
      const data = await res.json();
      if (res.ok && data.feedback) {
        setPeerReviewFeedback(data.feedback);
      } else {
        alert(data.error || 'خطا در دریافت ارزیابی همکار');
      }
    } catch (e) {
      console.error(e);
      alert('ارتباط برقرار نشد.');
    } finally {
      setIsPeerReviewing(false);
    }
  };

  // Open editor for a lesson
  const openLessonEditor = (lesson: Lesson) => {
    const validCourseId = teacherCourses.some(c => c.id === lesson.courseId)
      ? lesson.courseId
      : (teacherCourses[0]?.id || '');
    setEditingLesson({ ...lesson, courseId: validCourseId });
    setLessonModalTab('content');
    setStepImageTitle('');
    setStepImageDesc('');
    setImageUrlInput('');
    setIsEditingLesson(true);
  };

  const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!editingLesson) return;

    const currentImages = editingLesson.lessonImages || [];
    if (currentImages.length + files.length > 15) {
      alert(`شما فقط می‌توانید حداکثر ۱۵ تصویر به هر درس اضافه کنید. در حال حاضر ${currentImages.length} تصویر دارید.`);
      return;
    }

    // Read all files as Data URLs and compress
    Array.from(files).forEach((file, index) => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`فایل ${file.name} بزرگتر از حد مجاز (۵ مگابایت) است و نادیده گرفته شد.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const originalBase64 = event.target.result as string;
          // Compress base64
          const compressedBase64 = await compressImageBase64(originalBase64);
          const imageId = 'img_' + Math.random().toString(36).substr(2, 9);
          
          setEditingLesson(prev => {
            if (!prev) return null;
            const updatedImages = [...(prev.lessonImages || [])];
            // Prevent duplicate base64
            if (!updatedImages.some(img => img.url === compressedBase64)) {
              updatedImages.push({
                id: imageId,
                url: compressedBase64,
                placement: imagePlacement,
                title: stepImageTitle.trim() || `تصویر آموزشی جدید ${updatedImages.length + 1}`,
                description: stepImageDesc.trim() || 'بارگذاری شده به عنوان فایل گروهی کلاسی.'
              });
            }
            return {
              ...prev,
              lessonImages: updatedImages
            };
          });
        }
      };
      reader.readAsDataURL(file);
    });

    // Clear file selection
    e.target.value = '';
    alert('تصاویر با موفقیت بارگذاری و به لیست تصاویر آموزشی کلاسی گام‌به‌گام اضافه شدند.');
  };

  const createEmptyLesson = () => {
    if (teacherCourses.length === 0) {
      alert('⚠️ شما هنوز هیچ دوره آموزشی ثبت نکرده‌اید! برای تعریف درس، باید ابتدا از تب "مدیریت دوره‌ها" یک دوره آموزشی تعریف کنید.');
      setActiveTab('courses');
      return;
    }
    const defaultCourseId = selectedCourseFilter !== 'all' && teacherCourses.some(c => c.id === selectedCourseFilter)
      ? selectedCourseFilter
      : teacherCourses[0].id;
    const selectedCourse = teacherCourses.find(c => c.id === defaultCourseId) || teacherCourses[0];
    const empty: Lesson = {
      id: 'l_manual_' + Date.now(),
      courseId: defaultCourseId, // Mandatory, guaranteed non-nullable
      title: 'عنوان درس جدید',
      category: selectedCourse.category || 'طراحی فرانت‌اند',
      level: selectedCourse.level || 'beginner',
      content: '',
      images: [],
      lessonImages: [],
      questions: [
        {
          id: 'q_manual_' + Date.now(),
          title: 'چالش اول',
          description: 'صورت سوال را اینجا بنویسید.',
          answerType: 'text',
          points: 50
        }
      ],
      teacherId: currentUser.id,
      order: (() => {
        const courseLessons = lessons.filter(l => l.courseId === defaultCourseId);
        const maxOrder = courseLessons.reduce((max, l) => Math.max(max, l.order || 0), 0);
        return maxOrder + 1;
      })(),
      createdAt: new Date().toISOString()
    };
    onAddLesson(empty);
    openLessonEditor(empty);
  };

  const saveLesson = () => {
    if (!editingLesson) return;
    if (!editingLesson.courseId) {
      alert('⚠️ لطفا ابتدا دوره مرتبط با این درس را از منوی کشویی انتخاب کنید! اختصاص دوره برای ذخیره درس اجباری است.');
      return;
    }
    onUpdateLesson(editingLesson);
    setIsEditingLesson(false);
    setEditingLesson(null);
    alert('محتوای درس با موفقیت ذخیره شد!');
  };

  // --- Course Export Logic ---
  const handleExportCourses = () => {
    if (selectedExportCourseIds.length === 0) {
      alert('⚠️ لطفا حداقل یک دوره آموزشی را برای خروجی گرفتن انتخاب کنید.');
      return;
    }

    const coursesToExport = teacherCourses.filter(c => selectedExportCourseIds.includes(c.id));
    const lessonsToExport = lessons.filter(l => l.courseId && selectedExportCourseIds.includes(l.courseId));

    const backupData = {
      version: '1.0',
      exporter: currentUser.name,
      exportedAt: new Date().toISOString(),
      courses: coursesToExport,
      lessons: lessonsToExport
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `courses_backup_${currentUser.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Course Import Logic ---
  const handleImportFileSelect = (file: File) => {
    if (!file) return;
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setImportStatus('error');
      setImportErrorMessage('⚠️ فایل انتخاب شده باید با فرمت JSON (.json) باشد.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target?.result as string);
        if (!content.courses || !Array.isArray(content.courses)) {
          setImportStatus('error');
          setImportErrorMessage('⚠️ ساختار فایل معتبر نیست. بخش دوره‌ها (courses) یافت نشد.');
          return;
        }

        setImportFileContent({
          courses: content.courses,
          lessons: Array.isArray(content.lessons) ? content.lessons : []
        });
        // Select all imported courses by default
        setSelectedImportCourseIds(content.courses.map((c: any) => c.id));
        setImportStatus('idle');
        setImportErrorMessage('');
      } catch (err) {
        setImportStatus('error');
        setImportErrorMessage('⚠️ خطا در خواندن فایل JSON. فایل ممکن است مخدوش یا نامعتبر باشد.');
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = () => {
    if (!importFileContent || selectedImportCourseIds.length === 0) {
      alert('⚠️ لطفا حداقل یک دوره را برای وارد کردن انتخاب کنید.');
      return;
    }

    try {
      let importedCoursesCount = 0;
      let importedLessonsCount = 0;

      selectedImportCourseIds.forEach(oldCourseId => {
        const originalCourse = importFileContent.courses.find(c => c.id === oldCourseId);
        if (!originalCourse) return;

        // Generate brand new ID to prevent conflicts and ensure unique instance
        const newCourseId = 'course_imported_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        // Create new Course copy owned by current teacher
        const newCourse: Course = {
          id: newCourseId,
          title: originalCourse.title + ' (کپی وارد شده)',
          description: originalCourse.description,
          category: originalCourse.category,
          level: originalCourse.level,
          teacherId: currentUser.id,
          createdAt: new Date().toISOString()
        };

        // Call parent prop to add course
        onAddCourse(newCourse);
        importedCoursesCount++;

        // Find all lessons associated with this course inside the backup file
        const originalLessons = importFileContent.lessons.filter(l => l.courseId === oldCourseId);
        originalLessons.forEach(originalLesson => {
          const newLessonId = 'lesson_imported_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

          const newLesson: Lesson = {
            ...originalLesson,
            id: newLessonId,
            courseId: newCourseId,
            teacherId: currentUser.id,
            createdAt: new Date().toISOString()
          };

          // Call parent prop to add lesson
          onAddLesson(newLesson);
          importedLessonsCount++;
        });
      });

      setImportStatus('success');
      alert(`🎉 با موفقیت انجام شد! ${importedCoursesCount} دوره و ${importedLessonsCount} درس به لیست آموزشی شما اضافه گردید.`);
      
      // Reset states
      setImportFileContent(null);
      setSelectedImportCourseIds([]);
    } catch (err) {
      setImportStatus('error');
      setImportErrorMessage('⚠️ خطا در حین ذخیره دوره‌ها و دروس وارد شده در پایگاه داده.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col md:flex-row overflow-hidden font-sans" dir="rtl">
      
      {/* Sidebar navigation */}
      <aside className="w-full md:w-64 border-l border-slate-200 bg-white flex flex-col p-4 shrink-0 justify-between md:h-screen sticky top-0">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center text-white">
              <BookOpen size={18} />
            </div>
            <div>
              <h2 className="text-xs font-black text-slate-900 leading-tight">آکادمی هوشمند لومینا</h2>
              <span className="text-[9px] text-slate-400 font-extrabold block mt-0.5">مدرس: {currentUser.name}</span>
            </div>
          </div>



          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'dashboard' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>📊</span>
              <span>داشبورد معلم</span>
            </button>

            <button
              onClick={() => setActiveTab('courses')}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'courses' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>📂</span>
                <span>مدیریت دوره‌ها ({teacherCourses.length})</span>
              </div>
              {pendingEnrollments.length > 0 && (
                <span className="bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                  {pendingEnrollments.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('approvals')}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'approvals' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>👥</span>
                <span>پذیرش هنرجویان ({myStudents.length})</span>
              </div>
              {pendingStudents.length > 0 && (
                <span className="bg-amber-400 text-slate-950 text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-bounce">
                  {pendingStudents.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('lessons')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'lessons' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>📚</span>
              <span>مدیریت درس‌ها ({teacherLessons.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('submissions')}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'submissions' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>📝</span>
                <span>تصحیح تکالیف</span>
              </div>
              {pendingSubmissions.length > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {pendingSubmissions.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('messages')}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'messages' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>💬</span>
                <span>گفتگو با هنرجویان</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('backup')}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === 'backup' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>🔄</span>
                <span>پشتیبان‌گیری و انتقال</span>
              </div>
            </button>
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <img
              src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100'}
              alt={currentUser.name}
              className="w-8 h-8 rounded-full border border-slate-200 object-cover"
            />
            <div>
              <div className="text-[10px] font-bold text-slate-900 leading-none">{currentUser.name}</div>
              <span className="text-[8px] text-emerald-600 font-extrabold mt-0.5 block">استاد برتر</span>
              {currentUser.code && (
                <span className="text-[8px] text-indigo-600 font-mono font-black mt-0.5 block">کد استاد: {currentUser.code}</span>
              )}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <LogOut size={14} />
            <span>خروج از پنل مدرس</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="flex-1 bg-white overflow-y-auto p-6 md:p-8 h-screen">

        {/* Global Header / Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6 shrink-0 relative">
          <div>
            <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 uppercase tracking-wider">
              {activeTab === 'dashboard' ? '📊 داشبورد مدرس' : activeTab === 'courses' ? '📂 مدیریت دوره‌ها' : activeTab === 'lessons' ? '📚 مدیریت درس‌ها' : activeTab === 'submissions' ? '📝 ارزیابی تکالیف' : '👥 پذیرش هنرجویان'}
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
                <Bell className={`w-5 h-5 ${submissions.filter(s => {
                  const lesson = lessons.find(l => l.id === s.lessonId);
                  const isMyLesson = lesson && (lesson.teacherId === currentUser.id || !lesson.teacherId);
                  return isMyLesson && s.status === 'pending' && s.assistantGrade !== undefined;
                }).length > 0 ? 'animate-swing text-indigo-600 animate-pulse' : ''}`} />
                {submissions.filter(s => {
                  const lesson = lessons.find(l => l.id === s.lessonId);
                  const isMyLesson = lesson && (lesson.teacherId === currentUser.id || !lesson.teacherId);
                  return isMyLesson && s.status === 'pending' && s.assistantGrade !== undefined;
                }).length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 border-2 border-white rounded-full animate-pulse" />
                )}
              </button>

              {/* Notification Dropdown */}
              {isBellOpen && (
                <div className="absolute left-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn text-right">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800">اعلانات ارزیابی هوشمند</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-black">
                      {submissions.filter(s => {
                        const lesson = lessons.find(l => l.id === s.lessonId);
                        const isMyLesson = lesson && (lesson.teacherId === currentUser.id || !lesson.teacherId);
                        return isMyLesson && s.status === 'pending' && s.assistantGrade !== undefined;
                      }).length} پیش‌نویس
                    </span>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {submissions.filter(s => {
                      const lesson = lessons.find(l => l.id === s.lessonId);
                      const isMyLesson = lesson && (lesson.teacherId === currentUser.id || !lesson.teacherId);
                      return isMyLesson && s.status === 'pending' && s.assistantGrade !== undefined;
                    }).map((sub) => {
                      const lesson = lessons.find(l => l.id === sub.lessonId);
                      return (
                        <button
                          key={sub.id}
                          onClick={() => {
                            setActiveNotification(sub);
                            setIsBellOpen(false);
                          }}
                          type="button"
                          className="w-full text-right p-3.5 hover:bg-indigo-50/30 transition duration-150 flex flex-col gap-1"
                        >
                          <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-extrabold">
                            <Sparkles size={12} />
                            <span>ارزیابی دستیار آماده است</span>
                          </div>
                          <p className="text-xs text-slate-700 font-bold leading-relaxed">
                            پیش‌نویس ارزیابی دستیار هوش مصنوعی برای درس «{lesson?.title}» مربوط به هنرجو «{sub.studentName}» آماده بررسی است.
                          </p>
                          <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                            {new Date(sub.submittedAt).toLocaleDateString('fa-IR')}
                          </span>
                        </button>
                      );
                    })}

                    {submissions.filter(s => {
                      const lesson = lessons.find(l => l.id === s.lessonId);
                      const isMyLesson = lesson && (lesson.teacherId === currentUser.id || !lesson.teacherId);
                      return isMyLesson && s.status === 'pending' && s.assistantGrade !== undefined;
                    }).length === 0 && (
                      <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                        🔔 هیچ اعلان جدیدی برای ارزیابی هوشمند وجود ندارد.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* AI SUGGESTION MODAL FROM NOTIFICATION BELL */}
        {/* ======================================================== */}
        {activeNotification && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" dir="rtl">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-3xl shadow-2xl flex flex-col overflow-hidden text-right">
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2 text-indigo-600 font-extrabold">
                  <Sparkles size={18} />
                  <h3 className="text-sm font-black text-slate-950">پیش‌نویس ارزیابی دستیار هوشمند مربی</h3>
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
                  <div className="flex items-center justify-between text-sm font-black text-indigo-900">
                    <span>👤 هنرجو: {activeNotification.studentName}</span>
                    <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-mono font-black text-xs">
                      نمره پیشنهادی هوش مصنوعی: {activeNotification.assistantGrade} از {activeNotification.maxPoints}
                    </span>
                  </div>
                  <div className="text-xs text-indigo-700 font-bold">
                    📚 درس مربوطه: {lessons.find(l => l.id === activeNotification.lessonId)?.title || 'نامشخص'}
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-xs font-black text-slate-600">✍️ پیش‌نویس بازخورد و راهنمایی پیشنهادی هوش مصنوعی:</span>
                  <div className="bg-indigo-50/20 border border-indigo-100 text-slate-900 rounded-2xl p-6 text-sm leading-relaxed max-h-96 overflow-y-auto text-right whitespace-pre-wrap font-semibold">
                    {activeNotification.assistantFeedback}
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex gap-3 items-start">
                  <span className="text-indigo-600 font-black text-xs mt-0.5">💡</span>
                  <p className="text-xs text-indigo-950 font-bold leading-relaxed">
                    با کلیک روی دکمه «اعمال پیشنهاد»، به زبانه تکالیف منتقل شده و نمره و بازخورد پیشنهادی در فرم ارزیابی درج می‌شود. سپس می‌توانید آن را ویرایش کرده یا بدون تغییر تایید نهایی کنید.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                <button
                  onClick={() => setActiveNotification(null)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black transition"
                >
                  بستن پنجره
                </button>
                <button
                  onClick={() => {
                    setActiveTab('submissions');
                    startReview(activeNotification);
                    setActiveNotification(null);
                    setIsBellOpen(false);
                  }}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-lg hover:shadow-indigo-100"
                >
                  <span>✍️ اعمال پیشنهاد و ورود به فرم تصحیح</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: TEACHER DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-black text-slate-900">میز کار مدرس | مربی هوشمند</h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">آمارهای یادگیری، هشدارهای هوش مصنوعی و وضعیت کلی دانشجویان شما</p>
            </div>

            {/* Teacher Code Banner */}
            {currentUser.code && (
              <div className="bg-indigo-50 border border-indigo-150 rounded-2xl p-4 flex items-center justify-between gap-4 text-right" dir="rtl">
                <div className="space-y-1 text-right">
                  <h3 className="text-xs font-black text-indigo-900">🔑 کد مربیگری اختصاصی شما:</h3>
                  <p className="text-[10px] text-indigo-700 leading-relaxed font-bold">
                    این کد اختصاصی را به هنرجویان جدید خود بدهید. آن‌ها می‌توانند در بخش ثبت‌نام با وارد کردن این کد، مستقیماً شما را به عنوان مربی انتخاب کنند.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="bg-white border border-indigo-200 text-lg font-black font-mono px-4 py-1.5 rounded-xl shadow-sm text-indigo-800">
                    {currentUser.code}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(String(currentUser.code));
                      alert('کد اختصاصی شما با موفقیت کپی شد!');
                    }}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold transition shadow-sm cursor-pointer"
                  >
                    کپی کد
                  </button>
                </div>
              </div>
            )}

            {/* Dashboard KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
                <span className="text-[10px] text-slate-400 font-extrabold block">شاگردان تحت آموزش شما</span>
                <span className="text-2xl font-mono font-black text-slate-900 block mt-1">{acceptedStudents.length} هنرجو</span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
                <span className="text-[10px] text-slate-400 font-extrabold block">درس‌های منتشر شده شما</span>
                <span className="text-2xl font-mono font-black text-slate-900 block mt-1">{teacherLessons.length} درس</span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
                <span className="text-[10px] text-slate-400 font-extrabold block">تکالیف در انتظار تصحیح</span>
                <span className="text-2xl font-mono font-black text-rose-600 block mt-1">{pendingSubmissions.length} تکلیف</span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
                <span className="text-[10px] text-slate-400 font-extrabold block">هنرجویان در انتظار تایید</span>
                <span className="text-2xl font-mono font-black text-amber-500 block mt-1">{pendingStudents.length} درخواست</span>
              </div>
            </div>

            {/* AI Tutor Insights - Weak & Top Students (URGENT HIGHLIGHTS) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Weak Students Alerts (AI Smart Warnings) */}
              <div className="bg-rose-50 border border-rose-200/60 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-rose-600 animate-bounce" />
                  <h3 className="text-xs font-black text-rose-950">هشدارهای یادگیری هوش مصنوعی (دانش‌آموزان ضعیف)</h3>
                </div>
                <p className="text-[10px] text-rose-900/80 leading-relaxed font-semibold">
                  مدل هوشمند Gemini بر اساس تحلیل خطاها، تعداد ارسال‌های ناموفق و بن‌بست‌های یادگیری، هنرجویان زیر را ضعیف ارزیابی کرده و نیاز به توجه یا پیگیری دستی شما را تشخیص داده است:
                </p>

                <div className="space-y-3">
                  {strugglingStudents.map((student) => {
                    const studentSubs = relevantSubmissions.filter(s => s.studentId === student.id);
                    const failingSub = studentSubs.find(s => (s.attemptsCount && s.attemptsCount >= 3) || s.alertTeacher);
                    const lessonName = lessons.find(l => l.id === failingSub?.lessonId)?.title || 'درس ۱';

                    return (
                      <div key={student.id} className="bg-white p-3.5 rounded-2xl border border-rose-200/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="flex items-center gap-2.5">
                          <img src={student.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                          <div>
                            <span className="font-extrabold text-slate-800 text-xs block">{student.name}</span>
                            <span className="text-[9px] text-rose-600 font-semibold block mt-0.5">ناموفق در {lessonName}</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[9px] font-black font-mono">
                            {failingSub?.attemptsCount || 3} تلاش اشتباه مکرر!
                          </span>
                          <p className="text-[9px] text-slate-500 font-semibold max-w-xs mt-1 leading-relaxed">
                            توصیه هوش مصنوعی: لطفاً به سهراب پیام دهید. او اصول کدگذاری کادر دکمه و Flexbox را هنوز خوب متوجه نشده است.
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {strugglingStudents.length === 0 && (
                    <div className="bg-white p-4 text-center rounded-2xl border border-rose-100 text-[10px] text-slate-500 font-semibold">
                      هیچ هنرجویی با چالش بحرانی تکراری یا وضعیت بحرانی یادگیری ثبت نشده است! دوره آرام و ایده‌آل پیش می‌رود.
                    </div>
                  )}
                </div>
              </div>

              {/* Top Performers (Elite Highlights) */}
              <div className="bg-emerald-50 border border-emerald-200/60 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-emerald-600" />
                  <h3 className="text-xs font-black text-emerald-950">دانش‌آموزان برتر و ممتاز (Top Performers)</h3>
                </div>
                <p className="text-[10px] text-emerald-900/80 leading-relaxed font-semibold">
                  هنرجویان زیر بالاترین میانگین نمرات را کسب کرده‌اند و تمرینات خود را با بالاترین کیفیت برنامه‌نویسی انجام داده‌اند:
                </p>

                <div className="space-y-3">
                  {topPerformers.map((student) => {
                    const studentSubs = relevantSubmissions.filter(s => s.studentId === student.id && s.status === 'reviewed');
                    const avg = studentSubs.reduce((sum, s) => sum + (s.grade || 0), 0) / studentSubs.length;

                    return (
                      <div key={student.id} className="bg-white p-3.5 rounded-2xl border border-emerald-200/50 flex justify-between items-center">
                        <div className="flex items-center gap-2.5">
                          <img src={student.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                          <div>
                            <span className="font-extrabold text-slate-800 text-xs block">{student.name}</span>
                            <span className="text-[9px] text-emerald-600 font-semibold block mt-0.5">سطح: {student.level === 'beginner' ? 'مبتدی' : student.level === 'intermediate' ? 'متوسطه' : 'پیشرفته'}</span>
                          </div>
                        </div>
                        <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-xl text-xs font-black font-mono">
                          معدل: {avg.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                  {topPerformers.length === 0 && (
                    <div className="bg-white p-4 text-center rounded-2xl border border-emerald-100 text-[10px] text-slate-500 font-semibold">
                      هنوز معدل نمره دانش‌آموزی به حدنصاب برتر (بالای 90) نرسیده است.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: STUDENT APPROVALS */}
        {activeTab === 'approvals' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-slate-900">پذیرش و عضویت هنرجویان جدید در دوره شما</h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">دانش‌آموزان برای استفاده از مطالب درسی شما ابتدا باید مورد تایید قرار گیرند.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-black text-slate-800 border-b border-slate-100 pb-2">درخواست‌های عضویت معلق:</h3>
              <div className="space-y-3">
                {pendingStudents.map((student) => (
                  <div key={student.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div className="flex items-center gap-3">
                      <img src={student.avatarUrl} alt="" className="w-10 h-10 rounded-full border border-slate-200 object-cover" />
                      <div>
                        <span className="font-extrabold text-slate-800 text-xs block">{student.name}</span>
                        <span className="text-[10px] text-slate-500 mt-1 block font-medium">ایمیل: {student.email} | سطح انتخابی: <strong className="text-indigo-600">{student.level}</strong></span>
                        <div className="flex gap-2.5 mt-1 text-[9px] font-bold text-indigo-700 bg-indigo-50/60 px-2 py-1 rounded-lg border border-indigo-100/50 w-fit">
                          <span>📍 ولایت: <strong className="text-slate-800">{student.province || 'کابل'}</strong></span>
                          <span>•</span>
                          <span>📞 شماره تماس: <strong className="text-slate-800">{student.phone || 'فاقد شماره'}</strong></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                      <button
                        onClick={() => onApproveStudent(student.id, false)}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold rounded-xl transition"
                      >
                        رد درخواست
                      </button>
                      <button
                        onClick={() => onApproveStudent(student.id, true)}
                        className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-[10px] font-bold rounded-xl transition shadow"
                      >
                        تایید و پذیرش در کلاس
                      </button>
                    </div>
                  </div>
                ))}
                {pendingStudents.length === 0 && (
                  <p className="text-xs text-slate-400 py-6 text-center font-medium">هیچ درخواست پذیرش معلقی وجود ندارد.</p>
                )}
              </div>

              <h3 className="text-xs font-black text-slate-800 border-b border-slate-100 pb-2 pt-6">شاگردان فعال و در حال تحصیل کلاس شما:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {acceptedStudents.map((student) => (
                  <div key={student.id} className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <img src={student.avatarUrl} alt="" className="w-9 h-9 rounded-full border border-slate-100 object-cover" />
                      <div>
                        <span className="font-extrabold text-slate-800 text-xs block">{student.name}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">سطح: {student.level}</span>
                        <div className="flex gap-2 mt-1 text-[8px] font-bold text-slate-500">
                          <span>📍 ولایت: <strong className="text-slate-700">{student.province || 'کابل'}</strong></span>
                          <span>•</span>
                          <span>📞 تلفن: <strong className="text-slate-700">{student.phone || 'فاقد شماره'}</strong></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onApproveStudent(student.id, false)}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-[9px] font-bold transition-all"
                        >
                          تعلیق / لغو عضویت
                        </button>
                        <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                          پذیرفته شده
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] font-black text-slate-400">تغییر سطح:</span>
                        <select
                          value={student.level || 'beginner'}
                          onChange={(e) => {
                            onUpdateStudentLevel(student.id, e.target.value as any);
                          }}
                          className="text-[9px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-1.5 py-0.5 focus:outline-none cursor-pointer"
                        >
                          <option value="beginner">مبتدی</option>
                          <option value="intermediate">متوسط</option>
                          <option value="advanced">پیشرفته</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
                {acceptedStudents.length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center font-medium md:col-span-2">هنوز شاگرد فعالی در کلاس ندارید.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: COURSE MANAGEMENT (Phase 2) */}
        {activeTab === 'courses' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">مدیریت دوره‌های آموزشی</h2>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">برنامه درسی خود را بسازید، سطح و موضوع را تنظیم کنید و بازخورد ساختاری هوش مصنوعی را بگیرید.</p>
              </div>
              <button
                onClick={() => {
                  setCourseTitleInput('');
                  setCourseDescInput('');
                  setCourseCategoryInput('رابط کاربری (UI)');
                  setCourseLevelInput('beginner');
                  setEditingCourse(null);
                  setIsCreatingCourse(true);
                }}
                className="self-start md:self-auto flex items-center gap-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition shadow-md shadow-indigo-100"
              >
                <Plus size={15} />
                <span>تعریف دوره آموزشی جدید</span>
              </button>
            </div>

            {/* Create / Edit Course Form Panel */}
            {isCreatingCourse && (
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="text-xs font-black text-slate-800">
                    {editingCourse ? 'ویرایش مشخصات دوره' : 'تعریف دوره جدید توسط مدرس'}
                  </h3>
                  <button
                    onClick={() => setIsCreatingCourse(false)}
                    className="p-1 hover:bg-slate-200 rounded-full transition text-slate-400"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">عنوان دوره آموزشی</label>
                    <input
                      type="text"
                      placeholder="مثلاً: مبانی برنامه‌نویسی پایتون"
                      value={courseTitleInput}
                      onChange={(e) => setCourseTitleInput(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">دسته‌بندی موضوعی</label>
                    <input
                      type="text"
                      placeholder="مثلاً: علوم کامپیوتر، زبان انگلیسی، ریاضیات"
                      value={courseCategoryInput}
                      onChange={(e) => setCourseCategoryInput(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">سطح هدف</label>
                    <select
                      value={courseLevelInput}
                      onChange={(e) => setCourseLevelInput(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                    >
                      <option value="beginner">مبتدی (Beginner)</option>
                      <option value="intermediate">متوسطه (Intermediate)</option>
                      <option value="advanced">پیشرفته (Advanced)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">توضیحات و اهداف دوره (مخاطبان، آنچه یاد می‌گیرند و پیش‌نیازها)</label>
                  <textarea
                    rows={3}
                    placeholder="توضیح کوتاهی بنویسید تا دانشجویان ترغیب به ثبت‌نام شوند..."
                    value={courseDescInput}
                    onChange={(e) => setCourseDescInput(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    onClick={() => setIsCreatingCourse(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    انصراف
                  </button>
                  <button
                    onClick={() => {
                      if (!courseTitleInput.trim()) {
                        alert('لطفا عنوان دوره را وارد کنید.');
                        return;
                      }
                      if (editingCourse) {
                        onUpdateCourse({
                          ...editingCourse,
                          title: courseTitleInput,
                          description: courseDescInput,
                          category: courseCategoryInput,
                          level: courseLevelInput,
                        });
                      } else {
                        onAddCourse({
                          id: 'c_' + Date.now(),
                          title: courseTitleInput,
                          description: courseDescInput,
                          category: courseCategoryInput,
                          level: courseLevelInput,
                          teacherId: currentUser.id,
                          createdAt: new Date().toISOString()
                        });
                      }
                      setIsCreatingCourse(false);
                    }}
                    className="px-5 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow"
                  >
                    ذخیره دوره آموزشی
                  </button>
                </div>
              </div>
            )}

            {/* Courses Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {teacherCourses.map((course) => {
                const courseLessons = lessons.filter(l => l.courseId === course.id);
                const courseEnrollments = enrollments.filter(e => e.courseId === course.id);
                const courseActiveStudents = courseEnrollments.filter(e => e.status === 'accepted');
                const coursePendingStudents = courseEnrollments.filter(e => e.status === 'pending');

                return (
                  <div key={course.id} className="bg-white border border-slate-200 hover:border-indigo-200 transition-all rounded-3xl p-5 shadow-sm space-y-4 relative overflow-hidden flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                          {course.category}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="bg-slate-100 text-slate-700 text-[9px] font-extrabold px-2 py-0.5 rounded-md">
                            سطح: {course.level === 'beginner' ? 'مبتدی' : course.level === 'intermediate' ? 'متوسط' : 'پیشرفته'}
                          </span>
                        </div>
                      </div>

                      <h3 className="text-sm font-black text-slate-900 leading-snug">{course.title}</h3>
                      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{course.description || 'بدون توضیحات اضافی.'}</p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-100/80 text-center">
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold block">تعداد دروس</span>
                        <span className="text-xs font-mono font-black text-slate-800">{courseLessons.length} درس</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold block">دانشجویان فعال</span>
                        <span className="text-xs font-mono font-black text-emerald-600">{courseActiveStudents.length} نفر</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 font-extrabold block">درخواست معلق</span>
                        <span className="text-xs font-mono font-black text-amber-500">{coursePendingStudents.length} درخواست</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setCourseTitleInput(course.title);
                            setCourseDescInput(course.description);
                            setCourseCategoryInput(course.category);
                            setCourseLevelInput(course.level);
                            setEditingCourse(course);
                            setIsCreatingCourse(true);
                          }}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition"
                          title="ویرایش دوره"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={() => onDeleteCourse(course.id)}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition border border-rose-100"
                          title="حذف دوره"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {(() => {
                        const courseRatings = ratings.filter(r => r.courseId === course.id);
                        const averageStars = courseRatings.length > 0 
                          ? parseFloat((courseRatings.reduce((acc, r) => acc + r.rating, 0) / courseRatings.length).toFixed(1))
                          : null;

                        const videoCount = courseLessons.reduce((acc, l) => {
                          const videosListCount = l.youtubeVideos?.length || 0;
                          const singleVideoCount = l.youtubeUrl ? 1 : 0;
                          return acc + videosListCount + singleVideoCount;
                        }, 0);

                        const audioCount = courseLessons.reduce((acc, l) => {
                          const audiosListCount = l.audioExplanations?.length || 0;
                          const singleAudioCount = l.audioExplanationUrl ? 1 : 0;
                          return acc + audiosListCount + singleAudioCount;
                        }, 0);

                        const pdfCount = courseLessons.reduce((acc, l) => {
                          return acc + (l.pdfResources?.length || 0);
                        }, 0);

                        return (
                          <div className="flex items-center gap-2.5 text-[10px] text-slate-500 font-semibold flex-wrap">
                            <span className="flex items-center gap-0.5 text-amber-500 font-extrabold" title="امتیاز دوره">
                              <Star size={11} className="fill-current" />
                              <span>{averageStars !== null ? `${averageStars} (${courseRatings.length} رای)` : 'بدون امتیاز'}</span>
                            </span>
                            <span className="text-slate-200">|</span>
                            <span title="تعداد فیلم‌های آموزشی">🎥 {videoCount} فیلم</span>
                            <span title="تعداد فایل‌های صوتی">🎙️ {audioCount} صوت</span>
                            {pdfCount > 0 && <span title="تعداد جزوات PDF">📄 {pdfCount} جزوه</span>}
                          </div>
                        );
                      })()}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setActiveTab('lessons');
                          }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-[10px] font-extrabold rounded-xl transition shadow"
                        >
                          مدیریت دروس
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {teacherCourses.length === 0 && (
                <div className="col-span-2 py-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 space-y-3">
                  <BookOpen size={36} className="text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-400 font-medium">شما هنوز هیچ دوره آموزشی ثبت نکرده‌اید.</p>
                  <button
                    onClick={() => {
                      setCourseTitleInput('');
                      setCourseDescInput('');
                      setCourseCategoryInput('رابط کاربری (UI)');
                      setCourseLevelInput('beginner');
                      setEditingCourse(null);
                      setIsCreatingCourse(true);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition shadow"
                  >
                    ایجاد اولین دوره آموزشی
                  </button>
                </div>
              )}
            </div>

            {/* Course Enrollment Approvals inside Courses Tab */}
            {pendingEnrollments.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
                <h3 className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
                  <span>درخواست‌های ثبت‌نام معلق در دوره‌های شما:</span>
                </h3>

                <div className="space-y-3">
                  {pendingEnrollments.map((enroll) => {
                    const targetCourse = courses.find(c => c.id === enroll.courseId);
                    return (
                      <div key={enroll.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-sm">
                        <div>
                          <span className="font-extrabold text-slate-800 text-xs block">{enroll.studentName}</span>
                          <span className="text-[10px] text-slate-500 mt-1 block font-semibold">
                            درخواست عضویت در دوره: <strong className="text-indigo-600 font-black">{targetCourse?.title || 'دوره نامشخص'}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                          <button
                            onClick={() => onApproveEnrollment(enroll.id, false)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-lg transition"
                          >
                            رد ثبت‌نام
                          </button>
                          <button
                            onClick={() => onApproveEnrollment(enroll.id, true)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition shadow-sm"
                          >
                            تایید ثبت‌نام
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI Course Review Modal Result */}
            {reviewedCourseId && (
              <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
                  {/* Header */}
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-amber-50">
                    <div className="flex items-center gap-2">
                      <Sparkles size={18} className="text-amber-600 animate-spin-slow" />
                      <h3 className="text-sm font-black text-amber-950">ارزیاب و داور هوشمند برنامه درسی</h3>
                    </div>
                    <button
                      onClick={() => setReviewedCourseId(null)}
                      className="p-1 hover:bg-amber-100 rounded-full transition text-amber-800"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 text-right" dir="rtl">
                    {isCourseReviewing ? (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs text-slate-500 font-extrabold">مربی هوش مصنوعی Gemini در حال کاوش عمیق سرفصل‌ها و اهداف دوره شماست...</p>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed font-semibold">
                        <div className="whitespace-pre-wrap bg-slate-50 p-5 rounded-2xl border border-slate-100 text-xs font-semibold leading-relaxed">
                          {courseReviewFeedback}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                    <button
                      onClick={() => setReviewedCourseId(null)}
                      className="px-5 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow"
                    >
                      فهمیدم، متشکرم
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LESSON MANAGEMENT */}
        {activeTab === 'lessons' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">مدیریت مطالب درسی و کوئست‌ها</h2>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">مدرسان می‌توانند مطالب، عکس‌های کتب، و چالش‌های واجد شرایط مختلف را بنویسند.</p>
              </div>
              <button
                onClick={createEmptyLesson}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow"
              >
                <Plus size={14} />
                <span>ایجاد درس به صورت دستی</span>
              </button>
            </div>

            {/* AI Peer Review View for Lessons */}
            {peerReviewFeedback && (
              <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-3xl space-y-3 relative animate-fade-in">
                <button
                  onClick={() => setPeerReviewFeedback('')}
                  className="absolute top-3 left-3 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-600" />
                  <h3 className="text-xs font-black text-indigo-950">ارزیابی همتای هوش مصنوعی (AI Peer Reviewer)</h3>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-indigo-100 text-xs text-slate-800 leading-relaxed space-y-2 whitespace-pre-wrap max-h-80 overflow-y-auto font-semibold">
                  {peerReviewFeedback}
                </div>
              </div>
            )}

            {/* Course Filter Selection */}
            <div className="flex items-center gap-3 bg-white p-3.5 border border-slate-200 rounded-3xl">
              <span className="text-[10px] font-black text-slate-700">📌 فیلتر براساس دوره آموزشی:</span>
              <select
                value={selectedCourseFilter}
                onChange={(e) => setSelectedCourseFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-[10px] font-bold px-3 py-1.5 rounded-xl text-slate-800 focus:outline-none min-w-[200px]"
              >
                <option value="all">📚 تمامی دوره‌ها ({teacherLessons.length} درس)</option>
                {teacherCourses.map(c => {
                  const lessonCount = teacherLessons.filter(l => l.courseId === c.id).length;
                  return (
                    <option key={c.id} value={c.id}>📁 {c.title} ({lessonCount} درس)</option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {teacherLessons
                .filter(lesson => selectedCourseFilter === 'all' || lesson.courseId === selectedCourseFilter)
                .map((lesson) => (
                <div key={lesson.id} className="bg-white border border-slate-200 p-5 rounded-3xl flex flex-col justify-between hover:shadow-md transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase">
                          {lesson.category}
                        </span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          lesson.level === 'beginner' ? 'bg-emerald-50 text-emerald-700' : lesson.level === 'intermediate' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          سطح {lesson.level === 'beginner' ? 'ابتدایی' : lesson.level === 'intermediate' ? 'متوسطه' : 'پیشرفته'}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openLessonEditor(lesson)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-50 transition"
                          title="ویرایش درس"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => onDeleteLesson(lesson.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-50 transition"
                          title="حذف درس"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-xs font-black text-slate-800">{lesson.title}</h3>
                    {(() => {
                      const lessonCourse = courses.find(c => c.id === lesson.courseId);
                      return lessonCourse ? (
                        <div className="mt-1">
                          <span className="text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded-md font-black inline-block">
                            دوره: {lessonCourse.title}
                          </span>
                        </div>
                      ) : null;
                    })()}
                    <p className="text-[10px] text-slate-500 mt-1.5 line-clamp-2 leading-relaxed font-semibold">
                      {lesson.content.replace(/[#*`]/g, '')}
                    </p>

                     {(() => {
                      const videoCountLesson = (lesson.youtubeVideos?.length || 0) + (lesson.youtubeUrl ? 1 : 0);
                      const audioCountLesson = (lesson.audioExplanations?.length || 0) + (lesson.audioExplanationUrl ? 1 : 0);
                      const pdfCountLesson = lesson.pdfResources?.length || 0;

                      return (
                        <div className="mt-4 pt-3 border-t border-slate-100">
                          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-semibold flex-wrap">
                            <span title="تعداد چالش‌ها و تمرین‌های این درس">📝 {lesson.questions?.length || 0} چالش</span>
                            {videoCountLesson > 0 && <span title="تعداد فیلم‌های آموزشی این درس">🎥 {videoCountLesson} فیلم آموزشی</span>}
                            {audioCountLesson > 0 && <span title="تعداد فایل‌های صوتی توضیحی این درس">🎙️ {audioCountLesson} فایل صوتی</span>}
                            {pdfCountLesson > 0 && <span title="تعداد جزوات PDF این درس">📄 {pdfCountLesson} جزوه PDF</span>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SUBMISSIONS */}
        {activeTab === 'submissions' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black text-slate-900">بررسی و تصحیح تکالیف هنرجویان</h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">پاسخ‌های رسم شده، دست‌نویس، کدهای فرانت‌اند و ضبط صوت را ارزیابی و برای آنها نمره صادر کنید.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left col: sub list */}
              <div className="lg:col-span-1 space-y-2">
                <h3 className="text-xs font-black text-slate-400 mb-2 px-1">تکالیف ثبت شده:</h3>
                {relevantSubmissions.map((sub) => {
                  const lesson = lessons.find(l => l.id === sub.lessonId);
                  return (
                    <button
                      key={sub.id}
                      onClick={() => startReview(sub)}
                      className={`w-full text-right p-3.5 border rounded-2xl hover:bg-slate-50 transition-all flex flex-col gap-1.5 ${
                        activeSubId === sub.id ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200 bg-white shadow-sm'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-extrabold text-slate-800 text-xs">{sub.studentName}</span>
                        <div className="flex gap-1 items-center">
                          {sub.status === 'pending' && sub.assistantGrade !== undefined && (
                            <span className="text-[8px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded-full font-black flex items-center gap-0.5 animate-pulse">
                              🤖 پیش‌نویس استادیار آماده
                            </span>
                          )}
                          {sub.attemptsCount !== undefined && sub.attemptsCount > 1 && (
                            <span className="text-[8px] bg-rose-50 border border-rose-200 text-rose-700 px-1.5 py-0.5 rounded-full font-black flex items-center gap-0.5">
                              🔁 تلاش مجدد ({sub.attemptsCount - 1})
                            </span>
                          )}
                          {sub.status === 'pending' ? (
                            sub.attemptsCount !== undefined && sub.attemptsCount > 1 ? (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                                📝 پاسخ اصلاح‌شده ارسال شد (در انتظار بررسی)
                              </span>
                            ) : (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                بررسی نشده
                              </span>
                            )
                          ) : sub.isTryAgainRequested ? (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              ✍️ بازخورد ارسال شد (منتظر اصلاح)
                            </span>
                          ) : (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              ✅ نمره {sub.grade} ثبت شد
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 leading-none line-clamp-1">درس: {lesson?.title}</span>
                      <span className="text-[9px] text-slate-400 font-mono">{new Date(sub.submittedAt).toLocaleDateString('fa-IR')}</span>
                    </button>
                  );
                })}
                {relevantSubmissions.length === 0 && (
                  <p className="text-xs text-slate-400 py-6 text-center font-medium">هیچ تکلیفی یافت نشد.</p>
                )}
              </div>

              {/* Right col: active grader */}
              <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-3xl p-6 min-h-[400px] flex flex-col justify-between">
                {activeSubId ? (
                  (() => {
                    const sub = submissions.find(s => s.id === activeSubId);
                    if (!sub) return null;
                    const lesson = lessons.find(l => l.id === sub.lessonId);

                    return (
                      <div className="space-y-6 flex-1 flex flex-col justify-between">
                        
                        {/* Grader Header */}
                        <div className="border-b border-slate-200 pb-4 flex justify-between items-center">
                          <div>
                            <span className="text-[9px] font-black text-indigo-600 uppercase">ارزیابی تکلیف هنرجو</span>
                            <h3 className="text-sm font-black text-slate-900 mt-1">{sub.studentName}</h3>
                            <p className="text-[10px] text-slate-500 mt-1 font-semibold">درس مربوطه: {lesson?.title}</p>
                          </div>
                          <button onClick={() => setActiveSubId(null)} className="p-1 hover:bg-slate-200 rounded-full transition text-slate-400">
                            <X size={16} />
                          </button>
                        </div>

                        {/* Answers Loop */}
                        <div className="space-y-4">
                          {sub.answers.map((ans) => {
                            const question = lesson?.questions.find(q => q.id === ans.questionId);
                            return (
                              <div key={ans.questionId} className="bg-white border border-slate-200 p-4 rounded-2xl space-y-3">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                  <h4 className="text-xs font-black text-slate-800">{question?.title || 'چالش'}</h4>
                                  <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold">
                                    بارم: {question?.points} امتیاز
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">{question?.description}</p>

                                {/* Dynamic answers */}
                                {ans.answerType === 'text' && (
                                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                                    {ans.value || 'پاسخی ثبت نشده است.'}
                                  </div>
                                )}

                                {ans.answerType === 'code_editor' && (
                                  <div className="bg-slate-950 text-slate-100 p-4 rounded-2xl font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre">
                                    {ans.value || '// کدی ثبت نشده است'}
                                  </div>
                                )}

                                {ans.answerType === 'handwritten_photo' && (
                                  <div className="space-y-1 text-center">
                                    {ans.value ? (
                                      <img src={ans.value} alt="رسم دستی دانش‌آموز" className="max-h-60 rounded-xl border border-slate-200 mx-auto object-contain bg-slate-950" />
                                    ) : (
                                      <p className="text-xs text-slate-400">تصویری رسم نشده است.</p>
                                    )}
                                  </div>
                                )}

                                {ans.answerType === 'notebook_photo' && (
                                  <div className="space-y-1 text-center">
                                    {ans.value ? (
                                      <img src={ans.value} alt="تصویر دفترچه دانش‌آموز" className="max-h-80 rounded-2xl border-2 border-slate-200 mx-auto object-contain bg-slate-50 shadow-md" />
                                    ) : (
                                      <p className="text-xs text-slate-400">تصویری ارسال نشده است.</p>
                                    )}
                                  </div>
                                )}

                                {ans.answerType === 'audio_recording' && (
                                  <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-xl border border-slate-200">
                                    <Mic size={16} className="text-rose-500 animate-pulse" />
                                    <span className="text-xs font-bold text-slate-700">توضیح صوتی ضبط‌شده</span>
                                    <audio src={ans.value} controls className="h-8 max-w-[200px] mr-auto" />
                                  </div>
                                )}

                                {ans.answerType === 'mission_url' && (
                                  <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                                    <LinkIcon size={14} className="text-indigo-600" />
                                    <span className="text-xs font-bold text-slate-700">آدرس پروژه آنلاین:</span>
                                    <a href={ans.value} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline font-mono break-all">{ans.value}</a>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* AI Co-Pilot Grading Advice */}
                        <div className="p-4 bg-indigo-50 border border-indigo-200/60 rounded-2xl space-y-3">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1.5">
                              <Sparkles size={16} className="text-indigo-600" />
                              <h4 className="text-xs font-black text-indigo-950">تحلیل ارزیابی هوش مصنوعی (Gemini-3.5)</h4>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleRequestAiReview(sub)}
                                disabled={isAiReviewing || isAutoExecuting}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black rounded-lg transition disabled:opacity-50"
                              >
                                {isAiReviewing && !isAutoExecuting ? 'در حال بررسی کدها...' : 'محاسبه ارزیابی هوشمند'}
                              </button>
                              <button
                                onClick={() => handleAutomaticTaskExecution(sub)}
                                disabled={isAiReviewing || isAutoExecuting}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black rounded-lg transition disabled:opacity-50 flex items-center gap-1 shadow-sm"
                              >
                                {isAutoExecuting ? (
                                  <>
                                    <RotateCw size={11} className="animate-spin" />
                                    <span>در حال اجرا...</span>
                                  </>
                                ) : (
                                  <>
                                    <Play size={11} />
                                    <span>اجرای خودکار وظایف</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {aiReviewResult || sub.assistantFeedback ? (
                            <div className="p-4 bg-white border border-indigo-100 rounded-2xl text-xs text-slate-800 leading-relaxed text-right space-y-3 prose prose-slate max-w-none">
                              <div className="flex items-center justify-between border-b border-indigo-50 pb-2 mb-2 text-[10px] text-indigo-700 font-extrabold">
                                <span>🤖 ارزیابی پیش‌نویس استادیار هوش مصنوعی:</span>
                                <span>نمره پیشنهادی: {sub.assistantGrade !== undefined ? sub.assistantGrade : (sub.grade || 0)} از {sub.maxPoints}</span>
                              </div>
                              <ReactMarkdown>{aiReviewResult || sub.assistantFeedback || ''}</ReactMarkdown>
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                              با زدن دکمه فوق کدهای React و جواب‌های دانش‌آموز مجدداً تحلیل شده و راهنمایی‌ها و نمره پیشنهادی هوشمند نمایش داده می‌شود.
                            </p>
                          )}
                        </div>

                        {/* Grading Form */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 pt-4">
                          <h4 className="text-xs font-black text-slate-850 flex items-center gap-1">
                            <span>✏️ ثبت کارنامه نهایی و بازخورد مدرس</span>
                          </h4>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-150">
                            {/* Role selector */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-slate-500 font-bold block">امضا و سمت تصحیح‌کننده:</label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setGradedBy('teacher')}
                                  className={`py-2 px-3 text-[10px] font-black rounded-lg border transition-all ${
                                    gradedBy === 'teacher'
                                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  👨‍🏫 استاد
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setGradedBy('assistant')}
                                  className={`py-2 px-3 text-[10px] font-black rounded-lg border transition-all ${
                                    gradedBy === 'assistant'
                                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  🎓 دستیار استاد (Assistant)
                                </button>
                              </div>
                            </div>

                            {/* Try Again status */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-slate-500 font-bold block">وضعیت ارزیابی تکالیف:</label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setIsTryAgainRequested(false)}
                                  className={`py-2 px-3 text-[10px] font-black rounded-lg border transition-all ${
                                    !isTryAgainRequested
                                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  ✅ تکمیل و تأیید نهایی چالش
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsTryAgainRequested(true)}
                                  className={`py-2 px-3 text-[10px] font-black rounded-lg border transition-all ${
                                    isTryAgainRequested
                                      ? 'bg-amber-500 border-amber-500 text-white shadow-sm animate-pulse'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  🔁 درخواست تلاش مجدد ( Try Again )
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1 md:col-span-1">
                              <label className="text-[10px] text-slate-400 font-bold block">نمره کلاسی (حداکثر {sub.maxPoints})</label>
                              <input
                                type="number"
                                min="0"
                                max={sub.maxPoints}
                                value={manualGrade}
                                onChange={(e) => setManualGrade(Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1 md:col-span-3">
                              <label className="text-[10px] text-slate-400 font-bold block">توضیحات، تشویق‌ها و بازخورد تفصیلی</label>
                              <textarea
                                rows={5}
                                value={manualFeedback}
                                onChange={(e) => setManualFeedback(e.target.value)}
                                placeholder={isTryAgainRequested ? "مثال: در نوشتن افکت درخشش دکمه اشتباه کوچکی رخ داده است. این کلاس را تست کن و دوباره بفرست..." : "مثال: کار شما فوق‌العاده تمیز و عالی بود! امتیاز کامل به شما تعلق گرفت."}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none resize-y font-medium leading-relaxed"
                              />
                            </div>
                          </div>

                          {isTryAgainRequested && (
                            <div className="p-3 bg-amber-50 border border-amber-200 text-[10px] text-amber-900 rounded-xl font-bold leading-relaxed">
                              ⚠️ شما گزینه «درخواست تلاش مجدد» را انتخاب کرده‌اید. برای دانش‌آموز اعلانی فرستاده خواهد شد تا مجدداً پاسخ‌ها را ارسال کند و راهنمایی‌های شما را به عنوان مربی دنبال نماید.
                            </div>
                          )}

                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              onClick={() => {
                                const lesson = lessons.find(l => l.id === sub.lessonId);
                                const lessonTitle = lesson ? lesson.title : '';

                                const executeSave = () => {
                                  setIsSaving(true);
                                  setTimeout(() => {
                                    onGradeSubmission(sub.id, manualGrade, manualFeedback, aiReviewResult, gradedBy, isTryAgainRequested);
                                    setIsSaving(false);
                                    setSaveSuccess(true);
                                    setTimeout(() => {
                                      setSaveSuccess(false);
                                    }, 3000);
                                  }, 800);
                                };

                                if (!isTryAgainRequested) {
                                  const confirmMsg = `آیا از ثبت نهایی کارنامه و بستن چالش‌های این درس برای دانش‌آموز اطمینان دارید؟\n\nپس از تایید، چالش‌های این درس برای دانش‌آموز قفل شده و پاسخ‌های ایشان ثبت نهایی می‌گردد.\n\nامتیاز نهایی کلاسی: ${manualGrade} از ${sub.maxPoints}\nبازخورد ثبت‌شده:\n"${manualFeedback || 'بدون بازخورد متنی'}"`;
                                  setConfirmModal({
                                    isOpen: true,
                                    title: `تأیید نهایی درس: ${lessonTitle}`,
                                    message: confirmMsg,
                                    onConfirm: executeSave
                                  });
                                } else {
                                  const confirmMsg = `آیا از ارسال درخواست تلاش مجدد (Try Again) برای این درس اطمینان دارید؟\n\nپیامی به همراه بازخورد و راهنما برای دانش‌آموز ارسال خواهد شد تا پاسخ‌های خود را ویرایش و اصلاح کند.\n\nبازخورد و نکات اصلاحی ثبت‌شده:\n"${manualFeedback || 'بدون بازخورد متنی'}"`;
                                  setConfirmModal({
                                    isOpen: true,
                                    title: `درخواست تلاش مجدد درس: ${lessonTitle}`,
                                    message: confirmMsg,
                                    onConfirm: executeSave
                                  });
                                }
                              }}
                              disabled={isSaving}
                              className={`px-6 py-2.5 text-xs font-extrabold rounded-xl transition shadow flex items-center gap-2 ${
                                saveSuccess 
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                  : 'bg-slate-900 hover:bg-black text-white disabled:opacity-50'
                              }`}
                            >
                              {isSaving ? (
                                <>
                                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                  <span>در حال ثبت و ارسال...</span>
                                </>
                              ) : saveSuccess ? (
                                <>
                                  <CheckCircle2 size={14} className="text-white" />
                                  <span>بازخورد با موفقیت ثبت و ارسال شد!</span>
                                </>
                              ) : (
                                <span>تایید نهایی و ارسال بازخورد کلاسی</span>
                              )}
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })()
                ) : (
                  <div className="m-auto text-center py-12 max-w-sm">
                    <CheckCircle2 size={36} className="text-slate-300 mx-auto mb-2" />
                    <h4 className="text-xs font-black text-slate-700">کادر ارزیابی و تصحیح هوشمند</h4>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed font-semibold">
                      یکی از تکالیف را از پنل کناری انتخاب کنید تا کدهای فرانت‌اند، توضیح صوتی، پاسخ رسم شده یا تشریحی هنرجو نمایش داده شده و تصحیح کنید.
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 6: CHAT WITH STUDENTS (WhatsApp style) */}
        {activeTab === 'messages' && (() => {
          // Find all students enrolled in any teacher's courses
          const teacherCourseIds = courses.filter(c => c.teacherId === currentUser.id || !c.teacherId).map(c => c.id);
          const enrolledStudentIds = enrollments.filter(e => teacherCourseIds.includes(e.courseId) && e.status === 'accepted').map(e => e.studentId);
          const chatStudents = users.filter(u => u.role === 'student' && (enrolledStudentIds.includes(u.id) || directMessages.some(m => m.senderId === u.id || m.receiverId === u.id)));

          const selectedStudent = users.find(u => u.id === selectedChatStudentId);
          const activeMessages = directMessages.filter(m => 
            selectedStudent && 
            ((m.senderId === currentUser.id && m.receiverId === selectedStudent.id) ||
             (m.senderId === selectedStudent.id && m.receiverId === currentUser.id))
          );

          const handleSend = () => {
            if (!selectedStudent) return;
            if (!teacherChatMessage.trim() && !teacherChatAttachment) return;

            const newMsg: DirectMessage = {
              id: 'dm_' + Date.now(),
              senderId: currentUser.id,
              senderName: currentUser.name,
              senderRole: 'teacher',
              receiverId: selectedStudent.id,
              content: teacherChatMessage.trim(),
              createdAt: new Date().toISOString(),
              attachmentType: teacherChatAttachment ? (teacherChatAttachment.type === 'voice' ? 'audio' : teacherChatAttachment.type) : undefined,
              attachmentUrl: teacherChatAttachment?.dataUrl,
              fileName: teacherChatAttachment?.name || (teacherChatAttachment?.type === 'voice' ? 'پیام صوتی مربی.wav' : undefined)
            };

            onSendDirectMessage(newMsg);
            setTeacherChatMessage('');
            setTeacherChatAttachment(null);
          };

          return (
            <div className="bg-slate-50 border border-slate-200 rounded-3xl overflow-hidden shadow-sm h-[calc(100vh-140px)] flex flex-col md:flex-row" dir="rtl">
              {/* Right Sidebar: Student List */}
              <div className="w-full md:w-80 border-l border-slate-200 bg-white flex flex-col h-full shrink-0">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span>💬</span>
                    <span>کانون گفتگوی هنرجویان</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">با هنرجویان کلاس خود به صورت مستقیم و آنی مکاتبه کنید.</p>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {chatStudents.map((student) => {
                    const isSelected = selectedChatStudentId === student.id;
                    const lastMsg = directMessages
                      .filter(m => (m.senderId === student.id && m.receiverId === currentUser.id) || (m.senderId === currentUser.id && m.receiverId === student.id))
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

                    return (
                      <button
                        key={student.id}
                        onClick={() => setSelectedChatStudentId(student.id)}
                        className={`w-full text-right p-4 transition-all flex items-center gap-3 focus:outline-none ${
                          isSelected 
                            ? 'bg-indigo-50/70 border-r-4 border-indigo-600' 
                            : 'hover:bg-slate-50 bg-white'
                        }`}
                      >
                        <img 
                          src={student.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100'} 
                          alt={student.name}
                          className="w-10 h-10 rounded-full border border-slate-200 object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-850 truncate">{student.name}</span>
                            {lastMsg && (
                              <span className="text-[8px] font-mono text-slate-400 font-bold shrink-0">
                                {new Date(lastMsg.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate font-semibold mt-1">
                            {lastMsg ? (lastMsg.content || '📎 فایل پیوست فرستاده شد') : 'گفتگو را شروع کنید...'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                  {chatStudents.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-xs font-semibold leading-relaxed">
                      هنوز هنرجویی در دوره‌های شما پذیرفته نشده است.
                    </div>
                  )}
                </div>
              </div>

              {/* Left Column: Messages Feed */}
              <div className="flex-1 flex flex-col bg-slate-50 h-full relative">
                {selectedStudent ? (
                  <>
                    {/* Active Chat Header */}
                    <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-3">
                        <img
                          src={selectedStudent.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100'}
                          alt={selectedStudent.name}
                          className="w-9 h-9 rounded-full border border-slate-200 object-cover"
                        />
                        <div>
                          <h4 className="text-xs font-black text-slate-800">{selectedStudent.name}</h4>
                          <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-black mt-0.5 inline-block">
                            هنرجوی آنلاین کلاسی
                          </span>
                        </div>
                      </div>

                      <div className="text-[9px] text-slate-400 font-bold max-w-[200px] text-left">
                        ⏱️ تاریخچه این گفتگو موقت بوده و برای بهینه‌سازی سرعت پس از ۲۴ ساعت یا فراتر از ۱۵ پیام پاکسازی می‌شود.
                      </div>
                    </div>

                    {/* Messages Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {activeMessages.map((msg) => {
                        const isMe = msg.senderId === currentUser.id;
                        const msgSenderUser = users.find(u => u.id === msg.senderId);
                        const msgSenderAvatarUrl = msgSenderUser?.avatarUrl || (msg.senderRole === 'teacher' ? 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80' : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100');

                        return (
                          <div key={msg.id} className={`flex gap-3 max-w-[85%] ${isMe ? 'mr-auto flex-row-reverse' : 'ml-auto'}`}>
                            <img
                              src={msgSenderAvatarUrl}
                              alt={msg.senderName}
                              className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-150"
                            />
                            <div className="space-y-1">
                              <span className="text-[8px] text-slate-400 font-bold block px-1">
                                {isMe ? 'من' : msg.senderName} • {new Date(msg.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <div className={`p-3.5 rounded-2xl text-xs leading-relaxed font-semibold ${
                                isMe 
                                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                                  : 'bg-white text-slate-850 border border-slate-200 rounded-tl-none shadow-sm'
                              }`}>
                                {msg.content && <p className="whitespace-pre-line">{msg.content}</p>}
                                
                                {msg.attachmentType === 'image' && (
                                  <div className="mt-2 rounded-lg overflow-hidden border border-slate-200/50 bg-slate-50 p-1">
                                    <img src={msg.attachmentUrl} className="max-h-60 rounded-md object-contain mx-auto" alt="تصویر ارسالی" />
                                  </div>
                                )}

                                {msg.attachmentType === 'audio' && (
                                  <div className={`mt-2 flex items-center gap-2 rounded-xl p-2.5 ${isMe ? 'bg-indigo-700/80' : 'bg-slate-50 border border-slate-100'} min-w-[200px]`}>
                                    <button 
                                      onClick={() => {
                                        const aud = new Audio(msg.attachmentUrl);
                                        aud.play().catch(() => alert('پخش صدای فرستاده شده شبیه‌سازی شد!'));
                                      }}
                                      className="p-1.5 bg-indigo-500 text-white rounded-full hover:bg-indigo-400 shrink-0 transition"
                                    >
                                      <Volume2 size={12} />
                                    </button>
                                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden relative">
                                      <div className="absolute inset-y-0 right-0 w-2/3 bg-indigo-400 rounded-full" />
                                    </div>
                                    <span className="text-[8px] font-mono opacity-80">۰:۱۲</span>
                                  </div>
                                )}

                                {msg.attachmentType === 'document' && (
                                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200/60 p-2.5 bg-slate-50 text-slate-800">
                                    <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                                      <File size={14} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <span className="text-[10px] font-black block truncate text-slate-800">{msg.fileName}</span>
                                      <span className="text-[8px] text-slate-400 block font-mono">سند کلاسی</span>
                                    </div>
                                    <a href={msg.attachmentUrl} download={msg.fileName} className="text-[10px] font-black text-indigo-600 hover:underline shrink-0 pr-2 border-r border-slate-200">
                                      دانلود
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {activeMessages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                          <span>🕊️</span>
                          <span className="text-xs font-black text-slate-600 mt-2">هیچ پیامی رد و بدل نشده است</span>
                          <span className="text-[10px] text-slate-400 mt-1 font-semibold">نخستین پیام خود را ارسال کنید تا گفتگو با مربی آغاز شود.</span>
                        </div>
                      )}
                    </div>

                    {/* Chat Input Bar */}
                    <div className="p-4 border-t border-slate-200 bg-white shrink-0">
                      {teacherChatAttachment && (
                        <div className="mb-3 p-2.5 bg-indigo-50/50 border border-indigo-150 rounded-xl flex items-center justify-between gap-3 text-xs">
                          <span className="text-indigo-950 font-black flex items-center gap-1.5">
                            <span>📎 سند آماده ارسال:</span>
                            <span className="text-[10px] text-indigo-700 bg-white border px-2 py-0.5 rounded-md font-mono">{teacherChatAttachment.name || 'سند پیوست شده'}</span>
                          </span>
                          <button onClick={() => setTeacherChatAttachment(null)} className="text-[10px] text-rose-600 font-extrabold hover:underline">حذف</button>
                        </div>
                      )}

                      <div className="flex items-center gap-2.5">
                        {/* Image attachment */}
                        <label className="p-2.5 bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-slate-200 rounded-xl transition cursor-pointer shrink-0">
                          <ImageIcon size={16} />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const r = new FileReader();
                                r.onload = (ev) => {
                                  if (ev.target?.result) {
                                    setTeacherChatAttachment({
                                      type: 'image',
                                      dataUrl: ev.target.result as string,
                                      name: file.name
                                    });
                                  }
                                };
                                r.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>

                        {/* Document attachment */}
                        <label className="p-2.5 bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-slate-200 rounded-xl transition cursor-pointer shrink-0">
                          <Paperclip size={16} />
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.txt"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const r = new FileReader();
                                r.onload = (ev) => {
                                  if (ev.target?.result) {
                                    setTeacherChatAttachment({
                                      type: 'document',
                                      dataUrl: ev.target.result as string,
                                      name: file.name
                                    });
                                  }
                                };
                                r.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>

                        {/* Simulated voice message */}
                        <button
                          type="button"
                          onClick={() => {
                            setTeacherChatAttachment({
                              type: 'voice',
                              dataUrl: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA',
                              name: 'پیام صوتی مربی.wav'
                            });
                            alert('پیام صوتی با موفقیت شبیه‌سازی و پیوست شد! می‌توانید دکمه ارسال را بزنید.');
                          }}
                          className="p-2.5 bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-slate-200 rounded-xl transition shrink-0"
                          title="ضبط و ارسال پیام صوتی"
                        >
                          <Mic size={16} />
                        </button>

                        <input
                          type="text"
                          value={teacherChatMessage}
                          onChange={(e) => setTeacherChatMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                          placeholder="پیام خود را بنویسید (مانند چت در واتس‌اپ)..."
                          className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-855 focus:outline-none"
                        />

                        <button
                          onClick={handleSend}
                          className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shrink-0"
                        >
                          <Send size={16} className="transform rotate-180" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                    <span className="text-3xl">💬</span>
                    <h4 className="text-sm font-black text-slate-700 mt-2">اتاق گفتگوی اختصاصی با هنرجویان</h4>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed font-semibold max-w-sm">
                      یکی از هنرجویان خود را از منوی سمت راست انتخاب کنید تا گفتگوی دونفره جهت حل مشکلات درسی و رفع اشکال باز شود.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* TAB 7: BACKUP AND TRANSFER */}
        {activeTab === 'backup' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
            {/* Header section */}
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="px-3 py-1 bg-indigo-700/50 backdrop-blur-sm text-indigo-200 text-[10px] font-black rounded-full uppercase tracking-wider">
                  همکاری و انتقال دانش اساتید
                </span>
                <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
                  <span>🔄</span> پشتیبان‌گیری و انتقال دوره‌ها
                </h1>
                <p className="text-xs text-indigo-100 font-medium leading-relaxed max-w-2xl">
                  دیگر نگران امنیت محتوای خود نباشید. از این پس می‌توانید به راحتی از تمام دوره‌ها و دروس خود نسخه پشتیبان دریافت کنید، آن‌ها را بازیابی نمایید یا به اساتید دیگر هدیه داده و در ترویج علم همکاری کنید.
                </p>
              </div>
              <div className="shrink-0">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 text-3xl">
                  📚
                </div>
              </div>
            </div>

            {/* Main content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Export Panel */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Download size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-900">خروجی گرفتن و هدیه دوره‌ها</h2>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">دانلود محتوای آموزشی برای پشتیبان‌گیری شخصی یا اشتراک با همکاران</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] text-slate-600 font-black leading-relaxed">
                      💡 دوره‌های مورد نظر خود را جهت پشتیبان‌گیری انتخاب کنید. تمام دروس مرتبط، سوالات، کدهای آغازین و پیوست‌های چندرسانه‌ای درون فایل دانلود خواهند شد:
                    </p>

                    {teacherCourses.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs font-bold">
                        ❌ شما هنوز هیچ دوره آموزشی ثبت نکرده‌اید تا بتوانید از آن پشتیبان بگیرید.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        <label className="flex items-center gap-2.5 p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition">
                          <input
                            type="checkbox"
                            checked={selectedExportCourseIds.length === teacherCourses.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedExportCourseIds(teacherCourses.map(c => c.id));
                              } else {
                                setSelectedExportCourseIds([]);
                              }
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                          />
                          <span className="text-xs font-black text-slate-800">انتخاب همه دوره‌ها ({teacherCourses.length} دوره)</span>
                        </label>

                        {teacherCourses.map(course => {
                          const courseLessonsCount = lessons.filter(l => l.courseId === course.id).length;
                          const isChecked = selectedExportCourseIds.includes(course.id);
                          return (
                            <label
                              key={course.id}
                              className={`flex items-center justify-between gap-3 p-3 border rounded-xl cursor-pointer hover:border-slate-300 hover:bg-slate-50/50 transition ${
                                isChecked ? 'border-indigo-200 bg-indigo-50/20' : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setSelectedExportCourseIds(prev => 
                                      prev.includes(course.id) 
                                        ? prev.filter(id => id !== course.id) 
                                        : [...prev, course.id]
                                    );
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                />
                                <div className="min-w-0">
                                  <span className="text-xs font-black text-slate-850 block truncate">{course.title}</span>
                                  <span className="text-[9px] text-slate-400 font-bold block mt-0.5">دسته: {course.category} • سطح: {
                                    course.level === 'beginner' ? 'مبتدی' : course.level === 'intermediate' ? 'متوسط' : 'پیشرفته'
                                  }</span>
                                </div>
                              </div>
                              <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-xl shrink-0">
                                {courseLessonsCount} درس
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={handleExportCourses}
                    disabled={selectedExportCourseIds.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-2xl shadow-md shadow-indigo-600/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={16} />
                    <span>دریافت فایل پشتیبان ({selectedExportCourseIds.length} دوره انتخاب شده)</span>
                  </button>
                  <p className="text-[9px] text-slate-400 font-bold text-center mt-2 leading-relaxed">
                    فایل نهایی یک سند JSON استاندارد خواهد بود که به عنوان بسته آموزشی کامل قابل بازیابی روی هر حساب کاربری دیگری است.
                  </p>
                </div>
              </div>

              {/* Import Panel */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                      <UploadCloud size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-900">وارد کردن و بازیابی دوره‌ها</h2>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">بارگذاری فایل پشتیبان برای بازیابی اطلاعات یا پذیرش هدیه آموزشی همکاران</p>
                    </div>
                  </div>

                  {/* Drag and Drop File Input Area */}
                  {!importFileContent ? (
                    <div className="space-y-3">
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragOver(true);
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragOver(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            handleImportFileSelect(e.dataTransfer.files[0]);
                          }
                        }}
                        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
                          isDragOver 
                            ? 'border-indigo-500 bg-indigo-50/40 text-indigo-700' 
                            : 'border-slate-300 hover:border-indigo-400 bg-slate-50 text-slate-500'
                        }`}
                        onClick={() => {
                          const fileInput = document.createElement('input');
                          fileInput.type = 'file';
                          fileInput.accept = '.json';
                          fileInput.onchange = (e) => {
                            const files = (e.target as HTMLInputElement).files;
                            if (files && files[0]) {
                              handleImportFileSelect(files[0]);
                            }
                          };
                          fileInput.click();
                        }}
                      >
                        <UploadCloud size={32} className={`mx-auto mb-2.5 ${isDragOver ? 'text-indigo-600 animate-bounce' : 'text-slate-400'}`} />
                        <span className="text-xs font-black block text-slate-700">فایل پشتیبان (.json) را بکشید و اینجا رها کنید</span>
                        <span className="text-[10px] text-slate-400 font-bold block mt-1">یا برای انتخاب فایل کلیک کنید</span>
                      </div>

                      {importStatus === 'error' && (
                        <div className="p-3 bg-rose-50 border border-rose-150 rounded-xl text-[10px] font-bold text-rose-600">
                          {importErrorMessage}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Preview of Backup File Content
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                          محتوای یافت‌شده: {importFileContent.courses.length} دوره و {importFileContent.lessons.length} درس
                        </span>
                        <button
                          onClick={() => {
                            setImportFileContent(null);
                            setImportStatus('idle');
                          }}
                          className="text-[10px] text-rose-500 font-black hover:underline"
                        >
                          انصراف و انتخاب مجدد فایل
                        </button>
                      </div>

                      <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-3">
                        <p className="text-[10px] text-slate-600 font-black leading-relaxed">
                          🔍 دوره‌هایی را که مایلید به حساب خود منتقل کنید تیک بزنید. این پلتفرم مالکیت آن‌ها را به نام شما ثبت می‌کند و سیستم کدهای فرانت‌اند و تکالیف اختصاصی برای آن ایجاد می‌نماید:
                        </p>

                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {importFileContent.courses.map(course => {
                            const matchingLessonsCount = importFileContent.lessons.filter(l => l.courseId === course.id).length;
                            const isChecked = selectedImportCourseIds.includes(course.id);
                            return (
                              <label
                                key={course.id}
                                className={`flex items-center justify-between gap-3 p-3 border rounded-xl cursor-pointer hover:border-slate-300 hover:bg-slate-50/50 transition ${
                                  isChecked ? 'border-indigo-200 bg-indigo-50/20' : 'border-slate-200 bg-white'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setSelectedImportCourseIds(prev =>
                                        prev.includes(course.id)
                                          ? prev.filter(id => id !== course.id)
                                          : [...prev, course.id]
                                      );
                                    }}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                  />
                                  <div className="min-w-0">
                                    <span className="text-xs font-black text-slate-850 block truncate">{course.title}</span>
                                    <span className="text-[9px] text-slate-400 font-bold block mt-0.5">سطح: {
                                      course.level === 'beginner' ? 'مبتدی' : course.level === 'intermediate' ? 'متوسط' : 'پیشرفته'
                                    }</span>
                                  </div>
                                </div>
                                <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-xl shrink-0">
                                  {matchingLessonsCount} درس
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-850">
                          <CheckCircle2 size={12} />
                          <span>تضمین سلامت و عدم تداخل مالکیت:</span>
                        </div>
                        <p className="text-[9px] text-slate-600 font-bold leading-relaxed">
                          سیستم با تولید شناسه‌های تصادفی و منحصر‌به‌فرد جدید، اطمینان حاصل می‌کند که اطلاعات قبلی شما هرگز تغییر نمی‌کند و شما مالکیت تام این دروس جدید را خواهید داشت تا به راحتی به دانش‌آموزان خود ارائه دهید.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={handleExecuteImport}
                    disabled={!importFileContent || selectedImportCourseIds.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-2xl shadow-md shadow-emerald-600/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={16} />
                    <span>تأیید و واردسازی ({selectedImportCourseIds.length} دوره انتخابی)</span>
                  </button>
                  <p className="text-[9px] text-slate-400 font-bold text-center mt-2 leading-relaxed">
                    پس از تایید، بلافاصله می‌توانید از منوی مدیریت دوره‌ها و درس‌ها، کپی اختصاصی خود را ویرایش و تدریس نمایید.
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* ======================================================== */}
      {/* EDITING MANUALLY DEFINED LESSON MODAL */}
      {/* ======================================================== */}
      {isEditingLesson && editingLesson && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-indigo-600" />
                <h3 className="text-sm font-black text-slate-950">طراحی و مهندسی محتوای درس</h3>
              </div>
              <button onClick={() => setIsEditingLesson(false)} className="p-1 hover:bg-slate-200 rounded-full transition text-slate-400">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
              
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500">عنوان کامل درس‌نامه</label>
                  <input
                    type="text"
                    value={editingLesson.title}
                    onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none"
                  />
                </div>
                <div className="space-y-1 md:col-span-1">
                  <label className="text-[10px] font-bold text-slate-500">دوره مرتبط</label>
                  <select
                    value={editingLesson.courseId || ''}
                    onChange={(e) => {
                      const selectedCourseId = e.target.value;
                      const selectedCourse = courses.find(c => c.id === selectedCourseId);
                      setEditingLesson({
                        ...editingLesson,
                        courseId: selectedCourseId,
                        category: selectedCourse?.category || editingLesson.category,
                        level: selectedCourse?.level || editingLesson.level
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-indigo-700 font-bold focus:outline-none border-indigo-200"
                  >
                    {teacherCourses.filter(c => c.level === editingLesson.level).map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                    {teacherCourses.filter(c => c.level === editingLesson.level).length === 0 && (
                      <option value="">دوره مرتبط یافت نشد!</option>
                    )}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-1">
                  <label className="text-[10px] font-bold text-slate-500">دسته‌بندی موضوعی</label>
                  <input
                    type="text"
                    value={editingLesson.category}
                    onChange={(e) => setEditingLesson({ ...editingLesson, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none"
                  />
                </div>
                <div className="space-y-1 md:col-span-1">
                  <label className="text-[10px] font-bold text-slate-500">سطح درسی</label>
                  <select
                    value={editingLesson.level}
                    onChange={(e) => {
                      const newLevel = e.target.value as 'beginner' | 'intermediate' | 'advanced';
                      const matchingCourses = teacherCourses.filter(c => c.level === newLevel);
                      const firstMatchingCourse = matchingCourses[0];
                      setEditingLesson({
                        ...editingLesson,
                        level: newLevel,
                        courseId: firstMatchingCourse?.id || '',
                        category: firstMatchingCourse?.category || editingLesson.category
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold focus:outline-none"
                  >
                    <option value="beginner">مبتدی (Beginner)</option>
                    <option value="intermediate">متوسطه (Intermediate)</option>
                    <option value="advanced">پیشرفته (Advanced)</option>
                  </select>
                </div>
              </div>

              {/* TAB SWITCHER */}
              <div className="flex border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setLessonModalTab('content')}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-black transition-all border-b-2 -mb-[1px] ${
                    lessonModalTab === 'content'
                      ? 'border-indigo-600 text-indigo-600 font-extrabold bg-indigo-50/20'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <BookOpen size={14} />
                  <span>۱. متن درس‌نامه</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLessonModalTab('images')}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-black transition-all border-b-2 -mb-[1px] ${
                    lessonModalTab === 'images'
                      ? 'border-indigo-600 text-indigo-600 font-extrabold bg-indigo-50/20'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ImageIcon size={14} />
                  <span>۲. تصاویر گام‌به‌گام آموزشی ({editingLesson.lessonImages?.length || 0} از ۱۰)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLessonModalTab('challenges')}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-black transition-all border-b-2 -mb-[1px] ${
                    lessonModalTab === 'challenges'
                      ? 'border-indigo-600 text-indigo-600 font-extrabold bg-indigo-50/20'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <CheckSquare size={14} />
                  <span>۳. طراح چالش‌ها و تکالیف ({editingLesson.questions?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLessonModalTab('audioVideo')}
                  className={`flex items-center gap-2 px-5 py-3 text-xs font-black transition-all border-b-2 -mb-[1px] ${
                    lessonModalTab === 'audioVideo'
                      ? 'border-indigo-600 text-indigo-600 font-extrabold bg-indigo-50/20'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Volume2 size={14} />
                  <span>۴. رسانه‌ها و فایل‌های مکمل</span>
                  {(editingLesson.audioExplanationUrl || editingLesson.youtubeUrl || editingLesson.audioExplanations?.length || editingLesson.youtubeVideos?.length || editingLesson.pdfResources?.length) ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  ) : null}
                </button>
              </div>

              {/* TAB CONTENTS */}
              {lessonModalTab === 'content' && (
                <div className="space-y-4">
                  {/* Mode Selector Toolbar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-indigo-600 animate-pulse" />
                      <div>
                        <h4 className="text-xs font-black text-slate-800">طراح هوشمند و درون‌متنی درس‌نامه (سبک Harvard CS50)</h4>
                        <p className="text-[9px] text-slate-500 font-bold mt-0.5">تصاویر را مستقیماً بین پاراگراف‌های درس قرار دهید تا دانشجو در حین خواندن آن‌ها را ببیند.</p>
                      </div>
                    </div>

                    <div className="flex bg-slate-200/60 p-1 rounded-xl gap-1">
                      <button
                        type="button"
                        onClick={() => setDesignerMode('text')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                          designerMode === 'text'
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📝 ویرایشگر متنی خام
                      </button>
                      <button
                        type="button"
                        onClick={() => setDesignerMode('designer')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                          designerMode === 'designer'
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ✨ طراح تعاملی پیوسته (CS50)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDesignerMode('teacher')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                          designerMode === 'teacher'
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        👨‍🏫 متن تدریس استاد
                      </button>
                    </div>
                  </div>

                  {/* Mode 1: Raw Text Editor */}
                  {designerMode === 'text' && (
                    <div className="space-y-2">
                      {/* Quick helpers row */}
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        <button
                          type="button"
                          onClick={() => insertMarkdownSnippet('# عنوان جدید\n')}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition"
                        >
                          H1 (تیتر اصلی)
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdownSnippet('## عنوان فرعی\n')}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition"
                        >
                          H2 (تیتر فرعی)
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdownSnippet('```html\n// کد شما اینجا\n```\n')}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition"
                        >
                          بلاک کد (Code Block)
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdownSnippet('**متن برجسته**')}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition"
                        >
                          Bold
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const id = 'img_' + Math.random().toString(36).substr(2, 9);
                            insertMarkdownSnippet(`\n\n[image:${id}]\n\n`);
                          }}
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-lg transition flex items-center gap-1 border border-indigo-150"
                        >
                          <ImageIcon size={10} />
                          <span>درج نشانگر تصویر</span>
                        </button>
                      </div>

                      <textarea
                        ref={lessonTextareaRef}
                        value={editingLesson.content}
                        onChange={(e) => setEditingLesson({ ...editingLesson, content: e.target.value })}
                        placeholder="متن آموزش خود را اینجا بنویسید یا کپی کنید..."
                        dir="rtl"
                        className="w-full h-[470px] bg-slate-50/50 text-slate-800 font-sans text-sm md:text-base p-6 rounded-2xl focus:outline-none leading-relaxed border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 shadow-inner transition-all placeholder:text-slate-400 selection:bg-indigo-500 selection:text-white"
                      />
                    </div>
                  )}

                  {/* Mode 2: Interactive CS50 Continuous Designer */}
                  {designerMode === 'designer' && (
                    <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50/30 max-h-[500px] overflow-y-auto space-y-4 shadow-inner" dir="rtl">
                      {(() => {
                        const blocks = (editingLesson.content || '').split('\n\n');
                        
                        // Helper to render gaps
                        const renderGap = (gIndex: number) => {
                          return (
                            <div key={`gap-${gIndex}`} className="relative my-2 py-2 group flex items-center justify-center">
                              <div className="absolute inset-x-0 h-px bg-dashed border-t border-dashed border-indigo-200/50 group-hover:border-indigo-400 transition-colors"></div>
                              <button
                                type="button"
                                onClick={() => {
                                  setInlineInsertIndex(gIndex);
                                  setIsInlineImageModalOpen(true);
                                  setInlineImageUrl('');
                                  setInlineImageTitle('');
                                  setInlineImageDesc('');
                                }}
                                className="relative z-10 flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-indigo-600 text-indigo-600 hover:text-white border border-indigo-200 hover:border-indigo-600 rounded-full text-[10px] font-black transition-all shadow-md scale-90 group-hover:scale-100"
                              >
                                <Plus size={11} className="text-indigo-600 group-hover:text-white" />
                                <span>درج تصویر بین این دو بخش (سبک CS50)</span>
                              </button>
                            </div>
                          );
                        };

                        if (blocks.length === 0 || (blocks.length === 1 && blocks[0].trim() === '')) {
                          return (
                            <div className="text-center py-12 space-y-3">
                              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                                <FileText size={24} />
                              </div>
                              <h5 className="text-xs font-black text-slate-700">هنوز متنی وارد نشده است</h5>
                              <p className="text-[10px] text-slate-400 font-bold max-w-xs mx-auto">ابتدا در بخش "ویرایشگر متنی خام" متن درس‌نامه خود را تایپ یا کپی کنید، سپس برای گنجاندن تصاویر از این بخش استفاده کنید.</p>
                              <button
                                type="button"
                                onClick={() => setDesignerMode('text')}
                                className="text-[10px] font-black text-indigo-600 hover:underline"
                              >
                                بازگشت به ویرایشگر متنی 📝
                              </button>
                            </div>
                          );
                        }

                        const elements: React.ReactNode[] = [];

                        // Add initial gap at the very top
                        elements.push(renderGap(0));

                        blocks.forEach((block, idx) => {
                          const trimmed = block.trim();
                          if (!trimmed) return;

                          let node: React.ReactNode = null;

                          if (trimmed.startsWith('# ')) {
                            node = (
                              <div key={`block-${idx}`} className="p-3 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
                                <span className="text-[8px] text-indigo-600 font-extrabold block mb-1">تیتر اصلی سطح اول</span>
                                <h1 className="text-sm font-black text-slate-950 border-r-4 border-indigo-600 pr-2">{trimmed.replace('# ', '')}</h1>
                              </div>
                            );
                          } else if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
                            node = (
                              <div key={`block-${idx}`} className="p-3 bg-slate-100/50 rounded-2xl border border-slate-200/50">
                                <span className="text-[8px] text-slate-500 font-extrabold block mb-1">تیتر فرعی درس‌نامه</span>
                                <h3 className="text-xs font-extrabold text-slate-950">{trimmed.replace(/###? /g, '')}</h3>
                              </div>
                            );
                          } else if (trimmed.startsWith('```')) {
                            const lines = trimmed.split('\n');
                            const code = lines.slice(1, lines[lines.length - 1].startsWith('```') ? -1 : undefined).join('\n');
                            node = (
                              <div key={`block-${idx}`} className="p-4 bg-slate-950 text-slate-100 rounded-2xl font-mono text-xs overflow-x-auto relative" dir="ltr">
                                <span className="absolute top-2 left-2 text-[8px] uppercase tracking-widest text-slate-500">کد برنامه (قالب فنی)</span>
                                <pre className="whitespace-pre leading-relaxed">{code}</pre>
                              </div>
                            );
                          } else if (trimmed.startsWith('[image:') && trimmed.endsWith(']')) {
                            const imgId = trimmed.replace('[image:', '').replace(']', '');
                            const img = editingLesson.lessonImages?.find(i => i.id === imgId || i.title === imgId);
                            if (img) {
                              node = (
                                <div key={`block-${idx}`} className="relative group bg-white border border-slate-200 rounded-3xl p-3 shadow-sm transition">
                                  <div className="relative rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center p-2 min-h-[140px]">
                                    <img src={img.url} alt={img.title} className="max-h-[220px] object-contain w-auto rounded-xl" />
                                    
                                    {/* Hover overlay to delete */}
                                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updatedBlocks = blocks.filter((_, i) => i !== idx);
                                          setEditingLesson({ ...editingLesson, content: updatedBlocks.join('\n\n') });
                                        }}
                                        className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-black px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md"
                                      >
                                        <Trash2 size={13} />
                                        <span>حذف تصویر از این موقعیت</span>
                                      </button>
                                    </div>
                                  </div>
                                  {img.title && (
                                    <div className="px-3 pt-2 text-center">
                                      <h5 className="text-xs font-black text-slate-800">{img.title}</h5>
                                      {img.description && (
                                        <p className="text-[9px] text-slate-400 font-extrabold mt-0.5">{img.description}</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            } else {
                              node = (
                                <div key={`block-${idx}`} className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-[10px] font-bold flex items-center justify-between">
                                  <span>⚠️ خطا: فایل تصویری با شناسه {imgId} یافت نشد یا در بخش تصاویر بارگذاری نشده است.</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedBlocks = blocks.filter((_, i) => i !== idx);
                                      setEditingLesson({ ...editingLesson, content: updatedBlocks.join('\n\n') });
                                    }}
                                    className="text-[9px] font-black underline hover:text-rose-900"
                                  >
                                    پاک کردن این بلاک
                                  </button>
                                </div>
                              );
                            }
                          } else {
                            node = (
                              <div key={`block-${idx}`} className="p-4 bg-white border border-slate-150 rounded-2xl group/block relative shadow-sm">
                                <p className="text-slate-700 text-xs md:text-sm leading-relaxed">{trimmed}</p>
                                <div className="absolute top-2 left-2 opacity-0 group-hover/block:opacity-100 transition-opacity flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newVal = prompt("ویرایش سریع بند متنی:", trimmed);
                                      if (newVal !== null && newVal.trim() !== "") {
                                        const updatedBlocks = [...blocks];
                                        updatedBlocks[idx] = newVal;
                                        setEditingLesson({ ...editingLesson, content: updatedBlocks.join('\n\n') });
                                      }
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg text-[9px] font-black transition flex items-center gap-1 border border-slate-200"
                                  >
                                    <Edit size={10} />
                                    <span>ویرایش</span>
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          elements.push(node);
                          elements.push(renderGap(idx + 1));
                        });

                        return elements;
                      })()}
                    </div>
                  )}

                  {/* Mode 3: Teacher's Explanation/Teaching Text Editor */}
                  {designerMode === 'teacher' && editingLesson && (
                    <div className="space-y-3">
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3" dir="rtl">
                        <div className="p-1.5 bg-amber-100 rounded-lg text-amber-800">
                          <FileText size={16} />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-amber-950">متن تشریح و تدریس استاد</h4>
                          <p className="text-[10px] text-amber-700 font-bold mt-0.5">در این بخش می‌توانید متن تشریحی، تدریس یا توضیحات استاد برای این درس را بنویسید. این متن در بخش دانشجو با کلیک روی یک دکمه اختصاصی به جای متن اصلی نمایش داده خواهد شد تا درک بهتری از درس پیدا کند.</p>
                        </div>
                      </div>

                      <textarea
                        value={editingLesson.teacherText || ''}
                        onChange={(e) => setEditingLesson({ ...editingLesson, teacherText: e.target.value })}
                        placeholder="توضیحات و تشریحات استاد برای این درس را اینجا بنویسید..."
                        dir="rtl"
                        className="w-full h-[400px] bg-slate-50/50 text-slate-800 font-sans text-sm p-5 rounded-2xl focus:outline-none leading-relaxed border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 shadow-inner transition-all placeholder:text-slate-400"
                      />
                    </div>
                  )}
                </div>
              )}

              {lessonModalTab === 'images' && (
                <div className="space-y-6">
                  {/* Image input panel */}
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-800">افزودن تصویر آموزشی جدید (حداکثر ۱۰ تصویر)</h4>
                      <p className="text-[9px] text-slate-500 font-semibold mt-0.5">تصاویر را بر اساس مراحل طراحی یا آموزش خود اضافه کنید تا دانشجو بتواند به صورت گام‌به‌گام در کلاس ورق بزند.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Left: Inputs */}
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">عنوان/عنوان گام (مثال: گام ۱: طراحی فیلد ورود)</label>
                          <input
                            type="text"
                            value={stepImageTitle}
                            onChange={(e) => setStepImageTitle(e.target.value)}
                            placeholder="نام گام یا عنوان تصویر..."
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none font-bold"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">توضیحات کوتاه این تصویر آموزشی</label>
                          <input
                            type="text"
                            value={stepImageDesc}
                            onChange={(e) => setStepImageDesc(e.target.value)}
                            placeholder="مثلاً: در این بخش فیلدهای ورودی نام کاربری و رمزعبور را با متد فندقی اضافه کردیم..."
                            className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500">نحوه نمایش</label>
                            <select
                              value={imagePlacement}
                              onChange={(e) => setImagePlacement(e.target.value as any)}
                              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold focus:outline-none"
                            >
                              <option value="inline">درون‌متنی (زیر درس‌نامه)</option>
                              <option value="gallery">آلبوم گالری مجزا</option>
                            </select>
                          </div>
                          
                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!imageUrlInput.trim()) {
                                  alert('لطفا ابتدا یک تصویر آپلود کنید یا آدرس URL آن را وارد کنید.');
                                  return;
                                }
                                const currentImages = editingLesson.lessonImages || [];
                                if (currentImages.length >= 10) {
                                  alert('حداکثر ظرفیت تصاویر کلاسی (۱۰ عدد) پر شده است.');
                                  return;
                                }
                                const compressedUrl = await compressImageBase64(imageUrlInput.trim());
                                const imageId = 'img_' + Math.random().toString(36).substr(2, 9);
                                setEditingLesson({
                                  ...editingLesson,
                                  lessonImages: [
                                    ...currentImages,
                                    {
                                      id: imageId,
                                      url: compressedUrl,
                                      placement: imagePlacement,
                                      title: stepImageTitle.trim() || `گام ${currentImages.length + 1}`,
                                      description: stepImageDesc.trim() || 'بدون توضیحات اضافی.'
                                    }
                                  ]
                                });
                                // Clear local states
                                setImageUrlInput('');
                                setStepImageTitle('');
                                setStepImageDesc('');
                              }}
                              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition shadow-sm"
                            >
                              ✓ ثبت و افزودن به درس
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Right: File select zone */}
                      <div className="border-2 border-dashed border-slate-200 bg-white rounded-3xl p-4 flex flex-col justify-center items-center text-center space-y-3 min-h-[220px]">
                        {isWebcamActive ? (
                          <div className="w-full flex flex-col items-center space-y-2">
                            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                              <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute top-2 right-2 px-2 py-0.5 bg-rose-600 text-white text-[8px] font-bold rounded-full animate-pulse">
                                پخش زنده دوربین
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={capturePhoto}
                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg transition"
                              >
                                📸 ثبت و ذخیره تصویر
                              </button>
                              <button
                                type="button"
                                onClick={stopWebcam}
                                className="px-4 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-xs font-black rounded-lg transition"
                              >
                                لغو و بستن
                              </button>
                            </div>
                          </div>
                        ) : imageUrlInput ? (
                          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-100 bg-slate-50">
                            <img src={imageUrlInput} className="w-full h-full object-contain" alt="پیش‌نمایش" />
                            <button
                              type="button"
                              onClick={() => setImageUrlInput('')}
                              className="absolute top-2 left-2 bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-md hover:bg-rose-700"
                            >
                              ✕ حذف عکس انتخابی
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3 w-full">
                            <div className="mx-auto w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
                              <ImageIcon size={20} />
                            </div>
                            <div>
                              <p className="text-[11px] font-black text-slate-700">تصویر یا گروه تصاویر خود را انتخاب و ثبت کنید</p>
                              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">پشتیبانی از چندین فایل همزمان png, jpg تا سقف ۵ مگابایت</p>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-center pt-1">
                              <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg cursor-pointer transition flex items-center gap-1">
                                📂 انتخاب از کامپیوتر
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={handleLocalImageUpload}
                                />
                              </label>

                              <button
                                type="button"
                                onClick={startWebcam}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg transition flex items-center gap-1"
                              >
                                📷 عکاسی با دوربین
                              </button>

                              <span className="text-slate-300 self-center text-[9px] font-bold">یا</span>
                              <input
                                type="url"
                                placeholder="لینک تصویر (URL)..."
                                value={imageUrlInput}
                                onChange={(e) => setImageUrlInput(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] focus:outline-none w-32 font-semibold text-center"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* List of current images */}
                  <div className="space-y-3">
                    <h5 className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                      <span>📸</span>
                      <span>آلبوم و گام‌های فعلی تعریف شده برای این درس:</span>
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {(editingLesson.lessonImages || []).map((img, i) => (
                        <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between group hover:border-slate-300 transition-all">
                          <div className="relative aspect-video bg-slate-50">
                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                            <span className="absolute top-2 right-2 bg-black/70 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                              گام {i + 1}
                            </span>
                            <span className="absolute bottom-2 right-2 bg-indigo-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
                              {img.placement === 'inline' ? '📖 درون‌متنی' : '🖼️ گالری مرجع'}
                            </span>
                          </div>
                          
                          <div className="p-3 space-y-1 bg-white flex-1 flex flex-col justify-between">
                            <div>
                              <h6 className="text-[10px] font-black text-slate-800 leading-tight">{img.title}</h6>
                              <p className="text-[9px] text-slate-400 font-semibold leading-relaxed mt-0.5 line-clamp-2">{img.description}</p>
                            </div>
                            
                            <div className="pt-2 border-t border-slate-100 mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLesson({
                                    ...editingLesson,
                                    lessonImages: (editingLesson.lessonImages || []).filter((_, idx) => idx !== i)
                                  });
                                }}
                                className="text-[9px] font-black text-rose-600 hover:text-rose-800 flex items-center gap-0.5"
                              >
                                <Trash2 size={10} />
                                <span>حذف تصویر</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      {(!editingLesson.lessonImages || editingLesson.lessonImages.length === 0) && (
                        <div className="sm:col-span-2 lg:col-span-4 p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400 font-semibold">هیچ تصویر آموزشی یا اسلایدی برای این درس‌نامه بارگذاری نشده است.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {lessonModalTab === 'challenges' && (
                <div className="bg-orange-50/40 border border-orange-200/40 rounded-3xl p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-orange-100 pb-3">
                    <div>
                      <h4 className="text-xs font-black text-orange-950">تعریف چالش‌ها و روش‌های پاسخگویی هنرجویان</h4>
                      <p className="text-[9px] text-orange-900/80 font-semibold">چالش، سوال یا مأموریت تعریف کرده و شرایط پاسخ را تعیین کنید.</p>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* AI Challenge Generator Control Panel */}
                      <div className="flex items-center gap-1.5 bg-indigo-50/80 border border-indigo-100/50 px-2 py-1 rounded-xl">
                        <span className="text-[9px] font-bold text-indigo-700">طراحی هوشمند:</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={aiChallengeCount}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                            setAiChallengeCount(val);
                          }}
                          className="w-10 text-center bg-white border border-indigo-200 text-[10px] font-black py-0.5 rounded-lg focus:outline-none text-indigo-900"
                        />
                        <span className="text-[9px] text-slate-500 font-bold">چالش</span>
                        <button
                          type="button"
                          onClick={handleGenerateChallengesWithAi}
                          disabled={isGeneratingAiChallenges}
                          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-[9px] font-black transition shadow-sm"
                        >
                          <Sparkles size={10} className={isGeneratingAiChallenges ? "animate-spin" : ""} />
                          <span>{isGeneratingAiChallenges ? 'در حال طراحی...' : 'طراحی با هوش مصنوعی'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const newQ: Question = {
                            id: 'q_added_' + Date.now(),
                            title: 'چالش جدید',
                            description: 'دستورالعمل حل چالش جدید...',
                            answerType: 'text',
                            points: 20
                          };
                          setEditingLesson({
                            ...editingLesson,
                            questions: [...editingLesson.questions, newQ]
                          });
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-[10px] font-black transition shadow"
                      >
                        <Plus size={12} />
                        <span>افزودن چالش</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {editingLesson.questions.map((q, idx) => (
                      <div key={q.id} className="bg-white border border-orange-200/40 p-4 rounded-2xl relative space-y-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLesson({
                              ...editingLesson,
                              questions: editingLesson.questions.filter(item => item.id !== q.id)
                            });
                          }}
                          className="absolute left-2 top-2 p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-50 transition"
                        >
                          <Trash2 size={14} />
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">عنوان چالش شماره {idx + 1}</label>
                            <input
                              type="text"
                              value={q.title}
                              onChange={(e) => {
                                setEditingLesson({
                                  ...editingLesson,
                                  questions: editingLesson.questions.map(item => item.id === q.id ? { ...item, title: e.target.value } : item)
                                });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-bold focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">شرایط پاسخگویی (فرمت جواب)</label>
                            <select
                              value={q.answerType}
                              onChange={(e) => {
                                setEditingLesson({
                                  ...editingLesson,
                                  questions: editingLesson.questions.map(item => item.id === q.id ? { ...item, answerType: e.target.value as AnswerType } : item)
                                });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-semibold focus:outline-none"
                            >
                              <option value="text">پاسخ تشریحی (متنی)</option>
                              <option value="code_editor">ادیتور کد پیشرفته (React / CSS)</option>
                              <option value="handwritten_photo">طرح دستی روی بوم (دست‌نویس شبیه‌ساز)</option>
                              <option value="notebook_photo">📷 عکاسی از دفترچه با دوربین (تصویر واقعی)</option>
                              <option value="audio_recording">توضیح صوتی (ضبط صدا)</option>
                              <option value="mission_url">ارسال لینک پروژه آنلاین (مثل Vercel)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">بارم نمره کلاسی</label>
                            <input
                              type="number"
                              value={q.points}
                              onChange={(e) => {
                                setEditingLesson({
                                  ...editingLesson,
                                  questions: editingLesson.questions.map(item => item.id === q.id ? { ...item, points: Number(e.target.value) } : item)
                                });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-mono focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">شرح چالش و کارهای خانگی موردنیاز:</label>
                          <input
                            type="text"
                            value={q.description}
                            onChange={(e) => {
                              setEditingLesson({
                                ...editingLesson,
                                questions: editingLesson.questions.map(item => item.id === q.id ? { ...item, description: e.target.value } : item)
                              });
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none"
                          />
                        </div>

                        {q.answerType === 'code_editor' && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-indigo-600">کدهای اولیه پروژه (Starter Code)</label>
                            <textarea
                              value={q.starterCode || ''}
                              onChange={(e) => {
                                setEditingLesson({
                                  ...editingLesson,
                                  questions: editingLesson.questions.map(item => item.id === q.id ? { ...item, starterCode: e.target.value } : item)
                                });
                              }}
                              className="w-full h-24 bg-slate-900 text-slate-100 font-mono text-[10px] p-2.5 rounded-xl focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lessonModalTab === 'audioVideo' && (
                <div className="space-y-6">
                  {/* Section 1: Audio Explanations */}
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-800">🎙️ فایل‌های صوتی توضیح درس‌نامه</h4>
                      <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                        معلم گرامی، شما می‌توانید چندین فایل صوتی با عنوان‌های متمایز آپلود کنید تا هر بخش از درس‌نامه به صورت مجزا صوتی توضیح داده شود.
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200/60 rounded-2xl p-4 space-y-3 shadow-sm">
                      <span className="text-[10px] font-extrabold text-slate-600 block">آپلود صوت جدید</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 block mb-1">عنوان صوت (مانند: توضیح بخش اول)</label>
                          <input
                            type="text"
                            placeholder="عنوان فایل صوتی را بنویسید..."
                            value={newAudioTitle}
                            onChange={(e) => setNewAudioTitle(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 block mb-1">انتخاب و آپلود فایل صوتی</label>
                          <input
                            type="file"
                            accept="audio/*"
                            id="teacher-audio-uploader"
                            className="hidden"
                            onChange={(e) => {
                              if (!editingLesson) return;
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  const base64 = reader.result as string;
                                  const title = newAudioTitle.trim() || `توضیح صوتی ${(editingLesson.audioExplanations?.length || 0) + 1}`;
                                  setEditingLesson({
                                    ...editingLesson,
                                    audioExplanations: [
                                      ...(editingLesson.audioExplanations || []),
                                      { id: Math.random().toString(36).substr(2, 9), title, url: base64 }
                                    ]
                                  });
                                  setNewAudioTitle('');
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          <label
                            htmlFor="teacher-audio-uploader"
                            className="flex items-center justify-center gap-2 w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-200 rounded-xl py-2 px-3 text-xs font-black cursor-pointer transition"
                          >
                            <Plus size={14} />
                            <span>انتخاب فایل و آپلود</span>
                          </label>
                        </div>
                      </div>
                      <p className="text-[8px] text-slate-400 font-semibold mt-1">حداکثر حجم فایل صوتی: ۱۰ مگابایت</p>
                    </div>

                    {/* List of uploaded audios */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-extrabold text-slate-700 block">فایل‌های صوتی آپلود شده ({editingLesson.audioExplanations?.length || 0})</span>
                      {(!editingLesson.audioExplanations || editingLesson.audioExplanations.length === 0) ? (
                        <div className="p-4 text-center bg-white rounded-2xl border border-slate-150 text-[10px] text-slate-400 font-bold">
                          هیچ فایل صوتی برای این درس آپلود نشده است.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {editingLesson.audioExplanations.map((audio, index) => (
                            <div key={audio.id} className="bg-white border border-slate-150 rounded-2xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
                              <div className="flex items-center gap-2.5">
                                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-[9px] font-black">{index + 1}</span>
                                <span className="text-[11px] font-black text-slate-800">{audio.title}</span>
                              </div>
                              <div className="flex items-center gap-2 w-full md:w-auto justify-between">
                                <audio src={audio.url} controls className="h-7 w-full md:w-56" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLesson({
                                      ...editingLesson,
                                      audioExplanations: editingLesson.audioExplanations?.filter(a => a.id !== audio.id)
                                    });
                                  }}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition"
                                  title="حذف فایل صوتی"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 2: YouTube Videos */}
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-800">📺 ویدیوهای مکمل درس (یوتیوب)</h4>
                      <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                        آدرس ویدیوهای یوتیوب مرتبط با آموزش بخش‌های مختلف این درس را به همراه عنوان متمایز وارد کنید.
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200/60 rounded-2xl p-4 space-y-3 shadow-sm">
                      <span className="text-[10px] font-extrabold text-slate-600 block">افزودن لینک ویدیوی جدید</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 block mb-1">عنوان ویدیو (مانند: حل تمرین بخش اول)</label>
                          <input
                            type="text"
                            placeholder="عنوان ویدیو را بنویسید..."
                            value={newVideoTitle}
                            onChange={(e) => setNewVideoTitle(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold"
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[9px] font-bold text-slate-500 block mb-1">آدرس ویدیوی یوتیوب</label>
                            <input
                              type="url"
                              placeholder="https://www.youtube.com/watch?v=..."
                              value={newVideoUrl}
                              onChange={(e) => setNewVideoUrl(e.target.value)}
                              dir="ltr"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-850 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editingLesson || !newVideoUrl.trim()) return;
                              const title = newVideoTitle.trim() || `ویدیوی یوتیوب ${(editingLesson.youtubeVideos?.length || 0) + 1}`;
                              setEditingLesson({
                                ...editingLesson,
                                youtubeVideos: [
                                  ...(editingLesson.youtubeVideos || []),
                                  { id: Math.random().toString(36).substr(2, 9), title, url: newVideoUrl.trim() }
                                ]
                              });
                              setNewVideoTitle('');
                              setNewVideoUrl('');
                            }}
                            className="bg-slate-900 hover:bg-black text-white px-4 rounded-xl text-xs font-black transition self-end h-[34px] flex items-center justify-center gap-1"
                          >
                            <Plus size={13} />
                            <span>افزودن</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* List of YouTube videos */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-extrabold text-slate-700 block">ویدیوهای یوتیوب اضافه شده ({editingLesson.youtubeVideos?.length || 0})</span>
                      {(!editingLesson.youtubeVideos || editingLesson.youtubeVideos.length === 0) ? (
                        <div className="p-4 text-center bg-white rounded-2xl border border-slate-150 text-[10px] text-slate-400 font-bold">
                          هیچ ویدیویی برای این درس ثبت نشده است.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {editingLesson.youtubeVideos.map((video, index) => (
                            <div key={video.id} className="bg-white border border-slate-150 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center text-[9px] font-black">{index + 1}</span>
                                <div className="space-y-0.5">
                                  <span className="text-[11px] font-black text-slate-800 block">{video.title}</span>
                                  <a href={video.url} target="_blank" rel="noreferrer" className="text-[9px] text-indigo-600 hover:underline font-mono block dir-ltr text-right">
                                    {video.url}
                                  </a>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLesson({
                                    ...editingLesson,
                                    youtubeVideos: editingLesson.youtubeVideos?.filter(v => v.id !== video.id)
                                  });
                                }}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition"
                                title="حذف ویدیو"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 3: PDF Resources */}
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-800">📄 لینک‌های دانلود فایل‌های PDF مکمل</h4>
                      <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                        معلم گرامی، شما می‌توانید لینک‌های مستقیم دانلود فایل‌های PDF (مانند کتابچه‌های تمرین، خلاصه درس‌نامه‌ها یا نمونه سوالات) را ثبت کنید تا دانشجویان بتوانند با کلیک روی آن‌ها، فایل‌ها را مستقیماً دانلود و مطالعه کنند.
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200/60 rounded-2xl p-4 space-y-3 shadow-sm">
                      <span className="text-[10px] font-extrabold text-slate-600 block">ثبت لینک PDF جدید</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 block mb-1">عنوان فایل PDF (مانند: خلاصه جزوه درس ۱)</label>
                          <input
                            type="text"
                            placeholder="عنوان فایل PDF را بنویسید..."
                            value={newPdfTitle}
                            onChange={(e) => setNewPdfTitle(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 block mb-1">لینک دانلود فایل PDF</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="https://example.com/file.pdf"
                              value={newPdfUrl}
                              onChange={(e) => setNewPdfUrl(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!editingLesson) return;
                                const url = newPdfUrl.trim();
                                if (!url) {
                                  alert('لطفاً لینک دانلود فایل PDF را وارد کنید.');
                                  return;
                                }
                                const title = newPdfTitle.trim() || `فایل PDF ${(editingLesson.pdfResources?.length || 0) + 1}`;
                                setEditingLesson({
                                  ...editingLesson,
                                  pdfResources: [
                                    ...(editingLesson.pdfResources || []),
                                    { id: Math.random().toString(36).substr(2, 9), title, url }
                                  ]
                                });
                                setNewPdfTitle('');
                                setNewPdfUrl('');
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0"
                            >
                              <Plus size={14} />
                              <span>ثبت لینک</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* List of uploaded PDFs */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-extrabold text-slate-700 block">لینک‌های PDF ثبت شده ({editingLesson.pdfResources?.length || 0})</span>
                      {(!editingLesson.pdfResources || editingLesson.pdfResources.length === 0) ? (
                        <div className="p-4 text-center bg-white rounded-2xl border border-slate-150 text-[10px] text-slate-400 font-bold">
                          هیچ لینک PDF برای این درس ثبت نشده است.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {editingLesson.pdfResources.map((pdf, index) => (
                            <div key={pdf.id} className="bg-white border border-slate-150 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-[9px] font-black shrink-0">{index + 1}</span>
                                <div className="space-y-0.5 min-w-0 flex-1">
                                  <span className="text-[11px] font-black text-slate-800 block truncate">{pdf.title}</span>
                                  <span className="text-[8px] text-slate-400 font-mono block truncate">{pdf.url}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLesson({
                                    ...editingLesson,
                                    pdfResources: editingLesson.pdfResources?.filter(p => p.id !== pdf.id)
                                  });
                                }}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition shrink-0"
                                title="حذف لینک PDF"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer buttons */}
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
              <button
                onClick={() => setIsEditingLesson(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                انصراف
              </button>
              <button
                onClick={saveLesson}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                ذخیره نهایی تغییرات درس
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Inline Image Insertion Modal (Harvard CS50 style) */}
      {isInlineImageModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-lg overflow-hidden shadow-2xl flex flex-col" dir="rtl">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-indigo-600">
                <ImageIcon size={18} />
                <h3 className="text-sm font-black text-slate-950">درج تصویر درون‌متنی (Harvard Style)</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopInlineWebcam();
                  setIsInlineImageModalOpen(false);
                }}
                className="p-1 hover:bg-slate-200 rounded-full transition text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              {/* Option 1: Upload / Webcam */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block mb-1">گزینه ۱: افزودن عکس جدید با فشرده‌سازی HD</span>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">عنوان تصویر / نام گام آموزشی</label>
                  <input
                    type="text"
                    value={inlineImageTitle}
                    onChange={(e) => setInlineImageTitle(e.target.value)}
                    placeholder="مانند: شکل ۱.۱ معماری کلی برنامه..."
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">کپشن / زیرنویس تصویر (اختیاری)</label>
                  <input
                    type="text"
                    value={inlineImageDesc}
                    onChange={(e) => setInlineImageDesc(e.target.value)}
                    placeholder="مانند: در این بخش داده‌ها ابتدا وارد فیلتر اصلی می‌شوند..."
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none"
                  />
                </div>

                {/* Webcam or upload choice */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex flex-col items-center justify-center min-h-[140px] text-center space-y-2">
                  {isInlineWebcamActive ? (
                    <div className="w-full flex flex-col items-center space-y-2">
                      <video ref={inlineVideoRef} autoPlay playsInline className="w-full aspect-video rounded-xl bg-slate-950" />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={captureInlinePhoto}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg transition"
                        >
                          📸 ثبت عکس
                        </button>
                        <button
                          type="button"
                          onClick={stopInlineWebcam}
                          className="px-3 py-1.5 bg-slate-500 hover:bg-slate-600 text-white text-[10px] font-black rounded-lg transition"
                        >
                          لغو
                        </button>
                      </div>
                    </div>
                  ) : inlineImageUrl ? (
                    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-50">
                      <img src={inlineImageUrl} className="w-full h-full object-contain" alt="آپلود شده" />
                      <button
                        type="button"
                        onClick={() => setInlineImageUrl('')}
                        className="absolute top-2 left-2 bg-rose-600 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow"
                      >
                        حذف
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 w-full">
                      <p className="text-[10px] font-bold text-slate-600">تصویر خود را انتخاب یا از وب‌کم بگیرید</p>
                      <div className="flex justify-center gap-2 pt-1">
                        <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg cursor-pointer transition">
                          📂 بارگذاری فایل تصویر
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const r = new FileReader();
                                r.onload = (ev) => {
                                  if (ev.target?.result) {
                                    setInlineImageUrl(ev.target.result as string);
                                  }
                                };
                                r.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={startInlineWebcam}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-lg border border-indigo-150 transition"
                        >
                          📷 گرفتن تصویر با وب‌کم
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!inlineImageUrl) {
                      alert('لطفا ابتدا عکسی انتخاب کنید یا با دوربین بگیرید.');
                      return;
                    }
                    if (inlineInsertIndex === null) return;
                    
                    // Compress image
                    const compressed = await compressImageBase64(inlineImageUrl);
                    const imageId = 'img_' + Math.random().toString(36).substr(2, 9);
                    
                    // Register image in lessonImages
                    const updatedImages = [...(editingLesson.lessonImages || [])];
                    updatedImages.push({
                      id: imageId,
                      url: compressed,
                      placement: 'inline',
                      title: inlineImageTitle.trim() || `شکل درون‌متنی جدید`,
                      description: inlineImageDesc.trim() || ''
                    });

                    // Insert image placeholder tag in content
                    const blocks = (editingLesson.content || '').split('\n\n');
                    blocks.splice(inlineInsertIndex, 0, `[image:${imageId}]`);
                    
                    setEditingLesson({
                      ...editingLesson,
                      lessonImages: updatedImages,
                      content: blocks.join('\n\n')
                    });

                    stopInlineWebcam();
                    setIsInlineImageModalOpen(false);
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black rounded-xl transition shadow"
                >
                  ✓ ذخیره، فشرده‌سازی خودکار و درج تصویر
                </button>
              </div>

              {/* Option 2: Select existing */}
              {editingLesson.lessonImages && editingLesson.lessonImages.length > 0 && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block mb-1">گزینه ۲: قرار دادن یکی از تصاویر موجود در این درس</span>
                  <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pt-1">
                    {editingLesson.lessonImages.map((img, iIndex) => {
                      const imageId = img.id || `img_legacy_${iIndex}`;
                      const isUsed = editingLesson.content?.includes(`[image:${imageId}]`);
                      return (
                        <div
                          key={iIndex}
                          onClick={() => {
                            if (inlineInsertIndex === null) return;
                            
                            // Let's ensure image has id if it was uploaded without it
                            let updatedImages = [...(editingLesson.lessonImages || [])];
                            if (!img.id) {
                              updatedImages[iIndex] = { ...img, id: imageId };
                            }

                            const blocks = (editingLesson.content || '').split('\n\n');
                            blocks.splice(inlineInsertIndex, 0, `[image:${imageId}]`);

                            setEditingLesson({
                              ...editingLesson,
                              lessonImages: updatedImages,
                              content: blocks.join('\n\n')
                            });

                            stopInlineWebcam();
                            setIsInlineImageModalOpen(false);
                          }}
                          className={`group/item border rounded-xl p-1.5 cursor-pointer transition flex flex-col space-y-1.5 items-center relative ${
                            isUsed ? 'bg-indigo-50/55 border-indigo-200 opacity-70' : 'bg-white border-slate-200 hover:border-indigo-500'
                          }`}
                        >
                          <img src={img.url} className="w-full aspect-video object-contain bg-slate-50 rounded-lg" alt={img.title} />
                          <span className="text-[9px] font-bold text-slate-700 truncate max-w-full text-center">{img.title}</span>
                          {isUsed && (
                            <span className="absolute top-1 left-1 bg-indigo-600 text-white text-[7px] font-bold px-1 py-0.2 rounded-full">
                              درج شده
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in" dir="rtl">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden transform scale-100 transition-all">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            <div className="p-6 space-y-4 text-right">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                <span className="text-xl">👨‍🏫</span>
                <h4 className="text-sm font-black text-slate-900">{confirmModal.title}</h4>
              </div>
              <div className="text-xs text-slate-600 font-semibold leading-relaxed whitespace-pre-wrap">
                {confirmModal.message}
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black transition border border-slate-200 cursor-pointer"
                >
                  انصراف و ویرایش
                </button>
                <button
                  onClick={() => {
                    setConfirmModal({ ...confirmModal, isOpen: false });
                    confirmModal.onConfirm();
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black transition shadow cursor-pointer"
                >
                  تایید و ارسال نهایی
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
