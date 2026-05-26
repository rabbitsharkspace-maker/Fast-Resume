import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import * as dotenv from "dotenv";
dotenv.config({ override: true });

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  const isDev = process.env.NODE_ENV !== "production";
  console.log('Initializing server components...');
  console.log('Environment:', isDev ? 'development' : 'production');
  
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    }
    next();
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
  });

  // Gemini API Proxy Endpoint
  app.post('/api/gemini', async (req, res) => {
    console.log('Received request to /api/gemini (Universal LLM Proxy)');
    try {
      const { method, model: requestedModel, contents, config, apiKey, provider = 'gemini' } = req.body;
      const key = apiKey?.trim();

      if (!key || key === 'TODO' || key.includes('YOUR_API_KEY')) {
        return res.status(400).json({ error: `Please provide your own ${provider} API key in Settings.` });
      }

      const systemInstruction = config?.systemInstruction ? String(config.systemInstruction) : undefined;
      const requiresJson = config?.responseMimeType === 'application/json';
      const schemaString = config?.responseSchema ? JSON.stringify(config.responseSchema) : '';

      // --- GEMINI ---
      if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(key);
        const genModel = genAI.getGenerativeModel({
          model: requestedModel || "gemini-2.5-flash",
          systemInstruction
        });

        const formattedContents = Array.isArray(contents) 
          ? contents.map((c: any) => ({ 
              role: c.role || 'user', 
              parts: (Array.isArray(c.parts) ? c.parts : [{ text: String(c.parts) }]).map((p: any) => p.inlineData ? p : { text: p.text || String(p) })
            }))
          : [{ role: 'user', parts: (contents?.parts || [{ text: String(contents) }]).map((p: any) => p.inlineData ? p : { text: p.text || String(p) }) }];

        const result = await genModel.generateContent({
          contents: formattedContents,
          generationConfig: {
            responseMimeType: config?.responseMimeType,
            responseSchema: config?.responseSchema,
          }
        });
        const response = await result.response;
        return res.json({ text: response.text() });
      }

      // --- OPENAI ---
      if (provider === 'openai') {
        const fetchStr = await import("node-fetch").then(m => m.default || fetch).catch(() => fetch);
        const messages = [];
        let sysPrompt = systemInstruction || '';
        if (requiresJson && schemaString) {
            sysPrompt += "\n\nIMPORTANT: You must return valid JSON ONLY, strictly adhering to this schema:\n" + schemaString;
        }
        if (sysPrompt) {
          messages.push({ role: 'system', content: sysPrompt });
        }

        const items = Array.isArray(contents) ? contents : [contents];
        for (const msg of items) {
            const role = msg.role === 'model' ? 'assistant' : 'user';
            const parts = Array.isArray(msg.parts) ? msg.parts : [{ text: String(msg) }];
            const oaiParts = [];
            for (const p of parts) {
                if (p.text) oaiParts.push({ type: 'text', text: p.text });
                if (p.inlineData) {
                    if (p.inlineData.mimeType === 'application/pdf') {
                        oaiParts.push({ type: 'text', text: '[PDF parsing not directly supported by OpenAI endpoint. Please use text extraction.]\nPDF Base64 Length: ' + p.inlineData.data.length });
                    } else if (p.inlineData.mimeType.startsWith('image/')) {
                        oaiParts.push({ type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } });
                    }
                }
            }
            messages.push({ role, content: oaiParts });
        }

        const openaiReq = {
            model: requestedModel || "gpt-4o",
            messages,
            response_format: requiresJson ? { type: "json_object" } : undefined
        };

        const resObj = await fetchStr('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(openaiReq)
        });
        const data = await resObj.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        let content = data.choices[0].message.content;
        if (requiresJson && content.startsWith('```json')) {
            content = content.replace(/^```json\n/, '').replace(/\n```$/, '');
        }
        return res.json({ text: content });
      }

      // --- ANTHROPIC ---
      if (provider === 'anthropic') {
        const fetchStr = await import("node-fetch").then(m => m.default || fetch).catch(() => fetch);
        const messages = [];
        let sysPrompt = systemInstruction || '';
        if (requiresJson && schemaString) {
            sysPrompt += "\n\nIMPORTANT: You must return valid JSON ONLY. Output nothing else. Strictly adhere to this schema:\n" + schemaString;
        }

        const items = Array.isArray(contents) ? contents : [contents];
        for (const msg of items) {
            const role = msg.role === 'model' ? 'assistant' : 'user';
            const parts = Array.isArray(msg.parts) ? msg.parts : [{ text: String(msg) }];
            const anthropicParts = [];
            for (const p of parts) {
                if (p.text) anthropicParts.push({ type: 'text', text: p.text });
                if (p.inlineData) {
                    if (p.inlineData.mimeType === 'application/pdf') {
                        anthropicParts.push({ 
                            type: 'document', 
                            source: {
                                type: 'base64',
                                media_type: 'application/pdf',
                                data: p.inlineData.data
                            }
                        });
                    } else if (p.inlineData.mimeType.startsWith('image/')) {
                        anthropicParts.push({ 
                            type: 'image', 
                            source: {
                                type: 'base64',
                                media_type: p.inlineData.mimeType,
                                data: p.inlineData.data
                            }
                        });
                    }
                }
            }
            messages.push({ role, content: anthropicParts });
        }

        const anthropicReq = {
            model: requestedModel || "claude-sonnet-4-6",
            max_tokens: 4096,
            system: sysPrompt,
            messages
        };

        const resObj = await fetchStr('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 
                'x-api-key': key, 
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(anthropicReq)
        });
        const data = await resObj.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        let textContent = data.content?.[0]?.text || "";
        if (requiresJson && textContent.startsWith('```json')) {
            textContent = textContent.replace(/^```json\n/, '').replace(/\n```$/, '');
        }
        return res.json({ text: textContent });
      }

      // --- NVIDIA ---
      if (provider === 'nvidia') {
        const fetchStr = await import("node-fetch").then(m => m.default || fetch).catch(() => fetch);
        const messages = [];
        let sysPrompt = systemInstruction || '';
        if (requiresJson && schemaString) {
            sysPrompt += "\n\nIMPORTANT: You must return valid JSON ONLY, strictly adhering to this schema:\n" + schemaString;
        }
        if (sysPrompt) {
          messages.push({ role: 'system', content: sysPrompt });
        }

        const items = Array.isArray(contents) ? contents : [contents];
        for (const msg of items) {
            const role = msg.role === 'model' ? 'assistant' : 'user';
            const parts = Array.isArray(msg.parts) ? msg.parts : [{ text: String(msg) }];
            // Nvidia endpoints prefer string content for standard format
            let stringContent = "";
            for (const p of parts) {
                if (p.text) stringContent += p.text + "\n";
                if (p.inlineData) stringContent += "[Attached file skipped for Nvidia API]\n";
            }
            messages.push({ role, content: stringContent });
        }

        const nvidiaReq = {
            model: requestedModel || "meta/llama-3.1-405b-instruct",
            messages,
            max_tokens: 4096
        };

        const resObj = await fetchStr('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(nvidiaReq)
        });
        const data = await resObj.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        let textContent = data.choices[0].message.content;
        if (requiresJson && textContent.startsWith('```json')) {
            textContent = textContent.replace(/^```json\n/, '').replace(/\n```$/, '');
        }
        return res.json({ text: textContent });
      }

      return res.status(400).json({ error: `Provider ${provider} not supported` });
    } catch (error: any) {
      console.error('[Universal Proxy] Error:', error);
      
      let errorMessage = error.message || 'Internal server error';
      if (errorMessage.includes('leaked') || (error.response?.data?.error?.message && error.response.data.error.message.includes('leaked'))) {
          errorMessage = "Your API key has been flagged as leaked and disabled by Google for security. Please update your API Key in Settings with a fresh one.";
      }

      return res.status(error.status || 500).json({ 
        error: errorMessage,
        details: error.response?.data || error
      });
    }
  });

  app.all('/api/*', (req, res) => {
    console.warn(`API Route not found: ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite middleware for development
  if (isDev) {
    console.log('Starting Vite in middleware mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log('Vite middleware attached.');
  } else {
    console.log('Serving static files from dist...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handling middleware for API routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled Error:', err);
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
    next(err);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`> Server is listening on port ${PORT}`);
    console.log(`> Health check available at http://0.0.0.0:${PORT}/api/health`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
