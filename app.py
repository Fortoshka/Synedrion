from flask import Flask, render_template, jsonify, request
from datetime import datetime
import time
import threading
import webview
import json
import os
import sys
import uuid
import subprocess
from file_handler import FileHandler

app = Flask(__name__)

SETTINGS_FILE = 'settings.json'
DEVLOG_FILE_PATH = os.path.join(os.path.dirname(__file__), 'devlog.html')

DEFAULT_SETTINGS = {
    "fullscreen": False,
    "theme": "blue",
    "models": [
        {"id": 1, "name": "Qwen: Qwen3 Coder", "url": "qwen/qwen3-coder:free"},
        {"id": 2, "name": "DeepSeek: Deepseek R1 0528 Qwen3 8B", "url": "deepseek/deepseek-r1-0528-qwen3-8b:free"},
    ]
}

CHATS_DIR = 'chats'
if not os.path.exists(CHATS_DIR):
    os.makedirs(CHATS_DIR)

GROUP_CHATS_DIR = 'group_chats'
if not os.path.exists(GROUP_CHATS_DIR):
    os.makedirs(GROUP_CHATS_DIR)

CONFIG_DIR = 'config'
if not os.path.exists(CONFIG_DIR):
    os.makedirs(CONFIG_DIR)

DOWNLOADS_DIR = 'downloads'
if not os.path.exists(DOWNLOADS_DIR):
    os.makedirs(DOWNLOADS_DIR)

def get_app_version():
    """Получение версии приложения из файла VERSION.txt"""
    version_file_path = os.path.join(os.path.dirname(__file__), 'VERSION.txt')
    try:
        if os.path.exists(version_file_path):
            with open(version_file_path, 'r', encoding='utf-8') as f:
                version = f.read().strip()
                return version if version else '1.0.0'
        else:
            return '1.0.0'
    except Exception as e:
        print(f"Ошибка чтения файла версии: {e}")
        return '1.0.0'

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return DEFAULT_SETTINGS
    return DEFAULT_SETTINGS

def save_settings(settings):
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)

@app.route('/')
def index():
    return render_template('index.html')

@app.errorhandler(500)
def internal_server_error(e):
    """Обработчик внутренней ошибки сервера"""
    return render_template('error/500.html'), 500

# Обработчик ошибки 404 (Not Found)
@app.errorhandler(404)
def not_found_error(e):
    """Обработчик ошибки страница не найдена"""
    return render_template('error/404.html'), 404

# Обработчик ошибки 500 для API
@app.errorhandler(Exception)
def handle_exception(e):
    """Глобальный обработчик исключений"""
    # Для запросов API возвращаем JSON
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500
    
    # Для обычных страниц возвращаем HTML страницу ошибки
    return render_template('error/500.html'), 500

@app.route('/single_chat')
def single_chat():
    return render_template('single_chat.html')

@app.route('/council')
def council():
    return render_template('council.html')

@app.route('/settings')
def settings_page():
    return render_template('settings.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Получение текущих настроек"""
    settings = load_settings()
    return jsonify(settings)

@app.route('/api/version')
def get_version():
    """API endpoint для получения версии приложения"""
    version = get_app_version()
    return jsonify({'version': version})

@app.route('/api/settings', methods=['PUT'])
def update_settings():
    """Обновление настроек"""
    try:
        new_settings = request.get_json()
        save_settings(new_settings)
        return jsonify({"success": True, "message": "Настройки сохранены"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Ошибка сохранения: {str(e)}"}), 500

@app.route('/api/models', methods=['DELETE'])
def delete_model():
    """Удаление модели"""
    try:
        data = request.get_json()
        model_id = data.get('id')
        
        settings = load_settings()
        if len(settings['models']) <= 1:
            return jsonify({"success": False, "message": "Нельзя удалить последнюю модель"}), 400
        
        settings['models'] = [m for m in settings['models'] if m['id'] != model_id]
        save_settings(settings)
        
        return jsonify({"success": True, "message": "Модель удалена"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Ошибка удаления: {str(e)}"}), 500

@app.route('/api/models', methods=['POST'])
def add_model():
    """Добавление новой модели"""
    try:
        data = request.get_json()
        name = data.get('name')
        url = data.get('url')
        
        if not name or not url:
            return jsonify({"success": False, "message": "Заполните все поля"}), 400
        
        settings = load_settings()
        
        # Генерация уникального ID
        new_id = max([m['id'] for m in settings['models']] + [0]) + 1
        
        new_model = {
            "id": new_id,
            "name": name,
            "url": url
        }
        
        settings['models'].append(new_model)
        save_settings(settings)
        
        return jsonify({"success": True, "message": "Модель добавлена", "model": new_model})
    except Exception as e:
        return jsonify({"success": False, "message": f"Ошибка добавления: {str(e)}"}), 500
    
@app.route('/exit', methods=['POST'])
def exit_app():
    """Выход из приложения"""
    try:
        # Отправляем успешный ответ сразу
        response = jsonify({"success": True, "message": "Приложение закрывается"})
        
        # Закрываем окно в отдельном потоке, чтобы ответ успел отправиться
        def close_window():
            try:
                webview.windows[0].destroy()
            except:
                pass
        
        # Запускаем закрытие в отдельном потоке
        threading.Thread(target=close_window, daemon=True).start()
        
        return response
    except Exception as e:
        # Все равно возвращаем успех, так как основная цель - закрыть приложение
        return jsonify({"success": True, "message": "Приложение закрывается"})
    
@app.route('/api/chats', methods=['GET'])
def get_chats_list():
    """Получить список всех чатов"""
    try:
        chats = []
        for filename in os.listdir(CHATS_DIR):
            if filename.endswith('.json'):
                file_path = os.path.join(CHATS_DIR, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        chat_data = json.load(f)
                        # Берем первую часть названия файла как ID чата
                        chat_id = filename[:-5]  # Убираем .json
                        # Получаем превью из первого сообщения или заголовка
                        preview = chat_data.get('title', 'Новый чат')
                        if not preview and chat_data.get('messages'):
                            # Пытаемся получить текст первого сообщения пользователя
                            for msg in chat_data['messages']:
                                if msg.get('sender') == 'user':
                                    preview = msg.get('text', '')[:30] + '...' if len(msg.get('text', '')) > 30 else msg.get('text', '')
                                    break
                        
                        chats.append({
                            'id': chat_id,
                            'title': preview or 'Пустой чат',
                            'created_at': chat_data.get('created_at', datetime.now().isoformat())
                        })
                except Exception as e:
                    print(f"Ошибка при чтении чата {filename}: {e}")
                    continue
        
        # Сортируем по дате создания (новые сверху)
        chats.sort(key=lambda x: x['created_at'], reverse=True)
        return jsonify(chats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chats', methods=['POST'])
def create_new_chat():
    """Создать новый чат"""
    try:
        data = request.get_json()
        title = data.get('title', 'Новый чат')
        model = data.get('model', '')
        system_prompt = data.get('system_prompt', '')
        # Получаем reasoning_len из данных, по умолчанию 1000
        reasoning_len = data.get('reasoning_len', 1000)
        # Убеждаемся, что значение в допустимом диапазоне
        reasoning_len = max(0, min(2500, int(reasoning_len))) 
        
        # Генерируем уникальный ID для чата
        chat_id = str(uuid.uuid4())
        file_path = os.path.join(CHATS_DIR, f"{chat_id}.json")
        
        # Создаем структуру нового чата
        new_chat = {
            'id': chat_id,
            'title': title,
            'model': model,
            'system_prompt': system_prompt if system_prompt else None,
            'reasoning_len': reasoning_len, # Добавляем новое поле
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'messages': []
        }
        
        # Сохраняем чат в файл
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(new_chat, f, ensure_ascii=False, indent=2)
        
        return jsonify(new_chat)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chats/<chat_id>', methods=['GET'])
def get_chat(chat_id):
    """Получить данные конкретного чата"""
    try:
        file_path = os.path.join(CHATS_DIR, f"{chat_id}.json")
        if not os.path.exists(file_path):
            return jsonify({'error': 'Чат не найден'}), 404
            
        with open(file_path, 'r', encoding='utf-8') as f:
            chat_data = json.load(f)
        return jsonify(chat_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chats/<chat_id>', methods=['PUT'])
def update_chat(chat_id):
    """Обновить чат"""
    try:
        data = request.get_json()
        file_path = os.path.join(CHATS_DIR, f"{chat_id}.json")
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'Чат не найден'}), 404
            
        # Получаем reasoning_len из данных, по умолчанию 1000 если не указано
        reasoning_len = data.get('reasoning_len', 1000)
        # Убеждаемся, что значение в допустимом диапазоне
        reasoning_len = max(0, min(2500, int(reasoning_len)))
        # Добавляем проверенное значение обратно в данные
        data['reasoning_len'] = reasoning_len
        
        # Обновляем время изменения
        data['updated_at'] = datetime.now().isoformat()
        
        # Сохраняем обновленные данные
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chats/<chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    """Удалить чат"""
    try:
        file_path = os.path.join(CHATS_DIR, f"{chat_id}.json")
        if not os.path.exists(file_path):
            return jsonify({'error': 'Чат не найден'}), 404
            
        os.remove(file_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/ai/send_message', methods=['POST'])
def send_ai_message():
    """Отправка сообщения ИИ и сохранение ответа в чат"""
    try:
        data = request.get_json()
        chat_id = data.get('chat_id')
        user_message = data.get('message')
        
        if not chat_id or not user_message:
            return jsonify({'error': 'Необходимо указать chat_id и message'}), 400
        
        # Загружаем чат
        file_path = os.path.join(CHATS_DIR, f"{chat_id}.json")
        if not os.path.exists(file_path):
            return jsonify({'error': 'Чат не найден'}), 404
        
        with open(file_path, 'r', encoding='utf-8') as f:
            chat_data = json.load(f)
        
        # Вызываем ваш ИИ API
        ai_response = call_ai_api(user_message)
        
        # Создаем сообщение ИИ
        ai_message = {
            'id': int(time.time() * 1000),  # Уникальный ID
            'sender': 'ai',
            'text': ai_response,
            'timestamp': datetime.now().isoformat()
        }
        
        # Добавляем ответ ИИ в чат
        if 'messages' not in chat_data:
            chat_data['messages'] = []
        
        chat_data['messages'].append(ai_message)
        chat_data['updated_at'] = datetime.now().isoformat()
        
        # Сохраняем обновленный чат
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(chat_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({'success': True, 'ai_message': ai_message})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/create_request', methods=['POST'])
def create_request():
    """Создание файла запроса для локального API и запуск api_sender.py"""
    try:
        data = request.get_json()
        chat_filename = data.get('chat')
        
        if not chat_filename:
            return jsonify({'error': 'Не указан файл чата'}), 400
            
        # Проверяем, что файл чата существует
        chat_path = os.path.join(CHATS_DIR, chat_filename)
        if not os.path.exists(chat_path):
            return jsonify({'error': 'Файл чата не найден'}), 404
        
        # 1. Создаем файл request.json в директории config
        request_data = {
            "chat": chat_filename
        }
        
        config_path = os.path.join(CONFIG_DIR, 'request.json')
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(request_data, f, ensure_ascii=False, indent=2)
        
        # 2. Запускаем api_sender.py
        try:
            # Запускаем скрипт в отдельном процессе
            # subprocess.Popen([sys.executable, 'api_sender_council.pyw'], 
            subprocess.Popen([sys.executable, 'api_sender.pyw'],                  
                           stdout=subprocess.PIPE, 
                           stderr=subprocess.PIPE)
            # Если вы хотите видеть вывод скрипта в консоли, используйте:
            # subprocess.Popen([sys.executable, 'api_sender.py'])
        except FileNotFoundError:
            return jsonify({'error': 'Файл api_sender.py не найден'}), 500
        except Exception as e:
            return jsonify({'error': f'Ошибка запуска api_sender.py: {str(e)}'}), 500
        
        return jsonify({'success': True, 'message': 'Запрос создан и обрабатывается'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/process_file', methods=['POST'])
def process_file():
    """Обработка загруженного файла"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не найден'}), 400
        
        file = request.files['file']
        file_type = request.form.get('file_type', 'text')
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400
        
        # Сохраняем оригинальное имя файла
        original_filename = file.filename
        
        # Создаем временную директорию для загруженных файлов
        temp_dir = os.path.join(os.path.dirname(__file__), 'temp_uploads')
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)
        
        # Создаем уникальное временное имя файла с сохранением расширения
        file_ext = os.path.splitext(original_filename)[1]
        temp_filename = f"{uuid.uuid4()}{file_ext}"
        temp_path = os.path.join(temp_dir, temp_filename)
        file.save(temp_path)
        
        # Обрабатываем файл в зависимости от типа
        if file_type == 'image':
            result = FileHandler.process_image(temp_path)
        elif file_type == 'text':
            result = FileHandler.process_text_file(temp_path)
        else:
            result = {'success': False, 'error': 'Неизвестный тип файла'}
        
        # Если обработка успешна, заменяем временное имя на оригинальное
        if result.get('success'):
            result['filename'] = original_filename
        
        # Удаляем временный файл
        try:
            os.remove(temp_path)
        except:
            pass
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/save_code_file', methods=['POST'])
def save_code_file():
    """Сохранение кода в файл на диск с выбором папки"""
    try:
        data = request.json
        code_content = data.get('code', '')
        language = data.get('language', 'txt')  # Теперь это может быть полное имя файла
        
        if not code_content:
            return jsonify({'success': False, 'error': 'Нет содержимого для сохранения'}), 400
        
        # Определяем имя файла и расширение
        if '.' in language:
            # Если language содержит точку, это полное имя файла (например: test.py)
            filename = language
            extension = language.split('.')[-1]
        else:
            # Если только расширение, генерируем имя
            timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
            random_str = os.urandom(3).hex()
            filename = f'code_{timestamp}_{random_str}.{language}'
            extension = language
        
        # Получаем ссылку на окно webview
        try:
            window = webview.windows[0]
            
            # Открываем диалог сохранения файла
            result = window.create_file_dialog(
                dialog_type=webview.SAVE_DIALOG,
                save_filename=filename,
                file_types=(f'{extension.upper()} Files (*.{extension})', 'All files (*.*)')
            )
            
            if result and len(result) > 0:
                filepath = result[0] if isinstance(result, tuple) else result
                
                # Сохраняем файл в выбранную пользователем директорию
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(code_content)
                
                return jsonify({
                    'success': True,
                    'filename': os.path.basename(filepath),
                    'filepath': filepath,
                    'message': f'Файл сохранен: {filepath}'
                })
            else:
                # Пользователь отменил сохранение
                return jsonify({
                    'success': False,
                    'cancelled': True,
                    'message': 'Сохранение отменено'
                })
                
        except (IndexError, AttributeError):
            # Если webview недоступен, сохраняем в папку downloads по умолчанию
            filepath = os.path.join(DOWNLOADS_DIR, filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(code_content)
            
            absolute_path = os.path.abspath(filepath)
            
            return jsonify({
                'success': True,
                'filename': filename,
                'filepath': absolute_path,
                'message': f'Файл сохранен: {absolute_path}'
            })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/api/devlog')
def get_devlog():
    """Получить содержимое файла devlog.html без первой строки (комментария)"""
    try:
        if os.path.exists(DEVLOG_FILE_PATH):
            with open(DEVLOG_FILE_PATH, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            if not lines:
                 # Если файл пустой
                return jsonify({'content': '', 'shouldShow': False}), 204

            # Проверяем первую строку на наличие комментария //show = false
            first_line = lines[0].strip() if lines else ""
            should_show = "//show = false" not in first_line
            
            # Если нужно показывать, возвращаем содержимое БЕЗ первой строки
            if should_show:
                # Объединяем все строки, кроме первой
                content_without_first_line = "".join(lines[1:]) if len(lines) > 1 else ""
                return jsonify({
                    'content': content_without_first_line, # Отправляем без первой строки
                    'shouldShow': True
                })
            else:
                # Если не нужно показывать, можно отправить пустой контент
                return jsonify({'content': '', 'shouldShow': False})
        else:
            # Если файла нет, возвращаем пустой ответ
            return jsonify({'content': '', 'shouldShow': False}), 204
    except Exception as e:
        print(f"Ошибка чтения devlog.html: {e}")
        return jsonify({'error': 'Ошибка чтения файла devlog'}), 500

@app.route('/api/devlog/hide', methods=['POST'])
def hide_devlog():
    """Обновить комментарий в devlog.html, чтобы он больше не показывался"""
    try:
        if os.path.exists(DEVLOG_FILE_PATH):
            with open(DEVLOG_FILE_PATH, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            if lines:
                # Заменяем первую строку на комментарий, предотвращающий показ
                lines[0] = "//show = false\n"
                
                with open(DEVLOG_FILE_PATH, 'w', encoding='utf-8') as f:
                    f.writelines(lines)
                    
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Файл devlog.html не найден'}), 404
    except Exception as e:
        print(f"Ошибка обновления devlog.html: {e}")
        return jsonify({'error': 'Ошибка обновления файла devlog'}), 500

# ========== API для групповых чатов (Консилиумы) ==========

@app.route('/api/group_chats', methods=['GET'])
def get_group_chats_list():
    """Получить список всех консилиумов"""
    try:
        chats = []
        for filename in os.listdir(GROUP_CHATS_DIR):
            if filename.endswith('.json'):
                file_path = os.path.join(GROUP_CHATS_DIR, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        chat_data = json.load(f)
                        chat_id = filename[:-5]
                        preview = chat_data.get('title', 'Новый консилиум')
                        models_count = len(chat_data.get('models', []))
                        
                        chats.append({
                            'id': chat_id,
                            'title': preview or 'Пустой консилиум',
                            'models': chat_data.get('models', []),
                            'models_count': models_count,
                            'created_at': chat_data.get('created_at', datetime.now().isoformat())
                        })
                except Exception as e:
                    print(f"Ошибка при чтении консилиума {filename}: {e}")
                    continue
        
        chats.sort(key=lambda x: x['created_at'], reverse=True)
        return jsonify(chats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/group_chats', methods=['POST'])
def create_new_group_chat():
    """Создать новый консилиум"""
    try:
        data = request.get_json()
        title = data.get('title', 'Новый консилиум')
        models = data.get('models', [])
        system_prompt = data.get('system_prompt', '')
        reasoning_len = data.get('reasoning_len', 1000)
        reasoning_len = max(0, min(2500, int(reasoning_len)))
        
        if len(models) < 2:
            return jsonify({'error': 'Необходимо выбрать минимум 2 модели'}), 400
        
        chat_id = str(uuid.uuid4())
        file_path = os.path.join(GROUP_CHATS_DIR, f"{chat_id}.json")
        
        new_chat = {
            'id': chat_id,
            'title': title,
            'models': models,
            'system_prompt': system_prompt if system_prompt else None,
            'reasoning_len': reasoning_len,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'messages': []
        }
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(new_chat, f, ensure_ascii=False, indent=2)
        
        return jsonify(new_chat)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/group_chats/<chat_id>', methods=['GET'])
def get_group_chat(chat_id):
    """Получить данные конкретного консилиума"""
    try:
        file_path = os.path.join(GROUP_CHATS_DIR, f"{chat_id}.json")
        if not os.path.exists(file_path):
            return jsonify({'error': 'Консилиум не найден'}), 404
            
        with open(file_path, 'r', encoding='utf-8') as f:
            chat_data = json.load(f)
        return jsonify(chat_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/group_chats/<chat_id>', methods=['PUT'])
def update_group_chat(chat_id):
    """Обновить консилиум"""
    try:
        data = request.get_json()
        file_path = os.path.join(GROUP_CHATS_DIR, f"{chat_id}.json")
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'Консилиум не найден'}), 404
        
        reasoning_len = data.get('reasoning_len', 1000)
        reasoning_len = max(0, min(2500, int(reasoning_len)))
        data['reasoning_len'] = reasoning_len
        
        data['updated_at'] = datetime.now().isoformat()
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/group_chats/<chat_id>', methods=['DELETE'])
def delete_group_chat(chat_id):
    """Удалить консилиум"""
    try:
        file_path = os.path.join(GROUP_CHATS_DIR, f"{chat_id}.json")
        if not os.path.exists(file_path):
            return jsonify({'error': 'Консилиум не найден'}), 404
            
        os.remove(file_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/group_ai/send_message', methods=['POST'])
def send_group_ai_message():
    """Отправка сообщения всем моделям в консилиуме"""
    try:
        data = request.get_json()
        chat_id = data.get('chat_id')
        user_message = data.get('message')
        
        if not chat_id or not user_message:
            return jsonify({'error': 'Необходимо указать chat_id и message'}), 400
        
        file_path = os.path.join(GROUP_CHATS_DIR, f"{chat_id}.json")
        if not os.path.exists(file_path):
            return jsonify({'error': 'Консилиум не найден'}), 404
        
        with open(file_path, 'r', encoding='utf-8') as f:
            chat_data = json.load(f)
        
        models = chat_data.get('models', [])
        if not models:
            return jsonify({'error': 'В консилиуме нет моделей'}), 400
        
        # Запускаем api_sender.pyw для каждой модели
        system_prompt = chat_data.get('system_prompt', '')
        reasoning_len = chat_data.get('reasoning_len', 1000)
        
        for model in models:
            try:
                subprocess.Popen([
                    sys.executable,
                    'api_sender.pyw',
                    file_path,
                    model,
                    system_prompt,
                    str(reasoning_len)
                ])
            except Exception as e:
                print(f"Ошибка запуска api_sender для модели {model}: {e}")
        
        return jsonify({'success': True, 'models_count': len(models)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ========== Конец API для групповых чатов ==========

def call_ai_api(message):
    return f"Это ответ ИИ на ваше сообщение: '{message}'. Не переживайте, однажды эта заглушка сменится на нормальный ответ."

def start_server():
    app.run(host='127.0.0.1', port=1703, debug=True, use_reloader=False)

if __name__ == '__main__':
    if not os.path.exists(SETTINGS_FILE):
        save_settings(DEFAULT_SETTINGS)
    
    t = threading.Thread(target=start_server)
    t.daemon = True
    t.start()

    settings = load_settings()
    if settings.get('fullscreen', False):
        webview.create_window('Synedrion', 'http://127.0.0.1:1703', width=1200, height=800, fullscreen=True)
    else:
        webview.create_window('Synedrion', 'http://127.0.0.1:1703', width=1200, height=800, min_size=(600, 850))
    
    webview.start()