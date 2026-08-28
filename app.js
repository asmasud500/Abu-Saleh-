(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Year
  $$('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

  // Mobile navigation
  const menu = $('[data-menu]');
  const mobileMenu = $('#mobile-menu');
  const navLinks = $$('.mobile-menu a');
  const desktopNav = $('.nav');
  const setMenu = open => {
    menu?.setAttribute('aria-expanded', String(open));
    mobileMenu?.classList.toggle('open', open);
    mobileMenu?.setAttribute('aria-hidden', String(!open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  menu?.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  navLinks.forEach(a => a.addEventListener('click', () => setMenu(false)));

  // Theme preference
  const themeButton = $('[data-theme]');
  const savedTheme = localStorage.getItem('abu-saleh-theme');
  if (savedTheme === 'light') document.body.classList.add('light');
  themeButton?.addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('abu-saleh-theme', document.body.classList.contains('light') ? 'light' : 'dark');
  });

  // Header + scroll progress
  const header = $('[data-header]');
  const progress = $('.progress');
  const onScroll = () => {
    header?.classList.toggle('scrolled', window.scrollY > 30);
    const max = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Lightweight reveal fallback, enhanced by GSAP when available.
  const reveal = $$('.section,.service,.project,.process-list article,.telegram-post,.cta');
  reveal.forEach(el => el.classList.add('reveal'));
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  reveal.forEach(el => observer.observe(el));

  // GSAP + ScrollTrigger + Lenis
  if (!reducedMotion && window.gsap) {
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    const title = $('.hero h1');
    if (title) {
      const parts = title.innerHTML.split('<br>');
      title.innerHTML = parts.map((p, i) => `<span class="hero-line">${p}</span>${i < parts.length - 1 ? '<br>' : ''}`).join('');
      gsap.from('.hero-line', { yPercent: 110, opacity: 0, duration: 1, stagger: .08, ease: 'power4.out', delay: .1 });
      gsap.from('.hero-copy .kicker,.hero-copy .lead,.hero-cta', { y: 24, opacity: 0, duration: .8, stagger: .1, ease: 'power3.out', delay: .45 });
      gsap.from('.hero-art', { x: 45, opacity: 0, duration: 1.1, ease: 'power4.out', delay: .15 });
    }
    if (window.ScrollTrigger) {
      $$('.section-head h2,.manifesto-title,.service,.project,.process-list article,.quote').forEach(el => {
        gsap.from(el, { y: 45, opacity: 0, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
      });
    }
    const lenis = window.Lenis ? new Lenis({ duration: 1.05, smoothWheel: true, syncTouch: false }) : null;
    if (lenis) {
      lenis.on('scroll', () => window.ScrollTrigger?.update());
      const raf = time => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  // Magnetic buttons / custom cursor on pointer devices.
  const finePointer = matchMedia('(pointer:fine)').matches;
  const cursor = $('.cursor');
  if (finePointer && cursor && !reducedMotion) {
    addEventListener('pointermove', e => {
      cursor.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
    }, { passive: true });
    $$('.magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX-r.left-r.width/2)*.12}px,${(e.clientY-r.top-r.height/2)*.12}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  // Counters
  const counters = $$('.stats [data-count]');
  const countObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target, target = Number(el.dataset.count || 0);
    if (reducedMotion) { el.textContent = target + '+'; countObserver.unobserve(el); return; }
    const start = performance.now(), duration = 1200;
    const tick = now => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + '+';
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick); countObserver.unobserve(el);
  }), { threshold: .7 });
  counters.forEach(el => countObserver.observe(el));

  // Project detail dialog — lightweight dynamic case-study view.
  const dialog = $('#project-dialog'), dialogTitle = $('#dialog-title'), dialogCat = $('#dialog-cat'), dialogYear = $('#dialog-year'), dialogArt = $('#dialog-art');
  $$('.project').forEach(project => project.addEventListener('click', () => {
    if (!dialog) return;
    const name = project.dataset.project || 'Project';
    dialogTitle.textContent = name;
    dialogCat.textContent = project.dataset.category || 'Digital Experience';
    dialogYear.textContent = project.dataset.year || '2026';
    dialogArt.dataset.letter = name.charAt(0);
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }));
  $('#dialog-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  // Featured Telegram posts. Content is rendered as text, never HTML, to reduce XSS risk.
  async function loadPosts() {
    const box = $('#telegram-posts'), status = $('#post-status');
    if (!box) return;
    try {
      const response = await fetch(`posts.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('posts unavailable');
      const posts = await response.json();
      box.replaceChildren();
      if (!Array.isArray(posts) || !posts.length) {
        const empty = document.createElement('div'); empty.className = 'loading';
        empty.textContent = 'Your latest posts will appear here automatically.'; box.append(empty);
        if (status) status.textContent = 'Waiting for posts'; return;
      }
      posts.slice(0, 9).forEach(post => {
        const card = document.createElement('article'); card.className = 'telegram-post reveal visible';
        const meta = document.createElement('div'); meta.className = 'post-meta'; meta.textContent = `TELEGRAM · ${post.date || ''}`;
        const title = document.createElement('h3'); title.textContent = post.title || 'Featured update';
        const text = document.createElement('p'); text.textContent = post.text || '';
        card.append(meta, title, text);
        if (post.link && /^https?:\/\//i.test(post.link)) {
          const link = document.createElement('a'); link.href = post.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open post ↗'; card.append(link);
        }
        box.append(card);
      });
      if (status) status.textContent = 'Live · synced automatically';
    } catch {
      box.replaceChildren(); const error = document.createElement('div'); error.className = 'loading'; error.textContent = 'Featured posts are temporarily unavailable.'; box.append(error);
      if (status) status.textContent = 'Sync paused';
    }
  }
  loadPosts(); setInterval(loadPosts, 60000);

  // Secure live chat. The Telegram token never belongs in this browser code.
  const CHAT_API = 'https://abu-saleh-chat.YOUR-SUBDOMAIN.workers.dev';
  const chatOpen = $('#chat-open'), chatClose = $('#chat-close'), chatPanel = $('#chat-panel'), chatForm = $('#chat-form'), chatMessages = $('#chat-messages'), chatResult = $('#chat-result');
  const sessionKey = 'abu_saleh_chat_session';
  let sessionId = null;
  try {
    sessionId = localStorage.getItem(sessionKey);
    if (!sessionId && crypto?.randomUUID) { sessionId = crypto.randomUUID(); localStorage.setItem(sessionKey, sessionId); }
  } catch { sessionId = crypto?.randomUUID?.() || ''; }

  const setChat = open => {
    chatPanel?.classList.toggle('open', open);
    chatPanel?.setAttribute('aria-hidden', String(!open));
    if (open) pollChat();
  };
  chatOpen?.addEventListener('click', () => setChat(true));
  chatClose?.addEventListener('click', () => setChat(false));

  function renderMessages(messages) {
    if (!chatMessages) return;
    chatMessages.replaceChildren();
    messages.forEach(m => {
      const bubble = document.createElement('div');
      bubble.className = `bubble ${m.direction === 'admin' ? 'admin' : 'visitor'}`;
      bubble.textContent = m.text || '';
      chatMessages.append(bubble);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function pollChat() {
    if (!sessionId || !chatPanel?.classList.contains('open') || CHAT_API.includes('YOUR-SUBDOMAIN')) return;
    try {
      const r = await fetch(`${CHAT_API}/chat?session=${encodeURIComponent(sessionId)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (r.ok) { const data = await r.json(); if (data.ok && Array.isArray(data.messages)) renderMessages(data.messages); }
    } catch { /* avoid exposing backend details to visitors */ }
  }
  setInterval(pollChat, 4000);

  chatForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#chat-name')?.value.trim();
    const contact = $('#chat-contact')?.value.trim();
    const message = $('#chat-message')?.value.trim();
    const website = $('#chat-website')?.value || '';
    const submit = chatForm.querySelector('button[type="submit"]');
    if (!name || !message) return;
    if (CHAT_API.includes('YOUR-SUBDOMAIN')) { if (chatResult) chatResult.textContent = 'Live chat is being configured.'; return; }
    submit.disabled = true; if (chatResult) chatResult.textContent = 'Sending…';
    try {
      const r = await fetch(`${CHAT_API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chat-Client': 'abu-saleh-web', 'X-Session-ID': sessionId || '' },
        body: JSON.stringify({ session: sessionId, name, contact, message, website })
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'Unable to send message.');
      if (data.sessionId && data.sessionId !== sessionId) { sessionId = data.sessionId; localStorage.setItem(sessionKey, sessionId); }
      $('#chat-message').value = ''; if (chatResult) chatResult.textContent = 'Sent ✓'; await pollChat();
    } catch (error) { if (chatResult) chatResult.textContent = error.message || 'Unable to send message.'; }
    finally { submit.disabled = false; }
  });
})();
