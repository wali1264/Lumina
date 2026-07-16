import React, { useState } from 'react';
import { ShieldAlert, Check, X, Shield, Users, Award, BookOpen, Trash2, Settings, AlertTriangle, Download, Upload, Database } from 'lucide-react';
import { User as UserType } from '../types';
import { dbGetAll, dbSet, dbClear } from '../utils/indexedDB';

interface AdminPanelProps {
  users: UserType[];
  onApproveTeacher: (teacherId: string, approve: boolean) => void;
  onDeleteUser: (userId: string) => void;
  onLogout: () => void;
}

export default function AdminPanel({ users, onApproveTeacher, onDeleteUser, onLogout }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'settings'>('users');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'danger_zone' | 'backup'>('danger_zone');

  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');

  const handleExportBackup = async () => {
    try {
      // Fetch all IndexedDB data
      const idbData = await dbGetAll();

      const backupData: Record<string, string | null> = {
        ai_users_db: localStorage.getItem('ai_users_db'),
        ai_courses_db: localStorage.getItem('ai_courses_db'),
        ai_lessons_db: idbData.ai_lessons_db ? JSON.stringify(idbData.ai_lessons_db) : localStorage.getItem('ai_lessons_db'),
        ai_submissions_db: idbData.ai_submissions_db ? JSON.stringify(idbData.ai_submissions_db) : localStorage.getItem('ai_submissions_db'),
        ai_enrollments_db: localStorage.getItem('ai_enrollments_db'),
        ai_current_session: localStorage.getItem('ai_current_session'),
      };
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('read_mails_') || key.startsWith('read_student_notifications_'))) {
          backupData[key] = localStorage.getItem(key);
        }
      }

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `smart_class_backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('خطا در تهیه نسخه پشتیبان. لطفا مجددا تلاش کنید.');
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result as string;
        const backupData = JSON.parse(result);
        
        if (!backupData.ai_users_db && !backupData.ai_lessons_db) {
          alert('فایل پشتیبان نامعتبر است یا کلیدهای حیاتی برنامه را ندارد.');
          return;
        }

        // Clear existing IndexedDB data before restoring
        await dbClear();

        for (const [key, value] of Object.entries(backupData)) {
          if (value !== null && typeof value === 'string') {
            if (key === 'ai_lessons_db' || key === 'ai_submissions_db') {
              try {
                const parsed = JSON.parse(value);
                await dbSet(key, parsed);
              } catch {
                await dbSet(key, value);
              }
            } else {
              localStorage.setItem(key, value);
            }
          }
        }

        alert('نسخه پشتیبان با موفقیت بازیابی شد. برای اعمال تغییرات برنامه دوباره بارگذاری می‌شود.');
        window.location.reload();
      } catch (error) {
        console.error(error);
        alert('خطا در خواندن فایل پشتیبان. مطمئن شوید که فایل JSON معتبر است.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllStorage = async () => {
    const firstConfirm = confirm('⚠️ هشدار شدید: آیا مطمئن هستید که می‌خواهید تمام داده‌های اپلیکیشن و مرورگر را پاک کنید؟ این شامل کل دوره‌ها، درس‌ها، کاربران و تکلیف‌ها می‌شود و قابل بازگشت نیست.');
    if (!firstConfirm) return;

    const secondConfirm = confirm('🛑 تایید نهایی: این کار حافظه مرورگر (LocalStorage و SessionStorage) را به طور کامل پاکسازی می‌کند. مطمئن هستید؟');
    if (!secondConfirm) return;

    try {
      localStorage.clear();
      sessionStorage.clear();
      await dbClear();
      alert('تمامی داده‌ها و حافظه مرورگر با موفقیت پاک شدند. برنامه به صورت کاملاً خام بارگذاری مجدد می‌شود.');
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert('خطا در پاکسازی حافظه.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-slate-900 flex flex-col" dir="rtl">
      
      {/* Admin Header */}
      <header className="h-16 bg-slate-950 text-white flex items-center justify-between px-6 shrink-0 sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-rose-600 rounded-lg flex items-center justify-center text-white font-black">
            <Shield size={18} />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight">آکادمی هوشمند لومینا | پنل ادمین کل سیستم</h1>
            <p className="text-[10px] text-slate-400 font-semibold">بخش احراز هویت، تایید صلاحیت مدرسان و ارزیابی سرورها</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition"
        >
          <span>خروج از پنل ادمین</span>
          <X size={14} />
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-2">
          <button
            id="admin-tab-users"
            onClick={() => setActiveTab('users')}
            className={`px-5 py-3 text-xs font-black transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'users'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users size={16} />
            <span>👥 مدیریت کاربران و درخواست‌ها</span>
          </button>
          
          <button
            id="admin-tab-settings"
            onClick={() => setActiveTab('settings')}
            className={`px-5 py-3 text-xs font-black transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings size={16} />
            <span>⚙️ تنظیمات</span>
          </button>
        </div>

        {activeTab === 'users' ? (
          <>
            {/* Statistics Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users size={22} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-extrabold uppercase">مدرسان ثبت شده</div>
              <div className="text-xl font-black text-slate-900 font-mono mt-0.5">{teachers.length} استاد</div>
            </div>
          </div>
          
          <div className="p-5 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Award size={22} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-extrabold uppercase">مدرسان تایید صلاحیت شده</div>
              <div className="text-xl font-black text-slate-900 font-mono mt-0.5">
                {teachers.filter(t => t.active).length} استاد فعال
              </div>
            </div>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <ShieldAlert size={22} className={teachers.some(t => !t.active) ? "animate-pulse" : ""} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-extrabold uppercase">درخواست‌های تایید معلق</div>
              <div className="text-xl font-black text-rose-600 font-mono mt-0.5">
                {teachers.filter(t => !t.active).length} درخواست معلق
              </div>
            </div>
          </div>
        </div>

        {/* Teachers Management Section */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">لیست درخواست‌های عضویت مدرسان جدید</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">مدیر کل باید مشخصات رزومه، ایمیل و صلاحیت اساتید را بررسی کرده و سپس کلید فعال‌سازی پنل تدریس آن‌ها را صادر کند.</p>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">استاد</th>
                  <th className="p-4">ایمیل کاری</th>
                  <th className="p-4">وضعیت تایید صلاحیت</th>
                  <th className="p-4 text-center">عملیات ادمین</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-slate-50 transition">
                    <td className="p-4 flex items-center gap-3">
                      <img
                        src={teacher.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100'}
                        alt={teacher.name}
                        className="w-10 h-10 rounded-full border border-slate-200 object-cover"
                      />
                      <div>
                        <span className="font-extrabold text-slate-800 block">{teacher.name}</span>
                        <span className="text-[9px] text-indigo-600 font-semibold">استاد برنامه‌نویسی و فرانت‌اند</span>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-slate-600">{teacher.email}</td>
                    <td className="p-4">
                      {teacher.active ? (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 w-fit">
                          <Check size={12} />
                          تایید شده و فعال
                        </span>
                      ) : (
                        <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 w-fit animate-pulse">
                          <ShieldAlert size={12} />
                          در انتظار تایید ادمین
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        {teacher.active ? (
                          <button
                            onClick={() => onApproveTeacher(teacher.id, false)}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black rounded-xl transition shadow-sm"
                          >
                            لغو مجوز و غیرفعال‌سازی
                          </button>
                        ) : (
                          <button
                            onClick={() => onApproveTeacher(teacher.id, true)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-xl transition shadow-sm"
                          >
                            صدور مجوز و تایید صلاحیت
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteUser(teacher.id)}
                          className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition"
                          title="حذف حساب"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {teachers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400 font-medium">هیچ مدرسی در سیستم ثبت نام نکرده است.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Students Registry Overview */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">لیست کل هنرجویان پلتفرم</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">سیاهه کل دانش‌آموزانی که در سیستم ثبت‌نام کرده‌اند به همراه شناسه استاد راهنمای انتخاب شده.</p>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">هنرجو</th>
                  <th className="p-4">ایمیل</th>
                  <th className="p-4">استاد انتخابی</th>
                  <th className="p-4">سطح انتخابی</th>
                  <th className="p-4">وضعیت پذیرش</th>
                  <th className="p-4 text-center">عملیات ادمین</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => {
                  const teacherName = users.find(u => u.id === student.selectedTeacherId)?.name || 'ناشناخته';
                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 flex items-center gap-3">
                        <img
                          src={student.avatarUrl || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=100'}
                          alt={student.name}
                          className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                        />
                        <span className="font-bold text-slate-800">{student.name}</span>
                      </td>
                      <td className="p-4 font-mono text-slate-600">{student.email}</td>
                      <td className="p-4 font-bold text-slate-700">{teacherName}</td>
                      <td className="p-4 text-slate-500">
                        {student.level === 'beginner' && 'ابتدایی'}
                        {student.level === 'intermediate' && 'متوسطه'}
                        {student.level === 'advanced' && 'پیشرفته'}
                      </td>
                      <td className="p-4">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          student.statusByTeacher === 'accepted' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                            : student.statusByTeacher === 'pending'
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-rose-50 border-rose-200 text-rose-700'
                        }`}>
                          {student.statusByTeacher === 'accepted' && 'پذیرفته شده توسط استاد'}
                          {student.statusByTeacher === 'pending' && 'در انتظار تایید استاد'}
                          {student.statusByTeacher === 'rejected' && 'رد شده توسط استاد'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => onDeleteUser(student.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition inline-block mx-auto"
                          title="حذف حساب"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400 font-medium">هیچ دانش‌آموزی در سیستم ثبت نام نکرده است.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        ) : (
          <div className="space-y-6">
            {/* Settings Header / Sub-tabs */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-black text-slate-900">🛠️ پیکربندی و نگهداری پلتفرم کلاسی</h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">ابزارهای مدیریت ذخیره‌سازی، تهیه نسخه‌های پشتیبان هفتگی و ریست اضطراری پایگاه‌داده محلی.</p>
                </div>

                {/* Sub-tab switcher */}
                <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 w-full md:w-auto shrink-0" dir="rtl">
                  <button
                    id="settings-tab-danger"
                    onClick={() => setActiveSettingsTab('danger_zone')}
                    className={`flex-1 md:flex-none px-4 py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 ${
                      activeSettingsTab === 'danger_zone'
                        ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/10'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <AlertTriangle size={14} />
                    <span>منطقه خطر</span>
                  </button>

                  <button
                    id="settings-tab-backup"
                    onClick={() => setActiveSettingsTab('backup')}
                    className={`flex-1 md:flex-none px-4 py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 ${
                      activeSettingsTab === 'backup'
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/10'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Database size={14} />
                    <span>پشتیبان‌گیری</span>
                  </button>
                </div>
              </div>

              {/* Settings Tab Content */}
              <div className="mt-6">
                {activeSettingsTab === 'danger_zone' && (
                  <div className="space-y-4 max-w-2xl">
                    <div className="bg-rose-50 border border-rose-200 p-5 rounded-2xl flex gap-3.5">
                      <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600 shrink-0">
                        <AlertTriangle size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-rose-900">عملیات غیرقابل بازگشت سیستم</h4>
                        <p className="text-[10px] text-rose-700 font-semibold mt-1 leading-relaxed">
                          با زدن دکمه زیر، تمامی اطلاعات ذخیره شده در مرورگر شما شامل دوره‌ها، حساب‌های اساتید فعال، درس‌ها، تکالیف ارسال شده توسط هنرجویان و بازخوردهای هوش مصنوعی پاکسازی خواهند شد. پس از اتمام فرآیند، برنامه ریست شده و اطلاعات به حالت دمو و فرضی اولیه باز خواهند گشت.
                        </p>
                      </div>
                    </div>

                    <div className="p-5 border border-slate-200 rounded-2xl space-y-4 bg-slate-50">
                      <div>
                        <h4 className="text-xs font-black text-slate-800">پاک کردن کل حافظه اپلیکیشن و مرورگر</h4>
                        <p className="text-[9px] text-slate-500 font-semibold mt-0.5">پاکسازی کامل داده‌های پایگاه‌داده شبیه‌ساز (LocalStorage) برای شروع کارگاه یا ترم جدید کلاسی.</p>
                      </div>

                      <button
                        onClick={handleClearAllStorage}
                        className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition flex items-center gap-2 shadow-lg shadow-rose-900/10 active:scale-95 duration-200"
                      >
                        <Trash2 size={14} />
                        <span>پاک کردن کل داده‌ها و ریست سیستم</span>
                      </button>
                    </div>
                  </div>
                )}

                {activeSettingsTab === 'backup' && (
                  <div className="space-y-6 max-w-2xl">
                    <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-2xl flex gap-3.5">
                      <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                        <Database size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-indigo-900">حفاظت از اطلاعات آموزشی و تمرینی</h4>
                        <p className="text-[10px] text-indigo-700 font-semibold mt-1 leading-relaxed">
                          سیستم پشتیبان‌گیری به مدیر این امکان را می‌دهد تا فایل کامل تنظیمات، تکالیف ثبت شده و حساب کاربران را دانلود کند. شما در هر زمان می‌توانید این فایل را برای بازگرداندن داده‌ها روی همین مرورگر یا کامپیوتر دیگر بارگذاری نمایید.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Export Section */}
                      <div className="p-5 border border-slate-200 rounded-2xl space-y-4 flex flex-col justify-between">
                        <div className="space-y-1">
                          <h4 className="text-xs font-black text-slate-800 font-bold">تهیه نسخه پشتیبان (Export)</h4>
                          <p className="text-[9px] text-slate-500 font-semibold leading-relaxed">
                            دانلود داده‌های فعلی به صورت یک فایل با فرمت فشرده JSON بر روی دستگاه شما.
                          </p>
                        </div>

                        <button
                          onClick={handleExportBackup}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-indigo-950/10 active:scale-95 duration-200"
                        >
                          <Download size={14} />
                          <span>دانلود نسخه پشتیبان</span>
                        </button>
                      </div>

                      {/* Import Section */}
                      <div className="p-5 border border-slate-200 rounded-2xl space-y-4 flex flex-col justify-between">
                        <div className="space-y-1">
                          <h4 className="text-xs font-black text-slate-800 font-bold">بازیابی نسخه پشتیبان (Import)</h4>
                          <p className="text-[9px] text-slate-500 font-semibold leading-relaxed">
                            فایل پشتیبان JSON دانلود شده قبلی خود را برای بازگرداندن اطلاعات پلتفرم آپلود کنید.
                          </p>
                        </div>

                        <div>
                          <label className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer border border-slate-300">
                            <Upload size={14} />
                            <span>انتخاب فایل و بارگذاری</span>
                            <input
                              type="file"
                              accept=".json"
                              onChange={handleImportBackup}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
