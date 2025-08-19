// Загрузка настроек с сервера
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        if (response.ok) {
            const settings = await response.json();
            window.appSettings = settings;
            updateUI();
        } else {
            console.error('Ошибка загрузки настроек');
            // Используем локальные настройки как запасной вариант
            window.appSettings = {
                fullscreen: false,
                theme: 'blue',
                models: [
                    { id: 1, name: 'Qwen: Qwen3 Coder', url: 'qwen/qwen3-coder:free' },
                    { id: 2, name: 'DeepSeek: Deepseek R1 0528 Qwen3 8B', url: 'deepseek/deepseek-r1-0528-qwen3-8b:free' },
                ]
            };
            updateUI();
        }
    } catch (error) {
        console.error('Ошибка подключения к серверу:', error);
    }
}

// Сохранение настроек на сервере
async function saveSettings() {
    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(window.appSettings)
        });
        
        const result = await response.json();
        if (result.success) {
            showSuccess('Настройки сохранены');
            return true;
        } else {
            showError(result.message);
            return false;
        }
    } catch (error) {
        showError('Ошибка сохранения настроек');
        console.error('Ошибка сохранения:', error);
        return false;
    }
}

// Переключение полноэкранного режима
async function toggleFullscreen() {
    window.appSettings.fullscreen = !window.appSettings.fullscreen;
    
    const success = await saveSettings();
    if (success) {
        // Если используете pywebview, можно отправить сообщение в Python
        if (window.pywebview) {
            try {
                await window.pywebview.api.toggleFullscreen(window.appSettings.fullscreen);
            } catch (error) {
                console.log('pywebview не доступен');
            }
        }
    }
    
    // Анимация
    const toggle = document.getElementById('fullscreen-toggle');
    if (window.appSettings.fullscreen) {
        toggle.parentElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
            toggle.parentElement.style.transform = 'scale(1)';
        }, 200);
    }
}

// Смена темы
async function changeTheme(theme) {
    window.appSettings.theme = theme;
    
    // Применяем тему к документу немедленно
    document.documentElement.setAttribute('data-theme', theme);
    
    const success = await saveSettings();
    if (success) {
        updateUI();
        
        // Анимация
        const themeOptions = document.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            option.style.transform = 'scale(0.95)';
            setTimeout(() => {
                option.style.transform = 'scale(1)';
            }, 200);
        });
    }
}

// Добавление новой модели
async function addModel() {
    const nameInput = document.getElementById('model-name');
    const urlInput = document.getElementById('model-url');
    
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    
    if (!name || !url) {
        showError('Пожалуйста, заполните все поля');
        return;
    }
    
    try {
        const response = await fetch('/api/models', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, url })
        });
        
        const result = await response.json();
        if (result.success) {
            showSuccess(result.message);
            nameInput.value = '';
            urlInput.value = '';
            await loadSettings(); // Перезагружаем настройки
        } else {
            showError(result.message);
        }
    } catch (error) {
        showError('Ошибка добавления модели');
        console.error('Ошибка:', error);
    }
}

// Удаление модели
async function deleteModel(modelId) {
    try {
        const response = await fetch('/api/models', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: modelId })
        });
        
        const result = await response.json();
        if (result.success) {
            showSuccess(result.message);
            await loadSettings(); // Перезагружаем настройки
        } else {
            showError(result.message);
        }
    } catch (error) {
        showError('Ошибка удаления модели');
        console.error('Ошибка:', error);
    }
}

// Сохранение всех настроек
async function saveAllSettings() {
    const success = await saveSettings();
    if (success) {
        // Анимация кнопки
        const saveBtn = document.getElementById('save-settings');
        const originalText = saveBtn.querySelector('.btn-text').textContent;
        saveBtn.querySelector('.btn-text').textContent = 'Сохранено!';
        saveBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        
        setTimeout(() => {
            saveBtn.querySelector('.btn-text').textContent = originalText;
            saveBtn.style.background = '';
        }, 2000);
    }
}

// Обновление интерфейса
function updateUI() {
    if (!window.appSettings) return;
    
    // Применяем текущую тему
    document.documentElement.setAttribute('data-theme', window.appSettings.theme);
    
    // Полноэкранный режим
    const fullscreenToggle = document.getElementById('fullscreen-toggle');
    if (fullscreenToggle) {
        fullscreenToggle.checked = window.appSettings.fullscreen;
    }
    
    // Тема
    const themeOptions = document.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
        option.classList.remove('active');
        if (option.dataset.theme === window.appSettings.theme) {
            option.classList.add('active');
        }
    });
    
    // Модели
    renderModels();
}

// Рендер списка моделей
function renderModels() {
    if (!window.appSettings) return;
    
    const container = document.getElementById('models-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    window.appSettings.models.forEach(model => {
        const modelElement = document.createElement('div');
        modelElement.className = 'model-item';
        modelElement.innerHTML = `
            <div class="model-info">
                <div class="model-name">${model.name}</div>
                <div class="model-url">${model.url}</div>
            </div>
            <div class="model-actions">
                <button class="delete-btn" data-id="${model.id}">Удалить</button>
            </div>
        `;
        container.appendChild(modelElement);
    });
    
    // Добавляем обработчики удаления
    document.querySelectorAll('.delete-btn').forEach(btn => {
        // Создаем новый элемент вместо cloneNode для избежания проблем
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', function() {
            const modelId = parseInt(this.dataset.id);
            deleteModel(modelId);
        });
    });
}

// Показ ошибок
function showError(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(239, 68, 68, 0.9);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            animation: slideInRight 0.3s ease;
        ">
            ${message}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Показ уведомлений об успехе
function showSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(16, 185, 129, 0.9);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            animation: slideInRight 0.3s ease;
        ">
            ${message}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    
    // Обработчики событий
    setTimeout(() => {
        const fullscreenToggle = document.getElementById('fullscreen-toggle');
        if (fullscreenToggle) {
            fullscreenToggle.addEventListener('change', toggleFullscreen);
        }
        
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', function() {
                changeTheme(this.dataset.theme);
            });
        });
        
        const addModelBtn = document.getElementById('add-model-btn');
        if (addModelBtn) {
            addModelBtn.addEventListener('click', addModel);
        }
        
        const saveSettingsBtn = document.getElementById('save-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', saveAllSettings);
        }
        
        // Добавление модели по Enter
        const urlInput = document.getElementById('model-url');
        if (urlInput) {
            urlInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    addModel();
                }
            });
        }
    }, 100);
});

// Добавляем анимацию для уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);