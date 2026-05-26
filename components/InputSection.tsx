
import React, { useRef, useState, useEffect } from 'react';
import * as mammoth from 'mammoth';
import { TRANSLATIONS } from '../constants';
import { Language } from '../types';
import { detectLanguage } from '../services/geminiService';

interface InputSectionProps {
  jdText: string;
  setJdText: (text: string) => void;
  onGenerate: (fileInput?: { mimeType: string; data: string } | string) => void;
  onGenerateProject: (fileInput: { mimeType: string; data: string; fileName: string }) => void;
  isLoading: boolean;
  lang: Language;
  onLanguageDetect?: (lang: Language) => void;
  onManualStart?: () => void;
  onOpenHistory?: () => void;
  isLoggedIn?: boolean;
  historyCount?: number;
  onLogin?: () => void;
}

const compressImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_WIDTH = 1000;
      if (width > MAX_WIDTH) { height = (height * MAX_WIDTH) / width; width = MAX_WIDTH; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/webp', 0.8);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = (e) => reject(e);
  });
};

export const InputSection: React.FC<InputSectionProps> = ({ 
    jdText, setJdText, onGenerate, onGenerateProject, isLoading, lang, 
    onLanguageDetect, onManualStart, onOpenHistory, isLoggedIn, historyCount = 0, onLogin 
}) => {
  const [resumeText, setResumeText] = useState('');
  const [inputMode, setInputMode] = useState<'selection' | 'paste'>('selection');
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeFileData, setResumeFileData] = useState<{ mimeType: string; data: string } | null>(null);
  const [extractedResumeText, setExtractedResumeText] = useState<string | null>(null);
  const [projectFileName, setProjectFileName] = useState<string | null>(null);
  const [projectFileData, setProjectFileData] = useState<{ mimeType: string; data: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [builderMode, setBuilderMode] = useState<'ai' | 'manual'>('ai');

  const [progress, setProgress] = useState(0);
  const t = TRANSLATIONS[lang];
  const [loadingText, setLoadingText] = useState(t.analyzing);
  
  const resumeFileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setProgress(0);
      const texts = [t.analyzing || "Analyzing...", "Analyzing skills...", "Matching keywords...", t.finalizing || "Finalizing..."];
      let textIdx = 0;
      setLoadingText(texts[0]);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 98) return prev; 
          // Slower increment to match ~12-15s expectation (avg 0.8% per 100ms)
          const inc = Math.random() * 1 + 0.3;
          
          if (prev > 25 && textIdx === 0) { textIdx=1; setLoadingText(texts[1]); }
          if (prev > 50 && textIdx === 1) { textIdx=2; setLoadingText(texts[2]); }
          if (prev > 75 && textIdx === 2) { textIdx=3; setLoadingText(texts[3]); }
          
          return Math.min(prev + inc, 98);
        });
      }, 100); 
    } else {
      setProgress(0);
      if (interval) clearInterval(interval);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isLoading, t.analyzing]);

  const processResumeFile = async (file: File) => {
    setIsProcessing(true);
    setResumeFileName(file.name);
    setProjectFileName(null); 
    setProjectFileData(null);
    try {
      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const data = { mimeType: 'application/pdf', data: (ev.target?.result as string).split(',')[1] };
            setResumeFileData(data);
            setIsProcessing(false);
        };
        reader.readAsDataURL(file);
      } else if (file.name.endsWith('.docx')) {
         const arrayBuffer = await file.arrayBuffer();
         const result = await mammoth.extractRawText({ arrayBuffer });
         setExtractedResumeText(result.value);
         setIsProcessing(false);
      } else {
        alert("Unsupported resume file type.");
        setIsProcessing(false);
      }
    } catch (error) {
        setIsProcessing(false);
    }
  };

  const processProjectFile = async (file: File) => {
    setIsProcessing(true);
    setProjectFileName(file.name);
    try {
        if (file.name.endsWith('.docx')) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            setProjectFileData({ mimeType: 'text/plain', data: result.value }); 
        } else if (file.type.startsWith('image/')) {
            const compressedBase64 = await compressImage(file);
            setProjectFileData({ mimeType: 'image/webp', data: compressedBase64 });
        } else if (file.type.startsWith('video/')) {
            const frameBase64 = await new Promise<string>((resolve, reject) => {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;
                video.playsInline = true;
                const timeout = setTimeout(() => reject(new Error('Video frame extraction timed out')), 10000);
                video.onloadedmetadata = () => { video.currentTime = Math.min(1, video.duration / 2); };
                video.onseeked = () => {
                    clearTimeout(timeout);
                    const canvas = document.createElement('canvas');
                    let width = video.videoWidth; let height = video.videoHeight;
                    const MAX_DIMENSION = 1200;
                    if (width > height) { if (width > MAX_DIMENSION) { height *= MAX_DIMENSION / width; width = MAX_DIMENSION; } } 
                    else { if (height > MAX_DIMENSION) { width *= MAX_DIMENSION / height; height = MAX_DIMENSION; } }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]); } 
                    else { reject(new Error('Canvas context null')); }
                };
                video.onerror = (e) => { clearTimeout(timeout); reject(e); };
                video.src = URL.createObjectURL(file);
            });
            setProjectFileData({ mimeType: 'image/jpeg', data: frameBase64 });
        } else {
            const reader = new FileReader();
            reader.onload = (ev) => {
              setProjectFileData({ mimeType: file.type || 'application/pdf', data: (ev.target?.result as string).split(',')[1] });
            };
            reader.readAsDataURL(file);
        }
    } catch (e) {
        alert("Error processing file.");
    } finally {
        setIsProcessing(false);
    }
  };

  const handlePasteDetect = async (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text.length > 50 && onLanguageDetect) {
       const detected = await detectLanguage(text);
       onLanguageDetect(detected);
    }
  };

  const currentResumeInput = resumeText || resumeFileData || extractedResumeText;

  const handleOptimizeClick = async () => {
    if (isSubmitting || isLoading) return;

    if (!isLoggedIn) {
        onLogin && onLogin();
        return;
    }
    if (!currentResumeInput && !projectFileData) {
        alert(t.uploadResume);
        return;
    }

    setIsSubmitting(true);
    try {
      if (projectFileData) {
        await onGenerateProject({ mimeType: projectFileData.mimeType, data: projectFileData.data, fileName: projectFileName! });
      } else if (currentResumeInput) {
        await onGenerate(currentResumeInput);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearResume = () => {
    setResumeText('');
    setResumeFileName(null);
    setResumeFileData(null);
    setExtractedResumeText(null);
    setInputMode('selection');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 relative">
      <div className="text-center mb-16 pt-6 md:pt-10">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-black tracking-tight mb-6 md:mb-10 text-slate-900 leading-tight">
          {t.heroTitle} <br />
          <span className="text-indigo-600">{t.heroTitleHighlight}</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-bold max-w-2xl mx-auto leading-relaxed">
          {t.heroSubtitle}
        </p>

        {isLoggedIn && historyCount > 0 && (
            <div className="mt-8 animate-fade-in">
                <button onClick={onOpenHistory} className="inline-flex items-center gap-3 px-6 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-600 font-black text-xs uppercase tracking-widest hover:bg-indigo-100 transition-all shadow-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {lang === 'zh' ? `从历史记录恢复 (${historyCount}个版本)` : `Restore from History (${historyCount} Versions)`}
                </button>
            </div>
        )}
      </div>

      <div className="bg-white rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.08)] border border-slate-100 overflow-hidden relative transition-all duration-500">
        {/* Mode Toggles */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-100 p-1.5 rounded-full flex gap-1 z-30 shadow-inner w-auto max-w-[90%] justify-center">
            <button onClick={() => setBuilderMode('ai')} className={`px-4 md:px-6 py-2 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${builderMode === 'ai' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
                {t.modeAI || "AI Optimization"}
            </button>
            <button onClick={() => setBuilderMode('manual')} className={`px-4 md:px-6 py-2 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${builderMode === 'manual' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
                {t.modeManual || "Manual Builder"}
            </button>
        </div>

        {isLoading && (
            <div className="absolute inset-0 bg-white z-50 flex flex-col items-center justify-center p-12">
                <div className="relative mb-10">
                    {/* Modern Spinner */}
                    <div className="w-24 h-24 rounded-full border-[6px] border-slate-100"></div>
                    <div className="absolute inset-0 w-24 h-24 rounded-full border-[6px] border-indigo-600 border-t-transparent animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-slate-900 font-black text-2xl tracking-tighter">
                        {Math.round(progress)}<span className="text-sm align-top mt-1">%</span>
                    </div>
                </div>

                <div className="text-center w-full max-w-md">
                   <h3 className="text-3xl font-black tracking-tight mb-3 text-slate-900">{loadingText}</h3>
                   <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-8">{t.optimizingAts || 'Optimizing for ATS Compatibility'}</p>
                   
                   {/* Clean Progress Bar */}
                   <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden relative shadow-inner mb-4">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300 ease-out relative rounded-full" 
                        style={{ width: `${progress}%` }}
                      >
                          {/* Shimmer Effect */}
                          <div className="absolute top-0 left-0 bottom-0 right-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]"></div>
                      </div>
                   </div>
                   
                   <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <p className="text-slate-500 font-bold text-[10px] uppercase tracking-wide">{t.timeEstimate}</p>
                   </div>
                </div>
            </div>
        )}
        
        {builderMode === 'ai' ? (
            <div className="grid md:grid-cols-2 pt-24 md:pt-20">
               {/* Left Column: Job Description */}
               <div className="p-8 md:p-12 lg:p-16 border-b md:border-b-0 md:border-r border-slate-100">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                       <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">{t.jdLabel}</h2>
                       <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.1em] mt-2">{t.jdSubLabel}</p>
                    </div>
                    <button onClick={() => setJdText('')} className="text-[10px] font-black text-slate-300 hover:text-rose-500 uppercase tracking-widest pb-1">{t.clear}</button>
                  </div>
                  <div className="h-[300px] md:h-[400px]">
                     <textarea
                      onPaste={handlePasteDetect}
                      className="w-full h-full p-6 md:p-8 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-600 focus:bg-white outline-none resize-none text-slate-700 transition-all font-bold text-sm leading-relaxed"
                      placeholder={t.jdPlaceholder}
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                    />
                  </div>
               </div>

               {/* Right Column: Your Resume */}
               <div className="p-8 md:p-12 lg:p-16 bg-slate-50/20 flex flex-col h-full">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                      <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">{t.yourResume}</h2>
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.1em] mt-2">{t.resumeSubLabel}</p>
                    </div>
                    {(inputMode === 'paste' || resumeFileName) && (
                      <button onClick={clearResume} className="text-[10px] font-black text-slate-300 hover:text-rose-500 uppercase tracking-widest pb-1">{t.clear}</button>
                    )}
                  </div>

                  <div className="flex-grow">
                    {inputMode === 'selection' && !resumeFileName && !projectFileName ? (
                      <div className="space-y-4 animate-fade-in">
                        {/* Action Cards matching screenshot precisely */}
                        <button 
                          onClick={() => resumeFileInputRef.current?.click()}
                          className="w-full p-5 md:p-6 bg-white border-2 border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-xl transition-all group flex items-center gap-5"
                        >
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          </div>
                          <div className="text-left">
                            <span className="block text-base md:text-lg font-black text-slate-900">{t.uploadResume}</span>
                            <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.uploadResumeSub}</span>
                          </div>
                        </button>

                        <button 
                          onClick={() => setInputMode('paste')}
                          className="w-full p-5 md:p-6 bg-white border-2 border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-xl transition-all group flex items-center gap-5"
                        >
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </div>
                          <div className="text-left">
                            <span className="block text-base md:text-lg font-black text-slate-900">{t.pasteResume}</span>
                            <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.pasteResumeSub}</span>
                          </div>
                        </button>

                        <button 
                          onClick={() => projectFileInputRef.current?.click()}
                          className="w-full p-5 md:p-6 bg-white border-2 border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-xl transition-all group flex items-center gap-5"
                        >
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <div className="text-left">
                            <span className="block text-base md:text-lg font-black text-slate-900">{t.uploadProject}</span>
                            <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.uploadProjectSub}</span>
                          </div>
                        </button>
                      </div>
                    ) : (
                      <div className="h-[300px] md:h-[400px] flex flex-col animate-fade-in">
                        <textarea
                          onPaste={handlePasteDetect}
                          className="w-full h-full p-6 md:p-8 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-600 focus:bg-white outline-none resize-none text-slate-700 transition-all font-bold text-sm leading-relaxed"
                          placeholder={t.pastePlaceholder}
                          value={resumeText}
                          onChange={(e) => setResumeText(e.target.value)}
                        />
                        {resumeFileName && (
                           <div className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-2xl flex items-center gap-3 font-bold animate-fade-in shadow-lg">
                              <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" /></svg>
                              <span className="truncate">{resumeFileName}</span>
                              <button onClick={clearResume} className="ml-auto hover:text-rose-200">×</button>
                           </div>
                        )}
                        {inputMode === 'paste' && (
                           <button onClick={() => setInputMode('selection')} className="mt-4 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline text-center">{t.backToUpload}</button>
                        )}
                      </div>
                    )}
                  </div>

                  <input type="file" ref={resumeFileInputRef} className="hidden" accept=".pdf,.docx" onChange={(e) => processResumeFile(e.target.files?.[0] as File)} />
                  <input type="file" ref={projectFileInputRef} className="hidden" accept="*" onChange={(e) => processProjectFile(e.target.files?.[0] as File)} />
                  
                  <div className="mt-8 md:mt-12">
                    <button
                      onClick={handleOptimizeClick}
                      disabled={isLoading || isProcessing || isSubmitting}
                      className={`w-full py-4 md:py-5 rounded-[2rem] font-black text-lg md:text-xl transition-all flex flex-col items-center justify-center gap-1 ${
                        (isLoading || isProcessing || isSubmitting)
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xl shadow-indigo-100 hover:-translate-y-1 active:scale-95'
                      }`}
                    >
                      <span>{projectFileData ? t.analyzeProject : t.optimizeResume}</span>
                      <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">
                        {projectFileData ? '(Costs 5 Credits)' : '(Costs 2 Credits)'}
                      </span>
                    </button>
                  </div>
               </div>
            </div>
        ) : (
            // Manual Mode View
            <div className="py-24 md:py-32 px-8 md:px-12 text-center animate-fade-in flex flex-col items-center justify-center">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-8 border border-indigo-100">
                    <svg className="w-8 h-8 md:w-10 md:h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                </div>
                <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 mb-6">{t.manualTitle || "Build from Scratch"}</h2>
                <p className="text-slate-500 font-medium text-base md:text-lg max-w-lg mx-auto mb-12">
                    {t.manualSubtitle || "Start with a professional template and fill in your details manually."}
                </p>
                <button
                    onClick={() => {
                        if (!isLoggedIn) {
                            onLogin && onLogin();
                        } else {
                            onManualStart && onManualStart();
                        }
                    }}
                    className="px-8 md:px-12 py-5 md:py-6 bg-slate-900 text-white rounded-[2rem] font-black text-lg md:text-xl uppercase tracking-widest hover:bg-black shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-3"
                >
                    <span>{t.startManual || "Create New Resume"}</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </button>
            </div>
        )}

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes shimmer {
            100% { transform: translateX(100%); }
          }
        `}} />
      </div>
    </div>
  );
};
