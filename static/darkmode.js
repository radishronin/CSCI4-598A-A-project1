(function(){
  const KEY = 'dark_mode_enabled';
  const toggleId = 'dark-mode-toggle';

  function setDark(enabled){
    try{
      if(enabled){
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem(KEY, enabled ? '1' : '0');
      // update button text/state if present
      const btn = document.getElementById(toggleId);
      if(btn){
        btn.textContent = enabled ? 'Light' : 'Dark';
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      }
    }catch(e){
      console.warn('Dark mode toggle failed', e);
    }
  }

  function toggle(){
    const enabled = localStorage.getItem(KEY) === '1';
    setDark(!enabled);
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const stored = localStorage.getItem(KEY);
    const enabled = stored === '1' || (stored === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(enabled);

    // Wire up any buttons with id dark-mode-toggle
    const btn = document.getElementById(toggleId);
    if(btn){
      btn.addEventListener('click', toggle);
    }

    // Also wire buttons with class .dark-mode-toggle
    document.querySelectorAll('.dark-mode-toggle').forEach(b => b.addEventListener('click', toggle));
  });
})();
