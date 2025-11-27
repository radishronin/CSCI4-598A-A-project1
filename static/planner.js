document.addEventListener('DOMContentLoaded', () => {
  const buildingInput = document.getElementById('planner-building-input');
  const generateBtn = document.getElementById('btn-generate-route');
  const overlay = document.getElementById('route-overlay');
  const totalTimeEl = document.getElementById('planner-total-time');

  const clearOverlay = () => {
    if (overlay) {
      overlay.innerHTML = '';
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

    // Read language and response mode controls if present
    const langSelect = document.getElementById('planner-language');
    const modeSelect = document.getElementById('planner-response-mode');
    const target_language = langSelect ? langSelect.value : '';
    const response_mode = modeSelect ? modeSelect.value : 'direct';

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
      const minutes = (data.total_time_s / 60).toFixed(1);

      if (totalTimeEl && typeof data.total_time_s === 'number') {
        if (localized.total_time_format) {
          // Server provided a formatted label (may include unit)
          totalTimeEl.textContent = localized.total_time_format.replace('{minutes}', minutes);
        } else {
          const unit = localized.minutes_unit || 'min';
          const label = localized.total_time_label || 'Total time:';
          totalTimeEl.textContent = `${label} ${minutes} ${unit}`;
        }
      }
    } catch (err) {
      showError('An unexpected error occurred while fetching the route.');
    }
  };

  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerate);
  }
});
    const langSelect = document.getElementById('planner-language');
