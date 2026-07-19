import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

// Lazy initialize Gemini SDK client with a robust rotating Key Pool
interface GeminiKeyItem {
  key: string;
  envName: string;
  blacklistedUntil: number; // timestamp
}

let geminiKeyPool: GeminiKeyItem[] = [];
let isPoolInitialized = false;

function isValidGeminiKey(key: string | undefined): boolean {
  if (!key || typeof key !== "string") return false;
  const trimmed = key.trim();
  if (trimmed === "" || trimmed === "YOUR_GEMINI_API_KEY" || trimmed.startsWith("YOUR_") || trimmed === "placeholder") {
    return false;
  }
  return trimmed.length > 10;
}

function initKeyPool() {
  const discoveredKeys: GeminiKeyItem[] = [];
  const addedKeys = new Set<string>();

  const addKey = (key: string, envName: string) => {
    if (isValidGeminiKey(key)) {
      const trimmed = key.trim();
      if (!addedKeys.has(trimmed)) {
        addedKeys.add(trimmed);
        discoveredKeys.push({
          key: trimmed,
          envName,
          blacklistedUntil: 0
        });
      }
    }
  };

  // 1. Scan process.env for matching names (e.g., GEMINI_API_KEY, VITE_GOOGLE_GENAI_TOKEN, and indexed variants like VITE_GOOGLE_GENAI_TOKEN_1, _2 ... up to 500)
  for (const envName of Object.keys(process.env)) {
    if (
      /^(VITE_)?GOOGLE_GENAI_TOKEN(_\d+)?$/i.test(envName) ||
      /^(VITE_)?GEMINI_API_KEY(_\d+)?$/i.test(envName)
    ) {
      const val = process.env[envName];
      if (val) {
        addKey(val, envName);
      }
    }
  }

  // Deterministically sort so base keys (or lowest index) come first
  discoveredKeys.sort((a, b) => {
    const aHasUnderscore = a.envName.includes("_");
    const bHasUnderscore = b.envName.includes("_");
    if (aHasUnderscore && !bHasUnderscore) return 1;
    if (!aHasUnderscore && bHasUnderscore) return -1;
    return a.envName.localeCompare(b.envName, undefined, { numeric: true, sensitivity: "base" });
  });

  geminiKeyPool = discoveredKeys;
  isPoolInitialized = true;

  console.log(`[GeminiKeyPool] Initialized with ${geminiKeyPool.length} unique keys:`);
  geminiKeyPool.forEach((item, index) => {
    console.log(`  ${index + 1}. Name: ${item.envName} (Length: ${item.key.length})`);
  });
}

function getEffectiveGeminiKey(): string | undefined {
  if (!isPoolInitialized) {
    initKeyPool();
  }
  // Return any healthy key if possible, or any key in the pool to verify we have keys configured
  const healthy = geminiKeyPool.find(k => Date.now() >= k.blacklistedUntil);
  if (healthy) return healthy.key;
  if (geminiKeyPool.length > 0) return geminiKeyPool[0].key;
  return undefined;
}

let lastUsedIndex = -1;

function getNextHealthyKeyItem(): GeminiKeyItem {
  if (!isPoolInitialized) {
    initKeyPool();
  }

  const now = Date.now();
  const healthyKeys = geminiKeyPool.filter(item => now >= item.blacklistedUntil);
  
  if (healthyKeys.length === 0) {
    console.warn("[GeminiKeyPool] Warning: All keys are currently blacklisted. Temporarily ignoring blacklist to keep system functional.");
    if (geminiKeyPool.length === 0) {
      throw new Error("No Gemini keys found in environment variables. Please set GEMINI_API_KEY or GOOGLE_GENAI_TOKEN.");
    }
    // Return the oldest blacklisted key (closest to recovery)
    const sortedByRecovery = [...geminiKeyPool].sort((a, b) => a.blacklistedUntil - b.blacklistedUntil);
    return sortedByRecovery[0];
  }

  lastUsedIndex = (lastUsedIndex + 1) % healthyKeys.length;
  return healthyKeys[lastUsedIndex];
}

async function executeWithGeminiPool<T>(
  operation: (client: GoogleGenAI, keyName: string) => Promise<T>,
  maxRetries = 5
): Promise<T> {
  if (!isPoolInitialized) {
    initKeyPool();
  }

  if (geminiKeyPool.length === 0) {
    throw new Error("No Gemini keys configured in environment variables.");
  }

  let attempt = 0;
  const attemptedKeys = new Set<string>();

  // Try up to math.min(maxRetries, totalUniqueKeys)
  const maxAttempts = Math.max(1, Math.min(maxRetries, geminiKeyPool.length));

  while (attempt < maxAttempts) {
    attempt++;
    const keyItem = getNextHealthyKeyItem();
    attemptedKeys.add(keyItem.key);

    console.log(`[GeminiKeyPool] Attempt ${attempt}/${maxAttempts}: Using key from ${keyItem.envName} (Length: ${keyItem.key.length})`);

    const baseUrl = process.env.GEMINI_BASE_URL || process.env.GEMINI_PROXY_URL || process.env.VITE_GEMINI_BASE_URL;
    const clientOptions: any = {
      apiKey: keyItem.key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    };
    if (baseUrl) {
      clientOptions.baseUrl = baseUrl;
      console.log(`[GeminiKeyPool] Route requests through custom baseUrl proxy: ${baseUrl}`);
    }

    const client = new GoogleGenAI(clientOptions);

    try {
      const result = await operation(client, keyItem.envName);
      return result;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const statusCode = error?.status || error?.statusCode || 0;
      
      console.error(`[GeminiKeyPool] Error with key ${keyItem.envName}:`, errorMessage, `Status: ${statusCode}`);

      // Blacklist key temporarily (e.g. for 5 minutes)
      const cooldownMinutes = 5;
      keyItem.blacklistedUntil = Date.now() + cooldownMinutes * 60 * 1000;
      console.warn(`[GeminiKeyPool] Key ${keyItem.envName} blacklisted for ${cooldownMinutes} minutes.`);

      if (attempt >= maxAttempts) {
        throw error; // throw error if all attempts exhausted
      }
    }
  }

  throw new Error("All attempted Gemini API keys failed.");
}

function getGeminiClient(): GoogleGenAI {
  const key = getEffectiveGeminiKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not defined or is an invalid placeholder.");
  }
  const baseUrl = process.env.GEMINI_BASE_URL || process.env.GEMINI_PROXY_URL || process.env.VITE_GEMINI_BASE_URL;
  const clientOptions: any = {
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  };
  if (baseUrl) {
    clientOptions.baseUrl = baseUrl;
  }
  return new GoogleGenAI(clientOptions);
}

const app = express();
const PORT = 3000;

// Middleware to support larger payloads for base64 image simulations
app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));

  // --- API Routes ---

  // --- Helper Simulators for robust testing when GEMINI_API_KEY is not configured ---

  function getSimulatedAiReview(lesson: any, studentName: string, answers: any[]): { grade: number; teacherFeedback: string; studentFeedback: string } {
    const totalMaxPoints = lesson?.questions?.reduce((sum: number, q: any) => sum + q.points, 0) || 100;
    let score = 0;
    let feedbackItems: string[] = [];

    const answersList = Array.isArray(answers) ? answers : [];

    lesson?.questions?.forEach((question: any) => {
      const ans = answersList.find((a: any) => a.questionId === question.id);
      const qPoints = question?.points || 20;
      const val = (ans?.value || '').trim();

      if (!val) {
        feedbackItems.push(`❌ **${question?.title || 'سوال'}**: متأسفانه پاسخی برای این چالش ارسال نشده است. (0 از ${qPoints} امتیاز)`);
      } else if (question.answerType === 'code_editor') {
        let qScore = Math.round(qPoints * 0.5); // base score if answered
        let codeFeedback = '';

        if (val.includes('hover:') || val.includes('transition') || val.includes('duration-')) {
          qScore = Math.round(qPoints * 0.95);
          codeFeedback = `طراحی و پیاده‌سازی دکمه کارت هوشمند شما فوق‌العاده زیباست! استفاده هوشمندانه و اصولی از افکت‌های تعاملی \`hover:\` و ترنزیشن‌های نرم (\`duration-300\`) نشان از ذوق هنری و درک فنی قوی شما دارد.`;
        } else {
          qScore = Math.round(qPoints * 0.65);
          codeFeedback = `کدهای ارسالی شما کاملاً اجرا می‌شوند و پایه کار درست است، اما برای رسیدن به استانداردهای طراحی مدرن و جلب رضایت کاربر، نیاز به روح بخشیدن به دکمه‌ها داریم. به شدت توصیه می‌کنم کلاس‌های تعاملی مانند \`transition-all\` و افکت‌های هاور مثل \`hover:scale-105\` را اضافه کنید تا دکمه شما درخشان‌تر شود.`;
        }
        score += qScore;
        feedbackItems.push(`💻 **${question?.title || 'چالش کدنویسی'}**:\n${codeFeedback} (${qScore} از ${qPoints} امتیاز)`);
      } else if (question.answerType === 'text') {
        let qScore = Math.round(qPoints * 0.6);
        let textFeedback = '';

        if (val.length > 40) {
          qScore = Math.round(qPoints * 0.95);
          textFeedback = `تحلیل و توضیحات شما بسیار عمیق، علمی و شگفت‌انگیز بود. به درستی و با تسلط کامل اهمیت توازن بصری، فضای منفی و فاصله‌دهی‌های اصولی (gap) را تشریح کرده‌اید که نشان از درک عمیق شما از درس دارد.`;
        } else {
          qScore = Math.round(qPoints * 0.75);
          textFeedback = `پاسخ شما درست است. اما برای درک عمیق‌تر، خوب است دلایل فنی بیشتری در مورد چگونگی توازن بصری و اهمیت فضای منفی در طراحی‌های بزرگ‌تر بنویسید.`;
        }
        score += qScore;
        feedbackItems.push(`📝 **${question?.title || 'چالش تشریحی'}**:\n${textFeedback} (${qScore} از ${qPoints} امتیاز)`);
      } else {
        const qScore = Math.round(qPoints * 0.85);
        score += qScore;
        feedbackItems.push(`🎨 **${question?.title || 'چالش تعاملی'}**: تلاش خلاقانه و ارسال پاسخ شما با موفقیت ارزیابی شد. ساختار و ارائه‌تان تمیز و در سطح استانداردهای مربی است. (${qScore} از ${qPoints} امتیاز)`);
      }
    });

    const finalGrade = Math.min(totalMaxPoints, Math.max(0, score));
    const successPercentage = Math.round((finalGrade / totalMaxPoints) * 100);

    let summaryForTeacher = `### 📋 گزارش تحلیلی دستیار مربی ارشد کلاسی\n\n`;
    summaryForTeacher += `ارزیابی فنی برای هنرجو **${studentName}** در درس «**${lesson?.title || 'درس انتخابی'}**»:\n\n`;
    summaryForTeacher += `#### 📊 تحلیل نمرات و ملاک ارزیابی:\n`;
    summaryForTeacher += `* **امتیاز کل**: **${finalGrade}** از **${totalMaxPoints}** امتیاز (${successPercentage}% موفقیت)\n`;
    summaryForTeacher += `* **وضعیت هنرجو**: ${successPercentage >= 90 ? 'بسیار عالی و مسلط' : successPercentage >= 70 ? 'خوب با نیاز به تمرین ترنزیشن‌ها' : 'ضعیف با نیاز به بازخوانی اصول طراحی'}\n\n`;
    summaryForTeacher += `#### 🔍 بررسی سوال به سوال پاسخ‌های ارسالی:\n`;
    summaryForTeacher += feedbackItems.map(item => `* ${item}`).join('\n');
    summaryForTeacher += `\n\n💡 **توصیه پداگوژیک برای مدرس کلاس**: هنرجو تلاش مناسبی داشته است. بهتر است در ثبت بازخورد نهایی، توجه ویژه‌ای به تسلط ایشان بر ترنزیشن‌ها و فضاهای منفی داشته باشید و تشویق کنید که بازبینی را انجام دهند.`;

    let summaryForStudent = `### 💡 راهنمای گام‌به‌گام ارتقای پاسخ دستیار هوشمند\n\n`;
    summaryForStudent += `سلام **${studentName}** عزیز! تکالیف زیبای تو را برای درس «**${lesson?.title || 'درس انتخابی'}**» ارزیابی کردم. تلاش و ذوقت تحسین‌برانگیز است! 🌟\n\n`;
    summaryForStudent += `نمره ارزیابی اولیه تخمینی شما: **${finalGrade}** از **${totalMaxPoints}** است. برای ارتقای این نمره به ۱۰۰، پیشنهاد می‌کنم موارد زیر را با دقت بررسی کنی:\n\n`;
    
    answersList.forEach((ans: any) => {
      const question = lesson?.questions?.find((q: any) => q.id === ans.questionId);
      if (question) {
        if (question.answerType === 'code_editor') {
          const val = (ans?.value || '').trim();
          if (!(val.includes('hover:') || val.includes('transition') || val.includes('duration-'))) {
            summaryForStudent += `💻 **در چالش کدنویسی (${question.title})**:\nکد شما به خوبی نوشته شده است اما کمی بی روح است! پیشنهاد می‌کنم سری به **بخش تعاملی متن درس** بزنی و افکت‌های زیبای هاور مانند \`hover:scale-105\` و ترنزیشن‌های انیمیشن را اضافه کنی تا دکمه زنده شود. 😍\n\n`;
          } else {
            summaryForStudent += `💻 **در چالش کدنویسی (${question.title})**:\nپیاده‌سازی هاور و ترنزیشن‌ها عالی است! کار شما بسیار تمیز است.\n\n`;
          }
        } else if (question.answerType === 'text') {
          const val = (ans?.value || '').trim();
          if (val.length <= 40) {
            summaryForStudent += `📝 **در چالش تشریحی (${question.title})**:\nپاسخ شما درست است اما برای نمره کامل، لطفاً دلایل عمیق‌تری را بیان کن. پیشنهاد می‌کنم بخش **اصول توازن بصری و اهمیت فضای منفی در درس** را مرور کنی و توضیحات بیشتری اضافه کنی. 😉\n\n`;
          } else {
            summaryForStudent += `📝 **در چالش تشریحی (${question.title})**:\nتحلیل شما فوق‌العاده و دقیق است!\n\n`;
          }
        }
      }
    });

    summaryForStudent += `✨ **گام بعدی**: با استفاده از دکمه زیر می‌توانید پاسخ‌های خود را طبق این راهنما ویرایش کرده و مجدداً ارسال کنید تا کارنامه نهایی شما توسط استاد صادر شود! موفق باشی.`;

    return { grade: finalGrade, teacherFeedback: summaryForTeacher, studentFeedback: summaryForStudent };
  }

  function getSimulatedAiChat(lesson: any, currentCode: string, messages: any[], lastSubmission?: any, lessonContentPassed?: string): string {
    const lastUserMessage = messages[messages.length - 1]?.content || "";
    const lastUserMessageLower = lastUserMessage.toLowerCase();
    const lessonTitle = lesson?.title || "طراحی رابط کاربری";
    const lessonContent = lessonContentPassed || lesson?.content || "";

    // 1. Clean stop words for matching
    const stopWords = [
      "این", "آن", "من", "تو", "او", "ما", "شما", "آنها", "در", "به", "با", "از", "تا", "رو", "را", "که", 
      "برای", "است", "هست", "بود", "شد", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده", 
      "چی", "چه", "چرا", "چطور", "چگونه", "کدام", "کی", "کجا", "بخش", "قسمت", "کامل", "کل", "درس", "برایم", 
      "برام", "توضیح", "تشریح", "بگو", "مبهمه", "کنید", "دارد", "کرد", "کردی", "کند", "شما", "مربی", "دوست", "طراحی"
    ];

    const cleanAndTokenize = (text: string): string[] => {
      const normalized = text
        .toLowerCase()
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[؟\.\?\,\!\:\-\_\(\)\[\]\{\}\*\"\'\`\>\n\r]/g, " ");
      const words = normalized.split(/\s+/).filter(w => w.length > 1);
      return words.filter(w => !stopWords.includes(w));
    };

    const queryTokens = cleanAndTokenize(lastUserMessage);

    // 2. Parse lesson content dynamically into sections based on markdown headers
    const lines = lessonContent.split("\n");
    interface LessonSection {
      header: string;
      body: string;
    }
    const sections: LessonSection[] = [];
    let currentHeader = "مقدمه درس";
    let currentBodyLines: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith("#")) {
        if (currentBodyLines.length > 0) {
          sections.push({
            header: currentHeader,
            body: currentBodyLines.join("\n").trim()
          });
        }
        currentHeader = line.replace(/^[#\s]+/, "").trim();
        currentBodyLines = [];
      } else {
        currentBodyLines.push(line);
      }
    }
    if (currentBodyLines.length > 0 || currentHeader) {
      sections.push({
        header: currentHeader,
        body: currentBodyLines.join("\n").trim()
      });
    }

    // 3. Helper to dynamically summarize the whole lesson
    const summarizeWholeLesson = (): string => {
      const introSection = sections.find(s => s.header === "مقدمه درس" || s.header.includes(lessonTitle));
      let introText = introSection ? introSection.body : "";
      if (!introText && sections.length > 0) {
        introText = sections[0].body;
      }
      
      const concepts = sections
        .filter(s => s.header !== "مقدمه درس" && !s.header.includes(lessonTitle))
        .map((s, idx) => `${idx + 1}. **${s.header}**: ${s.body.split("\n")[0].replace(/[#\s\*]+/g, " ").trim()}`)
        .filter(line => line.length > 5)
        .slice(0, 4)
        .join("\n");

      // Find any HTML code block in the lesson
      const codeBlockMatch = lessonContent.match(/```html([\s\S]*?)```/);
      const codeSnippet = codeBlockMatch ? codeBlockMatch[1].trim() : "";

      let summary = `درس **«${lessonTitle}»** مستقیماً مفاهیم زیر را آموزش می‌دهد:\n\n`;
      if (introText) {
        summary += `**هدف اصلی درس**: ${introText.split("\n")[0].replace(/[#\s\*]+/g, " ").trim()}\n\n`;
      }
      if (concepts) {
        summary += `**بخش‌ها و مفاهیم کلیدی آموزش داده شده**:\n${concepts}\n\n`;
      }
      if (codeSnippet) {
        summary += `**کد نمونه کلیدی درس**:\n\`\`\`html\n${codeSnippet}\n\`\`\`\n\n`;
      }
      summary += `توصیه می‌شود بخش‌های مرتبط را در ستون سمت راست به صورت کامل مرور کرده و چالش‌های تب بعدی را حل کنید. کدام بخش نیاز به تشریح بیشتر دارد؟`;
      return summary;
    };

    // 4. Detect if asking to explain the whole lesson or generic summary
    const isAskingToExplainWholeLesson = 
      lastUserMessageLower.includes("کل درس") || 
      lastUserMessageLower.includes("مفهوم این درس") || 
      lastUserMessageLower.includes("این درس چیه") || 
      lastUserMessageLower.includes("تشریح درس") || 
      lastUserMessageLower.includes("درس چیه") || 
      lastUserMessageLower.includes("خلاصه") || 
      lastUserMessageLower.includes("به چه دردی") || 
      lastUserMessageLower.includes("چه فایده") || 
      lastUserMessageLower.includes("هدف") ||
      lastUserMessageLower.includes("موضوع");

    if (isAskingToExplainWholeLesson || queryTokens.length === 0) {
      return summarizeWholeLesson();
    }

    // 5. Find the best matching section based on keyword match
    let bestSection: LessonSection | null = null;
    let highestScore = 0;

    for (const sec of sections) {
      const headerTokens = cleanAndTokenize(sec.header);
      const bodyTokens = cleanAndTokenize(sec.body);
      let score = 0;
      for (const t of queryTokens) {
        if (headerTokens.includes(t)) score += 3;
        if (bodyTokens.includes(t)) score += 1;
      }
      if (score > highestScore) {
        highestScore = score;
        bestSection = sec;
      }
    }

    if (bestSection && highestScore > 0) {
      return `### 💡 بخش «${bestSection.header}» از درس‌نامه:\n\n${bestSection.body}\n\n*امیدوارم این بخش به سوال شما پاسخ داده باشد. باز هم سوالی دارید بپرسید!*`;
    }

    if (lastUserMessageLower.includes('کد') || lastUserMessageLower.includes('editor') || lastUserMessageLower.includes('خطا') || lastUserMessageLower.includes('اشتباه') || lastUserMessageLower.includes('چرا') || lastUserMessageLower.includes('نمره')) {
      if (lastSubmission && lastSubmission.grade < lastSubmission.maxPoints * 0.85) {
        return `در بررسی کد شما برای چالش‌های درس **«${lessonTitle}»**، نمره کامل کسب نشده است زیرا برخی موارد مانند توازن فواصل یا افکت‌های تعاملی دکمه‌ها نادیده گرفته شده‌اند.
پیشنهاد می‌کنم ابتدا فواصل عناصر (مانند padding و gap) را بر اساس متن درس بررسی کرده و کلاس‌های ترنزیشن تعاملی (\`transition-all duration-300\`) را به دکمه اضافه کنید. سپس دوباره پاسخ خود را ثبت کنید.`;
      }
      return `برای بهینه‌سازی کدهای این درس، ساختار تگ‌ها و کلاس‌های Tailwind را با اصول مطرح‌شده در بخش تئوری (سمت راست) تطبیق دهید. هر خطایی در کنسول یا نمایشگر دارید، ارسال کنید تا مستقیم بررسی کنیم.`;
    }

    if (lastUserMessageLower.includes('سلام') || lastUserMessageLower.includes('hello') || lastUserMessageLower.includes('درود') || lastUserMessageLower.includes('hi')) {
      return `سلام. من مربی هوش مصنوعی شما هستم. آماده‌ام تا مباحث و مفاهیم درس **«${lessonTitle}»** را به صورت دقیق، تخصصی و مستقیم تشریح کنم. هر کجای درس یا کدها برایتان ابهام دارد مطرح کنید تا بدون حاشیه آن را بررسی کنیم.`;
    }

    // 7. General fallback: return the summarized whole lesson instead of a generic canned reply
    return summarizeWholeLesson();
  }

  function getSimulatedGeneratedLesson(topic: string, gradeLevel: string): any {
    const formattedTopic = topic.trim();
    return {
      title: `آموزش جامع و کاربردی: ${formattedTopic}`,
      category: "طراحی رابط کاربری (UI)",
      level: gradeLevel || "متوسط",
      content: `### 📚 به درسِ عمیق و کاربردی «**${formattedTopic}**» خوش آمدید!

در این درس یاد می‌گیریم که چطور با استفاده از ابزارها و استانداردهای نوین فرانت‌اند و فریم‌ورک قدرتمند Tailwind CSS، رابط کاربری فوق‌العاده زیبا و واکنش‌گرا برای **${formattedTopic}** بسازیم.

#### 🎯 مفاهیم کلیدی و تئوری درس:
1. **توازن بصری و فضای منفی (Visual Balance & Negative Space)**:
   فضای منفی یا خالی، یکی از ارکان اصلی در طراحی مدرن است. استفاده از کلاس‌های فاصله‌دهی مانند \`gap-6\` یا \`space-y-4\` باعث می‌شود عناصر صفحه به زیبایی نفس بکشند و ذهن کاربر خسته نشود.
2. **افکت‌های تعاملی و ترنزیشن‌ها (Interactive Effects & Transitions)**:
   برای ایجاد حس پویایی و زنده بودن در دکمه‌ها و عناصر تعاملی، همواره از ترکیب کلاس‌های \`transition-all\`، \`duration-300\` و افکت‌های هاور مانند \`hover:scale-105\` یا \`hover:shadow-lg\` استفاده کنید. این جزئیات کوچک تفاوت بین یک طرح معمولی و یک اثر حرفه‌ای را رقم می‌زنند.

---

#### 💻 نمونه کد عملی برای شروع کار:
\`\`\`html
<div class="p-6 bg-white rounded-2xl shadow-md border border-slate-100 max-w-md mx-auto hover:border-indigo-200 transition-all duration-300">
  <h2 class="text-lg font-bold text-slate-900 tracking-tight mb-2">کارت هوشمند درس</h2>
  <p class="text-xs text-slate-500 leading-relaxed mb-4">
    این یک کارت شیک با توازن بصری فوق‌العاده است که آماده دریافت کدهای تعاملی شماست.
  </p>
  <button class="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg hover:shadow-indigo-500/20 hover:scale-[1.02] transition-all duration-300">
    تکمیل چالش کلاس
  </button>
</div>
\`\`\`

---

#### 💡 راهنمای استفاده از هوش مصنوعی برای کد زدن:
برای اینکه بتوانید بهترین بهره را از مربی هوش مصنوعی کلاس ببرید:
- سوالات خود را به زبان ساده بپرسید.
- کدهای اولیه را در ادیتور بنویسید و از او بخواهید استایل آن را بررسی کند.
- هر زمان در استایل‌دهی دکمه‌ها یا چیدمان گریدها به مشکل خوردید، مربی دلسوز شما اینجاست تا راهنمایی‌تان کند.`,
      questions: [
        {
          id: "q_code_" + Date.now(),
          title: "چالش طراحی دکمه کارت هوشمند تعاملی",
          description: "در ادیتور زیر، دکمه کارت هوشمندی طراحی کنید که دارای گرادینت پس‌زمینه پویا، انیمیشن تغییر مقیاس در حالت هاور (hover:scale)، سایه مناسب و افکت ترنزیشن نرم (transition-all duration-300) باشد تا جان تازه‌ای به رابط کاربری بدهد.",
          answerType: "code_editor",
          starterCode: `<button class="px-6 py-2.5 bg-indigo-600 text-white rounded-lg">
  دکمه ساده من
</button>`,
          points: 50
        },
        {
          id: "q_text_" + Date.now(),
          title: "چالش تشریحی: اهمیت توازن بصری و فضای منفی",
          description: "به زبان ساده تحلیل کنید که چگونه استفاده از فضای خالی (Negative Space) و کلاس‌های فاصله‌دهی (مانند gap و padding) به توازن بصری صفحات وب کمک کرده و خوانایی مطالب را افزایش می‌دهد.",
          answerType: "text",
          points: 50
        }
      ]
    };
  }

  function getSimulatedPeerReview(currentLesson: any): string {
    return `### 🌟 گزارش ارزیابی همتای هوش مصنوعی (AI Peer Review)

**وضعیت کلی درس**: ⭐⭐⭐⭐ **بسیار خوب و استاندارد**

با بررسی دقیق درس‌نامه و چالش‌های طراحی شده برای درس «**${currentLesson?.title || "درس فعلی"}**»، موارد زیر گزارش می‌شود:

#### 1. کیفیت محتوا و درس‌نامه:
- متن درس بسیار روان، علمی و با ساختاری کاملاً مهندسی نگارش شده است.
- مفاهیم مهم فرانت‌اند نظیر توازن بصری، فضای منفی و استایل‌های زنده به خوبی پوشش داده شده‌اند.

#### 2. تناسب چالش‌ها با سطح درس:
- چالش‌های طراحی شده (به خصوص چالش کدنویسی) کاملاً هماهنگ با اهداف یادگیری است و مهارت‌های حل مسئله دانش‌آموز را به خوبی به کار می‌گیرد.

#### 3. پیشنهاداتی جهت ارتقای بیشتر:
- برای افزایش جذابیت بصری، می‌توانید تصاویر آموزشی بیشتری به صورت شبیه‌سازی یا نمودار اضافه کنید.
- اضافه کردن یک چالش صوتی یا تصویری خلاقانه نیز می‌تواند یادگیری را لذت‌بخش‌تر کند.

از زحمات ارزشمند شما برای طراحی این درس سپاسگزاریم! شما یک مربی دلسوز و حرفه‌ای هستید. ❤️`;
  }

  function getSimulatedCourseReview(course: any): string {
    return `### 🌟 گزارش ارزیابی برنامه درسی هوش مصنوعی (Syllabus & Course Review)

**وضعیت کلی دوره**: 🌟🌟🌟🌟🌟 **عالی و منسجم**

دوره آموزشی «**${course?.title || "دوره فعلی"}**» با سرفصل‌های منسجم و رویکردی مهندسی‌شده طراحی شده است. گزارش ارزیابی ساختاری به شرح زیر است:

#### 1. انسجام سرفصل‌ها و همبستگی دروس:
- سیر آموزشی دوره بسیار منطقی است. درس‌ها پله‌پله از سطوح ساده به مفاهیم پیشرفته و چالش‌های تعاملی حرکت می‌کنند.
- تفکیک مطالب و دسته‌بندی موضوعی کاملاً استاندارد است.

#### 2. تنوع و کاربردی بودن تکالیف:
- استفاده از روش‌های متنوع ثبت تکلیف (کدنویسی، ضبط صدا، ارسال عکس یادداشت دستی و آدرس پروژه) یکی از بزرگ‌ترین نقاط قوت این دوره است که انگیزه یادگیری را دوچندان می‌کند.

#### 3. پیشنهادات تکمیلی برای ارتقای دوره:
- **درس پیشنهادی 1**: *طراحی پیشرفته انیمیشن‌ها با Motion (سایه‌ها، هاور کارت‌ها و ترنزیشن‌های تعاملی)*
- **درس پیشنهادی 2**: *استفاده از هوش مصنوعی مولد در تسریع کدنویسی و دیباگ هوشمند خطاهای Tailwind*

تلاش و سلیقه شما در طراحی این دوره بی‌نظیر است. خسته نباشید! 🎓✨`;
  }

  // 1. Live status check
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // 1.5. Secure & Smart Gemini API Reverse Proxy Route (for local clients & distributed routing)
  app.all("/api/ai/proxy*", async (req, res) => {
    try {
      const prefix = "/api/ai/proxy";
      let subPath = req.originalUrl || req.url;
      if (subPath.startsWith(prefix)) {
        subPath = subPath.slice(prefix.length);
      }
      if (!subPath.startsWith("/")) {
        subPath = "/" + subPath;
      }

      // If they call the base endpoint without subPath, return a helpful status
      if (subPath === "/" || subPath === "") {
        return res.json({
          status: "active",
          service: "Lumina Academy Gemini Proxy Gateway",
          availableKeys: geminiKeyPool.length,
          timestamp: new Date().toISOString()
        });
      }

      const targetUrl = `https://generativelanguage.googleapis.com${subPath}`;
      console.log(`[Gemini Proxy] Forwarding request to: ${targetUrl}`);

      // Copy headers, avoiding host/connection mismatches
      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (!val) continue;
        const lowerKey = key.toLowerCase();
        if (
          lowerKey === "host" ||
          lowerKey === "connection" ||
          lowerKey === "content-length" ||
          lowerKey === "accept-encoding"
        ) {
          continue;
        }
        if (Array.isArray(val)) {
          val.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, val as string);
        }
      }

      // Check if the request contains an API key
      let hasApiKey = headers.has("x-goog-api-key") || req.query.key;
      if (!hasApiKey) {
        // If not sent, dynamically supply a healthy key from our key pool!
        const healthyKey = getEffectiveGeminiKey();
        if (healthyKey) {
          headers.set("x-goog-api-key", healthyKey);
          console.log("[Gemini Proxy] Key omitted by client. Injected healthy key from server Key Pool.");
        }
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        if (req.body && Object.keys(req.body).length > 0) {
          fetchOptions.body = JSON.stringify(req.body);
          headers.set("Content-Type", "application/json");
        }
      }

      const response = await fetch(targetUrl, fetchOptions);

      // Set the response status
      res.status(response.status);

      // Copy response headers (excluding chunked / compress mismatch headers)
      response.headers.forEach((value, name) => {
        const lowerName = name.toLowerCase();
        if (
          lowerName !== "transfer-encoding" &&
          lowerName !== "content-encoding" &&
          lowerName !== "connection"
        ) {
          res.setHeader(name, value);
        }
      });

      // Stream the response body back
      const responseBody = await response.arrayBuffer();
      res.send(Buffer.from(responseBody));
    } catch (error: any) {
      console.error("[Gemini Proxy] Error proxying request:", error);
      res.status(500).json({
        error: "Gemini Proxy Error",
        message: error.message || String(error)
      });
    }
  });

  // 2. AI Code & Submission Review
  app.post("/api/ai/review", async (req, res) => {
    try {
      const { lesson, studentName, answers } = req.body;
      if (!lesson || !answers) {
        return res.status(400).json({ error: "اطلاعات درس و پاسخ‌ها الزامی است." });
      }

      // 1. If key is missing or is placeholder, return error
      const activeKey = getEffectiveGeminiKey();
      if (!activeKey) {
        console.warn("GEMINI_API_KEY is missing or invalid. Rejecting request.");
        return res.status(503).json({
          error: "برقراری ارتباط با سرویس ارزیابی هوشمند مقدور نمی‌باشد. لطفاً اتصال به سرور یا کلید ارتباطی (API) مربوطه را بررسی نمایید."
        });
      }

      // 2. Attempt real Gemini call
      try {
        const formattedAnswers = answers.map((ans: any) => {
          const question = lesson.questions?.find((q: any) => q.id === ans.questionId);
          const questionText = question ? `${question.title}: ${question.description}` : "سوال ناشناخته";
          return `
سوال: ${questionText}
روش پاسخ تعیین شده: ${ans.answerType}
پاسخ دانش‌آموز:
${ans.value}
-------------------------`;
        }).join("\n");

        const maxPoints = lesson.questions?.reduce((sum: number, q: any) => sum + q.points, 0) || 100;

        const prompt = `
تو یک ارزیاب آموزشی هوشمند و دستیار ارشدِ آموزشی (Multi-layer Educational Evaluator) با بیش از ۱۵ سال تجربه تدریس، روان‌شناسی یادگیری و طراحی سرفصل‌های آموزشی در معتبرترین مراکز دانشگاهی و علمی جهان هستی. وظیفه تو تحلیل عمیق، سنجش موشکافانه و ارائه تشخیص آموزشی برای پاسخ‌های ارسالی دانشجو به نام "${studentName}" برای درس "${lesson.title}" است. 

این درس محدود به یک حوزه خاص مانند برنامه‌نویسی نیست و می‌تواند شامل موضوعات ریاضی، فیزیک، علوم انسانی، زیست‌شناسی، هنر یا هر شاخه علمی دیگری باشد. تو باید تحلیل خود را کاملاً عمومی و منطبق بر ماهیت علمی همین درس پیش ببری.

محتوای درس‌نامه ارائه شده به دانشجو:
${lesson.content}

پاسخ‌های ثبت‌شده و ارسالی دانشجو:
${formattedAnswers}

امتیاز کل تعریف‌شده برای سوالات این درس: ${maxPoints}

تو باید ارزیابی خود را در چند لایه مجزا و به ترتیب زیر انجام دهی تا دقیق‌ترین و منصفانه‌ترین خروجی حاصل شود:

مرحله ۱: تحلیل درون‌برنامه‌ای هدف آموزشی (Internal Goal Analysis)
- هدف آموزشی غایی این درس چیست؟ مهارت یا مفهوم کلیدی که دانشجو باید به دست می‌آورد چه بوده است؟
- سطح انتظار درس را بر اساس مباحث مطرح شده بسنج (دانشجوی مبتدی را با استانداردهای یک متخصص تراز اول نسنج، اما مفاهیم بنیادین را هم ساده نگیر).

مرحله ۲: ارزیابی سخت‌گیرانه و منصفانه (Strict Rubric-based Scoring)
جهت جلوگیری از پدیده «مهربانی بیش از حد و کاذب هوش مصنوعی» و ممانعت از تورم نمرات، نمره نهایی دانشجو را بر اساس یک سیستم دقیق سنجش (Rubric) از ۱۰۰ محاسبه کن. تشویق تلاش دانشجو باید در متن بازخورد اتفاق بیفتد، نه در افزایش غیرواقعی نمره. پاسخ‌های ناقص یا اشتباه باید کسر نمره واقعی داشته باشند.
تقسیم‌بندی امتیازات بر پایه معیارهای زیر است:
۱. درک مفاهیم کلیدی درس (Concept Understanding): حداکثر ۲۵ امتیاز (آیا مفهوم علمی پشت چالش را درک کرده است؟)
۲. صحت علمی، دقت منطقی و پیاده‌سازی پاسخ (Scientific/Technical Implementation): حداکثر ۳۵ امتیاز (آیا پاسخ به درستی کار می‌کند یا از نظر علمی دقیق و بی‌نقص است؟)
۳. کیفیت بیان، کیفیت استدلال و مستندسازی (Quality of Work & Reasoning): حداکثر ۲۰ امتیاز (آیا پاسخ با جزئیات کافی، منظم و با استدلال قوی ارائه شده است؟)
۴. تلاش، نوآوری و تفکر خلاق (Creativity, Initiative & Effort): حداکثر ۱۰ امتیاز (آیا فراتر از انتظار حداقلی تلاش کرده یا خلاقیت نشان داده است؟)
۵. تکمیل بودن تمام بخش‌های چالش (Completion of Tasks): حداکثر ۱۰ امتیاز (آیا به تمام سوالات و بخش‌های خواسته‌شده پاسخ کامل داده است؟)
نمره نهایی (Grade): مجموع امتیازهای بالا (عددی بین 0 تا 100).

مرحله ۳: تشخیص آموزشی (Learning Diagnosis)
- نقاط قوت علمی دانشجو در این پاسخ‌ها چیست؟
- نقاط ضعف بنیادین یا خطاهای جزئی او کجاست؟ (تشخیص بده که آیا اشتباه دانشجو ناشی از عدم درک مفهوم است یا یک خطای سهوی در اجرا).
- گام آموزشی بعدی پیشنهادی برای رشد بیشتر دانشجو چیست؟

مرحله ۴: تدوین بازخورد تخصصی برای مدرس (Teacher Feedback)
این بخش یک سند رسمی و به شدت تحلیلی است تا به مدرس در تصمیم‌گیری و هدایت دانشجو کمک کند. لحن آن باید کاملاً حرفه‌ای، دانشگاهی، عمیق و تخصصی باشد.
بخش‌های الزامی در مارک‌داونِ بازخورد مدرس:
- **خلاصه ارزیابی و سطح علمی تخمینی دانشجو** (مبتدی، متوسط، پیشرفته)
- **میزان اطمینان ارزیابی هوشمند (Confidence Score)** از 0 تا 1 (بر اساس کامل بودن پاسخ‌ها)
- **جدول بارم‌بندی و ریز نمرات بر اساس سنجه‌های ارزیابی (Rubric)**
- **تحلیل موشکافانه پاسخ‌ها** به همراه تشخیص اشتباهات مفهومی یا اجرایی
- **پیشنهادهای آموزشی طلایی به مدرس** برای چگونگی برخورد با نقاط ضعف دانشجو

مرحله ۵: تدوین بازخورد انگیزشی و سرنخ‌محور برای دانشجو (Student Feedback)
این بخش به عنوان مربی همراه، انگیزه‌بخش و دلسوز صادر می‌شود.
- لحن: فوق‌العاده صمیمی، دلگرم‌کننده، محترمانه و ترغیب‌کننده.
- قوانین حیاتی: به هیچ وجه پاسخ نهایی، حل‌المسائل یا جواب‌های مستقیم را لو نده! هدف بیدار کردن ذهن دانشجو است. تلاش او را صمیمانه تحسین کن. برای اصلاح اشتباهات، سرنخ‌های گام‌به‌گام (Progressive Hints)، تشبیه‌های ساده روزمره و سوالات تفکربرانگیز بپرس تا خودش به پاسخ درست برسد. او را مستقیماً ارجاع بده که به کدام بخش از متن درس‌نامه بازگردد.

قوانین زبان فارسی و نگارش:
- از جملات کوتاه، زنده، طبیعی و متناسب با ادبیات اساتید باسابقه فارسی‌زبان استفاده کن.
- به هیچ عنوان از عبارات کلیشه‌ای هوش مصنوعی مانند "به عنوان یک هوش مصنوعی..."، "لازم به ذکر است..."، "در دنیای امروز..." یا ترجمه‌های تحت‌اللفظی و بی‌روح استفاده نکن.
- اعداد موجود در بازخوردها و نمره‌ها همگی باید با نویسه‌های انگلیسی (مانند 1، 2، 3، 10، 85، 100) در پاسخ درج شوند تا در رابط کاربری سیستم دچار به هم ریختگی نشوند.

قالب خروجی باید کاملاً معتبر و در قالب JSON با کلیدهای زیر باشد:
- grade: نمره نهایی کلی دانش‌آموز بر اساس Rubric به عنوان یک عدد صحیح (بین 0 تا 100)
- teacherFeedback: بازخورد تحلیلی، فنی و تشخیصی مخصوص مدرس با رعایت تمام موارد ذکر شده (فرمت Markdown به زبان فارسی روان)
- studentFeedback: پیش‌نویس بازخورد صمیمی، انگیزشی و سرنخ‌محور مخصوص دانشجو جهت خوداصلاحی (فرمت Markdown به زبان فارسی روان)
`;

        const responseText = await executeWithGeminiPool(async (client, keyName) => {
          console.log(`[Gemini API] Running Multi-Layer AI review with key: ${keyName}`);
          const response = await client.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  grade: { type: Type.INTEGER },
                  teacherFeedback: { type: Type.STRING },
                  studentFeedback: { type: Type.STRING }
                },
                required: ["grade", "teacherFeedback", "studentFeedback"]
              }
            }
          });
          return response.text || "";
        });

        if (responseText) {
          const result = JSON.parse(responseText);
          return res.json({
            grade: result.grade !== undefined ? result.grade : Math.round(maxPoints * 0.85),
            teacherFeedback: result.teacherFeedback || "پیش‌نویس ارزیابی مربی آماده شد.",
            studentFeedback: result.studentFeedback || "راهنمای ارزیابی دانش‌آموز آماده شد."
          });
        }
        throw new Error("Empty response from Gemini Model");
      } catch (innerErr: any) {
        console.error("Real Gemini Review failed:", innerErr);
        return res.status(503).json({
          error: "برقراری ارتباط با سرویس ارزیابی هوشمند مقدور نمی‌باشد. لطفاً اتصال به سرور یا کلید ارتباطی (API) مربوطه را بررسی نمایید."
        });
      }
    } catch (error: any) {
      console.error("AI Review wrapper error:", error);
      res.status(500).json({ error: "برقراری ارتباط با سرویس ارزیابی هوشمند مقدور نمی‌باشد. لطفاً اتصال به سرور یا کلید ارتباطی (API) مربوطه را بررسی نمایید." });
    }
  });

  // 3. AI Learning Chatbot (Inside student lessons)
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { lesson, lessonContent, messages, currentCode, lastSubmission } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "لیست پیام‌ها ارسال نشده است." });
      }

      // 1. If key is missing or is placeholder, fallback to simulator
      const activeKey = getEffectiveGeminiKey();
      if (!activeKey) {
        console.warn("GEMINI_API_KEY is missing or invalid. Using smart simulated AI chatbot.");
        const reply = getSimulatedAiChat(lesson, currentCode, messages, lastSubmission, lessonContent);
        return res.json({ reply });
      }

      // 2. Attempt real Gemini call
      try {
        let systemInstruction = `
تو یک مدرس حرفه‌ای، نخبه، دلسوز و مستقیم در حوزه برنامه‌نویسی وب و طراحی رابط کاربری (UI) هستی. هدف تو این است که به صورت کاملاً علمی, کاربردی و روان به سوالات دانش‌آموز پاسخ دهی.

موضوع درس فعلی: "${lesson?.title || "طراحی رابط کاربری"}"
محتوای درسی که دانش‌آموز در حال حاضر مطالعه می‌کند:
"${lessonContent || lesson?.content || "محتوایی ثبت نشده است"}"

قوانین بسیار مهم آموزشی و لحن پاسخ‌دهی:
1. **سر اصل مطلب رفتن (بدون حاشیه و پیش‌سخن)**: 
   - به هیچ عنوان از مقدمه‌چینی‌های طولانی، جملات کلیشه‌ای، شعاری و تکراری (مانند "نکته بسیار قشنگ و تأمل‌برانگیزی رو مطرح کردی دوست من" یا "یادگیری فرانت‌اند مثل نواختن ساز موسیقی است" و...) استفاده نکن. 
   - مستقیماً، محترمانه و به صورت کاملاً تخصصی و صریح به سراغ پاسخ به سوال کاربر برو.
2. **تشریح دقیق و فایده درس در دنیای واقعی**: 
   - اگر دانش‌آموز پرسید این درس چیست، به چه دردی می‌خورد، چه فایده‌ای دارد یا خواستار تشریح آن شد، متن درسی که بالاتر به تو ارائه شده را با دقت کامل تحلیل کن.
   - هدف، مفاهیم اصلی (مانند توازن، گرید، ترنزیشن‌ها) و کاربرد واقعی و ملموس این مفاهیم را در پروژه‌های فرانت‌اند به شکلی شفاف و ساختاریافته در چند خط کوتاه توضیح بده تا دانش‌آموز دقیقاً ارزش کاربردی موضوع را درک کند.
3. **مختصر و منسجم بودن**: 
   - پاسخ‌ها را به صورت کاملاً خلاصه، دسته‌بندی شده (با بالت‌پوینت یا شماره‌گذاری‌های شیک) ارائه بده. 
   - کل متن پاسخ نباید از ۲ الی ۳ پاراگراف کوتاه فراتر رود.
4. **رویکرد آموزشی فعال (Socratic)**:
   - هرگز کد پاسخ نهایی چالش‌ها را به طور مستقیم و کامل برای دانش‌آموز کپی نکن.
   - با دادن کدهای کوچک نمونه یا راهنمایی و سرنخ‌های گام‌به‌گام به او کمک کن تا خودش جواب را کشف و کدنویسی کند.
5. **اعداد انگلیسی**: 
   - حتماً حتماً در نگارش متون فارسی خود از اعداد انگلیسی (مانند 1, 2, 3, 10, 85) استفاده کن و هرگز از اعداد فارسی (مانند ۱, ۲, ۳) استفاده نکن.
`;

        if (lesson?.lessonImages && lesson.lessonImages.length > 0) {
          systemInstruction += `\nتصاویر آموزشی موجود در این درس:\n`;
          lesson.lessonImages.forEach((img: any, idx: number) => {
            systemInstruction += `تصویر ${idx + 1}: ${img.title} - ${img.description} (لینک: ${img.url})\n`;
          });
        }

        if (lesson?.questions && lesson.questions.length > 0) {
          systemInstruction += `\nچالش‌ها و تمارین این درس که دانش‌آموز باید حل کند:\n`;
          lesson.questions.forEach((q: any, idx: number) => {
            systemInstruction += `چالش ${idx + 1} [نوع: ${q.answerType}، بارم: ${q.points} امتیاز]:\nعنوان: ${q.title}\nتوضیح: ${q.description}\n`;
            if (q.starterCode) {
              systemInstruction += `کد اولیه چالش:\n\`\`\`html\n${q.starterCode}\n\`\`\`\n`;
            }
          });
        }

        if (currentCode) {
          systemInstruction += `\nکد فعلی دانش‌آموز در ادیتور کلاسی:\n\`\`\`html\n${currentCode}\n\`\`\`\n`;
        }

        systemInstruction += `
قوانین سخت‌گیرانه پداگوژیکی (آموزشی):
1. فاز مطالعه تئوری درس (وقتی دانش‌آموز هنوز تکلیف فرستاده یا قبول شده):
   به هیچ عنوان خودت سر صحبت درباره چالش‌ها، نمره گرفتن، تکلیف حل کردن، یا نحوه پاسخ به سوالات کوئست را باز نکن! اگر دانش‌آموز در حال مطالعه درس است، روی تدریس عمیق مفاهیم علمی، مثال زدن، کشف ابهامات تئوری او متمرکز شو و درس بده. تا زمانی که خود دانش‌آموز صریحاً سوالی از چالش‌ها نپرسیده است، هیچ حرفی از چالش‌ها نزن.
2. فاز بعد از ارسال تکلیف با نمره ناموفق یا درخواست تلاش مجدد (افتادن در چالش):
   اگر دانش‌آموز تکلیفش را فرستاده و نمره‌اش کامل نشده یا به تلاش مجدد خورده است، با لحن مستقیم و تخصصی ابتدا راهنمایی لازم را ارائه بده. هرگز پاسخ مستقیم کد را کپی نکن! کدهای قبلی او را بررسی کن و سرنخ‌های لازم را به او بده تا متوجه شود چه نکاتی را در توازن بصری، فضای منفی یا افکت‌های تعاملی رعایت نکرده و سپس تشویقش کن دوباره چالش را حل کند.

قوانین نگارش:
- کاملاً مستقیم، صریح، به دور از حاشیه و به زبان فارسی بنویس.
- از به کار بردن تمثیل‌های هنری، ادبی یا ضرب‌المثل‌های حاشیه‌ای (مانند ساز موسیقی) به شدت خودداری کن.
- پاسخ مستقیم و کدهای نهایی را کپی نکن؛ سرنخ بده تا خودش کشف کند.
- حتماً حتماً از اعداد انگلیسی (مثل 1, 2, 3, 4, 10, 85) استفاده کن و هرگز از اعداد فارسی (مثل ۱, ۲, ۳) استفاده نکن.
- ساده، متمرکز، علمی و بدون پرگویی‌های بیهوده پاسخ بنویس.
`;

        const lastUserMessage = messages[messages.length - 1]?.content || "";
        const historyContext = messages.slice(0, -1).map((msg: any) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }]
        }));

        const replyText = await executeWithGeminiPool(async (client, keyName) => {
          console.log(`[Gemini API] Running AI chat message with key: ${keyName}`);
          const chat = client.chats.create({
            model: "gemini-2.5-flash",
            config: {
              systemInstruction,
              temperature: 0.7,
            },
            history: historyContext as any
          });

          const response = await chat.sendMessage({
            message: lastUserMessage
          });
          return response.text || "";
        });

        return res.json({ reply: replyText });
      } catch (innerErr: any) {
        console.error("Real Gemini Chat failed, falling back to simulator:", innerErr);
        const reply = getSimulatedAiChat(lesson, currentCode, messages, lastSubmission);
        return res.json({ reply });
      }
    } catch (error: any) {
      console.error("AI Chat wrapper error:", error);
      res.status(500).json({ error: error.message || "خطا در ارتباط با هوش مصنوعی برای چت" });
    }
  });

  // 4. AI Lesson Generator (For Teachers)
  app.post("/api/ai/generate-lesson", async (req, res) => {
    try {
      const { topic, gradeLevel } = req.body;
      if (!topic) {
        return res.status(400).json({ error: "موضوع درس ارسال نشده است." });
      }

      // 1. If key is missing or invalid, fallback to simulator
      const activeKey = getEffectiveGeminiKey();
      if (!activeKey) {
        console.warn("GEMINI_API_KEY is missing or invalid. Using smart simulated lesson generator.");
        const simulatedLesson = getSimulatedGeneratedLesson(topic, gradeLevel);
        return res.json(simulatedLesson);
      }

      const prompt = `
موضوع درس درخواستی معلم: "${topic}"
سطح دانش‌آموزان: "${gradeLevel || "مبتدی"}"

به عنوان یک مهندس نرم‌افزار و طراح آموزشی مجرب، یک درس کاملاً کاربردی و مهندسی شده بساز و خروجی را دقیقاً در قالب فرمت JSON مشخص شده تحویل بده.

فرمت JSON خروجی باید شامل مشخصات زیر باشد:
- title: عنوان جذاب درس به فارسی
- category: دسته‌بندی موضوعی درس (مثلاً: React, HTML, CSS, JavaScript, Python, UI Design)
- content: متن کامل و باکیفیت درس به زبان فارسی با فرمت Markdown غنی شامل توضیحات، مثال‌های کاربردی، راهنماهای استفاده از هوش مصنوعی برای کد زدن، تکه کدهای کاربردی. طولانی و پرمحتوا باشد.
- questions: آرایه‌ای از سوالات که دانش‌آموز باید برای تکمیل درس حل کند (حداقل 2 و حداکثر 4 سوال). هر سوال باید مشخصات زیر را داشته باشد:
  - title: عنوان سوال
  - description: توضیح کامل صورت سوال و خواسته‌ها
  - answerType: نوع پاسخ مورد نیاز. باید حتماً یکی از این مقادیر باشد: 'text' (تایپی)، 'code_editor' (کدنویسی)، 'handwritten_photo' (عکس از یادداشت دستی)، 'audio_recording' (ضبط صدا) یا 'mission_url' (آدرس لینک پروژه ساخته‌شده).
  - starterCode: اگر نوع سوال 'code_editor' 'is_optional' است، یک قالب کد اولیه ناقص به صورت رشته متنی برای دانش‌آموز بگذار.
  - points: بارم نمره سوال (به صورت عدد انگلیسی، مثلاً 10، 20، 50).

قوانین تولید محتوا:
1. تمام متن‌ها باید به زبان فارسی روان باشد.
2. تمام مقادیر عددی داخل متن و نمرات باید با اعداد انگلیسی (مثل 1, 2, 5, 100) نوشته شوند، نه اعداد فارسی.
3. خروجی باید کاملاً معتبر و قابل پارس کردن به عنوان JSON خام باشد. از نوشتن متن‌های اضافه در ابتدا یا انتهای خروجی (مانند \`\`\`json ...) خودداری کن؛ پاسخ فقط یک شیء JSON تمیز باشد.
`;

      const responseText = await executeWithGeminiPool(async (client, keyName) => {
        console.log(`[Gemini API] Running lesson generator with key: ${keyName}`);
        const response = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                category: { type: Type.STRING },
                content: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      answerType: {
                        type: Type.STRING,
                        enum: ["text", "code_editor", "handwritten_photo", "audio_recording", "mission_url"]
                      },
                      starterCode: { type: Type.STRING },
                      points: { type: Type.INTEGER }
                    },
                    required: ["title", "description", "answerType", "points"]
                  }
                }
              },
              required: ["title", "category", "content", "questions"]
            }
          }
        });
        return response.text || "{}";
      });

      const lessonData = JSON.parse(responseText.trim());
      res.json(lessonData);
    } catch (error: any) {
      console.error("AI Lesson Generator error:", error);
      res.status(500).json({ error: error.message || "خطا در تولید درس با هوش مصنوعی" });
    }
  });

  // 5. AI Peer Reviewer (For Teachers to evaluate their lessons quality compared to other lessons)
  app.post("/api/ai/peer-review", async (req, res) => {
    try {
      const { currentLesson, previousLessons } = req.body;
      if (!currentLesson) {
        return res.status(400).json({ error: "اطلاعات درس فعلی الزامی است." });
      }

      // 1. If key is missing or invalid, fallback to simulator
      const activeKey = getEffectiveGeminiKey();
      if (!activeKey) {
        console.warn("GEMINI_API_KEY is missing or invalid. Using smart simulated peer reviewer.");
        const simulatedFeedback = getSimulatedPeerReview(currentLesson);
        return res.json({ feedback: simulatedFeedback });
      }

      const formattedPrev = (previousLessons || []).map((l: any, i: number) => {
        return `${i + 1}. عنوان: ${l.title} | سطح: ${l.level || 'مبتدی'} | تعداد چالش‌ها: ${l.questions?.length || 0}`;
      }).join("\n");

      const prompt = `
تو یک ارزیاب تخصصی برنامه‌نویسی، طراح سرفصل‌های آموزشی دانشگاهی و همکار داور (Peer Reviewer) برای اساتید هستی.
یک مدرس درس جدیدی طراحی کرده و می‌خواهد نظر علمی و ساختاری تو را درباره کیفیت درس بداند.

اطلاعات درس طراحی شده فعلی:
- عنوان: ${currentLesson.title}
- سطح درس: ${currentLesson.level || 'مبتدی'}
- دسته‌بندی: ${currentLesson.category}
- درس‌نامه (متن):
${currentLesson.content}

چالش‌ها و روش پاسخ‌دهی تعریف شده برای این درس:
${(currentLesson.questions || []).map((q: any, i: number) => `  ${i + 1}. عنوان چالش: ${q.title} | روش پاسخ: ${q.answerType} | بارم: ${q.points} امتیاز | دستورالعمل: ${q.description}`).join("\n")}

لیست درس‌های دیگر این دوره (جهت بررسی تداوم و انسجام مطالب):
${formattedPrev || "درسی قبلاً ثبت نشده است."}

وظیفه تو:
به عنوان یک داور همکار صمیمی اما دقیق و حرفه‌ای، این درس را نقد کن. به سوالات زیر پاسخ بده:
1. کیفیت محتوا: آیا متن درس روان، تمیز، و دارای استانداردهای تئوری و عملی مناسب است؟
2. هماهنگی با سطح: آیا سطح سختی درس و سوالات با سطح اعلام شده (${currentLesson.level}) همخوانی دارد？
3. ارزیابی چالش‌ها: آیا روش ارسال پاسخ چالش‌ها (مانند رسم دست‌نویس، ضبط صوت، ادیتور کد و غیره) خلاقانه و مناسب با اهداف یادگیری است؟
4. پیوستگی مطالب: با مقایسه با سایر درس‌ها، آیا تداخل یا تکرار بیهوده‌ای وجود دارد یا سیر یادگیری حفظ شده است؟
5. پیشنهاد بهبود: راهکارهای عملی برای غنی‌تر کردن درس‌نامه و کیفیت سوالات ارائه بده.

قوانین نگارش:
- با لحن محترمانه، همکارانه و علمی به زبان فارسی بنویس.
- حتماً حتماً از اعداد انگلیسی (مانند 1، 2، 5، 100) استفاده کن و هرگز از اعداد فارسی استفاده نکن.
- خروجی را به صورت یک گزارش Markdown ساختاریافته و شیک ارائه بده. ابتدا یک جمع‌بندی کوتاه بنویس که بگوید کیفیت کلی درس "بسیار خوب"، "متوسط" یا "نیاز به بازنگری" است.
`;

      const responseText = await executeWithGeminiPool(async (client, keyName) => {
        console.log(`[Gemini API] Running AI peer-review with key: ${keyName}`);
        const response = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
        });
        return response.text || "";
      });

      res.json({ feedback: responseText });
    } catch (error: any) {
      console.error("AI Peer Review error:", error);
      res.status(500).json({ error: error.message || "خطا در ارزیابی همتای هوش مصنوعی" });
    }
  });

  // 6. AI Course Curriculum Reviewer (For Teachers to review their entire course curriculum/syllabus)
  app.post("/api/ai/course-review", async (req, res) => {
    try {
      const { course, courseLessons } = req.body;
      if (!course) {
        return res.status(400).json({ error: "اطلاعات دوره الزامی است." });
      }

      // 1. If key is missing or invalid, fallback to simulator
      const activeKey = getEffectiveGeminiKey();
      if (!activeKey) {
        console.warn("GEMINI_API_KEY is missing or invalid. Using smart simulated course reviewer.");
        const simulatedReview = getSimulatedCourseReview(course);
        return res.json({ feedback: simulatedReview });
      }

      const lessonsText = (courseLessons || []).map((l: any, i: number) => {
        return `درس ${i + 1}: ${l.title}
دسته‌بندی: ${l.category || course.category}
محتوای کلیدی: ${l.content ? l.content.substring(0, 300) + "..." : "بدون متن"}
تعداد سوالات/چالش‌ها: ${l.questions?.length || 0}`;
      }).join("\n\n");

      const prompt = `
تو یک ارزیاب و طراح برنامه درسی (Curriculum Designer) ارشد و همکار داور هستی.
یک معلم دوره‌ای جدید به شرح زیر تعریف کرده و می‌خواهد ساختار کلی، سرفصل‌ها و همبستگی دروس این دوره را بررسی کنی.

مشخصات دوره آموزشی:
- عنوان دوره: ${course.title}
- دسته‌بندی موضوعی: ${course.category}
- سطح مخاطبان: ${course.level || "متوسط"}
- توضیحات دوره: ${course.description}

لیست درس‌های تعریف شده در این دوره:
${lessonsText || "هنوز درسی برای این دوره تعریف نشده است."}

وظایف تو در ارزیابی کل دوره:
1. تحلیل جامع: آیا ساختار دوره منطقی است؟ آیا این دوره می‌تواند اهداف اعلام شده در توضیحات را برآورده کند؟
2. کیفیت و تنوع سرفصل‌ها: آیا درس‌ها پله‌پله و از مفاهیم ساده به پیچیده حرکت می‌کنند؟
3. ارزیابی هماهنگی سطح: آیا مطالب ارائه شده با سطح هدف (${course.level}) سازگاری دارند؟
4. ایده‌ها و فرصت‌های بهبود: چه درس‌ها یا موضوعات مهم دیگری (حداقل 2 مورد) وجود دارد که این مدرس می‌تواند برای غنی‌تر کردن دوره خود اضافه کند؟
5. خلاصه وضعیت علمی: در ابتدا با لحنی گرم و مشوق، وضعیت ساختاری کل دوره را با یک نماد جذاب (مانند ⭐⭐⭐⭐ یا 🌟) و عناوینی مانند "عالی"، "کافی" یا "نیازمند توسعه" رتبه‌بندی کن.

قوانین مهم خروجی:
- لحن صمیمانه، علمی، انگیزه بخش و کاملاً به زبان فارسی بنویس.
- حتماً حتماً از اعداد انگلیسی (مثل 1, 2, 3, 100) استفاده کن و اصلاً از اعداد فارسی استفاده نکن.
- پاسخ را در قالب یک گزارش Markdown بسیار شیک و خوانا با سرفصل‌های جذاب ارائه بده.
`;

      const responseText = await executeWithGeminiPool(async (client, keyName) => {
        console.log(`[Gemini API] Running AI course review with key: ${keyName}`);
        const response = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
        });
        return response.text || "";
      });

      res.json({ feedback: responseText });
    } catch (error: any) {
      console.error("AI Course Review error:", error);
      res.status(500).json({ error: error.message || "خطا در ارزیابی ساختار دوره توسط هوش مصنوعی" });
    }
  });

  // 7. AI Challenge Generator (For Teachers)
  app.post("/api/ai/generate-challenges", async (req, res) => {
    try {
      const { content, count } = req.body;
      const parsedCount = Math.max(1, Math.min(10, parseInt(count) || 3));

      if (!content || content.trim() === "") {
        return res.status(400).json({ error: "متن درس برای تولید چالش‌ها الزامی است." });
      }

      const activeKey = getEffectiveGeminiKey();
      if (!activeKey) {
        console.warn("GEMINI_API_KEY is missing or invalid. Using simulated challenge generator.");
        const simulatedChallenges = [];
        const basePoints = Math.floor(100 / parsedCount);
        const remainder = 100 - (basePoints * parsedCount);

        for (let i = 0; i < parsedCount; i++) {
          const pts = i === 0 ? basePoints + remainder : basePoints;
          simulatedChallenges.push({
            title: `چالش شبیه‌سازی شده شماره ${i + 1}`,
            description: `بر اساس متن درس‌نامه، لطفاً به این سوال پاسخ دهید: مفهوم کلیدی شماره ${i + 1} چیست و چه کاربردی دارد؟`,
            answerType: "text",
            points: pts
          });
        }
        return res.json({ questions: simulatedChallenges });
      }

      const prompt = `
متن درس‌نامه ارسال شده توسط مدرس:
"""
${content}
"""

تعداد چالش‌های درخواستی: ${parsedCount} چالش.

به عنوان یک طراح برنامه درسی مجرب، بر اساس متن فوق، دقیقاً ${parsedCount} چالش هوشمندانه و هدفمند طراحی کن که میزان یادگیری هنرجو از این درس را به خوبی ارزیابی کند.
هر چالش باید دارای عنوان، شرح کامل، نوع پاسخ و بارم نمره باشد.

قوانین اجباری:
1. مجموع کل بارم نمرات (points) چالش‌های تولید شده باید دقیقاً برابر با 100 باشد. برای هر چالش بر اساس اهمیت و سختی آن بارم متفاوتی در نظر بگیر (مثلاً یکی 30، دیگری 20 و...) اما حتماً مجموع کل آن‌ها 100 شود.
2. نوع پاسخ (answerType) برای هر چالش باید متناسب با صورت چالش، از بین یکی از مقادیر زیر انتخاب شود:
   - 'text' (پاسخ تشریحی متنی)
   - 'handwritten_photo' (عکس از یادداشت دستی یا تمرین دفتر)
   - 'audio_recording' (ضبط صدا و توضیح شفاهی)
   - 'code_editor' (کدنویسی - فقط در صورتی که درس‌نامه واقعاً کدنویسی باشد)
   - 'mission_url' (آدرس لینک پروژه یا فعالیت ساخته‌شده)
   - 'notebook_photo' (عکس از جزوه)
3. تمام متن‌ها، عناوین و توضیحات باید به زبان فارسی روان و حرفه‌ای باشد.
4. تمام مقادیر عددی داخل متن و نمرات باید با اعداد انگلیسی (مثل 10، 25، 50) نوشته شوند، نه با اعداد فارسی.
5. خروجی باید دقیقاً با فرمت JSON توصیف شده مطابقت داشته باشد.

فرمت خروجی را به عنوان یک آرایه در زیر مشخصات schema پارس کن.
`;

      const responseText = await executeWithGeminiPool(async (client, keyName) => {
        console.log(`[Gemini API] Running challenge generator with key: ${keyName}`);
        const response = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      answerType: {
                        type: Type.STRING,
                        enum: ["text", "handwritten_photo", "audio_recording", "code_editor", "mission_url", "notebook_photo"]
                      },
                      starterCode: { type: Type.STRING },
                      points: { type: Type.INTEGER }
                    },
                    required: ["title", "description", "answerType", "points"]
                  }
                }
              },
              required: ["questions"]
            }
          }
        });
        return response.text || "{}";
      });

      const data = JSON.parse(responseText.trim());
      
      // Ensure points sum exactly to 100 in post-processing just in case the model deviated slightly
      if (data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
        // limit count to what was requested
        data.questions = data.questions.slice(0, parsedCount);
        
        let sum = data.questions.reduce((acc: number, q: any) => acc + (parseInt(q.points) || 0), 0);
        if (sum !== 100) {
          const diff = 100 - sum;
          // add the difference to the first or largest points question
          data.questions[0].points = (parseInt(data.questions[0].points) || 0) + diff;
        }
      }

      res.json(data);
    } catch (error: any) {
      console.error("AI Challenge Generator error:", error);
      res.status(500).json({ error: error.message || "خطا در تولید چالش‌ها توسط هوش مصنوعی" });
    }
  });

  // 8. AI Socratic Mentor "Vardak" (For Students)
  app.post("/api/ai/vardak-mentor", async (req, res) => {
    try {
      const { selectedText, lessonTitle, lessonContent, studentLevel } = req.body;
      const level = studentLevel || "beginner";

      if (!selectedText || selectedText.trim() === "") {
        return res.status(400).json({ error: "متن انتخاب شده برای تحلیل الزامی است." });
      }

      const activeKey = getEffectiveGeminiKey();
      if (!activeKey) {
        console.warn("GEMINI_API_KEY is missing or invalid. Using simulated Vardak mentor.");
        return res.json({
          emotion: "🦆",
          concept: "مفهوم انتخاب‌شده در درس",
          message: `سلام دوست من! من وردک (مربی سقراطی لومینا) هستم. به نظر می‌رسه روی این بخش تمرکز کردی: "${selectedText.substring(0, 60)}...". بیا با هم بررسی کنیم که هدف اصلی این بخش چیه و چطور می‌تونی اون رو درک کنی. این مفهوم به ما کمک می‌کنه کارهای تکراری یا سخت رو خیلی راحت انجام بدیم.`,
          hints: [
            "به این فکر کن که در زندگی واقعی چطور اطلاعات یا مقادیر رو دسته‌بندی می‌کنی؟",
            "اگر بخواهیم این کار را چندین بار تکرار کنیم، چه ساختاری منطقی‌تر است؟",
            "یک بار دیگر به ورودی‌ها و خروجی‌های این بخش از کد یا متن دقت کن."
          ],
          guiding_questions: [
            "اگر این خط وجود نداشت، چه مشکلی در اجرای برنامه پیش می‌آمد؟",
            "تفاوت اصلی این رویکرد با روش‌های دستی ساده‌تر چیست؟"
          ],
          example: "// به عنوان مثال:\nconst name = 'Lumina';\nconsole.log('خوش آمدید به ' + name);"
        });
      }

      const prompt = `
تو "وردک" (Vardak) مربی هوشمند و سقراطی آکادمی لومینا (Lumina Smart Academy) هستی.
وظیفه تو این است که به عنوان یک مربی باتجربه و دلسوز، به دانشجویی که در درک یک بخش خاص از درس دچار ابهام شده کمک کنی.

مشخصات ابهام دانشجو:
- عنوان درس: "${lessonTitle}"
- کل متن درس‌نامه جهت داشتن زمینه و Context آموزشی:
"""
${lessonContent}
"""
- بخش خاصی از درس که دانشجو انتخاب کرده و متوجه نشده است:
"""
${selectedText}
"""
- سطح دانشجو: ${level === "beginner" ? "مبتدی" : level === "intermediate" ? "متوسط" : "پیشرفته"}

قوانین و رفتارهای آموزشی الزامی برای "وردک":
1. روش سقراطی (Socratic Method): تو به هیچ وجه نباید مستقیماً پاسخ نهایی چالش را فاش کنی، ترجمه مستقیم تحویل دهی یا کدهای آماده را بدون هیچ تلاشی از سمت دانشجو بنویسی! وظیفه تو این است که با ارائه سرنخ‌های گام‌به‌گام (progressive hints)، مقایسه‌ها یا آنالوژی‌های ساده روزمره و پرسش‌های کلیدی، ذهن او را فعال کنی تا خودش پاسخ را کشف کند.
2. لحن انسانی و صمیمی (Interactive Human Tone): مانند معلمی دلسوز، صمیمی، انگیزه بخش و باحوصله رفتار کن. از جملات خشک، مکانیکی یا تحقیرآمیز کاملاً پرهیز کن. برای مثال به جای "این اشتباه است" بگو "مسیر فکری جالبی داری، اما بیا به این زاویه هم نگاه کنیم...".
3. تمرکز بالا و دوری از حاشیه: مقدمه‌های طولانی یا احوالپرسی‌های رسمی را فاکتور بگیر و مستقیماً روی راهنمایی و گره‌گشایی از همان ابهام متمتور شو.
4. رعایت اعداد انگلیسی: تمام مقادیر عددی داخل متن و نمرات باید با اعداد انگلیسی (مثل 1, 2, 5, 100) نوشته شوند، نه با اعداد فارسی.
5. خروجی باید کاملاً با فرمت JSON توصیف شده در زیر مطابقت داشته باشد.

فرمت خروجی را به عنوان یک شیء با ویژگی‌های زیر ارسال کن:
`;

      const responseText = await executeWithGeminiPool(async (client, keyName) => {
        console.log(`[Gemini API] Running Vardak Socratic Mentor with key: ${keyName}`);
        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                emotion: {
                  type: Type.STRING,
                  description: "یک ایموجی نشان‌دهنده حس وردک در این لحظه (مثلاً 🤔, 💡, 🎓, 🚀, 🦆)"
                },
                concept: {
                  type: Type.STRING,
                  description: "نام مفهوم کلیدی مورد بحث در متن انتخابی"
                },
                message: {
                  type: Type.STRING,
                  description: "پیام اولیه صمیمی و مربیگونه سقراطی که بدون فاش کردن پاسخ مستقیم، ذهن دانشجو را هدایت می‌کند."
                },
                hints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "لیستی از ۳ سرنخ یا راهنمایی تدریجی و پله‌پله (از ساده به عمیق)"
                },
                guiding_questions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "یک یا دو سوال هوشمندانه تفکربرانگیز که ذهن دانشجو را به چالش می‌کشد تا خودش به جواب برسد."
                },
                example: {
                  type: Type.STRING,
                  description: "یک نمونه کد بسیار ساده، شبه‌کد یا آنالوژی دنیای واقعی ملموس برای جا افتادن بهتر موضوع بدون حل مستقیم سوال کاربر."
                }
              },
              required: ["emotion", "concept", "message", "hints", "guiding_questions", "example"]
            }
          }
        });
        return response.text || "{}";
      });

      const data = JSON.parse(responseText.trim());
      res.json(data);
    } catch (error: any) {
      console.error("Vardak Mentor error:", error);
      res.status(500).json({ error: error.message || "خطا در ارتباط با مربی سقراطی هوش مصنوعی" });
    }
  });

  // 9. AI Socratic Mentor Direct Chat
  app.post("/api/ai/vardak-chat", async (req, res) => {
    try {
      const { message, history, lessonTitle, lessonContent, studentLevel } = req.body;
      const level = studentLevel || "beginner";

      if (!message || message.trim() === "") {
        return res.status(400).json({ error: "متن پیام الزامی است." });
      }

      const activeKey = getEffectiveGeminiKey();
      if (!activeKey) {
        console.warn("GEMINI_API_KEY is missing or invalid. Using simulated Socratic chat response.");
        return res.json({
          emotion: "🦆",
          reply: `سلام دوست پرتلاشم! من مربی سقراطی تو، وردک هستم. در مورد "${message.substring(0, 40)}" پرسیدی. بیا با یک سوال شروع کنیم: به نظرت هدف اصلی این موضوع در زندگی روزمره ما چیست و چطور می‌توانیم آن را ساده‌سازی کنیم؟`
        });
      }

      // Convert history to string format for context
      const historyContext = (history || []).map((h: any) => `${h.sender === "user" ? "دانشجو" : "وردک"}: ${h.text}`).join("\n");

      const prompt = `
تو "وردک" (Vardak) مربی هوشمند و سقراطی آکادمی لومینا (Lumina Smart Academy) هستی.
وظیفه تو این است که به عنوان یک مربی با تجربه و دلسوز، به دانشجویی که در درک مفاهیم درسی دچار ابهام شده کمک کنی. این بار دانشجو به صورت مستقیم با تو چت می‌کند.

مشخصات مکالمه جاری دانشجو:
- عنوان درس جاری: "${lessonTitle}"
- کل متن درس‌نامه جهت داشتن زمینه و Context آموزشی:
"""
${lessonContent}
"""
- سابقه چت‌های قبلی در این جلسه:
"""
${historyContext}
"""
- آخرین پیام دانشجو:
"""
${message}
"""
- سطح دانشجو: ${level === "beginner" ? "مبتدی" : level === "intermediate" ? "متوسط" : "پیشرفته"}

قوانین آموزشی "وردک":
1. روش سقراطی (Socratic Method): هرگز پاسخ نهایی را مستقیماً لو نده! با پرسش‌های تدریجی، ارائه مثال‌های ملموس زندگی روزمره، و دادن سرنخ‌های گام‌به‌گام (progressive hints) ذهن او را به چالش بکش تا خودش به جواب برسد.
2. لحن بسیار صمیمی، دلسوز و دوستانه: از ایموجی‌های دوست‌داشتنی و لحنی باحوصله استفاده کن. کلمات را کاملاً فارسی سلیس و محاوره‌ای/نیمه‌محاوره‌ای بنویس.
3. دوری از مقدمه‌چینی‌های کلیشه‌ای طولانی: در هر پاسخ مستقیماً روی پیام کاربر تمرکز کن و او را به فکر وا بدار.
4. اعداد انگلیسی: تمام مقادیر عددی داخل متن و نمرات باید با اعداد انگلیسی (مثل 1, 2, 5, 100) نوشته شوند، نه با اعداد فارسی.
5. خروجی باید کاملاً با فرمت JSON توصیف شده در زیر مطابقت داشته باشد.

فرمت خروجی را به عنوان یک شیء با ویژگی‌های زیر ارسال کن:
{
  "emotion": "یک ایموجی نشان‌دهنده حس وردک در این لحظه (مثلاً 🤔, 💡, 🎓, 🚀, 🦆)",
  "reply": "پاسخ هدایت‌گر، صمیمی، انگیزه‌بخش و سقراطی مربی به زبان فارسی با فرمت استاندارد Markdown برای جلوه بهتر"
}
`;

      const responseText = await executeWithGeminiPool(async (client, keyName) => {
        console.log(`[Gemini API] Running Vardak Chat with key: ${keyName}`);
        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                emotion: {
                  type: Type.STRING,
                  description: "یک ایموجی نشان‌دهنده حس وردک در این لحظه"
                },
                reply: {
                  type: Type.STRING,
                  description: "پاسخ سقراطی با فرمت مارک‌داون"
                }
              },
              required: ["emotion", "reply"]
            }
          }
        });
        return response.text || "{}";
      });

      const data = JSON.parse(responseText.trim());
      res.json(data);
    } catch (error: any) {
      console.error("Vardak Socratic Chat error:", error);
      res.status(500).json({ error: error.message || "خطا در ارتباط با مربی سقراطی هوش مصنوعی" });
    }
  });

  // --- Vite & Production Static File Serving Middleware ---

  if (process.env.VERCEL !== "1") {
    const startApp = async () => {
      if (process.env.NODE_ENV !== "production") {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
      } else {
        const distPath = path.join(process.cwd(), "dist");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
      }

      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    };
    startApp();
  }

export default app;
