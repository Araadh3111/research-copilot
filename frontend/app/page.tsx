"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ReactLenis } from 'lenis/react';
import { Search, Sparkles, BookOpen, Layers, ArrowRight, ChevronDown, CheckCircle2, Globe, ArrowUpRight } from 'lucide-react';

export default function ResearcaCinematic() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [workspaceActive, setWorkspaceActive] = useState(false);
  
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  
  // Parallax transforms for the background elements
  const yBg = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacityHero = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const scaleHero = useTransform(scrollYProgress, [0, 0.4], [1, 0.95]);

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    
    setTimeout(() => {
      setIsSearching(false);
      setWorkspaceActive(true);
      // Smooth scroll slightly down to reveal the workspace seamlessly
      window.scrollTo({ top: window.innerHeight * 0.8, behavior: 'smooth' });
    }, 2400);
  };

  return (
    <ReactLenis root>
      <div ref={containerRef} className="min-h-[200vh] bg-[#020205] text-white font-sans selection:bg-purple-500/30 overflow-x-hidden relative">
        
        {/* CINEMATIC BACKGROUND GEARS */}
        <motion.div style={{ y: yBg }} className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          {/* Deep Space Purple Radial Glow */}
          <div className="absolute top-[-10%] left-[50%] -translate-x-[50%] w-[100vw] h-[70vh] bg-gradient-to-b from-purple-900/20 via-indigo-900/5 to-transparent blur-[120px] rounded-full" />
          {/* Subtle Ambient Grid Layer */}
          <div className="absolute inset-0 bg-[radial-gradient(#1a153a_1px,transparent_1px)] [background-size:32px_32px] opacity-30" />
        </motion.div>

        {/* PERSISTENT FLOATING GLASS NAV */}
        <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-5xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-xl px-6 py-3 rounded-full flex justify-between items-center shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(147,51,234,0.5)]">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold tracking-wider text-sm font-mono">RESEARCHA</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-xs tracking-widest text-slate-400 font-mono">
            <a href="#" className="hover:text-purple-400 transition-colors">PLATFORM</a>
            <a href="#" className="hover:text-purple-400 transition-colors">INDEX</a>
            <a href="#" className="hover:text-purple-400 transition-colors">PRICING</a>
          </div>
          <button className="text-xs bg-white text-black font-semibold px-4 py-2 rounded-full hover:bg-purple-400 hover:text-white transition-all shadow-md">
            Enter Nexus
          </button>
        </nav>

        <AnimatePresence>
          {/* PORTAL INTERCEPT: RENDER FULL CINEMATIC BLURPORT ON SEARCH */}
          {isSearching && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-[#020205]/80 backdrop-blur-2xl flex flex-col items-center justify-center"
            >
              <div className="relative flex items-center justify-center">
                <motion.div 
                  animate={{ scale: [1, 1.1, 1], rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="w-32 h-32 rounded-full bg-gradient-to-tr from-purple-600/30 via-transparent to-indigo-500/30 absolute blur-xl"
                />
                <div className="w-16 h-16 border-2 border-purple-500/20 border-t-purple-400 rounded-full animate-spin" />
              </div>
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 text-xs font-mono tracking-[0.4em] uppercase text-purple-400 animate-pulse"
              >
                Synthesizing Academic Landscape...
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SECTION 1: HERO CONTAINER */}
        <motion.header 
          style={{ opacity: opacityHero, scale: scaleHero }}
          className="relative z-10 max-w-5xl mx-auto px-6 pt-44 pb-32 flex flex-col items-center min-h-screen text-center justify-center"
        >
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-1 border border-white/10 bg-white/[0.02] backdrop-blur-md rounded-full text-[11px] font-mono text-purple-300 tracking-widest uppercase mb-6 flex items-center gap-2"
          >
            <Globe className="w-3 h-3 animate-spin text-purple-400" style={{ animationDuration: '8s' }} />
            Architecting the Future of Journals
          </motion.div>

          <h1 className="text-5xl md:text-8xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-200 to-slate-500 max-w-4xl leading-[1.05] mb-8">
            Research fluidly.<br />Understand instantly.
          </h1>

          <p className="text-slate-400 max-w-xl text-base md:text-lg font-light leading-relaxed mb-12">
            Researca transforms millions of disconnected papers into a singular, interactive neural map context-tuned for you.
          </p>

          {/* FLUID SEARCH INPUT CONTAINER */}
          <form 
            onSubmit={handleSearchSubmit}
            className="w-full max-w-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 focus-within:border-purple-500/40 rounded-full p-2.5 flex items-center gap-3 shadow-[0_30px_60px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all duration-500"
          >
            <Search className="w-5 h-5 text-slate-400 ml-4 shrink-0" />
            <input 
              type="text"
              placeholder="Deploy a knowledge query..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent border-none outline-none py-3 text-white placeholder-slate-500 tracking-wide text-sm md:text-base"
            />
            <button 
              type="submit"
              className="bg-white hover:bg-purple-500 text-black hover:text-white font-medium px-6 py-3 rounded-full transition-all duration-300 flex items-center gap-2"
            >
              <span className="text-sm">Explore</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Anchor down arrow hint */}
          <div className="absolute bottom-10 flex flex-col items-center gap-2 text-slate-500 font-mono text-[10px] tracking-widest animate-bounce">
            <span>SCROLL TO ENGINE MATRIX</span>
            <ChevronDown className="w-4 h-4" />
          </div>
        </motion.header>

        {/* SECTION 2: THE MODERN LIQUID WORKSPACE */}
        <section className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-32">
          <div className={`transition-all duration-1000 transform ${workspaceActive ? 'opacity-100 translate-y-0 scale-100' : 'opacity-40 translate-y-20 scale-[0.97]'}`}>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* PANEL 1: KNOWLEDGE ARCHITECTURE SYNTHESIS */}
              <div className="lg:col-span-4 bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] backdrop-blur-xl rounded-3xl p-6 shadow-2xl transition-all duration-300 hover:border-white/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-wide">Neural Synthesis</h3>
                    <p className="text-[11px] text-slate-500 font-mono">COGNITIVE COMPILATION</p>
                  </div>
                </div>
                
                <div className="text-slate-300 font-light text-sm space-y-4 leading-relaxed">
                  <p>
                    Analyzing your global query grid outlines massive architectural overlaps across active files. Core findings point to highly optimized efficiency ratios.
                  </p>
                  <div className="bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl flex gap-3 items-start">
                    <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-400 font-mono">Consensus vector matches 10 targeted sources perfectly.</p>
                  </div>
                </div>
              </div>

              {/* PANEL 2: INTERACTIVE DOC FEED */}
              <div className="lg:col-span-5 bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] backdrop-blur-xl rounded-3xl p-6 shadow-2xl transition-all duration-300 hover:border-white/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-wide">Verified Ground Truths</h3>
                    <p className="text-[11px] text-slate-500 font-mono">ACTIVE INDICES (3)</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { t: "Attention Is All You Need", a: "Vaswani et al.", c: "120k+ citations" },
                    { t: "BERT: Deep Bidirectional Transformers", a: "Devlin et al.", c: "65k+ citations" },
                    { t: "LLMs as Chinchilla-scaling laws", a: "Hoffmann et al.", c: "3.4k+ citations" }
                  ].map((doc, idx) => (
                    <div key={idx} className="group p-4 bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.03] hover:border-white/10 rounded-2xl cursor-pointer transition-all duration-300 flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-medium text-slate-200 group-hover:text-purple-300 transition-colors mb-1">{doc.t}</h4>
                        <p className="text-[11px] text-slate-500">{doc.a} • <span className="font-mono text-[10px] text-purple-400/80">{doc.c}</span></p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                    </div>
                  ))}
                </div>
              </div>

              {/* PANEL 3: MANUSCRIPT EDITOR COMPONENT */}
              <div className="lg:col-span-3 bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] backdrop-blur-xl rounded-3xl p-6 shadow-2xl transition-all duration-300 hover:border-white/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-slate-500/10 flex items-center justify-center text-slate-300 border border-white/10">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-wide">Live Sandbox</h3>
                    <p className="text-[11px] text-slate-500 font-mono">MANUSCRIPT ENGINE</p>
                  </div>
                </div>

                <textarea 
                  className="w-full h-48 bg-white/[0.01] border border-white/[0.05] focus:border-purple-500/30 rounded-2xl p-4 text-xs text-slate-300 outline-none resize-none leading-relaxed placeholder-slate-700 transition-all mb-4"
                  placeholder="Draft insights directly onto your cloud journal canvas..."
                />
                
                <button className="w-full py-3 bg-white text-black hover:bg-purple-600 hover:text-white font-semibold rounded-2xl text-xs tracking-wider uppercase transition-all duration-300 shadow-md">
                  Export Compilation
                </button>
              </div>

            </div>
          </div>
        </section>
      </div>
    </ReactLenis>
  );
}