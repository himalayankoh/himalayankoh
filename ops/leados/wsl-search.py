"""Bounded bridge request; token is received through stdin, never process arguments."""
import json
import sys
import urllib.parse
import urllib.request

try:
    payload = json.loads(sys.stdin.read(4096))
    query = str(payload.get("query", "")).strip()
    token = str(payload.get("token", ""))
    if not query or len(query) > 500 or len(token) < 32:
        raise ValueError("Invalid bounded query")
    url = "http://127.0.0.1:8890/search?" + urllib.parse.urlencode(
        {"q": query, "format": "json", "language": "en-US", "safesearch": "1"}
    )
    request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError("Response limit")
    data = json.loads(raw)
    if not isinstance(data.get("results"), list):
        raise ValueError("Invalid result shape")
    print(json.dumps(data))
except Exception:
    print(json.dumps({"error": "Private WSL search request failed."}))
    sys.exit(1)
