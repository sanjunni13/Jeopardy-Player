import { Accordion } from 'radix-ui'
import { motion } from 'motion/react'
import { BackgroundGradient } from './background-gradient'
import type { FAQCategory } from '../../data/faqData'
import './FAQCard.css'

interface FAQCardProps {
  items: FAQCategory[]
}

function ChevronIcon({ className }: { className: string }) {
  return (
    <motion.svg
      className={className}
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
  )
}

export function FAQCard({ items }: FAQCardProps) {
  if (items.length === 0) {
    return <div className="faq-empty" />
  }

  return (
    <BackgroundGradient containerClassName="faq-gradient-container" className="faq-card">
      <h2 className="faq-title">Frequently Asked Questions</h2>

      {/* Outer accordion — one entry per category */}
      <Accordion.Root type="multiple" className="faq-accordion">
        {items.map((category, catIndex) => (
          <Accordion.Item
            key={catIndex}
            value={`cat-${catIndex}`}
            className="faq-category-item"
          >
            <Accordion.Header asChild>
              <h3 className="faq-category-header">
                <Accordion.Trigger className="faq-category-trigger">
                  <span className="faq-category-label">{category.category}</span>
                  <ChevronIcon className="faq-chevron" />
                </Accordion.Trigger>
              </h3>
            </Accordion.Header>

            <Accordion.Content className="faq-category-content">
              {/* Inner accordion — collapsible questions within the category */}
              <Accordion.Root
                type="single"
                collapsible={true}
                className="faq-inner-accordion"
              >
                {category.items.map((item, itemIndex) => (
                  <Accordion.Item
                    key={itemIndex}
                    value={`cat-${catIndex}-item-${itemIndex}`}
                    className="faq-item"
                  >
                    <Accordion.Header asChild>
                      <h4 className="faq-header">
                        <Accordion.Trigger className="faq-trigger">
                          <span className="faq-question">{item.question}</span>
                          <ChevronIcon className="faq-chevron" />
                        </Accordion.Trigger>
                      </h4>
                    </Accordion.Header>
                    <Accordion.Content className="faq-content">
                      <p className="faq-answer" style={{ whiteSpace: 'pre-line' }}>
                        {item.answer}
                      </p>
                    </Accordion.Content>
                  </Accordion.Item>
                ))}
              </Accordion.Root>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </BackgroundGradient>
  )
}
