import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LiveSession as GenAiLiveSession, LiveServerMessage } from '@google/genai';
import { startLiveSession } from '../services/geminiService';

interface LiveSessionProps {
  onClose: () => void;
}

type ConnectionStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error' | 'closed';

interface TranscriptionLine {
    id: string;
    speaker: 'user' | 'model';
    text: string;
}

export const LiveSession: React.FC<LiveSessionProps> = ({ onClose }) => {
    const [status, setStatus] = useState<ConnectionStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [transcription, setTranscription] = useState<TranscriptionLine[]>([]);
    
    const sessionRef = useRef<GenAiLiveSession | null>(null);
    const audioQueueRef = useRef<AudioBuffer[]>([]);
    const isPlayingRef = useRef(false);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
    
    const currentInputTranscription = useRef('');
    const currentOutputTranscription = useRef('');

    const playNextAudioChunk = useCallback(() => {
        if (isPlayingRef.current || audioQueueRef.current.length === 0 || !outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
            return;
        }
        isPlayingRef.current = true;
        setStatus('speaking');
        const audioBuffer = audioQueueRef.current.shift();
        if (audioBuffer) {
            const source = outputAudioContextRef.current.createBufferSource();
            activeSourceRef.current = source;
            source.buffer = audioBuffer;
            source.connect(outputAudioContextRef.current.destination);
            source.onended = () => {
                isPlayingRef.current = false;
                activeSourceRef.current = null;
                if (audioQueueRef.current.length > 0) {
                   playNextAudioChunk();
                } else {
                   setStatus('listening');
                }
            };
            source.start();
        }
    }, []);

    const handleStart = async () => {
        setStatus('connecting');
        setError(null);
        setTranscription([]);
        
        if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }

        try {
            if (!outputAudioContextRef.current) throw new Error("AudioContext could not be created.");
            
            sessionRef.current = await startLiveSession({
                onOpen: () => setStatus('listening'),
                onClose: () => setStatus('closed'),
                onError: (e) => {
                    setError(e.message || "An unknown error occurred.");
                    setStatus('error');
                },
                onMessage: (message: LiveServerMessage) => {
                    if (message.serverContent?.outputTranscription) {
                        const text = message.serverContent.outputTranscription.text;
                        currentOutputTranscription.current += text;
                    } else if (message.serverContent?.inputTranscription) {
                        const text = message.serverContent.inputTranscription.text;
                        currentInputTranscription.current += text;
                    }

                    if (message.serverContent?.turnComplete) {
                        const userText = currentInputTranscription.current.trim();
                        const modelText = currentOutputTranscription.current.trim();
                        
                        setTranscription(prev => {
                            const newLines = [...prev];
                            if (userText) newLines.push({ id: crypto.randomUUID(), speaker: 'user', text: userText });
                            if (modelText) newLines.push({ id: crypto.randomUUID(), speaker: 'model', text: modelText });
                            return newLines;
                        });

                        currentInputTranscription.current = '';
                        currentOutputTranscription.current = '';
                    }
                },
                onAudioChunk: (chunk) => {
                    audioQueueRef.current.push(chunk);
                    playNextAudioChunk();
                },
            }, outputAudioContextRef.current);
        } catch (e: any) {
            setError(e.message);
            setStatus('error');
        }
    };
    
    const handleStop = () => {
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }

        if (activeSourceRef.current) {
            activeSourceRef.current.stop();
            activeSourceRef.current = null;
        }
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
        }
        outputAudioContextRef.current = null;

        setStatus('closed');
    };

    const StatusIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
        const statusMap = {
            idle: { text: "Ready to Brainstorm", color: "bg-stone-400" },
            connecting: { text: "Connecting...", color: "bg-yellow-500 animate-pulse" },
            listening: { text: "Listening...", color: "bg-green-500" },
            speaking: { text: "AI is Speaking...", color: "bg-blue-500 animate-pulse" },
            error: { text: "Error", color: "bg-red-500" },
            closed: { text: "Session Ended", color: "bg-stone-500" },
        };
        const { text, color } = statusMap[status];
        return (
            <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${color}`}></div>
                <span className="text-xs font-bold uppercase tracking-widest text-white">{text}</span>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] bg-atelier-ink flex flex-col items-center justify-center p-4 font-sans animate-in fade-in">
            <div className="w-full max-w-2xl h-[80vh] flex flex-col bg-white/5 border border-white/20 shadow-2xl relative">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/20 bg-white/5 backdrop-blur-md">
                    <StatusIndicator status={status} />
                    <button onClick={handleStop} className="text-sm text-white/50 hover:text-white">&times;</button>
                </div>
                
                {/* Content */}
                {status === 'idle' ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-white text-center p-8">
                        <span className="text-5xl mb-4">🎙️</span>
                        <h2 className="text-xl font-bold uppercase tracking-widest mb-2">Live Creative Session</h2>
                        <p className="text-sm text-white/70 mb-6">Speak your ideas, get instant feedback. <br/>Click Start to begin.</p>
                        <button onClick={handleStart} className="bg-white text-atelier-ink px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-stone-200 transition-colors">
                            Start Session
                        </button>
                    </div>
                ) : status === 'closed' || status === 'error' ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-white text-center p-8">
                        <h2 className="text-xl font-bold uppercase tracking-widest mb-2">
                            {status === 'error' ? 'Connection Lost' : 'Session Ended'}
                        </h2>
                        {error && <p className="text-sm text-red-300 mb-6 max-w-sm">{error}</p>}
                        <button onClick={onClose} className="bg-white text-atelier-ink px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-stone-200 transition-colors mt-4">
                            Return to Studio
                        </button>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {transcription.map(line => (
                             <div key={line.id} className={`flex items-start gap-3 ${line.speaker === 'user' ? 'justify-end' : ''}`}>
                                 {line.speaker === 'model' && <div className="w-6 h-6 rounded-full bg-blue-500 flex-shrink-0"></div>}
                                 <div className={`p-3 rounded-lg max-w-[80%] text-sm font-mono ${line.speaker === 'user' ? 'bg-white/90 text-atelier-ink' : 'bg-blue-900/50 text-white'}`}>
                                     {line.text}
                                 </div>
                             </div>
                        ))}
                        {error && <div className="p-3 bg-red-900/50 text-red-300 font-mono text-xs rounded">{error}</div>}
                    </div>
                )}
            </div>
        </div>
    );
};