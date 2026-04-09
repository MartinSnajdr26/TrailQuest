"""
TrailQuest — Push pre-written EN + DE translations for all 27 route_stories
"""
import os, json, time
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))

# {title_cs: {title_en, title_de, description_en, description_de}}
TRANSLATIONS = {
    "Apokalypsa bez signálu": {
        "title_en": "Apocalypse Without Signal",
        "title_de": "Apokalypse ohne Empfang",
        "description_en": "What would you do if all networks went down? Survive this tech-free adventure.",
        "description_de": "Was würdest du tun, wenn alle Netze ausfallen? Überlebe dieses technikfreie Abenteuer.",
    },
    "Den, kdy se všichni rozhodli běhat": {
        "title_en": "The Day Everyone Decided to Run",
        "title_de": "Der Tag, an dem alle laufen wollten",
        "description_en": "Suddenly the whole city is jogging. Find out what started this fitness madness.",
        "description_de": "Plötzlich joggt die ganze Stadt. Finde heraus, was diesen Fitness-Wahnsinn ausgelöst hat.",
    },
    "Kam zmizel poslední rohlík?": {
        "title_en": "Where Did the Last Roll Disappear?",
        "title_de": "Wohin verschwand das letzte Brötchen?",
        "description_en": "A bakery mystery. Someone is stealing the last bread rolls. Track down the culprit.",
        "description_de": "Ein Bäckerei-Krimi. Jemand klaut die letzten Brötchen. Finde den Schuldigen.",
    },
    "Kdo snědl firemní dort?": {
        "title_en": "Who Ate the Office Cake?",
        "title_de": "Wer hat den Firmenkuchen gegessen?",
        "description_en": "The office birthday cake vanished. Interrogate suspects and solve this workplace crime.",
        "description_de": "Der Büro-Geburtstagskuchen ist verschwunden. Verhöre Verdächtige und löse dieses Büro-Verbrechen.",
    },
    "Krize posledního piva": {
        "title_en": "The Last Beer Crisis",
        "title_de": "Die Krise des letzten Biers",
        "description_en": "Only one beer left in the whole neighborhood. Race to find it before someone else does.",
        "description_de": "Nur noch ein Bier im ganzen Viertel. Finde es, bevor es jemand anderes tut.",
    },
    "Legenda o člověku, co si četl návod": {
        "title_en": "The Legend of the Man Who Read the Manual",
        "title_de": "Die Legende vom Mann, der die Anleitung las",
        "description_en": "An urban legend about someone who actually reads instruction manuals. Does this person exist?",
        "description_de": "Eine urbane Legende über jemanden, der tatsächlich Anleitungen liest. Gibt es diese Person?",
    },
    "Legenda o posledním normálním člověku": {
        "title_en": "Legend of the Last Normal Person",
        "title_de": "Die Legende vom letzten normalen Menschen",
        "description_en": "Everyone's gone weird. Find the last completely normal person in the city.",
        "description_de": "Alle sind seltsam geworden. Finde den letzten völlig normalen Menschen in der Stadt.",
    },
    "Lov na nejhorší selfie spot": {
        "title_en": "Hunt for the Worst Selfie Spot",
        "title_de": "Jagd auf den schlimmsten Selfie-Spot",
        "description_en": "Forget the best spots — find the absolute worst places for selfies in town.",
        "description_de": "Vergiss die besten Spots — finde die absolut schlimmsten Selfie-Orte der Stadt.",
    },
    "Mise: Najít normální brunch": {
        "title_en": "Mission: Find a Normal Brunch",
        "title_de": "Mission: Einen normalen Brunch finden",
        "description_en": "Every brunch place is over the top. Can you find one that serves normal food?",
        "description_de": "Jeder Brunch-Laden ist übertrieben. Kannst du einen finden, der normales Essen serviert?",
    },
    "Noční mise za kebabem": {
        "title_en": "Night Mission: The Kebab Quest",
        "title_de": "Nachtmission: Die Kebab-Suche",
        "description_en": "It's 2 AM and you need a kebab. Navigate the city's late-night food scene.",
        "description_de": "Es ist 2 Uhr nachts und du brauchst einen Kebab. Navigiere durch die Nachtgastronomie.",
    },
    "Operace: Ztracená ponožka": {
        "title_en": "Operation: Lost Sock",
        "title_de": "Operation: Verlorene Socke",
        "description_en": "Where do all the missing socks go? Investigate this everyday mystery.",
        "description_de": "Wohin verschwinden all die fehlenden Socken? Untersuche dieses Alltagsrätsel.",
    },
    "Pivní detektiv": {
        "title_en": "Beer Detective",
        "title_de": "Bier-Detektiv",
        "description_en": "Someone's been watering down the local beer. Sniff out the fraud and save the pubs.",
        "description_de": "Jemand hat das lokale Bier verwässert. Spüre den Betrug auf und rette die Kneipen.",
    },
    "Po stopách středověkých rytířů": {
        "title_en": "Following Medieval Knights",
        "title_de": "Auf den Spuren mittelalterlicher Ritter",
        "description_en": "Walk in the footsteps of medieval knights through historic landmarks.",
        "description_de": "Wandle auf den Spuren mittelalterlicher Ritter durch historische Wahrzeichen.",
    },
    "Případ podezřele levného piva": {
        "title_en": "The Case of the Suspiciously Cheap Beer",
        "title_de": "Der Fall des verdächtig billigen Biers",
        "description_en": "Beer for 15 crowns? Something's not right. Investigate this too-good-to-be-true deal.",
        "description_de": "Bier für 15 Kronen? Da stimmt was nicht. Untersuche dieses unglaubliche Angebot.",
    },
    "Případ ukradené Wi-Fi": {
        "title_en": "The Case of the Stolen Wi-Fi",
        "title_de": "Der Fall des gestohlenen WLANs",
        "description_en": "All the café Wi-Fi passwords have changed overnight. Who's behind this digital heist?",
        "description_de": "Alle Café-WLAN-Passwörter haben sich über Nacht geändert. Wer steckt hinter diesem digitalen Raub?",
    },
    "Spiknutí městských holubů": {
        "title_en": "The Pigeon Conspiracy",
        "title_de": "Die Verschwörung der Stadttauben",
        "description_en": "They sit on benches, act dumb... and maybe watch everything. Time to uncover the truth about city pigeons.",
        "description_de": "Sie sitzen auf Bänken, tun dumm... und beobachten vielleicht alles. Zeit, die Wahrheit über Stadttauben aufzudecken.",
    },
    "Tajemství člověka, co všude chodí včas": {
        "title_en": "The Mystery of the Person Who's Always on Time",
        "title_de": "Das Geheimnis des Menschen, der immer pünktlich ist",
        "description_en": "Someone in this city is never late. How is that even possible? Investigate.",
        "description_de": "Jemand in dieser Stadt kommt nie zu spät. Wie ist das überhaupt möglich? Ermittle.",
    },
    "Tajemství nejlepší lavičky ve městě": {
        "title_en": "The Secret of the Best Bench in Town",
        "title_de": "Das Geheimnis der besten Bank der Stadt",
        "description_en": "Legends speak of one perfect bench. Find it before someone else claims it.",
        "description_de": "Legenden sprechen von einer perfekten Bank. Finde sie, bevor jemand anderes sie beansprucht.",
    },
    "Tajemství podivně spokojeného psa": {
        "title_en": "The Mystery of the Oddly Happy Dog",
        "title_de": "Das Geheimnis des seltsam zufriedenen Hundes",
        "description_en": "This dog is way too happy. What does it know that we don't? Follow the trail.",
        "description_de": "Dieser Hund ist viel zu glücklich. Was weiß er, das wir nicht wissen? Folge der Spur.",
    },
    "Tajemství tří stejných hospod": {
        "title_en": "The Mystery of Three Identical Pubs",
        "title_de": "Das Geheimnis der drei gleichen Kneipen",
        "description_en": "Three pubs that look exactly the same. Coincidence or conspiracy? You decide.",
        "description_de": "Drei Kneipen, die genau gleich aussehen. Zufall oder Verschwörung? Du entscheidest.",
    },
    "Uprchlý trpaslík z zahrady": {
        "title_en": "The Runaway Garden Gnome",
        "title_de": "Der entlaufene Gartenzwerg",
        "description_en": "A garden gnome has gone missing. Track its bizarre journey across the city.",
        "description_de": "Ein Gartenzwerg ist verschwunden. Verfolge seine bizarre Reise durch die Stadt.",
    },
    "Útěk z nudného teambuildingu": {
        "title_en": "Escape from the Boring Teambuilding",
        "title_de": "Flucht vom langweiligen Teambuilding",
        "description_en": "The teambuilding is unbearable. Plan your great escape through the city.",
        "description_de": "Das Teambuilding ist unerträglich. Plane deine große Flucht durch die Stadt.",
    },
    "Velká kávová krize": {
        "title_en": "The Great Coffee Crisis",
        "title_de": "Die große Kaffee-Krise",
        "description_en": "All the good coffee shops are closing. Find the last surviving source of decent espresso.",
        "description_de": "Alle guten Cafés schließen. Finde die letzte überlebende Quelle für anständigen Espresso.",
    },
    "Záhada městského šepotu": {
        "title_en": "The Mystery of the City Whisper",
        "title_de": "Das Rätsel des Stadtflüsterns",
        "description_en": "Strange whispers echo through the streets at night. Uncover their source.",
        "description_de": "Seltsames Flüstern hallt nachts durch die Straßen. Finde die Quelle.",
    },
    "Záhada zmizelého víkendu": {
        "title_en": "The Mystery of the Vanished Weekend",
        "title_de": "Das Rätsel des verschwundenen Wochenendes",
        "description_en": "It's Monday again and nobody remembers the weekend. What happened?",
        "description_de": "Es ist wieder Montag und niemand erinnert sich ans Wochenende. Was ist passiert?",
    },
    "Záhady přírody": {
        "title_en": "Mysteries of Nature",
        "title_de": "Geheimnisse der Natur",
        "description_en": "Nature hides many secrets. Explore the outdoors and solve its riddles.",
        "description_de": "Die Natur verbirgt viele Geheimnisse. Erkunde die Natur und löse ihre Rätsel.",
    },
    "Ztracené tajemství perfektního rande": {
        "title_en": "The Lost Secret of the Perfect Date",
        "title_de": "Das verlorene Geheimnis des perfekten Dates",
        "description_en": "Somewhere in this city lies the secret to the perfect date. Can you find it?",
        "description_de": "Irgendwo in dieser Stadt liegt das Geheimnis des perfekten Dates. Kannst du es finden?",
    },
}


def main():
    stories = sb.table("route_stories").select("id, title_cs").eq("is_active", True).execute().data
    print(f"Found {len(stories)} stories\n")

    updated = 0
    for story in stories:
        t = TRANSLATIONS.get(story["title_cs"])
        if not t:
            print(f"  SKIP (no translation): {story['title_cs']}")
            continue

        sb.table("route_stories").update(t).eq("id", story["id"]).execute()
        print(f"  ✓ {story['title_cs']} → EN + DE")
        updated += 1
        time.sleep(0.2)

    print(f"\nDone! Updated {updated}/{len(stories)} stories.")


if __name__ == "__main__":
    main()
