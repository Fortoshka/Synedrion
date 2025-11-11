import requests
import json

question = "Отвечай на русском Вычисли 25 * 4 + 10"

calculator_tool = {
    'type': 'function',
     "function":{
    'name': 'calculate',
    'description': 'Выполнить математические вычисления',
    'parameters': {
        'type': 'object',
        'properties': {
            'expression': {
                'type': 'string',
                'description': 'Математическое выражение для вычисления',
            },
        },
        'required': ['expression'],
     }},
}

url = "https://openrouter.ai/api/v1/chat/completions"
headers = {
  "Authorization": f"Bearer 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",
  "Content-Type": "application/json"
}

payload = {
  "model":     "minimax/minimax-m2:free",
  "messages": [{"role": "user", "content": question}],
  "stream": True,
  "reasoning": {"max_tokens": 1000 },
  'tools': [calculator_tool],
  "tool_choice": "auto",
}

buffer = ""
data_response ={"content": ""}
with requests.post(url, headers=headers, json=payload, stream=True) as r:
    for line in r.iter_lines():
        if line:
            line_str = line.decode('utf-8')
            if line_str.startswith('data: '):
                data = line_str[6:]
                if data == '[DONE]':
                    break
                try:
                    parsed = json.loads(data)
                    
                    print(parsed)
                        
                except json.JSONDecodeError:
                    continue
print()
print(data_response)