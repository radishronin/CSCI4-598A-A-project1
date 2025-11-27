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

    try {
      const response = await fetch('/planner/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ buildings: codes }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || 'Unable to compute route.';
        showError(errorMsg);
        return;
      }

      const data = await response.json();
      clearOverlay();

      if (Array.isArray(data.legs)) {
        data.legs.forEach(renderLeg);
      }

      if (totalTimeEl && typeof data.total_time_s === 'number') {
        const minutes = (data.total_time_s / 60).toFixed(1);
        totalTimeEl.textContent = `Total time: ${minutes} min`;
      }
    } catch (err) {
      showError('An unexpected error occurred while fetching the route.');
    }
  };

  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerate);
  }
});
