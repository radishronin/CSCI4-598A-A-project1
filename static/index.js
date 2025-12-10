(function () {
  const textarea = document.getElementById('prompt-input');
  const button = document.getElementById('enter-button');

  let currentLLMChoice = '';
  let currentPrompt = '';

  function setOutput(text) {
    const box = document.getElementById('output-box');
    if (!box) return;
    box.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = text;
    box.appendChild(p);
  }

  function appendOutput(text) {
    const box = document.getElementById('output-box');
    if (!box) return;
    const p = box.querySelector('p') || (() => {
      const el = document.createElement('p');
      box.appendChild(el);
      return el;
    })();
    p.textContent += text;
  }

  function showSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
      spinner.style.display = 'flex';
    }
  }

  function hideSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
      spinner.style.display = 'none';
    }
  }

  async function submitPrompt() {
    const value = (textarea && 'value' in textarea) ? textarea.value.trim() : '';
    // Prefer checked radio; fallback to stored selection
    const targetLanguage = document.getElementById('language-select')?.value || 'en';
    const responseMode = document.getElementById('mode-select')?.value || 'direct';

    if (!value) {
      alert('Please input something.')
      return;
    }
    
    currentPrompt = value;

    // Clear output and show spinner
    setOutput('');
    showSpinner();
    
    try {
      const res = await fetch('/rag/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: value, 
          target_language: targetLanguage,
          response_mode: responseMode
        })
      });

      // If API key missing, server returns JSON error; handle that first.
      const contentType = res.headers.get('content-type') || '';
      
      if (!res.ok && contentType.includes('application/json')) {
        const payload = await res.json();
        if (payload && payload.error === 'NO API key set.') {
          hideSpinner();
          showApiKeyModal("gemini");
          document.getElementById('prompt-input').value = '';
          return;
        }
        throw new Error(payload?.error || 'Request failed');
      }

      // Stream plain text chunks and append to the output box
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error('Streaming not supported by this browser.');
      }

      // Hide spinner once streaming starts (first chunk received)
      let firstChunk = true;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          hideSpinner();
          break;
        }
        const text = decoder.decode(chunk, { stream: true });
        if (text) {
          if (firstChunk) {
            hideSpinner();
            firstChunk = false;
          }
          appendOutput(text);
        }
      }
    } catch (err) {
      hideSpinner();
      console.error('Error streaming prompt:', err);
      appendOutput('\\n[Error] ' + (err?.message || String(err)));
    }
    document.getElementById('prompt-input').value = '';
  }

  /*
  // Initialize LLM indicator from localStorage and wire Set LLM button
  (function initLlmSetter(){
    const indicator = document.getElementById('current-llm-indicator');
    const stored = localStorage.getItem('selected_llm');
    if (stored && indicator) indicator.textContent = stored.toUpperCase();

    const setBtn = document.getElementById('set-llm-button');
    if (setBtn) {
      setBtn.addEventListener('click', () => {
        const sel = document.querySelector('input[name="llm-choice"]:checked')?.value;
        if (!sel) {
          alert('Please select an LLM to set.');
          return;
        }
        localStorage.setItem('selected_llm', sel);
        if (indicator) indicator.textContent = sel.toUpperCase();
      });
    }
  })();
  */

  function showApiKeyModal(llmChoice) {
    const modal = document.getElementById('api-key-modal');
    const message = document.getElementById('api-key-message');
    const input = document.getElementById('api-key-input');
    
    message.textContent = `Please enter your API key for ${llmChoice.toUpperCase()}:`;
    input.value = '';
    modal.style.display = 'flex';
    input.focus();
  }

  function hideApiKeyModal() {
    const modal = document.getElementById('api-key-modal');
    modal.style.display = 'none';
  }

  async function submitApiKey() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    
    if (!apiKey) {
      alert('Please enter an API key.');
      return;
    }
    
    try {
      const response = await fetch('/rag/api/set-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          api_key: apiKey 
        })
      });
      
      const result = await response.json();
      
      if (result.ok) {
        hideApiKeyModal();
      } else {
        alert('Failed to set API key: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error setting API key:', err);
      alert('Error setting API key. Please try again.');
    }
  }
  
  if (button) {
    button.addEventListener('click', submitPrompt);
  }

  if (textarea) {
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
        e.preventDefault();
        submitPrompt();
      }
    });
  }

  // Modal event listeners
  const cancelButton = document.getElementById('api-key-cancel');
  const submitButton = document.getElementById('api-key-submit');
  const apiKeyInput = document.getElementById('api-key-input');

  if (cancelButton) {
    cancelButton.addEventListener('click', hideApiKeyModal);
  }

  if (submitButton) {
    submitButton.addEventListener('click', submitApiKey);
  }

  if (apiKeyInput) {
    apiKeyInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitApiKey();
      } else if (e.key === 'Escape') {
        hideApiKeyModal();
      }
    });
  }

  // File upload handling
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelection);
  }

  // ---------------- Notes UI handling ----------------
  const saveNoteButton = document.getElementById('save-note-button');
  const notesTitle = document.getElementById('notes-title');
  const notesContent = document.getElementById('notes-content');
  const notesUL = document.getElementById('notes-ul');

  async function loadNotes() {
    try {
      const res = await fetch('/rag/api/notes');
      const data = await res.json();
      if (data && data.ok) {
        renderNotes(data.notes || []);
      }
    } catch (err) {
      console.error('Failed to load notes', err);
    }
  }

  function renderNotes(notes) {
    if (!notesUL) return;
    notesUL.innerHTML = '';
    notes.forEach(n => {
      const li = document.createElement('li');
      const title = n.title ? n.title : (`Note ${n.id}`);
      li.innerHTML = `<strong>${escapeHtml(title)}</strong> <button data-id="${n.id}" class="delete-note">Delete</button><div class="note-content">${escapeHtml(n.content)}</div>`;
      notesUL.appendChild(li);
    });
    // Attach delete handlers
    notesUL.querySelectorAll('.delete-note').forEach(btn => {
      btn.addEventListener('click', async function (e) {
        const id = this.getAttribute('data-id');
        if (!confirm('Delete this note?')) return;
        try {
          const res = await fetch(`/rag/api/notes/${id}`, { method: 'DELETE' });
          const payload = await res.json();
          if (payload && payload.ok) {
            loadNotes();
          } else {
            alert('Failed to delete note');
          }
        } catch (err) {
          console.error('Failed to delete note', err);
          alert('Error deleting note');
        }
      });
    });
  }

  async function saveNote() {
    const title = notesTitle?.value?.trim() || '';
    const content = notesContent?.value?.trim() || '';
    if (!content) {
      alert('Please add some note content');
      return;
    }
    try {
      const res = await fetch('/rag/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
      const payload = await res.json();
      if (payload && payload.ok) {
        notesTitle.value = '';
        notesContent.value = '';
        loadNotes();
      } else {
        alert('Failed to save note');
      }
    } catch (err) {
      console.error('Failed to save note', err);
      alert('Error saving note');
    }
  }

  function escapeHtml(unsafe) {
    return (unsafe || '').replace(/[&<>"]+/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m];
    });
  }

  if (saveNoteButton) {
    saveNoteButton.addEventListener('click', saveNote);
  }

  // Load notes on startup
  loadNotes();

  async function handleFileSelection(event) {
    const files = event.target.files;

    if (files.length === 0) {
      alert('No files selected. Please choose one or more files to upload.');
      return;
    }

    // Show spinner when file upload starts
    showSpinner();

    const filePaths = [];
    const fileReadPromises = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const readPromise = new Promise((resolve, reject) => {
        reader.onload = function(e) {
          filePaths.push({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
            content: e.target.result.split(',')[1] // Base64-encoded content, split header
          });
          resolve();
        };
        reader.onerror = function(e) {
          reject(e);
        };
        reader.readAsDataURL(file);
      });
      fileReadPromises.push(readPromise);
    }
    await Promise.all(fileReadPromises);

    try {
      const response = await fetch('/rag/api/upload-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_paths: filePaths })
      });
      
      const result = await response.json();
      hideSpinner();
      
      if (!response.ok) {
        if (result.error === 'NO API key set.') {
          showApiKeyModal("gemini");
          fileInput.value = '';
          return;
        }
        alert('Error uploading files: ' + (result.error || 'Unknown error'));
        fileInput.value = '';
        return;
      }
      
      alert('File upload successful');
      fileInput.value = '';
    } catch (err) {
      hideSpinner();
      alert('Error uploading files: ' + (err?.message || String(err)));
      fileInput.value = '';
    }
  }
})();

