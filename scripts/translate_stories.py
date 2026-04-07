"""
TrailQuest — Translate route_stories to EN + DE via Claude Haiku
"""
import os, json, time
from dotenv import load_dotenv
from supabase import create_client
import anthropic

load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
claude = anthropic.Anthropic(api_key=os.getenv("VITE_ANTHROPIC_API_KEY"))


def translate_text(text, target_lang):
    if not text:
        return text
    lang_name = "English" if target_lang == "en" else "German"
    msg = claude.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": f"Translate this Czech text to {lang_name}. Keep the same tone — playful, humorous, mystery-game style. Return ONLY the translated text, nothing else.\n\nCzech: {text}"
        }]
    )
    return msg.content[0].text.strip()


def translate_template(template, target_lang):
    if not template:
        return None
    if isinstance(template, str):
        try:
            template = json.loads(template)
        except:
            return None

    result = {}

    if template.get("intro"):
        result["intro"] = translate_text(template["intro"], target_lang)
        print(f"    intro: {result['intro'][:60]}...")
        time.sleep(0.3)

    if template.get("finale"):
        result["finale"] = translate_text(template["finale"], target_lang)
        time.sleep(0.3)

    if template.get("stops"):
        result["stops"] = []
        for stop in template["stops"]:
            translated_stop = {
                "order": stop.get("order"),
                "atmosphere": translate_text(stop.get("atmosphere"), target_lang),
                "riddle": translate_text(stop.get("riddle"), target_lang),
                "riddle_type": stop.get("riddle_type"),
                "options": [translate_text(o, target_lang) for o in (stop.get("options") or [])],
                "correct_answer": stop.get("correct_answer"),
                "hint": translate_text(stop.get("hint"), target_lang),
                "wrong_answer_text": translate_text(stop.get("wrong_answer_text"), target_lang),
                "correct_answer_text": translate_text(stop.get("correct_answer_text"), target_lang),
            }
            result["stops"].append(translated_stop)
            print(f"    stop {stop.get('order', '?')} done")
            time.sleep(0.3)

    if template.get("stop_prompts"):
        result["stop_prompts"] = [translate_text(p, target_lang) for p in template["stop_prompts"]]

    return result


def main():
    print("Loading stories...")
    stories = supabase.table("route_stories").select("*").execute().data
    print(f"Found {len(stories)} stories\n")

    for i, story in enumerate(stories):
        print(f"[{i+1}/{len(stories)}] {story['title_cs']}")

        updates = {}

        for lang in ["en", "de"]:
            lang_name = "English" if lang == "en" else "German"

            title_key = f"title_{lang}"
            if not story.get(title_key):
                updates[title_key] = translate_text(story["title_cs"], lang)
                print(f"  {lang} title: {updates[title_key]}")
                time.sleep(0.3)

            desc_key = f"description_{lang}"
            if not story.get(desc_key):
                updates[desc_key] = translate_text(story.get("description_cs", ""), lang)
                time.sleep(0.3)

            tmpl_key = f"narrative_template_{lang}"
            if not story.get(tmpl_key) and story.get("narrative_template"):
                print(f"  Translating narrative_template → {lang_name}...")
                updates[tmpl_key] = translate_template(story["narrative_template"], lang)
                time.sleep(0.5)

        if updates:
            supabase.table("route_stories").update(updates).eq("id", story["id"]).execute()
            print(f"  ✓ Saved: {', '.join(updates.keys())}")
        else:
            print("  — Already translated")

        time.sleep(1)

    print(f"\n{'='*50}")
    print("Translation complete!")


if __name__ == "__main__":
    main()
