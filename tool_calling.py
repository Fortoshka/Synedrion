from datetime import datetime
import random
import re
from bs4 import BeautifulSoup
import json
import logging
import time
import uuid
from typing import Dict, Any
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
        "description": "Get current weather. You can provide the city name (in English) or coordinates, but all parameters are optional. If no parameters are given, the function will automatically use the user's current location.",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "Name of the city in English, e.g., 'Moscow'. Optional if lat and lon are provided."
                },
                "lat": {
                    "type": "number",
                    "description": "Latitude coordinate. Optional if city is provided or for default location."
                },
                "lon": {
                    "type": "number",
                    "description": "Longitude coordinate. Optional if city is provided or for default location."
                }
            },
            "required": []
        }
    },
    "summarize_url": {
        "description": "Загружает веб-страницу по URL и возвращает краткое содержание текста.",
        "parameters": {
            "type": "object",
            "properties": {
            "url": {
                    "type": "string",
                    "description": "URL страницы"
                },
                "max_chars": {
                    "type": "integer",
                    "description": "Максимальный размер текста для передачи модели",
                    "default": 8000
                }
            },
            "required": ["url"]
        }
    },
    "search_web":{
        "description": "Выполняет интернет-поиск по запросу через Google и возвращается данные со страниц",
        "parameters": {
            "type": "object",
            "properties": {
            "query": {
                "type": "string",
                "description": "Поисковый запрос (обязательный)"
                },
                "num_results": {
                    "type": "integer",
                    "description": "Желаемое количество результатов",
                    "default": 5
                }
            },
            "required": ["query"]
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
        "timezone": "auto"
    }

    try:
        response = requests.get(url, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()
        weather = data.get("current_weather", {})
        return {
            "city": city,
            "country": country,
            "temperature": weather.get("temperature"),
            "windspeed": weather.get("windspeed"),
            "winddirection": weather.get("winddirection"),
            "weathercode": weather.get("weathercode"),
            "time": weather.get("time")
        }
    except requests.RequestException as e:
        logging.error(f"Ошибка при получении погоды: {e}")
        return {"error": str(e)}
    
def summarize_url(url: str, max_chars: int = 64_000):
    """
    Загружает страницу по URL, извлекает текст без HTML и возвращает его
    (обрезая по max_chars для LLM).
    """
    try:
        response = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0"
        })
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
        "length": len(clean_text),
        "content": clean_text
    }

def search_web(query: str, num_results=5):
    url = "https://app.zenserp.com/api/v2/search"
    results = []
    page = 0
    keys = ["bc4166d0-bcf0-11f0-bd27-15f0f972b3f0","a5eccbc0-bd2b-11f0-9490-859bf46addc8","20966990-bd2c-11f0-b5c1-31bbe782f6fc","48565440-bd2c-11f0-9395-df2f5d1ff18c","7577b6b0-bd2c-11f0-864b-6be3e5a4bd40",
            "989c20a0-bd2c-11f0-864c-4ff4f022ba18","bad6a800-bd2c-11f0-856d-1736cd4f883d","ee1545c0-bd2c-11f0-adf6-8500a34c424a","16254d90-bd2d-11f0-8474-b1d20fcc8901","419bc3b0-bd2d-11f0-be34-d1974f318cee"
            ]

    while len(results) <= num_results:
        page += 1
        params = (
            ("q",query),
            ("device","desktop"),
            ("gl","RU"),
            ("hl","ru"),
            ("num","100"),
            ("page",page)
        )
        headers = {"apikey": random.choice(keys)}
        logging.info(f"Получаем сайты с {page} страницы")
        data = requests.get(url, headers=headers, params=params).json().get("organic", [])

        for item in data:
            logging.info(f"Вызов функции:summarize_url с аргументами {item.get("url")}")
            website_info = summarize_url(url=item["url"], max_chars=8000)
            if website_info.get("title", ""):
                results.append(website_info)
            
    logging.info(f"Получен ответ от {len(results)}")
    return results

def get_exchange_rate(base: str, target: str = "RUB") -> dict:
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


# Регистр обработчиков здесь:
TOOL_HANDLERS = {
    "get_exchange_rate": get_exchange_rate,
    "get_weather": get_weather,
    "summarize_url": summarize_url,
    "search_web": search_web
}


def process_tool_calls(result, messages, tools, headers, api_url, model):
    """
    Универсальная обработка вызовов инструментов от модели
    - result: JSON ответ модели
    - messages: история сообщений
    - tools: список описаний инструментов
    - headers, api_url, model: для follow-up запроса
    """
    choice_msg = result.get("choices", [{}])[0].get("message", {})
    tool_calls = choice_msg.get("tool_calls")

    if not tool_calls:
        logging.info("Модель не вызвала инструмент.")
        return []

    tools_messages = []
    for i in range(len(tool_calls)):
        call = tool_calls[i]
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

        tools_messages = tools_messages + [
            {
                "role": "tool",
                "tool_call_id": call_id,
                "content": json.dumps(tool_result, ensure_ascii=False)
            }
        ]

        logging.info(f"Инструмент выполнен успешно. Результат: {tool_result}")

    return messages + [choice_msg] + tools_messages
    

