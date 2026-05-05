'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X, MessageCircle, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: number;
}

const PARISH_QUERIES = [
  {
    trigger: ['budget', 'finances', 'money', 'fund'],
    response: 'To manage your parish budget, visit the Home page and use the "Data Import & Export" feature. You can upload CSV files with your financial records and set budget deadlines. The system tracks your submissions and categorizes them by priority.',
  },
  {
    trigger: ['submission', 'submit', 'deadline', 'report'],
    response: 'All parish submissions have a deadline of the 15th of each month. You can view your submission status in the "Submission Tracker" which shows your progress with color-coded indicators. Submit your financial records through the Data Import feature.',
  },
  {
    trigger: ['classification', 'class', 'category', 'fiesta'],
    response: 'Your parish is classified by financial health and organizational status. You can view your classification in the Classification Management section. Your fiesta date is also recorded to help track seasonal financial variations in your parish data.',
  },
  {
    trigger: ['health', 'financial health', 'score', 'analysis'],
    response: 'Financial health is analyzed across 5 dimensions: Liquidity (cash availability), Sustainability (long-term viability), Efficiency (expense management), Stability (predictability), and Growth (income trends). Your health score combines these dimensions.',
  },
  {
    trigger: ['forecast', 'predict', 'ai twin', 'digital twin', 'projection'],
    response: 'Use the Simulator feature to test different financial scenarios. You can adjust collection rates, expenses, and one-time transactions to see how they impact your parish\'s cash position over 12 months. This helps with financial planning.',
  },
  {
    trigger: ['data', 'import', 'export', 'csv', 'file'],
    response: 'You can import financial data using CSV files in the Data Import & Export section. Download the template, fill it with your data, and upload it. The system also allows you to export your current data for backup or analysis.',
  },
  {
    trigger: ['diocese', 'bishop', 'chancell', 'admin', 'announcement'],
    response: 'Diocese-level administrators can view all parish submissions and make strategic decisions. The Chancellor\'s Board shares announcements, updates, and important information. Priests receive notifications about diocesan updates.',
  },
  {
    trigger: ['contact', 'help', 'support', 'admin', 'problem'],
    response: 'For technical support or questions about your account, contact your diocesan administrator. If you experience issues with submissions or data, please note the error message and timestamp for troubleshooting.',
  },
  {
    trigger: ['hello', 'hi', 'hey', 'greetings', 'start'],
    response: 'Welcome to the Diocese Financial System! I\'m here to help you understand how to use the system, manage your parish finances, and navigate different features. What would you like to know?',
  },
];

const getAIResponse = (userMessage: string): string => {
  const lowerMessage = userMessage.toLowerCase();
  
  for (const query of PARISH_QUERIES) {
    if (query.trigger.some(trigger => lowerMessage.includes(trigger))) {
      return query.response;
    }
  }
  
  return "I\'m not sure about that. Try asking about: budget management, submissions, classification, financial health, forecasting, data import/export, diocese features, or technical support.";
};

interface StewardChatbotProps {
  className?: string;
  position?: 'fixed' | 'relative';
}

export function StewardChatbot({ className = '', position = 'fixed' }: StewardChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('chatbot_messages');
    return saved ? JSON.parse(saved) : [
      {
        id: '0',
        text: 'Welcome! I\'m the Steward AI Chatbot. How can I help you today?',
        sender: 'bot',
        timestamp: Date.now(),
      }
    ];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('chatbot_messages', JSON.stringify(messages));
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(() => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      text: input,
      sender: 'user',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI thinking time
    setTimeout(() => {
      const botResponse: Message = {
        id: Math.random().toString(36).substr(2, 9),
        text: getAIResponse(input),
        sender: 'bot',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, botResponse]);
      setIsTyping(false);
    }, 500);
  }, [input]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = useCallback(() => {
    if (confirm('Clear all chat history?')) {
      setMessages([
        {
          id: '0',
          text: 'Welcome! I\'m the Steward AI Chatbot. How can I help you today?',
          sender: 'bot',
          timestamp: Date.now(),
        }
      ]);
    }
  }, []);

  return (
    <>
      {/* Chat Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={`${position} bottom-6 right-6 z-40 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all ${className}`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className={`${position} bottom-24 right-6 z-40 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl overflow-hidden`}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">Steward AI</h3>
                  <p className="text-sm text-blue-100">Always here to help</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={clearChat}
                    className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
                    title="Clear chat"
                  >
                    <span className="text-sm">🗑️</span>
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="h-96 overflow-y-auto bg-slate-50 p-4 space-y-4">
              <AnimatePresence mode="popLayout">
                {messages.map((message, index) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs px-4 py-2 rounded-lg ${
                        message.sender === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white text-slate-900 border border-slate-200'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.text}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-white text-slate-900 border border-slate-200 px-4 py-2 rounded-lg">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-200 bg-white p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything..."
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  disabled={isTyping}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isTyping || !input.trim()}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white px-3 py-2 rounded-lg transition-colors"
                >
                  {isTyping ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
