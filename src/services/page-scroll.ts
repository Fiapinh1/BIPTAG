export function scrollPageToTop(behavior: ScrollBehavior = 'auto') {
  const content = document.querySelector<HTMLElement>('.main-content');
  if (content) content.scrollTo({ top: 0, behavior });
  else window.scrollTo({ top: 0, behavior });
}
