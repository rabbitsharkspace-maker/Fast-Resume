

export enum ResumeStyle {
  CLASSIC = 'Classic (Serif)',
  MODERN = 'Modern (Sans)',
  CREATIVE = 'Creative (Two-Column)',
}

// Fix: Expanded Template type to include Retro, Studio, and Pop for portfolio layouts
export type Template = 'Minimalist' | 'Professional' | 'Creative' | 'Academic' | 'Grid' | 'Retro' | 'Studio' | 'Pop';

export type Language = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'de' | 'fr' | 'ar';

export interface Skill {
  name: string;
  type: 'hard' | 'soft';
  matched: boolean;
}

export interface Experience {
  id: string;
  role: string;
  company: string;
  period: string;
  bullets: string[];
  isMatch: boolean;
  visible?: boolean; 
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  startDate: string;
  endDate: string;
  gpa?: string;
}

export interface ReferenceItem {
  id: string;
  fullName: string;
  jobTitle: string;
  company: string;
  contactInfo: string;
  relationship: string;
}

export interface ResumeContent {
  fullName: string;
  jobTitle?: string;
  contactInfo: string;
  linkedin?: string;
  github?: string;
  website?: string;
  summary: string;
  targetJobTitle?: string;
  targetCompany?: string;
  targetAddress?: string;
  recipientName?: string;
  technicalSkills: string[];
  softSkills: string[];
  experiences: Experience[];
  volunteer: Experience[];
  schoolProjects: Experience[]; // Added for School Projects
  education: EducationItem[];
  references: ReferenceItem[];
  awards?: string[];
}

export interface ScoreBreakdown {
  coreSkills: number; // 40%
  starQuality: number; // 30%
  industryRelevance: number; // 20%
  formatting: number; // 10%
  explanation: string;
}

export interface AnalysisResult {
  id?: string;
  timestamp?: number;
  detectedLanguage?: Language;
  overallScore: number;
  scoreBreakdown: ScoreBreakdown; // Detailed scoring
  weights: {
    jdRequirements: number;
    skillOverlap: number;
  };
  hardSkills: string[];
  softSkills: string[];
  missingSkills: string[];
  optimizedResume: ResumeContent;
  coverLetter: string;
}

export interface Project {
  id: string;
  // Relaxed types to support AI Classification
  type: string; // e.g., 'UI/Code', 'Photo', 'Document', 'Video'
  category: string; // e.g., 'Visual Design', 'Marketing Strategy', 'Video Content'
  originalMimeType: string;
  base64Data: string;
  title: string; 
  description: string; 
  originalFileName: string;
  associatedSkills?: string[]; // Key Competencies
  // New Social & Link Fields
  externalLink?: string;
  socialPlatform?: string; 
  customQrCode?: string; 
  section?: string;
}

export interface UserProfile {
  country: string;
  role: string; 
  photo: string | null; 
  bio?: string; 
}

export interface Theme {
  color: string; 
  secondaryColor?: string; 
  template: Template; 
}

export interface PortfolioData {
  userProfile: UserProfile;
  theme: Theme;
  projects: Project[];
  sections?: string[]; 
  healthScore: number;
  jobPackage: {
    resume: ResumeContent | null;
    coverLetter: string | null;
  };
}

// New Types for Career Predictor
export interface CareerPath {
  role: string;
  match: number;
  salaryRange: string;
  timeToReach: string;
  description: string;
  missingSkills: string[];
  reasoning?: string[];
  targetCompanies?: string[];
  detailedPlan?: { step: string; description: string; impact: string }[];
}

export interface CareerPredictionResult {
  currentLevel: string;
  skillTrajectory: { year: string; skill: string }[];
  paths: CareerPath[];
  actionPlan: { step: string; description: string; impact: string }[];
}