'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  zIndex?: number;
}

const MAX_WIDTH_MAP: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  full: 'max-w-full m-4',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  maxWidth = '2xl',
  className = '',
  bodyClassName = '',
  headerClassName = '',
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  zIndex = 100,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use global reference-counted scroll lock
  useBodyScrollLock(isOpen);

  // Keyboard navigation: Escape key handling
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen || !mounted) return null;

  const maxWidthClass = MAX_WIDTH_MAP[maxWidth] || 'max-w-2xl';

  return createPortal(
    <div
      className="fixed inset-0 overflow-hidden bg-black/60 backdrop-blur-sm"
      style={{ zIndex }}
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex h-[100dvh] items-center justify-center p-2.5 sm:p-4 md:p-6">
        <div
          role="dialog"
          aria-modal="true"
          className={`relative flex w-full max-h-[92vh] sm:max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in text-xs text-slate-800 ${maxWidthClass} ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Optional Fixed Header */}
          {(title || showCloseButton) && (
            <div
              className={`shrink-0 flex items-center justify-between border-b border-[#FED7AA]/60 bg-white p-4 text-slate-900 ${headerClassName}`}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                {icon && <div className="shrink-0 text-orange-500">{icon}</div>}
                <div className="min-w-0">
                  {title && (
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                      {title}
                    </h3>
                  )}
                  {description && (
                    <p className="text-[11px] text-slate-500 truncate">
                      {description}
                    </p>
                  )}
                </div>
              </div>

              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-orange-50 transition-colors cursor-pointer shrink-0"
                  aria-label="Close dialog"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Scrollable Modal Content */}
          <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 ${bodyClassName}`}>
            {children}
          </div>

          {/* Optional Fixed Footer */}
          {footer && (
            <div className="shrink-0 flex items-center justify-end gap-3 border-t border-[#FED7AA]/40 bg-white p-3.5 sm:p-4 shadow-xs">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
