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
            overflow: 'hidden',
            width: 340,
            boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          }}
        >
          {/* GIF */}
          <div style={{ position: 'relative', lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/about-gif.gif"
              alt="about"
              style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'cover' }}
            />
            <div
              style={{ position: 'absolute', top: 10, right: 10 }}
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
                    initial={{ opacity: 0, y: 4, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.9 }}
                    transition={{ duration: 0.12 }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 6,
                      background: 'rgba(0,0,0,0.8)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '4px 8px',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                      backdropFilter: 'blur(4px)',
                      pointerEvents: 'none',
                    }}
                  >
                    Not working lol
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
