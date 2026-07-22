export type Role = 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  phone?: string;      // Phone/contact number
  province?: string;   // Province of Afghanistan (34 provinces)
  code?: number;       // Unique code for teachers (starts from 1000)
  // Phase 1 properties
  active?: boolean; // For teachers, needs admin approval.
  selectedTeacherId?: string; // For students, links to teacher
  statusByTeacher?: 'pending' | 'accepted' | 'rejected'; // For students, teacher approval status
  level?: 'beginner' | 'intermediate' | 'advanced'; // For students
  currentLessonIndex?: number; // Progression index for student
}

export interface Course {
  id: string;
  title: string;
  description: string;
  category: string; // e.g. English, Computer Science, Math
  level: 'beginner' | 'intermediate' | 'advanced';
  teacherId: string;
  createdAt: string;
}

export interface CourseEnrollment {
  id: string;
  courseId: string;
  studentId: string;
  studentName: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export type AnswerType = 'text' | 'handwritten_photo' | 'audio_recording' | 'code_editor' | 'mission_url' | 'notebook_photo';

export interface Question {
  id: string;
  title: string;
  description: string;
  answerType: AnswerType;
  starterCode?: string; // If code_editor is used
  points: number;
}

export interface LessonImage {
  id?: string;
  url: string;
  placement: 'inline' | 'gallery'; // Inline means shown inside textbook text, gallery means separate gallery
  title?: string;
  description?: string;
}

export interface Lesson {
  id: string;
  courseId?: string; // Optional for compatibility, but used in Phase 2
  title: string;
  content: string; // Markdown text
  images: string[]; // Keep for backwards compatibility
  lessonImages?: LessonImage[]; // Rich lesson images with placement (inline/gallery)
  questions: Question[];
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced'; // Level of the lesson
  teacherId?: string; // The teacher who owns/created this lesson
  createdAt: string;
  order: number;
  audioExplanationUrl?: string; // Teacher recorded explanation audio (base64 or URL)
  youtubeUrl?: string; // Video tutorial/lesson link
  audioExplanations?: { id: string; title: string; url: string }[];
  youtubeVideos?: { id: string; title: string; url: string }[];
  pdfResources?: { id: string; title: string; url: string }[];
  teacherText?: string; // Teacher's explanation/elaborative text for the lesson
}

export interface Submission {
  id: string;
  lessonId: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  answers: {
    questionId: string;
    answerType: AnswerType;
    value: string; // Could be code, base64 for image/audio, or plain text / URL
    fileName?: string; // Optional name of uploaded item
  }[];
  status: 'pending' | 'reviewed';
  grade?: number; // Total score given by teacher
  maxPoints: number;
  feedback?: string; // Teacher feedback
  aiReview?: string; // Cached server-side AI evaluation
  attemptsCount?: number; // Number of attempts the student made
  alertTeacher?: boolean; // AI flag if student is struggling (e.g. failed multiple times)
  gradedBy?: 'teacher' | 'assistant'; // Who graded the submission
  isTryAgainRequested?: boolean; // If teacher requested the student to try again
  assistantGrade?: number; // Automatic suggested grade by AI Assistant
  assistantFeedback?: string; // Automatic feedback message by AI Assistant
  assistantTryAgain?: boolean; // If AI Assistant recommends trying again
  studentAiFeedback?: string; // Student-facing self-guided AI feedback containing clues
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'student' | 'teacher';
  receiverId: string;
  content: string;
  attachmentType?: 'image' | 'audio' | 'document' | 'voice';
  attachmentUrl?: string; // base64 string
  fileName?: string;
  createdAt: string;
  isDeleted?: boolean;
}

export interface Rating {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  teacherId: string;
  rating: number; // 1 to 5 stars
  comment?: string;
  createdAt: string;
}


