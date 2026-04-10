import urllib.request
import json

data = json.loads(urllib.request.urlopen('http://127.0.0.1:5000/api/datasets/overview').read().decode())
print(f"NDVI: {data['avgNDVI']}")
print(f"NDBI: {data['avgNDBI']}")
print(f"Emission: {data['avgEmissionIndex']}")
