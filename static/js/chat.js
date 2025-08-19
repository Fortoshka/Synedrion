// static/js/chat.js - дополнения и изменения

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
        
        // Обработчики для модального окна
        this.setupModalHandlers();
        
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

    // Настройка обработчиков модального окна
    setupModalHandlers() {
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

    // Открытие модального окна создания чата
    async openNewChatModal() {
        const modal = document.getElementById('new-chat-modal');
        const modelSelect = document.getElementById('chat-model');
        const titleInput = document.getElementById('chat-title');
        
        // Очищаем поля
        titleInput.value = '';
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
        
        const title = titleInput.value.trim();
        const modelUrl = modelSelect.value;
        
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
                    model: modelUrl // Сохраняем выбранную модель
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
            
            chatElement.innerHTML = `
                <div class="chat-item-title">${chat.title}</div>
                <div class="chat-item-date">${formattedDate}</div>
            `;
            
            chatElement.addEventListener('click', () => {
                this.loadChat(chat.id);
                if (window.innerWidth <= 768) {
                    document.getElementById('chat-sidebar').classList.remove('open');
                }
            });
            
            chatsListElement.appendChild(chatElement);
        });
    }

    // Создание нового чата (старый метод - оставляем для совместимости)
    async createNewChat() {
        try {
            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Новый чат'
                })
            });
            
            if (response.ok) {
                const newChat = await response.json();
                this.loadChat(newChat.id);
                this.loadChatsList();
                
                if (window.innerWidth <= 768) {
                    document.getElementById('chat-sidebar').classList.remove('open');
                }
            } else {
                console.error('Ошибка создания чата');
            }
        } catch (error) {
            console.error('Ошибка подключения:', error);
        }
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
                    for (let i = this.lastMessageCount; i < newMessageCount; i++) {
                        const newMessage = updatedChatData.messages[i];
                        const isMessageAlreadyAdded = this.currentChatData.messages && 
                            this.currentChatData.messages.some(msg => msg.id === newMessage.id);
                        
                        if (!isMessageAlreadyAdded) {
                            this.addMessageToChat(newMessage);
                        }
                    }
                    
                    this.currentChatData = updatedChatData;
                    this.lastMessageCount = newMessageCount;
                    
                    const messagesElement = document.getElementById('chat-messages');
                    if (messagesElement) {
                        messagesElement.scrollTop = messagesElement.scrollHeight;
                    }
                    
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
                    this.currentChatData = updatedChatData;
                    
                    if (this.currentChatData.messages && this.currentChatData.messages.length > 0) {
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
            titleElement.textContent = this.currentChatData.title || 'Без названия';
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
        if (message.id) {
            messageElement.dataset.messageId = message.id;
        }
        
        const senderName = message.sender === 'user' ? 'Вы' : 'ИИ';
        
        messageElement.innerHTML = `
            <div class="sender">${senderName}</div>
            <div class="text">${this.escapeHtml(message.text)}</div>
        `;
        
        messagesElement.appendChild(messageElement);
        messagesElement.scrollTop = messagesElement.scrollHeight;
    }

    // Отправка сообщения
    async sendMessage() {
        if (!this.currentChatId || !this.currentChatData) return;

        const inputElement = document.getElementById('message-input');
        if (!inputElement) return;

        const messageText = inputElement.value.trim();
        if (!messageText) return;

        let canSend = true;
        if (this.currentChatData.messages && this.currentChatData.messages.length > 0) {
            const lastMessage = this.currentChatData.messages[this.currentChatData.messages.length - 1];
            if (lastMessage.sender === 'user') {
                canSend = false;
            }
        }

        if (!canSend) {
            console.log('Нельзя отправить сообщение: ждем ответа от ИИ');
            return;
        }

        const userMessage = {
            id: Date.now(),
            sender: 'user',
            text: messageText,
            timestamp: new Date().toISOString()
        };

        this.addMessageToChat(userMessage);
        
        inputElement.value = '';
        this.autoResizeTextarea.call(inputElement);
        
        this.isWaitingForAI = true;
        const sendButton = document.getElementById('send-message-btn');
        if (sendButton) {
            sendButton.disabled = true;
        }

        if (!this.currentChatData.messages) {
            this.currentChatData.messages = [];
        }
        this.currentChatData.messages.push(userMessage);
        
        await this.saveChat();

        try {
            await this.sendToAI(messageText);
        } catch (error) {
            console.error('Ошибка отправки сообщения ИИ:', error);
            this.isWaitingForAI = false;
            
            const sendButton = document.getElementById('send-message-btn');
            if (sendButton) {
                sendButton.disabled = false;
            }
            
            const errorMessage = {
                id: Date.now() + 1,
                sender: 'ai',
                text: 'Извините, произошла ошибка при отправке сообщения. Попробуйте еще раз.',
                timestamp: new Date().toISOString()
            };
            
            this.addMessageToChat(errorMessage);
            this.currentChatData.messages.push(errorMessage);
            await this.saveChat();
        }
    }

    // Отправка сообщения ИИ через API
    async sendToAI(userMessage) {
        // Замените на ваш реальный API
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('Сообщение отправлено ИИ:', userMessage);
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