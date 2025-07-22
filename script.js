// Функция автозаполнения адреса Google
function initAutocomplete() {
    const addressInput = document.getElementById('address-input');
    new google.maps.places.Autocomplete(addressInput, {
        types: ['address'],
        componentRestrictions: { country: 'us' }
    });
}

// Находим все нужные элементы на странице
const planForm = document.getElementById('plan-form');
const button = planForm.querySelector('button');
const notification = document.getElementById('notification');
const termsCheckbox = document.getElementById('terms-checkbox'); // Находим новый чекбокс

// Функция для показа уведомлений
function showNotification(message, type) {
    notification.textContent = message;
    notification.className = 'notification ' + type; 
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

// Слушатель событий для отправки формы
planForm.addEventListener('submit', async function(event) {
    event.preventDefault(); // Предотвращаем стандартную перезагрузку

    const address = document.getElementById('address-input').value;
    const email = document.getElementById('email-input').value;

    // ПРОВЕРКА ЧЕКБОКСА
    if (!termsCheckbox.checked) {
        showNotification('Пожалуйста, согласитесь с условиями использования.', 'error');
        return; // Останавливаем выполнение, если галочка не стоит
    }

    if (!address || !email) {
        showNotification('Пожалуйста, заполните все поля.', 'error');
        return;
    }

    // Блокируем кнопку на время запроса
    button.textContent = 'Генерация...';
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
            throw new Error(result.message || 'Ошибка сервера');
        }

        showNotification(result.message, 'success');
        planForm.reset(); // Очищаем форму

    } catch (error) {
        showNotification('К сожалению, что-то пошло не так. Попробуйте снова.', 'error');
        console.error('Ошибка при отправке:', error);
    } finally {
        // Возвращаем кнопку в исходное состояние
        button.textContent = 'Получить мой план';
        button.disabled = false;
    }
});
