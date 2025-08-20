from flask import Flask, render_template, jsonify, request, abort
from datetime import datetime
import time
import threading
import webview
import json
import os
import sys
import uuid

app = Flask(__name__)

SETTINGS_FILE = 'settings.json'

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

@app.route('/single_chat')
def single_chat():
    return render_template('single_chat.html')

@app.route('/council')
def council():
    return render_template('pages/council.html')

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
        model = data.get('model', '')  # Получаем выбранную модель
        system_prompt = data.get('system_prompt', '')  # Получаем системный промпт
        
        # Генерируем уникальный ID для чата
        chat_id = str(uuid.uuid4())
        file_path = os.path.join(CHATS_DIR, f"{chat_id}.json")
        
        # Создаем структуру нового чата
        new_chat = {
            'id': chat_id,
            'title': title,
            'model': model,  # Сохраняем выбранную модель
            'system_prompt': system_prompt if system_prompt else None,  # Сохраняем системный промпт
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
    """Обновить данные чата (например, добавить сообщение)"""
    try:
        file_path = os.path.join(CHATS_DIR, f"{chat_id}.json")
        if not os.path.exists(file_path):
            return jsonify({'error': 'Чат не найден'}), 404
        
        # Получаем обновленные данные чата
        updated_data = request.get_json()
        
        # Обновляем время изменения
        updated_data['updated_at'] = datetime.now().isoformat()
        
        # Сохраняем обновленные данные
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(updated_data, f, ensure_ascii=False, indent=2)
        
        return jsonify(updated_data)
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

def call_ai_api(message):
    return f"Это ответ ИИ на ваше сообщение: '{message}'. Не переживайте, однажды эта заглушка сменится на нормальный ответ."

def start_server():
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)

if __name__ == '__main__':
    # Создаем файл настроек при первом запуске
    if not os.path.exists(SETTINGS_FILE):
        save_settings(DEFAULT_SETTINGS)
    
    # Запускаем Flask в отдельном потоке
    t = threading.Thread(target=start_server)
    t.daemon = True
    t.start()

    # Открываем окно с интерфейсом
    settings = load_settings()
    if settings.get('fullscreen', False):
        webview.create_window('Synedrion', 'http://127.0.0.1:5000', width=1200, height=800, fullscreen=True)
    else:
        webview.create_window('Synedrion', 'http://127.0.0.1:5000', width=1200, height=800)
    
    webview.start()  # Запускает цикл GUI