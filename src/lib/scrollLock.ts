/**
 * Global Scroll Lock Manager
 * Application-wide singleton with reference counting for nested and concurrent overlays.
 *
 * Prevents background scrolling across all panels:
 *  - Super Admin, Admin, HR, Manager, and Employee portals
 *  - Standard desktop, tablet, and mobile touch devices
 *  - Nested confirmation dialogs and wizards
 *  - Compensates for scrollbar width to prevent horizontal layout shift
 *  - Preserves exact scroll offsets across main layout containers
 */

interface OriginalStyles {
  bodyOverflow: string;
  bodyPaddingRight: string;
  htmlOverflow: string;
  mainElements: Array<{ el: HTMLElement; overflow: string; scrollTop: number }>;
}

let activeLockCount = 0;
let originalStyles: OriginalStyles | null = null;

export function acquireScrollLock(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  if (activeLockCount === 0) {
    const docEl = document.documentElement;
    const body = document.body;

    // Calculate scrollbar width to prevent horizontal layout jump
    const scrollbarWidth = window.innerWidth - docEl.clientWidth;

    // Discover all active workspace main scrolling containers across layouts
    const mainEls = Array.from(document.querySelectorAll<HTMLElement>('main, aside.overflow-y-auto, [data-scroll-container]'));
    const savedMainOverflows = mainEls.map((el) => ({
      el,
      overflow: el.style.overflow,
      scrollTop: el.scrollTop,
    }));

    originalStyles = {
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      htmlOverflow: docEl.style.overflow,
      mainElements: savedMainOverflows,
    };

    // Apply strict scroll locks without destroying height
    body.style.overflow = 'hidden';
    docEl.style.overflow = 'hidden';
    if (scrollbarWidth > 0 && docEl.scrollHeight > window.innerHeight) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Lock main layout containers while keeping scroll position strictly stable
    mainEls.forEach((el) => {
      const currentScroll = el.scrollTop;
      el.style.overflow = 'hidden';
      el.scrollTop = currentScroll;
    });

    // Apply global CSS class and attribute flags
    body.classList.add('ems-scroll-locked');
    docEl.setAttribute('data-scroll-locked', 'true');
  }

  activeLockCount++;
  let isReleased = false;

  return () => {
    if (isReleased) return;
    isReleased = true;
    releaseScrollLock();
  };
}

export function releaseScrollLock(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  activeLockCount = Math.max(0, activeLockCount - 1);

  if (activeLockCount === 0 && originalStyles) {
    const { bodyOverflow, bodyPaddingRight, htmlOverflow, mainElements } = originalStyles;
    const body = document.body;
    const docEl = document.documentElement;

    body.style.overflow = bodyOverflow;
    body.style.paddingRight = bodyPaddingRight;
    docEl.style.overflow = htmlOverflow;

    // Restore workspace scroll containers if they are still attached
    mainElements.forEach(({ el, overflow, scrollTop }) => {
      if (document.contains(el)) {
        el.style.overflow = overflow;
        el.scrollTop = scrollTop;
      }
    });

    body.classList.remove('ems-scroll-locked');
    docEl.removeAttribute('data-scroll-locked');

    originalStyles = null;
  }
}

/**
 * Emergency reset to clear all locks, e.g. on route change or catastrophic unmount.
 */
export function resetScrollLocks(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  activeLockCount = 0;
  if (originalStyles) {
    const { bodyOverflow, bodyPaddingRight, htmlOverflow, mainElements } = originalStyles;
    const body = document.body;
    const docEl = document.documentElement;

    body.style.overflow = bodyOverflow;
    body.style.paddingRight = bodyPaddingRight;
    docEl.style.overflow = htmlOverflow;

    mainElements.forEach(({ el, overflow, scrollTop }) => {
      if (document.contains(el)) {
        el.style.overflow = overflow;
        el.scrollTop = scrollTop;
      }
    });

    body.classList.remove('ems-scroll-locked');
    docEl.removeAttribute('data-scroll-locked');

    originalStyles = null;
  }
}

export function getActiveLockCount(): number {
  return activeLockCount;
}
