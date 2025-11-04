class SingleChat {
    constructor() {
        this.currentChatId = null;
        this.currentChatData = null;
        this.pollingInterval = null;
        this.lastMessageCount = 0;
        this.isWaitingForAI = false;
        this.attachedFiles = []; // Массив для хранения прикрепленных файлов
        this.init();
    }

    init() {
        // Загружаем список чатов при инициализации
        this.loadChatsList();
        
        // Назначаем обработчики событий
        document.getElementById('new-chat-btn').addEventListener('click', () => {
            this.openNewChatModal();
        });
        
        document.getElementById('send-message-btn').addEventListener('click', () => {
            this.sendMessage();
        });
        
        document.getElementById('message-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        document.getElementById('message-input').addEventListener('input', this.autoResizeTextarea);
        
        // Обработчики для модального окна создания чата
        this.setupCreateModalHandlers();
        
        // Обработчики для модального окна настроек чата
        this.setupSettingsModalHandlers();
        
        // Обработчики для кнопки прикрепления файлов
        this.setupAttachFileHandlers();
        
        // Обработчик для кнопки меню на мобильных устройствах
        const toggleButton = document.getElementById('toggle-sidebar');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => {
                const sidebar = document.getElementById('chat-sidebar');
                sidebar.classList.toggle('open');
            });
        }
        
        // Закрытие сайдбара при клике вне его на мобильных
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('chat-sidebar');
            const toggleButton = document.getElementById('toggle-sidebar');
            
            if (window.innerWidth <= 768 && 
                sidebar.classList.contains('open') && 
                !sidebar.contains(e.target) && 
                e.target !== toggleButton) {
                sidebar.classList.remove('open');
            }
        });
    }

    // Настройка обработчиков модального окна создания чата
    setupCreateModalHandlers() {
        const modal = document.getElementById('new-chat-modal');
        const closeBtn = document.querySelector('.close-modal');
        const cancelBtn = document.getElementById('cancel-create-chat');
        const confirmBtn = document.getElementById('create-chat-confirm');
        
        // Функция закрытия модального окна
        const closeModal = () => {
            this.closeModal('new-chat-modal');
        };
        
        // Открытие модального окна
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        // Закрытие при клике вне модального окна
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // Подтверждение создания чата
        confirmBtn.addEventListener('click', () => {
            this.createChatFromModal();
        });
        
        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
        });
    }

    // Настройка обработчиков модального окна настроек чата (обновленная версия)
    setupSettingsModalHandlers() {
        const modal = document.getElementById('chat-settings-modal');
        const closeBtn = document.querySelector('.close-settings-modal');
        const cancelBtn = document.getElementById('cancel-chat-settings');
        const saveBtn = document.getElementById('save-chat-settings');
        const deleteBtn = document.getElementById('delete-chat-btn');
        
        // Функция закрытия модального окна
        const closeModal = () => {
            this.closeModal('chat-settings-modal');
        };
        
        // Обработчики для закрытия
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        // Сохранение настроек чата
        saveBtn.addEventListener('click', () => {
            this.saveChatSettings();
        });
        
        // Удаление чата
        deleteBtn.addEventListener('click', () => {
            this.deleteChat();
        });
        
        // Закрытие при клике вне модального окна
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
        });
    }

    // Настройка обработчиков для кнопки прикрепления файлов
    setupAttachFileHandlers() {
        const attachBtn = document.getElementById('attach-file-btn');
        const attachMenu = document.getElementById('attach-menu');
        const imageInput = document.getElementById('file-input-image');
        const textInput = document.getElementById('file-input-text');
        
        if (!attachBtn || !attachMenu || !imageInput || !textInput) return;
        
        // Открытие/закрытие меню при клике на кнопку
        attachBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            attachMenu.classList.toggle('hidden');
        });
        
        // Закрытие меню при клике вне его
        document.addEventListener('click', (e) => {
            if (!attachMenu.contains(e.target) && e.target !== attachBtn) {
                attachMenu.classList.add('hidden');
            }
        });
        
        // Обработчики для пунктов меню
        const menuItems = attachMenu.querySelectorAll('.attach-menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileType = item.dataset.type;
                this.handleAttachFile(fileType);
                attachMenu.classList.add('hidden');
            });
        });
        
        // Обработчик выбора изображения
        imageInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.processSelectedFile(e.target.files[0], 'image');
                e.target.value = ''; // Сброс input для повторного выбора
            }
        });
        
        // Обработчик выбора текстового файла
        textInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.processSelectedFile(e.target.files[0], 'text');
                e.target.value = ''; // Сброс input для повторного выбора
            }
        });
    }

    // Обработка выбора типа файла
    handleAttachFile(fileType) {
        console.log(`[ATTACH] Выбран тип файла: ${fileType}`);
        
        if (fileType === 'image') {
            document.getElementById('file-input-image').click();
        } else if (fileType === 'text') {
            document.getElementById('file-input-text').click();
        }
    }
    
    // Обработка выбранного файла
    async processSelectedFile(file, fileType) {
        console.log(`[ATTACH] Файл выбран:`, file.name, `(${fileType})`);
        
        // Пока поддерживаем только .txt файлы
        if (fileType === 'text' && !file.name.toLowerCase().endsWith('.txt')) {
            this.showNotification('Поддерживаются только .txt файлы', 'error');
            return;
        }
        
        // Пока поддерживаем только текстовые файлы
        if (fileType !== 'text') {
            this.showNotification('Пока поддерживаются только текстовые файлы', 'error');
            return;
        }
        
        try {
            // Отправляем файл на сервер для обработки
            const formData = new FormData();
            formData.append('file', file);
            formData.append('file_type', fileType);
            
            const response = await fetch('/api/process_file', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                console.log('[ATTACH] Файл успешно обработан:', result);
                
                // Сохраняем данные файла локально
                this.attachedFiles.push({
                    filename: result.filename,
                    content: result.content
                });
                
                // Обновляем UI
                this.updateFileIndicator();
                
                this.showNotification(`Файл "${result.filename}" прикреплен`, 'success');
            } else {
                console.error('[ATTACH] Ошибка обработки файла:', result.error);
                this.showNotification(`Ошибка: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('[ATTACH] Ошибка при обработке файла:', error);
            this.showNotification('Ошибка при обработке файла', 'error');
        }
    }
    
    // Обновление индикатора прикрепленных файлов
    updateFileIndicator() {
        const indicator = document.getElementById('file-indicator');
        const count = document.getElementById('file-count');
        
        if (!indicator || !count) return;
        
        if (this.attachedFiles.length > 0) {
            indicator.classList.remove('hidden');
            count.textContent = this.attachedFiles.length;
            
            // Обновляем tooltip с именами файлов
            const fileNames = this.attachedFiles.map(f => f.filename).join('\n');
            indicator.setAttribute('title', fileNames);
        } else {
            indicator.classList.add('hidden');
            indicator.setAttribute('title', '');
        }
    }

    initReasoningLenControls(modal) {
        if (!modal) return;
        
        // Для создания чата
        const slider = modal.querySelector('#reasoning-len-slider');
        const input = modal.querySelector('#reasoning-len-input');
        const valueDisplay = modal.querySelector('#reasoning-len-value');
        
        // Для настроек чата
        const settingsSlider = modal.querySelector('#settings-reasoning-len-slider');
        const settingsInput = modal.querySelector('#settings-reasoning-len-input');
        const settingsValueDisplay = modal.querySelector('#settings-reasoning-len-value');
        
        // Функция для настройки одного набора элементов
        const setupControlSet = (s, i, vd) => {
            if (s && i && vd) {
                // Синхронизация ползунка с числовым полем
                s.addEventListener('input', () => {
                    const value = s.value;
                    i.value = value;
                    vd.textContent = value;
                });
                
                // Синхронизация числового поля с ползунком
                i.addEventListener('input', () => {
                    let value = parseInt(i.value) || 0;
                    // Ограничиваем значение диапазоном
                    value = Math.max(0, Math.min(2500, value));
                    i.value = value;
                    s.value = value;
                    vd.textContent = value;
                });
                
                // Предотвращаем ввод нечисловых значений
                i.addEventListener('keypress', (e) => {
                    if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
                        e.preventDefault();
                    }
                });
            }
        };
        
        // Настройка для создания чата
        setupControlSet(slider, input, valueDisplay);
        // Настройка для настроек чата
        setupControlSet(settingsSlider, settingsInput, settingsValueDisplay);
    }

    // Функция удаления чата (НОВАЯ функция)
    async deleteChat() {
        // Открываем модальное окно подтверждения вместо стандартного confirm
        this.openDeleteConfirmModal();
    }

    // Открытие модального окна подтверждения удаления
    openDeleteConfirmModal() {
        const modal = document.getElementById('delete-confirm-modal');
        const closeBtn = document.querySelector('.close-delete-confirm');
        const confirmBtn = document.getElementById('confirm-delete-btn');
        const cancelBtn = document.getElementById('cancel-delete-btn');
        
        // Показываем модальное окно
        modal.style.display = 'flex';
        
        // Функция закрытия модального окна
        const closeModal = () => {
            modal.style.display = 'none';
        };
        
        // Обработчики событий
        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;
        
        // Подтверждение удаления
        confirmBtn.onclick = () => {
            this.confirmDeleteChat();
            closeModal();
        };
        
        // Закрытие при клике вне модального окна
        window.onclick = (event) => {
            if (event.target === modal) {
                closeModal();
            }
        };
        
        // Закрытие по Escape
        const handleEscape = (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    // Подтверждение удаления чата
    async confirmDeleteChat() {
        const chatIdInput = document.getElementById('settings-chat-id');
        const chatId = chatIdInput.value;
        
        try {
            const response = await fetch(`/api/chats/${chatId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                // Если это текущий активный чат, очищаем его
                if (this.currentChatId === chatId) {
                    this.clearChat();
                }
                
                // Обновляем список чатов
                this.loadChatsList();
                
                // Закрываем модальное окно настроек
                document.getElementById('chat-settings-modal').style.display = 'none';
                
                // Показываем уведомление
                this.showNotification('Чат успешно удален', 'success');
            } else {
                const result = await response.json();
                console.error('Ошибка удаления чата:', result.error);
                this.showNotification('Ошибка удаления чата: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Ошибка подключения:', error);
            this.showNotification('Ошибка подключения к серверу', 'error');
        }
    }

    // Показ уведомлений
    showNotification(message, type = 'info') {
        // Создаем элемент уведомления
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 
                             type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 
                             'rgba(59, 130, 246, 0.9)'};
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

    // Открытие модального окна создания чата
    async openNewChatModal() {
        const modal = document.getElementById('new-chat-modal');
        const modelSelect = document.getElementById('chat-model');
        const titleInput = document.getElementById('chat-title');
        const systemPromptInput = document.getElementById('system-prompt');
        
        // Очищаем поля
        titleInput.value = '';
        systemPromptInput.value = '';
        modelSelect.innerHTML = '<option value="">Загрузка моделей...</option>';
        
        // Загружаем список моделей
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const settings = await response.json();
                const models = settings.models || [];
                
                if (models.length > 0) {
                    modelSelect.innerHTML = '';
                    models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.url;
                        option.textContent = model.name;
                        modelSelect.appendChild(option);
                    });
                } else {
                    modelSelect.innerHTML = '<option value="">Нет доступных моделей</option>';
                }
            } else {
                modelSelect.innerHTML = '<option value="">Ошибка загрузки моделей</option>';
            }
        } catch (error) {
            console.error('Ошибка загрузки моделей:', error);
            modelSelect.innerHTML = '<option value="">Ошибка подключения</option>';
        }
        
        // Показываем модальное окно с правильным display
        modal.style.display = 'flex'; // Используем flex для центрирования
        
        // Фокус на поле названия
        setTimeout(() => {
            titleInput.focus();
        }, 100);
        
        // Предотвращаем скролл фона
        document.body.style.overflow = 'hidden';
    }

    showInputErrorModal(message) {
        const modal = document.getElementById('input-error-modal');
        const messageElement = document.getElementById('input-error-message');
        const closeBtn = document.querySelector('.close-input-error-modal');
        const confirmBtn = document.getElementById('confirm-input-error-btn');
        
        if (messageElement) {
            messageElement.textContent = message || 'Произошла ошибка ввода';
        }
        
        // Функция закрытия модального окна
        const closeModal = () => {
            modal.style.display = 'none';
        };
        
        // Обработчики событий
        closeBtn.onclick = closeModal;
        confirmBtn.onclick = closeModal;
        
        // Закрытие при клике вне модального окна
        window.onclick = (event) => {
            if (event.target === modal) {
                closeModal();
            }
        };
        
        // Закрытие по Escape
        const handleEscape = (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Показываем модальное окно
        modal.style.display = 'block';
    }

    // Создание чата из модального окна (обновленная версия)
    async createChatFromModal() {
        const titleInput = document.getElementById('chat-title');
        const modelSelect = document.getElementById('chat-model');
        const systemPromptInput = document.getElementById('system-prompt');
        let title = titleInput.value.trim();
        const modelUrl = modelSelect.value;
        const systemPrompt = systemPromptInput.value.trim();
        
        // Ограничиваем длину названия чата до 50 символов
        if (title.length > 50) {
            title = title.substring(0, 50);
        }
        
        if (!title) {
            // Заменяем alert на модальное окно
            this.showInputErrorModal('Пожалуйста, введите название чата');
            return;
        }
        
        if (!modelUrl) {
            // Заменяем alert на модальное окно
            this.showInputErrorModal('Пожалуйста, выберите модель ИИ');
            return;
        }
        
        try {
            // Создаем новый чат с выбранными параметрами
            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: title,
                    model: modelUrl,
                    system_prompt: systemPrompt || undefined // Не добавляем, если пустой
                })
            });
            
            if (response.ok) {
                const newChat = await response.json();
                this.loadChat(newChat.id);
                this.loadChatsList();
                
                // Закрываем модальное окно
                document.getElementById('new-chat-modal').style.display = 'none';
                
                // Закрываем сайдбар на мобильных
                if (window.innerWidth <= 768) {
                    document.getElementById('chat-sidebar').classList.remove('open');
                }
            } else {
                console.error('Ошибка создания чата');
                this.showInputErrorModal('Ошибка создания чата');
            }
        } catch (error) {
            console.error('Ошибка подключения:', error);
            this.showInputErrorModal('Ошибка подключения к серверу');
        }
    }

    // Открытие модального окна настроек чата (обновленная версия)
    async openChatSettings(chatId) {
        const modal = document.getElementById('chat-settings-modal');
        const chatIdInput = document.getElementById('settings-chat-id');
        const titleInput = document.getElementById('settings-chat-title');
        const modelSelect = document.getElementById('settings-chat-model');
        const systemPromptInput = document.getElementById('settings-system-prompt');
        
        // Загружаем данные чата
        try {
            const response = await fetch(`/api/chats/${chatId}`);
            if (response.ok) {
                const chatData = await response.json();
                
                // Заполняем поля данными чата
                chatIdInput.value = chatData.id;
                titleInput.value = chatData.title || '';
                systemPromptInput.value = chatData.system_prompt || '';
                
                // Загружаем список моделей
                const settingsResponse = await fetch('/api/settings');
                if (settingsResponse.ok) {
                    const settings = await settingsResponse.json();
                    const models = settings.models || [];
                    
                    modelSelect.innerHTML = '';
                    models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.url;
                        option.textContent = model.name;
                        if (model.url === chatData.model) {
                            option.selected = true;
                        }
                        modelSelect.appendChild(option);
                    });
                }
                
                // Показываем модальное окно с правильным display
                modal.style.display = 'flex'; // Используем flex для центрирования
                
                // Предотвращаем скролл фона
                document.body.style.overflow = 'hidden';
                
            } else {
                console.error('Ошибка загрузки данных чата');
                alert('Ошибка загрузки данных чата');
            }
        } catch (error) {
            console.error('Ошибка подключения:', error);
            alert('Ошибка подключения к серверу');
        }
    }

    // Сохранение настроек чата (обновленная версия)
    async saveChatSettings() {
        const chatIdInput = document.getElementById('settings-chat-id');
        const titleInput = document.getElementById('settings-chat-title');
        const modelSelect = document.getElementById('settings-chat-model');
        const systemPromptInput = document.getElementById('settings-system-prompt');
        const chatId = chatIdInput.value;
        let title = titleInput.value.trim();
        const modelUrl = modelSelect.value;
        const systemPrompt = systemPromptInput.value.trim();
        
        // Ограничиваем длину названия чата до 50 символов
        if (title.length > 50) {
            title = title.substring(0, 50);
        }
        
        if (!title) {
            // Заменяем alert на модальное окно
            this.showInputErrorModal('Пожалуйста, введите название чата');
            return;
        }
        
        if (!modelUrl) {
            // Заменяем alert на модальное окно
            this.showInputErrorModal('Пожалуйста, выберите модель ИИ');
            return;
        }
        
        try {
            // Загружаем текущие данные чата
            const response = await fetch(`/api/chats/${chatId}`);
            if (response.ok) {
                const chatData = await response.json();
                
                // Обновляем данные
                chatData.title = title;
                chatData.model = modelUrl;
                chatData.system_prompt = systemPrompt || undefined; // Не добавляем, если пустой
                
                // Сохраняем обновленные данные
                const updateResponse = await fetch(`/api/chats/${chatId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(chatData)
                });
                
                if (updateResponse.ok) {
                    // Обновляем UI
                    if (this.currentChatId === chatId) {
                        this.currentChatData = chatData;
                        const titleElement = document.getElementById('current-chat-title');
                        if (titleElement) {
                            titleElement.textContent = title;
                        }
                    }
                    
                    this.loadChatsList();
                    
                    // Закрываем модальное окно
                    document.getElementById('chat-settings-modal').style.display = 'none';
                } else {
                    console.error('Ошибка сохранения настроек чата');
                    this.showInputErrorModal('Ошибка сохранения настроек чата');
                }
            } else {
                console.error('Ошибка загрузки данных чата');
                this.showInputErrorModal('Ошибка загрузки данных чата');
            }
        } catch (error) {
            console.error('Ошибка подключения:', error);
            this.showInputErrorModal('Ошибка подключения к серверу');
        }
    }

    // Закрытие модального окна (новая функция)
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            // Восстанавливаем скролл
            document.body.style.overflow = '';
        }
    }

    // Загрузка списка чатов
    async loadChatsList() {
        try {
            const response = await fetch('/api/chats');
            if (response.ok) {
                const chats = await response.json();
                this.renderChatsList(chats);
            } else {
                console.error('Ошибка загрузки списка чатов');
                this.renderChatsList([]);
            }
        } catch (error) {
            console.error('Ошибка подключения:', error);
            this.renderChatsList([]);
        }
    }

    // Отображение списка чатов
    renderChatsList(chats) {
        const chatsListElement = document.getElementById('chats-list');
        if (!chatsListElement) return;

        if (chats.length === 0) {
            chatsListElement.innerHTML = '<div class="loading-placeholder">Нет чатов. Создайте новый!</div>';
            return;
        }

        chatsListElement.innerHTML = '';
        
        chats.forEach(chat => {
            const chatElement = document.createElement('div');
            chatElement.className = `chat-item ${this.currentChatId === chat.id ? 'active' : ''}`;
            chatElement.dataset.chatId = chat.id;
            
            // Форматируем дату
            const date = new Date(chat.created_at);
            const formattedDate = date.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit'
            });
            
            // Ограничиваем длину названия чата до 15 символов
            let displayTitle = chat.title || 'Без названия';
            if (displayTitle.length > 15) {
                displayTitle = displayTitle.substring(0, 12) + '...';
            }
            
            chatElement.innerHTML = `
                <div class="chat-item-header">
                    <div class="chat-item-info">
                        <div class="chat-item-title">${displayTitle}</div>
                        <div class="chat-item-date">${formattedDate}</div>
                    </div>
                    <button class="chat-item-settings" data-chat-id="${chat.id}"><div>⚙️</div></button>
                </div>
            `;
            
            chatElement.addEventListener('click', (e) => {
                // Проверяем, что клик был не по кнопке настроек
                if (!e.target.classList.contains('chat-item-settings')) {
                    this.loadChat(chat.id);
                    if (window.innerWidth <= 768) {
                        document.getElementById('chat-sidebar').classList.remove('open');
                    }
                }
            });
            
            // Добавляем обработчик для кнопки настроек
            const settingsBtn = chatElement.querySelector('.chat-item-settings');
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Предотвращаем всплытие события
                this.openChatSettings(chat.id);
            });
            
            chatsListElement.appendChild(chatElement);
        });
    }

    // Остальные методы остаются без изменений...
    // (loadChat, startPolling, stopPolling, checkForUpdates, renderChat, clearChat, 
    // addMessageToChat, sendToAI, saveChat, autoResizeTextarea, escapeHtml, destroy)

    processAllTags(text) {
        // Сначала извлекаем и обрабатываем все теги кода
        const { processedText, codeBlocks } = this.extractAndProcessCodeTags(text);
        
        // Затем обрабатываем остальные теги в оставшемся тексте
        const finalContent = this.processThoughtsAndResponseTags(processedText, codeBlocks);
        
        return finalContent;
    }

    extractAndProcessCodeTags(text) {
        const codeBlocks = [];
        let processedText = text;
        let codeIndex = 0;
        
        // Регулярное выражение для поиска тегов [CODE:language]...[/CODE]
        const codeRegex = /\[CODE:\s*([^\]]+?)\]([\s\S]*?)\[\/CODE\]/g;
        
        // Заменяем все найденные теги кода на плейсхолдеры
        processedText = processedText.replace(codeRegex, (match, language, codeContent) => {
            // Очищаем содержимое кода от лишних пробелов в начале и конце
            const trimmedCode = codeContent.trim();
            
            // Сохраняем информацию о блоке кода
            codeBlocks.push({
                language: language.trim(),
                code: trimmedCode
            });
            
            // Возвращаем плейсхолдер
            return `{{CODE_BLOCK_${codeIndex++}}}`;
        });
        
        return { processedText, codeBlocks };
    }

    processThoughtsAndResponseTags(text, codeBlocks) {
        let result = '';
        
        // НЕ заменяем плейсхолдеры сразу, работаем с исходным текстом
        const textWithPlaceholders = text;
        
        // Ищем теги [THOUGHTS] и [/THOUGHTS]
        const thoughtsRegex = /\[THOUGHTS\](.*?)\[\/THOUGHTS\]/s;
        const thoughtsMatch = textWithPlaceholders.match(thoughtsRegex);
        
        // Ищем теги [RESPONSE] и [/RESPONSE]
        const responseRegex = /\[RESPONSE\](.*?)\[\/RESPONSE\]/s;
        const responseMatch = textWithPlaceholders.match(responseRegex);
        
        // Извлекаем содержимое тегов
        const thoughtsContent = thoughtsMatch && thoughtsMatch[1] ? thoughtsMatch[1].trim() : '';
        const responseContent = responseMatch && responseMatch[1] ? responseMatch[1].trim() : '';
        
        // Проверяем наличие блоков кода
        const hasCodeBlocks = codeBlocks && codeBlocks.length > 0;
        
        // Если нет специальных тегов и нет блоков кода, отображаем как обычный текст
        if (!thoughtsMatch && !responseMatch && !hasCodeBlocks) {
            return `<div class="text">${this.escapeHtml(textWithPlaceholders)}</div>`;
        }
        
        // Добавляем мысли, если есть (без плейсхолдеров кода)
        if (thoughtsContent) {
            const cleanThoughts = thoughtsContent.replace(/\{\{CODE_BLOCK_\d+\}\}/g, '').trim();
            if (cleanThoughts) {
                result += `
                    <div class="ai-thoughts">
                        <span class="ai-thoughts-label">Мысли:</span>
                        ${this.escapeHtml(cleanThoughts)}
                    </div>
                `;
            }
        }
        
        // Добавляем основной ответ или оставшийся текст (без плейсхолдеров кода)
        if (responseContent) {
            const cleanResponse = responseContent.replace(/\{\{CODE_BLOCK_\d+\}\}/g, '').trim();
            if (cleanResponse) {
                result += `<div class="ai-response">${this.escapeHtml(cleanResponse)}</div>`;
            }
        } else if (thoughtsContent) {
            // Если есть только мысли, показываем оставшийся текст как ответ
            let remainingText = textWithPlaceholders
                .replace(thoughtsMatch[0], '')
                .replace(/\{\{CODE_BLOCK_\d+\}\}/g, '')
                .trim();
            
            if (remainingText) {
                result += `<div class="ai-response">${this.escapeHtml(remainingText)}</div>`;
            }
        } else {
            // Если нет тегов THOUGHTS/RESPONSE, но есть текст или код
            const cleanedText = textWithPlaceholders
                .replace(/\{\{CODE_BLOCK_\d+\}\}/g, '')
                .trim();
            
            if (cleanedText) {
                result += `<div class="ai-response">${this.escapeHtml(cleanedText)}</div>`;
            }
        }
        
        // Теперь добавляем все блоки кода в конец
        if (hasCodeBlocks) {
            codeBlocks.forEach((codeBlock, index) => {
                result += this.createCodeBlockHTML(codeBlock.language, codeBlock.code);
            });
        }
        
        return result;
    }

    createCodeBlockHTML(language, codeContent) {
        // Разбиваем код на строки
        const lines = codeContent.split('\n');
        
        // Создаем HTML для пронумерованных строк
        let linesHtml = '';
        lines.forEach((line, index) => {
            linesHtml += `
                <div class="ai-code-line">
                    <div class="ai-code-line-number">${index + 1}</div>
                    <div class="ai-code-line-content">${this.escapeHtmlForCode(line)}</div>
                </div>
            `;
        });
        
        // Создаем уникальный ID для кнопки копирования
        const copyButtonId = `copy-btn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return `
            <div class="ai-code-block">
                <div class="ai-code-header">
                    <div class="ai-code-language">${this.escapeHtml(language)}</div>
                    <button class="ai-code-copy-btn" id="${copyButtonId}" data-code="${this.escapeHtmlForCode(codeContent).replace(/"/g, '&quot;')}">
                        Копировать
                    </button>
                </div>
                <div class="ai-code-content">
                    <div class="ai-code-lines">
                        ${linesHtml}
                    </div>
                </div>
            </div>
        `;
    }

    // Загрузка конкретного чата
    async loadChat(chatId) {
        try {
            this.stopPolling();
            
            const response = await fetch(`/api/chats/${chatId}`);
            if (response.ok) {
                this.currentChatData = await response.json();
                this.currentChatId = chatId;
                this.lastMessageCount = this.currentChatData.messages ? this.currentChatData.messages.length : 0;
                
                // ИСПОЛЬЗУЕМ оригинальную функцию renderChat с анимацией при открытии
                this.renderChat();
                
                this.loadChatsList();
                this.startPolling();
            } else {
                console.error('Чат не найден');
                this.clearChat();
            }
        } catch (error) {
            console.error('Ошибка загрузки чата:', error);
            this.clearChat();
        }
    }

    // Начало периодической проверки обновлений
    startPolling() {
        if (this.pollingInterval) {
            this.stopPolling();
        }
        
        this.pollingInterval = setInterval(() => {
            this.checkForUpdates();
        }, 1000);
    }

    // Остановка периодической проверки
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // Проверка на наличие обновлений в чате
    async checkForUpdates() {
        if (!this.currentChatId) return;

        try {
            const response = await fetch(`/api/chats/${this.currentChatId}`);
            if (response.ok) {
                const updatedChatData = await response.json();
                const newMessageCount = updatedChatData.messages ? updatedChatData.messages.length : 0;
                
                // Проверяем, изменились ли данные чата
                const hasDataChanged = JSON.stringify(updatedChatData) !== JSON.stringify(this.currentChatData);
                
                if (hasDataChanged) {
                    // Если количество сообщений увеличилось, добавляем новые сообщения
                    if (newMessageCount > this.lastMessageCount) {
                        // Добавляем новые сообщения БЕЗ анимации
                        for (let i = this.lastMessageCount; i < newMessageCount; i++) {
                            const newMessage = updatedChatData.messages[i];
                            // Проверяем, не добавлено ли сообщение уже
                            // Для LOADING сообщений проверяем по содержимому, а не по ID
                            let isMessageAlreadyAdded = false;
                            
                            if (this.currentChatData.messages) {
                                // Сначала проверяем по ID (стандартная проверка)
                                isMessageAlreadyAdded = this.currentChatData.messages.some(msg => msg.id === newMessage.id);
                                
                                // Если не найдено по ID, проверяем LOADING сообщения в DOM
                                if (!isMessageAlreadyAdded) {
                                    const loadingInfo = this.extractLoadingProgress(newMessage.text);
                                    console.log('[CHECK] Новое сообщение. isLoading:', loadingInfo.isLoading, 'progress:', loadingInfo.progress);
                                    if (loadingInfo.isLoading) {
                                        console.log('[CHECK] Это LOADING сообщение! Ищем существующее в DOM...');
                                        // Ищем последнее AI LOADING сообщение в DOM
                                        const allMessages = document.querySelectorAll('.message.ai');
                                        console.log('[CHECK] Всего AI сообщений в DOM:', allMessages.length);
                                        let existingLoadingElement = null;
                                        
                                        // Ищем с конца (последнее сообщение)
                                        for (let i = allMessages.length - 1; i >= 0; i--) {
                                            const msgElement = allMessages[i];
                                            const loadingContainer = msgElement.querySelector('.ai-loading-container');
                                            console.log('[CHECK] Проверяем AI сообщение', i, '- есть LOADING:', !!loadingContainer);
                                            if (loadingContainer) {
                                                existingLoadingElement = msgElement;
                                                console.log('[CHECK] Найдено LOADING сообщение в DOM!');
                                                break;
                                            }
                                        }
                                        
                                        if (existingLoadingElement) {
                                            isMessageAlreadyAdded = true;
                                            console.log('[CHECK] Обновляем существующее LOADING сообщение в DOM');
                                            this.updateMessageContent(existingLoadingElement, newMessage);
                                        } else {
                                            console.log('[CHECK] LOADING сообщение в DOM не найдено, добавим новое');
                                        }
                                    }
                                }
                            }
                            
                            if (!isMessageAlreadyAdded) {
                                console.log('[CHECK] Добавляем новое сообщение');
                                this.addMessageToChatWithoutAnimation(newMessage);
                            }
                        }
                        
                        // Обновляем данные чата
                        this.currentChatData = updatedChatData;
                        this.lastMessageCount = newMessageCount;
                    } else if (newMessageCount === this.lastMessageCount) {
                        // Количество сообщений не изменилось, но содержимое могло измениться
                        console.log('[CHECK_SAME] Количество сообщений не изменилось, проверяем содержимое...');
                        
                        // Проверяем, изменились ли сообщения
                        const hasMessagesChanged = JSON.stringify(updatedChatData.messages) !== 
                                                JSON.stringify(this.currentChatData.messages);
                        
                        if (hasMessagesChanged) {
                            console.log('[CHECK_SAME] Сообщения изменились!');
                            
                            // Проверяем, есть ли LOADING сообщение в новых данных
                            const lastMessage = updatedChatData.messages[updatedChatData.messages.length - 1];
                            if (lastMessage && lastMessage.sender === 'ai') {
                                const loadingInfo = this.extractLoadingProgress(lastMessage.text);
                                
                                if (loadingInfo.isLoading) {
                                    console.log('[CHECK_SAME] Последнее сообщение - LOADING! Обновляем плавно...');
                                    // Это LOADING сообщение - ищем его в DOM и обновляем плавно
                                    const allMessages = document.querySelectorAll('.message.ai');
                                    if (allMessages.length > 0) {
                                        const lastAIMessage = allMessages[allMessages.length - 1];
                                        const loadingContainer = lastAIMessage.querySelector('.ai-loading-container');
                                        
                                        if (loadingContainer) {
                                            console.log('[CHECK_SAME] Найдено LOADING сообщение в DOM, обновляем...');
                                            this.updateMessageContent(lastAIMessage, lastMessage);
                                            this.currentChatData = updatedChatData;
                                            return; // Выходим, не перерисовываем весь чат
                                        }
                                    }
                                }
                            }
                            
                            // Если не LOADING или не нашли - перерисовываем весь чат
                            console.log('[CHECK_SAME] Не LOADING или не найдено, перерисовываем весь чат');
                            this.currentChatData = updatedChatData;
                            this.renderChatWithoutAnimation();
                        } else {
                            // Только метаданные изменились
                            this.currentChatData = updatedChatData;
                        }
                    } else {
                        // Количество сообщений уменьшилось (редкий случай) - перерисовываем полностью БЕЗ анимации
                        this.currentChatData = updatedChatData;
                        this.lastMessageCount = newMessageCount;
                        this.renderChatWithoutAnimation();
                    }
                    
                    // Проверяем состояние ожидания
                    this.updateWaitingState();
                    
                    // Обновляем состояние кнопки отправки
                    this.updateSendButtonState();
                }
            }
        } catch (error) {
            console.error('Ошибка проверки обновлений:', error);
        }
    }

    // Отображение чата
    renderChat() {
        if (!this.currentChatData) return;

        const titleElement = document.getElementById('current-chat-title');
        if (titleElement) {
            // Ограничиваем длину названия в заголовке чата
            let displayTitle = this.currentChatData.title || 'Без названия';
            if (displayTitle.length > 30) {
                displayTitle = displayTitle.substring(0, 27) + '...';
            }
            titleElement.textContent = displayTitle;
        }

        const messagesElement = document.getElementById('chat-messages');
        if (messagesElement) {
            if (this.currentChatData.messages && this.currentChatData.messages.length > 0) {
                messagesElement.innerHTML = '';
                this.currentChatData.messages.forEach(message => {
                    this.addMessageToChat(message);
                });
                
                if (this.currentChatData.messages.length > 0) {
                    const lastMessage = this.currentChatData.messages[this.currentChatData.messages.length - 1];
                    if (lastMessage.sender === 'user') {
                        this.isWaitingForAI = true;
                        const sendButton = document.getElementById('send-message-btn');
                        if (sendButton) {
                            sendButton.disabled = true;
                        }
                    } else if (lastMessage.sender === 'ai') {
                        this.isWaitingForAI = false;
                        const sendButton = document.getElementById('send-message-btn');
                        if (sendButton) {
                            sendButton.disabled = false;
                        }
                    }
                }
            } else {
                messagesElement.innerHTML = '<div class="welcome-message"><p>Начните диалог! Введите ваше первое сообщение.</p></div>';
                this.isWaitingForAI = false;
                const sendButton = document.getElementById('send-message-btn');
                if (sendButton) {
                    sendButton.disabled = false;
                }
            }
            
            messagesElement.scrollTop = messagesElement.scrollHeight;
        }

        const inputElement = document.getElementById('message-input');
        const sendButton = document.getElementById('send-message-btn');
        
        if (inputElement) {
            inputElement.disabled = false;
            inputElement.placeholder = 'Введите ваше сообщение...';
        }
        
        // Обновляем состояние кнопки отправки на основе последнего сообщения
        this.updateSendButtonState();
    }

    updateMessageContent(messageElement, messageData) {
        if (!messageElement || !messageData) return;
        
        // Обновляем атрибуты
        messageElement.dataset.messageId = messageData.id;
        
        // Для сообщений ИИ обновляем содержимое с обработкой тегов
        if (messageData.sender === 'ai') {
            // Проверяем, является ли сообщение LOADING сообщением
            const loadingInfo = this.extractLoadingProgress(messageData.text);
            
            console.log('[UPDATE] updateMessageContent вызван. isLoading:', loadingInfo.isLoading, 'progress:', loadingInfo.progress);
            
            if (loadingInfo.isLoading) {
                console.log('[UPDATE] Это LOADING сообщение! Пытаемся плавно обновить...');
                // Это LOADING сообщение - пытаемся обновить ПЛАВНО без пересоздания
                const success = this.updateLoadingMessageProgress(messageElement, loadingInfo.progress, loadingInfo.text);
                
                // Если не удалось обновить (например, структура не соответствует), создаем новое содержимое
                if (!success) {
                    console.log('[UPDATE] Плавное обновление не удалось, пересоздаем содержимое');
                    const contentContainer = messageElement.querySelector('.message-content');
                    if (contentContainer) {
                        contentContainer.innerHTML = this.createLoadingMessageHTML(loadingInfo.progress, loadingInfo.text);
                    }
                } else {
                    console.log('[UPDATE] Плавное обновление успешно!');
                }
            } else {
                // Это обычное сообщение - обновляем полностью
                const processedContent = this.processAllAITags(messageData.text);
                
                // Находим контейнер содержимого сообщения
                const contentContainer = messageElement.querySelector('.message-content');
                if (contentContainer) {
                    contentContainer.innerHTML = processedContent;
                }
            }
            
            // Обновляем или добавляем кнопку перегенерации
            // Используем уже полученную информацию о LOADING статусе
            const isLoading = loadingInfo.isLoading;
            const isError = messageData.sender === 'error';
            
            console.log('[REGEN] Проверка сообщения - isLoading:', isLoading, 'isError:', isError);
            
            let regenerateBtn = messageElement.querySelector('.regenerate-btn');
            
            if (isError || (!isLoading && messageData.sender === 'ai')) {
                // Показываем кнопку для error сообщений и обычных AI сообщений (не LOADING)
                if (!regenerateBtn) {
                    regenerateBtn = document.createElement('button');
                    regenerateBtn.className = 'regenerate-btn';
                    regenerateBtn.textContent = '↻ Перегенерировать';
                    messageElement.appendChild(regenerateBtn);
                }
                regenerateBtn.dataset.messageId = messageData.id;
                
                // Назначаем обработчик события (удаляем старый, если есть)
                const newHandler = (e) => {
                    e.stopPropagation();
                    this.regenerateMessage(messageData.id);
                };
                
                // Удаляем все предыдущие обработчики
                const clone = regenerateBtn.cloneNode(true);
                regenerateBtn.parentNode.replaceChild(clone, regenerateBtn);
                clone.addEventListener('click', newHandler);
            } else {
                // Удаляем кнопку для LOADING сообщений
                if (regenerateBtn) {
                    console.log('[REGEN] Удаляем кнопку перегенерации для LOADING сообщения');
                    regenerateBtn.remove();
                }
            }
        } else {
            // Для сообщений пользователя просто обновляем текст
            const textElement = messageElement.querySelector('.text');
            if (textElement) {
                textElement.textContent = messageData.text;
            }
        }
        
        // Инициализируем обработчики для кнопок копирования кода (если есть)
        this.initCodeCopyButtons();
    }

    // Отображение чата без анимации (для обновлений)
    renderChatWithoutAnimation() {
        if (!this.currentChatData) return;
        
        const titleElement = document.getElementById('current-chat-title');
        if (titleElement) {
            titleElement.textContent = this.currentChatData.title || 'Без названия';
        }
        
        const messagesElement = document.getElementById('chat-messages');
        if (messagesElement) {
            // Проверяем, есть ли уже сообщения в UI
            const existingMessageElements = messagesElement.querySelectorAll('.message');
            const existingMessageIds = Array.from(existingMessageElements).map(el => parseInt(el.dataset.messageId));
            
            // Проверяем сообщения в данных чата
            if (this.currentChatData.messages && this.currentChatData.messages.length > 0) {
                this.currentChatData.messages.forEach((message, index) => {
                    // Проверяем, есть ли уже такое сообщение в UI по ID
                    let existingElementIndex = existingMessageIds.indexOf(message.id);
                    
                    // Если не найдено по ID, проверяем LOADING сообщения по содержимому
                    if (existingElementIndex === -1) {
                        const loadingInfo = this.extractLoadingProgress(message.text);
                        if (loadingInfo.isLoading) {
                            // Ищем соответствующий элемент в DOM по содержимому
                            for (let i = 0; i < existingMessageElements.length; i++) {
                                const element = existingMessageElements[i];
                                const elementMessageId = parseInt(element.dataset.messageId);
                                if (elementMessageId && this.currentChatData.messages) {
                                    const existingMessage = this.currentChatData.messages.find(msg => msg.id === elementMessageId);
                                    if (existingMessage && this.isSameLoadingMessage(existingMessage, message)) {
                                        existingElementIndex = i;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    if (existingElementIndex !== -1) {
                        // Сообщение уже существует - ОБНОВЛЯЕМ его содержимое БЕЗ АНИМАЦИИ
                        const existingElement = existingMessageElements[existingElementIndex];
                        this.updateMessageContent(existingElement, message);
                    } else {
                        // Новое сообщение - ДОБАВЛЯЕМ его БЕЗ АНИМАЦИИ
                        this.addMessageToChatWithoutAnimation(message);
                    }
                });
                
                // Удаляем сообщения, которые есть в UI, но отсутствуют в новых данных
                // (на случай, если логика чата предусматривает удаление сообщений)
                const currentMessageIds = this.currentChatData.messages.map(msg => msg.id);
                existingMessageElements.forEach(element => {
                    const elementId = parseInt(element.dataset.messageId);
                    if (elementId && !currentMessageIds.includes(elementId)) {
                        element.remove();
                    }
                });
            } else {
                // Если нет сообщений, показываем приветствие
                if (existingMessageElements.length === 0) {
                    messagesElement.innerHTML = '<div class="welcome-message"><p>Начните диалог! Введите ваше первое сообщение.</p></div>';
                }
            }
            
            // Прокручиваем вниз без анимации
            messagesElement.scrollTop = messagesElement.scrollHeight;
        }
        
        // Обновляем состояние кнопки отправки
        const inputElement = document.getElementById('message-input');
        
        if (inputElement) {
            inputElement.disabled = false;
        }
        
        // Обновляем состояние кнопки отправки на основе последнего сообщения
        this.updateSendButtonState();
    }

    // Обновление состояния ожидания
    updateWaitingState() {
        // Проверяем, есть ли сообщения и является ли последнее сообщение от пользователя
        if (this.currentChatData && this.currentChatData.messages && this.currentChatData.messages.length > 0) {
            const lastMessage = this.currentChatData.messages[this.currentChatData.messages.length - 1];
            if (lastMessage.sender === 'user') {
                this.isWaitingForAI = true;
            } else if (lastMessage.sender === 'ai' || lastMessage.sender === 'error') {
                this.isWaitingForAI = false;
            }
        } else {
            this.isWaitingForAI = false;
        }
        
        // Обновляем состояние кнопки отправки
        const sendButton = document.getElementById('send-message-btn');
        if (sendButton) {
            sendButton.disabled = this.isWaitingForAI;
        }
    }

    addMessageToChatWithoutAnimation(message) {
        const messagesElement = document.getElementById('chat-messages');
        if (!messagesElement) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === 'user' ? 'user' : 'ai'}`;
        
        if (message.id !== undefined) {
            messageElement.dataset.messageId = message.id;
        }
        
        const senderName = message.sender === 'user' ? 'Вы' : 'ИИ';
        
        // Для сообщений ИИ добавляем кнопку перегенерации и обрабатываем теги
        if (message.sender === 'ai') {
            // Сначала обрабатываем теги
            const processedContent = this.processAllAITags(message.text);
            
            // Проверяем, является ли сообщение LOADING или error
            const loadingInfo = this.extractLoadingProgress(message.text);
            const isLoading = loadingInfo.isLoading;
            const isError = message.sender === 'error';
            
            console.log('[REGEN] Добавление сообщения - isLoading:', isLoading, 'isError:', isError);
            
            let regenerateButtonHtml = '';
            if (isError || (!isLoading && message.sender === 'ai')) {
                // Показываем кнопку для error сообщений и обычных AI сообщений (не LOADING)
                regenerateButtonHtml = `<button class="regenerate-btn" data-message-id="${message.id}">↻ Перегенерировать</button>`;
            }
            
            messageElement.innerHTML = `
                <div class="sender">${senderName}</div>
                <div class="message-content">
                    ${processedContent}
                </div>
                ${regenerateButtonHtml}
            `;
            
            // Добавляем обработчик для кнопки перегенерации (если есть)
            const regenerateBtn = messageElement.querySelector('.regenerate-btn');
            if (regenerateBtn) {
                regenerateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.regenerateMessage(message.id); 
                });
            }
        } else {
            messageElement.innerHTML = `
                <div class="sender">${senderName}</div>
                <div class="message-content">
                    <div class="text">${this.escapeHtml(message.text)}</div>
                </div>
            `;
        }
        
        messagesElement.appendChild(messageElement);
        // НЕ прокручиваем здесь, это делается в renderChatWithoutAnimation
        
        // Инициализируем обработчики для кнопок копирования кода
        this.initCodeCopyButtons();
        
        // Инициализируем обработчики для сворачивания мыслей (если есть)
        this.initThoughtsToggles();
    }

    // Очистка чата
    clearChat() {
        this.currentChatId = null;
        this.currentChatData = null;
        this.lastMessageCount = 0;
        this.isWaitingForAI = false;
        this.stopPolling();
        
        const titleElement = document.getElementById('current-chat-title');
        if (titleElement) {
            titleElement.textContent = 'Выберите или создайте чат';
        }

        const messagesElement = document.getElementById('chat-messages');
        if (messagesElement) {
            messagesElement.innerHTML = '<div class="welcome-message"><p>Добро пожаловать в чат с ИИ!</p><p>Выберите существующий чат или создайте новый.</p></div>';
        }

        const inputElement = document.getElementById('message-input');
        const sendButton = document.getElementById('send-message-btn');
        
        if (inputElement) {
            inputElement.disabled = true;
            inputElement.placeholder = 'Выберите чат для начала общения';
            inputElement.value = '';
        }
        
        if (sendButton) {
            sendButton.disabled = true;
        }
        
        this.loadChatsList();
    }

    // Добавление сообщения в чат
    addMessageToChat(message) {
        const messagesElement = document.getElementById('chat-messages');
        if (!messagesElement) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender === 'user' ? 'user' : 'ai'}`;
        
        // Убедитесь, что у сообщения есть ID
        if (message.id !== undefined) {
            messageElement.dataset.messageId = message.id;
        }
        
        // Форматируем время из timestamp
        let timestampHtml = '';
        if (message.timestamp) {
            try {
                const date = new Date(message.timestamp);
                // Форматируем время как HH:MM
                const formattedTime = date.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                    // second: '2-digit' // Можно добавить секунды, если нужно
                });
                timestampHtml = `<div class="message-timestamp">${formattedTime}</div>`;
            } catch (e) {
                console.log('Ошибка форматирования времени сообщения:', e);
                // В случае ошибки показываем сырую строку времени
                timestampHtml = `<div class="message-timestamp">${message.timestamp}</div>`;
            }
        }

        // Определяем отправителя
        let senderName = '';
        if (message.sender === 'user') {
            // Для сообщений пользователя не показываем заголовок "Вы"
            senderName = '';
        } else {
            // Для сообщений ИИ показываем название модели
            if (this.currentChatData && this.currentChatData.model) {
                senderName = this.getModelDisplayName(this.currentChatData.model);
            } else {
                senderName = 'ИИ';
            }
        }
        
        // Для сообщений ИИ добавляем кнопку перегенерации и обрабатываем теги
        if (message.sender === 'ai') {
            // Сначала обрабатываем все теги (THOUGHTS, RESPONSE, CODE)
            const processedContent = this.processAllAITags(message.text);
            
            // Проверяем, является ли сообщение LOADING или error
            const loadingInfo = this.extractLoadingProgress(message.text);
            const isLoading = loadingInfo.isLoading;
            const isError = message.sender === 'error';
            
            console.log('[REGEN] Рендеринг сообщения - isLoading:', isLoading, 'isError:', isError);
            
            // Формируем HTML с заголовком модели
            let headerHtml = '';
            if (senderName) {
                headerHtml = `<div class="sender">${senderName}</div>`;
            }
            
            let regenerateButtonHtml = '';
            if (isError || (!isLoading && message.sender === 'ai')) {
                // Показываем кнопку для error сообщений и обычных AI сообщений (не LOADING)
                regenerateButtonHtml = `<button class="regenerate-btn" data-message-id="${message.id}">↻ Перегенерировать</button>`;
            }
            
            messageElement.innerHTML = `
                ${headerHtml}
                <div class="message-content">
                    ${processedContent}
                </div>
                ${regenerateButtonHtml}
                ${timestampHtml}
            `;
            
            // Добавляем обработчик для кнопки перегенерации (если есть)
            const regenerateBtn = messageElement.querySelector('.regenerate-btn');
            if (regenerateBtn) {
                regenerateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.regenerateMessage(message.id); 
                });
            }
        } else {
            // Для сообщений пользователя не показываем заголовок
            messageElement.innerHTML = `
                <div class="message-content">
                    <div class="text">${this.escapeHtml(message.text)}</div>
                </div>
                ${timestampHtml}
            `;
        }
        
        messagesElement.appendChild(messageElement);
        messagesElement.scrollTop = messagesElement.scrollHeight;
        
        // Инициализируем обработчики для кнопок копирования кода
        this.initCodeCopyButtons();
        
        // Инициализируем обработчики для сворачивания мыслей (если есть)
        this.initThoughtsToggles();
    }

    getModelDisplayName(modelUrl) {
        // Попытка извлечь название из URL
        try {
            // Если это наш внутренний формат (как в примере: qwen/qwen3-coder:free)
            if (modelUrl.includes(':')) {
                return modelUrl.split(':')[0];
            }
            
            // Если это URL HuggingFace, извлекаем название модели
            if (modelUrl.includes('huggingface.co/')) {
                const parts = modelUrl.split('huggingface.co/');
                if (parts.length > 1) {
                    return parts[1].replace('/', ': ');
                }
            }
            
            // Если это просто имя модели
            if (modelUrl) {
                return modelUrl;
            }
        } catch (e) {
            console.log('Ошибка при извлечении имени модели:', e);
        }
        
        // По умолчанию
        return 'ИИ';
    }

    processAllAITags(text) {
        let result = '';
        
        // Проверка на наличие тегов
        if (!text.includes('[')) {
            return `<div class="text">${this.escapeHtml(text)}</div>`;
        }

        // 1. СПЕЦИАЛЬНАЯ ОБРАБОТКА ТЕГА [LOADING] - ПРИОРИТЕТНАЯ
        const loadingRegex = /\[LOADING:(\d+)]([\s\S]*?)\[\/LOADING\]/;
        const loadingMatch = loadingRegex.exec(text);
        if (loadingMatch) {
            const progressPercent = parseInt(loadingMatch[1]) || 0;
            const loadingText = loadingMatch[2].trim();
            
            // Создаем специальный контейнер для загрузки
            return this.createLoadingMessageHTML(progressPercent, loadingText);
        }

        // 2. Обработка [THOUGHTS] с поддержкой сворачивания (СВЕРНУТ по умолчанию)
        let thoughtsHtml = '';
        const thoughtsRegex = /\[THOUGHTS\]([\s\S]*?)\[\/THOUGHTS\]/;
        const thoughtsMatch = thoughtsRegex.exec(text);
        if (thoughtsMatch) {
            const thoughtsContent = thoughtsMatch[1].trim();
            // Создаем СВЕРНУТЫЙ блок мыслей
            thoughtsHtml = `
                <div class="ai-thoughts-container">
                    <div class="ai-thoughts-header">
                        <span class="ai-thoughts-label-main">Мысли ИИ</span>
                        <button class="ai-thoughts-toggle" aria-label="Развернуть мысли">+</button>
                    </div>
                    <div class="ai-thoughts-content collapsed">${this.escapeHtml(thoughtsContent)}
                    </div>
                </div>
            `;
            // Удаляем обработанный тег из текста
            text = text.replace(thoughtsMatch[0], '');
        }

        // 3. Извлечение и обработка [CODE:language]...[/CODE] блоков
        const codeBlocks = [];
        const codeRegex = /\[CODE:\s*([^\]]+?)\]([\s\S]*?)\[\/CODE\]/g;
        let tempText = text;

        let match;
        while ((match = codeRegex.exec(text)) !== null) {
            const language = match[1].trim();
            let codeContent = match[2];
            codeContent = codeContent.replace(/^\s*\n/, '').replace(/\n\s*$/, '\n');
            
            codeBlocks.push({
                language: language,
                code: codeContent
            });
            
            tempText = tempText.replace(match[0], `{{CODE_BLOCK_${codeBlocks.length - 1}}}`);
        }
        text = tempText;

        // 4. Извлечение и обработка [RESPONSE] с обработкой **
        let responseContent = '';
        const responseRegex = /\[RESPONSE\]([\s\S]*?)\[\/RESPONSE\]/;
        const responseMatch = responseRegex.exec(text);
        if (responseMatch) {
            responseContent = responseMatch[1].trim();
            text = text.replace(responseMatch[0], '');
            
            // Обрабатываем ** в содержимом [RESPONSE]
            responseContent = this.processBoldText(responseContent);
        }

        // 5. Определяем основной текст ответа (удаляем плейсхолдеры кода)
        let mainResponseContent = responseContent || text.trim();
        mainResponseContent = mainResponseContent.replace(/\{\{CODE_BLOCK_\d+\}\}/g, '').trim();

        // 6. Собираем финальный результат
        result += thoughtsHtml;
        
        if (mainResponseContent) {
            result += `<div class="ai-response">${this.escapeHtml(mainResponseContent)}</div>`;
        }
        
        // Добавляем ВСЕ блоки кода (они уже извлечены из текста)
        if (codeBlocks.length > 0) {
            codeBlocks.forEach((codeBlock) => {
                result += this.createCodeBlockHTML(codeBlock.language, codeBlock.code);
            });
        }

        if (!result.trim()) {
            result = `<div class="text">${this.escapeHtml(text)}</div>`;
        }
        
        return result;
    }

    processBoldText(text) {
        // Регулярное выражение для поиска текста между **
        // Используем ленивый квантификатор *? чтобы найти ближайшую пару **
        return text.replace(/\*\*(.*?)\*\*/g, '<strong class=ai-bold-text>$1</strong>');
    }

    initThoughtsToggles() {
        // Находим все заголовки блоков мыслей, которые еще не инициализированы
        const thoughtHeaders = document.querySelectorAll('.ai-thoughts-header:not([data-initialized])');
        
        thoughtHeaders.forEach(header => {
            // Помечаем как инициализированный чтобы избежать повторной инициализации
            header.setAttribute('data-initialized', 'true');
            
            const toggleBtn = header.querySelector('.ai-thoughts-toggle');
            const content = header.nextElementSibling; // .ai-thoughts-content
            
            if (toggleBtn && content) {
                // Добавляем обработчик клика на ВСЕМ заголовке
                header.addEventListener('click', (e) => {
                    // Предотвращаем всплытие, если кликнули не по кнопке
                    if (e.target !== toggleBtn) {
                        e.stopPropagation();
                    }
                    
                    // Переключаем состояние содержимого
                    content.classList.toggle('collapsed');
                    
                    // Меняем текст кнопки в зависимости от состояния
                    if (content.classList.contains('collapsed')) {
                        toggleBtn.textContent = '+'; // Свернуто
                        toggleBtn.setAttribute('aria-label', 'Развернуть мысли');
                    } else {
                        toggleBtn.textContent = '−'; // Развернуто (минус ASCII)
                        toggleBtn.setAttribute('aria-label', 'Свернуть мысли');
                    }
                });
                
                // Добавляем обработчик клика на кнопке переключения
                toggleBtn.addEventListener('click', (e) => {
                    // Останавливаем всплытие, чтобы не сработал общий обработчик заголовка
                    e.stopPropagation();
                    
                    // Переключаем состояние содержимого
                    content.classList.toggle('collapsed');
                    
                    // Меняем текст кнопки в зависимости от состояния
                    if (content.classList.contains('collapsed')) {
                        toggleBtn.textContent = '+'; // Свернуто
                        toggleBtn.setAttribute('aria-label', 'Развернуть мысли');
                    } else {
                        toggleBtn.textContent = '−'; // Развернуто
                        toggleBtn.setAttribute('aria-label', 'Свернуть мысли');
                    }
                });
            }
        });
    }

    // Проверка, содержит ли сообщение тег LOADING и извлечение прогресса
    extractLoadingProgress(text) {
        const loadingRegex = /\[LOADING:(\d+)]([\s\S]*?)\[\/LOADING\]/;
        const loadingMatch = loadingRegex.exec(text);
        if (loadingMatch) {
            const progressPercent = parseInt(loadingMatch[1]) || 0;
            const loadingText = loadingMatch[2].trim();
            return { isLoading: true, progress: progressPercent, text: loadingText };
        }
        return { isLoading: false };
    }

    // Проверка, можно ли отправлять сообщения
    // Возвращает true, если последнее сообщение от AI и НЕ содержит LOADING
    canSendMessage() {
        if (!this.currentChatData || !this.currentChatData.messages || this.currentChatData.messages.length === 0) {
            return true; // Если нет сообщений, можно отправлять
        }

        const lastMessage = this.currentChatData.messages[this.currentChatData.messages.length - 1];
        
        // Если последнее сообщение от пользователя, нельзя отправлять (ждем ответа AI)
        if (lastMessage.sender === 'user') {
            return false;
        }
        
        // Если последнее сообщение от AI
        if (lastMessage.sender === 'ai') {
            const loadingInfo = this.extractLoadingProgress(lastMessage.text);
            // Можно отправлять только если НЕ содержит LOADING
            return !loadingInfo.isLoading;
        }
        
        // Для error сообщений можно отправлять
        if (lastMessage.sender === 'error') {
            return true;
        }
        
        return true;
    }

    // Обновление состояния кнопки отправки
    updateSendButtonState() {
        const sendButton = document.getElementById('send-message-btn');
        const inputElement = document.getElementById('message-input');
        
        if (sendButton) {
            const canSend = this.canSendMessage();
            sendButton.disabled = !canSend;
            console.log('[SEND_BTN] Обновление состояния кнопки. Можно отправлять:', canSend);
        }
        
        if (inputElement) {
            const canSend = this.canSendMessage();
            inputElement.disabled = !canSend;
        }
    }

    // Проверка, являются ли два сообщения одним и тем же LOADING сообщением
    // Сравнивает содержимое LOADING сообщений, игнорируя ID
    isSameLoadingMessage(msg1, msg2) {
        // Оба сообщения должны быть от ИИ
        if (msg1.sender !== 'ai' || msg2.sender !== 'ai') {
            return false;
        }
        
        // Проверяем, являются ли оба сообщения LOADING сообщениями
        const loadingInfo1 = this.extractLoadingProgress(msg1.text);
        const loadingInfo2 = this.extractLoadingProgress(msg2.text);
        
        if (!loadingInfo1.isLoading || !loadingInfo2.isLoading) {
            return false;
        }
        
        // Сравниваем текст содержимого LOADING сообщений
        // Если текст одинаковый, считаем это одним и тем же сообщением
        return loadingInfo1.text === loadingInfo2.text;
    }

    // Поиск существующего LOADING сообщения в массиве
    // Логика: Последнее AI сообщение, которое является LOADING сообщением
    findMatchingLoadingMessage(messages, targetMessage) {
        if (!targetMessage || targetMessage.sender !== 'ai') {
            console.log('[FIND] targetMessage не является AI сообщением');
            return -1;
        }
        
        const targetLoadingInfo = this.extractLoadingProgress(targetMessage.text);
        if (!targetLoadingInfo.isLoading) {
            console.log('[FIND] targetMessage не является LOADING сообщением');
            return -1;
        }
        
        console.log('[FIND] Ищем последнее AI LOADING сообщение в', messages.length, 'сообщениях');
        
        // Ищем ПОСЛЕДНЕЕ сообщение от AI, которое является LOADING сообщением
        for (let i = messages.length - 1; i >= 0; i--) {
            const existingMessage = messages[i];
            if (existingMessage.sender === 'ai') {
                const existingLoadingInfo = this.extractLoadingProgress(existingMessage.text);
                if (existingLoadingInfo.isLoading) {
                    console.log('[FIND] Найдено LOADING сообщение на позиции', i);
                    return i;
                }
            }
        }
        
        console.log('[FIND] LOADING сообщение не найдено');
        return -1;
    }

    // Обновление прогресса LOADING сообщения без пересоздания элемента
    updateLoadingMessageProgress(messageElement, progressPercent, loadingText) {
        console.log('[LOADING] Попытка плавного обновления:', progressPercent + '%', loadingText);
        
        // Находим контейнер содержимого сообщения
        const contentContainer = messageElement.querySelector('.message-content');
        if (!contentContainer) {
            console.log('[LOADING] contentContainer не найден');
            return false;
        }
        
        // Проверяем, является ли текущее содержимое LOADING сообщением
        const loadingContainer = contentContainer.querySelector('.ai-loading-container');
        if (!loadingContainer) {
            console.log('[LOADING] loadingContainer не найден');
            return false;
        }
        
        // Находим прогрессбар и текстовый элемент
        const progressBar = loadingContainer.querySelector('.ai-loading-progress-bar');
        const textElement = loadingContainer.querySelector('.ai-loading-text');
        
        if (progressBar && textElement) {
            console.log('[LOADING] Элементы найдены! Плавно обновляем до', progressPercent + '%');
            
            // ПЛАВНО обновляем ширину прогрессбара (CSS transition сделает это плавно)
            // ЯВНО устанавливаем transition для гарантии
            progressBar.style.transition = 'width 0.5s ease';
            progressBar.style.width = progressPercent + '%';
            
            // Обновляем текст если он изменился
            const escapedText = this.escapeHtml(loadingText);
            if (textElement.innerHTML !== escapedText) {
                textElement.innerHTML = escapedText;
            }
            
            console.log('[LOADING] Успешно обновлено!');
            return true;
        }
        
        console.log('[LOADING] Элементы не найдены');
        return false;
    }

    // Создание HTML для LOADING сообщения
    createLoadingMessageHTML(progressPercent, loadingText) {
        return `
            <div class="ai-loading-container">
                <div class="ai-loading-progress-container">
                    <div class="ai-loading-progress-bar" style="width: ${progressPercent}%;">
                        <!-- Прогрессбар заполняется слева направо -->
                    </div>
                    <div class="ai-loading-text">${this.escapeHtml(loadingText)}</div>
                </div>
            </div>
        `;
    }

    // Функция копирования текста в буфер обмена
    initCodeCopyButtons() {
        // Находим все кнопки копирования в чате, которые еще не инициализированы
        const copyButtons = document.querySelectorAll('.ai-code-copy-btn:not([data-initialized])');
        
        copyButtons.forEach(button => {
            // Помечаем кнопку как инициализированную чтобы избежать дублирования
            button.setAttribute('data-initialized', 'true');
            
            button.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                const codeToCopy = button.getAttribute('data-code');
                const originalText = button.textContent;
                
                try {
                    // Пытаемся использовать Clipboard API
                    await navigator.clipboard.writeText(codeToCopy);
                    
                    // Показываем уведомление об успешном копировании
                    button.textContent = 'Скопировано!';
                    button.classList.add('copied');
                    
                    // Возвращаем оригинальный текст через 2 секунды
                    setTimeout(() => {
                        button.textContent = originalText;
                        button.classList.remove('copied');
                    }, 2000);
                    
                } catch (err) {
                    // Если Clipboard API не работает, используем fallback
                    console.log('Clipboard API не доступен, используем fallback');
                    
                    try {
                        // Создаем временный textarea элемент
                        const textArea = document.createElement('textarea');
                        textArea.value = codeToCopy;
                        textArea.style.position = 'fixed';
                        textArea.style.left = '-999999px';
                        textArea.style.top = '-999999px';
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        
                        // Выполняем копирование
                        const successful = document.execCommand('copy');
                        document.body.removeChild(textArea);
                        
                        if (successful) {
                            button.textContent = 'Скопировано!';
                            button.classList.add('copied');
                            
                            setTimeout(() => {
                                button.textContent = originalText;
                                button.classList.remove('copied');
                            }, 2000);
                        } else {
                            throw new Error('Не удалось скопировать');
                        }
                    } catch (fallbackErr) {
                        console.error('Ошибка копирования:', fallbackErr);
                        button.textContent = 'Ошибка!';
                        
                        setTimeout(() => {
                            button.textContent = originalText;
                            button.classList.remove('copied');
                        }, 2000);
                    }
                }
            });
        });
    }

    async sendMessage() {
        if (!this.currentChatId || !this.currentChatData) return;

        // Проверяем, можно ли отправлять сообщения
        if (!this.canSendMessage()) {
            console.log('[SEND] Отправка заблокирована: последнее сообщение от пользователя или содержит LOADING');
            return;
        }

        const inputElement = document.getElementById('message-input');
        if (!inputElement) return;

        const messageText = inputElement.value.trim();
        if (!messageText) return;

        // Создаем объект сообщения пользователя
        const userMessage = {
            id: Date.now(), // Простой ID на основе времени
            sender: 'user',
            text: messageText,
            timestamp: new Date().toISOString()
        };
        
        // Добавляем прикрепленные файлы, если есть
        if (this.attachedFiles.length > 0) {
            userMessage.filename = this.attachedFiles.map(f => f.filename);
            userMessage.file = this.attachedFiles.map(f => f.content);
        }

        // Добавляем сообщение в UI
        this.addMessageToChat(userMessage);
        
        // Очищаем поле ввода и сбрасываем размер
        inputElement.value = '';
        this.autoResizeTextarea.call(inputElement);
        
        // Очищаем прикрепленные файлы после отправки
        this.attachedFiles = [];
        this.updateFileIndicator();
        
        // Блокируем кнопку отправки и устанавливаем флаг ожидания
        this.isWaitingForAI = true;
        this.updateSendButtonState();

        // Добавляем сообщение в данные чата И СРАЗУ СОХРАНЯЕМ
        if (!this.currentChatData.messages) {
            this.currentChatData.messages = [];
        }
        this.currentChatData.messages.push(userMessage);
        
        // СОХРАНЯЕМ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ НЕМЕДЛЕННО
        await this.saveChat();

        try {
            // Отправляем сообщение ИИ через API
            await this.sendToAI(messageText);
            
            // После отправки сообщения ИИ, запускаем более частую проверку обновлений
            // чтобы быстрее поймать ответ
            this.startIntensivePolling();
            
        } catch (error) {
            console.error('Ошибка отправки сообщения ИИ:', error);
            this.isWaitingForAI = false;
            
            // Обновляем состояние кнопки отправки
            this.updateSendButtonState();
            
            // Добавляем сообщение об ошибке в чат
            const errorMessage = {
                id: Date.now() + 1,
                sender: 'ai',
                text: 'Извините, произошла ошибка при отправке сообщения. Попробуйте еще раз.',
                timestamp: new Date().toISOString()
            };
            
            this.addMessageToChat(errorMessage);
            this.currentChatData.messages.push(errorMessage);
            await this.saveChat(); // Сохраняем сообщение об ошибке
        }
    }

    // Интенсивная проверка обновлений (для быстрого получения ответа от ИИ)
    startIntensivePolling() {
        // Останавливаем обычный polling
        this.stopPolling();
        
        let intensiveChecks = 0;
        const maxIntensiveChecks = 20; // 20 проверок по 500мс = 10 секунд максимум
        
        const intensiveInterval = setInterval(async () => {
            intensiveChecks++;
            try {
                await this.checkForUpdates();
                
                // Если получили ответ от ИИ или исчерпали попытки, возвращаемся к обычному polling
                if (intensiveChecks >= maxIntensiveChecks || 
                    (this.currentChatData.messages && 
                     this.currentChatData.messages.length > 0 &&
                     this.currentChatData.messages[this.currentChatData.messages.length - 1].sender === 'ai')) {
                    clearInterval(intensiveInterval);
                    // Возвращаемся к обычному polling
                    this.startPolling();
                }
            } catch (error) {
                console.error('Ошибка интенсивной проверки:', error);
                if (intensiveChecks >= maxIntensiveChecks) {
                    clearInterval(intensiveInterval);
                    this.startPolling();
                }
            }
        }, 500); // Проверяем каждые 500мс для быстрого получения ответа
    }

    // Экранирование HTML специально для кода (сохраняем переносы строк)
    escapeHtmlForCode(text) {
        const map = {
            '&': '&amp;',
            '<': '<',
            '>': '>',
            '"': '&quot;',
            "'": '&#039;'
        };
        
        return text.replace(/[&<>"']/g, function(m) {
            return map[m];
        });
    }

    // Отправка сообщения ИИ через API
    async sendToAI(userMessage) {
        if (!this.currentChatId) {
            throw new Error('Нет активного чата');
        }

        try {
            // 1. Создаем файл request.json
            const response = await fetch('/api/create_request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat: `${this.currentChatId}.json`
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Ошибка создания запроса');
            }

            // 2. Ждем завершения обработки (опрашиваем чат на наличие нового сообщения от ИИ)
            // Пока просто ждем несколько секунд, в реальной реализации можно сделать более умную проверку
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log('Запрос отправлен ИИ через локальный API');
            
        } catch (error) {
            console.error('Ошибка отправки сообщения через локальный API:', error);
            throw error;
        }
    }

    // Сохранение чата
    async saveChat() {
        if (!this.currentChatId || !this.currentChatData) return;

        try {
            const response = await fetch(`/api/chats/${this.currentChatId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.currentChatData)
            });
            
            if (!response.ok) {
                console.error('Ошибка сохранения чата');
            }
        } catch (error) {
            console.error('Ошибка подключения при сохранении:', error);
        }
    }

    // Автоматическое изменение размера textarea
    autoResizeTextarea() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight > 150 ? 150 : this.scrollHeight) + 'px';
    }

    // Экранирование HTML
    escapeHtml(text) {
        // Сначала экранируем HTML-символы
        const map = {
            '&': '&amp;',
            '<': '<',
            '>': '>',
            '"': '&quot;',
            "'": '&#039;'
        };
        
        let escapedText = text.replace(/[&<>"']/g, function(m) {
            return map[m];
        });
        
        // Затем преобразуем переносы строк в <br> теги
        escapedText = escapedText.replace(/\r\n/g, '<br>');
        escapedText = escapedText.replace(/\n/g, '<br>');
        escapedText = escapedText.replace(/\r/g, '<br>');
        
        // Разрешаем наши собственные теги (например, <strong>)
        // Заменяем экранированные теги обратно
        escapedText = escapedText.replace(/<(\/?strong)>/g, '<$1>');
        
        return escapedText;
    }

    async regenerateMessage(messageId) {
        console.log('Попытка перегенерации сообщения с ID:', messageId);
        
        if (!this.currentChatId || !this.currentChatData) {
            console.error('Нет активного чата для перегенерации');
            this.showNotification('Нет активного чата', 'error');
            return;
        }
        
        try {
            // Находим сообщение в истории
            const messageIndex = this.currentChatData.messages.findIndex(msg => msg.id === messageId);
            console.log('Индекс сообщения в истории:', messageIndex);
            
            if (messageIndex === -1) {
                console.error('Сообщение не найдено в истории чата');
                this.showNotification('Сообщение не найдено', 'error');
                return;
            }
            
            const message = this.currentChatData.messages[messageIndex];
            console.log('Найдено сообщение:', message);
            
            if (message.sender !== 'ai') {
                console.error('Попытка перегенерации не ИИ сообщения');
                this.showNotification('Можно перегенерировать только сообщения ИИ', 'error');
                return;
            }
            
            // Проверяем, является ли это сообщение последним сообщением ИИ
            const isLastAIMessage = this.isLastAIMessage(messageId);
            console.log('Это последнее сообщение ИИ:', isLastAIMessage);
            
            if (isLastAIMessage) {
                // Если это последнее сообщение ИИ, удаляем его и перегенерируем
                console.log('Перегенерация последнего сообщения ИИ');
                await this.regenerateLastMessage(messageIndex);
            } else {
                // Если это не последнее сообщение, создаем новый чат
                console.log('Создание нового чата для перегенерации');
                await this.createChatFromMessage(messageIndex);
            }
        } catch (error) {
            console.error('Ошибка перегенерации сообщения:', error);
            this.showNotification('Ошибка перегенерации: ' + error.message, 'error');
        }
    }

    // Проверка, является ли сообщение последним сообщением ИИ
    isLastAIMessage(messageId) {
        if (!this.currentChatData || !this.currentChatData.messages) return false;
        
        // Находим индекс сообщения
        const messageIndex = this.currentChatData.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) {
            console.warn('Сообщение с ID', messageId, 'не найдено в истории чата');
            return false;
        }
        
        // Проверяем, есть ли после этого сообщения другие сообщения ИИ
        for (let i = messageIndex + 1; i < this.currentChatData.messages.length; i++) {
            if (this.currentChatData.messages[i].sender === 'ai') {
                return false;
            }
        }
        
        return true;
    }

    // Перегенерация последнего сообщения ИИ
    async regenerateLastMessage(messageIndex) {
        try {
            // Проверки
            if (!this.currentChatData || !this.currentChatData.messages) {
                throw new Error('Нет данных чата для перегенерации');
            }
            
            if (messageIndex < 0 || messageIndex >= this.currentChatData.messages.length) {
                throw new Error('Неверный индекс сообщения для перегенерации');
            }
            
            const messageToRemove = this.currentChatData.messages[messageIndex];
            
            // Удаляем сообщение ИИ из данных чата
            this.currentChatData.messages.splice(messageIndex, 1);
            
            // Обновляем UI - удаляем элемент сообщения
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
                const messageElements = messagesContainer.querySelectorAll('.message');
                messageElements.forEach(element => {
                    const elementMessageId = parseInt(element.dataset.messageId);
                    if (elementMessageId === messageToRemove.id) {
                        element.remove();
                    }
                });
            }
            
            // Сохраняем обновленный чат
            await this.saveChat();
            
            // Блокируем интерфейс
            this.isWaitingForAI = true;
            this.updateSendButtonState();
            
            // Вызываем sendToAI для генерации нового ответа
            if (messageIndex > 0 && this.currentChatData.messages.length > 0) {
                // Ищем последнее сообщение пользователя перед удаленным сообщением ИИ
                let lastUserMessage = null;
                for (let i = messageIndex - 1; i >= 0; i--) {
                    if (this.currentChatData.messages[i].sender === 'user') {
                        lastUserMessage = this.currentChatData.messages[i];
                        break;
                    }
                }
                
                if (lastUserMessage) {
                    // Отправляем сообщение ИИ
                    await this.sendToAI(lastUserMessage.text);
                    
                    // Запускаем интенсивную проверку обновлений
                    this.startIntensivePolling();
                    
                } else {
                    this.isWaitingForAI = false;
                    this.updateSendButtonState();
                    this.showNotification('Невозможно перегенерировать: не найдено исходное сообщение', 'error');
                }
            } else {
                this.isWaitingForAI = false;
                this.updateSendButtonState();
            }
        } catch (error) {
            console.error('Ошибка в regenerateLastMessage:', error);
            this.isWaitingForAI = false;
            this.updateSendButtonState();
            throw error;
        }
    }

    // Создание нового чата из сообщения (обновленная версия)
    async createChatFromMessage(messageIndex) {
        try {
            if (!this.currentChatData || !this.currentChatData.messages) {
                throw new Error('Нет данных чата для создания нового чата');
            }
            
            if (messageIndex < 0 || messageIndex >= this.currentChatData.messages.length) {
                throw new Error('Неверный индекс сообщения для создания нового чата');
            }
            
            // Получаем историю до указанного сообщения
            const history = this.currentChatData.messages.slice(0, messageIndex);
            
            // Генерируем название для нового чата
            let chatTitle = 'Перегенерация: ';
            if (this.currentChatData.title) {
                chatTitle += this.currentChatData.title;
            } else {
                chatTitle += 'Без названия';
            }
            
            // Ограничиваем длину названия
            if (chatTitle.length > 50) {
                chatTitle = chatTitle.substring(0, 47) + '...';
            }
            
            // Создаем новый чат с историей
            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: chatTitle,
                    model: this.currentChatData.model || '',
                    system_prompt: this.currentChatData.system_prompt || undefined,
                    messages: history
                })
            });
            
            if (response.ok) {
                const newChat = await response.json();
                
                // Загружаем новый чат
                await this.loadChat(newChat.id);
                
                // Блокируем интерфейс
                this.isWaitingForAI = true;
                this.updateSendButtonState();
                
                // Получаем последнее сообщение пользователя из истории
                if (history.length > 0) {
                    // Ищем последнее сообщение пользователя
                    let lastUserMessage = null;
                    for (let i = history.length - 1; i >= 0; i--) {
                        if (history[i].sender === 'user') {
                            lastUserMessage = history[i];
                            break;
                        }
                    }
                    
                    if (lastUserMessage) {
                        // Отправляем сообщение ИИ
                        await this.sendToAI(lastUserMessage.text);
                        
                        // Запускаем интенсивную проверку обновлений
                        this.startIntensivePolling();
                        
                    } else {
                        this.isWaitingForAI = false;
                        this.updateSendButtonState();
                    }
                } else {
                    this.isWaitingForAI = false;
                    this.updateSendButtonState();
                }
                
                this.showNotification('Создан новый чат для перегенерации', 'success');
            } else {
                const errorText = await response.text();
                throw new Error(`Ошибка создания чата: ${response.status} ${errorText}`);
            }
        } catch (error) {
            console.error('Ошибка в createChatFromMessage:', error);
            this.isWaitingForAI = false;
            this.updateSendButtonState();
            throw error;
        }
    }
}

// Инициализация
let chatApp = null;

document.addEventListener('DOMContentLoaded', function() {
    chatApp = new SingleChat();
});

window.addEventListener('beforeunload', function() {
    if (chatApp) {
        chatApp.destroy();
    }
});