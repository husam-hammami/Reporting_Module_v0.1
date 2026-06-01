/**
 * useRtl — reads the current document direction.
 *
 * Components use this to decide whether to flip nav chevrons. Numeric arrows
 * (↑↓ in DeltaPill) intentionally stay LTR-spatial regardless of reading
 * direction — see plan section 11.
 */

import { useEffect, useState } from 'react';

export function useRtl(): { isRtl: boolean } {
  const [isRtl, setIsRtl] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.getAttribute('dir') === 'rtl';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const update = () => setIsRtl(root.getAttribute('dir') === 'rtl');

    update();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'dir') {
          update();
          break;
        }
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['dir'] });

    return () => observer.disconnect();
  }, []);

  return { isRtl };
}
