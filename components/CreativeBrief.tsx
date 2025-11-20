
import React, { useState, useEffect, useRef } from "react";
import { Chat } from "@google/genai";
import { ProjectManifest } from "../types";
import { extractProjectManifest, createChatSession } from "../services/geminiService";

interface CreativeBriefProps {
  onComplete: (manifest: ProjectManifest) => void;
  onSkip: () => void;
}

export const CreativeBrief: React.FC<CreativeBriefProps> = ({ onComplete, onSkip }) => {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<{ role: 'user' | 'model', text: string }[]>([
      { role: 'model', text: "Welcome to Cosmo Studios. I'm your creative producer. What are we making today? (e.g., 'A cyberpunk detective story' or 'A children's book about a bear')." }
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // We keep the Chat instance in a ref so it persists
  const chatRef = useRef<Chat | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!chatRef.current) {
        try {
            chatRef.current = createChatSession(
                "You are a helpful Creative Producer for a video studio app. Help the user define characters (names, roles), visual style, and a list of scenes. Be concise, encouraging, and ask clarifying questions. Do not output JSON yourself, just talk naturally."
            );
        } catch (e) {
            console.error("Failed to init chat", e);
            // If key is missing (rare case at this stage), skip onboarding
            onSkip();
        }
    }
  }, [onSkip]);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize logic
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`; // Max height 150px
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !chatRef.current) return;

    const userMsg = input;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = 'auto'; // Reset height
    
    setHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsThinking(true);

    try {
        const result = await chatRef.current.sendMessage({ message: userMsg });
        const responseText = result.text;
        setHistory(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (e) {
        console.error(e);
        setHistory(prev => [...prev, { role: 'model', text: "I'm having trouble connecting to the studio. Please try again." }]);
    } finally {
        setIsThinking(false);
    }
  };

  const handleInitialize = async () => {
      setIsAnalyzing(true);
      try {
          const manifest = await extractProjectManifest(history);
          onComplete(manifest);
      } catch (e) {
          console.error("Failed to extract manifest", e);
          // Fallback empty
          onComplete({ projectTitle: "Untitled", cast: [], scenes: [], suggestedRatio: '16:9' });
      } finally {
          setIsAnalyzing(false);
      }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-atelier-bg flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-2xl flex flex-col h-[80vh] bg-white border border-atelier-ink shadow-2xl relative">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-atelier-ink bg-atelier-bg">
                <div className="flex items-baseline gap-2">
                    <h1 className="text-sm font-bold uppercase tracking-[0.2em]">Creative Brief</h1>
                    <span className="text-[10px] text-atelier-muted uppercase tracking-widest">Pre-Production</span>
                </div>
                <button onClick={onSkip} className="text-[10px] uppercase font-bold underline text-atelier-muted hover:text-atelier-ink">
                    Skip to Studio
                </button>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#FAFAF9]">
                {history.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 text-sm leading-relaxed font-mono shadow-sm ${
                            msg.role === 'user' 
                            ? 'bg-atelier-ink text-white border border-atelier-ink rounded-tl-lg rounded-bl-lg rounded-br-lg' 
                            : 'bg-white text-atelier-ink border border-atelier-accent rounded-tr-lg rounded-br-lg rounded-bl-lg'
                        }`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                {isThinking && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-atelier-accent p-3 rounded-tr-lg rounded-br-lg rounded-bl-lg">
                             <span className="flex gap-1">
                                 <span className="w-1.5 h-1.5 bg-atelier-muted rounded-full animate-bounce"></span>
                                 <span className="w-1.5 h-1.5 bg-atelier-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                 <span className="w-1.5 h-1.5 bg-atelier-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                             </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-atelier-ink">
                <div className="flex gap-2 items-end">
                    <textarea 
                        ref={textareaRef}
                        value={input}
                        onChange={handleInput}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Describe your idea..."
                        rows={1}
                        className="flex-1 p-3 text-sm border border-atelier-accent focus:border-atelier-ink outline-none bg-transparent font-mono resize-none overflow-hidden max-h-[150px]"
                        autoFocus
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isThinking}
                        className="px-6 py-3 bg-atelier-active text-white text-xs font-bold uppercase tracking-widest hover:bg-atelier-ink disabled:opacity-50 h-auto self-stretch"
                    >
                        Reply
                    </button>
                </div>
            </div>

            {/* Action Bar */}
            {history.length > 2 && (
                <div className="absolute -bottom-16 left-0 right-0 flex justify-center">
                    <button 
                        onClick={handleInitialize}
                        disabled={isAnalyzing}
                        className="bg-indigo-600 text-white px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] shadow-lg hover:bg-indigo-700 hover:-translate-y-0.5 transition-all flex items-center gap-2"
                    >
                        {isAnalyzing ? "Analyzing Plan..." : "Initialize Studio ✦"}
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};
