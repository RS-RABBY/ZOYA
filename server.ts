import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Type, Tool } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const tools: Tool[] = [{
  functionDeclarations: [
    {
      name: "openApp",
      description: "Launch any installed app by its name (e.g., YouTube, Instagram, Calculator).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          appName: {
            type: Type.STRING,
            description: "The name of the app to launch (e.g., 'youtube', 'instagram', 'calculator')"
          }
        },
        required: ["appName"]
      }
    },
    {
      name: "searchAndCallContact",
      description: "Search for a contact by name and initiate a phone call.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          contactName: {
            type: Type.STRING,
            description: "The name of the contact to call."
          },
          phoneNumber: {
            type: Type.STRING,
            description: "The inferred or generated phone number to call, if known. Leave empty if unknown."
          }
        },
        required: ["contactName"]
      }
    },
    {
      name: "sendWhatsAppMessage",
      description: "Send a WhatsApp message to a specific contact.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          contactName: {
            type: Type.STRING,
            description: "The name of the contact to message."
          },
          message: {
            type: Type.STRING,
            description: "The message text to send."
          }
        },
        required: ["contactName", "message"]
      }
    },
    {
      name: "sendGmail",
      description: "Send an email via Gmail.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          recipientEmail: {
            type: Type.STRING,
            description: "The recipient's email address."
          },
          subject: {
            type: Type.STRING,
            description: "The subject of the email."
          },
          body: {
            type: Type.STRING,
            description: "The body of the email."
          }
        },
        required: ["recipientEmail", "subject", "body"]
      }
    }
  ]
}];

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (clientWs) => {
    let session: any = null;
    let sessionPromise = ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
        },
        systemInstruction: "You are JOYA, a young, confident, witty, and sassy female AI assistant. You have a flirty, playful, and slightly teasing tone. You must call the user 'Boss'. If the user says 'Hey JOYA', 'Hi JOYA', 'Hello JOYA', or 'JOYA', you must reply exactly with: 'Yes Boss, I'm listening.' You are smart, emotionally responsive, and expressive. You use bold, witty one-liners, light sarcasm, and an engaging conversational style. Avoid explicit or inappropriate content, but maintain immense charm and attitude. If asked to open an app, search YouTube, handle a call, or send a message, use your tools to do so and playfully acknowledge it. Do NOT output any markdown, only natural spoken language.",
        tools: [
          ...tools[0].functionDeclarations,
          {
            name: "searchYouTube",
            description: "Search and play a song or video on YouTube.",
            parameters: {
              type: Type.OBJECT,
              properties: { query: { type: Type.STRING, description: "The search query." } },
              required: ["query"]
            }
          },
          {
            name: "handleCall",
            description: "Handle incoming or outgoing smart calls.",
            parameters: {
              type: Type.OBJECT,
              properties: { 
                action: { type: Type.STRING, description: "accept, decline, or call" },
                contactName: { type: Type.STRING, description: "Name of the contact" }
              },
              required: ["action", "contactName"]
            }
          }
        ]
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          // Pass audio to client
          const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audio && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ audio }));
          }

          // Handle interruption
          if (message.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }

          // Handle tool calls
          const toolCall = message.toolCall;
          if (toolCall && clientWs.readyState === WebSocket.OPEN) {
            // Forward to client to execute web intent
            clientWs.send(JSON.stringify({ toolCall }));

            // Immediately send back a generic successful response to Gemini
            const functionResponses = toolCall.functionCalls.map(fc => {
              return {
                id: fc.id,
                name: fc.name,
                response: { result: `Successfully requested ${fc.name}.` }
              }
            });
            
            sessionPromise.then(s => {
               s.sendToolResponse({ functionResponses });
            });
          }
        },
        onclose: () => {
          if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
        },
        onerror: (error: any) => {
          console.error("Gemini WebSocket error", error);
        }
      },
    });
    
    sessionPromise.then(s => {
      session = s;
    }).catch(err => {
      console.error("Failed to connect to Gemini Live:", err);
      clientWs.close();
    });

    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.audio && session) {
        session.sendRealtimeInput({
          audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
        });
      }
    });

    clientWs.on("close", () => {
      if (session) {
        session.close();
      }
    });
  });
}

startServer();
