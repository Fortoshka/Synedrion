from datetime import datetime
import http
import re
import time
import requests
import json
import os
import logging
from tool_calling import process_tool_calls, TOOLS

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

TOOL_SUPPORTED_MODELS = load_json("tool_supported_models.json")
BASE_SYSTEM_PROMPT = open(os.path.join(os.path.dirname(__file__), "config", "system_promt.txt"), "r", encoding="utf-8").read()
TOOLS_USE = [{"type":"function","function":{"name":name, **TOOLS[name]}} for name in TOOLS]
if not HISTORY_FILE.get("search_web", "123"):
    TOOLS_USE = [tool for tool in TOOLS_USE if tool.get("function", {}).get("name", "") not in ("search_web", "summarize_url")]


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
        logging.error(f"Ошибка при получении ключа API: {e}", exc_info=True)
        time.sleep(1)
        return get_api_keys()

def simulate_progress_real_time(stop_event, max_percent=80, total_time=35):
    """Линейный прогресс от 0 до max_percent с мгновенной остановкой."""
    start_time = time.time()
    progress = 0
    while not stop_event.is_set():
        elapsed = time.time() - start_time
        progress =  (elapsed / (elapsed + total_time/2)) * max_percent
        save_history({}, 'generating', progress=min(max_percent-3, progress))
        time.sleep(1)

def load_history():
    """Загружает историю диалога из файла"""
    history = [{"role": "system", "content": f"{BASE_SYSTEM_PROMPT} \n [USERPROMPT] \n{USER_SYSTEM_PROMPT} \n[/USERPROMPT] \n[/INSTRUCTION]"}]
    for message in HISTORY_FILE["messages"]:
        if message["sender"] == "ai":
            history.append({"role": "assistant", "reasoning": message.get("reasoning", ""), "content": message.get("answer", "")})
        elif message["sender"] == "user":
            history.append({"role": "user", "content": message.get("text", "")})
            if message.get("filename", ''): 
                filename = ""
                for file_num in range(len(message.get("filename", []))):
                    filename += f"{file_num + 1} - {message["filename"][file_num]}\n    {message["file"][file_num]}\n"
                history[-1]["content"] += f"\n[FILE]{filename[:-2]}[/FILE]"
        elif message["sender"] == "error":
            history.pop()
    logging.info(f"История диалога загружена. Всего сообщений: {len(history)}")
    return history

def save_history(response : list = [{}], progress = 0):
    """Сохраняет историю диалога в файл"""
    HISTORY_FILE_TEMP = HISTORY_FILE.copy()
    text = ""
    answer = ""
    reasoning = ""
    if response is not None:
        for message in response:
            answer = message.get('content', '')
            reasoning = message.get('reasoning', '').strip()
            if answer == "" and reasoning == "" and progress:
                text = f"[LOADING:{1+progress}]Создание запроса...[/LOADING]"
                logging.info(text)
                break
            if reasoning:
                text += f"[THOUGHTS]\n{reasoning}\n[/THOUGHTS]\n{answer}" 
            else:
                text = answer + " "
                
            open_matches = list(re.finditer(r'\[CODE', answer))
            close_matches = list(re.finditer(r'\[/CODE\]', answer))
            all_tags = sorted(open_matches + close_matches, key=lambda m: m.start())

            open_count = 0
            for tag in all_tags:
                if tag.group().startswith('[/CODE'):
                    if open_count > 0:
                        open_count -= 1 
                else: 
                    open_count += 1 

            if open_count > 0:
                text += "[/CODE]"

    HISTORY_FILE_TEMP["messages"].append({
        'id': int(time.time() * 1000),  # Уникальный ID
        'sender': 'ai',
        'sender_model': MODEL,
        "reasoning": reasoning,
        "answer": answer,
        'text':  text,
        'timestamp': datetime.now().isoformat()
    })
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(HISTORY_FILE_TEMP, f, ensure_ascii=False, indent=2)
    return True

def send_message_api(history: list, tools_send: int = 0, error_count: int = 0):
    api_data = get_api_keys()
    headers = {
        "Authorization": f"Bearer {api_data["key"]}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": MODEL, 
        "transforms": ["middle-out"],
        "messages": history,
        "tool_choice": "auto",
        "usage": {"include": True},
        "stream": True,
    }
    if MODEL in TOOL_SUPPORTED_MODELS:
        payload["tools"] = TOOLS_USE
    if REASONING_MAX>0:
        payload["reasoning"] = {"max_tokens": REASONING_MAX }
    else:
        payload["reasoning"] = {"exclude": True} 

    result.append({
        "reasoning": "",
        "content": "",
        "tool_calls": [],
        "fatal_error": False
    })

    tool_calls_buffer = {}
    try:
        logging.info("Отправка сообщения в API...")
        if tools_send == 0 and error_count == 0:
            save_history(progress=50)

        response = requests.post(API_URL, headers=headers, json=payload, stream=True)

        try:
            response.raise_for_status()
            
            for line in response.iter_lines(1024):
                if line:
                    line_str = line.decode('utf-8')
                    stripped_line = line_str.strip()

                    if line_str.startswith(":"):
                        logging.debug("Игнорируем служебную строку: OPENROUTER PROCESSING")
                        continue 

                    if stripped_line.startswith('{') and stripped_line.endswith('}'):
                        try:
                            potential_error_json = json.loads(stripped_line)
                            if "error" in potential_error_json:
                                logging.error(f"Ошибка от API в строке: {potential_error_json}")
                                from requests.models import Response
                                fake_response = Response()
                                fake_response.status_code = potential_error_json["error"].get("code", 500)
                                fake_response._content = json.dumps(potential_error_json).encode('utf-8')
                                http_error = requests.exceptions.HTTPError(response=fake_response)
                                raise http_error
                        except json.JSONDecodeError:
                            pass 

                    if line_str.startswith(''):
                        data_part = line_str[6:]
                        if data_part == '[DONE]':
                            logging.info("Поток завершён сервером [DONE].")
                            break
                        try:
                            parsed = json.loads(data_part)
                            delta = parsed.get("choices", [{}])[0].get("delta", {})
                            delta_tool_calls = delta.get("tool_calls", [])
                            if delta_tool_calls:
                                for tool_call_chunk in delta_tool_calls:
                                    index = tool_call_chunk.get("index")
                                    if index is not None:
                                        if index not in tool_calls_buffer:
                                            tool_calls_buffer[index] = {
                                                "id": tool_call_chunk.get("id"),
                                                "type": tool_call_chunk.get("type"),
                                                "function": {
                                                    "name": tool_call_chunk.get("function", {}).get("name", ""),
                                                    "arguments": ""
                                                }
                                            }

                                        if "id" in tool_call_chunk and not tool_calls_buffer[index]["id"]:
                                            tool_calls_buffer[index]["id"] = tool_call_chunk["id"]
                                        if "type" in tool_call_chunk and not tool_calls_buffer[index]["type"]:
                                            tool_calls_buffer[index]["type"] = tool_call_chunk["type"]
                                        if "name" in tool_call_chunk.get("function", {}):
                                            tool_calls_buffer[index]["function"]["name"] = tool_call_chunk["function"]["name"]

                                        args_chunk = tool_call_chunk.get("function", {}).get("arguments", "")
                                        if args_chunk:
                                            tool_calls_buffer[index]["function"]["arguments"] += args_chunk

                            content = delta.get("content", "") 
                            reasoning = delta.get("reasoning", "") 
                            if reasoning:
                                result[-1]["reasoning"] += reasoning
                            if content:
                                result[-1]["content"] += content
                            
                            save_history(response=result)

                        except json.JSONDecodeError as je:
                            logging.warning(f"Не удалось распарсить chunk: {data_part}, ошибка: {je}")
                            continue
                        except Exception as e_inner:
                            logging.warning(f"Ошибка при обработке чанка: {e_inner}")
                            raise e_inner

        except (requests.exceptions.ChunkedEncodingError,
                requests.exceptions.ConnectionError,
                http.client.IncompleteRead,
                OSError,
                requests.exceptions.HTTPError) as stream_error:
            logging.error(f"Ошибка при чтении потока: {stream_error}", exc_info=True)
            raise requests.exceptions.RequestException(f"Ошибка при чтении потока: {stream_error}") from stream_error
        
        result[-1]["tool_calls"] = [tool_calls_buffer[k] for k in sorted(tool_calls_buffer.keys())]
        logging.info(f"Ответ от API успешно получен. {result[-1]}")
        logging.info(f"История сохранена. {save_history(response=result)}")
        
        if result[-1]["tool_calls"]:
            temp_result = result.copy()
            temp_result[-1] = {"content": temp_result[-1].get("content", "") + "\nОжидание ответа инструментов ",
                                   "reasoning": temp_result[-1].get("reasoning", ""),
                                   "tool_calls": temp_result[-1].get("tool_calls", ""),
                                   "fatal_error": False}
            save_history(response=temp_result)

        follow_message = process_tool_calls(
            result,
            messages=history,
            tools=TOOLS_USE,
            headers=headers,
            api_url=API_URL,
            model=MODEL
        )

        if follow_message:
            follow_send = send_message_api(history=follow_message, tools_send=1) 
            save_history(response=follow_send)
            logging.info("Ответ после вызова инструментов сохранён.")
            return follow_send
        return result

    except requests.exceptions.RequestException as e:
        logging.error(f"Ошибка сети при запросе: {e}", exc_info=True)
        err = str(e)
        error_answer = f"Ошибка сети при запросе: {err}\n"
        response_obj = e.response 
        if response_obj is not None:
            try:
                response_json = response_obj.json()
                logging.error(f"Ошибка сети при запросе (JSON): {response_json}")
            except ValueError:
                logging.error(f"Ошибка сети при запросе (text): {response_obj.text}")
                response_json = None
        else:
            logging.error("Ответ от сервера отсутствует (ошибка до получения ответа).")
            response_json = None

        if response_json and response_json.get("error", {}).get("code") == 429 or "429" in err:
            error_answer += "Выбранная модель сейчас недоступна из-за высокой нагрузки или тот ключ, котрый вам выпал врмено не работате попробуйте перезапустить. Попробуйте выбрать другую или попробйте позже."
            try:
                now_utc = int(time.time())
                reset_ts = None
                if response_json:
                    reset_ts = (response_json.get('error', {}).get('metadata', {}).get('headers', {}).get('X-RateLimit-Reset'))
                if reset_ts:
                    reset_time_utc = datetime.utcfromtimestamp(int(reset_ts) / 1000)
                    reset_time_unix = datetime.utcfromtimestamp(int(reset_ts) / 1000) - datetime.utcfromtimestamp(now_utc)
                    logging.error(f"Сброс лимита произойдет: {reset_time_utc}. Ключ заработает через {reset_time_unix}")
            finally:
                API_KEYS_P.append(API_KEYS_P.pop(0))
                with open(KYES_PATH, "w", encoding="utf-8") as f:
                    json.dump(API_KEYS_P, f, ensure_ascii=False, indent=4)
        elif "502" in err:
            error_answer += "К сожалению, сервера сейчас перегружены. Попробуйте позже или выберите другую модель."
        elif "404" in err:
            error_answer += "К сожалению, выбранная вами модель больше не поддерживается. Пожалуйста, выберите другую."
        if error_count >= 3: 
            result[-1]["fatal_error"] = True
            result[-1]["fatal_error_message"] = error_answer
            time.sleep(1)
            return result
        result_retry = send_message_api(history=history, error_count=(error_count + 1), tools_send=tools_send)
        return result_retry

    except KeyError as ke:
        logging.error(f"Неверный формат ответа API: {response.text if 'response' in locals() else 'response не определён'}, ошибка: {ke}", exc_info=True)
        result[-1]["fatal_error"] = True
        result[-1]["fatal_error_message"] = f"Неверный формат ответа API: {ke}"
        return result

    except Exception as e:
        logging.error(f"Неожиданная ошибка в основном блоке: {e}", exc_info=True)
        result[-1]["fatal_error"] = True
        result[-1]["fatal_error_message"] = f"Неожиданная ошибка: {e}"
        return result

    finally:
        try:
            response_del = requests.delete(
                f"https://openrouter.ai/api/v1/keys/{api_data['data']['hash']}",
                headers={"Authorization": f"Bearer {api_data['p_api']}"}
            )
            logging.info(f"API ключ удалён: {response_del.json()}")
        except Exception as e:
            logging.warning(f"Ошибка при удалении API ключа: {e}")
        
        if result[-1].get("fatal_error"):
            error_answer = result[-1].get("fatal_error_message", "Произошла ошибка.")
            HISTORY_FILE["messages"].append({
                'id': int(time.time() * 1000),
                'sender': 'error',
                'sender_model': MODEL,
                'text': error_answer,
                'timestamp': datetime.now().isoformat()
            })
            with open(HISTORY_PATH, "w", encoding="utf-8") as f:
                json.dump(HISTORY_FILE, f, ensure_ascii=False, indent=2)

def main():
    try:
        save_history(progress=25)
        history = load_history()
        global result
        result = []
        answer = send_message_api(history=history)
        if answer[-1].get("fatal_error", ""):
            pass
        elif answer:
            time.sleep(1)
            if answer[-1].get('content','') == "":
                answer[-1]['content'] += "[RESPONSE]\n*треск сверчков*\n[/RESPONSE]"
            logging.info(f"История сохранена. {save_history(answer)}")
            logging.info("Ответ сохранён в истории.")
        else:
            logging.warning("Ответ не был получен.")
    except Exception as e:
        logging.error(f"Ошибка в коде: {e}", exc_info=True)
        HISTORY_FILE["messages"].append({
            'id': int(time.time() * 1000),
            'sender': 'error',
            'sender_model': MODEL,
            'text': "⚠️При обработке запроса возникла ошибка⚠️\nЭто могло произойти из-за:\n❌Неработоспособности ключей API\n❌Ошибки в коде программы\n\nЕсли Вам срочно необходима помощь с решением проблемы, обратитесь в тех поддержку (смотрите раздел 'О приложении'). В противном случае попробуйте создать новый чат, перегенерировать текущий, или дождаться решения проблемы в новом обновлении.",
            'timestamp': datetime.now().isoformat()
        })
        with open(HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(HISTORY_FILE, f, ensure_ascii=False, indent=2)
    finally:
        logging.info("api_sender.pyw завершил работу!")


if __name__ == "__main__":
    main()