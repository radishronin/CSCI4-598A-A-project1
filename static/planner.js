document.addEventListener('DOMContentLoaded', () => {
  const buildingInput = document.getElementById('planner-building-input');
  const generateBtn = document.getElementById('btn-generate-route');
  const overlay = document.getElementById('route-overlay');
  const totalTimeEl = document.getElementById('planner-total-time');
  const translationsList = document.getElementById('planner-translations-list');
  const translationsHint = document.getElementById('planner-translations-hint');

  const clearOverlay = () => {
    if (overlay) {
      overlay.innerHTML = '';
    }
  };

  const clearTranslations = () => {
    if (translationsList) {
      translationsList.innerHTML = '';
    }
    if (translationsHint) {
      translationsHint.textContent = 'Translations returned by the server will appear here.';
    }
  };

  const renderLeg = (leg) => {
    if (!overlay || !leg?.polyline?.length) {
      return;
    }

    const points = leg.polyline.map((p) => `${p.x},${p.y}`).join(' ');
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#2c7be5');
    polyline.setAttribute('stroke-width', '4');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('stroke-linecap', 'round');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const minutes = (leg.time_s / 60).toFixed(1) + ' min';
    text.textContent = minutes;
    text.setAttribute('x', leg.label_position?.x ?? 0);
    text.setAttribute('y', (leg.label_position?.y ?? 0) - 8);
    text.setAttribute('fill', '#1b2838');
    text.setAttribute('font-size', '16');
    text.setAttribute('font-weight', '600');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('paint-order', 'stroke');
    text.setAttribute('stroke', 'white');
    text.setAttribute('stroke-width', '2');

    overlay.appendChild(polyline);
    overlay.appendChild(text);
  };

  const renderTranslations = (translations) => {
    if (!translationsList) {
      return;
    }

    translationsList.innerHTML = '';

    if (!translations || translations.length === 0) {
      if (translationsHint) {
        translationsHint.textContent = 'No translations were returned for this request.';
      }
      return;
    }

    if (translationsHint) {
      translationsHint.textContent = 'Server-provided translations:';
    }

    const fields = ['total_time_label_filled', 'minutes_unit', 'error_invalid', 'error_unknown_codes', 'error_no_path', 'error_message'];

    translations.forEach(({ language, strings, labels }) => {
      if (!strings || Object.keys(strings).length === 0) {
        return;
      }

      const card = document.createElement('div');
      card.className = 'translation-card active';

      const title = document.createElement('div');
      title.className = 'translation-card__title';
      title.textContent = language ? language.toUpperCase() : 'DEFAULT';
      card.appendChild(title);

      const list = document.createElement('dl');
      list.className = 'translation-card__list';

      fields.forEach((field) => {
        if (!(field in strings)) {
          return;
        }

        const term = document.createElement('dt');
        const label = labels?.[field];
        term.textContent = label || field.replace(/_/g, ' ');

        const value = document.createElement('dd');
        value.textContent = strings[field] ?? '—';

        list.appendChild(term);
        list.appendChild(value);
      });

      card.appendChild(list);
      translationsList.appendChild(card);
    });
  };

  const showError = (message) => {
    if (totalTimeEl) {
      totalTimeEl.textContent = message;
    }
    clearOverlay();
  };

  const handleGenerate = async () => {
    if (!buildingInput) {
      showError('Planner input is unavailable.');
      return;
    }

    const codes = buildingInput.value
      .split('\n')
      .map((code) => code.trim())
      .filter((code) => code.length > 0);

    if (codes.length < 2) {
      showError('Enter at least two building codes.');
      return;
    }

    // Read language, response mode and llm controls if present
    const langSelect = document.getElementById('planner-language');
    const modeSelect = document.getElementById('planner-response-mode');
    const target_language = langSelect ? langSelect.value : '';
    const response_mode = modeSelect ? modeSelect.value : 'direct';

    clearTranslations();

    try {
      const response = await fetch('/planner/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ buildings: codes, target_language, response_mode }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const localized = (errorData && errorData.localized) || {};
        const errorMsg = localized.error_message || errorData.error || 'Unable to compute route.';
        showError(errorMsg);
        return;
      }

      const data = await response.json();
      clearOverlay();

      if (Array.isArray(data.legs)) {
        data.legs.forEach(renderLeg);
      }

      // Prefer localized strings returned by the server when available.
      const localized = (data && data.localized) || {};
      const strings = localized.strings || {};
      const labels = localized.labels || {};
      const minutes = (data.total_time_s / 60).toFixed(1);

      if (totalTimeEl && typeof data.total_time_s === 'number') {
        if (strings.total_time_format) {
          totalTimeEl.textContent = strings.total_time_format.replace('{minutes}', minutes);
        } else if (strings.total_time_label_filled) {
          totalTimeEl.textContent = strings.total_time_label_filled;
        } else {
          const unit = strings.minutes_unit || 'min';
          const label = strings.total_time_label || 'Total time:';
          totalTimeEl.textContent = `${label} ${minutes} ${unit}`;
        }
      }

      // Render the active language (and original if present) returned by the API.
      const translationsToRender = [];
      if (localized.strings) {
        translationsToRender.push({
          language: localized.language || '',
          strings: localized.strings,
          labels,
        });
      }
      if (localized.original && localized.original.strings) {
        translationsToRender.push({
          language: localized.original.language || 'en',
          strings: localized.original.strings,
          labels: localized.original.labels || {},
        });
      }
      if (translationsToRender.length) {
        renderTranslations(translationsToRender);
      }
    } catch (err) {
      showError('An unexpected error occurred while fetching the route.');
    }
  };

  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerate);
  }
  // Initialize planner LLM indicator and set button
  /*
  (function initPlannerLlm(){
    const indicator = document.getElementById('planner-current-llm-indicator');
    const stored = localStorage.getItem('selected_llm');
    if (stored && indicator) indicator.textContent = stored.toUpperCase();

    const setBtn = document.getElementById('planner-set-llm-button');
    if (setBtn) {
      setBtn.addEventListener('click', () => {
        const sel = document.querySelector('input[name="planner-llm-choice"]:checked')?.value;
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
});
