/**
 * Seed script — inserts 10 real Czech routes with challenges into Supabase.
 * Run: node scripts/seed-routes.js
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env'); process.exit(1) }
const supabase = createClient(url, key)

const routes = [
  {
    name: 'Petřínské sady — okruh',
    description: 'Okruh kolem Petřína přes rozhlednu a zahrady.',
    distance: 4500,
    difficulty: 'easy',
    activity_type: 'hiking',
    region: 'Praha',
    elevation_gain: 120,
    is_loop: true,
    start_lat: 50.0833,
    start_lng: 14.3950,
    geometry: { type: 'LineString', coordinates: [[14.3950,50.0833],[14.3937,50.0842],[14.3920,50.0855],[14.3900,50.0860],[14.3880,50.0850],[14.3870,50.0838],[14.3880,50.0825],[14.3910,50.0818],[14.3940,50.0822],[14.3950,50.0833]] },
    challenges: [
      { order_index: 0, lat: 50.0842, lng: 14.3937, type: 'quiz', title: 'Petřínská rozhledna', description: 'Kolik schodů má Petřínská rozhledna?', question: 'Kolik schodů má Petřínská rozhledna?', options: ['199', '299', '399', '499'], correct_answer: '299' },
      { order_index: 1, lat: 50.0855, lng: 14.3920, type: 'photo', title: 'Výhled na Prahu', description: 'Vyfoťte panorama Prahy z Petřína.', prompt: 'Vyfoťte panorama Prahy z Petřína.' },
      { order_index: 2, lat: 50.0838, lng: 14.3870, type: 'checkin', title: 'Růžový sad', description: 'Navštivte Růžový sad.' },
    ],
  },
  {
    name: 'Šumava — Černé jezero',
    description: 'Výstup k největšímu ledovcovému jezeru v ČR.',
    distance: 12000,
    difficulty: 'medium',
    activity_type: 'hiking',
    region: 'Šumava',
    elevation_gain: 450,
    is_loop: false,
    start_lat: 49.1800,
    start_lng: 13.1850,
    geometry: { type: 'LineString', coordinates: [[13.1850,49.1800],[13.1830,49.1820],[13.1790,49.1850],[13.1760,49.1880],[13.1740,49.1910],[13.1720,49.1930],[13.1690,49.1948],[13.1668,49.1960]] },
    challenges: [
      { order_index: 0, lat: 49.1850, lng: 13.1790, type: 'observation', title: 'Šumavská příroda', description: 'Popište nejzajímavější strom, který vidíte.', prompt: 'Popište nejzajímavější strom, který vidíte.' },
      { order_index: 1, lat: 49.1910, lng: 13.1740, type: 'quiz', title: 'Černé jezero', question: 'Jaká je hloubka Černého jezera?', description: 'Testujte si znalosti.', options: ['18 m', '40 m', '60 m', '80 m'], correct_answer: '40 m' },
      { order_index: 2, lat: 49.1960, lng: 13.1668, type: 'photo', title: 'Jezero', description: 'Vyfoťte Černé jezero.', prompt: 'Vyfoťte Černé jezero.' },
    ],
  },
  {
    name: 'Sněžka — z Pece pod Sněžkou',
    description: 'Výstup na nejvyšší horu ČR (1603 m).',
    distance: 18000,
    difficulty: 'hard',
    activity_type: 'hiking',
    region: 'Krkonoše',
    elevation_gain: 820,
    is_loop: false,
    start_lat: 50.6920,
    start_lng: 15.7340,
    geometry: { type: 'LineString', coordinates: [[15.7340,50.6920],[15.7350,50.6940],[15.7365,50.6970],[15.7370,50.7000],[15.7380,50.7030],[15.7390,50.7050],[15.7395,50.7070],[15.7398,50.7090],[15.7400,50.7360]] },
    challenges: [
      { order_index: 0, lat: 50.6970, lng: 15.7365, type: 'checkin', title: 'Výšinská louka', description: 'Check-in na Výšinské louce.' },
      { order_index: 1, lat: 50.7030, lng: 15.7380, type: 'quiz', title: 'Krkonošská fauna', question: 'Jaký endemit žije v Krkonoších?', description: 'Kvíz o přírodě.', options: ['Medvěd', 'Lumík', 'Plž kroužkovaný', 'Vřes'], correct_answer: 'Plž kroužkovaný' },
      { order_index: 2, lat: 50.7070, lng: 15.7395, type: 'observation', title: 'Tundra', description: 'Popište vegetaci kolem vás.', prompt: 'Popište vegetaci kolem vás.' },
      { order_index: 3, lat: 50.7360, lng: 15.7400, type: 'photo', title: 'Vrchol Sněžky', description: 'Fotka z vrcholu!', prompt: 'Vyfoťte výhled z vrcholu Sněžky.' },
    ],
  },
  {
    name: 'Moravský kras — Punkevní jeskyně',
    description: 'Okruh kolem propasti Macocha a Punkevních jeskyní.',
    distance: 8500,
    difficulty: 'easy',
    activity_type: 'hiking',
    region: 'Moravský kras',
    elevation_gain: 200,
    is_loop: true,
    start_lat: 49.3730,
    start_lng: 16.7310,
    geometry: { type: 'LineString', coordinates: [[16.7310,49.3730],[16.7320,49.3745],[16.7340,49.3760],[16.7360,49.3775],[16.7380,49.3790],[16.7370,49.3810],[16.7350,49.3800],[16.7330,49.3780],[16.7310,49.3730]] },
    challenges: [
      { order_index: 0, lat: 49.3760, lng: 16.7340, type: 'quiz', title: 'Propast Macocha', question: 'Jaká je hloubka propasti Macocha?', description: 'Kvíz o Macoše.', options: ['68 m', '108 m', '138 m', '168 m'], correct_answer: '138 m' },
      { order_index: 1, lat: 49.3790, lng: 16.7380, type: 'photo', title: 'Propast shora', description: 'Vyfoťte propast z horního můstku.', prompt: 'Vyfoťte propast z horního můstku.' },
      { order_index: 2, lat: 49.3810, lng: 16.7370, type: 'checkin', title: 'Punkevní jeskyně', description: 'Check-in u vstupu do jeskyní.' },
    ],
  },
  {
    name: 'Beskydy — Lysá hora',
    description: 'Výstup na nejvyšší horu Beskyd (1323 m).',
    distance: 14000,
    difficulty: 'medium',
    activity_type: 'hiking',
    region: 'Beskydy',
    elevation_gain: 700,
    is_loop: false,
    start_lat: 49.5410,
    start_lng: 18.4470,
    geometry: { type: 'LineString', coordinates: [[18.4470,49.5410],[18.4480,49.5430],[18.4500,49.5450],[18.4520,49.5470],[18.4540,49.5490],[18.4530,49.5510],[18.4510,49.5460]] },
    challenges: [
      { order_index: 0, lat: 49.5450, lng: 18.4500, type: 'observation', title: 'Les', description: 'Jaké stromy vidíte kolem sebe?', prompt: 'Jaké stromy vidíte kolem sebe?' },
      { order_index: 1, lat: 49.5490, lng: 18.4540, type: 'quiz', title: 'Lysá hora', question: 'V jakém roce byla na Lysé hoře postavena rozhledna?', description: 'Historický kvíz.', options: ['1897', '1920', '1953', '1975'], correct_answer: '1897' },
      { order_index: 2, lat: 49.5460, lng: 18.4510, type: 'photo', title: 'Panorama Beskyd', description: 'Panorama z Lysé hory.', prompt: 'Vyfoťte panorama z Lysé hory.' },
    ],
  },
  {
    name: 'Greenway Praha — Karlštejn',
    description: 'Cyklostezka podél Berounky z Prahy na Karlštejn.',
    distance: 32000,
    difficulty: 'medium',
    activity_type: 'cycling',
    region: 'Praha',
    elevation_gain: 180,
    is_loop: false,
    start_lat: 49.9950,
    start_lng: 14.4070,
    geometry: { type: 'LineString', coordinates: [[14.4070,49.9950],[14.3900,49.9920],[14.3700,49.9880],[14.3500,49.9850],[14.3300,49.9830],[14.3000,49.9800],[14.2700,49.9760],[14.1880,49.9390]] },
    challenges: [
      { order_index: 0, lat: 49.9880, lng: 14.3700, type: 'checkin', title: 'Radotín', description: 'Check-in v Radotíně.' },
      { order_index: 1, lat: 49.9830, lng: 14.3300, type: 'quiz', title: 'Berounka', question: 'Kam ústí řeka Berounka?', description: 'Říční kvíz.', options: ['Do Labe', 'Do Vltavy', 'Do Sázavy', 'Do Ohře'], correct_answer: 'Do Vltavy' },
      { order_index: 2, lat: 49.9760, lng: 14.2700, type: 'observation', title: 'Příroda podél Berounky', description: 'Popište krajinu kolem Berounky.', prompt: 'Popište krajinu kolem Berounky.' },
      { order_index: 3, lat: 49.9390, lng: 14.1880, type: 'photo', title: 'Karlštejn', description: 'Vyfoťte hrad Karlštejn.', prompt: 'Vyfoťte hrad Karlštejn.' },
    ],
  },
  {
    name: 'Šumava — Lipno okruh',
    description: 'MTB okruh kolem Lipna přes singletracky.',
    distance: 25000,
    difficulty: 'hard',
    activity_type: 'mtb',
    region: 'Šumava',
    elevation_gain: 550,
    is_loop: true,
    start_lat: 48.6300,
    start_lng: 14.2200,
    geometry: { type: 'LineString', coordinates: [[14.2200,48.6300],[14.2250,48.6330],[14.2350,48.6370],[14.2450,48.6400],[14.2550,48.6380],[14.2500,48.6340],[14.2400,48.6310],[14.2200,48.6300]] },
    challenges: [
      { order_index: 0, lat: 48.6370, lng: 14.2350, type: 'checkin', title: 'Singletrack start', description: 'Check-in na začátku singletracku.' },
      { order_index: 1, lat: 48.6400, lng: 14.2450, type: 'quiz', title: 'Lipno', question: 'Kolik km2 má vodní nádrž Lipno?', description: 'Kvíz o Lipně.', options: ['26 km²', '36 km²', '49 km²', '65 km²'], correct_answer: '49 km²' },
      { order_index: 2, lat: 48.6340, lng: 14.2500, type: 'photo', title: 'Výhled na Lipno', description: 'Panorama přehrady.', prompt: 'Vyfoťte výhled na Lipno.' },
    ],
  },
  {
    name: 'Brno — Přehrada okruh',
    description: 'Cyklotrasa kolem Brněnské přehrady.',
    distance: 15000,
    difficulty: 'easy',
    activity_type: 'cycling',
    region: 'Brno',
    elevation_gain: 100,
    is_loop: true,
    start_lat: 49.2330,
    start_lng: 16.5150,
    geometry: { type: 'LineString', coordinates: [[16.5150,49.2330],[16.5100,49.2360],[16.5050,49.2400],[16.5000,49.2420],[16.4950,49.2400],[16.4980,49.2370],[16.5050,49.2340],[16.5150,49.2330]] },
    challenges: [
      { order_index: 0, lat: 49.2400, lng: 16.5050, type: 'checkin', title: 'Pláž Kozí horka', description: 'Check-in na pláži.' },
      { order_index: 1, lat: 49.2420, lng: 16.5000, type: 'observation', title: 'Vodní ptáci', description: 'Jaké ptáky vidíte na přehradě?', prompt: 'Jaké ptáky vidíte na přehradě?' },
      { order_index: 2, lat: 49.2370, lng: 16.4980, type: 'quiz', title: 'Přehrada', question: 'V jakém roce byla Brněnská přehrada napuštěna?', description: 'Historický kvíz.', options: ['1920', '1936', '1940', '1955'], correct_answer: '1940' },
    ],
  },
  {
    name: 'Prokopské údolí — Praha',
    description: 'Přírodní rezervace v Praze s vápencovými skálami.',
    distance: 6000,
    difficulty: 'easy',
    activity_type: 'hiking',
    region: 'Praha',
    elevation_gain: 80,
    is_loop: true,
    start_lat: 50.0430,
    start_lng: 14.3590,
    geometry: { type: 'LineString', coordinates: [[14.3590,50.0430],[14.3570,50.0445],[14.3540,50.0460],[14.3510,50.0475],[14.3490,50.0465],[14.3510,50.0450],[14.3550,50.0435],[14.3590,50.0430]] },
    challenges: [
      { order_index: 0, lat: 50.0460, lng: 14.3540, type: 'quiz', title: 'Geologie', question: 'Z jakého horniny jsou zdejší skály?', description: 'Geologický kvíz.', options: ['Žula', 'Vápenec', 'Pískovec', 'Břidlice'], correct_answer: 'Vápenec' },
      { order_index: 1, lat: 50.0475, lng: 14.3510, type: 'photo', title: 'Vápencové skály', description: 'Vyfoťte skalní stěnu.', prompt: 'Vyfoťte vápencové skály.' },
      { order_index: 2, lat: 50.0450, lng: 14.3510, type: 'checkin', title: 'Butovické hradiště', description: 'Navštivte Butovické hradiště.' },
    ],
  },
  {
    name: 'Krkonoše — Harrachov MTB',
    description: 'Horský biketrail z Harrachova přes Mumlavský vodopád.',
    distance: 20000,
    difficulty: 'hard',
    activity_type: 'mtb',
    region: 'Krkonoše',
    elevation_gain: 650,
    is_loop: true,
    start_lat: 50.7740,
    start_lng: 15.4280,
    geometry: { type: 'LineString', coordinates: [[15.4280,50.7740],[15.4250,50.7760],[15.4200,50.7790],[15.4150,50.7810],[15.4120,50.7790],[15.4150,50.7770],[15.4200,50.7750],[15.4280,50.7740]] },
    challenges: [
      { order_index: 0, lat: 50.7790, lng: 15.4200, type: 'photo', title: 'Mumlavský vodopád', description: 'Vyfoťte vodopád.', prompt: 'Vyfoťte Mumlavský vodopád.' },
      { order_index: 1, lat: 50.7810, lng: 15.4150, type: 'quiz', title: 'Mumlava', question: 'Jak vysoký je Mumlavský vodopád?', description: 'Kvíz.', options: ['5 m', '8 m', '10 m', '15 m'], correct_answer: '10 m' },
      { order_index: 2, lat: 50.7770, lng: 15.4150, type: 'observation', title: 'Horský les', description: 'Popište zvuky lesa kolem vás.', prompt: 'Popište zvuky lesa kolem vás.' },
      { order_index: 3, lat: 50.7750, lng: 15.4200, type: 'checkin', title: 'Cíl trasy', description: 'Check-in na konci okruhu.' },
    ],
  },
]

async function seed() {
  console.log('Seeding routes...')

  for (const route of routes) {
    const { challenges, ...routeData } = route
    routeData.geometry = JSON.stringify(routeData.geometry)

    const { data: inserted, error } = await supabase
      .from('routes')
      .insert(routeData)
      .select('id')
      .single()

    if (error) {
      console.error(`  ✗ Route "${route.name}":`, error.message)
      continue
    }

    console.log(`  ✓ Route "${route.name}" → id=${inserted.id}`)

    for (const ch of challenges) {
      ch.route_id = inserted.id
      if (ch.options) ch.options = JSON.stringify(ch.options)
      const { error: chErr } = await supabase.from('challenges').insert(ch)
      if (chErr) console.error(`    ✗ Challenge "${ch.title}":`, chErr.message)
      else console.log(`    ✓ Challenge "${ch.title}"`)
    }
  }

  console.log('Done!')
}

seed()
