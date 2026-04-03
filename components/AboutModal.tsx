'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface AboutModalProps {
  onClose: () => void
}

export default function AboutModal({ onClose }: AboutModalProps) {
  const [xHovered, setXHovered] = useState(false)

  return (
    <AnimatePresence>
      <motion.div
        key="about-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          key="about-card"
          initial={{ scale: 0.88, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.88, opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 340, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#1a1a1a',
            borderRadius: 20,
            overflow: 'visible',
            width: 340,
            boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
            position: 'relative',
          }}
        >
          {/* GIF — clipped independently so card can be overflow:visible */}
          <div style={{ position: 'relative', lineHeight: 0, borderRadius: '20px 20px 0 0', overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/about-gif.gif"
              alt="about"
              style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'cover' }}
            />
          </div>

          {/* X button — at card level so tooltip can float above card edge */}
          <div
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, userSelect: 'none' }}
            onMouseEnter={() => setXHovered(true)}
            onMouseLeave={() => setXHovered(false)}
          >
            <button
              style={{
                background: 'rgba(0,0,0,0.45)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'not-allowed',
                backdropFilter: 'blur(4px)',
                pointerEvents: 'none',
              }}
            >
              <X size={14} />
            </button>
            <AnimatePresence>
              {xHovered && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.88 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.88 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    marginBottom: 8,
                    background: '#D4550A',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '6px 14px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    boxShadow: '0 4px 20px rgba(212,85,10,0.5)',
                  }}
                >
                  Not working lol
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Content */}
          <div style={{ padding: '20px 24px 24px', textAlign: 'center' }}>
            <p style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              Made by Matias Barragan
            </p>
            <a
              href="mailto:mati@barragan.com.py"
              style={{ color: '#D4550A', fontSize: 13, textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              mati@barragan.com.py
            </a>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
