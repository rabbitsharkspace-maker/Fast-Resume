
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AnalysisResult, Project, ResumeContent, CareerPredictionResult, Language } from "../types";

export enum Type {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  NULL = "NULL",
}

export const generateContentFromBackend = async (options: any): Promise<any> => {
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('user_gemini_api_key')?.trim() : null;
  const provider = typeof window !== 'undefined' ? localStorage.getItem('user_llm_provider') || 'gemini' : 'gemini';
  const preferredModel = typeof window !== 'undefined' ? localStorage.getItem('user_llm_model') : 'default';
  
  // Detection for static hosting environments (like GitHub Pages/Cloudflare Pages)
  const isStaticHost = typeof window !== 'undefined' && 
    (window.location.hostname.includes('github.io') || 
     window.location.hostname.includes('cloudflare.com') ||
     window.location.hostname.includes('pages.dev') ||
     window.location.hostname.includes('fastresume.xyz') || // User's custom domain
     window.location.hostname.includes('vercel.app') ||
     window.location.hostname.includes('netlify.app') ||
     !window.location.hostname.includes('run.app')); // AI Studio dev env usually ends in run.app

  // Try direct client-side call first if we have a key
  if (apiKey && typeof window !== 'undefined') {
    // --- GEMINI DIRECT CLIENT CALL ---
    if (provider === 'gemini') {
      try {
        console.log('Using direct client-side Gemini call (v1)...');
        const genAI = new GoogleGenerativeAI(apiKey);
        
        let modelId = (preferredModel && preferredModel !== 'default') ? preferredModel : (options.model || "gemini-1.5-flash");

        const model = genAI.getGenerativeModel({
          model: modelId,
          systemInstruction: options.config?.systemInstruction
        }, { apiVersion: 'v1beta' });

        const formattedContents = Array.isArray(options.contents) 
          ? options.contents.map((c: any) => ({ 
              role: c.role || 'user', 
              parts: (Array.isArray(c.parts) ? c.parts : [{ text: String(c.parts) }]).map((p: any) => p.inlineData ? p : { text: p.text || String(p) })
            }))
          : [{ 
              role: 'user', 
              parts: (options.contents?.parts || [{ text: String(options.contents) }]).map((p: any) => p.inlineData ? p : { text: p.text || String(p) }) 
            }];

        const result = await model.generateContent({
          contents: formattedContents,
          generationConfig: {
            responseMimeType: options.config?.responseMimeType,
            responseSchema: options.config?.responseSchema,
          }
        });
        const response = await result.response;
        return { text: () => response.text() } as any;
      } catch (directError) {
        console.warn('Direct client-side Gemini call failed:', directError);
        if (isStaticHost) {
          throw new Error(`Client-side Gemini call failed: ${directError instanceof Error ? directError.message : String(directError)}. Please check your API key in Settings.`);
        }
      }
    }

    // --- OPENAI / GPT-5 DIRECT CLIENT CALL ---
    if (provider === 'openai') {
      try {
        console.log('Using direct client-side OpenAI call...');
        const systemInstruction = options.config?.systemInstruction ? String(options.config.systemInstruction) : undefined;
        const requiresJson = options.config?.responseMimeType === 'application/json';
        const schemaString = options.config?.responseSchema ? JSON.stringify(options.config.responseSchema) : '';

        const messages = [];
        let sysPrompt = systemInstruction || '';
        if (requiresJson && schemaString) {
            sysPrompt += "\n\nIMPORTANT: You must return valid JSON ONLY, strictly adhering to this schema:\n" + schemaString;
        }
        if (sysPrompt) {
          messages.push({ role: 'system', content: sysPrompt });
        }

        const items = Array.isArray(options.contents) ? options.contents : [options.contents];
        for (const msg of items) {
            const role = msg.role === 'model' ? 'assistant' : (msg.role === 'assistant' ? 'assistant' : 'user');
            const parts = Array.isArray(msg.parts) ? msg.parts : [{ text: String(msg) }];
            const oaiParts = [];
            for (const p of parts) {
                if (p.text) oaiParts.push({ type: 'text', text: p.text });
                if (p.inlineData) {
                    if (p.inlineData.mimeType.startsWith('image/')) {
                      oaiParts.push({ type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } });
                    }
                }
            }
            messages.push({ role, content: oaiParts.length === 1 && oaiParts[0].type === 'text' ? oaiParts[0].text : oaiParts });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${apiKey}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({
            model: (preferredModel && preferredModel !== 'default') ? preferredModel : "gpt-4o",
            messages,
            response_format: requiresJson ? { type: "json_object" } : undefined
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `OpenAI error: ${response.status}`);
        }

        const data = await response.json();
        let content = data.choices[0].message.content;
        return { text: () => content } as any;
      } catch (directError) {
        console.warn('Direct client-side OpenAI call failed:', directError);
        if (isStaticHost) throw directError;
      }
    }

    // --- ANTHROPIC / CLAUDE 3.5 / 4.x DIRECT CLIENT CALL ---
    if (provider === 'anthropic') {
      try {
        console.log('Using direct client-side Anthropic call...');
        const systemInstruction = options.config?.systemInstruction ? String(options.config.systemInstruction) : undefined;
        const messages = [];
        const items = Array.isArray(options.contents) ? options.contents : [options.contents];
        
        for (const msg of items) {
          const role = msg.role === 'model' ? 'assistant' : (msg.role === 'assistant' ? 'assistant' : 'user');
          const parts = Array.isArray(msg.parts) ? msg.parts : [{ text: String(msg) }];
          const antParts = [];
          for (const p of parts) {
            if (p.text) antParts.push({ type: 'text', text: p.text });
            if (p.inlineData) {
              antParts.push({ 
                type: 'image', 
                source: { 
                  type: 'base64', 
                  media_type: p.inlineData.mimeType, 
                  data: p.inlineData.data 
                } 
              });
            }
          }
          messages.push({ role, content: antParts });
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'dangerously-allow-browser': 'true' // Note: This usually requires a proxy if not supported by the endpoint
          },
          body: JSON.stringify({
            model: (preferredModel && preferredModel !== 'default') ? preferredModel : "claude-sonnet-4-6",
            max_tokens: 4096,
            system: systemInstruction,
            messages: messages
          })
        });

        if (!response.ok) {
           const errorData = await response.json().catch(() => ({}));
           throw new Error(errorData.error?.message || `Anthropic error: ${response.status}`);
        }

        const data = await response.json();
        return { text: () => data.content[0].text } as any;
      } catch (directError) {
        console.warn('Direct client-side Anthropic call failed:', directError);
        if (isStaticHost) throw directError;
      }
    }

    // --- NVIDIA NIM DIRECT CLIENT CALL ---
    if (provider === 'nvidia') {
      try {
        console.log('Using direct client-side Nvidia NIM call...');
        const systemInstruction = options.config?.systemInstruction ? String(options.config.systemInstruction) : undefined;
        const messages = [];
        if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
        
        const items = Array.isArray(options.contents) ? options.contents : [options.contents];
        for (const msg of items) {
          const role = msg.role === 'model' ? 'assistant' : (msg.role === 'assistant' ? 'assistant' : 'user');
          messages.push({ role, content: Array.isArray(msg.parts) ? msg.parts[0].text : String(msg) });
        }

        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: (preferredModel && preferredModel !== 'default') ? preferredModel : "nvidia/llama-3.1-405b-instruct",
            messages,
            max_tokens: 4096
          })
        });

        if (!response.ok) {
           const errorData = await response.json().catch(() => ({}));
           throw new Error(errorData.error?.message || `Nvidia error: ${response.status}`);
        }

        const data = await response.json();
        return { text: () => data.choices[0].message.content } as any;
      } catch (directError) {
        console.warn('Direct client-side Nvidia call failed:', directError);
        if (isStaticHost) throw directError;
      }
    }
  }

  // Pre-fetch check for static hosts without keys
  if (isStaticHost && !apiKey) {
    throw new Error('This site is hosted on a static server. You MUST provide your own API Key in Settings to use the AI features.');
  }

  console.log('Sending request to /api/gemini with options:', JSON.stringify(options).substring(0, 200) + '...');
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'generateContent', apiKey, provider, ...options })
  });
  
  if (!response.ok) {
    if (response.status === 405 || response.status === 404) {
      throw new Error(`Backend unavailable (HTTP ${response.status}). If you are hosting on a static platform like GitHub Pages or Cloudflare, you must provide your own API Key in the Settings menu.`);
    }
    const errorData = await response.json().catch(() => ({}));
    console.error('Backend returned error:', errorData);
    throw new Error(errorData.error || `HTTP error ${response.status}`);
  }
  
  const data = await response.json();
  console.log('Backend returned success:', JSON.stringify(data).substring(0, 200) + '...');
  if (data.text && typeof data.text === 'string') {
    return { text: () => data.text } as any;
  }
  return data;
};

// Helper function for exponential backoff retry strategy
export async function callGeminiWithRetry<T>(
  apiCall: () => Promise<T>,
  retries = 5,
  delay = 4000,
  timeoutMs = 45000
): Promise<T> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Gemini API timeout')), timeoutMs)
    );
    return await Promise.race([apiCall(), timeoutPromise]);
  } catch (error: any) {
    const errorCode = error.status || error.code || error.error?.code || error.response?.status;
    const errorMessage = error.message || error.error?.message || JSON.stringify(error);
    
    const isRateLimit = 
        errorCode === 429 || 
        errorCode === 'RESOURCE_EXHAUSTED' || 
        (errorMessage && (
            errorMessage.includes('429') || 
            errorMessage.includes('RESOURCE_EXHAUSTED') || 
            errorMessage.includes('quota') ||
            errorMessage.includes('exceeded')
        ));
        
    const isServerOverload = errorCode === 503 || errorCode === 500;
    
    if (retries > 0 && (isRateLimit || isServerOverload)) {
      await new Promise(resolve => setTimeout(resolve, delay));
      const nextDelay = delay * 1.5 + Math.random() * 500;
      return callGeminiWithRetry(apiCall, retries - 1, nextDelay, timeoutMs);
    }
    throw error;
  }
}

export interface FileInput {
  mimeType: string;
  data: string;
}

export const analyzeResume = async (
  jdText: string, 
  resumeInput?: string | FileInput,
  targetLang: Language = 'en',
  enVariant: string = 'American'
): Promise<AnalysisResult> => {
  console.log('analyzeResume called with JD length:', jdText.length, 'and input type:', typeof resumeInput);
  const model = "gemini-1.5-flash";
  const isTextResume = typeof resumeInput === 'string';
  
  let userContentPart: any;
  let isFile = false;

  if (typeof resumeInput === 'object' && resumeInput !== null) {
     isFile = true;
     userContentPart = { inlineData: { mimeType: resumeInput.mimeType, data: resumeInput.data } };
  } else {
     userContentPart = { text: resumeInput || "No resume provided" };
  }

  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];

  const systemInstruction = `
    Role: Expert Resume Parser & ATS Strategist.
    CRITICAL OBJECTIVE: Extract COMPLETE history, optimize with STAR method, and write a 300-400 word cover letter.
    MATCHING REGIME: Be EXTREMELY STRICTOR with the 'overallScore'.
    - If the [TARGET JD] is non-informative (e.g., "hi", "test", "hello", "123", or extremely short < 50 characters), the match score MUST be very low (0-5%). This is because a real match cannot be verified against no requirements.
    - VALIDATION: A match score > 80% should only occur if the candidate's resume shows clear, specific alignment with the requirements in the JD. 
    - RELEVANCE: Look for semantic matching between resume experiences and JD requirements. If the JD is just a greeting or a single word, there is NO match.
    - Penalize heavily (at least -40 points) for missing core hard skills or industry-specific tools mentioned in a valid JD.
    Output ONLY in ${langName}.
    LANGUAGE VARIANT: ${enVariant}
  `;

  const promptText = `
    [TARGET JD]
    ${jdText}
    [RESUME SOURCE]
    ${isFile ? 'Analyze the attached file for full work history extraction.' : userContentPart.text}
  `;

  const parts: any[] = [{ text: promptText }];
  if (isFile) parts.push(userContentPart);

  try {
    const response = await callGeminiWithRetry(() => generateContentFromBackend({
      model: model,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: { type: Type.STRING },
            overallScore: { type: Type.NUMBER },
            scoreBreakdown: {
                type: Type.OBJECT,
                properties: {
                    coreSkills: { type: Type.NUMBER },
                    starQuality: { type: Type.NUMBER },
                    industryRelevance: { type: Type.NUMBER },
                    formatting: { type: Type.NUMBER },
                    explanation: { type: Type.STRING }
                },
                required: ['coreSkills', 'starQuality', 'industryRelevance', 'formatting', 'explanation']
            },
            weights: {
              type: Type.OBJECT,
              properties: { jdRequirements: { type: Type.NUMBER }, skillOverlap: { type: Type.NUMBER } }
            },
            hardSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            coverLetter: { type: Type.STRING },
            optimizedResume: {
              type: Type.OBJECT,
              properties: {
                fullName: { type: Type.STRING },
                jobTitle: { type: Type.STRING, description: "The candidate's current or target job title" },
                contactInfo: { type: Type.STRING },
                summary: { type: Type.STRING },
                technicalSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                education: { 
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { school: { type: Type.STRING }, degree: { type: Type.STRING }, startDate: { type: Type.STRING }, endDate: { type: Type.STRING }, gpa: { type: Type.STRING } }
                  } 
                },
                experiences: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { role: { type: Type.STRING }, company: { type: Type.STRING }, period: { type: Type.STRING }, bullets: { type: Type.ARRAY, items: { type: Type.STRING } }, isMatch: { type: Type.BOOLEAN } },
                    required: ["role", "company", "period", "bullets", "isMatch"]
                  }
                },
                volunteer: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { role: { type: Type.STRING }, company: { type: Type.STRING }, period: { type: Type.STRING }, bullets: { type: Type.ARRAY, items: { type: Type.STRING } }, isMatch: { type: Type.BOOLEAN } }, required: ["role", "company", "period", "bullets", "isMatch"] } },
                schoolProjects: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { role: { type: Type.STRING }, company: { type: Type.STRING }, period: { type: Type.STRING }, bullets: { type: Type.ARRAY, items: { type: Type.STRING } }, isMatch: { type: Type.BOOLEAN } }, required: ["role", "company", "period", "bullets", "isMatch"] } },
                awards: { type: Type.ARRAY, items: { type: Type.STRING } },
                references: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, fullName: { type: Type.STRING }, jobTitle: { type: Type.STRING }, company: { type: Type.STRING }, contactInfo: { type: Type.STRING }, relationship: { type: Type.STRING } }, required: ["fullName", "jobTitle", "company"] } }
              },
              required: ["fullName", "jobTitle", "summary", "technicalSkills", "experiences"]
            }
          },
          required: ["detectedLanguage", "overallScore", "scoreBreakdown", "optimizedResume"]
        }
      }
    }));
    
    const responseText = typeof response.text === 'function' ? response.text() : (response as any).text;
    const parsed = JSON.parse(responseText || '{}') as AnalysisResult;

    if (parsed.optimizedResume) {
        const timestamp = Date.now();
        parsed.optimizedResume.experiences = parsed.optimizedResume.experiences?.map((e, i) => ({ ...e, id: e.id || `exp-${timestamp}-${i}` })) || [];
        parsed.optimizedResume.volunteer = parsed.optimizedResume.volunteer?.map((e, i) => ({ ...e, id: e.id || `vol-${timestamp}-${i}` })) || [];
        parsed.optimizedResume.schoolProjects = parsed.optimizedResume.schoolProjects?.map((e, i) => ({ ...e, id: e.id || `proj-${timestamp}-${i}` })) || [];
        parsed.optimizedResume.education = parsed.optimizedResume.education?.map((e, i) => ({ ...e, id: e.id || `edu-${timestamp}-${i}` })) || [];
        parsed.optimizedResume.references = parsed.optimizedResume.references?.map((e, i) => ({ ...e, id: e.id || `ref-${timestamp}-${i}` })) || [];
    }

    return parsed;
  } catch (error) { throw error; }
};

export const analyzeProjectMedia = async (
  inputData: string, 
  mimeType: string,
  fileName: string,
  targetLang: Language = 'en'
): Promise<Omit<Project, 'id' | 'originalFileName' | 'originalMimeType' | 'base64Data'>> => {
  const model = "gemini-1.5-flash";
  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
  
  const systemInstruction = `
    Role: Creative Portfolio Director & Copywriter.
    Objective: Create a high-impact portfolio entry for the provided file.
    
    Guidelines:
    1. TITLE: Create a punchy, professional title (e.g., "Brand Identity Design" instead of "logo.png").
    2. DESCRIPTION: Write a compelling 3-4 sentence narrative explaining the project's goals, the skills used, and the presumed impact.
    3. CATEGORY: Classify precisely (e.g., Visual Design, Strategy Report, UI/UX Concept).
    
    Language: ${langName} ONLY.
  `;
  
  const parts: any[] = [];
  if (mimeType === 'text/plain') parts.push({ text: `Content of file: ${inputData.substring(0, 8000)}` });
  else parts.push({ inlineData: { data: inputData, mimeType } });
  
  parts.push({ text: `Analyze the file "${fileName}" and generate a professional portfolio title and executive description.` });

  try {
    const response = await callGeminiWithRetry(() => generateContentFromBackend({
      model, 
      contents: { parts }, 
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            category: { type: Type.STRING },
            type: { type: Type.STRING },
            description: { type: Type.STRING },
            keyCompetencies: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "category", "description", "keyCompetencies"]
        }
      },
    }));
    const responseText = typeof response.text === 'function' ? response.text() : (response as any).text;
    const result = JSON.parse(responseText || '{}');
    return { 
      category: result.category || 'Professional Project', 
      type: result.type || 'Document', 
      title: result.title || fileName, 
      description: result.description || 'Analysis complete.', 
      associatedSkills: result.keyCompetencies || [] 
    };
  } catch (error) { 
    console.error("analyzeProjectMedia error:", error);
    return { category: 'Portfolio Item', type: 'Document', title: fileName.replace(/\.[^/.]+$/, ""), description: 'File uploaded to portfolio.', associatedSkills: [] }; 
  }
};

export const generatePortfolioBio = async (projects: Project[], resume: ResumeContent | null, targetLang: Language = 'en'): Promise<{ bio: string; role: string }> => {
    const model = "gemini-1.5-flash";
    const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
    
    const systemInstruction = `
      Role: World-class Personal Branding Expert.
      Task: Write a punchy, inspiring 2-3 sentence "About Me" bio and a definitive job title.
      
      Context:
      - Use the Resume Summary for core history.
      - Use the Portfolio Projects to show what the candidate is actively working on.
      
      Style: Modern, confident, and professional. NO clichés like "passionate professional".
      Language: ${langName} ONLY.
    `;
    
    const prompt = `
      [RESUME DATA]
      ${resume?.summary || 'No summary available'}
      [PORTFOLIO PROJECT TITLES]
      ${projects.map(p => p.title).join(', ')}
    `;
    
    try {
        const response = await callGeminiWithRetry(() => generateContentFromBackend({ 
          model, 
          contents: prompt, 
          config: { 
            systemInstruction, 
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                bio: { type: Type.STRING },
                role: { type: Type.STRING }
              },
              required: ["bio", "role"]
            }
          } 
        }));
        const responseText = typeof response.text === 'function' ? response.text() : (response as any).text;
        return JSON.parse(responseText || '{}');
    } catch (e) { 
      return { bio: "Professional portfolio showcasing creative work and strategic projects.", role: resume?.targetJobTitle || "Professional" }; 
    }
};

export const generateDocumentSummary = async (base64Data: string, mimeType: string, targetLang: Language = 'en'): Promise<{ summary: string; keyPoints: string[] }> => {
    const model = "gemini-1.5-flash";
    const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
    try {
        const parts: any[] = [];
        if (mimeType === 'text/plain') parts.push({ text: base64Data.substring(0, 10000) });
        else parts.push({ inlineData: { data: base64Data, mimeType } });
        parts.push({ text: `Summarize in ${langName} and extract 3-5 key competencies.` });
        const response = await callGeminiWithRetry(() => generateContentFromBackend({
            model, contents: { parts }, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } } } } }
        }));
        const responseText = typeof response.text === 'function' ? response.text() : (response as any).text;
        return JSON.parse(responseText || '{}');
    } catch (e) { return { summary: "Analysis unavailable.", keyPoints: [] }; }
};

export const generateCareerPrediction = async (
  projects: Project[],
  resume: ResumeContent | null,
  targetRole?: string,
  targetLang: Language = 'en'
): Promise<CareerPredictionResult> => {
  const model = "gemini-1.5-flash";
  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];

  const systemInstruction = `
    Role: Career Futurist and Executive Recruiter.
    Task: Suggest 3 potential career paths.
    CRITICAL: The current year is 2026. All career trajectories and skill milestones MUST start from 2026 and move forward (e.g., 2026, 2027, 2028). DO NOT include years prior to 2026.
    CRITICAL: For each path, "description" MUST be a detailed, 3-4 sentence professional overview.
    *** TARGET LANGUAGE: ${langName} ***
  `;

  const prompt = `
    [RESUME] ${resume?.summary || ''}
    [PROJECTS] ${projects.map(p => p.title).join(', ')}
    ${targetRole ? `TARGET ROLE REQUESTED: ${targetRole}` : 'Predict the best natural evolution.'}
  `;

  try {
    const response = await callGeminiWithRetry(() => generateContentFromBackend({
      model,
      contents: prompt,
      config: { 
          systemInstruction, 
          responseMimeType: "application/json",
          responseSchema: {
              type: Type.OBJECT,
              properties: {
                  currentLevel: { type: Type.STRING },
                  skillTrajectory: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { year: { type: Type.STRING }, skill: { type: Type.STRING } } } },
                  paths: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              role: { type: Type.STRING },
                              match: { type: Type.NUMBER },
                              salaryRange: { type: Type.STRING },
                              timeToReach: { type: Type.STRING },
                              description: { type: Type.STRING },
                              missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } }
                          }
                      }
                  },
                  actionPlan: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              step: { type: Type.STRING },
                              description: { type: Type.STRING },
                              impact: { type: Type.STRING }
                          }
                      }
                  }
              }
          }
      }
    }));
    const responseText = typeof response.text === 'function' ? response.text() : (response as any).text;
    return JSON.parse(responseText || '{}');
  } catch (error: any) { 
    return { currentLevel: `Analysis Failed: ${error.message || JSON.stringify(error)}`, skillTrajectory: [], paths: [], actionPlan: [] }; 
  }
};

export const generateCareerStrategy = async (
    resume: ResumeContent | null,
    projects: Project[],
    targetRole: string,
    missingSkills: string[],
    targetLang: Language = 'en'
): Promise<any> => {
    const model = "gemini-1.5-flash";
    const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
    try {
        const response = await callGeminiWithRetry(() => generateContentFromBackend({
            model,
            contents: `Generate an INTERNAL DEPLOYMENT STRATEGY for "${targetRole}" in ${langName}.`,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        gapFix: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { topic: { type: Type.STRING }, advice: { type: Type.STRING }, resource: { type: Type.STRING } } } },
                        interviewPrep: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, suggestedAnswer: { type: Type.STRING } } } },
                        portfolioUpgrade: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, strategy: { type: Type.STRING } } } }
                    }
                }
            }
        }));
        const responseText = typeof response.text === 'function' ? response.text() : (response as any).text;
    return JSON.parse(responseText || '{}');
    } catch (e) { return {}; }
};

export const getAICoachResponse = async (chatHistory: any[], portfolioData: any, resumeContent: any, jdText: any, targetLang: Language = 'en'): Promise<string> => {
  const model = "gemini-1.5-flash";
  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];
  
  const systemInstruction = `
    Role: AI Career Coach & Recruitment Expert.
    Context: You are analyzing the user's Portfolio, Resume, and Target Job Description.
    Goal: Provide actionable, specific advice to improve their application and career prospects.
    Tone: Professional, encouraging, and direct.
    CRITICAL: You MUST reply in ${langName} ONLY.
  `;
  
  try {
    const response = await callGeminiWithRetry(() => generateContentFromBackend({ 
        model, 
        contents: chatHistory, 
        config: { systemInstruction } 
    }));
    const responseText = typeof response.text === 'function' ? response.text() : (response as any).text;
    return responseText || "No response.";
  } catch (error) { return "I'm having trouble connecting right now. Please try again."; }
};

export const analyzeWebsiteContent = async (
  htmlContent: string,
  targetLang: Language = 'en'
): Promise<{ projects: Omit<Project, 'id' | 'originalFileName' | 'originalMimeType' | 'base64Data'>[] }> => {
  const model = "gemini-1.5-flash";
  const langName = { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[targetLang];

  const systemInstruction = `
    Role: Portfolio Curator & Content Strategist.
    Task: Analyze the provided website HTML content and extract distinct portfolio projects.
    Objective: Identify key projects, case studies, or work samples.
    Guidelines:
    1. For each project, extract a Title, a Category (e.g., Web Design, Case Study), and a Description (3-4 sentences).
    2. Identify Key Competencies/Skills used in each project.
    3. If there are no clear projects, summarize the website's main sections as "projects" (e.g., "About Me", "Services").
    Language: ${langName} ONLY.
  `;

  try {
    const response = await callGeminiWithRetry(() => generateContentFromBackend({
      model,
      contents: `Analyze this website content and extract portfolio projects:\n\n${htmlContent.substring(0, 30000)}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  category: { type: Type.STRING },
                  description: { type: Type.STRING },
                  associatedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  externalLink: { type: Type.STRING }
                },
                required: ["title", "category", "description", "associatedSkills"]
              }
            }
          }
        }
      }
    }));
    const responseText = typeof response.text === 'function' ? response.text() : (response as any).text;
    return JSON.parse(responseText || '{ "projects": [] }');
  } catch (error) {
    console.error("Website analysis failed", error);
    return { projects: [] };
  }
};

export const detectLanguage = async (text: string): Promise<Language> => {
  try {
    const response = await callGeminiWithRetry(() => generateContentFromBackend({
      model: "gemini-2.5-flash",
      contents: `Detect lang: "${text.substring(0, 100)}". Return ONLY 2-letter code.`,
    }));
    const responseText = typeof response.text === 'function' ? response.text() : (response as any).text;
    const code = responseText?.trim().toLowerCase();
    const valid: Language[] = ['en', 'zh', 'ja', 'ko', 'es', 'de', 'fr', 'ar'];
    return valid.includes(code as Language) ? (code as Language) : 'en';
  } catch (e) { return 'en'; }
};
