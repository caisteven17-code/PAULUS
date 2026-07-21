'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Loader2, ChevronRight } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { dataService } from '../../services/dataService';
import { FinancialRecord } from '../../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface StewardChatbotProps {
  currentEntityId?: string;
}

const CrowImage: React.FC<{ size?: number; className?: string }> = ({ size = 42, className }) => (
  <Image
    src="/assets/steward-crow-bread-v2.png"
    alt=""
    width={size}
    height={size}
    className={`object-contain ${className ?? ''}`}
    aria-hidden="true"
    priority
  />
);

const AnimatedHeaderCrow: React.FC<{ cycle: number }> = ({ cycle }) => {
  const [bendFrame, setBendFrame] = useState(0);

  useEffect(() => {
    if (cycle === 0) return;

    // Upright pause, anatomical crouch, ground pickup, then rise.
    const bendSequence = [0, 0, 0, 1, 2, 3, 3, 3, 4, 5, 0];
    let sequenceIndex = 0;
    setBendFrame(0);
    const frameTimer = window.setInterval(() => {
      sequenceIndex += 1;
      setBendFrame(bendSequence[Math.min(sequenceIndex, bendSequence.length - 1)]);
      if (sequenceIndex >= bendSequence.length - 1) window.clearInterval(frameTimer);
    }, 220);

    return () => window.clearInterval(frameTimer);
  }, [cycle]);

  return (
    <div className="relative h-12 w-12 overflow-visible" aria-hidden="true">
      <div
        className="absolute inset-[7px]"
        style={{
          backgroundImage: 'url(/assets/steward-crow-bend.png)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '600% 100%',
          backgroundPosition: `${(bendFrame * 100) / 5}% center`,
        }}
      />
      <motion.div
        key={`bread-${cycle}`}
        className="absolute left-1 top-2.5 h-3 w-4"
        animate={
          cycle > 0
            ? {
                x: [0, 0, 1, 2, 2, 2, 2, 2, 1, 0, 0],
                y: [0, 11, 20, 20, 20, 20, 20, 20, 14, 7, 0],
                rotate: [0, -15, -48, -62, -62, -62, -62, -62, -42, -20, 0],
              }
            : { x: 0, y: 0, rotate: 0 }
        }
        transition={{
          duration: 2.2,
          ease: 'linear',
          times: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
        }}
      >
        <Image src="/assets/steward-bread.png" alt="" fill className="object-contain" priority />
      </motion.div>
    </div>
  );
};

const playCrowCalls = () => {
  const AudioContextClass =
    window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const audioContext = new AudioContextClass();
  const makeCaw = (delay: number) => {
    const start = audioContext.currentTime + delay;

    [0, 0.16].forEach((syllableDelay, index) => {
      const syllableStart = start + syllableDelay;
      const oscillator = audioContext.createOscillator();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(index === 0 ? 540 : 470, syllableStart);
      oscillator.frequency.exponentialRampToValueAtTime(index === 0 ? 190 : 165, syllableStart + 0.3);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1350, syllableStart);
      filter.frequency.exponentialRampToValueAtTime(520, syllableStart + 0.32);
      filter.Q.value = 2.4;
      gain.gain.setValueAtTime(0.0001, syllableStart);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.2 : 0.13, syllableStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, syllableStart + 0.34);

      oscillator.connect(filter).connect(gain).connect(audioContext.destination);
      oscillator.start(syllableStart);
      oscillator.stop(syllableStart + 0.36);
    });
  };

  makeCaw(0);
  makeCaw(2.45);
  window.setTimeout(() => void audioContext.close(), 3400);
};

export const StewardChatbot: React.FC<StewardChatbotProps> = ({ currentEntityId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  const [flightFrame, setFlightFrame] = useState(0);
  const [flightArea, setFlightArea] = useState({ width: 0, height: 0 });
  const [headerAnimationCycle, setHeaderAnimationCycle] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        "Greetings, Bishop. I am Steward, your AI financial assistant. How may I assist you with the diocese's financial health today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cache for scores and diagnostics to avoid redundant expensive calls
  const scoresCache = useRef<Record<string, any>>({});
  const diagnosticCache = useRef<Record<string, any>>({});

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const updateFlightArea = () =>
      setFlightArea({
        width: Math.max(window.innerWidth - 160, 0),
        height: Math.max(window.innerHeight - 190, 0),
      });

    updateFlightArea();
    window.addEventListener('resize', updateFlightArea);
    return () => window.removeEventListener('resize', updateFlightArea);
  }, []);

  useEffect(() => {
    if (!isFlying) {
      setFlightFrame(0);
      return;
    }

    // Full flap, recovery, and a held glide pose before the next flap.
    const frameSequence = [0, 1, 2, 3, 4, 5, 6, 7, 7, 7, 7, 7, 6, 5, 4, 3, 2, 1];
    let sequenceIndex = 0;
    const frameTimer = window.setInterval(() => {
      sequenceIndex = (sequenceIndex + 1) % frameSequence.length;
      setFlightFrame(frameSequence[sequenceIndex]);
    }, 105);

    return () => window.clearInterval(frameTimer);
  }, [isFlying]);

  useEffect(() => {
    if (!isOpen) return;

    const firstDrop = window.setTimeout(() => setHeaderAnimationCycle((cycle) => cycle + 1), 4000);
    const repeatedDrops = window.setInterval(() => setHeaderAnimationCycle((cycle) => cycle + 1), 30000);
    return () => {
      window.clearTimeout(firstDrop);
      window.clearInterval(repeatedDrops);
    };
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Create a placeholder for the assistant's response
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Fetch all records to calculate real health scores
      const allRecords = await dataService.getAllRecords();

      // Get unique entities (filter out any undefined entityIds)
      const entities = Array.from(new Set(allRecords.map((r) => r.entityId).filter((id): id is string => id != null)));

      interface ScoreData {
        id: string;
        score: number;
        class: string | undefined;
        analysis: string;
        recommendations: string | undefined;
        dimensions: string;
      }

      // Calculate real health scores for each entity (with caching)
      const scores = await Promise.all(
        entities.map(async (id): Promise<ScoreData> => {
          // Check cache first
          if (scoresCache.current[id]) return scoresCache.current[id] as ScoreData;

          const record = allRecords.find((r) => r.entityId === id);
          const score = await dataService.calculateHealthScore(
            id,
            (record?.entityType as any) || 'parish',
            record?.entityClass,
          );

          const scoreData: ScoreData = {
            id,
            score: score.compositeScore,
            class: score.entityClass,
            analysis: score.analysis ?? '',
            recommendations: score.recommendations?.join('; '),
            dimensions: JSON.stringify(score.dimensions),
          };

          // Update cache
          scoresCache.current[id] = scoreData;
          return scoreData;
        }),
      );

      // Fetch diagnostic for current entity (with caching)
      let currentDiagnostic = '';
      if (currentEntityId) {
        if (diagnosticCache.current[currentEntityId]) {
          currentDiagnostic = diagnosticCache.current[currentEntityId];
        } else {
          const entityRecords = allRecords.filter((r) => r.entityId === currentEntityId);
          const latestMonth = entityRecords.length > 0 ? entityRecords[entityRecords.length - 1].month : 'Jan';
          const diag = await dataService.getDiagnostic(currentEntityId, latestMonth);
          currentDiagnostic = diag.analysis || '';
          diagnosticCache.current[currentEntityId] = currentDiagnostic;
        }
      }

      // Check if Gemini API key is available
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Chatbot is disabled in prototype mode. Please configure GEMINI_API_KEY in your environment.');
      }

      const scoreSummary = scores
        .map(
          (s) =>
            `ENTITY: ${s.id}\nCLASS: ${s.class || 'Unknown'}\nSCORE: ${s.score}/100\nANALYSIS: ${s.analysis}\nRECOMMENDATIONS: ${s.recommendations}\nDIMENSIONS: ${s.dimensions}`,
        )
        .join('\n---\n');

      const ai = new GoogleGenAI({ apiKey });

      // Filter history to ensure it starts with a user message
      const history = messages.concat(userMessage);
      const firstUserIndex = history.findIndex((m) => m.role === 'user');
      const validHistory = firstUserIndex !== -1 ? history.slice(firstUserIndex) : [userMessage];

      const currentContext = currentEntityId
        ? `The user is currently viewing data for: ${currentEntityId}. Prioritize information about this entity. Its AI Diagnostic is: "${currentDiagnostic}".`
        : '';

      const stream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: validHistory.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        config: {
          systemInstruction: `You are "Steward", a wise, compassionate, and helpful AI financial assistant for a Catholic Diocese. 
          Your tone is professional yet warm. Use proper titles like "Father" or "Bishop" when appropriate.
          You support both English and Tagalog.
          
          CRITICAL GUIDELINES:
          1. BE EXTREMELY CONCISE. If the user asks for a number, give the number first.
          2. NO FILLER: Do not use polite preambles like "I'm happy to help" or "Based on the data". Just provide the answer.
          3. ACCURACY: Use the ACTUAL HEALTH SCORES, ANALYSIS, and AI DIAGNOSTIC provided below. Do NOT guess.
          4. CONSISTENCY: Your analysis MUST match the provided "ANALYSIS" and "AI Diagnostic" fields for each entity.
          5. NUMBERS FIRST: Always lead with the score or amount if requested.
          
          ${currentContext}
          
          DATA CONTEXT (Actual Health Scores, Analysis & AI Diagnostics):
          ${scoreSummary}
          
          If a parish is not in the list, state that you don't have its specific data yet.
          
          Always prioritize the mission of the Church while ensuring financial stewardship.`,
        },
      });

      let fullText = '';
      let hasContent = false;

      for await (const chunk of stream) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullText += chunkText;
          hasContent = true;
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: fullText } : msg)),
          );
        }
      }

      if (!hasContent) {
        throw new Error('No content received from AI');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: `I apologize, Father. I encountered an error while trying to process your request. (${errorMessage}). Please try again later.`,
              }
            : msg,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const suggestedPrompts = [
    'How is San Roque Parish doing?',
    'Why did collections drop last month?',
    'Show me struggling parishes',
    'What are your recommendations for the Eastern Vicariate?',
  ];

  return (
    <>
      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          if (isFlying) return;
          if (flightArea.width === 0) {
            setIsOpen(true);
            return;
          }
          playCrowCalls();
          setIsFlying(true);
        }}
        disabled={isFlying}
        aria-label="Open Steward AI chat"
        className="fixed bottom-6 right-6 w-16 h-16 bg-gold-500 text-black rounded-full shadow-[0_8px_32px_rgba(212,175,55,0.4)] flex items-center justify-center z-50 cursor-pointer border-2 border-gold-600/20"
      >
        {isFlying ? (
          <motion.div
            className="absolute h-[128px] w-[96px] drop-shadow-[0_7px_6px_rgba(0,0,0,0.35)]"
            style={{
              offsetPath: `path("M 0 0 C ${-flightArea.width * 0.18} ${-flightArea.height * 0.12}, ${-flightArea.width * 0.52} ${-flightArea.height * 0.58}, ${-flightArea.width * 0.72} ${-flightArea.height * 0.38} C ${-flightArea.width * 0.92} ${-flightArea.height * 0.18}, ${-flightArea.width * 0.42} ${-flightArea.height * 0.05}, 0 0")`,
              offsetRotate: '0deg',
            }}
            initial={{ offsetDistance: '0%', scale: 0.58, rotate: -4 }}
            animate={{
              offsetDistance: ['0%', '28%', '50%', '72%', '100%'],
              scale: [0.58, 0.92, 1, 0.9, 0.58],
              rotate: [-4, -7, -11, 6, 2],
            }}
            transition={{ duration: 5.4, ease: 'linear', times: [0, 0.28, 0.5, 0.72, 1] }}
            onAnimationComplete={() => {
              setIsFlying(false);
              setIsOpen(true);
            }}
          >
            <motion.div
              className="absolute inset-0"
              style={{
                backgroundImage: 'url(/assets/steward-crow-flight-v2.png)',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '800% 100%',
                backgroundPosition: `${(flightFrame * 100) / 7}% center`,
              }}
              animate={{ opacity: [1, 1, 0, 0] }}
              transition={{ duration: 5.4, ease: 'linear', times: [0, 0.44, 0.56, 1] }}
            />
            <motion.div
              className="absolute inset-0 -scale-x-100"
              style={{
                backgroundImage: 'url(/assets/steward-crow-flight-v2.png)',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '800% 100%',
                backgroundPosition: `${(flightFrame * 100) / 7}% center`,
              }}
              animate={{ opacity: [0, 0, 1, 1] }}
              transition={{ duration: 5.4, ease: 'linear', times: [0, 0.44, 0.56, 1] }}
            />
          </motion.div>
        ) : (
          <CrowImage size={48} className="drop-shadow-sm" />
        )}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-24 right-6 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-gray-200 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-black p-5 flex justify-between items-center text-white border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gold-500 rounded-2xl flex items-center justify-center shadow-lg shadow-gold-500/20">
                  <AnimatedHeaderCrow cycle={headerAnimationCycle} />
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase tracking-widest">Steward AI</h3>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                    Online
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl ${
                      m.role === 'assistant'
                        ? 'bg-gray-100 text-gray-800 rounded-tl-none'
                        : 'bg-church-green text-white rounded-tr-none'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{m.content}</p>
                    <p
                      className={`text-[10px] mt-1 opacity-50 ${m.role === 'assistant' ? 'text-gray-500' : 'text-white'}`}
                    >
                      {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-church-green" />
                    <span className="text-xs text-gray-500">Steward is thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts */}
            {messages.length === 1 && (
              <div className="px-4 pb-2 space-y-2">
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Suggested Queries</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(prompt)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                    >
                      {prompt}
                      <ChevronRight size={12} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-gray-100">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask Steward anything..."
                  className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-church-green/20 focus:border-church-green transition-all text-sm"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-church-green hover:bg-church-green/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </div>
              <p className="text-[10px] text-center text-gray-400 mt-2">
                Steward uses AI and may provide inaccurate financial data. Always verify with official records.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
