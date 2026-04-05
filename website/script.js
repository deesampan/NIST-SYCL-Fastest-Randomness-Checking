// Sticky nav highlight on scroll
(function () {
  const nav = document.getElementById('navbar');
  const sections = document.querySelectorAll('section[id], header[id]');
  const navLinks = document.querySelectorAll('.nav-links a');

  function onScroll() {
    // Shrink nav shadow on scroll
    if (window.scrollY > 10) {
      nav.style.boxShadow = '0 2px 16px rgba(0,0,0,0.5)';
    } else {
      nav.style.boxShadow = 'none';
    }

    // Highlight active section
    let current = '';
    sections.forEach(sec => {
      const top = sec.getBoundingClientRect().top;
      if (top <= 80) current = sec.id;
    });
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// Animate performance bars into view
(function () {
  const bars = document.querySelectorAll('.perf-bar-seq, .perf-bar-sycl');

  // Store target widths and collapse initially
  bars.forEach(bar => {
    bar.dataset.targetWidth = bar.style.width;
    bar.style.width = '0';
    bar.style.transition = 'width 0.8s cubic-bezier(.4,0,.2,1)';
  });

  const section = document.getElementById('performance');
  if (!section) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        bars.forEach((bar, i) => {
          setTimeout(() => {
            bar.style.width = bar.dataset.targetWidth;
          }, i * 60);
        });
        observer.disconnect();
      }
    });
  }, { threshold: 0.2 });

  observer.observe(section);
})();

// Smooth active link style injection
(function () {
  const style = document.createElement('style');
  style.textContent = '.nav-links a.active { color: #f0f6fc; background: rgba(88,166,255,0.1); }';
  document.head.appendChild(style);
})();
