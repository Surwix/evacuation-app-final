// Function to initialize Google Places Autocomplete
function initAutocomplete() {
  const addressInput = document.getElementById('address-input');
  if (addressInput) {
    new google.maps.places.Autocomplete(addressInput, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
    });
  }
}

// Find elements on the page
const planForm = document.getElementById('plan-form');
const button = planForm.querySelector('button');
const notification = document.getElementById('notification');

// Function to show notifications on the page
function showNotification(message, type) {
    notification.textContent = message;
    notification.className = 'notification ' + type; 
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 6000);
}

// Handle form submission
planForm.addEventListener('submit', async function(event) {
  event.preventDefault(); 

  const address = document.getElementById('address-input').value;
  const email = document.getElementById('email-input').value;
  const terms = document.getElementById('terms-checkbox').checked;

  if (!address || !email) {
    showNotification('Please fill in both the address and email fields.', 'error');
    return;
  }
  
  if (!terms) {
    showNotification('Please agree to the Terms of Use.', 'error');
    return;
  }

  // --- REAL API CALL ---
  button.textContent = 'Generating...';
  button.disabled = true;
  notification.style.display = 'none';

  try {
    const response = await fetch('/api/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, email })
    });

    const result = await response.json();

    if (!response.ok) {
      // If server returns an error, show it
      throw new Error(result.message || 'An unknown error occurred.');
    }

    showNotification(result.message, 'success');
    planForm.reset(); // Clear the form on success

  } catch (error) {
    // Show network or server errors to the user
    showNotification(`Error: ${error.message}`, 'error');
    console.error('Fetch error:', error);
  } finally {
    // Always re-enable the button
    button.textContent = 'Get PDF Report';
    button.disabled = false;
  }
});

// We need to add a new class to our style.css for the notification
// to have success/error colors. Make sure this is in your style.css
/*
.notification { display: none; padding: 12px; margin-top: 15px; border-radius: 5px; text-align: center; font-weight: bold; }
.notification.success { background-color: #d4edda; color: #155724; }
.notification.error { background-color: #f8d7da; color: #721c24; }
*/
