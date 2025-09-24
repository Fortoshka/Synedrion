// Функция для определения времени суток
function getGreeting() {
    const hour = new Date().getHours();
    let greeting;
    
    if (hour >= 5 && hour < 12) {
        greeting = 'Доброе утро!';
    } else if (hour >= 12 && hour < 18) {
        greeting = 'Добрый день!';
    } else if (hour >= 18 && hour < 23) {
        greeting = 'Добрый вечер!';
    } else {
        greeting = 'Доброй ночи!';
    }
    
    return greeting;
}

// Глобальная функция для плавных переходов между страницами
async function navigateTo(url) {
    
    try {
        // Анимация выхода с текущей страницы
        document.body.style.opacity = '0';
        document.body.style.transform = 'translateY(20px)';
        
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Загружаем новую страницу
        const response = await fetch(url);
        const html = await response.text();
        
        // Заменяем контент страницы
        document.open();
        document.write(html);
        document.close();
        
        // Применяем тему из settings.json после загрузки новой страницы
        await applySettingsTheme();
        
        // Анимация появления новой страницы
        setTimeout(() => {
            document.body.style.opacity = '1';
            document.body.style.transform = 'translateY(0)';
        }, 50);
        
    } catch (error) {
        console.error('Ошибка перехода:', error);
        // Восстанавливаем видимость в случае ошибки
        document.body.style.opacity = '1';
        document.body.style.transform = 'translateY(0)';
    }
}

// Функция выхода из приложения
async function exitApp() {
    try {
        // Анимация перед закрытием
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.3s ease';
        
        setTimeout(async () => {
            try {
                const response = await fetch('/exit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                // Если это webview приложение, пытаемся закрыть через API
                if (window.pywebview) {
                    try {
                        await window.pywebview.api.exit_app();
                    } catch (e) {
                        console.log('pywebview API не доступен');
                    }
                } else {
                    // Для браузера показываем сообщение
                    setTimeout(() => {
                        alert('Приложение закрыто. Закройте вкладку браузера.');
                    }, 100);
                }
            } catch (error) {
                console.error('Ошибка при выходе:', error);
                // Все равно пытаемся закрыть если возможно
                if (window.pywebview) {
                    try {
                        if (window.pywebview && window.pywebview.api && window.pywebview.api.exit_app) {
                            window.pywebview.api.exit_app();
                        }
                    } catch (e) {
                        console.log('Не удалось закрыть через pywebview');
                    }
                }
            }
        }, 300);
    } catch (error) {
        console.error('Ошибка при анимации выхода:', error);
    }
}

// Обработчики для кнопок (отдельная функция для переиспользования)
function setupButtonEffects() {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        // Убираем существующие обработчики перед добавлением новых
        button.removeEventListener('mouseenter', buttonMouseEnter);
        button.removeEventListener('mouseleave', buttonMouseLeave);
        button.removeEventListener('mousedown', buttonMouseDown);
        button.removeEventListener('mouseup', buttonMouseUp);
        
        // Добавляем новые обработчики
        button.addEventListener('mouseenter', buttonMouseEnter);
        button.addEventListener('mouseleave', buttonMouseLeave);
        button.addEventListener('mousedown', buttonMouseDown);
        button.addEventListener('mouseup', buttonMouseUp);
    });
}

// Обработчики событий для кнопок
function buttonMouseEnter() {
    this.style.transform = 'translateY(-8px) scale(1.02)';
    this.style.boxShadow = '0 15px 35px rgba(95, 95, 95, 0.4)';
}

function buttonMouseLeave() {
    this.style.transform = 'translateY(0) scale(1)';
    this.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
}

function buttonMouseDown() {
    this.style.transform = 'translateY(-2px) scale(0.98)';
}

function buttonMouseUp() {
    this.style.transform = 'translateY(-8px) scale(1.02)';
}

// Функция применения темы
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

// Применение темы из settings.json
async function applySettingsTheme() {
    try {
        const response = await fetch('/api/settings');
        if (response.ok) {
            const settings = await response.json();
            applyTheme(settings.theme || 'blue');
            return settings.theme || 'blue';
        } else {
            // Если не удалось загрузить настройки, используем тему по умолчанию
            applyTheme('blue');
            return 'blue';
        }
    } catch (error) {
        console.error('Ошибка загрузки темы:', error);
        // Если не удалось загрузить настройки, используем тему по умолчанию
        applyTheme('blue');
        return 'blue';
    }
}

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    // Установка приветствия
    const greetingElement = document.getElementById('greeting');
    if (greetingElement) {
        greetingElement.textContent = getGreeting();
    }
    
    // Настройка эффектов кнопок
    setupButtonEffects();
    
    // Применяем тему из settings.json при загрузке страницы
    applySettingsTheme();
    
    // Добавляем обработчик для кнопки выхода
    const exitBtn = document.getElementById('exit-btn');
    if (exitBtn) {
        exitBtn.removeEventListener('click', exitApp);
        exitBtn.addEventListener('click', exitApp);
    }
    
    // Настройка переходов по ссылкам
    document.querySelectorAll('a[href]:not([target])').forEach(link => {
        // Исключаем ссылки на внешние ресурсы
        const href = link.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('#')) {
            link.removeEventListener('click', linkClickHandler);
            link.addEventListener('click', linkClickHandler);
        }
    });
    
    // Специфическая инициализация для страницы "О приложении"
    if (document.querySelector('.about-content')) {
        // Добавляем плавное появление элементов
        const sections = document.querySelectorAll('.info-section');
        sections.forEach((section, index) => {
            section.style.animationDelay = `${index * 0.1}s`;
        });
        
        // Добавляем эффекты наведения для контактных методов
        const contactMethods = document.querySelectorAll('.contact-method');
        contactMethods.forEach(method => {
            method.removeEventListener('mouseenter', contactMethodEnter);
            method.removeEventListener('mouseleave', contactMethodLeave);
            method.addEventListener('mouseenter', contactMethodEnter);
            method.addEventListener('mouseleave', contactMethodLeave);
        });
    }
    
    // Анимация появления страницы
    document.body.style.opacity = '0';
    document.body.style.transform = 'translateY(20px)';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        document.body.style.opacity = '1';
        document.body.style.transform = 'translateY(0)';
    }, 50);
});

// Обработчик клика по ссылке
function linkClickHandler(e) {
    e.preventDefault();
    navigateTo(this.getAttribute('href'));
}

// Обработчики для контактных методов
function contactMethodEnter() {
    this.style.transform = 'translateX(8px)';
    this.style.background = 'rgba(255, 255, 255, 0.15)';
}

function contactMethodLeave() {
    this.style.transform = 'translateX(0)';
    this.style.background = 'rgba(255, 255, 255, 0.05)';
}

// Добавление эффекта загрузки страницы
window.addEventListener('load', function() {
    // Применяем тему еще раз на всякий случай
    applySettingsTheme();
    
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.8s ease-in-out';
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});

// Применяем тему сразу при загрузке скрипта
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySettingsTheme);
} else {
    applySettingsTheme();
}