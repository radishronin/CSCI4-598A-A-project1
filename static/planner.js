document.addEventListener('DOMContentLoaded', () => {
  const buildingInput = document.getElementById('planner-building-input');
  const generateBtn = document.getElementById('btn-generate-route');
  const overlay = document.getElementById('route-overlay');
  const totalTimeEl = document.getElementById('planner-total-time');
  const mapImage = document.getElementById('campus-map');
  const mapWrapper = document.querySelector('.map-wrapper');
  const mapCanvas = document.querySelector('.map-canvas');

  const clearOverlay = () => {
    if (overlay) {
      overlay.innerHTML = '';
    }
  };

  const resetView = () => {
    if (mapCanvas) {
      mapCanvas.style.transform = '';
    }
  };

  const getMapDimensions = () => {
    if (!overlay || !mapImage) {
      return null;
    }

    const viewBox = overlay.viewBox?.baseVal;
    const width = viewBox?.width || mapImage.naturalWidth || mapImage.width;
    const height = viewBox?.height || mapImage.naturalHeight || mapImage.height;

    if (!width || !height) {
      return null;
    }

    const displayWidth = mapCanvas?.clientWidth || mapWrapper?.clientWidth || mapImage.clientWidth || width;
    const displayHeight = mapCanvas?.clientHeight || mapWrapper?.clientHeight || mapImage.clientHeight || height;

    return { width, height, displayWidth, displayHeight };
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

  const fitToPath = (legs) => {
    const dims = getMapDimensions();
    if (!dims || !Array.isArray(legs) || legs.length === 0) {
      resetView();
      return;
    }

    const allPoints = legs.flatMap((leg) => leg.polyline || []);
    if (!allPoints.length) {
      resetView();
      return;
    }

    const xs = allPoints.map((p) => p.x);
    const ys = allPoints.map((p) => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const pathWidth = Math.max(maxX - minX, 1);
    const pathHeight = Math.max(maxY - minY, 1);
    const longest = Math.max(pathWidth, pathHeight);
    const padding = longest; // +100% of the longest dimension total

    const targetMinX = Math.max(0, minX - padding / 2);
    const targetMaxX = Math.min(dims.width, maxX + padding / 2);
    const targetMinY = Math.max(0, minY - padding / 2);
    const targetMaxY = Math.min(dims.height, maxY + padding / 2);

    const targetWidth = Math.max(targetMaxX - targetMinX, 1);
    const targetHeight = Math.max(targetMaxY - targetMinY, 1);

    const scaleX = dims.displayWidth / targetWidth;
    const scaleY = dims.displayHeight / targetHeight;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (dims.displayWidth - targetWidth * scale) / 2 - targetMinX * scale;
    const offsetY = (dims.displayHeight - targetHeight * scale) / 2 - targetMinY * scale;

    const transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

    if (mapCanvas) {
      mapCanvas.style.transform = transform;
    }
  };

  const showError = (message) => {
    if (totalTimeEl) {
      totalTimeEl.textContent = message;
    }
    clearOverlay();
    resetView();
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
        fitToPath(data.legs);
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
