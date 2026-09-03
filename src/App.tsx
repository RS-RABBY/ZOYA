/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from "react";
import PermissionsScreen from "./components/PermissionsScreen";
import ZoyaOrb from "./components/ZoyaOrb";
import { AppState, ZoyaState } from "./types";
import { pcmToBase64, base64ToPcm } from "./lib/audio";
import { Mic, MicOff, Settings, Home, MessageSquare, Clock, Wrench, ChevronRight, User, Bell, Camera, FileText, Languages, Zap, Trash2, Shield, Monitor, Moon, Palette, FileDown, Terminal, Bug, Maximize2, Minimize2 } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isFloating, setIsFloating] = useState(false);
  const [appState, setAppState] = useState<AppState>({
    hasMicPermission: false,
    zoyaState: 'idle',
    isConnected: false,
  });
  
  const [micError, setMicError] = useState<string>();
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);

  // Audio Contexts and WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextPlaybackTimeRef = useRef<number>(0);
  const isSpeakingRef = useRef<boolean>(false);
  
  // Analysers
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);

  const updateAudioLevels = useCallback(() => {
    if (!inputAnalyserRef.current && !outputAnalyserRef.current) return;
    
    let level = 0;
    
    // Check output (Zoya speaking) first
    if (appState.zoyaState === 'speaking' && outputAnalyserRef.current) {
      const dataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
      outputAnalyserRef.current.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      level = sum / dataArray.length / 255;
    } 
    // Check input (User speaking)
    else if (!isMuted && inputAnalyserRef.current) {
      const dataArray = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
      inputAnalyserRef.current.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      level = sum / dataArray.length / 255;
      
      if (level > 0.05 && appState.zoyaState === 'idle') {
         setAppState(s => ({...s, zoyaState: 'listening'}));
      }
    }

    setAudioLevel(level);
    animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
  }, [appState.zoyaState, isMuted]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [updateAudioLevels]);

  const handleToolCall = (toolCall: any) => {
    console.log("Received Tool Call:", toolCall);
    toolCall.functionCalls.forEach((call: any) => {
      const { name, args } = call;
      if (name === "openApp") {
        const appName = args.appName?.toLowerCase();
        if (appName === "youtube") window.location.href = "https://youtube.com";
        else if (appName === "instagram") window.location.href = "https://instagram.com";
        else alert(`JOYA is attempting to open app: ${appName}`);
      } else if (name === "searchAndCallContact") {
        if (args.phoneNumber) {
          window.location.href = `tel:${args.phoneNumber}`;
        } else {
          alert(`JOYA wants to call ${args.contactName}. Opening dialer...`);
          window.location.href = `tel:5550199`; 
        }
      } else if (name === "handleCall") {
        alert(`JOYA handled incoming call: ${args.action} for ${args.contactName}`);
      } else if (name === "searchYouTube") {
        window.location.href = `https://youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
      } else if (name === "sendWhatsAppMessage") {
         const url = `whatsapp://send?text=${encodeURIComponent(args.message)}`;
         window.location.href = url;
      } else if (name === "sendGmail") {
         const url = `mailto:${args.recipientEmail}?subject=${encodeURIComponent(args.subject)}&body=${encodeURIComponent(args.body)}`;
         window.location.href = url;
      }
    });
  };

  const initAudioAndWS = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setAppState(s => ({ ...s, hasMicPermission: true, zoyaState: 'idle' }));
      
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputCtx;
      
      const outAnalyser = outputCtx.createAnalyser();
      outAnalyser.fftSize = 256;
      outAnalyser.connect(outputCtx.destination);
      outputAnalyserRef.current = outAnalyser;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputCtx;
      
      const inAnalyser = inputCtx.createAnalyser();
      inAnalyser.fftSize = 256;
      inputAnalyserRef.current = inAnalyser;

      const source = inputCtx.createMediaStreamSource(stream);
      source.connect(inAnalyser);
      
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      inAnalyser.connect(processor);
      processor.connect(inputCtx.destination);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Connected to Zoya WebSocket");
        setAppState(s => ({ ...s, isConnected: true }));
      };

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && !isMuted) {
          const pcmData = e.inputBuffer.getChannelData(0);
          const base64 = pcmToBase64(pcmData);
          ws.send(JSON.stringify({ audio: base64 }));
        }
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.interrupted) {
          console.log("Interrupted by user");
          nextPlaybackTimeRef.current = outputCtx.currentTime;
          setAppState(s => ({ ...s, zoyaState: 'idle' }));
        }

        if (msg.toolCall) {
           setAppState(s => ({ ...s, zoyaState: 'thinking' }));
           handleToolCall(msg.toolCall);
        }

        if (msg.audio) {
          setAppState(s => ({ ...s, zoyaState: 'speaking' }));
          isSpeakingRef.current = true;
          
          const pcmData = base64ToPcm(msg.audio);
          const buffer = outputCtx.createBuffer(1, pcmData.length, 24000);
          buffer.copyToChannel(pcmData, 0);
          
          const source = outputCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(outAnalyser);
          
          if (nextPlaybackTimeRef.current < outputCtx.currentTime) {
            nextPlaybackTimeRef.current = outputCtx.currentTime;
          }
          
          source.start(nextPlaybackTimeRef.current);
          nextPlaybackTimeRef.current += buffer.duration;
          
          source.onended = () => {
             if (outputCtx.currentTime >= nextPlaybackTimeRef.current - 0.1) {
                isSpeakingRef.current = false;
                setAppState(s => ({ ...s, zoyaState: 'idle' }));
             }
          };
        }
      };

      ws.onclose = () => {
        console.log("Disconnected from Zoya");
        setAppState(s => ({ ...s, isConnected: false, zoyaState: 'idle' }));
      };

    } catch (err: any) {
      console.error("Mic error:", err);
      let errorMessage = err.message || "Microphone access denied.";
      if (err.name === 'NotAllowedError' || err.message?.toLowerCase().includes('permission denied')) {
        errorMessage = "Microphone access blocked. Please click the lock icon in your address bar to allow it, or try opening this app in a New Tab (top right corner).";
      }
      setMicError(errorMessage);
    }
  };

  if (!appState.hasMicPermission) {
    return <PermissionsScreen onGrant={initAudioAndWS} error={micError} />;
  }

  return (
    <div className="flex flex-col h-screen bg-[#000000] text-[#ffffff] font-sans relative overflow-hidden">
      
      {/* Header */}
      <header className="px-6 py-4 flex justify-between items-center z-20 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-wider">JOYA</h1>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10">
            <div className={`w-1.5 h-1.5 rounded-full ${appState.isConnected ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{appState.isConnected ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsFloating(!isFloating)} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            {isFloating ? <Maximize2 className="w-4 h-4 text-[#FF2A2A]" /> : <Minimize2 className="w-4 h-4 text-gray-300" />}
          </button>
          <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            <User className="w-5 h-5 text-gray-300" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className={`flex-1 overflow-hidden relative ${isFloating ? 'opacity-20 pointer-events-none' : ''}`}>
        {activeTab === 'home' && (
          <div className="absolute inset-0 overflow-y-auto hide-scrollbar px-6 pb-32 flex flex-col">
            <div className="mt-4 mb-8">
              <h2 className="text-3xl font-semibold mb-1">Hi, Master.</h2>
              <p className="text-gray-400 text-sm">How can I assist you today?</p>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center min-h-[350px] relative mb-12">
              <ZoyaOrb state={appState.zoyaState} audioLevel={audioLevel} />
              <div className="absolute -bottom-6 text-center">
                <span className="text-[#FF2A2A] text-xs font-bold tracking-widest uppercase bg-[#FF2A2A]/10 px-4 py-2 rounded-full border border-[#FF2A2A]/20">
                  {appState.zoyaState === 'listening' ? 'Listening...' : 
                   appState.zoyaState === 'speaking' ? 'Speaking...' : 
                   appState.zoyaState === 'thinking' ? 'Processing...' : 'Ready to Assist'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="glass-card p-4 flex flex-col gap-3 cursor-pointer" onClick={() => setActiveTab('chat')}>
                <div className="w-10 h-10 rounded-full bg-[#FF2A2A]/20 flex items-center justify-center text-[#FF2A2A]">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <span className="font-medium text-sm">Chat</span>
              </div>
              <div className="glass-card p-4 flex flex-col gap-3 cursor-pointer" onClick={() => setIsMuted(!isMuted)}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${!isMuted ? 'bg-[#FF2A2A]/20 text-[#FF2A2A]' : 'bg-white/5 text-gray-500'}`}>
                  {!isMuted ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </div>
                <span className="font-medium text-sm">Voice {isMuted ? '(Muted)' : ''}</span>
              </div>
              <div className="glass-card-subtle p-4 flex flex-col gap-3 cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-[#FFC107]/20 flex items-center justify-center text-[#FFC107]">
                  <Camera className="w-5 h-5" />
                </div>
                <span className="font-medium text-sm text-gray-300">Vision</span>
              </div>
              <div className="glass-card-subtle p-4 flex flex-col gap-3 cursor-pointer" onClick={() => setActiveTab('tools')}>
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <Wrench className="w-5 h-5" />
                </div>
                <span className="font-medium text-sm text-gray-300">Tools</span>
              </div>
            </div>

            <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
              {[{icon: FileText, label: 'Notes'}, {icon: Bell, label: 'Reminder'}, {icon: Camera, label: 'Camera'}, {icon: Languages, label: 'Translate'}].map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-2 min-w-[72px] cursor-pointer">
                  <div className="w-14 h-14 rounded-[20px] bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-[#FFC107] transition-colors">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] text-gray-400 font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="absolute inset-0 flex flex-col">
            <div className="px-6 py-4 flex items-center gap-4 border-b border-white/5 shrink-0">
              <div className="w-10 h-10 rounded-full bg-[radial-gradient(circle_at_30%_30%,#FF2A2A_0%,#4A0000_100%)] border border-[#FF2A2A]/50 shadow-[0_0_15px_rgba(255,42,42,0.3)]"></div>
              <div>
                <h2 className="font-bold">Chat with JOYA</h2>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-[10px] text-gray-400">Online</span>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 hide-scrollbar pb-[140px]">
              <div className="flex flex-col gap-2 self-end max-w-[80%]">
                 <div className="bg-transparent border border-[#FFC107]/50 text-[#FFC107] px-5 py-3 rounded-[24px] rounded-tr-sm text-sm">
                   Open WhatsApp and message John.
                 </div>
              </div>
              <div className="flex flex-col gap-2 self-start max-w-[80%]">
                 <div className="glass-card px-5 py-3 rounded-[24px] rounded-tl-sm text-sm text-gray-200">
                   On it, babe. Opening WhatsApp to message John now.
                 </div>
              </div>
            </div>

            <div className="absolute bottom-20 left-0 w-full px-6 py-4 bg-gradient-to-t from-black via-black/90 to-transparent">
              <div className="flex gap-2 mb-4 overflow-x-auto hide-scrollbar">
                {["What can you do?", "Set a timer", "Send an email"].map((chip, i) => (
                  <span key={i} className="whitespace-nowrap px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-gray-300 cursor-pointer">{chip}</span>
                ))}
              </div>
              <div className="flex items-center gap-3">
                 <input type="text" placeholder="Type a message..." className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3.5 text-sm text-white placeholder-gray-500 outline-none focus:border-[#FF2A2A]/50 transition-colors" disabled />
                 <button className="w-12 h-12 rounded-full bg-[#FF2A2A] shadow-[0_0_20px_rgba(255,42,42,0.4)] flex items-center justify-center shrink-0">
                   <Mic className="w-5 h-5 text-white" />
                 </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="absolute inset-0 overflow-y-auto px-6 pb-32 hide-scrollbar">
            <h2 className="text-2xl font-bold mb-6 mt-4">Settings</h2>
            
            <div className="flex flex-col gap-8">
              {/* AI Engine Settings */}
              <div>
                <h4 className="text-xs uppercase tracking-widest text-[#FF2A2A] mb-3 font-bold flex items-center gap-2"><Zap className="w-4 h-4"/> AI Engine</h4>
                <div className="glass-card-subtle p-5 flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400 font-medium">AI Provider</label>
                    <select className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-[#FF2A2A]/50 transition-colors appearance-none">
                      <option className="bg-[#111]">Gemini (Google)</option>
                      <option className="bg-[#111]">OpenAI</option>
                      <option className="bg-[#111]">OpenRouter</option>
                      <option className="bg-[#111]">Custom Server</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400 font-medium">Model Selector</label>
                    <select className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-[#FF2A2A]/50 transition-colors appearance-none">
                      <option className="bg-[#111]">gemini-3.6-flash</option>
                      <option className="bg-[#111]">gemini-3.1-flash-live-preview</option>
                      <option className="bg-[#111]">gemini-1.5-pro</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400 font-medium">Custom API Key</label>
                    <input type="password" value="************************" readOnly className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-gray-400 outline-none focus:border-[#FF2A2A]/50 transition-colors" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400 font-medium">Base URL</label>
                    <input type="text" placeholder="https://generativelanguage.googleapis.com/v1beta" readOnly className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-gray-400 outline-none focus:border-[#FF2A2A]/50 transition-colors" />
                  </div>
                  <button className="mt-2 w-full py-3 rounded-xl bg-[#FF2A2A]/10 text-[#FF2A2A] border border-[#FF2A2A]/20 font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#FF2A2A]/20 transition-colors">
                    <Zap className="w-4 h-4 fill-current" /> Test Connection
                  </button>
                </div>
              </div>

              {/* AI Memory */}
              <div>
                <h4 className="text-xs uppercase tracking-widest text-[#FFC107] mb-3 font-bold flex items-center gap-2"><Clock className="w-4 h-4"/> AI Memory</h4>
                <div className="glass-card-subtle flex flex-col gap-4 p-5">
                   <div className="flex justify-between items-center">
                     <div>
                       <span className="text-sm font-medium block">Long-term Memory (Room)</span>
                       <span className="text-[10px] text-gray-500">Persistent database storage</span>
                     </div>
                     <div className="w-10 h-6 rounded-full bg-[#FF2A2A] relative cursor-pointer"><div className="w-4 h-4 rounded-full bg-white absolute right-1 top-1 shadow-sm"></div></div>
                   </div>
                   <div className="flex flex-col gap-2 mt-2">
                     <label className="text-xs text-gray-400 font-medium">Custom Call Name</label>
                     <input type="text" placeholder="Boss, Rabby, etc." defaultValue="Boss" className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-[#FFC107]/50 transition-colors" />
                   </div>
                   <div className="flex gap-2 mt-2">
                     <button className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors">Save</button>
                     <button className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition-colors">Edit</button>
                     <button className="flex-1 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors">Forget</button>
                   </div>
                </div>
              </div>

              {/* Preferences */}
              <div>
                <h4 className="text-xs uppercase tracking-widest text-blue-400 mb-3 font-bold flex items-center gap-2"><User className="w-4 h-4"/> Preferences</h4>
                <div className="glass-card-subtle flex flex-col divide-y divide-white/5">
                   <div className="flex justify-between items-center p-5 cursor-pointer hover:bg-white/5 transition-colors">
                     <span className="text-sm font-medium">Voice Speed / Pitch</span>
                     <ChevronRight className="w-4 h-4 text-gray-500" />
                   </div>
                   <div className="flex justify-between items-center p-5 cursor-pointer hover:bg-white/5 transition-colors">
                     <span className="text-sm font-medium block">Export Chat</span>
                     <div className="flex gap-2">
                       <span className="px-2 py-1 rounded bg-white/5 text-[10px] text-gray-400 font-bold border border-white/10">PDF</span>
                       <span className="px-2 py-1 rounded bg-white/5 text-[10px] text-gray-400 font-bold border border-white/10">MD</span>
                     </div>
                   </div>
                   <div className="flex justify-between items-center p-5 text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors rounded-b-3xl">
                     <span className="text-sm font-medium">Clear Cache</span>
                     <Trash2 className="w-4 h-4" />
                   </div>
                </div>
              </div>

              {/* Theme */}
              <div>
                <h4 className="text-xs uppercase tracking-widest text-purple-400 mb-3 font-bold flex items-center gap-2"><Palette className="w-4 h-4"/> Theme</h4>
                <div className="glass-card-subtle flex flex-col divide-y divide-white/5">
                   <div className="flex justify-between items-center p-5">
                     <span className="text-sm font-medium">App Theme</span>
                     <select className="bg-transparent text-sm text-gray-300 outline-none appearance-none text-right">
                       <option className="bg-[#111]">AMOLED Black</option>
                       <option className="bg-[#111]">Light</option>
                       <option className="bg-[#111]">System</option>
                     </select>
                   </div>
                   <div className="flex justify-between items-center p-5">
                     <span className="text-sm font-medium">Accent Color</span>
                     <div className="flex gap-2">
                       <div className="w-4 h-4 rounded-full bg-[#FF2A2A] border border-white/20"></div>
                       <div className="w-4 h-4 rounded-full bg-[#FFC107] border border-white/20 opacity-50"></div>
                     </div>
                   </div>
                </div>
              </div>

              {/* Developer Mode */}
              <div>
                <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-3 font-bold flex items-center gap-2"><Terminal className="w-4 h-4"/> Developer Mode</h4>
                <div className="glass-card-subtle flex flex-col divide-y divide-white/5">
                   <div className="flex justify-between items-center p-5 cursor-pointer hover:bg-white/5 transition-colors">
                     <span className="text-sm font-medium">Automation Logs</span>
                     <ChevronRight className="w-4 h-4 text-gray-500" />
                   </div>
                   <div className="flex justify-between items-center p-5 cursor-pointer hover:bg-white/5 transition-colors">
                     <span className="text-sm font-medium">Permission Checker</span>
                     <Shield className="w-4 h-4 text-gray-500" />
                   </div>
                   <div className="flex justify-between items-center p-5 cursor-pointer hover:bg-white/5 transition-colors rounded-b-3xl">
                     <span className="text-sm font-medium">Debug Panel</span>
                     <Bug className="w-4 h-4 text-gray-500" />
                   </div>
                </div>
              </div>

              {/* System Permissions */}
              <div>
                <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-3 font-bold flex items-center gap-2"><Shield className="w-4 h-4"/> Required Permissions</h4>
                <div className="glass-card-subtle flex flex-col divide-y divide-white/5">
                   {['Microphone', 'Camera', 'Contacts', 'Phone', 'SMS', 'Storage / Photos', 'Notifications', 'Overlay (Display over apps)', 'Accessibility Service', 'Vibration & Haptic'].map((perm, i) => (
                     <div key={i} className="flex justify-between items-center p-4">
                       <span className="text-sm text-gray-300">{perm}</span>
                       <div className="flex items-center gap-2 text-green-500 text-[10px] uppercase tracking-wider font-bold">
                         <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div> Granted
                       </div>
                     </div>
                   ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {(activeTab === 'history' || activeTab === 'tools') && (
           <div className="absolute inset-0 flex flex-col items-center justify-center opacity-50">
             <Wrench className="w-12 h-12 text-gray-500 mb-4" />
             <p className="font-medium text-gray-400 capitalize">{activeTab} Interface</p>
             <p className="text-sm text-gray-600">Coming Soon</p>
           </div>
        )}
      </div>

      {/* Floating Overlay Layer */}
      {isFloating && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="glass-card p-4 rounded-full pointer-events-auto cursor-move shadow-[0_0_40px_rgba(255,42,42,0.3)] animate-bounce hover:scale-110 transition-transform">
            <div className="scale-50 -m-16">
              <ZoyaOrb state={appState.zoyaState} audioLevel={audioLevel} />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className={`absolute bottom-0 w-full bg-[#000000]/90 backdrop-blur-xl border-t border-white/10 px-6 py-4 flex justify-between items-center z-50 transition-transform ${isFloating ? 'translate-y-full' : ''}`}>
        {[
          { id: 'home', icon: Home, label: 'Home' },
          { id: 'chat', icon: MessageSquare, label: 'Chat' },
          { id: 'history', icon: Clock, label: 'History' },
          { id: 'tools', icon: Wrench, label: 'Tools' },
          { id: 'settings', icon: Settings, label: 'Settings' }
        ].map((tab) => (
          <div 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id)} 
            className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${activeTab === tab.id ? 'text-[#FF2A2A]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'drop-shadow-[0_0_8px_rgba(255,42,42,0.6)]' : ''}`} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </div>
        ))}
      </nav>
    </div>
  );
}
