import { useSyncExternalStore } from 'react';

function subscribe(callback) {
  const el = document.documentElement;
  const obs = new MutationObserver(callback);
  obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}

function getSnapshot() {
  return document.documentElement.classList.contains('dark');
}

function getServerSnapshot() {
  return false;
}

/** True when `<html class="dark">` (Report Builder + app theme). */
export function useReportBuilderDark() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
