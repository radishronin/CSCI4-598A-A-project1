(function () {
  const textarea = document.getElementById('prompt-input');
  const button = document.getElementById('enter-button');

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

  function showApiKeyModal(llmChoice) {
    const modal = document.getElementById('api-key-modal');
    const message = document.getElementById('api-key-message');
    const input = document.getElementById('api-key-input');
    
    message.textContent = `Please enter your API key: for ${llmChoice.toUpperCase()}:`;
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
          llm_choice: "gemini", 
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
      alert('File upload successful');
      fileInput.value = '';
    } catch (err) {
      hideSpinner();
      alert('Error uploading files: ' + (err?.message || String(err)));
    }
  }
})();

