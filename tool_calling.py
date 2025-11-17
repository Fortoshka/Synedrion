from datetime import datetime
from pathlib import Path
import random
import threading
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import as_completed
from bs4 import BeautifulSoup
import json
import logging
import time
import uuid
from typing import Dict, Any, List
import json
import os
import requests

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

TOOLS: Dict[str, Dict[str, Any]] = {
    "get_exchange_rate": {
        "description": "Get exchange rate from base currency to target currency (default RUB).",
        "parameters": {
            "type": "object",
            "properties": {
                "base": {"type": "string", "description": "Base currency, e.g. USD"},
                "target": {"type": "string", "description": "Target currency, default RUB"}
            },
            "required": ["base"]
        }
    },
    "get_weather": {
        "description": "Получить погоду с позапозавчера до недели вперед от текуйще даты. Вы можете указать название города (на английском языке) или координаты, но все параметры необязательны. Если параметры не указаны, функция автоматически использует текущее местоположение пользователя.",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "Name of the city in English, e.g., 'Moscow'. Optional if lat and lon are provided."},
                "lat": {"type": "number", "description": "Latitude coordinate. Optional if city is provided or for default location."},
                "lon": {"type": "number", "description": "Longitude coordinate. Optional if city is provided or for default location."}
            },
            "required": []
        }
    },
    "summarize_url": {
        "description": "Загружает веб-страницу по URL и возвращает краткое содержание текста.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL страницы"},
                "max_chars": {"type": "integer", "description": "Максимальный размер текста для передачи модели", "default": 8000}
            },
            "required": ["url"]
        }
    },
    "search_web":{
        "description": "Выполняет интернет-поиск по запросу через Google и возвращается данные со страниц",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Поисковый запрос (обязательный)"},
                "num_results": {"type": "integer", "description": "Желаемое количество результатов", "default": 5}
            },
            "required": ["query"]
        }
    },
    "list_files":{
        "description": "Получить список файлов и папок в указанной директории (рекурсивно). Поддерживает фильтры по расширению и глубине.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Путь к директории (относительный или абсолютный). По умолчанию текущая директория '.'"},
                "recursive": {"type": "boolean", "description": "Рекурсивно ли искать файлы в подпапках. По умолчанию True", "default": True},
                "extensions": {"type": "array", "items": {"type": "string"}, "description": "Фильтр по расширениям файлов, напр. ['.py', '.json']. Пустой = все файлы"},
                "max_depth": {"type": "integer", "description": "Максимальная глубина рекурсии (0 = без рекурсии). По умолчанию 5", "default": 5},
                "show_size": {"type": "boolean", "description": "Показывать размер файлов в байтах", "default": True},
                "max_files": {"type": "integer", "description": "Максимальное количество файлов в ответе (для производительности)", "default": 1000}
            },
            "required": []
        }
    },
    "read_file":{
        "description": "Прочитать содержимое текстового файла. Поддерживает кодировки UTF-8, CP1251.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Полный путь к файлу (обязательный)"},
                "max_chars": {"type": "integer", "description": "Максимальное количество символов для чтения (по умолчанию 50000)", "default": 50000},
                "encoding": {"type": "string", "description": "Кодировка файла: 'utf-8', 'cp1251', 'auto'. По умолчанию 'auto'", "default": "auto"}
            },
            "required": ["path"]
        }
    },
    "write_file":{
        "description": "Записать или перезаписать содержимое файла. Создаёт директории если нужно.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Полный путь к файлу (обязательный)"},
                "content": {"type": "string", "description": "Содержимое файла (обязательное)"},
                "encoding": {"type": "string", "description": "Кодировка: 'utf-8', 'cp1251'. По умолчанию 'utf-8'", "default": "utf-8"},
                "backup": {"type": "boolean", "description": "Создать бэкап оригинала (.bak). По умолчанию True", "default": True}
            },
            "required": ["path", "content"]
        }
    }
}


def get_coordinates_by_ip() -> dict:
    try:
        res = requests.get("https://ipinfo.io/json", timeout=5)
        data = res.json()
        lat, lon = (None, None)
        if "loc" in data:
            lat, lon = map(float, data["loc"].split(","))
        return {
            "city": data.get("city"),
            "region": data.get("region"),
            "country": data.get("country"),
            "lat": lat,
            "lon": lon
        }
    except Exception as e:
        return {"error": str(e)}
    
def get_coordinates_by_city(city_name) -> dict:
    """
    Получаем координаты города через геокодинг Open-Meteo
    """
    url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {"name": city_name, "count": 1}
    
    try:
        response = requests.get(url, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()
        if "results" in data and len(data["results"]) > 0:
            loc = data["results"][0]
            return {"lat": loc["latitude"], "lon":loc["longitude"], "city": loc.get("name"), "country": loc.get("country")}
        else:
            return {"lat": None, "lon": None, "city": None, "country": None}
    except requests.RequestException as e:
        logging.error(f"Ошибка при геокодинге: {e}")
        return {"lat": None, "lon": None, "city": None, "country": None}
    
def get_weather(city=None, lat=None, lon=None) -> dict:
    """
    Получаем погоду по городу или координатам
    """
    if city and (lat is None or lon is None):
        coordinates = get_coordinates_by_city(city)
        lat = coordinates.get("lat", None)
        lon = coordinates.get("lon", None)
        city = coordinates.get("city", "Unknown")
        country = coordinates.get("country", "Unknown")
        if lat is None:
            return {"error": f"Город '{city}' не найден"}
    elif lat is not None and lon is not None:
        city, country = "Unknown", "Unknown"
    else:
        if lat is None and lon is None:
            coordinates = get_coordinates_by_ip()
            lat = coordinates.get("lat", None)
            lon = coordinates.get("lon", None)
            city = coordinates.get("city", "Unknown")
            country = coordinates.get("country", "Unknown")
        else:
            return {"error": "Не указаны координаты или город"}

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current_weather": True,
        "forecast_days": 7,
        "past_days": 2,
        "timezone": "auto",
        "daily": [
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "windspeed_10m_max"
        ],
        "hourly": [
            "temperature_2m",
            "relativehumidity_2m",
            "precipitation",
            "weathercode",
            "windspeed_10m"
        ],
    }

    try:
        response = requests.get(url, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()
        return data
    except requests.RequestException as e:
        logging.error(f"Ошибка при получении погоды: {e}")
        return {"error": str(e)}
    
def summarize_url(url: str, max_chars: int = 64_000):
    """
    Загружает страницу по URL, извлекает текст без HTML и возвращает его
    (обрезая по max_chars для LLM).
    """
    try:
        response = requests.get(url, timeout=10, headers={})
        response.raise_for_status()
    except Exception as e:
        return {"error": f"Failed to load URL: {e}"}

    # Парсим HTML
    soup = BeautifulSoup(response.text, "html.parser")

    # Удаляем скрипты/стили
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    # Основной текст
    text = soup.get_text(separator="\n")

    # Чистим лишние пробелы и пустые строки
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line]  # удаляем пустые строки
    clean_text = "\n".join(lines)

    # Заголовок страницы
    title = soup.title.string.strip() if soup.title and soup.title.string else ""

    # Ограничение длины
    if len(clean_text) > max_chars:
        clean_text = clean_text[:max_chars]

    return {
        "title": title,
        "url": url,
        "length": len(clean_text),
        "content": clean_text
    }

def search_web(query: str, num_results: int = 5):
    search_web_url = "https://app.zenserp.com/api/v2/search"
    results = {query : []}
    page = 0
    counter_error = 0
    keys = [
        "bc4166d0-bcf0-11f0-bd27-15f0f972b3f0", "a5eccbc0-bd2b-11f0-9490-859bf46addc8",
        "20966990-bd2c-11f0-b5c1-31bbe782f6fc", "48565440-bd2c-11f0-9395-df2f5d1ff18c",
        "7577b6b0-bd2c-11f0-864b-6be3e5a4bd40", "989c20a0-bd2c-11f0-864c-4ff4f022ba18",
        "bad6a800-bd2c-11f0-856d-1736cd4f883d", "ee1545c0-bd2c-11f0-adf6-8500a34c424a",
        "16254d90-bd2d-11f0-8474-b1d20fcc8901", "419bc3b0-bd2d-11f0-be34-d1974f318cee"
    ]

    def worker(url, max_chars=16000):
        # logging.info(f"Вызов функции: summarize_url с аргументами {url}")
        return summarize_url(url=url, max_chars=max_chars)

    while len(results[query]) < num_results:
        page += 1
        params = (
            ("q", query),
            ("device", "desktop"),
            ("gl", "RU"),
            ("hl", "ru"),
            ("num", "10"),
            ("page", page)
        )
        headers = {"apikey": random.choice(keys)}
        # logging.info(f"Получаем сайты с {page} страницы")

        try:
            response = requests.get(search_web_url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            data = response.json().get("organic", [])
        except Exception as e:
            if page >= 0: page -= 1
            counter_error += 1
            if counter_error >= 10: break 
            logging.error(f"Ошибка получения страницы {page}: {e} при помощи ключа {headers}")
            continue
        with ThreadPoolExecutor(max_workers=50) as executor:
            futures = [executor.submit(worker, item.get("url")) for item in data]

            for future in as_completed(futures, timeout=30):  
                try:
                    website_info = future.result(timeout=20) 
                    if website_info and website_info.get("title", ""):
                        results[query].append(website_info)
                        url = "unknown"  
                        logging.info(f"Добавлен результат. Всего: {len(results)}")
                        if len(results[query]) >= num_results:
                            break 
                except Exception as e:
                    logging.error(f"Ошибка в summarize: {e}")

        if len(results[query]) >= num_results:
            break

    logging.info(f"search_web завершён: {len(results[query])} результатов")
    return results

def get_exchange_rate(base: str = "USD", target: str = "RUB") -> dict:
    logging.info(base)
    base = base.upper().strip()
    target = target.upper().strip() if target else "RUB"
    url = f"https://v6.exchangerate-api.com/v6/b39e1ee7937abd4ff4039498/pair/{base}/{target}"
    logging.info(f"get_exchange_rate оброшаеться к {url}")
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        logging.info(f"get_exchange_rate: получил ответ: {data}")
        rate = data.get("conversion_rate", None)
        fetched_at = data.get("time_last_update_unix")
        if isinstance(fetched_at, (int,float)):
            try:
                fetched_at = datetime.utcfromtimestamp(int(fetched_at)).isoformat()
            except:
                fetched_at = None
        return {"base": base, "target": target, "rate": rate, "fetched_at": fetched_at}
    except Exception as e:
        logging.error(f"get_exchange_rate: request error {e}")
        return {"base": base, "target": target, "rate": None, "fetched_at": None, "error": str(e)}

def safe_listdir(path: str, recursive: bool = True, extensions: List[str] = None, max_depth: int = 3, show_size: bool = True, max_files: int = 1000) -> Dict[str, Any]:
    """Безопасное рекурсивное получение списка файлов с фильтрами."""
    result = {"files": [], "dirs": [], "total_files": 0, "total_dirs": 0, "error": None}
    
    try:
        base_path = Path(path).resolve()
        if not base_path.is_dir():
            return {"error": f"Путь '{path}' не является директорией"}
        
        extensions = [ext.lower() for ext in (extensions or [])]
        
        def scan_dir(current_path: Path, depth: int = 0):
            if depth > max_depth or result["total_files"] >= max_files:
                return
            
            try:
                items = list(current_path.iterdir())
                logging.info(items)
                files_in_dir = []
                dirs_in_dir = []
                
                for item in items:
                    if result["total_files"] >= max_files:
                        break
                    
                    if item.is_file():
                        if extensions and item.suffix.lower() not in extensions:
                            continue
                        
                        file_info = {
                            "name": item.name,
                            "path": str(item.relative_to(base_path)),
                            "full_path": str(item),
                            "size": item.stat().st_size if show_size else None,
                            "size_mb": round(item.stat().st_size / (1024*1024), 2) if show_size else None,
                            "modified": item.stat().st_mtime
                        }
                        files_in_dir.append(file_info)
                        result["total_files"] += 1
                        
                    elif item.is_dir() and recursive:
                        dirs_in_dir.append({
                            "name": item.name,
                            "path": str(item.relative_to(base_path))
                        })
                        result["total_dirs"] += 1
                        scan_dir(item, depth + 1)  # Рекурсия
                
                result["files"].extend(files_in_dir)
                result["dirs"].extend(dirs_in_dir)
                
            except PermissionError:
                logging.warning(f"Нет доступа к {current_path}")
            except Exception as e:
                logging.error(f"Ошибка сканирования {current_path}: {e}")
        
        scan_dir(base_path)
        result["files"].sort(key=lambda f: f["name"].lower())
        result["dirs"].sort(key=lambda d: d["name"].lower())
        
        return result
        
    except Exception as e:
        return {"error": f"Ошибка: {str(e)}"}

def list_files(path: str = ".", recursive: bool = True, extensions: List[str] = None, max_depth: int = 5, show_size: bool = True, max_files: int = 1000) -> Dict[str, Any]:
    """Инструмент: список файлов."""
    logging.info(f"list_files: path={path}, recursive={recursive}, extensions={extensions}, max_depth={max_depth}")
    return safe_listdir(path, recursive, extensions, max_depth, show_size, max_files)

def read_file(path: str, max_chars: int = 50000, encoding: str = "auto") -> Dict[str, Any]:
    """Инструмент: чтение файла."""
    try:
        file_path = Path(path).resolve()
        if not file_path.is_file():
            return {"error": f"Файл '{path}' не найден или не является файлом"}
        
        encodings = ['utf-8']
        if encoding == "cp1251":
            encodings = ['cp1251']
        elif encoding == "auto":
            encodings = ['utf-8', 'cp1251', 'latin1']
        
        content = ""
        for enc in encodings:
            try:
                with open(file_path, 'r', encoding=enc) as f:
                    content = f.read(max_chars)
                    if len(content) >= max_chars:
                        content += f"\n... (обрезано до {max_chars} символов)"
                    break
            except UnicodeDecodeError:
                continue
            except Exception:
                continue
        
        if not content:
            return {"error": "Не удалось прочитать файл ни одной из кодировок"}
        
        return {
            "path": str(file_path),
            "filename": file_path.name,
            "size": file_path.stat().st_size,
            "content": content,
            "encoding_used": enc,
            "truncated": len(content) >= max_chars
        }
        
    except Exception as e:
        logging.error(f"read_file error: {e}")
        return {"error": f"Ошибка чтения '{path}': {str(e)}"}

def write_file(path: str, content: str, encoding: str = "utf-8", backup: bool = True) -> Dict[str, Any]:
    """Инструмент: запись файла."""
    try:
        file_path = Path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)  # Создаём директории
        
        if backup and file_path.exists():
            backup_path = file_path.with_suffix(file_path.suffix + '.bak')
            file_path.replace(backup_path)
            logging.info(f"Создан бэкап: {backup_path}")
        
        with open(file_path, 'w', encoding=encoding) as f:
            f.write(content)
        
        return {
            "success": True,
            "path": str(file_path),
            "size": len(content),
            "message": f"Файл успешно записан ({len(content)} символов)"
        }
        
    except Exception as e:
        logging.error(f"write_file error: {e}")
        return {"error": f"Ошибка записи '{path}': {str(e)}"}


# Регистр обработчиков здесь:
TOOL_HANDLERS = {
    "get_exchange_rate": get_exchange_rate,
    "get_weather": get_weather,
    "summarize_url": summarize_url,
    "search_web": search_web,
    "list_files": list_files,
    "read_file": read_file,
    "write_file": write_file
}


def execute_tool_call(call):
    """
    Выполняет один tool_call и возвращает готовое tool-сообщение.
    """
    call_id = call.get("id")
    func_spec = call.get("function", {})
    func_name = func_spec.get("name")
    args_raw = func_spec.get("arguments", "{}")
    try:
        func_args = json.loads(args_raw)
    except Exception:
        func_args = {}
    logging.info(f"Вызов функции: {func_name} с аргументами {func_args}")
    # Проверяем наличие обработчика
    handler = TOOL_HANDLERS.get(func_name)
    if handler:
        try:
            tool_result = handler(**func_args)
        except Exception as e:
            tool_result = {"error": f"Ошибка при выполнении {func_name}: {e}"}
            logging.error(tool_result["error"])
    else:
        tool_result = {"error": f"Неизвестная функция: {func_name}"}
        logging.warning(tool_result["error"])
    logging.info(f"Инструмент выполнен успешно. Результат: {tool_result}")
    return {
        "role": "tool",
        "tool_call_id": call_id,
        "content": json.dumps(tool_result, ensure_ascii=False)
    }

def process_tool_calls(result, messages):
    """
    Универсальная обработка вызовов инструментов от модели (теперь параллельно).
    """
    choice_msg = {"role": "assistant", "reasoning": "", "content": ""}
    for message in result:
        choice_msg["reasoning"] = message.get("reasoning", "")
        choice_msg["content"] = message.get("content", "")
    
    tool_calls = result[-1].get("tool_calls")
    if not tool_calls:
        logging.info("Модель не вызвала инструмент.")
        return []
    # Параллельное выполнение всех tool_calls
    tools_messages = []
    with ThreadPoolExecutor(max_workers=len(tool_calls)) as executor:
        # Submit все задачи в исходном порядке
        futures = [executor.submit(execute_tool_call, call) for call in tool_calls]
        
        # Собираем результаты в том же порядке (синхронно ждём все)
        for future in futures:
            try:
                tool_msg = future.result()
                tools_messages.append(tool_msg)
            except Exception as e:
                logging.error(f"Ошибка в future: {e}")
                # Опционально: добавить сообщение об ошибке
                tools_messages.append({
                    "role": "tool",
                    "tool_call_id": "unknown",
                  "content": json.dumps({"error": f"Future error: {e}"})
                })
                
    return messages + [choice_msg] + tools_messages
    

