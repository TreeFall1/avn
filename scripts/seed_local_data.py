"""Fill offline fixtures from already downloaded local images."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
PUBLIC = ROOT / "public"
snapshot_path = DATA / "snapshot.json"
snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))

portraits = sorted(
    "/" + path.relative_to(PUBLIC).as_posix()
    for directory in (PUBLIC / "external" / "yt3.googleusercontent.com", PUBLIC / "external" / "static-cdn.jtvnw.net")
    for path in directory.glob("*.png")
)
assert len(portraits) >= 20, "The source portraits must be downloaded before seeding"
(DATA / "avatars.json").write_text(
    json.dumps({"creators": portraits[:20], "reviews": [portraits[(i + 4) % len(portraits)] for i in range(16)]}, indent=2),
    encoding="utf-8",
)

more_reviews = [
    ("qwerty", "Все прошло быстро, деньги получил без проблем"),
    ("Artem", "Удобно продавать скины, поддержка помогла разобраться"),
    ("maxim", "Хороший сайт, покупка пришла сразу"),
    ("Skiller", "Работает отлично, вернусь ещё"),
]
reviews = snapshot["statistics"]["lastReviews"]
for name, comment in more_reviews:
    if len(reviews) >= 16:
        break
    reviews.append({"name": name, "comment": comment, "rating": 5})
for index, review in enumerate(reviews[:16]):
    review["localAvatar"] = portraits[(index + 4) % len(portraits)]

items = snapshot["statistics"]["mainItems"]["cs"]
colors = ["e6b75d", "c750ff", "ed4e83", "7a8eff", "54b4df", "ce6afe", "d68e58"]
snapshot["liveItems"] = [
    {
        "amount": round(item["steamPrice"] * (0.71 + (index % 5) * 0.035), 2),
        "localImage": item["localImage"],
        "Item": {
            "name": item["name"],
            "quality": item["quality"],
            "backgroundColor": colors[index % len(colors)],
        },
    }
    for index in range(21)
    for item in [items[(index * 3) % len(items)]]
]
snapshot_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
