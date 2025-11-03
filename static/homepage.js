(function () {
  // Homepage-specific JavaScript can go here
  // For now, we'll keep it simple with just the button interaction
  
  const enterButton = document.getElementById('enter-app-button');
  
  if (enterButton) {
    // Add any button interactions or animations here if needed
    enterButton.addEventListener('mouseenter', function() {
      // Optional: Add hover effects or animations
      console.log('Entering application...');
    });
  }

  // Optional: Add smooth scroll or fade-in animations
  document.addEventListener('DOMContentLoaded', function() {
    const main = document.querySelector('main.container');
    if (main) {
      main.style.opacity = '0';
      main.style.transition = 'opacity 0.5s ease-in';
      setTimeout(() => {
        main.style.opacity = '1';
      }, 100);
    }
  });
})();

