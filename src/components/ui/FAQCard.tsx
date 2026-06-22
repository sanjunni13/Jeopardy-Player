import { Accordion } from 'radix-ui'
import { motion } from 'motion/react'
import { BackgroundGradient } from './background-gradient'
import type { FAQItem } from '../../data/faqData'
import './FAQCard.css'

interface FAQCardProps {
  items: FAQItem[]
}

export function FAQCard({ items }: FAQCardProps) {
  if (items.length === 0) {
    return <div className="faq-empty" />
  }

  return (
    <BackgroundGradient containerClassName="faq-gradient-container" className="faq-card">
      <h2 className="faq-title">Frequently Asked Questions</h2>

      <Accordion.Root type="single" collapsible={true} className="faq-accordion">
        {items.map((item, index) => (
          <Accordion.Item key={index} value={`item-${index}`} className="faq-item">
            <Accordion.Header asChild>
              <h3 className="faq-header">
                <Accordion.Trigger className="faq-trigger">
                  <span className="faq-question">{item.question}</span>
                  <motion.svg
                    className="faq-chevron"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </motion.svg>
                </Accordion.Trigger>
              </h3>
            </Accordion.Header>
            <Accordion.Content className="faq-content">
              <p className="faq-answer">{item.answer}</p>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </BackgroundGradient>
  )
}
