import requests
import json
import os

def load_json_keys():
    """Загрузка JSON файла из конфигурационной директории"""
    file_path =  os.path.join(os.path.dirname(os.path.abspath(__file__)), 'api_keys.json')

    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

p_keys = load_json_keys()
all_keys_del = 0
for key in p_keys:
    p_url = "https://openrouter.ai/api/v1/keys"
    headers = {"Authorization": f"Bearer {key}"}

    response_list_keys = requests.get(p_url, headers=headers).json()
    print(len(response_list_keys["data"]))

    for del_key in response_list_keys["data"]:
        all_keys_del +=1
        del_url = f"https://openrouter.ai/api/v1/keys/{del_key["hash"]}"
        headers = {"Authorization": f"Bearer {key}"}

        response = requests.delete(del_url, headers=headers)
        print(response.json())
print(all_keys_del)