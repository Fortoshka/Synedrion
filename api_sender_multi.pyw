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
        logging.FileHandler(LOG_PATH, encoding="utf-8"),  
        logging.StreamHandler() 
    ]
)

def load_json(path: str):
    """Безопасная загрузка JSON"""
    if not os.path.exists(path):
        logging.error(f"Файл не найден: {path}")
        raise FileNotFoundError(f"Файл не найден: {path}")
    with open(path, "r", encoding="utf-8") as f:
        logging.info(f"Файл успешно загружен: {path}")
        return json.load(f)


API_URL = "https://openrouter.ai/api/v1/chat/completions"

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "request.json")
config = load_json(CONFIG_PATH)
os.remove(CONFIG_PATH)
logging.info(f"Файл конфигурации {CONFIG_PATH} удалён после загрузки.")

HISTORY_PATH = os.path.join(os.path.dirname(__file__), "chats", config["chat"])
HISTORY_FILE = load_json(HISTORY_PATH)

USER_SYSTEM_PROMPT = HISTORY_FILE["system_prompt"]
MODEL = HISTORY_FILE["model"]
API_KEYS_P = load_json("api_keys.json")

BASE_SYSTEM_PROMPT = open(os.path.join(os.path.dirname(__file__), "config", "system_promt.txt"), "r", encoding="utf-8").read()
BASE_SYSTEM_PROMPT =""


def get_api_keys():
    p_url = "https://openrouter.ai/api/v1/keys"
    p_api = API_KEYS_P[0]
    p_headers = {
        "Authorization": f"Bearer {p_api}",
        "Content-Type": "application/json"
    }
    try:
        logging.info("Запрос нового API ключа...")
        data = requests.post(p_url, headers=p_headers, json={"name": "name"}, timeout=30).json()
        data["p_api"] = p_api
        logging.info(f"Новый API ключ получен: {data.get('data', {}).get('hash', 'нет hash')}")
        return data
    except requests.exceptions.RequestException as e:
        logging.error(f"Ошибка при получении ключа API: {e}")
        sys.exit(0) 

def load_history():
    """Загружает историю диалога из файла"""
    history = [{"role": "system", "content": f"{BASE_SYSTEM_PROMPT}\n{USER_SYSTEM_PROMPT}"}]
    for message in HISTORY_FILE["messages"]:
        if message["sender"] == "ai":
            if "model" in list(message.keys()):
                history.append({"role": "assistant", "model": message["model"], "content": message["text"]})
            else:
                history.append({"role": "assistant", "content": message["text"]})
        elif message["sender"] == "user":
            history.append({"role": "user", "content": message["text"]})
        elif message["sender"] == "error":
            pass
            #history.pop()
    logging.info(f"История диалога загружена. Всего сообщений: {len(history)}\n{history}")
    return history


def save_history(answer, model):
    """Сохраняет историю диалога в файл"""
    HISTORY_FILE["messages"].append({
        'id': int(time.time() * 1000),  # Уникальный ID
        'sender': 'ai',
        "model": model,
        'text': answer,
        'timestamp': datetime.now().isoformat()
    })
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(HISTORY_FILE, f, ensure_ascii=False, indent=2)
    logging.info("История успешно сохранена.")


def send_message_api(history, model):
    api_data = get_api_keys()
    headers = {
        "Authorization": f"Bearer {api_data["key"]}",
        "Content-Type": "application/json"
    }
    data = {
        "model": model, 
        "messages": history,
        "reasoning": {
            "max_tokens": 1000
            }
        }
    
    try:
        logging.info("Отправка сообщения в API...")
        response = requests.post(API_URL, headers=headers, json=data, timeout=60)
        response.raise_for_status()
        result = response.json()
        logging.info(f"Ответ от API успешно получен.\n{result}")
        return result['choices'][0]['message']['content']
    
    except requests.exceptions.RequestException as e:
        logging.error(f"Ошибка сети при запросе: {e}")
        err = str(e)
        error_answer = f"Ошибка сети при запросе: {err}\n"
        response = requests.post(API_URL, headers=headers, json=data, timeout=30)
        if "429" in err:
            error_answer += "Выбранная модель сейчас недоступна из-за высокой нагрузки или тот ключ, котрый вам выпал врмено не работате попробуйте перезапустить. Попробуйте выбрать другую или попробйте позже."
            try:
                try:
                    now_utc = datetime.datetime.utcnow()
                    reset_time_utc = datetime.datetime.utcfromtimestamp(response['error']['metadata']['headers']['X-RateLimit-Reset'] / 1000)
                    logging.error(f"Сброс лимита произойдет:{reset_time_utc}. Ключ заработатет через {reset_time_utc-now_utc} ")
                finally:
                    API_KEYS_P.append(API_KEYS_P.pop(0))
            finally:
                with open("api_keys.json", "w", encoding="utf-8") as f:
                    json.dump(API_KEYS_P, f, ensure_ascii=False, indent=4)
        elif "502" in err: error_answer += "К сожалению, сервера сейчас перегружены. Попробуйте позже или выберите другую модель."
        elif "404" in err: error_answer += "К сожалению, выбранная вами модель больше не поддерживается. Пожалуйста, выберите другую."
        logging.error(f"Ошибка сети при запросе: {response.json()}")
        HISTORY_FILE["messages"].append({
        'id': int(time.time() * 1000),  # Уникальный ID
        'sender': 'error',
        'text': error_answer,
        'timestamp': datetime.now().isoformat()
        })
        with open(HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(HISTORY_FILE, f, ensure_ascii=False, indent=2)
        return None
    
    except KeyError:
        logging.error(f"Неверный формат ответа API: {response.text}")
        return None
    
    finally:
        try:
            response_del = requests.delete(
                f"https://openrouter.ai/api/v1/keys/{api_data['data']['hash']}",
                headers={"Authorization": f"Bearer {api_data['p_api']}"}
            )
            logging.info(f"API ключ удалён: {response_del.json()}")
        except Exception as e:
            logging.warning(f"Ошибка при удалении API ключа: {e}")


def main():
    for model in ["qwen/qwen3-coder:free", "deepseek/deepseek-chat-v3.1:free", "google/gemini-2.0-flash-exp:free"]:
        time.sleep(1)
        history = load_history()
        answer = send_message_api(history, model)
        if answer:
            save_history(answer, model)
            logging.info("Ответ сохранён в истории.")
        else:
            logging.warning("Ответ не был получен.")
        logging.info("Еще запрос ИИ")


if __name__ == "__main__":
    main()
