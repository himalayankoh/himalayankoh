import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Loader2, MessageCircle, Send, Sparkles, Trash2, X } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const storageKey = 'himalayan_koh_ai_chat_history';

/**
 * Openers the shopper can tap.
 *
 * They ask about the salt the shop actually sells — edible grades, blocks,
 * lamps and bulk — so the assistant is never led into recommending a product
 * category that is not in the catalog.
 */
const quickPrompts = [
  'Help me choose an edible salt',
  'Fine, medium or coarse grain — which one?',
  'How do I use a salt block?',
  'Do you sell bulk salt?',
];

const friendlyChatError = (message: string) => {
  if (/provider returned error/i.test(message)) {
    return 'The AI assistant is temporarily busy. Please try again in a moment.';
  }

  return message || 'AI assistant is unavailable right now.';
};

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        setMessages(JSON.parse(stored) as ChatMessage[]);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(messages.slice(-20)));
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const nextMessages = [
      ...messages,
      userMessage,
      { id: assistantId, role: 'assistant' as const, content: '' },
    ];

    setMessages(nextMessages);
    setInput('');
    setError('');
    setLastPrompt(trimmed);
    setIsStreaming(true);

    try {
      const response = await fetch('/api/openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.content.trim())
            .map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || 'AI assistant is busy right now. Please try again.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setMessages((current) => current.map((message) => (
          message.id === assistantId
            ? { ...message, content: message.content + chunk }
            : message
        )));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI assistant is unavailable right now.';
      setError(friendlyChatError(message));
      setMessages((current) => current.filter((message) => message.id !== assistantId));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendMessage(input);
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(storageKey);
    setError('');
  };

  return (
    <>
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-5 sm:bottom-5 z-fab w-14 h-14 bg-himalayan hover:bg-himalayan-dark text-white rounded-full shadow-xl shadow-himalayan/30 flex items-center justify-center"
        aria-label="Open AI assistant"
      >
        <MessageCircle size={24} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-modal bg-black/40 backdrop-blur-sm md:hidden"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              className="fixed left-3 right-3 bottom-20 h-[30rem] max-h-[calc(100dvh-6rem)] md:left-auto md:right-5 md:bottom-24 md:w-[360px] md:h-[32rem] md:max-h-[calc(100dvh-7rem)] z-chat bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="shrink-0 p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-himalayan-lighter text-himalayan flex items-center justify-center">
                    <Bot size={20} />
                  </div>
                  <div>
                    <h2 className="font-serif text-base font-bold text-charcoal">Himalayan Koh AI</h2>
                    <p className="text-xs text-charcoal-light">Product guidance and support</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-charcoal-light"
                      aria-label="Clear conversation"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-9 h-9 rounded-full hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-himalayan flex items-center justify-center"
                    aria-label="Close AI assistant"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3 bg-warm-white">
                {messages.length === 0 && (
                  <div className="text-center py-4">
                    <Sparkles size={40} className="mx-auto mb-4 text-himalayan" />
                    <h3 className="font-serif text-xl font-bold text-charcoal mb-2">
                      How can I help?
                    </h3>
                    <p className="text-sm text-charcoal-light mb-5">
                      Ask about pink salt grades, cooking and serving, salt lamps, bulk orders, or support.
                    </p>
                    <div className="grid gap-2">
                      {quickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => sendMessage(prompt)}
                          className="text-left px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-sm text-charcoal hover:border-himalayan/40 hover:bg-himalayan-lighter transition-colors"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        message.role === 'user'
                          ? 'bg-himalayan text-white'
                          : 'bg-white text-charcoal shadow-sm'
                      }`}
                    >
                      {message.content || (
                        <span className="inline-flex items-center gap-2 text-charcoal-light">
                          <Loader2 size={14} className="animate-spin" />
                          Thinking...
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                    <p>{error}</p>
                    {lastPrompt && (
                      <button
                        type="button"
                        onClick={() => sendMessage(lastPrompt)}
                        disabled={isStreaming}
                        className="mt-2 inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-60"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}
                <div ref={scrollRef} />
              </div>

              <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-gray-100 bg-white">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage(input);
                      }
                    }}
                    placeholder="Ask about pink salt, orders, FAQs..."
                    rows={1}
                    className="flex-1 max-h-28 resize-none px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan"
                  />
                  <button
                    type="submit"
                    disabled={isStreaming || !input.trim()}
                    className="w-11 h-11 rounded-xl bg-himalayan hover:bg-himalayan-dark disabled:bg-gray-300 text-white flex items-center justify-center transition-colors"
                    aria-label="Send message"
                  >
                    {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
