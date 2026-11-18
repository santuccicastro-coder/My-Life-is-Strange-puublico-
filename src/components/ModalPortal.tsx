import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

let openModalCount = 0;

export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    openModalCount += 1;
    const prevOverflow = document.body.style.overflow;
    if (openModalCount === 1) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = prevOverflow || '';
      }
    };
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
}
