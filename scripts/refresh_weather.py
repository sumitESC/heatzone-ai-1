import urllib.request

req = urllib.request.Request('http://127.0.0.1:5000/api/weather/refresh', method='POST')
req.add_header('Content-Type', 'application/json')
resp = urllib.request.urlopen(req)
print(resp.read().decode())
