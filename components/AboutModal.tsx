'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface AboutModalProps {
  onClose: () => void
}

export default function AboutModal({ onClose }: AboutModalProps) {

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
              src="https://forum.playhive.com/uploads/default/original/3X/9/f/9fbb4321b65bdf33a08df00b50a6e34c3d1e98df.gif"
              alt="about"
              style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'cover' }}
            />
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'rgba(0,0,0,0.45)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(4px)',
              }}
            >
              <X size={14} />
            </button>
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
