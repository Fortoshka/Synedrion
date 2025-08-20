from datetime import datetime
import random
import sys
import time
import requests
import json
import os
import logging


LOG_PATH = os.path.join(os.path.dirname(__file__), "config", "logs.log")
os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8"),  # пишем в файл
        logging.StreamHandler()  # дублируем в консоль
    ]
)

def load_json(path: str):
    """Безопасная загрузка JSON"""
    if not os.path.exists(path):
        raise FileNotFoundError(f"Файл не найден: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


API_URL = "https://openrouter.ai/api/v1/chat/completions"

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "request.json")
config = load_json(CONFIG_PATH)
os.remove(CONFIG_PATH)

HISTORY_PATH = os.path.join(os.path.dirname(__file__), "chats", config["chat"])
HISTORY_FILE = load_json(HISTORY_PATH)

MODEL = HISTORY_FILE["model"]
API_KEYS_P = load_json("api_keys.json")


def get_api_keys():
    p_url = "https://openrouter.ai/api/v1/keys"
    p_api = random.choice(API_KEYS_P)
    p_headers = {
        "Authorization": f"Bearer {p_api}",
        "Content-Type": "application/json"
    }
    try:
        data = requests.post(p_url, headers=p_headers, json={"name": "name"}, timeout=30).json()
        data["p_api"] = p_api
        time.sleep(1)
        return data
    except requests.exceptions.RequestException as e:
        logging.error(f"Ошибка при получении ключа API: {e}")
        sys.exit(0) 


def load_history():
    """Загружает историю диалога из файла"""
    history = []
    for message in HISTORY_FILE["messages"]:
        if message["sender"] == "ai":
            history.append({"role": "assistant", "content": message["text"]})
        elif message["sender"] == "user":
            history.append({"role": "user", "content": message["text"]})
    return history


def save_history(answer):
    """Сохраняет историю диалога в файл"""
    HISTORY_FILE["messages"].append({
        'id': int(time.time() * 1000),  # Уникальный ID
        'sender': 'ai',
        'text': answer,
        'timestamp': datetime.now().isoformat()
    })
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(HISTORY_FILE, f, ensure_ascii=False, indent=2)


def send_message_api(history):
    api_data = get_api_keys()
    headers = {
        "Authorization": f"Bearer {api_data["key"]}",
        "Content-Type": "application/json"
    }
    data = {"model": MODEL, "messages": history}

    try:
        response = requests.post(API_URL, headers=headers, json=data, timeout=30)
        response.raise_for_status()
        result = response.json()
        return result['choices'][0]['message']['content']
    except requests.exceptions.RequestException as e:
        logging.error(f"Ошибка сети при запросе: {e}")
        return None
    except KeyError:
        logging.error(f"Неверный формат ответа API: {response.text}")
        return None
    finally:
        try:
            response_del = requests.delete(f"https://openrouter.ai/api/v1/keys/{api_data['data']['hash']}",
                                            headers = {"Authorization": f"Bearer {api_data["p_api"]}"})
            logging.info(f"Deleted API key {response_del.json()}")
        except Exception as e:
            logging.warning(f"Error deleting API key")


def main():
    history = load_history()
    answer = send_message_api(history)
    if answer:
        save_history(answer)
        logging.info("Ответ сохранён в истории.")
    else:
        logging.warning("Ответ не был получен.")


if __name__ == "__main__":
    main()
