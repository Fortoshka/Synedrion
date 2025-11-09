keys = [
    "bc4166d0-bcf0-11f0-bd27-15f0f972b3f0",
    "a5eccbc0-bd2b-11f0-9490-859bf46addc8",
    "20966990-bd2c-11f0-b5c1-31bbe782f6fc",
    "48565440-bd2c-11f0-9395-df2f5d1ff18c",
    "7577b6b0-bd2c-11f0-864b-6be3e5a4bd40",
    "989c20a0-bd2c-11f0-864c-4ff4f022ba18",
    "bad6a800-bd2c-11f0-856d-1736cd4f883d",
    "ee1545c0-bd2c-11f0-adf6-8500a34c424a",
    "16254d90-bd2d-11f0-8474-b1d20fcc8901",
    "419bc3b0-bd2d-11f0-be34-d1974f318cee"
    ]

import random
import requests
print(random.choice(keys))
headers = { 
  "apikey": random.choice(keys)}

params = (
   ("q","vivo s 30 pro mini"),
   ("device","desktop"),
   ("gl","RU"),
   ("hl","ru"),
   ("num","100"),
   ("page","2"),

)

response = requests.get('https://app.zenserp.com/api/v2/search', headers=headers, params=params);
print(response.text)