
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileText, Mail, Briefcase, TrendingUp, Mic, Download, Globe,} from 'lucide-react';
import { InputSection } from './components/InputSection';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { ResumePreview } from './components/ResumePreview';
import { ProjectDisplay } from './components/ProjectDisplay'; 
import { AIChatbot } from './components/AIChatbot';
import { PortfolioGenerator } from './components/PortfolioGenerator'; 
import { MockInterview } from './components/MockInterview'; 
import { CareerPathPredictor } from './components/CareerPathPredictor'; 
import { AnalysisResult, ResumeContent, Language, PortfolioData, Project } from './types';
import { analyzeResume, analyzeProjectMedia, generatePortfolioBio, FileInput } from './services/geminiService';
import { TRANSLATIONS, LANGUAGES } from './constants';

// --- Error Boundary Component ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-slate-50">
          <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-4xl mb-6">⚠️</div>
          <h1 className="text-3xl font-black text-slate-900 mb-4 uppercase tracking-tighter">Something went wrong</h1>
          <p className="text-slate-500 max-w-md mx-auto mb-8 font-medium leading-relaxed">The application encountered an unexpected error. Please try refreshing the page.</p>
          <pre className="text-[10px] bg-slate-900 text-slate-400 p-6 rounded-2xl max-w-2xl overflow-x-auto text-left mb-8 shadow-2xl border border-white/5">{this.state.error?.message}</pre>
          <button onClick={() => window.location.reload()} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl">Refresh Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [jdText, setJdText] = useState(''); 
  const [loadingCount, setLoadingCount] = useState(0);
  const loading = loadingCount > 0;
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [resumeContent, setResumeContent] = useState<ResumeContent | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [lang, setLang] = useState<Language>(() => {
    try {
      return (localStorage.getItem('lang') as Language) || 'en';
    } catch (e) {
      return 'en';
    }
  });

  // History version restoration state
  const [historySnapshot, setHistorySnapshot] = useState<any>(null);
  
  const [activeModule, setActiveModule] = useState<'resume' | 'portfolio' | 'interview' | 'career'>('resume');
  const [lastResumeInput, setLastResumeInput] = useState<{ mimeType: string; data: string } | string | undefined>();
  const [coachTrigger, setCoachTrigger] = useState<{ role: string; timestamp: number } | null>(null);

  // --- History State (Moved to Global) ---
  const [dbHistory, setDbHistory] = useState<any[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(() => {
    if (typeof window !== 'undefined') {
        try {
            return localStorage.getItem('showHistoryDrawer') === 'true';
        } catch (e) {
            return false;
        }
    }
    return false;
  });
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showHistorySavedModal, setShowHistorySavedModal] = useState(false);
  const [dontShowHistoryReminder, setDontShowHistoryReminder] = useState(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('dont_show_history_reminder') === 'true';
    }
    return false;
  });
  
  // Unified history data for modules
  const [careerData, setCareerData] = useState<any>(null);
  const [interviewData, setInterviewData] = useState<any>(null);
  const [lastResumeSettings, setLastResumeSettings] = useState<any>(null);

  const saveGlobalHistory = async (silent = false) => {
    try {
        const snapshot = {
            resumeContent: resumeContent,
            portfolioData: portfolioData,
            careerData: careerData,
            interviewData: interviewData,
            uiSettings: lastResumeSettings
        };

        try {
          const localHist = JSON.parse(localStorage.getItem('resume_history_local') || '[]');
          const newItem = {
              id: `local-${Date.now()}`,
              user_id: 'guest',
              content: snapshot,
              created_at: new Date().toISOString()
          };
          const updatedHist = [newItem, ...localHist].slice(0, 50);
          localStorage.setItem('resume_history_local', JSON.stringify(updatedHist));
          handleHistorySaveSuccess();
        } catch (e) {
          console.error("Local save failed", e);
        }
    } catch (err: any) {
        console.error("Global Save Error:", err);
    }
  };



  useEffect(() => {
      try {
          localStorage.setItem('showHistoryDrawer', String(showHistoryDrawer));
      } catch (e) {}
  }, [showHistoryDrawer]);

  // --- Animation State ---
  const [isLogoAnimating, setIsLogoAnimating] = useState(false);

  // --- Settings State ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('user_gemini_api_key') || '';
    }
    return '';
  });
  const [providerInput, setProviderInput] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('user_llm_provider') || 'gemini';
    }
    return 'gemini';
  });
  const [modelInput, setModelInput] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('user_llm_model') || 'default';
    }
    return 'default';
  });

  const saveSettings = () => {
    localStorage.setItem('user_gemini_api_key', apiKeyInput.trim());
    localStorage.setItem('user_llm_provider', providerInput);
    localStorage.setItem('user_llm_model', modelInput);
    setIsSettingsOpen(false);
    alert(lang === 'zh' ? '设置已保存！' : 'Settings saved!');
  };

  const checkAndDeductCredits = async (amount: number, actionName: string): Promise<boolean> => {
    // We allow the request to proceed; the backend will handle the fallback to the platform key
    // or return a structured error if no key is available at all.
    return true;
  };

  // --- Portfolio & Share State ---
  const getInitialShareId = () => {
      if (typeof window === 'undefined') return null;
      const hash = window.location.hash;
      const hashMatch = hash.match(/share\/([^/?#]+)/);
      if (hashMatch) return hashMatch[1];
      const pathMatch = window.location.pathname.match(/share\/([^/?#]+)/);
      if (pathMatch) return pathMatch[1];
      return null;
  };

  const [shareId, setShareId] = useState<string | null>(getInitialShareId());
  const [isSharedView, setIsSharedView] = useState(!!shareId);
  const [sharedLoading, setSharedLoading] = useState(!!shareId);
  const [shareError, setShareError] = useState(false);

  // Handle hash changes for dynamic routing
  useEffect(() => {
    const handleHashChange = () => {
      const newShareId = getInitialShareId();
      setShareId(newShareId);
      setIsSharedView(!!newShareId);
      if (newShareId) {
        setSharedLoading(true);
        setShareError(false);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Safety check: if isSharedView is true but shareId is null, reset it
  useEffect(() => {
      if (isSharedView && !shareId) {
          setIsSharedView(false);
          setSharedLoading(false);
      }
  }, [isSharedView, shareId]);

  const [portfolioData, setPortfolioData] = useState<PortfolioData>({
    userProfile: { country: 'AU', role: 'Student', photo: null, bio: '' },
    theme: { color: 'indigo', template: 'Minimalist' }, 
    projects: [],
    healthScore: 0,
    jobPackage: { resume: null, coverLetter: null },
  });

  useEffect(() => {
    document.body.className = lang === 'ar' ? 'rtl' : '';
    try {
      localStorage.setItem('lang', lang);
    } catch (e) {}
  }, [lang]);

  // --- Lock Body Scroll for Editor/Portfolio ---
  useEffect(() => {
    const isFixedMode = (activeModule === 'resume' && showEditor) || activeModule === 'portfolio';
    if (isFixedMode) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [activeModule, showEditor]);

  // No Supabase Auth Listener
  useEffect(() => {
    // Basic click outside for profile/settings
    const handleClickOutside = (e: MouseEvent) => {};
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // --- History Fetching Logic ---
  const fetchHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
        const localHist = JSON.parse(localStorage.getItem('resume_history_local') || '[]');
        setDbHistory(localHist);
    } catch (e) {
        console.error("Fetch History Error", e);
        setDbHistory([]);
    } finally {
        setIsHistoryLoading(false);
    }
  }, []);

  const deleteHistoryItem = async (e: React.MouseEvent, id: any) => {
    e.stopPropagation();
    if (!id) return;
    
    const isZh = lang === 'zh';
    const msg = isZh ? '确定要删除这条历史记录吗？' : 'Are you sure you want to delete this history record?';
    if (!confirm(msg)) return;
    
    try {
        const idStr = String(id);
        const localHist = JSON.parse(localStorage.getItem('resume_history_local') || '[]');
        const updated = localHist.filter((i: any) => String(i.id) !== idStr);
        localStorage.setItem('resume_history_local', JSON.stringify(updated));
        setDbHistory(prev => prev.filter(i => String(i.id) !== idStr));
    } catch (err) {
        console.error("Delete History Error", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        alert(isZh ? `删除失败: ${errMsg}` : `Failed to delete: ${errMsg}`);
    }
  };

  const handleHistorySaveSuccess = () => {
    fetchHistory();
    if (!dontShowHistoryReminder) {
        setShowHistorySavedModal(true);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const restoreFromHistory = (item: any) => {
    const isZh = lang === 'zh';
    const msg = isZh ? "要恢复此版本吗？当前未保存的修改将丢失。" : "Restore this version? Current unsaved changes will be lost.";
    
    if (confirm(msg)) {
        try {
            // Check if it's the new complex structure or old simple one
            const snapshot = item.content;
            if (snapshot && typeof snapshot === 'object' && snapshot.resumeContent) {
                console.log("Restoring complex history snapshot", snapshot);
                setResumeContent(JSON.parse(JSON.stringify(snapshot.resumeContent)));
                if (snapshot.portfolioData) setPortfolioData(JSON.parse(JSON.stringify(snapshot.portfolioData)));
                if (snapshot.careerData) setCareerData(JSON.parse(JSON.stringify(snapshot.careerData)));
                if (snapshot.interviewData) setInterviewData(JSON.parse(JSON.stringify(snapshot.interviewData)));
                
                // Explicitly reload current module if needed or just switch to resume
                if (snapshot.careerData && activeModule === 'career') setCareerData(snapshot.careerData);
                if (snapshot.interviewData && activeModule === 'interview') setInterviewData(snapshot.interviewData);

                // Pass the rest of the settings to ResumePreview via snapshot prop
                setHistorySnapshot(snapshot);
            } else {
                console.log("Restoring old history structure", snapshot);
                setResumeContent(JSON.parse(JSON.stringify(snapshot)));
                setHistorySnapshot(null);
            }
            
            setShowEditor(true);
            setActiveModule('resume');
            setShowHistoryDrawer(false);

            setTimeout(() => {
                const editor = document.getElementById('resume-editor');
                if (editor) editor.scrollIntoView({ behavior: 'smooth' });
                else window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 300);
        } catch (e) {
            console.error("Restoration error:", e);
            alert("Failed to restore this version. Data might be corrupted.");
        }
    }
  };

  // --- Auto Sync Logic ---


  const handleLanguageChange = (l: Language) => setLang(l);

  useEffect(() => {
      if (shareId) {
          console.log("Fetching shared portfolio for ID:", shareId);
          const fetchShared = async () => {
              setShareError(true);
              setSharedLoading(false);
          };
          fetchShared();
      }
  }, [shareId]);

  useEffect(() => {
    const calculateHealthScore = () => {
      let score = 0;
      if (portfolioData.projects.length > 0) {
        score += Math.min(portfolioData.projects.length * 10, 50); 
        const starProjects = portfolioData.projects.filter(p => p.description && p.description.toLowerCase().includes('situation') && p.description.toLowerCase().includes('result'));
        score += Math.min(starProjects.length * 10, 50); 
      }
      setPortfolioData(prev => ({ ...prev, healthScore: Math.min(score, 100) }));
    };
    calculateHealthScore();
  }, [portfolioData.projects]);

  // Enhanced Bio Generation Effect
  useEffect(() => {
      if (isSharedView) return;
      if (!portfolioData.userProfile.bio && (portfolioData.jobPackage.resume || portfolioData.projects.length > 0)) {
          const timer = setTimeout(async () => {
              try {
                 const bioResult = await generatePortfolioBio(portfolioData.projects, portfolioData.jobPackage.resume, lang);
                 setPortfolioData(prev => ({ ...prev, userProfile: { ...prev.userProfile, bio: bioResult.bio, role: bioResult.role } }));
              } catch (e) {}
          }, 2000); 
          return () => clearTimeout(timer);
      }
  }, [portfolioData.projects, portfolioData.jobPackage.resume, isSharedView, lang, portfolioData.userProfile.bio]);

  const handleLogoClick = () => {
    setIsLogoAnimating(true);
    setTimeout(() => setIsLogoAnimating(false), 200); 

    if (isSharedView) { window.history.pushState(null, "", "/"); window.location.reload(); return; }
    setActiveModule('resume');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleModuleChange = (module: typeof activeModule) => {
    setActiveModule(module);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGenerate = async (resumeInput?: string | FileInput) => {
    console.log('handleGenerate called', { resumeInput: !!resumeInput, loadingCount });
    const input = resumeInput || lastResumeInput;
    if (!input) return;
    
    if (loadingCount > 0) {
      console.log('Already loading, skipping...');
      return;
    }

    // Check credits before proceeding: 1 for Resume + 1 for Cover Letter = 2
    const hasCredits = await checkAndDeductCredits(2, 'AI Resume & Cover Letter Optimization');
    if (!hasCredits) return;

    setLoadingCount(prev => prev + 1);
    setShowEditor(false); 
    setLastResumeInput(input);
    
    try {
      console.log('Starting analyzeResume...');
      const result = await analyzeResume(jdText, input, lang);
      console.log('analyzeResume success');
      setAnalysisResult(result);
      setCoverLetter(result.coverLetter || '');
      setResumeContent(null); 
      setPortfolioData(prev => ({ ...prev, jobPackage: { resume: result.optimizedResume, coverLetter: result.coverLetter } }));
      setTimeout(() => { 
        const el = document.getElementById('analysis-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' }); 
      }, 300);
    } catch (error: any) { 
      console.error("Analysis Error:", error);
      alert("Analysis failed: " + (error.message || JSON.stringify(error))); 
    } 
    finally { 
      console.log('handleGenerate finished');
      setLoadingCount(prev => Math.max(0, prev - 1)); 
    }
  };

  const handleManualStart = () => {
      const emptyResume: ResumeContent = {
          fullName: "Your Name",
          contactInfo: "City, Country | email@example.com | +1 234 567 890",
          summary: "Professional summary goes here. Describe your key strengths, years of experience, and what you bring to the role.",
          technicalSkills: ["Skill 1", "Skill 2", "Skill 3"],
          softSkills: ["Leadership", "Communication"],
          experiences: [
              {
                  id: 'exp-1',
                  role: 'Job Title',
                  company: 'Company Name',
                  period: '2023 - Present',
                  bullets: ['Achievement or responsibility 1', 'Achievement or responsibility 2'],
                  isMatch: false,
              }
          ],
          education: [
              {
                  id: 'edu-1',
                  school: 'University Name',
                  degree: 'Degree / Field of Study',
                  startDate: '2019',
                  endDate: '2023',
                  gpa: '3.8/4.0'
              }
          ],
          references: [],
          volunteer: [],
          schoolProjects: [],
          awards: ["Award or Honour Name"]
      };
      setResumeContent(emptyResume);
      setAnalysisResult(null); 
      setCoverLetter(''); 
      setShowEditor(true); 
      setPortfolioData(prev => ({ ...prev, jobPackage: { resume: emptyResume, coverLetter: null } }));
      setTimeout(() => { document.getElementById('resume-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
  };

  const handleGenerateProject = async (fileInput: { mimeType: string; data: string; fileName: string; analysisData?: string; analysisMimeType?: string }, section?: string) => {
    const hasCredits = await checkAndDeductCredits(5, 'AI Portfolio Generation');
    if (!hasCredits) return;

    setLoadingCount(prev => prev + 1);
    try {
      const newProjectData = await analyzeProjectMedia(fileInput.analysisData || fileInput.data, fileInput.analysisMimeType || fileInput.mimeType, fileInput.fileName, lang);
      const newProject: Project = { 
        id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
        originalFileName: fileInput.fileName, 
        originalMimeType: fileInput.mimeType, 
        base64Data: fileInput.data, 
        section: section || newProjectData.category || 'Visual Design',
        ...newProjectData 
      };
      setPortfolioData(prev => ({ ...prev, projects: [...prev.projects, newProject] }));
    } catch (error: any) { 
      console.error("Project Analysis Error:", error);
      alert(`Project analysis failed: ` + (error.message || JSON.stringify(error))); 
    } 
    finally { setLoadingCount(prev => prev - 1); }
  };

  const handleConfirmExperiences = (selectedIds: string[], selectedVolunteerIds: string[], selectedProjectIds: string[]) => {
      if (!analysisResult || !analysisResult.optimizedResume) return;
      const newResumeContent = { 
          ...analysisResult.optimizedResume, 
          experiences: (analysisResult.optimizedResume.experiences || []).filter(exp => selectedIds.includes(exp.id)), 
          volunteer: (analysisResult.optimizedResume.volunteer || []).filter(vol => selectedVolunteerIds.includes(vol.id)), 
          schoolProjects: (analysisResult.optimizedResume.schoolProjects || []).filter(p => selectedProjectIds.includes(p.id)) 
      };
      setResumeContent(newResumeContent);
      setPortfolioData(prev => ({ ...prev, jobPackage: { resume: newResumeContent, coverLetter: prev.jobPackage.coverLetter } }));
      setShowEditor(true);
      setTimeout(() => { document.getElementById('resume-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
  };

  const t = TRANSLATIONS[lang];

  if (sharedLoading) return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>
  );

  if (isSharedView && shareId) {
      if (sharedLoading) return (
        <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center">
            <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-4">Loading Portfolio...</p>
        </div>
      );

      if (shareError) return (
        <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center text-4xl mb-6">✕</div>
            <h1 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Portfolio Not Found</h1>
            <p className="text-slate-500 max-w-md mx-auto mb-8 font-medium leading-relaxed">The link you followed may be broken or the portfolio has been removed.</p>
            <a href="/" className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl">Create Your Own</a>
        </div>
      );

      return (
        <ErrorBoundary>
          <div className="min-h-screen bg-white text-[#0f172a] flex flex-col">
              <header className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all">
                  <div className="max-w-7xl mx-auto w-full px-4 md:px-12">
                      <div className="flex justify-between items-center h-16 md:h-20 relative">
                          <div className="flex items-center gap-3 cursor-pointer group shrink-0 select-none z-50" onClick={() => window.open(window.location.origin, '_blank')}>
                              <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl md:rounded-[1.25rem] flex items-center justify-center shadow-lg relative transition-all duration-300 ease-out group-hover:rotate-[15deg] group-hover:scale-110">
                                <svg viewBox="0 0 24 24" className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" fill="white" stroke="white" />
                                </svg>
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center text-xl md:text-3xl font-black tracking-tighter leading-none">
                                  <span className="text-indigo-600 mr-1.5">AI</span>
                                  <span className="italic text-slate-900">Fast</span>
                                  <span className="text-indigo-600 ml-0.5">Resume</span>
                                </div>
                                <span className="hidden sm:block text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/80 leading-none mt-1">ATS Optimised</span>
                              </div>
                          </div>
                          <a href="/" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all">Create Your Own</a>
                      </div>
                  </div>
              </header>
              <div className="pt-16 flex-grow flex flex-col">
                 <div className="flex-grow">
                    <PortfolioGenerator portfolioData={portfolioData} setPortfolioData={setPortfolioData} onGenerateProject={() => {}} isLoading={false} readOnly={true} lang={lang} />
                 </div>
                 <footer className="py-12 border-t border-slate-100 bg-white text-center no-print">
                    <div className="max-w-lg mx-auto flex flex-col items-center gap-4">
                        <img src="/RabbitShark logo.png" alt="Rabbit Shark Logo" className="h-12 w-auto mb-2" />
                        <a href="https://rabbitshark.space/" target="_blank" rel="noopener noreferrer" className="text-sm font-black uppercase tracking-[0.2em] text-indigo-600 hover:text-indigo-700 transition-all">
                            Visit more on RabbitShark.space
                        </a>
                        <div className="h-px w-12 bg-slate-100 my-2"></div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                            Copyright © 2026 AI Fast Resume. All Rights Reserved.
                        </p>
                    </div>
                 </footer>
              </div>
          </div>
        </ErrorBoundary>
      );
  }

  const isEditorMode = (activeModule === 'resume' && showEditor) || activeModule === 'portfolio';

  return (
    <div className={`${isEditorMode ? 'h-screen overflow-hidden' : 'min-h-screen overflow-x-hidden'} ${activeModule === 'career' ? 'bg-[#0b1120]' : 'bg-white'} text-[#0f172a] selection:bg-indigo-100 flex flex-col relative transition-colors duration-500`}>
      {/* --- Header --- */}
      <header className="fixed top-0 w-full z-50 glass-header border-b border-slate-100 shadow-sm transition-all bg-white/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-12">
          
          {/* Main Row: Logo + Desktop Nav + Controls */}
          <div className="flex justify-between items-center h-16 md:h-20 relative">
            {/* Logo */}
            <div className="flex items-center gap-3 cursor-pointer group shrink-0 select-none z-50" onClick={handleLogoClick}>
                <div className={`w-10 h-10 md:w-12 md:h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl md:rounded-[1.25rem] flex items-center justify-center shadow-lg relative transition-all duration-300 ease-out ${isLogoAnimating ? 'scale-90 rotate-[15deg]' : 'group-hover:rotate-[15deg] group-hover:scale-110'}`}>
                  <svg viewBox="0 0 24 24" className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" fill="white" stroke="white" />
                  </svg>
                  {/* Online Status Indicator */}
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-[3px] border-white rounded-full shadow-sm z-10" title="Online">
                      <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75"></span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center text-xl md:text-3xl font-black tracking-tighter leading-none">
                    <span className="text-indigo-600 mr-1.5">AI</span>
                    <span className="italic text-slate-900">Fast</span>
                    <span className="text-indigo-600 ml-0.5">Resume</span>
                  </div>
                  <span className="hidden sm:block text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/80 leading-none mt-1">ATS Optimised</span>
                </div>
            </div>

            {/* Desktop Navigation (Moved back to first row) */}
            <div className="hidden lg:flex items-center bg-indigo-50/50 p-1 rounded-[1.25rem] border border-indigo-100/50 shadow-sm mx-4">
               <button onClick={() => handleModuleChange('resume')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeModule === 'resume' ? 'bg-white shadow-md text-indigo-600 scale-[1.02]' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>{t.resumeBuilder}</button>
               <button onClick={() => handleModuleChange('portfolio')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeModule === 'portfolio' ? 'bg-white shadow-md text-indigo-600 scale-[1.02]' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>{t.portfolioAi}</button>
               <button onClick={() => handleModuleChange('interview')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeModule === 'interview' ? 'bg-white shadow-md text-indigo-600 scale-[1.02]' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>{t.interview}</button>
               <button onClick={() => handleModuleChange('career')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeModule === 'career' ? 'bg-white shadow-md text-indigo-600 scale-[1.02]' : 'text-slate-500 hover:text-indigo-600 hover:bg-white/40'}`}>{t.careerPath}</button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
               {/* Language Icon Selector */}
               <div className="hidden sm:flex items-center bg-slate-50 border border-slate-100 rounded-2xl p-1 relative group">
                  <div className="p-2 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer">
                     <Globe className="w-4 h-4" />
                  </div>
                  <select 
                     value={lang} 
                     onChange={(e) => handleLanguageChange(e.target.value as Language)} 
                     className="absolute inset-0 opacity-0 cursor-pointer no-print appearance-none"
                  >
                     {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
                  </select>
               </div>

                       <button 
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-sm shadow-sm transition-all"
        >
          <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-indigo-600 text-xs">⚙️</span>
          </div>
          <span className="hidden sm:inline">Settings</span>
        </button>
            </div>
          </div>

          {/* Desktop Navigation (Moved back to first row) */}
          {/* Mobile Navigation Bar */}
          <div className="lg:hidden flex overflow-x-auto gap-2 pb-3 -mx-4 px-4 no-scrollbar items-center border-t border-slate-50 pt-3 md:justify-center md:overflow-visible">
              <div className="flex items-center bg-indigo-50/50 p-1 rounded-2xl border border-indigo-100/50">
                  <button onClick={() => handleModuleChange('resume')} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeModule === 'resume' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-indigo-600'}`}>{t.resumeBuilder}</button>
                  <button onClick={() => handleModuleChange('portfolio')} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeModule === 'portfolio' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-indigo-600'}`}>{t.portfolioAi}</button>
                  <button onClick={() => handleModuleChange('interview')} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeModule === 'interview' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-indigo-600'}`}>{t.interview}</button>
                  <button onClick={() => handleModuleChange('career')} className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeModule === 'career' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-indigo-600'}`}>{t.careerPath}</button>
              </div>
          </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className={`flex flex-col flex-grow w-full max-w-full pt-20 min-h-0 ${((activeModule === 'resume' && showEditor) || activeModule === 'portfolio') ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {activeModule === 'resume' && (
          <div className={`animate-fade-in w-full ${showEditor ? 'flex-grow flex flex-col min-h-0' : 'pt-4 md:pt-12 pb-20'}`}>
             {!showEditor ? (
               <>
                 <InputSection 
                    jdText={jdText} 
                    setJdText={setJdText} 
                    onGenerate={handleGenerate} 
                    onGenerateProject={handleGenerateProject} 
                    isLoading={loading} 
                    lang={lang} 
                    onLanguageDetect={setLang}
                    onManualStart={handleManualStart} 
                    onOpenHistory={() => setShowHistoryDrawer(true)}
                    isLoggedIn={true}
                    historyCount={dbHistory.length}
                    onLogin={() => {}}
                 />
                  {portfolioData.projects.length > 0 && <div className="mt-16 md:mt-24"><ProjectDisplay projects={portfolioData.projects} lang={lang} /></div>}
                  {analysisResult && (
                    <div id="analysis-section" className="mt-16 md:mt-24">
                       <div className="py-16 md:py-24 bg-slate-50 border-y border-slate-100 shadow-inner relative z-10 text-center rounded-[2rem] md:rounded-[3rem] mx-auto overflow-hidden">
                            <h2 className="text-3xl md:text-6xl font-black tracking-tight mb-4">{t.matchScore}</h2>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-8">{t.basedOn}</p>
                            <AnalysisDashboard data={analysisResult} onConfirmExperiences={handleConfirmExperiences} lang={lang} />
                       </div>
                    </div>
                  )}
               </>
             ) : (
               resumeContent && (
                 <div id="resume-editor" className="relative z-0 w-full flex-grow flex flex-col min-h-0">
                    <ResumePreview 
                      content={resumeContent} 
                      allOriginalExperiences={analysisResult?.optimizedResume?.experiences} 
                      allOriginalVolunteer={analysisResult?.optimizedResume?.volunteer} 
                      coverLetter={coverLetter} 
                      missingKeywords={analysisResult?.missingSkills} 
                      jdText={jdText} 
                      onUpdate={setResumeContent} 
                      onUpdateCoverLetter={setCoverLetter} 
                      lang={lang} 
                      portfolioData={portfolioData} 
                      setPortfolioData={setPortfolioData} 
                      onOpenHistory={() => setShowHistoryDrawer(true)} 
                      historySnapshot={historySnapshot}
                      onHistoryRestored={() => setHistorySnapshot(null)}
                      onSaveSuccess={handleHistorySaveSuccess}
                      careerData={careerData}
                      interviewData={interviewData}
                      onSettingsUpdate={setLastResumeSettings}
                      onSaveHistory={() => saveGlobalHistory(true)}
                      isLoggedIn={true} 
                      onLogin={() => {}}
                      onBack={() => setShowEditor(false)}
                      onDeductCredits={checkAndDeductCredits}
                    />
                 </div>
               )
             )}
          </div>
        )}
        {activeModule === 'portfolio' && <div className="w-full flex-grow flex flex-col min-h-0"><PortfolioGenerator portfolioData={portfolioData} setPortfolioData={setPortfolioData} onGenerateProject={handleGenerateProject} isLoading={loading} onCancelLoading={() => setLoadingCount(0)} lang={lang} isLoggedIn={true} onLogin={() => {}} onSaveHistory={() => saveGlobalHistory(true)} /></div>}
        {activeModule === 'career' && <div className="pt-4 md:pt-0"><CareerPathPredictor projects={portfolioData.projects} resume={portfolioData.jobPackage.resume} onDownloadComplete={(r) => setCoachTrigger({role: r, timestamp: Date.now()})} lang={lang} isLoggedIn={true} onLogin={() => {}} onStartAction={checkAndDeductCredits} initialData={careerData} onDataUpdate={setCareerData} onSaveHistory={() => saveGlobalHistory(true)} /></div>}
        {activeModule === 'interview' && <div className="w-full min-h-screen md:h-[calc(100vh-160px)] pt-4 md:pt-0"><MockInterview jdText={jdText} portfolioData={portfolioData} lang={lang} isLoggedIn={true} onLogin={() => {}} onStartInterview={checkAndDeductCredits} initialData={interviewData} onDataUpdate={setInterviewData} onSaveHistory={() => saveGlobalHistory(true)} /></div>}
        
        {!((activeModule === 'resume' && showEditor) || activeModule === 'portfolio') && (
          <footer className={`py-8 text-center border-t mt-auto px-6 transition-colors duration-500 no-print ${activeModule === 'career' ? 'bg-[#0b1120] border-white/5' : 'bg-white border-slate-100'}`}>
             <div className="max-w-lg mx-auto w-full space-y-4">
                <p className={`text-[10px] font-medium leading-relaxed transition-opacity ${activeModule === 'career' ? 'text-slate-500/60' : 'text-slate-400/60'}`}>
                  {t.disclaimer}
                </p>
                <div className={`h-px w-12 mx-auto ${activeModule === 'career' ? 'bg-white/5' : 'bg-slate-100'}`}></div>
                
                <div className="flex flex-col items-center gap-3 py-2">
                  <img src="/RabbitShark logo.png" alt="Rabbit Shark Logo" className="h-10 w-auto opacity-90 transition-opacity hover:opacity-100" />
                  <a href="https://rabbitshark.space/" target="_blank" rel="noopener noreferrer" className={`text-xs font-black uppercase tracking-widest hover:underline transition-all ${activeModule === 'career' ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'}`}>
                    Visit more on RabbitShark.space
                  </a>
                </div>

                <p className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors cursor-default ${activeModule === 'career' ? 'text-slate-600 hover:text-slate-500' : 'text-slate-300 hover:text-slate-400'}`}>
                  Copyright © 2026 AI Fast Resume. All Rights Reserved.
                </p>
             </div>
          </footer>
        )}
      </main>

      {/* --- Global History Drawer --- */}
      {activeModule === 'resume' && (
        <div className={`fixed top-24 right-0 h-[calc(100vh-140px)] z-[2001] transition-all duration-700 flex no-print ${showHistoryDrawer ? 'translate-x-0' : 'translate-x-[calc(100%-3.5rem)]'}`}>
              <button onClick={() => setShowHistoryDrawer(!showHistoryDrawer)} className="w-14 bg-white/95 backdrop-blur-xl h-64 my-auto rounded-s-[2rem] flex flex-col items-center justify-center gap-6 shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border border-slate-200 text-slate-400 hover:text-indigo-600 transition-all group hover:w-16 order-1 cursor-pointer">
                  <div style={{ writingMode: 'vertical-rl', textOrientation: ['zh', 'ja', 'ko'].includes(lang) ? 'upright' : 'mixed' }} className={`${['zh', 'ja', 'ko'].includes(lang) ? '' : 'rotate-180'} text-[11px] font-black tracking-[0.5em] uppercase`}>{t.history || 'HISTORY'}</div>
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-black text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">{dbHistory.length}</div>
              </button>
              <div className="w-80 h-full bg-white border-s border-slate-100 shadow-[-50px_0_100px_rgba(0,0,0,0.05)] flex flex-col order-2">
                  <div className="p-10 border-b border-slate-50 flex justify-between items-end">
                      <div>
                          <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{t.history || 'History'}</h3>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">VERSION CONTROL</p>
                      </div>
                      <button onClick={() => setShowHistoryDrawer(false)} className="text-slate-400 hover:text-slate-900 transition-colors">✕</button>
                  </div>
                  <div className="flex-grow overflow-y-auto custom-scrollbar p-8 space-y-6 bg-slate-50/30">
                      {!localStorage.getItem('user_gemini_api_key') ? (
                          <div className="mb-6 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 text-center">
                              <p className="text-xs font-bold text-indigo-900 mb-3 uppercase tracking-tight">API Key Required</p>
                              <p className="text-[10px] text-indigo-600 mb-4 font-medium leading-relaxed">Enter an API key in Settings to save and restore your history.</p>
                              <button onClick={() => setIsSettingsOpen(true)} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs">OPEN SETTINGS</button>
                          </div>
                      ) : isHistoryLoading ? (
                          <div className="flex flex-col items-center justify-center py-20 opacity-20"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
                      ) : dbHistory.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full opacity-30 select-none">
                              <p className="text-slate-400 text-lg font-black italic">No records found</p>
                          </div>
                      ) : (
                          dbHistory.map((item, idx) => (
                              <div key={item.id || idx} onClick={() => restoreFromHistory(item)} className="p-6 bg-white border border-slate-100 rounded-3xl hover:border-indigo-500/30 hover:shadow-2xl transition-all cursor-pointer group relative">
                                  <div className="flex justify-between items-start mb-2">
                                      <div>
                                          <div className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Version {dbHistory.length - idx}</div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                                              {lang === 'zh' 
                                                  ? `${new Date(item.created_at).getFullYear()}年${new Date(item.created_at).getMonth()+1}月${new Date(item.created_at).getDate()}日 ${String(new Date(item.created_at).getHours()).padStart(2, '0')}:${String(new Date(item.created_at).getMinutes()).padStart(2, '0')}`
                                                  : new Date(item.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { 
                                                      year: 'numeric', month: 'short', day: 'numeric', 
                                                      hour: '2-digit', minute: '2-digit', hour12: false 
                                                  })
                                              }
                                          </div>
                                      </div>
                                      <button 
                                          onClick={(e) => deleteHistoryItem(e, item.id)}
                                          className="p-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 text-slate-300 rounded-lg transition-all"
                                          title="Delete this version"
                                      >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      </button>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mb-3">
                                      <span className="px-2 py-0.5 bg-slate-50 text-[8px] font-black text-slate-400 rounded uppercase border border-slate-100">Resume</span>
                                      {item.content?.portfolioData && <span className="px-2 py-0.5 bg-indigo-50 text-[8px] font-black text-indigo-400 rounded uppercase border border-indigo-100">Portfolio</span>}
                                      {item.content?.careerData?.result && <span className="px-2 py-0.5 bg-emerald-50 text-[8px] font-black text-emerald-600 rounded uppercase border border-emerald-100">Career</span>}
                                      {item.content?.interviewData?.messages?.length > 0 && <span className="px-2 py-0.5 bg-amber-50 text-[8px] font-black text-amber-600 rounded uppercase border border-amber-100">Interview</span>}
                                      {String(item.id).startsWith('local-') && <span className="px-2 py-0.5 bg-slate-100 text-[8px] font-black text-slate-400 rounded uppercase border border-dashed border-slate-200">Local Only</span>}
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter opacity-60">Restore this snapshot</p>
                                  {idx === 0 && <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-6 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>}
                              </div>
                          ))
                      )}
                  </div>
              </div>
        </div>
      )}

      <AIChatbot portfolioData={portfolioData} resumeContent={resumeContent} jdText={jdText} activeModule={activeModule} coachTrigger={coachTrigger} lang={lang} />
      
      {/* --- Settings Modal --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fade-in" onClick={() => setIsSettingsOpen(false)}></div>
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 animate-scale-in">
                <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 transition-colors">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <h3 className="text-xl font-bold text-slate-900 mb-6">Settings</h3>
                <div className="space-y-4">
                    {/* Static Host Notice */}
                    {(typeof window !== 'undefined' && 
                      (window.location.hostname.includes('fastresume.xyz') || 
                       window.location.hostname.includes('github.io') || 
                       window.location.hostname.includes('pages.dev'))) && (
                        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl mb-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1 leading-tight">Static Hosting Detected</p>
                            <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                                {lang === 'zh' ? 
                                  '由于此站点通过静态服务器托管，AI 功能需要您提供自己的 API 密钥。密钥将仅存储在您的浏览器本地。' : 
                                  'This site is hosted statically. To use AI features, please provide your own API key. It is stored only in your local browser.'}
                            </p>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">AI Provider</label>
                        <select
                            value={providerInput}
                            onChange={(e) => { setProviderInput(e.target.value); setModelInput('default'); }}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all outline-none mb-4"
                        >
                            <option value="gemini">Google Gemini (gemini-2.5-pro / flash)</option>
                            <option value="openai">OpenAI (GPT-4o / GPT-4.1 / o3)</option>
                            <option value="anthropic">Anthropic Claude (Sonnet 4.6 / Opus)</option>
                            <option value="nvidia">Nvidia NIM (Llama / Nemotron)</option>
                        </select>

                        <label className="block text-sm font-medium text-slate-700 mb-1">Model ID <span className="text-slate-400 font-normal">(type any model name)</span></label>
                        <input
                            type="text"
                            value={modelInput === 'default' ? '' : modelInput}
                            onChange={(e) => setModelInput(e.target.value || 'default')}
                            placeholder={
                                providerInput === 'gemini' ? 'e.g. gemini-2.5-pro, gemini-2.5-flash, gemini-3.1-pro…'
                                : providerInput === 'openai' ? 'e.g. gpt-4o, gpt-4.1, gpt-5, o3…'
                                : providerInput === 'anthropic' ? 'e.g. claude-sonnet-4-6, claude-opus-4-5…'
                                : 'e.g. nvidia/llama-3.1-405b-instruct'
                            }
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all outline-none mb-1"
                        />
                        <p className="text-[10px] text-slate-400 mb-3">Leave blank to use the default model. Enter the exact API model ID from your provider's docs.</p>
                        
                        <label className="block text-sm font-medium text-slate-700 mb-2">API Key for selected provider</label>
                        <input
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder={providerInput === 'anthropic' ? "sk-ant-..." : providerInput === 'openai' ? "sk-..." : providerInput === 'nvidia' ? "nvapi-..." : "AI..."}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all outline-none"
                        />
                        <p className="mt-2 text-[10px] text-slate-500 flex justify-between">
                            <span>{lang === 'zh' ? '密钥仅存储于本地浏览器。' : 'Stored locally in your browser.'}</span>
                            {providerInput === 'gemini' ? (
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline">
                                    {lang === 'zh' ? '获取 Gemini 密钥' : 'Get Gemini Key'}
                                </a>
                            ) : providerInput === 'openai' ? (
                                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline">
                                    {lang === 'zh' ? '获取 OpenAI 密钥' : 'Get OpenAI Key'}
                                </a>
                            ) : null}
                        </p>
                    </div>
                    <button
                        onClick={saveSettings}
                        className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
      )}
      
      
      


      {/* --- History Saved Modal --- */}
      {showHistorySavedModal && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-fade-in" onClick={() => setShowHistorySavedModal(false)}></div>
            <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-10 text-center animate-scale-in">
                <div className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-200 mx-auto mb-8">
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-2">{lang === 'zh' ? '已存入历史记录' : 'Saved to History'}</h3>
                <p className="text-slate-500 font-medium text-xs uppercase tracking-widest leading-relaxed mb-10">
                    {lang === 'zh' ? '您的修改已自动备份。您随时可以在 History 面板中找回。' : 'Your changes have been automatically backed up. Access them anytime in the History panel.'}
                </p>
                <div className="space-y-4">
                    <button onClick={() => setShowHistorySavedModal(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl">
                        {lang === 'zh' ? '知道了' : 'Got it'}
                    </button>
                    <button 
                        onClick={() => {
                            localStorage.setItem('dont_show_history_reminder', 'true');
                            setDontShowHistoryReminder(true);
                            setShowHistorySavedModal(false);
                        }} 
                        className="w-full py-4 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 hover:text-slate-600 transition-all"
                    >
                        {lang === 'zh' ? '不再提醒' : "Don't show again"}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- Toast Notification --- */}
      

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bounce-in {
          0% { transform: translate(-50%, 100%); opacity: 0; }
          60% { transform: translate(-50%, -20%); opacity: 1; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .animate-scale-in { animation: scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-bounce-in { animation: bounce-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />
    </div>
  );
}

export default App;
