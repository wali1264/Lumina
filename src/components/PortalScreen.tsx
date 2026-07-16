import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Sparkles, Search, Filter, Copy, Check, MapPin, 
  Star, Menu, LogIn, UserPlus, ShieldAlert, Award, ArrowRight,
  BookMarked, HelpCircle, GraduationCap, Users, Calendar, Heart
} from 'lucide-react';
import { Course, User as UserType, Rating } from '../types';
import AuthScreen from './AuthScreen';

interface PortalScreenProps {
  courses: Course[];
  users: UserType[];
  ratings: Rating[];
  onRegister: (newUser: UserType) => void;
  onLogin: (user: UserType) => void;
  initialStatusScreen?: 'email_pending' | 'approval_pending' | 'teacher_pending';
  initialStatusEmail?: string;
  initialStatusRole?: 'admin' | 'teacher' | 'student';
}

export default function PortalScreen({
  courses,
  users,
  ratings,
  onRegister,
  onLogin,
  initialStatusScreen,
  initialStatusEmail,
  initialStatusRole
}: PortalScreenProps) {
  const [activeTab, setActiveTab] = useState<'catalog' | 'instructors' | 'promo' | 'auth'>('catalog');
  const [authSubTab, setAuthSubTab] = useState<'login' | 'register' | 'admin'>('login');
  
  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [searchType, setSearchType] = useState<'title' | 'subject'>('title');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [visibleCoursesCount, setVisibleCoursesCount] = useState(5);

  // Reset course pagination on any filter adjustments to start fresh with 5 items
  useEffect(() => {
    setVisibleCoursesCount(5);
  }, [searchQuery, selectedProvince, selectedLevel, searchType]);

  const AFGHAN_PROVINCES = [
    'کابل', 'هرات', 'بلخ', 'قندهار', 'ننگرهار', 'کندز', 'غزنی', 'هلمند', 'بغلان',
    'فاریاب', 'جوزجان', 'تخار', 'بدخشان', 'پکتیا', 'خوست', 'بادغیس', 'لغمان',
    'کنر', 'نورستان', 'بامیان', 'دایکندی', 'ارزگان', 'زابل', 'پکتیکا', 'لوگر',
    'میدان وردک', 'پروان', 'کاپیسا', 'پنجشیر', 'سمنگان', 'سرپل', 'غور', 'فراه', 'نیمروز'
  ];
  
  const teachers = users.filter(u => u.role === 'teacher' && u.active);
  
  // Determine active provinces (where teachers exist and have active courses)
  const activeProvinceSet = new Set(teachers.map(t => t.province).filter(Boolean));
  const provinceOptions = AFGHAN_PROVINCES.map(prov => ({
    name: prov,
    isActive: activeProvinceSet.has(prov)
  })).sort((a, b) => {
    // Active ones at the top
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return 0;
  });

  // Handle Copy Code to clipboard
  const handleCopyCode = (code: string | number, id: string) => {
    navigator.clipboard.writeText(String(code));
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // Calculate Ratings for a Course
  const getCourseRatingInfo = (courseId: string) => {
    const courseRatings = ratings.filter(r => r.courseId === courseId);
    if (courseRatings.length === 0) {
      return { avg: null, count: 0 };
    }
    const sum = courseRatings.reduce((acc, r) => acc + r.rating, 0);
    return {
      avg: parseFloat((sum / courseRatings.length).toFixed(1)),
      count: courseRatings.length
    };
  };

  // Calculate Ratings for an Instructor
  const getTeacherRatingInfo = (teacherId: string) => {
    const teacherRatings = ratings.filter(r => r.teacherId === teacherId);
    if (teacherRatings.length === 0) {
      return { avg: null, count: 0 };
    }
    const sum = teacherRatings.reduce((acc, r) => acc + r.rating, 0);
    return {
      avg: parseFloat((sum / teacherRatings.length).toFixed(1)),
      count: teacherRatings.length
    };
  };

  // Filtering Logic
  const filteredCourses = courses.filter(c => {
    const query = searchQuery.toLowerCase().trim();
    
    let matchesSearch = true;
    if (query) {
      if (searchType === 'title') {
        matchesSearch = c.title.toLowerCase().includes(query);
      } else {
        matchesSearch = (c.category && c.category.toLowerCase().includes(query)) || false;
      }
    }

    const teacher = teachers.find(t => t.id === c.teacherId);
    const matchesProvince = !selectedProvince || (teacher && teacher.province === selectedProvince);
    const matchesLevel = !selectedLevel || c.level === selectedLevel;

    return matchesSearch && matchesProvince && matchesLevel;
  });

  // Sort the filtered courses based on average rating (highest score first)
  const sortedFilteredCourses = [...filteredCourses].sort((a, b) => {
    const rA = getCourseRatingInfo(a.id);
    const rB = getCourseRatingInfo(b.id);
    const scoreA = rA.avg !== null ? rA.avg : 0;
    const scoreB = rB.avg !== null ? rB.avg : 0;
    
    if (scoreB !== scoreA) {
      return scoreB - scoreA; // Descending
    }
    // Secondary sort: number of ratings
    if (rB.count !== rA.count) {
      return rB.count - rA.count;
    }
    // Tertiary sort: title alphabetically
    return a.title.localeCompare(b.title);
  });

  const filteredTeachers = teachers.filter(t => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      t.name.toLowerCase().includes(query) || 
      (t.province && t.province.toLowerCase().includes(query)) ||
      (t.code && String(t.code).includes(query));

    const matchesProvince = !selectedProvince || t.province === selectedProvince;
    return matchesSearch && matchesProvince;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" dir="rtl">
      {/* Top Header / Menu Bar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm px-4 md:px-8 py-3.5 flex items-center justify-between">
        {/* Brand/Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-900 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <GraduationCap className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-black text-slate-950 tracking-tight leading-none">آکادمی هوشمند لومینا</h1>
            <span className="text-[10px] font-bold text-indigo-600 tracking-wider">LUMINA ACADEMY</span>
          </div>
        </div>

        {/* Navigation Tabs in Menu */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
          <button
            onClick={() => { setActiveTab('catalog'); }}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
              activeTab === 'catalog' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            کورس‌های آموزشی
          </button>
          <button
            onClick={() => { setActiveTab('instructors'); }}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
              activeTab === 'instructors' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            مربیان برجسته
          </button>
          <button
            onClick={() => { setActiveTab('promo'); }}
            className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
              activeTab === 'promo' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            درباره آکادمی
          </button>
        </nav>

        {/* Authentication Buttons inside Menu */}
        <div className="flex items-center gap-2">
          {activeTab === 'auth' ? (
            <button
              onClick={() => setActiveTab('catalog')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-black text-slate-800 transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              بازگشت به کاتالوگ
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setActiveTab('auth');
                  setAuthSubTab('login');
                }}
                className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700 transition-all"
              >
                <LogIn className="w-4 h-4 text-slate-500" />
                <span>ورود به سیستم</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('auth');
                  setAuthSubTab('register');
                }}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-black text-white shadow-md shadow-indigo-100 transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span>ثبت‌نام جدید</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Nav Subbar */}
      <div className="md:hidden flex items-center justify-around bg-white border-b border-slate-100 p-2 text-xs font-black text-slate-600">
        <button 
          onClick={() => setActiveTab('catalog')} 
          className={`flex-1 py-2 text-center rounded-lg ${activeTab === 'catalog' ? 'bg-indigo-50 text-indigo-600' : ''}`}
        >
          کورس‌ها
        </button>
        <button 
          onClick={() => setActiveTab('instructors')} 
          className={`flex-1 py-2 text-center rounded-lg ${activeTab === 'instructors' ? 'bg-indigo-50 text-indigo-600' : ''}`}
        >
          مربیان
        </button>
        <button 
          onClick={() => setActiveTab('promo')} 
          className={`flex-1 py-2 text-center rounded-lg ${activeTab === 'promo' ? 'bg-indigo-50 text-indigo-600' : ''}`}
        >
          درباره ما
        </button>
      </div>

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-8">
        
        {activeTab !== 'auth' && (
          /* Promotional / Intro Hero Banner - Beautiful hopeful Sky & Galaxy-themed Gradient */
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 via-teal-500 to-emerald-500 text-white p-6 md:p-10 shadow-xl shadow-sky-100">
            {/* Background glowing galaxy/nebulae circles */}
            <div className="absolute -top-12 -right-12 w-96 h-96 bg-white/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-12 -left-12 w-96 h-96 bg-cyan-300/30 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute top-1/4 left-1/3 w-64 h-64 bg-amber-300/10 rounded-full blur-3xl pointer-events-none"></div>
            
            {/* Subtle Star decorations for Galaxy Feel */}
            <div className="absolute top-10 left-12 w-1.5 h-1.5 bg-white rounded-full animate-ping opacity-60"></div>
            <div className="absolute top-24 left-48 w-1 h-1 bg-white rounded-full opacity-40"></div>
            <div className="absolute bottom-16 right-1/3 w-2 h-2 bg-cyan-200 rounded-full animate-pulse opacity-70"></div>
            <div className="absolute top-1/3 right-1/4 w-1.5 h-1.5 bg-emerald-200 rounded-full opacity-50"></div>

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
              <div className="lg:col-span-3 space-y-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 border border-white/30 text-sky-100 text-[10px] md:text-xs font-black">
                  <Sparkles className="w-3.5 h-3.5" />
                  برترین آکادمی مهارت‌های نوین افغانستان
                </span>
                <h2 className="text-xl md:text-3xl font-black leading-tight tracking-tight text-white">
                  مسیر یادگیری خود را با برترین اساتید کشور هوشمندانه آغاز کنید
                </h2>
                <p className="text-xs md:text-sm text-sky-50 font-medium leading-relaxed max-w-xl">
                  در آکادمی ما تمام کورس‌ها با رتبه‌بندی واقعی شاگردان ارزیابی می‌شوند. شما می‌توانید پیش از ثبت نام، رزومه و کورس‌های مربی خود را بررسی نموده، کد اختصاصی ایشان را برداشته و مستقیماً درخواست خود را ارسال دارید.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-slate-100 text-xs font-bold">
                    <Users className="w-4 h-4 text-cyan-200" />
                    <span>+{users.filter(u => u.role === 'student').length || 240} دانش‌آموز فعال</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-slate-100 text-xs font-bold">
                    <BookOpen className="w-4 h-4 text-emerald-200" />
                    <span>+{courses.length || 35} کورس فعال</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white/15 border border-white/25 rounded-2xl p-5 space-y-3 backdrop-blur-sm">
                <h3 className="text-xs font-black text-cyan-100 flex items-center gap-1.5">
                  <Award className="w-4 h-4" />
                  چگونه ثبت‌نام کنم؟
                </h3>
                <ul className="space-y-2.5 text-xs text-slate-100">
                  <li className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white shrink-0">۱</span>
                    <span>یک مربی مجرب از بخش «مربیان» انتخاب کنید.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white shrink-0">۲</span>
                    <span>کد اختصاصی او را کپی کنید.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white shrink-0">۳</span>
                    <span>در بخش «ثبت‌نام جدید»، کد او را جستجو کرده و متصل شوید.</span>
                  </li>
                </ul>
                <button
                  onClick={() => {
                    setActiveTab('auth');
                    setAuthSubTab('register');
                  }}
                  className="w-full mt-2 py-2.5 rounded-xl bg-white hover:bg-sky-50 text-sky-900 text-xs font-black transition-all shadow-md shadow-black/5"
                >
                  همین حالا رایگان ثبت‌نام کنید
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CATALOG VIEW */}
        {activeTab === 'catalog' && (
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 md:p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-600" />
                جستجو و فیلترینگ کورس‌های آموزشی
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="relative md:col-span-6 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={searchType === 'title' ? "نام کورس مورد نظر خود را جستجو کنید (مثال: پایتون)..." : "موضوع آموزشی را جستجو کنید (مثال: رابط کاربری)..."}
                      className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                    />
                  </div>
                  <select
                    value={searchType}
                    onChange={(e) => setSearchType(e.target.value as 'title' | 'subject')}
                    className="p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs font-black text-indigo-700 focus:outline-none focus:border-indigo-400 transition-all shrink-0 cursor-pointer"
                  >
                    <option value="title">جستجو در عنوان کورس</option>
                    <option value="subject">جستجو در موضوع/دسته‌بندی</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <select
                    value={selectedProvince}
                    onChange={(e) => setSelectedProvince(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-400 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="">همه ولایت‌ها (۳۴ ولایت)</option>
                    {provinceOptions.map(p => (
                      <option 
                        key={p.name} 
                        value={p.name}
                        className={p.isActive ? "font-bold text-slate-900" : "text-slate-400 font-normal"}
                      >
                        {p.name} {p.isActive ? '🔥 (دارای مدرس)' : ' (غیرفعال)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <select
                    value={selectedLevel}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-400 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="">همه سطوح آموزشی</option>
                    <option value="beginner">سطح مبتدی (Beginner)</option>
                    <option value="intermediate">سطح متوسط (Intermediate)</option>
                    <option value="advanced">سطح پیشرفته (Advanced)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Courses Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-black text-slate-900">کورس‌های آموزشی برتر</h3>
                <span className="text-xs font-bold text-slate-500">{filteredCourses.length} کورس یافت شد</span>
              </div>

              {filteredCourses.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedFilteredCourses.slice(0, visibleCoursesCount).map((c) => {
                      const rating = getCourseRatingInfo(c.id);
                      const teacher = teachers.find(t => t.id === c.teacherId);
                      
                      return (
                        <div key={c.id} className="bg-white rounded-2xl border border-slate-200/60 hover:border-indigo-400 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4">
                          <div className="space-y-2.5">
                            {/* Top row */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black">
                                  {c.category || 'عمومی'}
                                </span>
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-black">
                                  {c.level === 'beginner' ? 'سطح مبتدی' : c.level === 'intermediate' ? 'سطح متوسط' : 'سطح پیشرفته'}
                                </span>
                              </div>
                              {rating.avg !== null ? (
                                <div className="flex items-center gap-1 text-amber-500 font-mono text-xs font-black">
                                  <Star className="w-3.5 h-3.5 fill-current text-amber-500" />
                                  <span>{rating.avg}</span>
                                  <span className="text-slate-400 font-bold">({rating.count} رای)</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                                  <Star className="w-3.5 h-3.5 text-slate-300" />
                                  <span>بدون امتیاز</span>
                                </div>
                              )}
                            </div>

                            <h4 className="text-sm font-black text-slate-900 leading-snug">{c.title}</h4>
                            
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span>مدرس: {teacher ? teacher.name : 'استاد آکادمی'} | ولایت: {teacher ? teacher.province : 'کابل'}</span>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                            {teacher && (
                              <button
                                onClick={() => handleCopyCode(teacher.code || '', c.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-[10px] font-black text-slate-700 hover:text-indigo-600 transition-all"
                              >
                                {copiedCodeId === c.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                                    <span className="text-emerald-600 font-black">کپی شد!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>کد مربی: {teacher.code}</span>
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setActiveTab('auth');
                                setAuthSubTab('register');
                              }}
                              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black transition-all"
                            >
                              درخواست کورس
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Infinite-like pagination button loading 5 more items each time */}
                  {filteredCourses.length > visibleCoursesCount && (
                    <div className="flex justify-center pt-4">
                      <button
                        onClick={() => setVisibleCoursesCount((prev) => prev + 5)}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20 text-indigo-600 text-xs font-black shadow-sm hover:shadow transition-all cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4 animate-pulse" />
                        <span>مشاهده کورس‌های بیشتر (۵ مورد دیگر)</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-10 text-center max-w-md mx-auto">
                  <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                  <h4 className="text-xs font-black text-amber-800">کورس آموزشی منطبق بر فیلتر شما یافت نشد.</h4>
                  <p className="text-[11px] text-amber-600 mt-1">پیشنهاد می‌کنیم فیلتر ولایت یا موضوع را بازنشانی کرده یا کلیدواژه جستجوی خود را اصلاح نمایید.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TEACHERS VIEW */}
        {activeTab === 'instructors' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-4 md:p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                لیست اساتید مجرب و مربیان رسمی آکادمی
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative md:col-span-2">
                  <Search className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="جستجو بر اساس نام مربی یا کد اختصاصی..."
                    className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <select
                    value={selectedProvince}
                    onChange={(e) => setSelectedProvince(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-400 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="">همه ولایت‌ها (۳۴ ولایت)</option>
                    {provinceOptions.map(p => (
                      <option 
                        key={p.name} 
                        value={p.name}
                        className={p.isActive ? "font-bold text-slate-900" : "text-slate-400 font-normal"}
                      >
                        {p.name} {p.isActive ? '🔥 (دارای مدرس)' : ' (غیرفعال)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-black text-slate-900">مربیان تایید صلاحیت شده</h3>
                <span className="text-xs font-bold text-slate-500">{filteredTeachers.length} مربی فعال</span>
              </div>

              {filteredTeachers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTeachers.map((t) => {
                    const rating = getTeacherRatingInfo(t.id);
                    const teacherCourses = courses.filter(c => c.teacherId === t.id);
                    
                    return (
                      <div key={t.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 flex flex-col justify-between">
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <img 
                              src={t.avatarUrl || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100'} 
                              alt={t.name}
                              className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <h4 className="text-sm font-black text-slate-950 flex items-center gap-1.5">
                                {t.name}
                                <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-bold">رسمی</span>
                              </h4>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold mt-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                <span>ولایت: {t.province}</span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-xl flex items-center justify-between">
                            <div className="text-center flex-1 border-l border-slate-200">
                              <span className="block text-[9px] font-bold text-slate-400">کد مربی</span>
                              <strong className="text-xs font-mono font-black text-indigo-600">{t.code || '۱۰۰۰'}</strong>
                            </div>
                            <div className="text-center flex-1">
                              <span className="block text-[9px] font-bold text-slate-400">ارزیابی رضایت</span>
                              {rating.avg !== null ? (
                                <div className="flex items-center justify-center gap-0.5 text-xs font-mono font-black text-amber-500">
                                  <Star className="w-3.5 h-3.5 fill-current text-amber-500" />
                                  <span>{rating.avg}</span>
                                </div>
                              ) : (
                                <span className="block text-[10px] text-slate-400 font-bold mt-1">بدون امتیاز</span>
                              )}
                            </div>
                          </div>

                          {/* Nested List of Course Titles and Star Quality WITHOUT description (Per user instructions!) */}
                          <div className="space-y-1.5">
                            <span className="block text-[10px] font-black text-slate-400">کورس‌های فعال مربی ({teacherCourses.length} مورد):</span>
                            {teacherCourses.length > 0 ? (
                              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                                {teacherCourses.map(tc => {
                                  const tcRating = getCourseRatingInfo(tc.id);
                                  return (
                                    <div key={tc.id} className="flex items-center justify-between text-[11px] font-black text-slate-700 bg-slate-50/50 p-1.5 rounded-lg border border-slate-100">
                                      <span className="truncate max-w-[150px]">{tc.title}</span>
                                      {tcRating.avg !== null ? (
                                        <div className="flex items-center gap-0.5 text-amber-500">
                                          <Star className="w-2.5 h-2.5 fill-current text-amber-500" />
                                          <span className="text-[9px] font-mono font-bold">{tcRating.avg}</span>
                                        </div>
                                      ) : (
                                        <span className="text-[9px] text-slate-400 font-bold">بدون امتیاز</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-400 font-bold italic">هنوز کورسی ایجاد نکرده است.</p>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <button
                            onClick={() => handleCopyCode(t.code || '', t.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-[10px] font-black text-slate-700 hover:text-indigo-600 transition-all"
                          >
                            {copiedCodeId === t.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                                <span className="text-emerald-600 font-black">کپی شد!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>کپی کد مربی</span>
                              </>
                            )}
                          </button>
                          
                          <button
                            onClick={() => {
                              setActiveTab('auth');
                              setAuthSubTab('register');
                            }}
                            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black transition-all"
                          >
                            ثبت نام با این مربی
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-10 text-center max-w-md mx-auto">
                  <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-3" />
                  <h4 className="text-xs font-black text-rose-800">هیچ مربی یافت نشد.</h4>
                  <p className="text-[11px] text-rose-600 mt-1">با تغییر کلیدواژه جستجو یا فیلتر ولایت، دوباره تلاش کنید.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROMO / ABOUT VIEW */}
        {activeTab === 'promo' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-10 space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <h3 className="text-lg md:text-2xl font-black text-slate-900">سامانه جامع و هوشمند آموزش کدنویسی</h3>
              <p className="text-xs md:text-sm text-slate-500 font-medium leading-relaxed">
                آکادمی ما با بهره‌مندی از جدیدترین متدهای آموزشی دنیا و زیرساخت‌های فناوری روز، پلی ایمن و کارآمد میان نخبگان علمی افغانستان و علاقه‌مندان به دنیای وسیع برنامه‌نویسی پدید آورده است.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow">
                  <Star className="w-5 h-5 fill-current" />
                </div>
                <h4 className="text-xs font-black text-slate-950">ارزیابی و ستاره‌دهی واقعی</h4>
                <p className="text-[11px] text-slate-500 font-bold leading-relaxed">کورس‌ها بر اساس تجربه شاگردان و نمرات واقعی کسب شده در دوره‌ها درجه‌بندی می‌شوند.</p>
              </div>

              <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow">
                  <Award className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-black text-slate-950">ارتباط مستقیم مربی و شاگرد</h4>
                <p className="text-[11px] text-slate-500 font-bold leading-relaxed">امکان ثبت‌نام مستقیم با انتخاب مربی هم‌استانی یا تخصص‌های مورد نظر جهت تسریع رشد تحصیلی.</p>
              </div>

              <div className="p-5 rounded-2xl bg-amber-50/50 border border-amber-100 text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center mx-auto shadow">
                  <BookMarked className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-black text-slate-950">محتوای غنی و تعاملی</h4>
                <p className="text-[11px] text-slate-500 font-bold leading-relaxed">کورس‌های مجهز به تمرین‌های آنلاین کدنویسی، تخته سفید طراحی و صوت مربی.</p>
              </div>
            </div>
          </div>
        )}

        {/* AUTH TAB - INTEGRATED ROUTER MENU */}
        {activeTab === 'auth' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">حالت ورود را انتخاب کنید:</span>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setAuthSubTab('login')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    authSubTab === 'login' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  ورود
                </button>
                <button
                  onClick={() => setAuthSubTab('register')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    authSubTab === 'register' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  ثبت نام
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
              <AuthScreen
                users={users}
                onRegister={onRegister}
                onLogin={onLogin}
                initialStatusScreen={initialStatusScreen}
                initialStatusEmail={initialStatusEmail}
                initialStatusRole={initialStatusRole}
                forceAuthTab={authSubTab} // We can instruct AuthScreen to auto-select this sub-tab!
              />
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-6 mt-12 text-center text-xs font-bold text-slate-400">
        <p>© {new Date().getFullYear()} آکادمی هوشمند لومینا. تمام حقوق محفوظ است.</p>
      </footer>
    </div>
  );
}
