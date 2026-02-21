// Lenis smooth scroll disabled — native overflow-auto on #main-scroll-container
// handles scrolling reliably. Lenis was intercepting wheel events at the document
// level while the actual scroll container is a nested div, causing scroll to break.
export const useLenisScroll = () => {}
