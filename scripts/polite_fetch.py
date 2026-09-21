# Downloads the filings named in knowledge/matter.manifest.json into .cache/recap, waiting exactly
# as long as CourtListener asks between requests. Run in the background: python3 scripts/polite_fetch.py
import json, os, time, urllib.request

token = os.environ["COURTLISTENER_TOKEN"]
manifest = json.load(open("knowledge/matter.manifest.json"))["documents"]
# The escrow agreement, the amendment that sets the condition, and the pretrial stipulations first.
first = {228: 0, 264: 1, 126: 2}
todo = sorted(
    [d for d in manifest if not os.path.exists(f".cache/recap/{d['recapId']}.json")],
    key=lambda d: first.get(d["entry"], 9),
)
for doc in todo:
    url = f"https://www.courtlistener.com/api/rest/v4/recap-documents/{doc['recapId']}/?format=json"
    while True:
        try:
            request = urllib.request.Request(url, headers={"Authorization": f"Token {token}"})
            body = json.load(urllib.request.urlopen(request, timeout=60))
            json.dump(body, open(f".cache/recap/{doc['recapId']}.json", "w"))
            print(doc["entry"], doc["attachment"], "ok", len(body.get("plain_text") or ""), flush=True)
            break
        except urllib.error.HTTPError as error:
            if error.code != 429:
                print(doc["entry"], doc["attachment"], "http", error.code, flush=True)
                break
            wait = int(error.headers.get("retry-after") or 300) + 15
            print("throttled; waiting", wait, "s as asked", flush=True)
            time.sleep(wait)
    time.sleep(45)
print("done", flush=True)
