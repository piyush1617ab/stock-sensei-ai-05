import { useEffect, useRef, useState } from "react";
import { Send, Square, Sparkles, Bot, Loader2, Plus, MessageSquare, Trash2, Menu, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Navbar } from "@/components/Navbar";
import { streamChat, type ChatMessage } from "@/services/chat";
import { useAuth } from "@/contexts/AuthContext";
import { useConversations, useMessages, persistMessage } from "@/hooks/useChatHistory";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

const SUGGESTIONS = [
  "What is a stock and how does it work?",
  "How do I start investing in India with ₹500?",
  "Explain RSI in simple terms",
  "What is the difference between NSE and BSE?",
  "Are SIPs safe for beginners?",
  "Explain P/E ratio with an example",
];

export default function Chatbot() {
  const { user } = useAuth();
  const { conversations, createConv, deleteConv } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: dbMessages } = useMessages(activeId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load DB messages into local state when conversation changes
  useEffect(() => {
    if (dbMessages) {
      setMessages(dbMessages.map((m) => ({ role: m.role, content: m.content })));
    }
  }, [dbMessages]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const startNew = () => {
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    let convId = activeId;
    // Create conversation on first message if signed in
    if (user && !convId) {
      try {
        const c = await createConv(trimmed);
        convId = c.id;
        setActiveId(c.id);
      } catch (_) { /* ignore */ }
    }

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setStreaming(true);
    abortRef.current = new AbortController();

    if (user && convId) {
      persistMessage({ userId: user.id, conversationId: convId, role: "user", content: trimmed }).catch(() => {});
    }

    let acc = "";
    setMessages((p) => [...p, { role: "assistant", content: "" }]);

    await streamChat({
      messages: newMsgs,
      signal: abortRef.current.signal,
      onDelta: (chunk) => {
        acc += chunk;
        setMessages((p) => {
          const next = [...p];
          next[next.length - 1] = { role: "assistant", content: acc };
          return next;
        });
      },
      onError: (e) => {
        setMessages((p) => {
          const next = [...p];
          next[next.length - 1] = { role: "assistant", content: `⚠️ ${e.message}` };
          return next;
        });
      },
      onDone: () => {
        setStreaming(false);
        if (user && convId && acc) {
          persistMessage({ userId: user.id, conversationId: convId, role: "assistant", content: acc }).catch(() => {});
        }
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 mx-auto w-full max-w-7xl flex px-2 lg:px-6 py-4 gap-4 relative">
        {/* History sidebar */}
        {user && (
          <>
            <aside className={`${sidebarOpen ? "fixed inset-y-0 left-0 z-50 w-72 bg-background border-r" : "hidden"} lg:relative lg:flex lg:w-64 lg:bg-transparent lg:border-0 flex-col shrink-0`}>
              <div className="lg:rounded-2xl lg:border lg:border-border lg:bg-card h-full flex flex-col p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversations</span>
                  <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1"><X size={16} /></button>
                </div>
                <button onClick={startNew} className="mb-3 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                  <Plus size={14} /> New Chat
                </button>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {conversations.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">No history yet. Start a chat below.</p>
                  ) : (
                    conversations.map((c) => (
                      <div
                        key={c.id}
                        className={`group flex items-center gap-2 rounded-xl px-2 py-2 cursor-pointer transition ${activeId === c.id ? "bg-accent" : "hover:bg-accent/60"}`}
                        onClick={() => { setActiveId(c.id); setSidebarOpen(false); }}
                      >
                        <MessageSquare size={14} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{c.title}</div>
                          <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Delete this conversation?")) {
                              deleteConv(c.id);
                              if (activeId === c.id) startNew();
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-danger/10 hover:text-danger"
                          aria-label="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
            {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
          </>
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            {user && (
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden rounded-lg p-1.5 hover:bg-accent" aria-label="History">
                <Menu size={18} />
              </button>
            )}
            <div className="gradient-primary h-10 w-10 rounded-xl flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="font-bold">StockSense AI</h1>
                <span className="h-2 w-2 rounded-full bg-success animate-pulse-slow" />
              </div>
              <p className="text-xs text-muted-foreground">Powered by Gemini · Ask about stocks &amp; investing</p>
            </div>
          </div>

          {!user && (
            <div className="mt-3 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
              <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link> to save your conversation history.
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 space-y-4 min-h-[50vh]">
            {messages.length === 0 ? (
              <div className="text-center py-10">
                <div className="gradient-primary inline-flex h-16 w-16 rounded-2xl items-center justify-center">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h2 className="mt-4 text-2xl font-extrabold">StockSense AI</h2>
                <p className="text-sm text-muted-foreground mt-1">Your personal stock market tutor.</p>
                <div className="mt-8 grid gap-2 sm:grid-cols-2 max-w-2xl mx-auto">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-left rounded-xl border border-border bg-card hover:bg-accent transition p-3 text-sm">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                  {m.role === "assistant" && (
                    <div className="gradient-primary h-8 w-8 shrink-0 rounded-xl flex items-center justify-center">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === "user" ? "gradient-primary text-white" : "border border-border bg-card"}`}>
                    {m.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                    ) : m.content ? (
                      <div className="prose-chat">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="sticky bottom-0 bg-background pt-2 pb-2"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-card">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Ask about stocks, investing, market terms…"
                rows={1}
                className="flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none max-h-32"
              />
              {streaming ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="h-9 w-9 flex items-center justify-center rounded-xl bg-danger text-white" aria-label="Stop">
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()} className="h-9 w-9 flex items-center justify-center rounded-xl gradient-primary text-white disabled:opacity-50" aria-label="Send">
                  <Send size={16} />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              AI-generated educational content only. Not investment advice. {input.length}/2000
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
