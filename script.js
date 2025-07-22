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

// Handle form submission
const planForm = document.getElementById('plan-form');

planForm.addEventListener('submit', function(event) {
  event.preventDefault(); // Prevents the form from actually submitting
  
  const address = document.getElementById('address-input').value;
  const email = document.getElementById('email-input').value;
  const terms = document.getElementById('terms-checkbox').checked;

  if (!address || !email) {
    alert('Please fill in both the address and email fields.');
    return;
  }
  
  if (!terms) {
    alert('Please agree to the Terms of Use.');
    return;
  }
  
  // This is where you will eventually call your server-side API
  // For now, we just show an alert.
  alert(`Form is ready to be sent!\n\nAddress: ${address}\nEmail: ${email}\n\nOn the real site, this would trigger a request to the server.`);
  
  // Optional: Show a loading state on the button
  const button = planForm.querySelector('button');
  button.textContent = 'Sending...';
  
  // Revert button text after 2 seconds for this demo
  setTimeout(() => {
    button.textContent = 'Get PDF Report';
  }, 2000);
});
