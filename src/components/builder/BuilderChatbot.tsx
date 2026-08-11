/**
 * BuilderChatbot
 *
 * A floating chatbot panel for the game builder that helps users brainstorm
 * categories and clue/answer pairs using Google Gemini.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { sendChatMessage, type ChatMessage } from '../../utils/builderChatApi'
import './BuilderChatbot.css'

const SUGGESTIONS = [
  'Suggest 6 creative category ideas',
  'Give me 5 clues for a "World Capitals" category',
  'I\'m thinking of a science theme — what categories could work?',
  'Help me write clues about 90s pop culture',
]

export function BuilderChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSend = useCallback(async (text?: string) => {
    const messageText = (text ?? input).trim()
    if (!messageText || isLoading) return

    setInput('')
    setError(null)

    const userMessage: ChatMessage = { role: 'user', content: messageText }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setIsLoading(true)

    const result = await sendChatMessage(updatedMessages)

    if ('error' in result) {
      setError(result.error)
    } else {
      const assistantMessage: ChatMessage = { role: 'assistant', content: result.reply }
      setMessages((prev) => [...prev, assistantMessage])
    }

    setIsLoading(false)
  }, [input, isLoading, messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`
  }

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        className="builder-chatbot-fab"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.92 }}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <circle cx="9" cy="10" r="0.5" fill="currentColor" />
            <circle cx="12" cy="10" r="0.5" fill="currentColor" />
            <circle cx="15" cy="10" r="0.5" fill="currentColor" />
          </svg>
        )}
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="builder-chatbot-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {/* Header */}
            <div className="builder-chatbot-panel__header">
              <h2 className="builder-chatbot-panel__title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                Builder Assistant
              </h2>
              <button
                className="builder-chatbot-panel__close"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="builder-chatbot-panel__messages">
              {messages.length === 0 && !isLoading && (
                <div className="chatbot-welcome">
                  <div className="chatbot-welcome__title">Jeopardy Builder Assistant</div>
                  <p>I can help you brainstorm categories, generate clue/answer pairs, and refine your ideas.</p>
                  <div className="chatbot-welcome__suggestions">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        className="chatbot-welcome__suggestion"
                        onClick={() => handleSend(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`chatbot-message chatbot-message--${msg.role}`}
                >
                  {msg.content}
                </div>
              ))}

              {error && (
                <div className="chatbot-message chatbot-message--error">
                  {error}
                </div>
              )}

              {isLoading && (
                <div className="chatbot-typing" aria-label="Assistant is typing">
                  <span className="chatbot-typing__dot" />
                  <span className="chatbot-typing__dot" />
                  <span className="chatbot-typing__dot" />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="builder-chatbot-panel__input">
              <textarea
                ref={textareaRef}
                className="builder-chatbot-panel__textarea"
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask about categories, clues, themes..."
                rows={1}
                disabled={isLoading}
                aria-label="Chat message input"
              />
              <button
                className="builder-chatbot-panel__send"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
