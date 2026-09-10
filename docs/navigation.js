const links = [...document.querySelectorAll('.module-list a')];
const sections = links.map((link) => document.querySelector(link.hash)).filter(Boolean);

const markCurrent = (id) => {
  for (const link of links) {
    if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
};

markCurrent(location.hash.slice(1) || 'start');
window.addEventListener('hashchange', () => markCurrent(location.hash.slice(1) || 'start'));

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) markCurrent(entry.target.id);
    }
  }, { rootMargin: '0px 0px -65% 0px' });
  for (const section of sections) observer.observe(section);
}