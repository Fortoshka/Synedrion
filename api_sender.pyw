from datetime import datetime
import random
import sys
import threading
import time
import requests
import json
import os
import logging
import math

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

USER_SYSTEM_PROMPT = HISTORY_FILE.get("system_prompt",'')
MODEL = HISTORY_FILE.get("model")
REASONING_MAX = HISTORY_FILE.get("reasoning_len")
KYES_PATH ="api_keys.json"
if not os.path.exists(KYES_PATH): KYES_PATH ="api_keys.example.json"
API_KEYS_P = load_json(KYES_PATH)

BASE_SYSTEM_PROMPT = open(os.path.join(os.path.dirname(__file__), "config", "system_promt.txt"), "r", encoding="utf-8").read()


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

def simulate_progress_real_time(stop_event, max_percent=80, total_time=35):
    """Линейный прогресс от 0 до max_percent с мгновенной остановкой."""
    start_time = time.time()
    progress = 0
    while not stop_event.is_set():
        elapsed = time.time() - start_time
        progress =  (elapsed / (elapsed + total_time/2.5)) * max_percent
        save_history({}, 'generating', progress=min(67, progress))
        time.sleep(1)

def load_history():
    """Загружает историю диалога из файла"""
    history = [{"role": "system", "content": f"{BASE_SYSTEM_PROMPT} \n [USERPROMPT] \n{USER_SYSTEM_PROMPT} \n[/USERPROMPT] \n [/INSTRUCTION]"}]
    for message in HISTORY_FILE["messages"]:
        if message["sender"] == "ai":
            history.append({"role": "assistant", "reasoning": message.get("reasoning", ""), "content": message.get("answer", "")})
        elif message["sender"] == "user":
            history.append({"role": "user", "content": message.get("text","")})
        elif message["sender"] == "error":
            history.pop()
    logging.info(f"История диалога загружена. Всего сообщений: {len(history)}")
    return history

def save_history(response, state = None, progress = 0):
    """Сохраняет историю диалога в файл"""
    HISTORY_FILE_TEMP = json.loads(json.dumps(HISTORY_FILE))
    answer = response.get('choices',[{}])[0].get('message',{}).get('content','')
    reasoning = response.get('choices',[{}])[0].get('message',{}).get('reasoning','')
    if not answer:
        if state == "start":
            text = f"[LOADING:10]Создание запроса...[/LOADING]"
        elif state == 'generating':
            text = f"[LOADING:{int(20 + progress)}]Генерация ответа...[/LOADING]"
    elif reasoning:
        text = f"[THOUGHTS]\n{reasoning}\n[/THOUGHTS]\n{answer}" 
        logging.info("История успешно сохранена.")
    else:
        text = answer + " "
        logging.info("История успешно сохранена.")
    HISTORY_FILE_TEMP["messages"].append({
        'id': int(time.time() * 1000),  # Уникальный ID
        'sender': 'ai',
        "reasoning": reasoning,
        "answer": answer,
        'text':  text,
        'timestamp': datetime.now().isoformat()
    })
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(HISTORY_FILE_TEMP, f, ensure_ascii=False, indent=2)

def send_message_api(history):
    api_data = get_api_keys()
    headers = {
        "Authorization": f"Bearer {api_data["key"]}",
        "Content-Type": "application/json"
    }
    data = {
        "model": MODEL, 
        "messages": history,
        "usage": {"include": True}
    }
    if REASONING_MAX>0:
        data["reasoning"] = {"max_tokens": REASONING_MAX }
    else:
        data["reasoning"] = {"exclude": True} 
    
    try:
        logging.info("Отправка сообщения в API...")
        stop_event = threading.Event()
        thread = threading.Thread(target=simulate_progress_real_time, args=(stop_event, 80, 35))
        thread.start()
        response = requests.post(API_URL, headers=headers, json=data, timeout=60)
        response.raise_for_status()
        result = response.json()
        logging.info(f"Ответ от API успешно получен: {result}")
        return result
    
    except requests.exceptions.RequestException as e:
        logging.error(f"Ошибка сети при запросе: {e}")
        err = str(e)
        error_answer = f"Ошибка сети при запросе: {err}\n"
        response = e.response 
        logging.error(f"Ошибка сети при запросе: {response.json()}")
        if response is not None:
            try:
                response_json = response.json()
            except ValueError:
                response_json = None
        if "429" in err:
            error_answer += "Выбранная модель сейчас недоступна из-за высокой нагрузки или тот ключ, котрый вам выпал врмено не работате попробуйте перезапустить. Попробуйте выбрать другую или попробйте позже."
            try:
                now_utc = int(time.time())
                reset_ts = None
                if response_json:
                    reset_ts = (response_json.get('error', {}).get('metadata', {}).get('headers', {}).get('X-RateLimit-Reset'))
                if reset_ts:
                    reset_time_utc = datetime.utcfromtimestamp(int(reset_ts) / 1000)
                    reset_time_unix = datetime.utcfromtimestamp(int(reset_ts) / 1000)- datetime.utcfromtimestamp(now_utc) 
                    logging.error(f"Сброс лимита произойдет: {reset_time_utc}. Ключ заработает через {reset_time_unix} ")
            finally:
                API_KEYS_P.append(API_KEYS_P.pop(0))
                with open(KYES_PATH, "w", encoding="utf-8") as f:
                    json.dump(API_KEYS_P, f, ensure_ascii=False, indent=4)
        elif "502" in err:
            error_answer += "К сожалению, сервера сейчас перегружены. Попробуйте позже или выберите другую модель."
        elif "404" in err:
            error_answer += "К сожалению, выбранная вами модель больше не поддерживается. Пожалуйста, выберите другую."
        HISTORY_FILE["messages"].append({
            'id': int(time.time() * 1000),
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
            stop_event.set()
            thread.join()
            response_del = requests.delete(
                f"https://openrouter.ai/api/v1/keys/{api_data['data']['hash']}",
                headers={"Authorization": f"Bearer {api_data['p_api']}"}
            )
            logging.info(f"API ключ удалён: {response_del.json()}")
        except Exception as e:
            logging.warning(f"Ошибка при удалении API ключа: {e}")


def main():
    try:
        save_history({}, "start")
        history = load_history()
        answer = send_message_api(history)
        if answer:
            if answer['choices'][0]['message']['content'] == "" : answer['choices'][0]['message']['content'] += "[RESPONSE]\n*треск сверчков*\n[/RESPONSE]"
            save_history(answer)
            logging.info("Ответ сохранён в истории.")
        else:
            logging.warning("Ответ не был получен.")
    except:
        logging.error(f"Ошибка в коде")
        HISTORY_FILE["messages"].append({
            'id': int(time.time() * 1000),
            'sender': 'error',
            'text': "⚠️При обработке запроса возникла ошибка⚠️\nЭто могло произойти из-за:\n❌Неработоспособности ключей API\n❌Ошибки в коде программы\n\nЕсли Вам срочно необходима помощь с решением проблемы, обратитесь в тех поддержку (смотрите раздел 'О приложении'). В противном случае попробуйте создать новый чат, перегенерировать текущий, или дождаться решения проблемы в новом обновлении.",
            'timestamp': datetime.now().isoformat()
        })
        with open(HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(HISTORY_FILE, f, ensure_ascii=False, indent=2)
    finally:
        logging.info("api_sender.pyw завершил работу!")


if __name__ == "__main__":
    main()