import json
import requests

url = "https://openrouter.ai/api/v1/models"
headers = {"Authorization": "Bearer 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"}

models = {"tools": [],
          "models": {},
          "model_id_by_name": {},
          "model_name_by_id": {}}

response = requests.get(url, headers=headers)
response.raise_for_status()
response = response.json()["data"]
for model_data_id in range(len(response)):
    model_data = response[model_data_id]
    if model_data["pricing"]["prompt"] == "0":
        model_name = model_data["name"].replace("(free)", "")
        model_id = model_data["id"]
        models["models"][model_name] = {
            "id": model_data_id,
            "id_model":  model_id,
            "supported_parameters": model_data["supported_parameters"],
            "description": model_data["description"],
            "context_length": model_data["context_length"],
            "input_modalities": model_data["architecture"]["input_modalities"],
        }
        if "tools" in model_data["supported_parameters"]:
            models["tools"].append(model_id)
        
        models["model_id_by_name"][model_name] = model_id
        models["model_name_by_id"][model_id] = model_name

with open("models.json", "w", encoding="UTF-8") as f:
    json.dump(models, f, ensure_ascii=False, indent=2)
