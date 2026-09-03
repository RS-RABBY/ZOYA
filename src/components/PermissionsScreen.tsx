import { Mic, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";

interface PermissionsScreenProps {
  onGrant: () => void;
  error?: string;
}

export default function PermissionsScreen({ onGrant, error }: PermissionsScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#000000] text-white p-8 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="max-w-md w-full flex flex-col items-center text-center space-y-8"
      >
        <div className="w-24 h-24 bg-[#FF2A2A]/10 rounded-full flex items-center justify-center border border-[#FF2A2A]/30 shadow-[0_0_40px_rgba(255,42,42,0.3)]">
          <Mic className="w-10 h-10 text-[#FF2A2A]" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-3xl font-light tracking-wide text-gray-100">Awaken JOYA</h1>
          <p className="text-gray-400 leading-relaxed text-sm">
            To enable real-time conversational streaming and background wake-word activation, 
            JOYA requires access to your microphone.
          </p>
        </div>

        {error && (
          <div className="flex flex-col items-center space-y-3 text-[#FFC107] bg-[#FFC107]/10 px-6 py-4 rounded-xl w-full border border-[#FFC107]/20 text-center">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-bold uppercase tracking-wider">Access Blocked</p>
            </div>
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {error && error.includes("New Tab") ? (
           <a href={window.location.href} target="_blank" rel="noreferrer" className="w-full text-center relative overflow-hidden group bg-[#FF2A2A] text-white font-bold text-sm tracking-widest uppercase py-4 rounded-full transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(255,42,42,0.4)]">
             🚀 Open in New Tab
           </a>
        ) : (
          <button
            onClick={onGrant}
            className="w-full relative overflow-hidden group glass-card text-white font-medium text-sm tracking-widest uppercase py-4 rounded-full transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-[#FF2A2A] opacity-0 group-hover:opacity-20 transition-opacity" />
            Grant Microphone Access
          </button>
        )}

        <p className="text-xs text-gray-600 mt-8">
          All audio processing streams securely over encrypted WebSockets.
        </p>
      </motion.div>
    </div>
  );
}
