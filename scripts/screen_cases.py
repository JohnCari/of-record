# Finds District of Colorado contract cases whose exhibits, affidavits and depositions are actually
# in the RECAP archive, then downloads the filings of the best ones into .cache/recap/<docket>/.
# Waits exactly as long as CourtListener asks, so it can run overnight:
#   python3 scripts/screen_cases.py 2           (prepare the two best candidates)
# Candidates are the dockets listed below, screened in order. A case qualifies when at least
# MIN_DOCS of its available filings are evidence rather than argument.
import json, os, re, sys, time, urllib.parse, urllib.request

token = os.environ["COURTLISTENER_TOKEN"]
want = int(sys.argv[1]) if len(sys.argv) > 1 else 2
MIN_DOCS, MAX_DOCS = 8, 22
EVIDENCE = re.compile(
    r"exhibit|affidavit|declaration|deposition|agreement|contract|lease|letter|email|invoice|"
    r"estoppel|escrow|certificate|stipulat|pretrial order",
    re.I,
)
ARGUMENT = re.compile(r"motion|brief|reply|response|memorandum|order|minute|notice|summons|scheduling", re.I)

# D. Colo. business contract disputes with summary-judgment practice, from an anonymous search.
CANDIDATES = [
    ("Modern Gaming, Inc. v. Sockeye Software, LLC", "1:23-cv-01583"),
    ("Pacific Ocean Alameda, LLC v. AmGuard Insurance Company", "1:21-cv-02523"),
    ("PHT Holding I, LLC v. Security Life of Denver Insurance Company", "1:18-cv-01897"),
    ("GSL of ILL, LLC v. Kroskob", "1:11-cv-00939"),
    ("Calvary Baptist Church of Denver v. Church Mutual Insurance", "1:21-cv-01723"),
    ("L'Alliance Francaise de Denver v. North American Elite Insurance", "1:23-cv-01483"),
    ("Denver Foundation v. Philadelphia Indemnity Insurance", "1:22-cv-03326"),
    ("RJY Diamond, LLC v. Denver Dryer Pros, LLC", "1:24-cv-01984"),
]


def get(url):
    """One request, waiting as long as CourtListener asks when it says no."""
    while True:
        try:
            req = urllib.request.Request(url, headers={"Authorization": f"Token {token}"})
            return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as error:
            if error.code != 429:
                print("http", error.code, url[:90], flush=True)
                return None
            wait = int(error.headers.get("retry-after") or 300) + 15
            print(f"throttled; waiting {wait} s", flush=True)
            time.sleep(wait)


prepared = 0
for name, number in CANDIDATES:
    if prepared >= want:
        break
    q = urllib.parse.urlencode({"q": f'docketNumber:"{number}"', "type": "r", "court": "cod", "format": "json"})
    hits = get(f"https://www.courtlistener.com/api/rest/v4/search/?{q}")
    time.sleep(5)
    if not hits or not hits.get("results"):
        print("no docket for", number, flush=True)
        continue
    docket_id = hits["results"][0]["docket_id"]
    q = urllib.parse.urlencode({"docket_entry__docket": docket_id, "is_available": "true", "page_size": 100, "format": "json"})
    docs = get(f"https://www.courtlistener.com/api/rest/v4/recap-documents/?{q}")
    time.sleep(5)
    if not docs:
        continue
    evidence = [
        d for d in docs["results"]
        if (d.get("page_count") or 0) >= 1
        and EVIDENCE.search(d.get("description") or "")
        and not ARGUMENT.search(d.get("description") or "")
    ]
    print(f"{name} ({number}): {len(docs['results'])} available, {len(evidence)} evidence", flush=True)
    if len(evidence) < MIN_DOCS:
        continue
    folder = f".cache/recap/{number.replace(':', '-')}"
    os.makedirs(folder, exist_ok=True)
    json.dump({"name": name, "number": number, "docket_id": docket_id, "documents": evidence[:MAX_DOCS]},
              open(f"{folder}/manifest.json", "w"), indent=1)
    for d in evidence[:MAX_DOCS]:
        path = f"{folder}/{d['id']}.json"
        if os.path.exists(path):
            continue
        body = get(f"https://www.courtlistener.com/api/rest/v4/recap-documents/{d['id']}/?format=json")
        if body:
            json.dump(body, open(path, "w"))
            print(" ", d["id"], (d.get("description") or "")[:60], len(body.get("plain_text") or ""), flush=True)
        time.sleep(45)
    prepared += 1
print("done:", prepared, "cases fetched", flush=True)
