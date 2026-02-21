import { createContext, useContext } from 'react';

/** When true, ChartWidget etc. disable animations for cleaner html2canvas capture. */
export const ThumbnailCaptureContext = createContext(false);

export function useThumbnailCapture() {
  return useContext(ThumbnailCaptureContext);
}
