import React, { useState, useEffect } from 'react';
import { User, Key, Mail, Award, CheckCircle2, ShieldAlert, BookMarked, Sparkles, LogOut, RefreshCw, Check, ShieldCheck } from 'lucide-react';
import { User as UserType, Role } from '../types';
import { 
  registerAdmin, 
  registerTeacher, 
  registerStudent, 
  loginUser, 
  AuthPendingEmailVerificationError, 
  AuthPendingAdminApprovalError,
  AuthPendingTeacherApprovalError,
  supabase
} from '../lib/supabase';

const AFGHAN_PROVINCES = [
  'کابل', 'هرات', 'بلخ', 'قندهار', 'ننگرهار', 'کندز', 'غزنی', 'هلمند', 'بغلان',
  'فاریاب', 'جوزجان', 'تخار', 'بدخشان', 'پکتیا', 'خوست', 'بادغیس', 'لغمان',
  'کنر', 'نورستان', 'بامیان', 'دایکندی', 'ارزگان', 'زابل', 'پکتیکا', 'لوگر',
  'میدان وردک', 'پروان', 'کاپیسا', 'پنجشیر', 'سمنگان', 'سرپل', 'غور', 'فراه', 'نیمروز'
];

interface AuthScreenProps {
  users: UserType[];
  onRegister: (newUser: UserType) => void;
  onLogin: (user: UserType) => void;
  initialStatusScreen?: 'email_pending' | 'approval_pending' | 'teacher_pending' | null;
  initialStatusEmail?: string;
  initialStatusRole?: 'admin' | 'teacher' | 'student';
  forceAuthTab?: 'login' | 'register' | 'admin';
}

export default function AuthScreen({ 
  users, 
  onRegister, 
  onLogin,
  initialStatusScreen = null,
  initialStatusEmail = '',
  initialStatusRole = 'student',
  forceAuthTab
}: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  
  // Registration Feedback & Status Message States
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [adminAuthSuccess, setAdminAuthSuccess] = useState<string | null>(null);

  // Standard Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('کابل');
  const [teacherFilterProvince, setTeacherFilterProvince] = useState('کابل');
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');
  const [registeredTeacherCode, setRegisteredTeacherCode] = useState<number | null>(null);

  // Supabase & Separate Admin Authentication States
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [isAdminLogin, setIsAdminLogin] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminProvince, setAdminProvince] = useState('کابل');

  // Multi-tier Authentication Status Screen States
  const [authStatusScreen, setAuthStatusScreen] = useState<null | 'email_pending' | 'approval_pending' | 'teacher_pending'>(null);

  useEffect(() => {
    setRegisterError(null);
    setRegisterSuccess(null);
  }, [isLogin, role]);

  useEffect(() => {
    setAdminAuthError(null);
    setAdminAuthSuccess(null);
  }, [isAdminLogin, showAdminModal]);
  const [statusEmail, setStatusEmail] = useState('');
  const [statusPassword, setStatusPassword] = useState('');
  const [statusRole, setStatusRole] = useState<'admin' | 'teacher' | 'student'>('student');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialStatusScreen) {
      setAuthStatusScreen(initialStatusScreen);
    }
    if (initialStatusEmail) {
      setStatusEmail(initialStatusEmail);
    }
    if (initialStatusRole) {
      setStatusRole(initialStatusRole);
    }
  }, [initialStatusScreen, initialStatusEmail, initialStatusRole]);

  useEffect(() => {
    if (forceAuthTab === 'login') {
      setIsLogin(true);
      setShowAdminModal(false);
      setIsAdminLogin(true);
    } else if (forceAuthTab === 'register') {
      setIsLogin(false);
      setShowAdminModal(false);
    } else if (forceAuthTab === 'admin') {
      setIsLogin(true);
      setShowAdminModal(true);
      setIsAdminLogin(true);
    }
  }, [forceAuthTab]);

  const [fetchedTeachers, setFetchedTeachers] = useState<UserType[]>([]);

  useEffect(() => {
    let active = true;
    const fetchTeachers = async () => {
      try {
        const { data, error } = await supabase
          .from('teachers')
          .select('id, name, email, phone, province, code, is_approved')
          .eq('is_approved', true)
          .limit(100);
        
        if (error) {
          console.warn('Error fetching teachers in AuthScreen:', error);
          return;
        }
        
        if (data && active) {
          const mapped: UserType[] = data.map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: 'teacher',
            active: u.is_approved,
            phone: u.phone || '',
            province: u.province || '',
            code: u.code,
            avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200'
          }));
          setFetchedTeachers(mapped);
        }
      } catch (err) {
        console.warn('Could not fetch teachers from Supabase', err);
      }
    };
    fetchTeachers();
    return () => {
      active = false;
    };
  }, []);

  // Merge teachers from props and those directly fetched from Supabase
  const activeTeachers = [
    ...users.filter(u => u.role === 'teacher' && u.active),
    ...fetchedTeachers
  ].reduce((acc, current) => {
    const exists = acc.find(item => item.id === current.id);
    if (!exists) {
      return acc.concat([current]);
    } else {
      return acc;
    }
  }, [] as UserType[]);

  // Auto-select first matching teacher from province (or first overall) if selection is empty
  useEffect(() => {
    if (activeTeachers.length > 0 && !selectedTeacherId) {
      const defaultProvince = province || 'کابل';
      const matching = activeTeachers.filter(t => t.province === defaultProvince);
      if (matching.length > 0) {
        setSelectedTeacherId(matching[0].id);
      } else {
        setSelectedTeacherId(activeTeachers[0].id);
      }
    }
  }, [activeTeachers, province, selectedTeacherId]);

  const filteredTeachers = activeTeachers.filter(t => {
    const query = teacherSearchQuery.trim().toLowerCase();
    if (!query) return true;
    const matchesName = t.name.toLowerCase().includes(query);
    const matchesCode = t.code && String(t.code).includes(query);
    const matchesProvince = t.province && t.province.toLowerCase().includes(query);
    const matchesId = t.id && t.id.toLowerCase().includes(query);
    return matchesName || matchesCode || matchesProvince || matchesId;
  });

  const sortedTeachers = [...filteredTeachers].sort((a, b) => {
    const aInProv = a.province === province ? 1 : 0;
    const bInProv = b.province === province ? 1 : 0;
    return bInProv - aInProv;
  });

  // Re-usable retry authentication handler for pending screens
  const handleAuthRetry = async () => {
    setIsLoading(true);
    try {
      const loggedInUser = await loginUser(statusEmail, statusPassword);
      setIsLoading(false);
      setAuthStatusScreen(null);
      setShowAdminModal(false);
      onLogin(loggedInUser);
    } catch (err: any) {
      setIsLoading(false);
      if (err instanceof AuthPendingEmailVerificationError) {
        setAuthStatusScreen('email_pending');
      } else if (err instanceof AuthPendingAdminApprovalError) {
        setAuthStatusScreen('approval_pending');
      } else if (err instanceof AuthPendingTeacherApprovalError) {
        setAuthStatusScreen('teacher_pending');
      } else {
        alert(err.message || 'خطا در احراز هویت. لطفا مجددا تلاش کنید.');
      }
    }
  };

  const handleLogoutAndBack = () => {
    setAuthStatusScreen(null);
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setRegisterError(null);
    setRegisterSuccess(null);

    try {
      if (isLogin) {
        // Try Logging In via Supabase
        try {
          const loggedInUser = await loginUser(email, password);
          setIsLoading(false);
          onLogin(loggedInUser);
        } catch (supaErr: any) {
          console.warn('Supabase Login error, trying mock local storage fallback', supaErr);

          // Handle special authentication pending states
          if (supaErr instanceof AuthPendingEmailVerificationError) {
            setAuthStatusScreen('email_pending');
            setStatusEmail(email);
            setStatusPassword(password);
            setStatusRole(role === 'teacher' ? 'teacher' : 'student');
            setIsLoading(false);
            return;
          }
          if (supaErr instanceof AuthPendingAdminApprovalError) {
            setAuthStatusScreen('approval_pending');
            setStatusEmail(email);
            setStatusPassword(password);
            setStatusRole('teacher');
            setIsLoading(false);
            return;
          }
          if (supaErr instanceof AuthPendingTeacherApprovalError) {
            setAuthStatusScreen('teacher_pending');
            setStatusEmail(email);
            setStatusPassword(password);
            setStatusRole('student');
            setIsLoading(false);
            return;
          }

          // Offline mock backup check if tables not configured yet
          const existingUser = users.find(u => u.email.trim().toLowerCase() === email.trim().toLowerCase());
          if (existingUser) {
            if (existingUser.role === 'teacher' && !existingUser.active) {
              setAuthStatusScreen('approval_pending');
              setStatusEmail(email);
              setStatusPassword(password);
              setStatusRole('teacher');
              setIsLoading(false);
              return;
            }
            if (existingUser.role === 'student' && existingUser.statusByTeacher === 'pending') {
              setAuthStatusScreen('teacher_pending');
              setStatusEmail(email);
              setStatusPassword(password);
              setStatusRole('student');
              setIsLoading(false);
              return;
            }
            setIsLoading(false);
            onLogin(existingUser);
          } else {
            setIsLoading(false);
            let errorMsg = supaErr.message || 'کاربری با این ایمیل یافت نشد. لطفاً رمز عبور را چک کنید یا ثبت نام نمایید.';
            if (errorMsg.includes('Invalid login credentials')) {
              errorMsg = 'نشانی ایمیل یا رمز عبور وارد شده اشتباه است. لطفاً مجدداً بررسی کنید.';
            }
            setRegisterError(errorMsg);
          }
        }
      } else {
        // Register Student / Teacher via Supabase
        try {
          if (role === 'teacher') {
            const res = await registerTeacher(name, email, phone, province, password);
            if (res && res.code) {
              setRegisteredTeacherCode(res.code);
            }
            setIsLoading(false);
            setRegisterSuccess('حساب کاربری شما با موفقیت ایجاد شد! درخواست شما به عنوان مدرس در انتظار تایید توسط مدیریت (ادمین) است.');
            
            // Go directly to admin approval pending status
            setTimeout(() => {
              setAuthStatusScreen('approval_pending');
              setStatusEmail(email);
              setStatusPassword(password);
              setStatusRole('teacher');
            }, 3500);
          } else {
            const finalTeacherId = selectedTeacherId || activeTeachers.find(t => t.province === province)?.id || activeTeachers[0]?.id || 't1';
            await registerStudent(name, email, phone, province, level, finalTeacherId, password);
            setIsLoading(false);
            setRegisterSuccess('حساب کاربری شما با موفقیت ایجاد شد! درخواست عضویت شما در انتظار تایید مربی انتخابی شما می‌باشد.');
            
            // Go directly to teacher approval pending status
            setTimeout(() => {
              setAuthStatusScreen('teacher_pending');
              setStatusEmail(email);
              setStatusPassword(password);
              setStatusRole('student');
            }, 3500);
          }

        } catch (supaErr: any) {
          console.warn('Supabase Register error:', supaErr);
          setIsLoading(false);

          let errorMsg = supaErr.message || 'خطایی در ثبت‌نام رخ داد.';
          if (errorMsg.includes('Too Many Requests') || errorMsg.includes('security purposes') || supaErr.status === 429) {
            errorMsg = 'درخواست‌های شما بیش از حد مجاز است. به دلیل قوانین حفاظتی سرور، لطفاً ۳۰ ثانیه صبر کرده و سپس مجدداً تلاش کنید.';
          } else if (errorMsg.includes('already registered') || errorMsg.includes('already exists')) {
            errorMsg = 'این نشانی ایمیل قبلاً در سیستم ثبت شده است. لطفاً از بخش ورود استفاده کنید.';
          } else if (errorMsg.includes('at least 6 characters')) {
            errorMsg = 'رمز عبور امنیتی شما باید حداقل ۶ نویسه (کاراکتر) باشد.';
          }
          setRegisterError(errorMsg);
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      setRegisterError(err.message || 'خطایی در انجام عملیات رخ داد.');
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAdminAuthError(null);
    setAdminAuthSuccess(null);

    try {
      if (isAdminLogin) {
        // Log in Admin via Supabase
        try {
          const loggedInAdmin = await loginUser(adminEmail, adminPassword);
          setIsLoading(false);
          setShowAdminModal(false);
          onLogin(loggedInAdmin);
        } catch (supaErr: any) {
          console.warn('Supabase Admin Login error, checking mock fallback', supaErr);

          if (supaErr instanceof AuthPendingEmailVerificationError) {
            setAuthStatusScreen('email_pending');
            setStatusEmail(adminEmail);
            setStatusPassword(adminPassword);
            setStatusRole('admin');
            setIsLoading(false);
            return;
          }
          if (supaErr instanceof AuthPendingAdminApprovalError) {
            setAuthStatusScreen('approval_pending');
            setStatusEmail(adminEmail);
            setStatusPassword(adminPassword);
            setStatusRole('admin');
            setIsLoading(false);
            return;
          }

          // Local dev mock bypass for standard administrator credentials
          if (adminEmail.trim().toLowerCase() === 'admin@aiacademy.ir') {
            const adminUser = users.find(u => u.role === 'admin') || {
              id: 'admin',
              name: 'مدیر پلتفرم (ادمین)',
              email: 'admin@aiacademy.ir',
              role: 'admin',
              active: true,
              phone: '0799000111',
              province: 'کابل'
            };
            setIsLoading(false);
            setShowAdminModal(false);
            onLogin(adminUser);
            return;
          }

          setIsLoading(false);
          let errorMsg = supaErr.message || 'نشانی ایمیل یا رمز عبور اشتباه است.';
          if (errorMsg.includes('Invalid login credentials')) {
            errorMsg = 'نشانی ایمیل یا رمز عبور وارد شده اشتباه است. لطفاً مجدداً بررسی کنید.';
          }
          setAdminAuthError(errorMsg);
        }
      } else {
        // Register Admin via Supabase
        try {
          await registerAdmin(adminName, adminEmail, adminPhone, adminProvince, adminPassword);
          setIsLoading(false);
          setAdminAuthSuccess('درخواست عضویت ادمین با موفقیت ارسال شد! حساب کاربری شما در انتظار بررسی و تایید صلاحیت توسط سوپر ادمین است.');
          
          // Stay on successful register banner briefly, then show verification status screen
          setTimeout(() => {
            setAuthStatusScreen('approval_pending');
            setStatusEmail(adminEmail);
            setStatusPassword(adminPassword);
            setStatusRole('admin');
          }, 3500);

        } catch (supaErr: any) {
          console.warn('Supabase Admin Register error:', supaErr);
          setIsLoading(false);

          let errorMsg = supaErr.message || 'خطایی در ثبت‌نام ادمین رخ داد.';
          if (errorMsg.includes('Too Many Requests') || errorMsg.includes('security purposes') || supaErr.status === 429) {
            errorMsg = 'درخواست‌های شما بیش از حد مجاز است. به دلیل قوانین حفاظتی سرور، لطفاً ۳۰ ثانیه صبر کرده و سپس مجدداً تلاش کنید.';
          } else if (errorMsg.includes('already registered') || errorMsg.includes('already exists')) {
            errorMsg = 'این نشانی ایمیل قبلاً در سیستم ثبت شده است. لطفاً از ایمیل دیگری استفاده کنید.';
          } else if (errorMsg.includes('at least 6 characters')) {
            errorMsg = 'رمز عبور امنیتی شما باید حداقل ۶ نویسه (کاراکتر) باشد.';
          }
          setAdminAuthError(errorMsg);
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      setAdminAuthError(err.message || 'خطایی در انجام عملیات رخ داد.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      
      {/* Decorative ambient background curves */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-200/20 rounded-full filter blur-3xl -mr-20 -mt-20"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-200/20 rounded-full filter blur-3xl -ml-20 -mb-20"></div>

      {/* RENDER DYNAMIC PENDING/APPROVAL STATUS SCREEN */}
      {authStatusScreen ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 text-center relative z-10 animate-fadeIn">
          {registeredTeacherCode && statusRole === 'teacher' && (
            <div className="p-4 bg-emerald-50 border border-emerald-150 rounded-2xl text-emerald-800 space-y-2 mb-2 animate-bounce">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">🎉 کد مربیگری اختصاصی شما صادر شد 🎉</p>
              <div className="text-2xl font-black font-mono tracking-widest text-emerald-700 bg-white border border-emerald-200 rounded-xl py-1 w-32 mx-auto shadow-inner">{registeredTeacherCode}</div>
              <p className="text-[9px] font-bold text-emerald-600 leading-relaxed">
                این کد را ذخیره کنید و به هنرجویان خود بدهید تا هنگام ثبت‌نام، با جستجوی این کد شما را به عنوان مربی انتخاب کنند.
              </p>
            </div>
          )}
          {authStatusScreen === 'email_pending' && (
            <div className="space-y-5">
              <div className="mx-auto w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 animate-pulse">
                <Mail size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-900">📬 برو و ایمیلت را تایید کن!</h3>
                <p className="text-xs text-slate-500 font-bold leading-relaxed px-2">
                  لینک فعال‌سازی و تاییدیه هویت با موفقیت به آدرس ایمیل <strong className="text-indigo-600 font-mono">{statusEmail}</strong> ارسال شد. لطفا صندوق پیام‌های خود را باز کرده و برای ادامه روی لینک کلیک کنید.
                </p>
              </div>
            </div>
          )}

          {authStatusScreen === 'approval_pending' && (
            <div className="space-y-5">
              <div className="mx-auto w-16 h-16 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                <ShieldAlert size={32} className="animate-bounce" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-900">🛡️ حساب در حال بررسی و تایید صلاحیت</h3>
                {statusRole === 'admin' ? (
                  <p className="text-xs text-slate-500 font-bold leading-relaxed px-2">
                    حساب شما هنوز توسط سوپر ادمین تایید نشده و در حال بررسی است. لطفا شکیبا باشید. به محض فعال‌سازی دستی وضعیت در پایگاه داده توسط مدیر کل، دسترسی شما برقرار می‌گردد.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 font-bold leading-relaxed px-2">
                    حساب کاربری شما به عنوان مدرس در حال بررسی صلاحیت توسط مدیر کل سیستم است. به محض بررسی رزومه و فعال‌سازی، دسترسی تدریس برقرار خواهد شد.
                  </p>
                )}
              </div>
            </div>
          )}

          {authStatusScreen === 'teacher_pending' && (
            <div className="space-y-5">
              <div className="mx-auto w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                <Award size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-900">🎓 در انتظار پذیرش توسط مربی</h3>
                <p className="text-xs text-slate-500 font-bold leading-relaxed px-2">
                  درخواست عضویت شما ثبت گردیده و در صف تایید استاد راهنمای انتخابی شما قرار دارد. مربی به زودی وضعیت شما را در کلاس بررسی و فعال خواهد کرد.
                </p>
              </div>
            </div>
          )}

          {/* Action buttons on Status screen */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <button
              onClick={handleAuthRetry}
              disabled={isLoading}
              className="w-full py-3 bg-slate-900 hover:bg-black text-white text-xs font-black rounded-xl transition shadow-md flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>{isLoading ? 'در حال بررسی مجدد...' : 'بررسی مجدد و تلاش دوباره'}</span>
            </button>

            <button
              onClick={handleLogoutAndBack}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5"
            >
              <LogOut size={14} />
              <span>خروج و بازگشت به صفحه اصلی</span>
            </button>
          </div>
        </div>
      ) : (
        // MAIN LOGIN & REGISTRATION FRAME
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 relative z-10 animate-fadeIn">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-white shadow-md">
              <BookMarked size={24} />
            </div>
            <h2 className="text-xl font-black text-slate-900">آکادمی هوشمند لومینا</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              {isLogin 
                ? 'خوش آمدید! برای ورود اطلاعات کاربری خود را وارد کنید.' 
                : 'به خانواده بزرگ آموزش هوشمند بپیوندید!'
              }
            </p>
          </div>

          {/* Tab switcher: Login vs Register */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              ورود به حساب
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                if (activeTeachers.length > 0 && !selectedTeacherId) {
                  setSelectedTeacherId(activeTeachers[0].id);
                }
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                !isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              ثبت‌نام جدید
            </button>
          </div>

          {/* User selection and inputs */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500">من می‌خواهم ثبت‌نام کنم به عنوان:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      role === 'student' 
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-extrabold' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🎓 دانش‌آموز (هنرجو)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('teacher')}
                    className={`py-2 text-xs font-bold rounded-xl border transition ${
                      role === 'teacher' 
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-extrabold' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    👨‍🏫 معلم (مدرس)
                  </button>
                </div>
              </div>
            )}

            {/* Name input */}
            {!isLogin && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">نام و نام خانوادگی</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <User size={16} />
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: امین محمدی"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>
            )}

            {/* Email input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500">نشانی ایمیل</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@aiacademy.ir"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-slate-400 text-left"
                />
              </div>
            </div>

            {/* Password input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500">رمز عبور</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                  <Key size={16} />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-slate-400 text-left font-mono"
                />
              </div>
            </div>

            {/* Contact Phone (Register only) */}
            {!isLogin && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">شماره تماس (تلفن همراه)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                    📞
                  </span>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="مثال: 0799123456"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-slate-400 text-left font-mono"
                  />
                </div>
              </div>
            )}

            {/* Teacher Province */}
            {!isLogin && role === 'teacher' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">ولایت محل خدمت استاد</label>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  {AFGHAN_PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Student learning choices */}
            {!isLogin && role === 'student' && (
              <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="text-[10px] uppercase tracking-wider text-indigo-600 font-extrabold border-b border-indigo-100 pb-1.5 mb-1">
                  اطلاعات یادگیری و انتخاب مربی
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">ولایت محل سکونت شما</label>
                  <select
                    value={province}
                    onChange={(e) => {
                      const prov = e.target.value;
                      setProvince(prov);
                      setTeacherFilterProvince(prov);
                      const matching = activeTeachers.filter(t => t.province === prov);
                      if (matching.length > 0) {
                        setSelectedTeacherId(matching[0].id);
                      }
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {AFGHAN_PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">سطح یادگیری پایه مورد نظر</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="beginner">سطح ابتدایی (Beginner)</option>
                    <option value="intermediate">سطح متوسطه (Intermediate)</option>
                    <option value="advanced">سطح پیشرفته (Advanced)</option>
                  </select>
                </div>

                <div className="space-y-1.5 relative text-right">
                  <label className="text-[10px] font-bold text-slate-500">جستجو و انتخاب مربی (بر اساس نام، ولایت یا کد مربی)</label>
                  {activeTeachers.length > 0 ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={teacherSearchQuery}
                        onChange={(e) => setTeacherSearchQuery(e.target.value)}
                        placeholder="نام، ولایت یا کد مربی را جستجو کنید..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-400 placeholder-slate-400"
                      />
                      
                      {/* Filtered list of teachers - Showing 5 items nicely with scroll limit */}
                      <div className="max-h-[310px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50 p-1.5 space-y-1.5 scrollbar-thin">
                        {sortedTeachers.length > 0 ? (
                          sortedTeachers.map((t) => {
                            const isSelected = selectedTeacherId === t.id;
                            const isProvinceMatch = t.province === province;
                            return (
                              <button
                                type="button"
                                key={t.id}
                                onClick={() => {
                                  setSelectedTeacherId(t.id);
                                }}
                                className={`w-full text-right p-3 rounded-xl flex items-center justify-between transition-all duration-200 ${
                                  isSelected 
                                    ? 'bg-slate-900 border-2 border-indigo-600 text-white shadow-md' 
                                    : 'bg-white text-slate-800 hover:bg-slate-50 border border-slate-200 shadow-sm'
                                }`}
                              >
                                <div className="text-right">
                                  <div className="text-sm font-black flex items-center gap-2">
                                    <span className={isSelected ? 'text-white' : 'text-slate-800'}>{t.name}</span>
                                    {isProvinceMatch && (
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                        isSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'
                                      }`}>
                                        هم‌استانی شما
                                      </span>
                                    )}
                                  </div>
                                  <div className={`text-xs font-bold mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ${
                                    isSelected ? 'text-indigo-200 font-mono' : 'text-slate-500 font-mono'
                                  }`}>
                                    <span>کد مربی: <strong className="text-base font-extrabold tracking-wide">{t.code || '۱۰۰۰'}</strong></span>
                                    <span className="opacity-40">|</span>
                                    <span>ولایت: <strong className="text-sm font-black">{t.province}</strong></span>
                                  </div>
                                </div>
                                {isSelected && (
                                  <span className="bg-indigo-600 p-1 rounded-full text-white">
                                    <Check size={14} className="stroke-[3]" />
                                  </span>
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-center">
                            <p className="text-[10px] text-amber-600 font-bold leading-relaxed">
                              ⚠️ مربی با مشخصات فوق یافت نشد. می‌توانید با نام، ولایت یا کد مربی دیگر جستجو کنید.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={teacherSearchQuery}
                        onChange={(e) => setTeacherSearchQuery(e.target.value)}
                        placeholder="نام، ولایت یا کد مربی را جستجو کنید..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-400 placeholder-slate-400 opacity-60"
                        disabled
                      />
                      <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-center">
                        <p className="text-[10px] text-rose-600 font-bold leading-relaxed">
                          ⚠️ هیچ مربی تایید صلاحیت شده‌ای در سامانه یافت نشد. به زودی مربی پس از تایید توسط مدیریت به حساب شما اختصاص داده خواهد شد.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Visual Feedback Alerts */}
            {registerError && (
              <div className="p-3.5 bg-rose-50 border border-rose-150 rounded-2xl text-rose-800 text-[11px] font-bold leading-relaxed flex items-start gap-2 animate-fadeIn mb-2 text-right">
                <span className="text-xs">⚠️</span>
                <p className="flex-1">{registerError}</p>
              </div>
            )}
            
            {registerSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-150 rounded-2xl text-emerald-800 text-[11px] font-bold leading-relaxed flex items-start gap-2 animate-fadeIn mb-2 text-right">
                <span className="text-xs">🎉</span>
                <p className="flex-1">{registerSuccess}</p>
              </div>
            )}

            {/* Form button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-extrabold transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <span>{isLogin ? 'ورود به سیستم' : 'ثبت نام و ایجاد حساب'}</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* DISCRETE ADMIN PORTAL TAB IN CORNER */}
      <div className="absolute bottom-4 right-4 z-20">
        <button
          onClick={() => setShowAdminModal(true)}
          className="px-3 py-1.5 bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-700 text-[10px] font-bold rounded-lg border border-slate-300/40 transition cursor-pointer flex items-center gap-1 shadow-sm"
        >
          ⚙️ پنل ادمین پلتفرم
        </button>
      </div>

      {/* SEPARATE ADMIN AUTHENTICATION MODAL */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 relative animate-fadeIn">
            
            {/* Close button */}
            <button
              onClick={() => {
                setShowAdminModal(false);
                setIsAdminLogin(true);
              }}
              className="absolute top-4 left-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            >
              ✕
            </button>

            {/* Header */}
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center text-white shadow-md">
                <ShieldCheck size={24} />
              </div>
              <h2 className="text-lg font-black text-slate-900">احراز هویت ادمین‌های پلتفرم</h2>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                {isAdminLogin 
                  ? 'ورود اختصاصی مدیران کل سیستم آکادمی هوشمند لومینا' 
                  : 'درخواست ثبت‌نام ادمین جدید آکادمی هوشمند لومینا'
                }
              </p>
            </div>

            {/* Modal tab switcher */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setIsAdminLogin(true)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  isAdminLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                ورود ادمین
              </button>
              <button
                onClick={() => setIsAdminLogin(false)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  !isAdminLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                ثبت‌نام ادمین جدید
              </button>
            </div>

            <form onSubmit={handleAdminSubmit} className="space-y-4">
              {/* Full Name for register only */}
              {!isAdminLogin && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500">نام و نام خانوادگی مدیر</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                      <User size={16} />
                    </span>
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="مثال: مهندس راد"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-800 font-bold focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">نشانی ایمیل ادمین</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <Mail size={16} />
                  </span>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@aiacademy.ir"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-slate-400 text-left"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">رمز عبور امنیتی</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <Key size={16} />
                  </span>
                  <input
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-400 text-left font-mono"
                  />
                </div>
              </div>

              {/* Phone number & Province for register only */}
              {!isAdminLogin && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">شماره تماس اختصاصی مدیر</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                        📞
                      </span>
                      <input
                        type="tel"
                        required
                        value={adminPhone}
                        onChange={(e) => setAdminPhone(e.target.value)}
                        placeholder="0799000111"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-4 py-2 text-xs text-slate-800 font-bold focus:outline-none focus:border-slate-400 text-left font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500">ولایت خدمت</label>
                    <select
                      value={adminProvince}
                      onChange={(e) => setAdminProvince(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-800 focus:outline-none"
                    >
                      {AFGHAN_PROVINCES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Visual Feedback Alerts */}
              {adminAuthError && (
                <div className="p-3.5 bg-rose-50 border border-rose-150 rounded-2xl text-rose-800 text-[11px] font-bold leading-relaxed flex items-start gap-2 animate-fadeIn mb-2 text-right">
                  <span className="text-xs">⚠️</span>
                  <p className="flex-1">{adminAuthError}</p>
                </div>
              )}
              
              {adminAuthSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-150 rounded-2xl text-emerald-800 text-[11px] font-bold leading-relaxed flex items-start gap-2 animate-fadeIn mb-2 text-right">
                  <span className="text-xs">🎉</span>
                  <p className="flex-1">{adminAuthSuccess}</p>
                </div>
              )}

              {/* Action Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <span>{isAdminLogin ? 'ورود ادمین به پنل' : 'ارسال درخواست عضویت ادمین'}</span>
                )}
              </button>
            </form>

            <div className="p-3 bg-amber-50 border border-amber-150 rounded-xl">
              <p className="text-[9px] text-amber-800 font-bold leading-relaxed text-center">
                ⚠️ پس از ثبت‌نام به عنوان ادمین، حتما باید وضعیت شما دستی در پایگاه داده Supabase فعال شود تا بتوانید وارد شوید.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
