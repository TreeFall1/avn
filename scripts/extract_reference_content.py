"""Development-only extraction of visible home-page examples into local JSON."""

import hashlib
import json
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = ROOT / "src" / "data"
HTML = ROOT / ".next" / "reference" / "source.html"
mapping = json.loads((DATA / "reference-assets.json").read_text(encoding="utf-8"))
soup = BeautifulSoup(HTML.read_text(encoding="utf-8"), "html.parser")


def local(src):
    url = urljoin("https://avan.market/", src)
    if url in mapping:
        return mapping[url]
    parsed = urlparse(url)
    if parsed.netloc == "avan.market":
        candidate = parsed.path
    else:
        suffix = Path(parsed.path).suffix or ".png"
        candidate = f"/reference/{parsed.netloc}/{hashlib.sha1(url.encode()).hexdigest()[:16]}{suffix}"
    target = PUBLIC / candidate.lstrip("/")
    if not target.exists():
        response = requests.get(url, timeout=25)
        response.raise_for_status()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(response.content)
    mapping[url] = candidate
    return candidate


hero = []
for img in soup.find_all("img"):
    alt = img.get("alt", "")
    if (" | " in alt and "(" in alt and ")" in alt) and len(hero) < 4:
        card = img.parent.parent
        hero.append({
            "name": alt.split(" (")[0],
            "quality": alt.split(" (")[-1].rstrip(")"),
            "price": card.get_text(" ", strip=True),
            "image": local(img["src"]),
        })

inventory = []
for img in soup.find_all("img", alt="product"):
    src = img.get("src")
    if src and len(inventory) < 20:
        inventory.append(local(src))

live = []
seen_live = set()
for card in soup.find_all(class_=lambda value: value and "tradeItemContainer" in value):
    img = card.find("img", alt="item")
    if not img:
        continue
    name = card.find(class_=lambda value: value and "tradeItemNameAndPrice" in value)
    header = card.find(class_=lambda value: value and "tradeItemHeader" in value)
    if not name or not header:
        continue
    spans = name.find_all("span")
    header_spans = header.find_all("span")
    if len(spans) < 2:
        continue
    amount = spans[1].get_text(" ", strip=True).replace("₽", "").replace(" ", "")
    try:
        amount = float(amount)
    except ValueError:
        continue
    unique_key = (spans[0].get_text(" ", strip=True), amount, img["src"])
    if unique_key in seen_live:
        continue
    seen_live.add(unique_key)
    live.append({
        "name": spans[0].get_text(" ", strip=True),
        "amount": amount,
        "quality": header_spans[-1].get_text(" ", strip=True) if header_spans else "",
        "image": local(img["src"]),
    })
    if len(live) >= 24:
        break

reviews = []
for card in soup.find_all(class_=lambda value: value and value.endswith("__comment")):
    img = card.find("img", alt="avatar")
    name = card.find(class_=lambda value: value and value.endswith("__name"))
    body = card.find(class_=lambda value: value and "commentText" in value)
    rating = card.find(class_=lambda value: value and "ratingNumber" in value)
    if img and name and body:
        reviews.append({
            "name": name.get_text(" ", strip=True),
            "comment": body.get_text(" ", strip=True),
            "rating": int(rating.get_text(" ", strip=True).split()[0]) if rating else 5,
            "avatar": local(img["src"]),
        })

creators = []
for card in soup.find_all("button", class_=lambda value: value and "recommendedItemBox" in value):
    img = card.find("img", alt="blogger_icon")
    name = card.find(class_=lambda value: value and "typographyName" in value)
    social = card.find("img", alt="social_network_logo")
    if img and name:
        count = social.parent.get_text(" ", strip=True) if social else ""
        creators.append({
            "name": name.get_text(" ", strip=True),
            "count": count,
            "image": local(img["src"]),
            "social": local(social["src"]) if social else "",
        })

output = {"hero": hero, "inventory": inventory, "live": live, "reviews": reviews, "creators": creators}
(DATA / "reference-content.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
(DATA / "reference-assets.json").write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")
print({key: len(value) for key, value in output.items()})
