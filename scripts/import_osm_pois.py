"""
TrailQuest — Import POIs from OpenStreetMap (Overpass API) into Supabase
"""
import requests
import time
import os
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

TAG_CATEGORY_MAP = {
    ("craft", "brewery"):                ("minipivovar",  8),
    ("amenity", "pub"):                  ("minipivovar",  5),
    ("amenity", "restaurant"):           ("restaurace",   5),
    ("amenity", "biergarten"):           ("minipivovar",  6),
    ("historic", "castle"):              ("pamatnik",     9),
    ("historic", "ruins"):               ("pamatnik",     7),
    ("historic", "monastery"):           ("kaplička",     8),
    ("historic", "memorial"):            ("pamatnik",     6),
    ("historic", "archaeological_site"): ("pamatnik",     7),
    ("historic", "wayside_cross"):       ("kaplička",     5),
    ("historic", "wayside_shrine"):      ("kaplička",     5),
    ("amenity", "place_of_worship"):     ("kaplička",     5),
    ("tourism", "viewpoint"):            ("vyhlidka",     8),
    ("man_made", "tower"):               ("vyhlidka",     8),
    ("tourism", "attraction"):           ("vyhlidka",     6),
    ("natural", "peak"):                 ("vyhlidka",     8),
    ("natural", "spring"):               ("studanka",     7),
    ("natural", "cave_entrance"):        ("skalni_utvar", 8),
    ("natural", "rock"):                 ("skalni_utvar", 7),
    ("natural", "waterfall"):            ("studanka",     8),
    ("leisure", "nature_reserve"):       ("skalni_utvar", 6),
    ("tourism", "alpine_hut"):           ("horska_chata", 8),
    ("tourism", "wilderness_hut"):       ("horska_chata", 7),
    ("tourism", "chalet"):               ("horska_chata", 7),
    ("craft", "winery"):                 ("vinna_sklep",  8),
    ("man_made", "watermill"):           ("mlyny",        7),
    ("man_made", "windmill"):            ("mlyny",        7),
    ("tourism", "museum"):               ("pamatnik",     7),
}

def build_query(tag_key, tag_value):
    return f"""[out:json][timeout:60];(node["{tag_key}"="{tag_value}"](49.0,12.0,51.1,19.0);way["{tag_key}"="{tag_value}"](49.0,12.0,51.1,19.0);relation["{tag_key}"="{tag_value}"](49.0,12.0,51.1,19.0););out center tags;"""

def fetch_osm(tag_key, tag_value):
    query = build_query(tag_key, tag_value)
    for attempt in range(3):
        try:
            res = requests.post(OVERPASS_URL, data={"data": query}, timeout=90)
            res.raise_for_status()
            return res.json().get("elements", [])
        except requests.exceptions.Timeout:
            print(f"  Timeout (attempt {attempt+1}/3)")
            time.sleep(10)
        except Exception as e:
            print(f"  Error: {e} (attempt {attempt+1}/3)")
            time.sleep(5)
    return []

def extract_coords(el):
    if el["type"] == "node": return el.get("lat"), el.get("lon")
    c = el.get("center", {})
    return c.get("lat"), c.get("lon")

GENERIC = {"restaurace","hospoda","bar","pub","hotel","kavárna","cafe","restaurant","church","chapel","kostel"}

def infer_region(lat, lng):
    if lat > 50.7: return "Severní Čechy"
    if lat > 50.3 and lng < 14.5: return "Praha a okolí"
    if lat > 50.3: return "Střední Čechy"
    if lng < 13.5: return "Západní Čechy"
    if lng > 17.5: return "Moravskoslezský"
    if lng > 16.5: return "Jižní Morava"
    if lat < 49.5: return "Jižní Čechy"
    return "Střední Morava"

def osm_to_poi(el, category, quality):
    tags = el.get("tags", {})
    lat, lng = extract_coords(el)
    name = tags.get("name:cs") or tags.get("name")
    if not lat or not lng or not name: return None
    if name.lower().strip() in GENERIC: return None
    if not (49.0 <= lat <= 51.1 and 12.0 <= lng <= 19.0): return None
    if len(name) < 3: return None
    desc_parts = []
    if tags.get("description"): desc_parts.append(tags["description"])
    if tags.get("wikipedia"): desc_parts.append(f"Wikipedia: {tags['wikipedia']}")
    return {
        "name": name[:200],
        "description": " | ".join(desc_parts) if desc_parts else None,
        "poi_category": category,
        "gps_lat": round(lat, 7),
        "gps_lng": round(lng, 7),
        "region": infer_region(lat, lng),
        "quality_score": quality,
        "is_approved": True, "is_active": True, "is_partner": False,
        "visit_count": 0, "source": "osm", "osm_id": str(el.get("id", "")),
    }

def insert_batch(pois):
    if not pois: return 0
    inserted = 0
    BS = 50
    for i in range(0, len(pois), BS):
        batch = pois[i:i+BS]
        try:
            supabase.table("custom_pois").upsert(batch, on_conflict="name,gps_lat,gps_lng", ignore_duplicates=True).execute()
            inserted += len(batch)
        except Exception as e:
            print(f"  Batch error: {e}")
            for poi in batch:
                try:
                    supabase.table("custom_pois").insert(poi).execute()
                    inserted += 1
                except: pass
        time.sleep(0.3)
    return inserted

def main():
    print("=" * 60)
    print("TrailQuest — OSM POI Import")
    print("=" * 60)
    print(f"Supabase: {SUPABASE_URL[:40]}...")
    print(f"Categories: {len(TAG_CATEGORY_MAP)}")
    print()
    total = 0
    stats = {}
    for (tk, tv), (cat, q) in tqdm(TAG_CATEGORY_MAP.items(), desc="Importing", unit="cat"):
        label = f"{tk}={tv}"
        elements = fetch_osm(tk, tv)
        pois = [p for el in elements if (p := osm_to_poi(el, cat, q))]
        if pois:
            n = insert_batch(pois)
            total += n
            stats[f"{label} → {cat}"] = n
            print(f"  [{label}] {len(elements)} OSM → {len(pois)} valid → {n} inserted")
        else:
            print(f"  [{label}] {len(elements)} OSM → 0 valid")
        time.sleep(3)
    print()
    print("=" * 60)
    print(f"DONE! Total inserted: {total}")
    print("=" * 60)
    for l, c in sorted(stats.items(), key=lambda x: -x[1]):
        print(f"  {c:5d}  {l}")

if __name__ == "__main__":
    main()
