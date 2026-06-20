"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, X, Plus } from "lucide-react";

interface Props {
  onTranscript: (text: string) => void;
  onClose: () => void;
}

export default function VoiceTaskInput({ onTranscript, onClose }: Props) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string>("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Web Speech API — use any to avoid missing TS lib types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionImpl = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognitionImpl) {
      setError("Trình duyệt không hỗ trợ nhận dạng giọng nói.");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionImpl();
    recognition.lang = "vi-VN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: { resultIndex: number; results: { isFinal: boolean; [0]: { transcript: string } }[] }) => {
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        }
      }
      if (final) setTranscript((prev) => (prev + " " + final).trim());
    };

    recognition.onerror = (event: { error: string }) => {
      setError(`Lỗi: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;

    return () => { recognition.stop(); };
  }, []);

  const toggleListen = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
      setError("");
    }
  };

  const handleUse = () => {
    if (transcript.trim()) {
      onTranscript(transcript.trim());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[var(--foreground)]">Tạo nhiệm vụ bằng giọng nói</h3>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error ? (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        ) : (
          <>
            <div className="flex justify-center mb-5">
              <button
                onClick={toggleListen}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
                  isListening
                    ? "bg-red-500 scale-110 animate-pulse"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isListening ? (
                  <MicOff className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </button>
            </div>
            <p className="text-xs text-center text-[var(--muted-foreground)] mb-3">
              {isListening ? "Đang nghe... (nhấn để dừng)" : "Nhấn mic để bắt đầu nói"}
            </p>
          </>
        )}

        {transcript && (
          <div className="mb-4">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">Đã nhận:</p>
            <div className="bg-[var(--muted)] rounded-lg p-3 text-sm text-[var(--foreground)]">
              {transcript}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setTranscript("")}
            disabled={!transcript}
            className="flex-1 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--muted-foreground)] hover:border-red-300 hover:text-red-500 disabled:opacity-40 transition-colors"
          >
            Xóa
          </button>
          <button
            onClick={handleUse}
            disabled={!transcript.trim()}
            className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" /> Tạo nhiệm vụ
          </button>
        </div>
      </div>
    </div>
  );
}
