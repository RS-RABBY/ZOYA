import { motion } from "motion/react";
import { ZoyaState } from "../types";
import { useMemo } from "react";

interface ZoyaOrbProps {
  state: ZoyaState;
  audioLevel?: number; // 0 to 1
}

export default function ZoyaOrb({ state, audioLevel = 0 }: ZoyaOrbProps) {
  // Generate 160 micro particles as requested
  const particles = useMemo(() => {
    return Array.from({ length: 160 }).map((_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()); 
      const size = 1 + Math.random() * 2.5; 
      return { id: i, angle, distance, size };
    });
  }, []);

  let maxRadius = 15;
  let rotationSpeed = 20;
  let glowOpacity = 0.2;
  let glowScale = 0.5;
  let idlePulse = [1, 1, 1];

  if (state === 'idle') {
    maxRadius = 25; // Small, dot-like
    idlePulse = [0.95, 1.05, 0.95]; // Slow breathing pulse
    glowOpacity = 0.3;
  } else if (state === 'listening') {
    maxRadius = 60 + (audioLevel * 40); // Expand and react to waves
    rotationSpeed = 8;
    glowOpacity = 0.5;
    glowScale = 1.2;
  } else if (state === 'thinking') {
    maxRadius = 45;
    rotationSpeed = 3; // Fast clockwise
    glowOpacity = 0.8;
    glowScale = 1.4;
  } else if (state === 'speaking') {
    maxRadius = 50 + (audioLevel * 60); // Expand and contract with voice
    rotationSpeed = 12;
    glowOpacity = 0.4 + (audioLevel * 0.5);
    glowScale = 1 + audioLevel;
  }

  return (
    <div className="relative flex items-center justify-center w-64 h-64 group cursor-pointer">
      {/* Background Aura */}
      <div className='absolute inset-0 bg-[radial-gradient(circle,rgba(255,42,42,0.15)_0%,transparent_60%)] pointer-events-none'></div>

      <motion.div
        className="relative flex items-center justify-center w-full h-full z-10"
        animate={{ 
          rotate: 360,
          scale: state === 'idle' ? idlePulse : 1
        }}
        transition={{
          rotate: { repeat: Infinity, duration: rotationSpeed, ease: "linear" },
          scale: { repeat: state === 'idle' ? Infinity : 0, duration: 3, ease: "easeInOut" }
        }}
      >
        {/* Core Glow */}
        <motion.div 
          className="absolute rounded-full bg-[#FF2A2A] blur-[20px] mix-blend-screen"
          style={{ width: 50, height: 50 }}
          animate={{ scale: glowScale, opacity: glowOpacity }}
          transition={{ duration: 0.15 }}
        />
        
        {/* Micro Particles */}
        {particles.map(p => {
          const r = p.distance * maxRadius;
          const x = Math.cos(p.angle) * r;
          const y = Math.sin(p.angle) * r;
          
          // Introduce yellow accent particles
          const isYellow = p.id % 6 === 0;
          const color = isYellow ? '#FFC107' : '#FF2A2A';

          return (
            <motion.div
              key={p.id}
              className="absolute rounded-full"
              style={{ 
                width: p.size, 
                height: p.size,
                backgroundColor: color,
                boxShadow: `0 0 ${p.size * 2}px ${color}`
              }}
              animate={{ 
                x, y,
                opacity: 0.4 + Math.random() * 0.6
              }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            />
          )
        })}
      </motion.div>
    </div>
  );
}
