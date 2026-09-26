import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { botAPI } from '../config/api';
import '../styles/BotWidget.css';

const BotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', content }
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef(null);

  // Only coordinators get this widget - it's built for their workflows.
  const savedUser = localStorage.getItem('currentUser');
  const role = savedUser ? JSON.parse(savedUser).role : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  if (role !== 'coordinator') return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      // history = everything except the message we're about to send (backend adds it)
      const { reply } = await botAPI.chat(text, messages);
      setMessages([...nextMessages, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages([...nextMessages, { role: 'assistant', content: "Couldn't reach the bot - try again in a bit." }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bot-widget">
      {isOpen && (
        <div className="bot-widget__panel">
          <div className="bot-widget__header">
            <span>Sessioneer Bot</span>
            <button onClick={() => setIsOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </div>

          <div className="bot-widget__messages">
            {messages.length === 0 && (
              <div className="bot-widget__empty">
                Ask me anything - e.g. "where do I request cover" or "who on CAB201 hasn't submitted availability"
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bot-widget__bubble bot-widget__bubble--${m.role}`}>
                {m.content}
              </div>
            ))}
            {isSending && <div className="bot-widget__bubble bot-widget__bubble--assistant">...</div>}
            <div ref={bottomRef} />
          </div>

          <div className="bot-widget__input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={isSending}
            />
            <button onClick={handleSend} disabled={isSending} aria-label="Send">
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <button className="bot-widget__toggle" onClick={() => setIsOpen(o => !o)} aria-label="Toggle bot chat">
        <MessageCircle size={22} />
      </button>
    </div>
  );
};

export default BotWidget;