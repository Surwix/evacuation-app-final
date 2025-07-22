// Функция автозаполнения адреса (остается без изменений)
function initAutocomplete() {
    const addressInput = document.getElementById('address-input');
    new google.maps.places.Autocomplete(addressInput, {
        types: ['address'],
        componentRestrictions: { country: 'us' }
    });
}

// Находим элементы на странице
const planForm = document.getElementById('plan-form');
const button = planForm.querySelector('button');
const notification = document.getElementById('notification');

// Функция для показа уведомлений
function showNotification(message, type) {
    notification.textContent = message;
    // Применяем классы для цвета (success = зеленый, error = красный)
    notification.className = 'notification ' + type; 
    notification.style.display = 'block';

    // Прячем уведомление через 5 секунд
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

// Слушатель событий для формы
planForm.addEventListener('submit', async function(event) {
    event.preventDefault(); // Предотвращаем перезагрузку страницы

    const address = document.getElementById('address-input').value;
    const email = document.getElementById('email-input').value;

    if (!address || !email) {
        showNotification('Please fill out all fields.', 'error');
        return;
    }

    // Меняем состояние кнопки
    button.textContent = 'Generating...';
    button.disabled = true;
    notification.style.display = 'none'; // Прячем старое уведомление

    try {
        const response = await fetch('/api/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, email })
        });

        const result = await response.json();

        if (!response.ok) {
            // Если сервер вернул ошибку, показываем ее
            throw new Error(result.message || 'Server error');
        }

        showNotification(result.message, 'success');
        planForm.reset(); // Очищаем форму после успеха

    } catch (error) {
        // Показываем ошибку в случае сбоя
        showNotification('Sorry, something went wrong. Please try again.', 'error');
        console.error('Fetch error:', error);
    } finally {
        // Возвращаем кнопку в исходное состояние в любом случае
        button.textContent = 'Get My Plan';
        button.disabled = false;
    }
});
