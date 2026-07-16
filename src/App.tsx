import { useState, useEffect } from 'react';
import { initialUsers, initialLessons, initialSubmissions, initialCourses, initialEnrollments } from './mockData';
import { Lesson, Submission, User as UserType, Course, CourseEnrollment, DirectMessage, Rating } from './types';
import AuthScreen from './components/AuthScreen';
import AdminPanel from './components/AdminPanel';
import TeacherPanel from './components/TeacherPanel';
import StudentPanel from './components/StudentPanel';
import PortalScreen from './components/PortalScreen';
import { dbGet, dbSet } from './utils/indexedDB';
import { 
  supabase,
  dbFetchUsers,
  dbFetchCourses,
  dbFetchLessons,
  dbFetchSubmissions,
  dbFetchEnrollments,
  dbFetchDirectMessages,
  dbAddCourse,
  dbUpdateCourse,
  dbDeleteCourse,
  dbAddLesson,
  dbUpdateLesson,
  dbDeleteLesson,
  dbAddSubmission,
  dbUpdateSubmission,
  dbEnrollStudent,
  dbApproveEnrollment,
  dbSendDirectMessage,
  dbDeleteUser,
  dbFetchRatings,
  dbAddRating
} from './lib/supabase';
import PWAUpdateToast from './components/PWAUpdateToast';

const pruneDirectMessages = (msgs: DirectMessage[]): DirectMessage[] => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  
  // Group by conversation
  const groups: { [key: string]: DirectMessage[] } = {};
  msgs.forEach(m => {
    const key = [m.senderId, m.receiverId].sort().join('_');
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });

  const pruned: DirectMessage[] = [];
  Object.values(groups).forEach(group => {
    // Sort ascending by time
    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    // Group messages: keep last 15
    let conversations = group;
    if (conversations.length > 15) {
      conversations = conversations.slice(-15);
    }

    // Filter by time but keep at least the last 3 messages
    const kept: DirectMessage[] = [];
    const totalCount = conversations.length;
    conversations.forEach((msg, idx) => {
      const isRecent = new Date(msg.createdAt).getTime() > oneDayAgo;
      const isForceKeep = (totalCount - idx) <= 3; // Keep last 3 regardless of age
      if (isRecent || isForceKeep) {
        kept.push(msg);
      }
    });

    pruned.push(...kept);
  });

  return pruned;
};

export default function App() {
  // --- Dynamic Database States ---
  const [users, setUsers] = useState<UserType[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserType | null>(() => {
    const saved = localStorage.getItem('ai_current_session');
    return saved ? JSON.parse(saved) : null; // Default to PortalScreen/AuthScreen
  });

  const [kickedOutInfo, setKickedOutInfo] = useState<{
    screen: 'email_pending' | 'approval_pending' | 'teacher_pending';
    email: string;
    role: 'admin' | 'teacher' | 'student';
  } | null>(null);

  // Load role-specific data from Supabase with database-side filtering
  useEffect(() => {
    const loadRoleData = async () => {
      if (!currentUser) {
        setIsLoadingDb(true);
        try {
          const [dbCourses, dbUsers, dbRatings] = await Promise.all([
            dbFetchCourses('admin', ''), // Fetch all courses for catalog
            dbFetchUsers('admin', ''),   // Fetch approved teachers for catalog
            dbFetchRatings()
          ]);
          if (dbCourses) setCourses(dbCourses);
          if (dbUsers) setUsers(dbUsers);
          if (dbRatings) setRatings(dbRatings);
        } catch (err) {
          console.warn('Failed to load public landing data from Supabase', err);
        }
        setLessons([]);
        setSubmissions([]);
        setEnrollments([]);
        setDirectMessages([]);
        setIsLoadingDb(false);
        setIsDbLoaded(true);
        return;
      }

      setIsLoadingDb(true);
      try {
        const [dbUsers, dbCourses, dbLessons, dbSubmissions, dbEnrollments, dbMsgs, dbRatings] = await Promise.all([
          dbFetchUsers(currentUser.role, currentUser.id),
          dbFetchCourses(currentUser.role, currentUser.id),
          dbFetchLessons(currentUser.role, currentUser.id),
          dbFetchSubmissions(currentUser.role, currentUser.id),
          dbFetchEnrollments(currentUser.role, currentUser.id),
          dbFetchDirectMessages(currentUser.id),
          dbFetchRatings()
        ]);

        if (dbUsers) setUsers(dbUsers);
        if (dbCourses) setCourses(dbCourses);
        
        let finalLessons = dbLessons || [];
        if (currentUser.role === 'teacher' && dbLessons && dbCourses) {
          const pcsCourse = dbCourses.find(c => c.id === 'c_1784107439780' || c.title.toLowerCase().includes('pcs') || c.title.includes('علوم کامپیوتر'));
          const hgCourse = dbCourses.find(c => c.id === 'c_1784019915629' || c.title.toLowerCase().includes('hgytyt'));
          
          if (pcsCourse && hgCourse) {
            const lessonsToMove = dbLessons.filter(l => l.courseId === hgCourse.id && (
              l.title.includes('تفکر محاسباتی') || l.title.includes('اطلاعات') || l.title.includes('درس ۱') || l.title.includes('درس ۲') || l.title.includes('درس 2')
            ));
            
            if (lessonsToMove.length > 0) {
              console.log('Auto-healing: Found lessons to move from hgytyt to PCS 101:', lessonsToMove);
              finalLessons = dbLessons.map(l => {
                if (l.courseId === hgCourse.id && (
                  l.title.includes('تفکر محاسباتی') || l.title.includes('اطلاعات') || l.title.includes('درس ۱') || l.title.includes('درس ۲') || l.title.includes('درس 2')
                )) {
                  const updated = { ...l, courseId: pcsCourse.id };
                  dbUpdateLesson(updated).catch(err => {
                    console.error('Auto-healing: Failed to update lesson course association in Supabase', err);
                  });
                  return updated;
                }
                return l;
              });
            }
          }
        }
        setLessons(finalLessons);

        if (dbSubmissions) setSubmissions(dbSubmissions);
        if (dbEnrollments) setEnrollments(dbEnrollments);
        if (dbMsgs) setDirectMessages(dbMsgs);
        if (dbRatings) setRatings(dbRatings);
      } catch (err) {
        console.warn('Could not complete database load, utilizing local fallbacks', err);
      } finally {
        setIsLoadingDb(false);
        setIsDbLoaded(true);
      }
    };

    loadRoleData();
  }, [currentUser]);

  // Sync current user session changes to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('ai_current_session', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('ai_current_session');
    }
  }, [currentUser]);

  // Background polling to keep database state synced every 10 seconds
  useEffect(() => {
    if (!currentUser) return;

    const pollInterval = setInterval(async () => {
      try {
        const [dbSubmissions, dbEnrollments, dbMsgs] = await Promise.all([
          dbFetchSubmissions(currentUser.role, currentUser.id),
          dbFetchEnrollments(currentUser.role, currentUser.id),
          dbFetchDirectMessages(currentUser.id)
        ]);
        
        if (dbSubmissions) {
          setSubmissions(dbSubmissions);
        }
        if (dbEnrollments) {
          setEnrollments(dbEnrollments);
        }
        if (dbMsgs) {
          setDirectMessages(dbMsgs);
        }
      } catch (err) {
        console.warn('Background sync polling failed', err);
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [currentUser]);

  const triggerKickOut = (role: 'admin' | 'teacher' | 'student', email: string) => {
    console.log(`User ${email} (${role}) has been deactivated/deleted. Kicking out...`);
    let targetScreen: 'approval_pending' | 'teacher_pending' = 'approval_pending';
    if (role === 'student') {
      targetScreen = 'teacher_pending';
    }
    setKickedOutInfo({
      screen: targetScreen,
      email: email,
      role: role
    });
    setCurrentUser(null);
  };

  const verifyCurrentUserStatus = async () => {
    if (!currentUser) return;
    try {
      if (currentUser.role === 'admin') {
        const { data, error } = await supabase
          .from('admins')
          .select('is_approved')
          .eq('id', currentUser.id)
          .maybeSingle();
        if (error) throw error;
        if (!data || data.is_approved === false) {
          triggerKickOut('admin', currentUser.email);
        }
      } else if (currentUser.role === 'teacher') {
        const { data, error } = await supabase
          .from('teachers')
          .select('is_approved')
          .eq('id', currentUser.id)
          .maybeSingle();
        if (error) throw error;
        if (!data || data.is_approved === false) {
          triggerKickOut('teacher', currentUser.email);
        }
      } else if (currentUser.role === 'student') {
        const { data, error } = await supabase
          .from('students')
          .select('status_by_teacher')
          .eq('id', currentUser.id)
          .maybeSingle();
        if (error) throw error;
        if (!data || data.status_by_teacher !== 'accepted') {
          triggerKickOut('student', currentUser.email);
        }
      }
    } catch (err) {
      console.warn('Background status verification failed:', err);
    }
  };

  // 1. Real-time changes listener for active user status
  useEffect(() => {
    if (!currentUser) return;

    const userTable = currentUser.role === 'admin' ? 'admins' : currentUser.role === 'teacher' ? 'teachers' : 'students';
    
    console.log(`Setting up real-time listener for current user: ${currentUser.id} in ${userTable}`);
    
    const channel = supabase
      .channel(`realtime-status-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: userTable,
          filter: `id=eq.${currentUser.id}`,
        },
        (payload) => {
          console.log('Real-time database change detected:', payload);
          if (payload.eventType === 'DELETE') {
            triggerKickOut(currentUser.role, currentUser.email);
          } else if (payload.eventType === 'UPDATE') {
            const newData = payload.new;
            if (currentUser.role === 'admin' && newData.is_approved === false) {
              triggerKickOut('admin', currentUser.email);
            } else if (currentUser.role === 'teacher' && newData.is_approved === false) {
              triggerKickOut('teacher', currentUser.email);
            } else if (currentUser.role === 'student' && newData.status_by_teacher !== 'accepted') {
              triggerKickOut('student', currentUser.email);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`Real-time subscription status:`, status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // 2. 10-minute background poll check (fallback if real-time fails or fails to connect)
  useEffect(() => {
    if (!currentUser) return;

    // Run verification immediately on mount/login
    verifyCurrentUserStatus();

    // Check every 10 minutes
    const intervalId = setInterval(() => {
      console.log('Quietly verifying current user status in background...');
      verifyCurrentUserStatus();
    }, 10 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [currentUser]);

  // --- Handlers ---

  // Register user
  const handleRegister = (newUser: UserType) => {
    setUsers((prev) => [...prev, newUser]);
  };

  // Login user
  const handleLogin = (user: UserType) => {
    // Sync active state from users database
    const dbUser = users.find(u => u.id === user.id) || user;
    setCurrentUser(dbUser);
    setKickedOutInfo(null); // Reset kicked out info on fresh login
  };

  // Logout user
  const handleLogout = () => {
    setCurrentUser(null);
    setKickedOutInfo(null); // Clear state
  };

  // Admin approves/deactivates teacher
  const handleApproveTeacher = async (teacherId: string, approve: boolean = true) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === teacherId ? { ...u, active: approve } : u))
    );
    try {
      await supabase.from('teachers').update({ is_approved: approve }).eq('id', teacherId);
    } catch (err) {
      console.warn('Could not sync teacher approval to Supabase', err);
    }
  };

  // Admin/Teacher deletes user
  const handleDeleteUser = async (userId: string) => {
    if (confirm('آیا از حذف این کاربر اطمینان دارید؟ این عملیات غیرقابل بازگشت است.')) {
      const userToDelete = users.find(u => u.id === userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      if (userToDelete) {
        try {
          await dbDeleteUser(userId, userToDelete.role);
        } catch (err) {
          console.warn('Could not sync user deletion to Supabase', err);
        }
      }
    }
  };

  // --- Course Handlers ---
  const handleAddCourse = async (newCourse: Course) => {
    setCourses((prev) => [...prev, newCourse]);
    try {
      await dbAddCourse(newCourse);
    } catch (err: any) {
      console.error('Could not sync course addition to Supabase', err);
      alert(`خطا در ذخیره‌سازی دوره در پایگاه داده: ${err.message || err}`);
      setCourses((prev) => prev.filter((c) => c.id !== newCourse.id));
    }
  };

  const handleUpdateCourse = async (updatedCourse: Course) => {
    const originalCourses = [...courses];
    setCourses((prev) =>
      prev.map((c) => (c.id === updatedCourse.id ? updatedCourse : c))
    );
    try {
      await dbUpdateCourse(updatedCourse);
    } catch (err: any) {
      console.error('Could not sync course update to Supabase', err);
      alert(`خطا در به‌روزرسانی دوره در پایگاه داده: ${err.message || err}`);
      setCourses(originalCourses);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (confirm('آیا از حذف این دوره اطمینان دارید؟ تمامی درس‌ها و ثبت‌نام‌های مربوط به آن حذف خواهند شد.')) {
      const originalCourses = [...courses];
      const originalLessons = [...lessons];
      const originalEnrollments = [...enrollments];

      setCourses((prev) => prev.filter((c) => c.id !== courseId));
      setLessons((prev) => prev.filter((l) => l.courseId !== courseId));
      setEnrollments((prev) => prev.filter((e) => e.courseId !== courseId));
      try {
        await dbDeleteCourse(courseId);
      } catch (err: any) {
        console.error('Could not sync course deletion to Supabase', err);
        alert(`خطا در حذف دوره از پایگاه داده: ${err.message || err}`);
        setCourses(originalCourses);
        setLessons(originalLessons);
        setEnrollments(originalEnrollments);
      }
    }
  };

  // --- Lesson Handlers ---
  const handleAddLesson = async (newLesson: Lesson) => {
    setLessons((prev) => [...prev, newLesson]);
    try {
      await dbAddLesson(newLesson);
    } catch (err: any) {
      console.error('Could not sync lesson addition to Supabase', err);
      alert(`خطا در ذخیره‌سازی درس در پایگاه داده: ${err.message || err}`);
      setLessons((prev) => prev.filter((l) => l.id !== newLesson.id));
    }
  };

  const handleUpdateLesson = async (updatedLesson: Lesson) => {
    const originalLessons = [...lessons];
    setLessons((prev) =>
      prev.map((l) => (l.id === updatedLesson.id ? updatedLesson : l))
    );
    try {
      await dbUpdateLesson(updatedLesson);
    } catch (err: any) {
      console.error('Could not sync lesson update to Supabase', err);
      alert(`خطا در به‌روزرسانی درس در پایگاه داده: ${err.message || err}`);
      setLessons(originalLessons);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (confirm('آیا از حذف این درس مطمئن هستید؟')) {
      const originalLessons = [...lessons];
      setLessons((prev) => prev.filter((l) => l.id !== lessonId));
      try {
        await dbDeleteLesson(lessonId);
      } catch (err: any) {
        console.error('Could not sync lesson deletion to Supabase', err);
        alert(`خطا در حذف درس از پایگاه داده: ${err.message || err}`);
        setLessons(originalLessons);
      }
    }
  };

  // --- Enrollment Handlers ---
  const handleEnrollStudent = async (courseId: string, studentId: string, studentName: string) => {
    // Check if already enrolled
    const exists = enrollments.some(e => e.courseId === courseId && e.studentId === studentId);
    if (exists) return;

    const newEnrollment: CourseEnrollment = {
      id: 'e_' + Date.now(),
      courseId,
      studentId,
      studentName,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    setEnrollments((prev) => [...prev, newEnrollment]);
    try {
      await dbEnrollStudent(newEnrollment);
    } catch (err: any) {
      console.error('Could not sync enrollment to Supabase', err);
      alert(`خطا در ثبت‌نام دوره: ${err.message || err}`);
      setEnrollments((prev) => prev.filter((e) => e.id !== newEnrollment.id));
    }
  };

  const handleApproveEnrollment = async (enrollmentId: string, accept: boolean) => {
    const originalEnrollments = [...enrollments];
    const status = accept ? 'accepted' : 'rejected';
    setEnrollments((prev) =>
      prev.map((e) =>
        e.id === enrollmentId
          ? { ...e, status }
          : e
      )
    );
    try {
      await dbApproveEnrollment(enrollmentId, status);
    } catch (err: any) {
      console.error('Could not sync enrollment approval to Supabase', err);
      alert(`خطا در بررسی وضعیت ثبت‌نام: ${err.message || err}`);
      setEnrollments(originalEnrollments);
    }
  };

  // Teacher approves student (legacy support or general)
  const handleApproveStudent = async (studentId: string, accept: boolean) => {
    const originalUsers = [...users];
    setUsers((prev) =>
      prev.map((u) =>
        u.id === studentId
          ? { ...u, statusByTeacher: accept ? 'accepted' : 'rejected' }
          : u
      )
    );
    try {
      const { error } = await supabase.from('students').update({ status_by_teacher: accept ? 'accepted' : 'rejected' }).eq('id', studentId);
      if (error) throw error;
    } catch (err: any) {
      console.error('Could not sync student approval to Supabase', err);
      alert(`خطا در تایید هنرجو: ${err.message || err}`);
      setUsers(originalUsers);
    }
  };

  const handleUpdateStudentLevel = async (studentId: string, newLevel: 'beginner' | 'intermediate' | 'advanced') => {
    const originalUsers = [...users];
    setUsers((prev) =>
      prev.map((u) =>
        u.id === studentId
          ? { ...u, level: newLevel }
          : u
      )
    );
    try {
      const { error } = await supabase.from('students').update({ level: newLevel }).eq('id', studentId);
      if (error) throw error;
    } catch (err: any) {
      console.error('Could not sync student level update to Supabase', err);
      alert(`خطا در تغییر سطح آموزشی هنرجو: ${err.message || err}`);
      setUsers(originalUsers);
    }
  };

  // Teacher grades student submission
  const handleGradeSubmission = async (
    submissionId: string, 
    grade: number, 
    feedback: string, 
    aiReview?: string,
    gradedBy?: 'teacher' | 'assistant',
    isTryAgainRequested?: boolean
  ) => {
    const originalSubmissions = [...submissions];
    setSubmissions((prev) =>
      prev.map((s) => {
        if (s.id === submissionId) {
          const updated = { 
            ...s, 
            status: 'reviewed' as const, 
            grade, 
            feedback, 
            aiReview, 
            gradedBy, 
            isTryAgainRequested 
          };
          dbUpdateSubmission(updated).catch(err => {
            console.error('Could not sync graded submission to Supabase', err);
            alert(`خطا در ثبت نمره در سرور: ${err.message || err}`);
            setSubmissions(originalSubmissions);
          });
          return updated;
        }
        return s;
      })
    );
  };

  // Student submits homework
  const handleAddSubmission = async (newSub: Submission) => {
    const originalSubmissions = [...submissions];
    let updatedSub: Submission = newSub;
    setSubmissions((prev) => {
      const existingIdx = prev.findIndex(
        (s) => s.studentId === newSub.studentId && s.lessonId === newSub.lessonId
      );
      if (existingIdx !== -1) {
        // Overwrite/update existing submission
        updatedSub = {
          ...prev[existingIdx],
          id: newSub.id, // Keep the new ID to match subsequent update
          submittedAt: newSub.submittedAt,
          answers: newSub.answers,
          status: 'pending',
          attemptsCount: (prev[existingIdx].attemptsCount || 0) + 1,
          alertTeacher: newSub.alertTeacher || (prev[existingIdx].attemptsCount || 0) + 1 >= 3,
          // Reset teacher-grading fields since it's a resubmission
          grade: undefined,
          feedback: undefined,
          gradedBy: undefined,
          isTryAgainRequested: undefined,
          // Clear previous assistant details until new review is ready
          assistantGrade: undefined,
          assistantFeedback: undefined,
          assistantTryAgain: undefined,
          aiReview: undefined,
          studentAiFeedback: undefined,
        };
        const updated = [...prev];
        updated[existingIdx] = updatedSub;
        return updated;
      } else {
        // No existing submission, insert new
        return [newSub, ...prev];
      }
    });
    try {
      await dbAddSubmission(updatedSub);
    } catch (err: any) {
      console.error('Could not sync submission to Supabase', err);
      alert(`خطا در ثبت و ارسال تکالیف به سرور: ${err.message || err}`);
      setSubmissions(originalSubmissions);
    }
  };

  const handleSendDirectMessage = async (newMsg: DirectMessage) => {
    setDirectMessages((prev) => {
      const updated = [...prev, newMsg];
      const pruned = pruneDirectMessages(updated);
      localStorage.setItem('ai_direct_messages_db', JSON.stringify(pruned));
      return pruned;
    });
    try {
      await dbSendDirectMessage(newMsg);
    } catch (err) {
      console.warn('Could not sync direct message to Supabase', err);
    }
  };

  const handleAddRating = async (rating: Rating) => {
    setRatings((prev) => [rating, ...prev]);
    try {
      await dbAddRating(rating);
    } catch (err) {
      console.warn('Could not sync rating to Supabase', err);
    }
  };

  // Update current session properties if the DB user properties change
  useEffect(() => {
    if (currentUser) {
      const dbUser = users.find((u) => u.id === currentUser.id);
      if (dbUser && JSON.stringify(dbUser) !== JSON.stringify(currentUser)) {
        setCurrentUser(dbUser);
      }
    }
  }, [users, currentUser]);

  // --- Router View Selection ---

  if (!currentUser) {
    return (
      <>
        <PortalScreen
          courses={courses}
          users={users}
          ratings={ratings}
          onRegister={handleRegister}
          onLogin={handleLogin}
          initialStatusScreen={kickedOutInfo?.screen || undefined}
          initialStatusEmail={kickedOutInfo?.email || undefined}
          initialStatusRole={kickedOutInfo?.role || undefined}
        />
        <PWAUpdateToast />
      </>
    );
  }

  if (isLoadingDb) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-700" dir="rtl">
          <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 font-sans text-sm font-medium animate-pulse">در حال دریافت و فیلتر اطلاعات از پایگاه داده...</p>
        </div>
        <PWAUpdateToast />
      </>
    );
  }

  if (currentUser.role === 'admin') {
    return (
      <>
        <AdminPanel
          users={users}
          onApproveTeacher={handleApproveTeacher}
          onDeleteUser={handleDeleteUser}
          onLogout={handleLogout}
        />
        <PWAUpdateToast />
      </>
    );
  }

  if (currentUser.role === 'teacher') {
    return (
      <>
        <TeacherPanel
          currentUser={currentUser}
          users={users}
          courses={courses}
          lessons={lessons}
          submissions={submissions}
          enrollments={enrollments}
          directMessages={directMessages}
          onSendDirectMessage={handleSendDirectMessage}
          onAddCourse={handleAddCourse}
          onUpdateCourse={handleUpdateCourse}
          onDeleteCourse={handleDeleteCourse}
          onAddLesson={handleAddLesson}
          onUpdateLesson={handleUpdateLesson}
          onDeleteLesson={handleDeleteLesson}
          onApproveEnrollment={handleApproveEnrollment}
          onApproveStudent={handleApproveStudent}
          onUpdateStudentLevel={handleUpdateStudentLevel}
          onGradeSubmission={handleGradeSubmission}
          onLogout={handleLogout}
        />
        <PWAUpdateToast />
      </>
    );
  }

  if (currentUser.role === 'student') {
    return (
      <>
        <StudentPanel
          currentUser={currentUser}
          users={users}
          courses={courses}
          lessons={lessons}
          submissions={submissions}
          enrollments={enrollments}
          directMessages={directMessages}
          ratings={ratings}
          onSendDirectMessage={handleSendDirectMessage}
          onEnrollStudent={handleEnrollStudent}
          onAddSubmission={handleAddSubmission}
          onAddRating={handleAddRating}
          onLogout={handleLogout}
        />
        <PWAUpdateToast />
      </>
    );
  }

  return (
    <>
      <div className="p-8 text-center" dir="rtl">
        خطایی در بارگذاری بخش‌های سیستمی رخ داده است. مجدداً وارد شوید.
        <button onClick={handleLogout} className="mt-4 px-4 py-2 bg-slate-900 text-white rounded">
          خروج
        </button>
      </div>
      <PWAUpdateToast />
    </>
  );
}
