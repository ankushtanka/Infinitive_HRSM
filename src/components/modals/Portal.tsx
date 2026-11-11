'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
}

/**
 * Universal Portal Component
 * Mounts children directly onto document.body to break out of all parent layout containers,
 * eliminating containing block clipping, flexbox margin bleeding (e.g. space-y-*),
 * and stacking context isolation.
 */
export const Portal: React.FC<PortalProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
};

export default Portal;
