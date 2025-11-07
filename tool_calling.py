from datetime import datetime
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

# Описание инструментов — только те поля, которые должны попасть в payload['tools']
# (description + parameters в формате JSON Schema)
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
        return 

    tools_messages = []
    for i in range(len(tool_calls)):
        call = tool_calls[i]
        call_id = call.get("id")
        func_spec = call.get("function", {})
        func_name = func_spec.get("name")
        args_raw = func_spec.get("arguments", "{}")
        try:
            func_args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw # Проверить всегда ли str ?
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
    logging.info(tools_messages)

    followup_payload = {
        "model": model,
        "messages": messages + [choice_msg] + tools_messages,
        "tools": tools,  # обязательно повторно
        "usage": {"include": True}
    }
    
    try:
        logging.info("Отправка сообщения в API с инструментами...")
        resp2 = requests.post(api_url, headers=headers, json=followup_payload, timeout=30)
        resp2.raise_for_status()
        final = resp2.json()
        return final, tools_messages
    except Exception as e:
        logging.error(f"Ошибка при отправке follow-up запроса: {e}")
        return {"error": str(e)}

