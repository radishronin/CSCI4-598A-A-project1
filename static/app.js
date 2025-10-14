(function () {
  function getStorage() {
    try {
      return window.localStorage;
    } catch (err) {
      console.error('localStorage is unavailable', err);
      return null;
    }
  }

  function toProviderKey(provider) {
    const normalized = typeof provider === 'string' ? provider.trim() : '';
    return normalized ? `${normalized.toUpperCase()}_API_KEY` : 'API_KEY';
  }

  window.getApiKey = function (provider) {
    const storage = getStorage();
    if (!storage) {
      return '';
    }

    const providerKey = typeof provider === 'string' && provider.trim()
      ? `${provider.trim().toUpperCase()}_API_KEY`
      : null;

    if (providerKey) {
      const specific = storage.getItem(providerKey);
      if (typeof specific === 'string' && specific) {
        return specific;
      }
    }

    return storage.getItem('API_KEY') || '';
  };

  window.showApiKeyModal = function (llmChoice) {
    const storage = getStorage();
    const keyName = toProviderKey(llmChoice);
    const providerName = typeof llmChoice === 'string' && llmChoice.trim()
      ? llmChoice.trim().toUpperCase()
      : '';
    const promptLabel = providerName
      ? `Enter your API key for ${providerName}:`
      : 'Enter your API key:';

    const existingValue = storage ? storage.getItem(keyName) || '' : '';
    const input = window.prompt(promptLabel, existingValue);
    if (input === null) {
      return '';
    }

    const value = input.trim();
    if (!value) {
      alert('API key not saved: empty input.');
      return '';
    }

    if (!storage) {
      alert('Unable to access localStorage.');
      return '';
    }

    try {
      storage.setItem(keyName, value);
      alert('Saved.');
    } catch (err) {
      console.error('Failed to persist API key', err);
      alert('Failed to save API key.');
      return '';
    }

    return value;
  };

  window.hideApiKeyModal = function () {
    const modal = document.getElementById('api-key-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  };

  window.submitApiKey = function () {
    const storage = getStorage();
    if (!storage) {
      alert('Unable to access localStorage.');
      return;
    }

    const input = document.getElementById('api-key-input');
    const value = input && typeof input.value === 'string' ? input.value.trim() : '';
    if (!value) {
      alert('Please enter an API key.');
      return;
    }

    const provider = document.querySelector('input[name="llm-choice"]:checked')?.value || '';
    const keyName = toProviderKey(provider);

    try {
      storage.setItem(keyName, value);
      alert('Saved.');
      if (input) {
        input.value = '';
      }
      window.hideApiKeyModal();
    } catch (err) {
      console.error('Failed to persist API key', err);
      alert('Failed to save API key.');
    }
  };

  window.sendPrompt = async function ({ prompt, provider = 'openai' } = {}) {
    const apiKey = window.getApiKey(provider);
    const response = await fetch('/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, provider, apiKey })
    });

    let data = {};
    try {
      data = await response.json();
    } catch (err) {
      data = {};
    }

    if (!response.ok) {
      console.error('Request failed', data);
      alert((data && data.error) || 'Request failed');
    }

    return data;
  };
})();

