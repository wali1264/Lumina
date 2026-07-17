import { createClient } from '@supabase/supabase-js';
import { User as UserType, Role, Course, Lesson, Submission, CourseEnrollment, DirectMessage } from '../types';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || 'https://kfqtaztuscpzoftzcxoo.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcXRhenR1c2Nwem9mdHpjeG9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MzM4NjksImV4cCI6MjA5OTQwOTg2OX0.u2N4TCVv3D2vnl-PAqTrz6jeSxPpU7gtkqiqhjeiMmM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Returns the code for a teacher. If the database record does not contain one,
 * generates a deterministic, stable 4-digit code (1000-1999) based on the teacher ID UUID.
 */
export function getTeacherCode(id: string, code?: number | null): number {
  if (code !== undefined && code !== null) return code;
  if (id) {
    const hash = id.split('-').join('').substring(0, 8);
    const parsed = parseInt(hash, 16);
    return 1000 + (parsed % 1000);
  }
  return 1000;
}

// Custom error classes for handling approval and verification states
export class AuthPendingEmailVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthPendingEmailVerificationError';
  }
}

export class AuthPendingAdminApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthPendingAdminApprovalError';
  }
}

export class AuthPendingTeacherApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthPendingTeacherApprovalError';
  }
}

/**
 * Register a platform admin.
 * Admins are saved in the 'admins' table and must be approved manually (is_approved = true) in the database.
 */
export async function registerAdmin(name: string, email: string, phone: string, province: string, password: string): Promise<any> {
  // 1. Sign up user using Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        role: 'admin',
        phone,
        province,
      }
    }
  });

  if (error) throw error;
  if (!data.user) throw new Error('ثبت نام با خطا مواجه شد.');

  // 2. Insert into 'admins' table
  try {
    const { error: dbError } = await supabase
      .from('admins')
      .insert({
        id: data.user.id,
        email: email.toLowerCase().trim(),
        name,
        phone,
        province,
        is_approved: false, // Must be manually approved in DB by Super Admin
        created_at: new Date().toISOString()
      });
    
    if (dbError) {
      console.warn('DB Insert error for admins table, using localStorage fallback', dbError);
    }
  } catch (err) {
    console.error('Database connection failed', err);
  }

  return data.user;
}

/**
 * Register a teacher.
 * Teachers are saved in the 'teachers' table and must be approved by an Admin via the application dashboard.
 */
export async function registerTeacher(name: string, email: string, phone: string, province: string, password: string): Promise<any> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        role: 'teacher',
        phone,
        province,
      }
    }
  });

  if (error) throw error;
  if (!data.user) throw new Error('ثبت نام مدرس با خطا مواجه شد.');

  try {
    // 1. Fetch current maximum code from teachers table
    let nextCode = 1000;
    try {
      const { data: allTeachers } = await supabase.from('teachers').select('code');
      if (allTeachers && allTeachers.length > 0) {
        const codes = allTeachers.map(t => t.code).filter(c => typeof c === 'number');
        if (codes.length > 0) {
          nextCode = Math.max(...codes) + 1;
        }
      }
    } catch (e) {
      console.warn('Could not query teachers code column, using fallback sequence generation', e);
    }

    // Try inserting with 'code' column
    const { data: inserted, error: dbError } = await supabase
      .from('teachers')
      .insert({
        id: data.user.id,
        email: email.toLowerCase().trim(),
        name,
        phone,
        province,
        code: nextCode,
        is_approved: false, // Approved by Admins via UI
        created_at: new Date().toISOString()
      })
      .select('code')
      .single();

    if (dbError) {
      console.warn('DB Insert with code failed, retrying without code column', dbError);
      // Fallback in case table doesn't have code column yet
      const { error: fallbackError } = await supabase
        .from('teachers')
        .insert({
          id: data.user.id,
          email: email.toLowerCase().trim(),
          name,
          phone,
          province,
          is_approved: false, // Approved by Admins via UI
          created_at: new Date().toISOString()
        });
      if (fallbackError) {
        console.error('Teacher registration fallback insertion failed', fallbackError);
      }
    } else if (inserted) {
      return { ...data.user, code: inserted.code || nextCode };
    }
    
    return { ...data.user, code: nextCode };
  } catch (err) {
    console.error('Error during registerTeacher flow:', err);
  }

  return data.user;
}

/**
 * Register a student.
 * Students are saved in the 'students' table and must be approved by their selected teacher via the application dashboard.
 */
export async function registerStudent(
  name: string, 
  email: string, 
  phone: string, 
  province: string, 
  level: 'beginner' | 'intermediate' | 'advanced', 
  selectedTeacherId: string, 
  password: string
): Promise<any> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        role: 'student',
        phone,
        province,
        level,
        selectedTeacherId
      }
    }
  });

  if (error) throw error;
  if (!data.user) throw new Error('ثبت نام هنرجو با خطا مواجه شد.');

  try {
    const { error: dbError } = await supabase
      .from('students')
      .insert({
        id: data.user.id,
        email: email.toLowerCase().trim(),
        name,
        phone,
        province,
        level,
        selected_teacher_id: selectedTeacherId,
        status_by_teacher: 'pending', // Approved by Teacher via UI
        created_at: new Date().toISOString()
      });

    if (dbError) {
      console.warn('DB Insert error for students table', dbError);
    }
  } catch (err) {
    console.error(err);
  }

  return data.user;
}

function isValidUUID(val: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
}

/**
 * Login function that handles the 3-tier approval logic and email verification checks.
 */
export async function loginUser(email: string, password: string): Promise<UserType> {
  // 1. Authenticate with Supabase Auth
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  if (!data.user) throw new Error('ورود ناموفق بود.');

  const authUser = data.user;

  // 2. Check if email is confirmed (Disabled by developer & user request - email confirmation disabled in Supabase dashboard)
  // if (!authUser.email_confirmed_at) {
  //   throw new AuthPendingEmailVerificationError('لطفا ابتدا ایمیل خود را تایید کنید. یک لینک تایید به ایمیل شما ارسال شده است.');
  // }

  // 3. Determine role and check specific approval status
  const role = authUser.user_metadata.role || 'student';
  const name = authUser.user_metadata.name || authUser.email;
  const phone = authUser.user_metadata.phone || '';
  const province = authUser.user_metadata.province || '';

  if (role === 'admin') {
    // Check approval in 'admins' table, perform lazy write if record is missing
    let adminRecord: any = null;
    try {
      const { data: existing, error: dbError } = await supabase
        .from('admins')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (dbError) {
        console.warn('Failed to query admin profile, might use fallback:', dbError);
      } else {
        adminRecord = existing;
      }

      // Lazy profile creation if not already in DB
      if (!adminRecord && !dbError) {
        const { data: inserted, error: insertError } = await supabase
          .from('admins')
          .insert({
            id: authUser.id,
            email: authUser.email!.toLowerCase().trim(),
            name,
            phone,
            province,
            is_approved: false, // Must be approved by super admin
            created_at: new Date().toISOString()
          })
          .select()
          .maybeSingle();

        if (insertError) {
          console.warn('Lazy admin profile insertion failed:', insertError);
        } else {
          adminRecord = inserted;
        }
      }

      if (adminRecord && !adminRecord.is_approved) {
        throw new AuthPendingAdminApprovalError('حساب شما هنوز توسط سوپر ادمین تایید نشده و در حال بررسی است. لطفا شکیبا باشید.');
      } else if (!adminRecord) {
        // Fallback: If DB table doesn't exist yet, we check local storage
        const savedUsers = localStorage.getItem('ai_users_db');
        if (savedUsers) {
          const localUsers: UserType[] = JSON.parse(savedUsers);
          const found = localUsers.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
          if (found && !found.active) {
            throw new AuthPendingAdminApprovalError('حساب شما هنوز توسط سوپر ادمین تایید نشده و در حال بررسی است. لطفا شکیبا باشید.');
          }
        }
      }
    } catch (err) {
      if (err instanceof AuthPendingAdminApprovalError) throw err;
      console.error(err);
    }

    return {
      id: authUser.id,
      name,
      email: authUser.email!,
      role: 'admin',
      active: true,
      phone,
      province,
    };
  } else if (role === 'teacher') {
    // Check approval in 'teachers' table, perform lazy write if record is missing
    let teacherRecord: any = null;
    let teacherCode: number | undefined;

    try {
      const { data: existing, error: dbError } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (dbError) {
        console.warn('Failed to query teacher profile, might use fallback:', dbError);
      } else {
        teacherRecord = existing;
      }

      // Lazy profile creation if not already in DB
      if (!teacherRecord && !dbError) {
        // Try to generate sequential code
        let nextCode = 1000;
        try {
          const { data: allTeachers } = await supabase.from('teachers').select('code');
          if (allTeachers && allTeachers.length > 0) {
            const codes = allTeachers.map(t => t.code).filter(c => typeof c === 'number');
            if (codes.length > 0) {
              nextCode = Math.max(...codes) + 1;
            }
          }
        } catch (e) {
          console.warn('Could not query teachers code column:', e);
        }

        const { data: inserted, error: insertError } = await supabase
          .from('teachers')
          .insert({
            id: authUser.id,
            email: authUser.email!.toLowerCase().trim(),
            name,
            phone,
            province,
            code: nextCode,
            is_approved: false, // Needs manual admin approval
            created_at: new Date().toISOString()
          })
          .select()
          .maybeSingle();

        if (insertError) {
          console.warn('Lazy teacher profile insertion failed:', insertError);
        } else {
          teacherRecord = inserted;
        }
      }

      if (teacherRecord) {
        if (!teacherRecord.is_approved) {
          throw new AuthPendingAdminApprovalError('حساب کاربری شما به عنوان مدرس هنوز توسط ادمین تایید نشده است. لطفا منتظر بررسی مدیریت بمانید.');
        }
        teacherCode = getTeacherCode(teacherRecord.id, teacherRecord.code);
      } else {
        // Fallback checks
        const savedUsers = localStorage.getItem('ai_users_db');
        if (savedUsers) {
          const localUsers: UserType[] = JSON.parse(savedUsers);
          const found = localUsers.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
          if (found && !found.active) {
            throw new AuthPendingAdminApprovalError('حساب کاربری شما به عنوان مدرس هنوز توسط ادمین تایید نشده است. لطفا منتظر بررسی مدیریت بمانید.');
          }
        }
      }
    } catch (err) {
      if (err instanceof AuthPendingAdminApprovalError) throw err;
      console.error(err);
    }

    return {
      id: authUser.id,
      name,
      email: authUser.email!,
      role: 'teacher',
      active: true,
      phone,
      province,
      code: teacherCode || getTeacherCode(authUser.id),
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200',
    };
  } else {
    // Student, check approval in 'students' table, perform lazy write if record is missing
    const level = authUser.user_metadata.level || 'beginner';
    const selectedTeacherId = authUser.user_metadata.selectedTeacherId || '';
    let studentRecord: any = null;

    try {
      const { data: existing, error: dbError } = await supabase
        .from('students')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (dbError) {
        console.warn('Failed to query student profile, might use fallback:', dbError);
      } else {
        studentRecord = existing;
      }

      // Lazy profile creation if not already in DB
      if (!studentRecord && !dbError) {
        const { data: inserted, error: insertError } = await supabase
          .from('students')
          .insert({
            id: authUser.id,
            email: authUser.email!.toLowerCase().trim(),
            name,
            phone,
            province,
            level,
            selected_teacher_id: (selectedTeacherId && isValidUUID(selectedTeacherId)) ? selectedTeacherId : null,
            status_by_teacher: 'pending', // Pending teacher acceptance
            created_at: new Date().toISOString()
          })
          .select()
          .maybeSingle();

        if (insertError) {
          console.warn('Lazy student profile insertion failed:', insertError);
        } else {
          studentRecord = inserted;
        }
      }

      if (studentRecord) {
        if (studentRecord.status_by_teacher === 'pending') {
          throw new AuthPendingTeacherApprovalError('حساب شما با موفقیت ثبت شده و منتظر تایید مربی انتخابی شما می‌باشد.');
        } else if (studentRecord.status_by_teacher === 'rejected') {
          throw new Error('درخواست عضویت شما توسط مربی مربوطه رد شده است.');
        }
      } else {
        // Fallback checks
        const savedUsers = localStorage.getItem('ai_users_db');
        if (savedUsers) {
          const localUsers: UserType[] = JSON.parse(savedUsers);
          const found = localUsers.find(u => u.email.toLowerCase().trim() === email.toLowerCase().trim());
          if (found && found.statusByTeacher === 'pending') {
            throw new AuthPendingTeacherApprovalError('حساب شما با موفقیت ثبت شده و منتظر تایید مربی انتخابی شما می‌باشد.');
          } else if (found && found.statusByTeacher === 'rejected') {
            throw new Error('درخواست عضویت شما توسط مربی مربوطه رد شده است.');
          }
        }
      }
    } catch (err) {
      if (err instanceof AuthPendingTeacherApprovalError) throw err;
      throw err;
    }

    return {
      id: authUser.id,
      name,
      email: authUser.email!,
      role: 'student',
      active: true,
      phone,
      province,
      level,
      selectedTeacherId,
      statusByTeacher: 'accepted',
      currentLessonIndex: 0,
      avatarUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&q=80&w=200',
    };
  }
}

/**
 * Generates SQL schemas and trigger functions for Supabase SQL Editor.
 * This can be shown/offered to the user in their next steps.
 */
export const SUPABASE_SQL_SCHEMAS = `
-- Create Sequence for Teacher Codes
CREATE SEQUENCE IF NOT EXISTS teacher_code_seq START WITH 1000;

-- 1. Create Admins Table
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    province TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, now()) NOT NULL
);

-- Enable RLS for Admins
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins profiles are readable by authenticated users" ON public.admins FOR SELECT USING (true);
CREATE POLICY "Admins can update their own profile" ON public.admins FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can insert their own profile" ON public.admins FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Create Teachers Table
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    province TEXT,
    code INTEGER UNIQUE DEFAULT nextval('teacher_code_seq'),
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, now()) NOT NULL
);

-- Enable RLS for Teachers
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers profiles are readable by everyone" ON public.teachers FOR SELECT USING (true);
CREATE POLICY "Teachers can update their own profile" ON public.teachers FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Teachers can insert their own profile" ON public.teachers FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. Create Students Table
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    province TEXT,
    level TEXT NOT NULL DEFAULT 'beginner',
    selected_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
    status_by_teacher TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, now()) NOT NULL
);

-- Enable RLS for Students
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students profiles are readable by everyone" ON public.students FOR SELECT USING (true);
CREATE POLICY "Students can update their own profile" ON public.students FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Students can insert their own profile" ON public.students FOR INSERT WITH CHECK (auth.uid() = id);

-- 4. Create Courses Table
CREATE TABLE IF NOT EXISTS public.courses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    level TEXT,
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, now()) NOT NULL
);

-- Enable RLS for Courses
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Courses are readable by everyone" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Teachers can manage their own courses" ON public.courses FOR ALL USING (auth.uid() = teacher_id);

-- 5. Create Lessons Table
CREATE TABLE IF NOT EXISTS public.lessons (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    video_url TEXT,
    duration TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    questions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, now()) NOT NULL
);

-- Enable RLS for Lessons
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lessons are readable by everyone" ON public.lessons FOR SELECT USING (true);
CREATE POLICY "Teachers can manage lessons for their courses" ON public.lessons FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.courses 
        WHERE public.courses.id = public.lessons.course_id 
        AND public.courses.teacher_id = auth.uid()
    )
);

-- 6. Create Enrollments Table
CREATE TABLE IF NOT EXISTS public.enrollments (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, now()) NOT NULL
);

-- Enable RLS for Enrollments
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enrollments readable by everyone" ON public.enrollments FOR SELECT USING (true);
CREATE POLICY "Students can manage their own enrollments" ON public.enrollments FOR ALL USING (auth.uid() = student_id);
CREATE POLICY "Teachers can update enrollments of their courses" ON public.enrollments FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.courses 
        WHERE public.courses.id = public.enrollments.course_id 
        AND public.courses.teacher_id = auth.uid()
    )
);

-- 7. Create Submissions Table
CREATE TABLE IF NOT EXISTS public.submissions (
    id TEXT PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    lesson_id TEXT NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    answers JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    grade INTEGER,
    max_points INTEGER NOT NULL DEFAULT 100,
    feedback TEXT,
    ai_review TEXT,
    graded_by TEXT,
    is_try_again_requested BOOLEAN,
    attempts_count INTEGER NOT NULL DEFAULT 1,
    alert_teacher BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, now()) NOT NULL
);

-- Enable RLS for Submissions
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Submissions readable by student and teacher" ON public.submissions FOR SELECT USING (
    auth.uid() = student_id OR 
    EXISTS (
        SELECT 1 FROM public.courses 
        WHERE public.courses.id = public.submissions.course_id 
        AND public.courses.teacher_id = auth.uid()
    )
);
CREATE POLICY "Students can insert/update their submissions" ON public.submissions FOR ALL USING (auth.uid() = student_id);
CREATE POLICY "Teachers can grade submissions of their courses" ON public.submissions FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.courses 
        WHERE public.courses.id = public.submissions.course_id 
        AND public.courses.teacher_id = auth.uid()
    )
);

-- 8. Create Direct Messages Table
CREATE TABLE IF NOT EXISTS public.direct_messages (
    id TEXT PRIMARY KEY,
    sender_id UUID NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    receiver_id UUID NOT NULL,
    content TEXT NOT NULL,
    attachment_type TEXT,
    attachment_url TEXT,
    file_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, now()) NOT NULL
);

-- Enable RLS for Direct Messages
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own direct messages" ON public.direct_messages FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
);
CREATE POLICY "Users can send direct messages" ON public.direct_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
);

-- 9. Create Course Ratings Table
CREATE TABLE IF NOT EXISTS public.course_ratings (
    id TEXT PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, now()) NOT NULL
);

-- Enable RLS for Course Ratings
ALTER TABLE public.course_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Course ratings are readable by everyone" ON public.course_ratings FOR SELECT USING (true);
CREATE POLICY "Students can insert their own course ratings" ON public.course_ratings FOR INSERT WITH CHECK (auth.uid() = student_id);
`;

// --- DB Synced Operations (Filtering & Queries in Database) ---

export async function dbFetchUsers(role: string, userId: string): Promise<UserType[]> {
  try {
    if (role === 'admin') {
      const [adminsRes, teachersRes, studentsRes] = await Promise.all([
        supabase.from('admins').select('*'),
        supabase.from('teachers').select('*'),
        supabase.from('students').select('*')
      ]);

      const list: UserType[] = [];
      if (adminsRes.data) {
        list.push(...adminsRes.data.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: 'admin' as Role,
          active: u.is_approved,
          phone: u.phone,
          province: u.province
        })));
      }
      if (teachersRes.data) {
        list.push(...teachersRes.data.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: 'teacher' as Role,
          active: u.is_approved,
          phone: u.phone,
          province: u.province,
          code: getTeacherCode(u.id, u.code),
          avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200'
        })));
      }
      if (studentsRes.data) {
        list.push(...studentsRes.data.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: 'student' as Role,
          active: true,
          phone: u.phone,
          province: u.province,
          level: u.level,
          selectedTeacherId: u.selected_teacher_id,
          statusByTeacher: u.status_by_teacher,
          currentLessonIndex: 0,
          avatarUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&q=80&w=200'
        })));
      }
      return list;
    }

    if (role === 'teacher') {
      const [teachersRes, studentsRes] = await Promise.all([
        supabase.from('teachers').select('*').eq('id', userId),
        supabase.from('students').select('*').eq('selected_teacher_id', userId)
      ]);

      const list: UserType[] = [];
      if (teachersRes.data) {
        list.push(...teachersRes.data.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: 'teacher' as Role,
          active: u.is_approved,
          phone: u.phone,
          province: u.province,
          code: getTeacherCode(u.id, u.code),
          avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200'
        })));
      }
      if (studentsRes.data) {
        list.push(...studentsRes.data.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: 'student' as Role,
          active: true,
          phone: u.phone,
          province: u.province,
          level: u.level,
          selectedTeacherId: u.selected_teacher_id,
          statusByTeacher: u.status_by_teacher,
          currentLessonIndex: 0,
          avatarUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&q=80&w=200'
        })));
      }
      return list;
    }

    if (role === 'student') {
      const { data: studentRecord } = await supabase.from('students').select('*').eq('id', userId).single();
      if (!studentRecord) return [];

      const teacherId = studentRecord.selected_teacher_id;
      const { data: teacherRecord } = teacherId 
        ? await supabase.from('teachers').select('*').eq('id', teacherId).single()
        : { data: null };

      const list: UserType[] = [
        {
          id: studentRecord.id,
          name: studentRecord.name,
          email: studentRecord.email,
          role: 'student' as Role,
          active: true,
          phone: studentRecord.phone,
          province: studentRecord.province,
          level: studentRecord.level,
          selectedTeacherId: studentRecord.selected_teacher_id,
          statusByTeacher: studentRecord.status_by_teacher,
          currentLessonIndex: 0,
          avatarUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&q=80&w=200'
        }
      ];

      if (teacherRecord) {
        list.push({
          id: teacherRecord.id,
          name: teacherRecord.name,
          email: teacherRecord.email,
          role: 'teacher' as Role,
          active: teacherRecord.is_approved,
          phone: teacherRecord.phone,
          province: teacherRecord.province,
          code: getTeacherCode(teacherRecord.id, teacherRecord.code),
          avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200'
        });
      }

      return list;
    }
  } catch (err) {
    console.warn('Failed to fetch users from database', err);
  }
  return [];
}

export async function dbFetchCourses(role: string, userId: string): Promise<Course[]> {
  try {
    let query = supabase.from('courses').select('*');
    if (role === 'teacher') {
      query = query.eq('teacher_id', userId);
    } else if (role === 'student') {
      const { data: studentRecord } = await supabase.from('students').select('selected_teacher_id').eq('id', userId).single();
      if (studentRecord && studentRecord.selected_teacher_id) {
        query = query.eq('teacher_id', studentRecord.selected_teacher_id);
      } else {
        return [];
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      category: c.category,
      level: c.level,
      teacherId: c.teacher_id,
      createdAt: c.created_at
    }));
  } catch (err) {
    console.warn('Failed to fetch courses from database', err);
  }
  return [];
}

export async function dbFetchLessons(role: string, userId: string): Promise<Lesson[]> {
  try {
    let courseIds: string[] = [];
    if (role === 'teacher') {
      const { data: courses } = await supabase.from('courses').select('id').eq('teacher_id', userId);
      courseIds = (courses || []).map(c => c.id);
    } else if (role === 'student') {
      const { data: studentRecord } = await supabase.from('students').select('selected_teacher_id').eq('id', userId).single();
      if (studentRecord && studentRecord.selected_teacher_id) {
        const { data: courses } = await supabase.from('courses').select('id').eq('teacher_id', studentRecord.selected_teacher_id);
        courseIds = (courses || []).map(c => c.id);
      }
    }

    let query = supabase.from('lessons').select('*');
    if (role !== 'admin') {
      if (courseIds.length === 0) return [];
      query = query.in('course_id', courseIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((l: any) => ({
      id: l.id,
      courseId: l.course_id,
      title: l.title,
      content: l.content,
      images: [],
      questions: typeof l.questions === 'string' ? JSON.parse(l.questions) : (l.questions || []),
      category: l.category || 'عمومی',
      level: (l.level || 'beginner') as 'beginner' | 'intermediate' | 'advanced',
      createdAt: l.created_at || new Date().toISOString(),
      order: l.order_index || 0,
      youtubeUrl: l.video_url || undefined,
      teacherText: l.teacher_text || undefined,
      lessonImages: typeof l.lesson_images === 'string' ? JSON.parse(l.lesson_images) : (l.lesson_images || undefined),
      audioExplanationUrl: undefined,
      audioExplanations: typeof l.audio_explanations === 'string' ? JSON.parse(l.audio_explanations) : (l.audio_explanations || undefined),
      youtubeVideos: typeof l.youtube_videos === 'string' ? JSON.parse(l.youtube_videos) : (l.youtube_videos || undefined),
      pdfResources: typeof l.pdf_resources === 'string' ? JSON.parse(l.pdf_resources) : (l.pdf_resources || undefined)
    })).sort((a: any, b: any) => a.order - b.order);
  } catch (err) {
    console.warn('Failed to fetch lessons from database', err);
  }
  return [];
}

export async function dbFetchSubmissions(role: string, userId: string): Promise<Submission[]> {
  try {
    let query = supabase.from('submissions').select('*');
    if (role === 'student') {
      query = query.eq('student_id', userId);
    } else if (role === 'teacher') {
      const { data: courses } = await supabase.from('courses').select('id').eq('teacher_id', userId);
      const courseIds = (courses || []).map(c => c.id);
      if (courseIds.length === 0) return [];
      query = query.in('course_id', courseIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    
    const list = (data || []).map((s: any) => ({
      id: s.id,
      studentId: s.student_id,
      lessonId: s.lesson_id,
      answers: typeof s.answers === 'string' ? JSON.parse(s.answers) : (s.answers || []),
      status: s.status as 'pending' | 'reviewed',
      grade: s.grade !== null ? s.grade : undefined,
      feedback: s.feedback || undefined,
      aiReview: s.ai_review || undefined,
      gradedBy: s.graded_by as 'teacher' | 'assistant' | undefined,
      isTryAgainRequested: s.is_try_again_requested || undefined,
      attemptsCount: s.attempts_count || 1,
      alertTeacher: s.alert_teacher || false,
      submittedAt: s.submitted_at || new Date().toISOString(),
      studentName: s.student_name || 'دانش‌آموز',
      maxPoints: s.max_points || 100
    }));

    // Deduplicate in memory, grouping by studentId and lessonId
    const groupedMap = new Map<string, any[]>();
    for (const sub of list) {
      const key = `${sub.studentId}_${sub.lessonId}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, []);
      }
      groupedMap.get(key)!.push(sub);
    }

    const deduplicatedList: Submission[] = [];
    const idsToDelete: string[] = [];

    for (const [_, subs] of groupedMap.entries()) {
      // Sort submissions so that the most recent is first
      subs.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      
      const latestSub = subs[0];
      deduplicatedList.push(latestSub);

      if (subs.length > 1) {
        for (let i = 1; i < subs.length; i++) {
          idsToDelete.push(subs[i].id);
        }
      }
    }

    // Fire-and-forget deletion of duplicates from DB to keep storage pristine and clean
    if (idsToDelete.length > 0) {
      supabase.from('submissions').delete().in('id', idsToDelete).then(({ error: delErr }) => {
        if (delErr) {
          console.warn('Background cleanup of duplicate submissions failed', delErr);
        } else {
          console.log(`Successfully cleaned up ${idsToDelete.length} duplicate submissions from DB`);
        }
      });
    }

    return deduplicatedList;
  } catch (err) {
    console.warn('Failed to fetch submissions from database', err);
  }
  return [];
}

export async function dbFetchEnrollments(role: string, userId: string): Promise<CourseEnrollment[]> {
  try {
    let query = supabase.from('enrollments').select('*');
    if (role === 'student') {
      query = query.eq('student_id', userId);
    } else if (role === 'teacher') {
      const { data: courses } = await supabase.from('courses').select('id').eq('teacher_id', userId);
      const courseIds = (courses || []).map(c => c.id);
      if (courseIds.length === 0) return [];
      query = query.in('course_id', courseIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((e: any) => ({
      id: e.id,
      courseId: e.course_id,
      studentId: e.student_id,
      studentName: e.student_name,
      status: e.status,
      createdAt: e.created_at
    }));
  } catch (err) {
    console.warn('Failed to fetch enrollments from database', err);
  }
  return [];
}

export async function dbFetchDirectMessages(userId: string): Promise<DirectMessage[]> {
  try {
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    if (error) throw error;
    return (data || []).map((m: any) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender_name || 'کاربر',
      senderRole: (m.sender_role || 'student') as 'student' | 'teacher',
      receiverId: m.receiver_id,
      content: m.content,
      attachmentType: m.attachment_type || undefined,
      attachmentUrl: m.attachment_url || undefined,
      fileName: m.file_name || undefined,
      createdAt: m.created_at
    }));
  } catch (err) {
    console.warn('Failed to fetch direct messages from database', err);
  }
  return [];
}

export interface Rating {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  teacherId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export async function dbAddRating(rating: Rating): Promise<void> {
  try {
    await supabase.from('course_ratings').insert({
      id: rating.id,
      student_id: rating.studentId,
      student_name: rating.studentName,
      course_id: rating.courseId,
      teacher_id: rating.teacherId,
      rating: rating.rating,
      comment: rating.comment || null,
      created_at: rating.createdAt
    });
  } catch (err) {
    console.error('Failed to save rating in DB', err);
  }
}

export async function dbFetchRatings(): Promise<Rating[]> {
  try {
    const { data, error } = await supabase
      .from('course_ratings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id,
      studentId: r.student_id,
      studentName: r.student_name || 'دانش‌آموز',
      courseId: r.course_id,
      teacherId: r.teacher_id || '',
      rating: r.rating,
      comment: r.comment || '',
      createdAt: r.created_at
    }));
  } catch (err) {
    console.warn('Failed to fetch ratings from database', err);
  }
  return [];
}

export async function dbAddCourse(course: Course): Promise<void> {
  const { error } = await supabase.from('courses').insert({
    id: course.id,
    title: course.title,
    description: course.description,
    category: course.category,
    level: course.level,
    teacher_id: course.teacherId,
    created_at: course.createdAt
  });
  if (error) {
    console.error('Failed to add course in DB', error);
    throw error;
  }
}

export async function dbUpdateCourse(course: Course): Promise<void> {
  const { error } = await supabase.from('courses').update({
    title: course.title,
    description: course.description,
    category: course.category,
    level: course.level
  }).eq('id', course.id);
  if (error) {
    console.error('Failed to update course in DB', error);
    throw error;
  }
}

export async function dbDeleteCourse(courseId: string): Promise<void> {
  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) {
    console.error('Failed to delete course from DB', error);
    throw error;
  }
}

export async function dbAddLesson(lesson: Lesson): Promise<void> {
  const { error } = await supabase.from('lessons').insert({
    id: lesson.id,
    course_id: lesson.courseId,
    title: lesson.title,
    content: lesson.content,
    video_url: lesson.youtubeUrl || null,
    order_index: lesson.order || 0,
    questions: lesson.questions,
    category: lesson.category || 'عمومی',
    level: lesson.level || 'beginner',
    teacher_text: lesson.teacherText || null,
    lesson_images: lesson.lessonImages || null,
    audio_explanations: lesson.audioExplanations || null,
    youtube_videos: lesson.youtubeVideos || null,
    pdf_resources: lesson.pdfResources || null
  });
  if (error) {
    console.error('Failed to add lesson in DB', error);
    throw error;
  }
}

export async function dbUpdateLesson(lesson: Lesson): Promise<void> {
  const { error } = await supabase.from('lessons').update({
    course_id: lesson.courseId,
    title: lesson.title,
    content: lesson.content,
    video_url: lesson.youtubeUrl || null,
    order_index: lesson.order || 0,
    questions: lesson.questions,
    category: lesson.category || 'عمومی',
    level: lesson.level || 'beginner',
    teacher_text: lesson.teacherText || null,
    lesson_images: lesson.lessonImages || null,
    audio_explanations: lesson.audioExplanations || null,
    youtube_videos: lesson.youtubeVideos || null,
    pdf_resources: lesson.pdfResources || null
  }).eq('id', lesson.id);
  if (error) {
    console.error('Failed to update lesson in DB', error);
    throw error;
  }
}

export async function dbDeleteLesson(lessonId: string): Promise<void> {
  const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
  if (error) {
    console.error('Failed to delete lesson from DB', error);
    throw error;
  }
}

export async function dbAddSubmission(sub: Submission): Promise<void> {
  // First, clean up any existing duplicate entries for the same student and lesson in Supabase to ensure clean storage
  const { error: delErr } = await supabase
    .from('submissions')
    .delete()
    .eq('student_id', sub.studentId)
    .eq('lesson_id', sub.lessonId)
    .neq('id', sub.id);

  if (delErr) {
    console.warn('Failed to clean up other submissions during submission insert', delErr);
  }

  const { data: lessonData, error: fetchErr } = await supabase
    .from('lessons')
    .select('course_id')
    .eq('id', sub.lessonId)
    .single();

  if (fetchErr) {
    console.warn('Could not fetch lesson course_id for submission', fetchErr);
  }

  const courseId = lessonData?.course_id || '';

  const { error } = await supabase.from('submissions').upsert({
    id: sub.id,
    student_id: sub.studentId,
    lesson_id: sub.lessonId,
    course_id: courseId,
    answers: sub.answers,
    status: sub.status,
    grade: sub.grade,
    feedback: sub.feedback,
    ai_review: sub.aiReview,
    graded_by: sub.gradedBy,
    is_try_again_requested: sub.isTryAgainRequested,
    attempts_count: sub.attemptsCount,
    alert_teacher: sub.alertTeacher,
    submitted_at: sub.submittedAt,
    student_name: sub.studentName,
    max_points: sub.maxPoints
  });
  if (error) {
    console.error('Failed to upsert submission in DB', error);
    throw error;
  }
}

export async function dbUpdateSubmission(sub: Submission): Promise<void> {
  const { error } = await supabase.from('submissions').update({
    status: sub.status,
    grade: sub.grade,
    feedback: sub.feedback,
    ai_review: sub.aiReview || null,
    graded_by: sub.gradedBy || null,
    is_try_again_requested: sub.isTryAgainRequested,
    attempts_count: sub.attemptsCount,
    alert_teacher: sub.alertTeacher,
    max_points: sub.maxPoints
  }).eq('id', sub.id);

  if (error) {
    console.error('Failed to update submission in DB', error);
    throw error;
  }
}

export async function dbEnrollStudent(enrollment: CourseEnrollment): Promise<void> {
  const { error } = await supabase.from('enrollments').insert({
    id: enrollment.id,
    course_id: enrollment.courseId,
    student_id: enrollment.studentId,
    student_name: enrollment.studentName,
    status: enrollment.status,
    created_at: enrollment.createdAt
  });
  if (error) {
    console.error('Failed to enroll student in DB', error);
    throw error;
  }
}

export async function dbApproveEnrollment(enrollmentId: string, status: string): Promise<void> {
  const { error } = await supabase.from('enrollments').update({ status }).eq('id', enrollmentId);
  if (error) {
    console.error('Failed to update enrollment status in DB', error);
    throw error;
  }
}

export async function dbSendDirectMessage(msg: DirectMessage): Promise<void> {
  const { error } = await supabase.from('direct_messages').insert({
    id: msg.id,
    sender_id: msg.senderId,
    sender_name: msg.senderName,
    sender_role: msg.senderRole,
    receiver_id: msg.receiverId,
    content: msg.content,
    attachment_type: msg.attachmentType || null,
    attachment_url: msg.attachmentUrl || null,
    file_name: msg.fileName || null,
    created_at: msg.createdAt
  });
  if (error) {
    console.error('Failed to save message in DB', error);
    throw error;
  }
}

export async function dbDeleteUser(userId: string, role: string): Promise<void> {
  let error;
  if (role === 'admin') {
    const res = await supabase.from('admins').delete().eq('id', userId);
    error = res.error;
  } else if (role === 'teacher') {
    const res = await supabase.from('teachers').delete().eq('id', userId);
    error = res.error;
  } else if (role === 'student') {
    const res = await supabase.from('students').delete().eq('id', userId);
    error = res.error;
  }
  if (error) {
    console.error('Failed to delete user from DB', error);
    throw error;
  }
}

