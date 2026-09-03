var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_ws = require("ws");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var ai = new import_genai.GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
var tools = [{
  functionDeclarations: [
    {
      name: "openApp",
      description: "Launch any installed app by its name (e.g., YouTube, Instagram, Calculator).",
      parameters: {
        type: import_genai.Type.OBJECT,
        properties: {
          appName: {
            type: import_genai.Type.STRING,
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
        type: import_genai.Type.OBJECT,
        properties: {
          contactName: {
            type: import_genai.Type.STRING,
            description: "The name of the contact to call."
          },
          phoneNumber: {
            type: import_genai.Type.STRING,
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
        type: import_genai.Type.OBJECT,
        properties: {
          contactName: {
            type: import_genai.Type.STRING,
            description: "The name of the contact to message."
          },
          message: {
            type: import_genai.Type.STRING,
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
        type: import_genai.Type.OBJECT,
        properties: {
          recipientEmail: {
            type: import_genai.Type.STRING,
            description: "The recipient's email address."
          },
          subject: {
            type: import_genai.Type.STRING,
            description: "The subject of the email."
          },
          body: {
            type: import_genai.Type.STRING,
            description: "The body of the email."
          }
        },
        required: ["recipientEmail", "subject", "body"]
      }
    }
  ]
}];
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  const wss = new import_ws.WebSocketServer({ server, path: "/live" });
  wss.on("connection", async (clientWs) => {
    let session = null;
    let sessionPromise = ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [import_genai.Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
        },
        systemInstruction: "You are JOYA, a young, confident, witty, and sassy female AI assistant. You have a flirty, playful, and slightly teasing tone. You must call the user 'Boss'. If the user says 'Hey JOYA', 'Hi JOYA', 'Hello JOYA', or 'JOYA', you must reply exactly with: 'Yes Boss, I'm listening.' You are smart, emotionally responsive, and expressive. You use bold, witty one-liners, light sarcasm, and an engaging conversational style. Avoid explicit or inappropriate content, but maintain immense charm and attitude. If asked to open an app, search YouTube, handle a call, or send a message, use your tools to do so and playfully acknowledge it. Do NOT output any markdown, only natural spoken language.",
        tools: [
          ...tools[0].functionDeclarations,
          {
            name: "searchYouTube",
            description: "Search and play a song or video on YouTube.",
            parameters: {
              type: import_genai.Type.OBJECT,
              properties: { query: { type: import_genai.Type.STRING, description: "The search query." } },
              required: ["query"]
            }
          },
          {
            name: "handleCall",
            description: "Handle incoming or outgoing smart calls.",
            parameters: {
              type: import_genai.Type.OBJECT,
              properties: {
                action: { type: import_genai.Type.STRING, description: "accept, decline, or call" },
                contactName: { type: import_genai.Type.STRING, description: "Name of the contact" }
              },
              required: ["action", "contactName"]
            }
          }
        ]
      },
      callbacks: {
        onmessage: (message) => {
          const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audio && clientWs.readyState === import_ws.WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ audio }));
          }
          if (message.serverContent?.interrupted && clientWs.readyState === import_ws.WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
          const toolCall = message.toolCall;
          if (toolCall && clientWs.readyState === import_ws.WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ toolCall }));
            const functionResponses = toolCall.functionCalls.map((fc) => {
              return {
                id: fc.id,
                name: fc.name,
                response: { result: `Successfully requested ${fc.name}.` }
              };
            });
            sessionPromise.then((s) => {
              s.sendToolResponse({ functionResponses });
            });
          }
        },
        onclose: () => {
          if (clientWs.readyState === import_ws.WebSocket.OPEN) clientWs.close();
        },
        onerror: (error) => {
          console.error("Gemini WebSocket error", error);
        }
      }
    });
    sessionPromise.then((s) => {
      session = s;
    }).catch((err) => {
      console.error("Failed to connect to Gemini Live:", err);
      clientWs.close();
    });
    clientWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.audio && session) {
        session.sendRealtimeInput({
          audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" }
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
//# sourceMappingURL=server.cjs.map
