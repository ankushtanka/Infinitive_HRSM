'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { acquireScrollLock, releaseScrollLock, resetScrollLocks } from '@/lib/scrollLock';

/**
 * Reusable React Hook to lock background scrolling while a modal, drawer, or overlay is open.
 *
 * Features:
 *  - Reference counted: supports nested modals & simultaneous dialogs
 *  - Dual lock: locks body, html, and workspace <main> containers
 *  - Scrollbar jump compensation via dynamic paddingRight
 *  - Route-change safe: releases lock on navigation
 *  - Clean unmount cleanup
 *
 * @param isOpen Boolean indicating whether the modal/drawer is open
 */
export function useBodyScrollLock(isOpen: boolean = true): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!isOpen) return;

    const release = acquireScrollLock();

    return () => {
      release();
    };
  }, [isOpen, pathname]);
}

export { acquireScrollLock, releaseScrollLock, resetScrollLocks };
