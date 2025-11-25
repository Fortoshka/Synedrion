from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import http
import random
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
EXC_INFO = True # Подробное логирование ошибок

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "request.json")
CONFIG = load_json(CONFIG_PATH)
os.remove(CONFIG_PATH)
logging.info(f"Файл конфигурации {CONFIG_PATH} удалён после загрузки.")

HISTORY_PATH = os.path.join(os.path.dirname(__file__), "group_chats", CONFIG["chat"])
history_file = load_json(HISTORY_PATH)

USER_SYSTEM_PROMPT = history_file.get("system_prompt",'')
MODELS = history_file.get("models")
REASONING_MAX = history_file.get("reasoning_len")
KYES_PATH ="api_keys.json"
if not os.path.exists(KYES_PATH): KYES_PATH ="api_keys.example.json"
api_keys_p = load_json(os.path.join(os.path.dirname(__file__), KYES_PATH))

ID = int(time.time() * 1000)  # Уникальный ID
MODELS_NAMES = load_json(os.path.join(os.path.dirname(__file__), "models.json"))
TOOL_SUPPORTED_MODELS = MODELS_NAMES["tools"]

BASE_SYSTEM_PROMPT = open(os.path.join(os.path.dirname(__file__), "config", "system_promt.txt"), "r", encoding="utf-8").read()
if not history_file.get("search_web", "123"):
    TOOLS_USE = [{"type":"function","function":{"name":name, **TOOLS[name]}} for name in TOOLS if name not in ("search_web", "summarize_url")]
else:
    TOOLS_USE = [{"type":"function","function":{"name":name, **TOOLS[name]}} for name in TOOLS]


def get_api_keys():
    if api_keys_p["key"]:
        return random.choice(api_keys_p["key"])
    p_url = "https://openrouter.ai/api/v1/keys"
    p_api = api_keys_p.get("p_key", api_keys_p)[0]
    p_headers = {
        "Authorization": f"Bearer {p_api}",
        "Content-Type": "application/json"
    }
    try:
        logging.info("Запрос нового API ключа...")
        data = requests.post(p_url, headers=p_headers, json={"name": "name"}, timeout=30).json()
        data["p_api"] = p_api
        if data.get("key", ""):
            logging.info(f"Новый API ключ получен: {data.get('data', {}).get('hash', 'нет hash')}")
            return data
        raise
    except requests.exceptions.RequestException as e:
        api_keys_p.get("p_key", api_keys_p).append(api_keys_p.get("p_key", api_keys_p).pop(0))
        with open(KYES_PATH, "w", encoding="utf-8") as f:
            json.dump(api_keys_p, f, ensure_ascii=False, indent=4)
        logging.error(f"Ошибка при получении ключа API: {e}", exc_info=EXC_INFO)
        time.sleep(1)
        return get_api_keys()

def load_history():
    """Загружает историю диалога из файла"""
    history = [{"role": "system", "content": f"{BASE_SYSTEM_PROMPT} \n [USERPROMPT] \n{USER_SYSTEM_PROMPT} \n[/USERPROMPT] \n[/INSTRUCTION]"}]
    for message in history_file["messages"]:
        if message["sender"] == "ai":
            model = f"Ответ от модели " + message.get("sender_model", "")
            history.append({"role": "assistant", "reasoning": message.get("reasoning", ""), "content": message.get("text", "") + f"{model: >{10+len(model)}}", "reasoning_details": message.get("reasoning_details", [])})
        elif message["sender"] == "user":
            history.append({"role": "user", "content": message.get("text", "")})
            if message.get("filename", ''): 
                filename = ""
                for file_num in range(len(message.get("filename", []))):
                    filename += f"{file_num + 1} - {message['filename'][file_num]}\n    {message['file'][file_num]}\n"
                history[-1]["content"] += f"\n[FILE]{filename[:-2]}[/FILE]"
        elif message["sender"] == "error":
            history.pop()
    logging.info(f"История диалога загружена. Всего сообщений: {len(history)}")
    return history

def save_history(response : list = [{}], model: str = "" ,progress = 0, order:int = 0):
    """Сохраняет историю диалога в файл"""
    text = ""
    answer = ""
    reasoning = ""
    reasoning_details = []
    order = -(len(MODELS) - order)
    if response is not None:
        for message in response:
            answer = message.get('content', '')
            reasoning = message.get('reasoning', '').strip()
            reasoning_details = message.get("reasoning_details", [])
            time_reasoning = message.get("time_reasoning", 0)
            if answer == "" and reasoning == "" and progress:
                text = f"[LOADING:{1+progress}]Создание запроса...[/LOADING]"
                break
            elif reasoning:
                text += f"[THOUGHTS: {round(time_reasoning)}]\n{reasoning}\n[/THOUGHTS]\n{answer}" 
            else:
                text += answer + " "

            if reasoning_details:
                for reasoning_details_index in reasoning_details:
                    if reasoning_details_index not in history_file["messages"][order]["reasoning_details"]:
                        history_file["messages"][order]["reasoning_details"].append(reasoning_details_index)
                
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

    history_file["messages"][order]["model"] = model
    history_file["messages"][order]["reasoning"] = reasoning
    history_file["messages"][order]["answer"] = answer
    history_file["messages"][order]['text'] = text
    history_file["messages"][order]['timestamp'] = datetime.now().isoformat()
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(history_file, f, ensure_ascii=False, indent=2)
    return True

def send_message_api(history: list, model: str = "", tools_send: int = 0, error_count: int = 0 , order:int = 0):
    api_data = get_api_keys()
    headers = {
        "Authorization": f"Bearer {api_data['key']}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model, 
        "transforms": ["middle-out"],
        "messages": history,
        "tool_choice": "auto",
        "usage": {"include": True},
        "stream": True,
    }
    if model in TOOL_SUPPORTED_MODELS:
        payload["tools"] = TOOLS_USE
    if REASONING_MAX>0:
        payload["reasoning"] = {"max_tokens": REASONING_MAX}
    else:
        payload["reasoning"] = {"exclude": True} 

    result[order].append({
        "reasoning": "",
        "reasoning_details": [],
        "time_reasoning": 0, 
        "content": "",
        "tool_calls": [],
        "fatal_error": False,
        "usage" : {}
    })

    tool_calls_buffer = {}
    reasoning_details_buffer = {}
    start_time_reasoning = time.time()
    end_time_reasoning = start_time_reasoning
    last_save_time = start_time_reasoning

    try:
        logging.info("Отправка сообщения в API...")
        if tools_send == 0 and error_count == 0:
            save_history(progress=50, order=order)

        response = requests.post(API_URL, headers=headers, json=payload, stream=True)

        try:
            response.raise_for_status()
            
            for line in response.iter_lines(8192):
                if line:
                    line_str = line.decode('utf-8')
                    stripped_line = line_str.strip()

                    if line_str.startswith(":"):
                        if result[order][0] and error_count == 0 and tools_send == 0 and not result[order][0]["content"] and not result[order][0]["reasoning"]:
                            save_history(progress=80, order=order)
                            result[order][0]["reasoning"] += " "
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

                            reasoning_details = delta.get("reasoning_details", [])
                            if reasoning_details:
                                for detail in reasoning_details:
                                    index = detail.get("index", 0)
                                    
                                    if index not in reasoning_details_buffer:
                                        reasoning_details_buffer[index] = {}
                                    
                                    for key_reasoning_details in detail.keys():
                                        detail_chunk = detail.get(key_reasoning_details, "")
                                        if reasoning_details_buffer[index].get(key_reasoning_details, ""):
                                            if not detail_chunk == reasoning_details_buffer[index].get(key_reasoning_details, ""):
                                                reasoning_details_buffer[index][key_reasoning_details] += detail_chunk
                                        else:
                                            reasoning_details_buffer[index][key_reasoning_details] = detail_chunk
                            
                            content = delta.get("content", "") 
                            reasoning = delta.get("reasoning", "") 
                            usage = parsed.get("usage", "")
                            if reasoning:
                                end_time_reasoning = time.time()
                                result[order][-1]["time_reasoning"] = round(end_time_reasoning - start_time_reasoning, 3)
                                result[order][-1]["reasoning"] += reasoning
                            if content:
                                result[order][-1]["content"] += content
                            if usage:
                                result[order][-1]["usage"] = usage
                            if time.time() - last_save_time >= 0.25:
                                last_save_time = time.time()
                                save_history(response=result[order], order=order)

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
            logging.error(f"Ошибка при чтении потока: {stream_error}", exc_info=EXC_INFO)
            raise requests.exceptions.RequestException(f"Ошибка при чтении потока: {stream_error}") from stream_error
                                    
        result[order][-1]["reasoning_details"] = [reasoning_details_buffer[k] for k in sorted(reasoning_details_buffer.keys())]
        result[order][-1]["tool_calls"] = [tool_calls_buffer[k] for k in sorted(tool_calls_buffer.keys())]
        logging.info(f"Ответ от API успешно получен. {result[order][-1]}")
        
        logging.info(f"История сохранена. {save_history(response=result[order], order=order)}")
        
        if result[order][-1]["tool_calls"]:
            temp_result = result[order].copy()
            temp_result[-1] = {"content": temp_result[-1].get("content", "") + "\n[TOOL_CALLING]Ожидание ответа инструментов...[/TOOL_CALLING]",
                               "reasoning": temp_result[-1].get("reasoning", ""),
                               "tool_calls": temp_result[-1].get("tool_calls", ""),
                               "reasoning_details": temp_result[-1].get("reasoning_details", []),
                               "time_reasoning": temp_result[-1].get("time_reasoning", 0), 
                               "usage" : temp_result[-1].get("usage", {}),
                               "fatal_error": False
                               }
            save_history(response=temp_result, order=order)

        follow_message = process_tool_calls(
            result=result[order],
            messages=history
        )

        if follow_message: return send_message_api(history=follow_message, tools_send=1) 
        
        result[order][0]["fatal_error"] = False
        return result[order]

    except requests.exceptions.RequestException as e:
        err = str(e)
        error_answer = f"Ошибка сети при запросе: {err}\n"
        response_obj = e.response 
        logging.info(f"Сообщения с ошибкой {response.json()}")
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
                api_keys_p.get("p_key", api_keys_p).append(api_keys_p.get("p_key", api_keys_p).pop(0))
                with open(KYES_PATH, "w", encoding="utf-8") as f:
                    json.dump(api_keys_p, f, ensure_ascii=False, indent=4)
        elif "502" in err:
            error_answer += "К сожалению, сервера сейчас перегружены. Попробуйте позже или выберите другую модель."
        elif "404" in err:
            error_answer += "К сожалению, выбранная вами модель больше не поддерживается. Пожалуйста, выберите другую."
        if error_count >= 3: 
            result[order][0]["fatal_error"] = True
            result[order][-1]["fatal_error_message"] = error_answer
            return result
        logging.warning(f"Пробуем еще раз так как может быть временная ошибка")
        result_retry = send_message_api(history=history, error_count=(error_count + 1), tools_send=tools_send)
        return result_retry

    except KeyError as ke:
        logging.error(f"Неверный формат ответа API: {response.text if 'response' in locals() else 'response не определён'}, ошибка: {ke}", exc_info=EXC_INFO)
        result[order][0]["fatal_error"] = True
        result[order][-1]["fatal_error_message"] = f"Неверный формат ответа API: {ke}"
        return result

    except Exception as e:
        logging.error(f"Неожиданная ошибка в основном блоке: {e}", exc_info=EXC_INFO)
        result[order][0]["fatal_error"] = True
        result[order][-1]["fatal_error_message"] = f"Неожиданная ошибка: {e}"
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
        
        if result[order][0].get("fatal_error") and error_count == 0:
            error_answer = result[order][-1].get("fatal_error_message", "Произошла ошибка.")
            history_file["messages"][-(len(MODELS) - order)] = {
                'id': int(time.time() * 1000),  # Уникальный ID
                'sender': 'error',
                'sender_model': model,
                'text': error_answer,
                'timestamp': datetime.now().isoformat()
            }
        

def main():
    global result, history_file
    try:
        result = {order: [] for order in range(len(MODELS))} 
        
        history = load_history()
        
        for order in range(len(MODELS)):
            history_file["messages"].append({
                'id': int(time.time() * 1000) + order,
                'sender': 'ai',
                'sender_model': MODELS_NAMES.get("model_name_by_id", {}).get(MODELS[order], ""),
                "reasoning": "",
                "reasoning_details": [],
                "answer": "",
                'text': "",
                'timestamp': datetime.now().isoformat()
            })
        

        def send_message_api_fit(order: int):
            """Wrapper с правильными аргументами"""
            save_history(progress=25, order=order)
            model = MODELS[order]
            logging.info(f"Вызов send_message_api: модель {model} (order={order})")
            return send_message_api(history=history, model=model, order=order)
        
        with ThreadPoolExecutor(max_workers=min(50, len(MODELS))) as executor:
            futures = {
                executor.submit(send_message_api_fit, order): order 
                for order in range(len(MODELS))
            }
            
            for future in as_completed(futures, timeout=60):
                order = futures[future]
                
                try:
                    answer = future.result(timeout=20)
                    result[order] = answer
                    if answer[-1].get("fatal_error"):
                        raise ValueError("Fatal error модели")
                    if answer:
                        if not answer[-1].get('content'):
                            answer[-1]['content'] = "*треск сверчков*"
                        logging.info(f"Модель {order} готова")
                    else:
                        raise ValueError("Fatal error")
                        
                except TimeoutError:
                    logging.error(f"Timeout модели {order}")
                    result[order] = [{"fatal_error": True, "content": "Timeout"}]
                except Exception as e:
                    logging.error(f"Ошибка модели {order}: {e}", exc_info=EXC_INFO)
        
        logging.info("Все модели завершены!")
        
    except KeyboardInterrupt:
        logging.info("Завершено принудительно")
    except Exception as e:
        for _ in range(len(MODELS)):
            del history_file["messages"][-1]
        history_file["messages"].append({
            'id': int(time.time() * 1000),  # Уникальный ID
            'sender': 'error',
            'sender_model': "error",
            'text': "⚠️При обработке запроса возникла ошибка⚠️\nЭто могло произойти из-за:\n❌Неработоспособности ключей API\n❌Ошибки в коде программы\n\nЕсли Вам срочно необходима помощь с решением проблемы, обратитесь в тех поддержку (смотрите раздел 'О приложении'). В противном случае попробуйте создать новый чат, перегенерировать текущий, или дождаться решения проблемы в новом обновлении.",
            'timestamp': datetime.now().isoformat()
        })
        logging.error(f"Критическая ошибка: {e}")
    finally:
        # Финальное сохранение
        logging.info("api_sender.pyw завершил работу!")

if __name__ == "__main__":
    main()
