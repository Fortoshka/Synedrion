// static/js/chat.js - дополнения

class SingleChat {
    constructor() {
        this.currentChatId = null;
        this.currentChatData = null;
        this.pollingInterval = null;
        this.lastMessageCount = 0;
        this.isWaitingForAI = false;
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
        
        // Закрытие модального окна
        const closeModal = () => {
            modal.style.display = 'none';
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
            if (e.key === 'Escape' && modal.style.display === 'block') {
                closeModal();
            }
        });
    }

    // Настройка обработчиков модального окна настроек чата
    setupSettingsModalHandlers() {
        const modal = document.getElementById('chat-settings-modal');
        const closeBtn = document.querySelector('.close-settings-modal');
        const cancelBtn = document.getElementById('cancel-chat-settings');
        const saveBtn = document.getElementById('save-chat-settings');
        const deleteBtn = document.getElementById('delete-chat-btn'); // Кнопка удаления
        
        // Закрытие модального окна
        const closeModal = () => {
            modal.style.display = 'none';
        };
        
        // Обработчики для закрытия
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        // Сохранение настроек чата
        saveBtn.addEventListener('click', () => {
            this.saveChatSettings();
        });
        
        // Удаление чата (добавляем обработчик клика)
        deleteBtn.addEventListener('click', () => {
            this.deleteChat(); // Вызываем функцию удаления
        });
        
        // Закрытие при клике вне модального окна
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                closeModal();
            }
        });
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
        modal.style.display = 'block';
        
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
            if (e.key === 'Escape' && modal.style.display === 'block') {
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
        
        // Показываем модальное окно
        modal.style.display = 'block';
        
        // Фокус на поле названия
        setTimeout(() => {
            titleInput.focus();
        }, 100);
    }

    // Создание чата из модального окна
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
            alert('Пожалуйста, введите название чата');
            return;
        }
        
        if (!modelUrl) {
            alert('Пожалуйста, выберите модель ИИ');
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
                alert('Ошибка создания чата');
            }
        } catch (error) {
            console.error('Ошибка подключения:', error);
            alert('Ошибка подключения к серверу');
        }
    }

    // Открытие модального окна настроек чата
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
                
                // Показываем модальное окно
                modal.style.display = 'block';
            } else {
                console.error('Ошибка загрузки данных чата');
                alert('Ошибка загрузки данных чата');
            }
        } catch (error) {
            console.error('Ошибка подключения:', error);
            alert('Ошибка подключения к серверу');
        }
    }

    // Сохранение настроек чата
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
            alert('Пожалуйста, введите название чата');
            return;
        }
        
        if (!modelUrl) {
            alert('Пожалуйста, выберите модель ИИ');
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
                            // Ограничиваем длину названия в заголовке чата
                            let displayTitle = title;
                            if (displayTitle.length > 30) {
                                displayTitle = displayTitle.substring(0, 27) + '...';
                            }
                            titleElement.textContent = displayTitle;
                        }
                    }
                    
                    this.loadChatsList();
                    
                    // Закрываем модальное окно
                    document.getElementById('chat-settings-modal').style.display = 'none';
                } else {
                    console.error('Ошибка сохранения настроек чата');
                    alert('Ошибка сохранения настроек чата');
                }
            } else {
                console.error('Ошибка загрузки данных чата');
                alert('Ошибка загрузки данных чата');
            }
        } catch (error) {
            console.error('Ошибка подключения:', error);
            alert('Ошибка подключения к серверу');
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

    // Загрузка конкретного чата
    async loadChat(chatId) {
        try {
            this.stopPolling();
            
            const response = await fetch(`/api/chats/${chatId}`);
            if (response.ok) {
                this.currentChatData = await response.json();
                this.currentChatId = chatId;
                this.lastMessageCount = this.currentChatData.messages ? this.currentChatData.messages.length : 0;
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
        }, 2000);
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
                
                if (newMessageCount > this.lastMessageCount) {
                    // Добавляем новые сообщения в чат
                    for (let i = this.lastMessageCount; i < newMessageCount; i++) {
                        const newMessage = updatedChatData.messages[i];
                        const isMessageAlreadyAdded = this.currentChatData.messages && 
                            this.currentChatData.messages.some(msg => msg.id === newMessage.id);
                        
                        if (!isMessageAlreadyAdded) {
                            this.addMessageToChat(newMessage);
                        }
                    }
                    
                    // Обновляем данные чата и счетчик сообщений
                    this.currentChatData = updatedChatData;
                    this.lastMessageCount = newMessageCount;
                    
                    // Прокручиваем вниз
                    const messagesElement = document.getElementById('chat-messages');
                    if (messagesElement) {
                        messagesElement.scrollTop = messagesElement.scrollHeight;
                    }
                    
                    // Проверяем, является ли последнее сообщение от ИИ
                    if (this.currentChatData.messages.length > 0) {
                        const lastMessage = this.currentChatData.messages[this.currentChatData.messages.length - 1];
                        if (lastMessage.sender === 'ai') {
                            this.isWaitingForAI = false;
                            const sendButton = document.getElementById('send-message-btn');
                            if (sendButton) {
                                sendButton.disabled = false;
                            }
                        }
                    }
                } else {
                    // Обновляем данные чата, но не добавляем сообщения
                    this.currentChatData = updatedChatData;
                    
                    // Проверяем состояние ожидания на основе последнего сообщения
                    if (this.currentChatData.messages && this.currentChatData.messages.length > 0) {
                        const lastMessage = this.currentChatData.messages[this.currentChatData.messages.length - 1];
                        // Если последнее сообщение от пользователя, значит ждем ИИ
                        if (lastMessage.sender === 'user') {
                            this.isWaitingForAI = true;
                            const sendButton = document.getElementById('send-message-btn');
                            if (sendButton) {
                                sendButton.disabled = true;
                            }
                        } else if (lastMessage.sender === 'ai') {
                            // Если последнее сообщение от ИИ, можно отправлять
                            this.isWaitingForAI = false;
                            const sendButton = document.getElementById('send-message-btn');
                            if (sendButton) {
                                sendButton.disabled = false;
                            }
                        }
                    }
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
        
        if (sendButton) {
            sendButton.disabled = this.isWaitingForAI;
        }
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
        } else {
            // Обработка сообщения без ID - это может быть проблемой
            console.warn("Сообщение без ID добавлено в чат:", message);
            // Можно добавить временный ID или обработать иначе
            // message.id = 'temp_' + Date.now() + Math.random(); // Пример
        }

        const senderName = message.sender === 'user' ? 'Вы' : 'ИИ';

        // Для сообщений ИИ добавляем кнопку перегенерации
        if (message.sender === 'ai') {
            // Проверка наличия ID перед созданием кнопки
            if (message.id === undefined) {
                // Не добавляем кнопку, если нет ID
                console.warn("Кнопка перегенерации не добавлена для сообщения без ID:", message);
                messageElement.innerHTML = `
                    <div class="sender">${senderName}</div>
                    <div class="text">${this.escapeHtml(message.text)}</div>
                    <button class="regenerate-btn" disabled title="Невозможно перегенерировать">↻ Перегенерировать (ID отсутствует)</button>
                `;
            } else {
                messageElement.innerHTML = `
                    <div class="sender">${senderName}</div>
                    <div class="text">${this.escapeHtml(message.text)}</div>
                    <button class="regenerate-btn" data-message-id="${message.id}">↻</button>
                `;

                // Добавляем обработчик для кнопки перегенерации
                const regenerateBtn = messageElement.querySelector('.regenerate-btn');
                // Дополнительная проверка на случай проблем с querySelector
                if (regenerateBtn) {
                    regenerateBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Используем message.id из внешней области видимости
                        // message.id гарантированно существует в этой ветке
                        this.regenerateMessage(message.id);
                    });
                } else {
                    console.error("Не удалось найти кнопку .regenerate-btn после создания элемента сообщения ИИ");
                }
            }
        } else {
            // Сообщение пользователя
            messageElement.innerHTML = `
                <div class="sender">${senderName}</div>
                <div class="text">${this.escapeHtml(message.text)}</div>
            `;
        }

        messagesElement.appendChild(messageElement);
        messagesElement.scrollTop = messagesElement.scrollHeight;
    }

    // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
    // НОВАЯ ФУНКЦИЯ: Отправка сообщения пользователя
    async sendMessage() {
        if (!this.currentChatId || !this.currentChatData) return;

        const inputElement = document.getElementById('message-input');
        if (!inputElement) return;

        const messageText = inputElement.value.trim();
        if (!messageText) return;

        // Проверяем, можно ли отправлять сообщение (последнее сообщение от ИИ или чат пустой)
        let canSend = true;
        if (this.currentChatData.messages && this.currentChatData.messages.length > 0) {
            const lastMessage = this.currentChatData.messages[this.currentChatData.messages.length - 1];
            if (lastMessage.sender === 'user') {
                canSend = false; // Ждем ответа ИИ
            }
        }

        if (!canSend) {
            console.log('Нельзя отправить сообщение: ждем ответа от ИИ');
            return;
        }

        // Создаем объект сообщения пользователя
        const userMessage = {
            id: Date.now(), // Простой ID на основе времени
            sender: 'user',
            text: messageText,
            timestamp: new Date().toISOString()
        };

        // Добавляем сообщение в UI
        this.addMessageToChat(userMessage);
        
        // Очищаем поле ввода и сбрасываем размер
        inputElement.value = '';
        this.autoResizeTextarea.call(inputElement);
        
        // Блокируем кнопку отправки и устанавливаем флаг ожидания
        this.isWaitingForAI = true;
        const sendButton = document.getElementById('send-message-btn');
        if (sendButton) {
            sendButton.disabled = true;
        }

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
            
        } catch (error) {
            console.error('Ошибка отправки сообщения ИИ:', error);
            this.isWaitingForAI = false;
            
            // Разблокируем кнопку отправки
            const sendButton = document.getElementById('send-message-btn');
            if (sendButton) {
                sendButton.disabled = false;
            }
            
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
    // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

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
        const map = {
            '&': '&amp;',
            '<': '<',
            '>': '>',
            '"': '&quot;',
            "'": '&#039;'
        };
        
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }
    
    // Очистка при закрытии страницы
    destroy() {
        this.stopPolling();
    };

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
            const sendButton = document.getElementById('send-message-btn');
            if (sendButton) {
                sendButton.disabled = true;
            }
            
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
                    
                    // Ждем немного, чтобы api_sender.py успел поработать
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Принудительно обновляем чат из файла
                    await this.loadChat(this.currentChatId);
                    
                } else {
                    this.isWaitingForAI = false;
                    if (sendButton) {
                        sendButton.disabled = false;
                    }
                    this.showNotification('Невозможно перегенерировать: не найдено исходное сообщение', 'error');
                }
            } else {
                this.isWaitingForAI = false;
                if (sendButton) {
                    sendButton.disabled = false;
                }
            }
        } catch (error) {
            console.error('Ошибка в regenerateLastMessage:', error);
            this.isWaitingForAI = false;
            const sendButton = document.getElementById('send-message-btn');
            if (sendButton) {
                sendButton.disabled = false;
            }
            this.showNotification('Ошибка перегенерации: ' + error.message, 'error');
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
                const sendButton = document.getElementById('send-message-btn');
                if (sendButton) {
                    sendButton.disabled = true;
                }
                
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
                        
                        // Ждем немного, чтобы api_sender.py успел поработать
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        // Принудительно обновляем чат из файла
                        await this.loadChat(newChat.id);
                        
                    } else {
                        this.isWaitingForAI = false;
                        if (sendButton) {
                            sendButton.disabled = false;
                        }
                    }
                } else {
                    this.isWaitingForAI = false;
                    if (sendButton) {
                        sendButton.disabled = false;
                    }
                }
                
                this.showNotification('Создан новый чат для перегенерации', 'success');
            } else {
                const errorText = await response.text();
                throw new Error(`Ошибка создания чата: ${response.status} ${errorText}`);
            }
        } catch (error) {
            console.error('Ошибка в createChatFromMessage:', error);
            this.isWaitingForAI = false;
            const sendButton = document.getElementById('send-message-btn');
            if (sendButton) {
                sendButton.disabled = false;
            }
            this.showNotification('Ошибка создания чата: ' + error.message, 'error');
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