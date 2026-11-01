/* HerpWatch — seed catalogue (single source of truth for demo mode AND supabase/seed.sql).
 *
 * ⚠  DEMO DATA. IUCN categories, ranges and notes here are a starting point
 *    compiled for the prototype. Verify every record against the IUCN Red List
 *    (iucnredlist.org) and Reptile Database / Amphibian Species of the World
 *    before publishing. Admins edit all of this from admin.html.
 *
 * Fields
 *   pack      snakes | lizards | frogs | turtles   (the paid packets)
 *   venom     venomous | mild | non               (mild = rear-fanged, not medically significant)
 *   toxic     poisonous | non                      (poisonous = toxic to touch/eat, e.g. toad skin)
 *   iucn      CR EN VU NT LC DD NE
 *   sensitive true → public maps/reports blur location to ~10 km (poaching / trade risk)
 *   regions   ISO 3166-2 codes where the species occurs (country code "IN" = whole country)
 */
(function (root) {
  const PACKS = [
    { id: 'snakes',   name: 'Snakes',             emoji: '🐍', color: '#2f7d4f', blurb: 'Cobras, kraits, vipers, pythons, keelbacks and more' },
    { id: 'lizards',  name: 'Lizards & Geckos',   emoji: '🦎', color: '#b7791f', blurb: 'Monitors, agamas, chameleons, skinks and geckos' },
    { id: 'frogs',    name: 'Frogs & Toads',      emoji: '🐸', color: '#2b6cb0', blurb: 'True frogs, tree frogs, toads and caecilians' },
    { id: 'turtles',  name: 'Turtles & Crocodiles', emoji: '🐢', color: '#9b2c2c', blurb: 'Tortoises, freshwater & sea turtles, crocodilians' },
  ];

  // Default prices in paise (INR × 100) — admins change these per region in admin.html
  const PRICES = [
    { pack: 'snakes',  region: 'IN', paise: 19900, days: 365 },
    { pack: 'lizards', region: 'IN', paise: 14900, days: 365 },
    { pack: 'frogs',   region: 'IN', paise: 14900, days: 365 },
    { pack: 'turtles', region: 'IN', paise: 9900,  days: 365 },
    // a single-state pack is cheaper than the whole-country pack
    { pack: 'snakes',  region: '*state', paise: 7900, days: 365 },
    { pack: 'lizards', region: '*state', paise: 5900, days: 365 },
    { pack: 'frogs',   region: '*state', paise: 5900, days: 365 },
    { pack: 'turtles', region: '*state', paise: 3900, days: 365 },
  ];

  const REGIONS = [
    ['IN', 'India', null],
    ['IN-AN', 'Andaman & Nicobar Islands', 'IN'], ['IN-AP', 'Andhra Pradesh', 'IN'], ['IN-AR', 'Arunachal Pradesh', 'IN'],
    ['IN-AS', 'Assam', 'IN'], ['IN-BR', 'Bihar', 'IN'], ['IN-CH', 'Chandigarh', 'IN'], ['IN-CT', 'Chhattisgarh', 'IN'],
    ['IN-DH', 'Dadra & Nagar Haveli and Daman & Diu', 'IN'], ['IN-DL', 'Delhi', 'IN'], ['IN-GA', 'Goa', 'IN'],
    ['IN-GJ', 'Gujarat', 'IN'], ['IN-HR', 'Haryana', 'IN'], ['IN-HP', 'Himachal Pradesh', 'IN'], ['IN-JK', 'Jammu & Kashmir', 'IN'],
    ['IN-JH', 'Jharkhand', 'IN'], ['IN-KA', 'Karnataka', 'IN'], ['IN-KL', 'Kerala', 'IN'], ['IN-LA', 'Ladakh', 'IN'],
    ['IN-LD', 'Lakshadweep', 'IN'], ['IN-MP', 'Madhya Pradesh', 'IN'], ['IN-MH', 'Maharashtra', 'IN'], ['IN-MN', 'Manipur', 'IN'],
    ['IN-ML', 'Meghalaya', 'IN'], ['IN-MZ', 'Mizoram', 'IN'], ['IN-NL', 'Nagaland', 'IN'], ['IN-OR', 'Odisha', 'IN'],
    ['IN-PY', 'Puducherry', 'IN'], ['IN-PB', 'Punjab', 'IN'], ['IN-RJ', 'Rajasthan', 'IN'], ['IN-SK', 'Sikkim', 'IN'],
    ['IN-TN', 'Tamil Nadu', 'IN'], ['IN-TG', 'Telangana', 'IN'], ['IN-TR', 'Tripura', 'IN'], ['IN-UP', 'Uttar Pradesh', 'IN'],
    ['IN-UT', 'Uttarakhand', 'IN'], ['IN-WB', 'West Bengal', 'IN'],
    ['LK', 'Sri Lanka', null], ['NP', 'Nepal', null], ['BD', 'Bangladesh', null], ['BT', 'Bhutan', null],
  ].map(([code, name, parent]) => ({ code, name, parent }));

  const PEN = ['IN-KA', 'IN-KL', 'IN-TN', 'IN-AP', 'IN-TG', 'IN-MH', 'IN-GA', 'IN-PY'];
  const MAIN = ['IN-AP', 'IN-AS', 'IN-BR', 'IN-CT', 'IN-DL', 'IN-GA', 'IN-GJ', 'IN-HR', 'IN-JH', 'IN-KA', 'IN-KL', 'IN-MP', 'IN-MH',
    'IN-OR', 'IN-PB', 'IN-RJ', 'IN-TN', 'IN-TG', 'IN-UP', 'IN-UT', 'IN-WB', 'IN-PY', 'IN-CH'];
  const NE = ['IN-AS', 'IN-AR', 'IN-ML', 'IN-MN', 'IN-MZ', 'IN-NL', 'IN-TR', 'IN-SK'];
  const COAST = ['IN-OR', 'IN-AP', 'IN-TN', 'IN-KL', 'IN-KA', 'IN-GA', 'IN-MH', 'IN-GJ', 'IN-WB', 'IN-AN', 'IN-LD', 'IN-PY'];
  const u = (...a) => [...new Set(a.flat())];

  const S = (pack, common, sci, family, o) => Object.assign({
    id: sci.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-+$/, ''),
    pack, common, sci, family, venom: 'non', toxic: 'non', iucn: 'LC', endemic: false, sensitive: false,
    size: '', habitat: '', distribution: '', id_notes: '', behaviour: '', similar: '', regions: [], images: [],
    traits: {},
  }, o);

  const SPECIES = [
    // ───── SNAKES ─────
    S('snakes', 'Spectacled Cobra', 'Naja naja', 'Elapidae', {
      venom: 'venomous', iucn: 'LC', size: '1.0–1.5 m (max ~2.2 m)',
      habitat: 'Farmland, scrub, forest edges, villages and suburbs; often near rodent-rich granaries and termite mounds.',
      distribution: 'Throughout mainland India below ~2000 m; also Sri Lanka, Nepal, Bangladesh, Pakistan.',
      id_notes: 'Raises hood when threatened; spectacle-shaped mark on the back of the hood; usually brown, black or tan.',
      behaviour: 'Mostly crepuscular. One of the “Big Four” medically important snakes — seek a hospital with anti-venom immediately after a bite.',
      similar: 'Indian Rat Snake (no hood, larger eyes); Monocled Cobra (single ring on hood).',
      regions: u('IN', MAIN, 'LK', 'NP', 'BD'), traits: { color: ['brown', 'black'], pattern: 'plain', time: 'dusk' },
    }),
    S('snakes', 'Common Krait', 'Bungarus caeruleus', 'Elapidae', {
      venom: 'venomous', iucn: 'LC', size: '0.9–1.2 m',
      habitat: 'Fields, scrub, rural houses; often enters homes at night and hides under bedding.',
      distribution: 'Most of mainland India; Sri Lanka, Nepal, Bangladesh, Pakistan.',
      id_notes: 'Glossy blue-black with thin paired white crossbands that become indistinct towards the head; enlarged hexagonal vertebral scales.',
      behaviour: 'Strictly nocturnal. Bite is often painless while the victim sleeps — use a mosquito net and sleep off the floor. “Big Four”.',
      similar: 'Common Wolf Snake (brown, bands broader near head, non-venomous).',
      regions: u('IN', MAIN, 'LK', 'NP', 'BD'), traits: { color: ['black', 'blue'], pattern: 'banded', time: 'night' },
    }),
    S('snakes', "Russell's Viper", 'Daboia russelii', 'Viperidae', {
      venom: 'venomous', iucn: 'LC', size: '1.0–1.2 m (stout)',
      habitat: 'Open grassland, scrub and farmland; avoids dense forest.',
      distribution: 'Most of mainland India, Sri Lanka, Nepal, Bangladesh, Pakistan.',
      id_notes: 'Three rows of dark brown, black-edged chain-like oval spots on a tan body; triangular head; very loud hiss.',
      behaviour: 'Nocturnal in hot weather. Responsible for many bites in paddy fields — wear boots and use a torch. “Big Four”.',
      similar: 'Indian Rock Python (blotches irregular, head with arrowhead mark).',
      regions: u('IN', MAIN, 'LK', 'NP', 'BD'), traits: { color: ['brown', 'tan'], pattern: 'spotted', time: 'night' },
    }),
    S('snakes', 'Saw-scaled Viper', 'Echis carinatus', 'Viperidae', {
      venom: 'venomous', iucn: 'LC', size: '0.3–0.6 m',
      habitat: 'Dry rocky scrub, laterite plateaus, sandy coasts.',
      distribution: 'Dry regions of peninsular and western India, Sri Lanka.',
      id_notes: 'Small; serrated keeled scales; arrow / trident mark on head; wavy pale zig-zag along flanks; rasps by rubbing coils.',
      behaviour: 'Nocturnal; very quick to strike. “Big Four”.',
      similar: 'Juvenile Russell’s Viper; Sand Boas (blunt tail, smooth).',
      regions: u('IN', 'IN-RJ', 'IN-GJ', 'IN-MH', 'IN-KA', 'IN-TN', 'IN-AP', 'IN-TG', 'IN-GA', 'IN-PY', 'LK'), traits: { color: ['brown', 'grey'], pattern: 'zigzag', time: 'night' },
    }),
    S('snakes', 'King Cobra', 'Ophiophagus hannah', 'Elapidae', {
      venom: 'venomous', iucn: 'VU', sensitive: true, size: '3–4 m (max ~5.5 m)',
      habitat: 'Evergreen and moist deciduous forest, often near streams; plantations.',
      distribution: 'Western Ghats, Eastern Ghats (patchy), Himalayan foothills, north-east India, Andaman Islands.',
      id_notes: 'Very long; narrow hood without spectacle mark; pale chevron bands; large occipital scales behind the head.',
      behaviour: 'Diurnal; feeds mainly on other snakes; female builds a leaf-litter nest. Rarely aggressive unless cornered.',
      similar: 'Indian Rat Snake / Banded Racer (no hood).',
      regions: u('IN', 'IN-KL', 'IN-KA', 'IN-GA', 'IN-TN', 'IN-OR', 'IN-UT', 'IN-WB', NE, 'IN-AN', 'NP', 'BD', 'BT'), traits: { color: ['olive', 'black', 'brown'], pattern: 'banded', time: 'day' },
    }),
    S('snakes', 'Indian Rock Python', 'Python molurus', 'Pythonidae', {
      venom: 'non', iucn: 'NT', sensitive: true, size: '2–4 m',
      habitat: 'Forests, grassland, rocky hills and swamps, usually near water.',
      distribution: 'Mainland India, Sri Lanka, Nepal, Bangladesh, Pakistan. Protected under Schedule I (WPA 1972).',
      id_notes: 'Heavy body with irregular dark blotches; pinkish arrowhead mark on head; heat-sensing pits on lip scales.',
      behaviour: 'Constrictor; slow-moving; often basks.',
      similar: "Russell's Viper (three neat chain rows); Common Sand Boa.",
      regions: u('IN', MAIN, 'LK', 'NP', 'BD'), traits: { color: ['brown', 'tan'], pattern: 'blotched', time: 'any' },
    }),
    S('snakes', 'Indian Rat Snake', 'Ptyas mucosa', 'Colubridae', {
      venom: 'non', iucn: 'LC', size: '1.5–2.5 m',
      habitat: 'Farmland, towns, wetlands, forest edges — wherever rodents are.',
      distribution: 'Throughout India including the Andaman Islands; South and South-east Asia.',
      id_notes: 'Long, slender, olive-brown with dark crossbars on the rear body and tail; large eyes; dark lines between lip scales.',
      behaviour: 'Diurnal, fast; excellent rodent controller. Growls and inflates throat when cornered.',
      similar: 'Spectacled Cobra (hood, smaller eyes).',
      regions: u('IN', MAIN, NE, 'IN-AN', 'LK', 'NP', 'BD', 'BT'), traits: { color: ['olive', 'brown', 'yellow'], pattern: 'banded', time: 'day' },
    }),
    S('snakes', 'Checkered Keelback', 'Fowlea piscator', 'Natricidae', {
      venom: 'non', iucn: 'LC', size: '0.6–1.2 m',
      habitat: 'Ponds, rice fields, rivers, tanks — rarely far from water.',
      distribution: 'Throughout India and South Asia.',
      id_notes: 'Olive with a checkerboard of dark spots; two black lines from eye to lip; keeled scales.',
      behaviour: 'Diurnal and nocturnal; feeds on fish and frogs; bites readily but harmless.',
      similar: "Russell's Viper (on land; chain spots); Olive Keelback.",
      regions: u('IN', MAIN, NE, 'LK', 'NP', 'BD'), traits: { color: ['olive', 'yellow'], pattern: 'checkered', time: 'any' },
    }),
    S('snakes', 'Common Wolf Snake', 'Lycodon aulicus', 'Colubridae', {
      venom: 'non', iucn: 'LC', size: '0.4–0.8 m',
      habitat: 'Houses, walls, tree holes, gardens — climbs well.',
      distribution: 'Throughout India incl. Andaman & Nicobar; South-east Asia.',
      id_notes: 'Brown with narrow white or yellow crossbands that are broader near the head; flat head; white lips.',
      behaviour: 'Nocturnal; eats geckos. Often mistaken for kraits.',
      similar: 'Common Krait (blue-black, paired thin bands fading toward head — venomous).',
      regions: u('IN', MAIN, NE, 'IN-AN', 'LK', 'NP', 'BD'), traits: { color: ['brown'], pattern: 'banded', time: 'night' },
    }),
    S('snakes', 'Green Vine Snake', 'Ahaetulla nasuta', 'Colubridae', {
      venom: 'mild', iucn: 'LC', size: '1–1.5 m (very slender)',
      habitat: 'Shrubs and trees in forests and gardens.',
      distribution: 'Western Ghats, Sri Lanka and parts of peninsular India.',
      id_notes: 'Bright green, whip-thin; long pointed snout; horizontal keyhole pupils.',
      behaviour: 'Diurnal; rear-fanged — mild venom, not medically significant.',
      similar: 'Green Keelback (rounded snout).',
      regions: u('IN', PEN, 'LK'), traits: { color: ['green'], pattern: 'plain', time: 'day' },
    }),
    S('snakes', 'Andaman Krait', 'Bungarus andamanensis', 'Elapidae', {
      venom: 'venomous', iucn: 'DD', endemic: true, size: '0.8–1.0 m',
      habitat: 'Lowland forest, plantations and settlements.',
      distribution: 'Endemic to the Andaman Islands.',
      id_notes: 'Black with numerous narrow white crossbands; smooth glossy scales; enlarged vertebral row.',
      behaviour: 'Nocturnal. Treat any bite as a medical emergency.',
      similar: 'Common Wolf Snake.',
      regions: ['IN', 'IN-AN'], traits: { color: ['black'], pattern: 'banded', time: 'night' },
    }),
    S('snakes', 'Andaman Pit Viper', 'Trimeresurus andersonii', 'Viperidae', {
      venom: 'venomous', iucn: 'LC', endemic: true, size: '0.5–0.8 m',
      habitat: 'Forest floor, plantations, mangrove edges; often coiled on low vegetation.',
      distribution: 'Endemic to the Andaman Islands.',
      id_notes: 'Green to brown, often with dark blotches; triangular head with heat-sensing loreal pit.',
      behaviour: 'Nocturnal ambush predator.',
      similar: 'Green Vine Snake (pointed snout, no pit).',
      regions: ['IN', 'IN-AN'], traits: { color: ['green', 'brown'], pattern: 'blotched', time: 'night' },
    }),

    // ───── LIZARDS & GECKOS ─────
    S('lizards', 'Bengal Monitor', 'Varanus bengalensis', 'Varanidae', {
      iucn: 'LC', sensitive: true, size: '0.6–1.75 m incl. tail',
      habitat: 'Forest, farmland, villages; shelters in burrows, tree hollows and walls.',
      distribution: 'Throughout mainland India; South and South-east Asia. Schedule I (WPA 1972).',
      id_notes: 'Large grey-brown lizard; long forked tongue; slit-like nostrils midway between eye and snout.',
      behaviour: 'Diurnal; poached for meat and “hatha jodi” trade.',
      similar: 'Water Monitor (yellow spots, near water).',
      regions: u('IN', MAIN, NE, 'NP', 'BD', 'LK'), traits: { color: ['grey', 'brown'], pattern: 'spotted', time: 'day' },
    }),
    S('lizards', 'Oriental Garden Lizard', 'Calotes versicolor', 'Agamidae', {
      iucn: 'LC', size: '25–37 cm incl. tail',
      habitat: 'Gardens, hedges, scrub, open forest.',
      distribution: 'Throughout India; widespread in Asia.',
      id_notes: 'Crest along neck and back; breeding males get a red head and throat (“bloodsucker”).',
      behaviour: 'Diurnal; harmless insect-eater.',
      similar: 'Forest Calotes (green).',
      regions: u('IN', MAIN, NE, 'IN-AN', 'LK', 'NP', 'BD', 'BT'), traits: { color: ['brown', 'red', 'yellow'], pattern: 'banded', time: 'day' },
    }),
    S('lizards', 'Indian Chameleon', 'Chamaeleo zeylanicus', 'Chamaeleonidae', {
      iucn: 'LC', sensitive: true, size: '25–38 cm',
      habitat: 'Dry deciduous forest and scrub; perches on bushes.',
      distribution: 'Peninsular India, Gujarat, Rajasthan, Sri Lanka. Schedule II.',
      id_notes: 'Laterally compressed body, independently rotating eyes, prehensile tail, zygodactyl feet.',
      behaviour: 'Diurnal, very slow; changes colour with mood.',
      similar: 'None in India.',
      regions: u('IN', PEN, 'IN-GJ', 'IN-RJ', 'IN-MP', 'IN-OR', 'LK'), traits: { color: ['green', 'yellow', 'brown'], pattern: 'plain', time: 'day' },
    }),
    S('lizards', 'Common House Gecko', 'Hemidactylus frenatus', 'Gekkonidae', {
      iucn: 'LC', size: '7–15 cm',
      habitat: 'Walls and ceilings of buildings, near lights.',
      distribution: 'Throughout India incl. islands; pantropical.',
      id_notes: 'Pale grey-pink; small tubercles; chuck-chuck-chuck call at night.',
      behaviour: 'Nocturnal; hunts insects at lights.',
      similar: 'Brook’s Gecko (more tubercles, spots).',
      regions: u('IN', MAIN, NE, 'IN-AN', 'IN-LD', 'LK', 'NP', 'BD'), traits: { color: ['grey', 'pink'], pattern: 'plain', time: 'night' },
    }),
    S('lizards', 'Tokay Gecko', 'Gekko gecko', 'Gekkonidae', {
      iucn: 'LC', sensitive: true, size: '20–35 cm',
      habitat: 'Tree trunks, cliffs, old buildings.',
      distribution: 'North-east India, West Bengal; South-east Asia. Heavily traded — CITES Appendix II.',
      id_notes: 'Large blue-grey gecko with orange-red spots; loud “to-kay” call.',
      behaviour: 'Nocturnal; bites hard.',
      similar: 'None.',
      regions: u('IN', NE, 'IN-WB', 'BD', 'NP', 'BT'), traits: { color: ['blue', 'grey', 'orange'], pattern: 'spotted', time: 'night' },
    }),
    S('lizards', 'Fan-throated Lizard', 'Sitana ponticeriana', 'Agamidae', {
      iucn: 'LC', size: '12–20 cm',
      habitat: 'Open dry ground, coastal sand, laterite and scrub.',
      distribution: 'Peninsular India and Sri Lanka (several split species now recognised — check local taxonomy).',
      id_notes: 'Males display a large blue, black and orange dewlap; runs on hind legs.',
      behaviour: 'Diurnal; displays in the breeding season.',
      similar: 'Sarada spp.',
      regions: u('IN', PEN, 'LK'), traits: { color: ['brown'], pattern: 'spotted', time: 'day' },
    }),
    S('lizards', 'Andaman Day Gecko', 'Phelsuma andamanensis', 'Gekkonidae', {
      iucn: 'LC', endemic: true, size: '10–13 cm',
      habitat: 'Coconut palms, banana plants, houses and forest edge.',
      distribution: 'Endemic to the Andaman Islands (introduced elsewhere).',
      id_notes: 'Bright green with red spots on the back and a blue tint near the tail; active by day.',
      behaviour: 'Diurnal; laps nectar and insects.',
      similar: 'None in the Andamans.',
      regions: ['IN', 'IN-AN'], traits: { color: ['green', 'red'], pattern: 'spotted', time: 'day' },
    }),

    // ───── FROGS & TOADS ─────
    S('frogs', 'Asian Common Toad', 'Duttaphrynus melanostictus', 'Bufonidae', {
      toxic: 'poisonous', iucn: 'LC', size: '6–15 cm',
      habitat: 'Gardens, houses, fields, forest — very adaptable.',
      distribution: 'Throughout India incl. Andaman Islands (introduced); South and South-east Asia.',
      id_notes: 'Warty dry skin, black-tipped warts, bony ridges on head, large parotoid glands.',
      behaviour: 'Nocturnal. Parotoid glands secrete bufotoxins — poisonous to pets; wash hands after handling.',
      similar: 'Marbled Toad.',
      regions: u('IN', MAIN, NE, 'IN-AN', 'LK', 'NP', 'BD'), traits: { color: ['brown', 'yellow'], pattern: 'warty', time: 'night' },
    }),
    S('frogs', 'Indian Bullfrog', 'Hoplobatrachus tigerinus', 'Dicroglossidae', {
      iucn: 'LC', size: '10–17 cm',
      habitat: 'Ponds, paddy fields, ditches.',
      distribution: 'Most of India; introduced to the Andamans; Nepal, Bangladesh, Pakistan.',
      id_notes: 'Large olive frog with a pale mid-dorsal stripe; breeding males turn bright yellow with blue vocal sacs.',
      behaviour: 'Explosive breeder after the first monsoon rains.',
      similar: 'Jerdon’s Bullfrog.',
      regions: u('IN', MAIN, NE, 'IN-AN', 'NP', 'BD'), traits: { color: ['olive', 'yellow', 'green'], pattern: 'striped', time: 'night' },
    }),
    S('frogs', 'Indian Purple Frog', 'Nasikabatrachus sahyadrensis', 'Nasikabatrachidae', {
      iucn: 'EN', endemic: true, sensitive: true, size: '5–9 cm',
      habitat: 'Burrows underground near seasonal streams in the Western Ghats; surfaces only a few days a year to breed.',
      distribution: 'Endemic to the Western Ghats (Kerala, Tamil Nadu, Karnataka).',
      id_notes: 'Bloated purple-grey body, tiny head and pointed white snout.',
      behaviour: 'Fossorial; eats termites.',
      similar: 'Bhupathy’s Purple Frog (Nasikabatrachus bhupathi).',
      regions: ['IN', 'IN-KL', 'IN-TN', 'IN-KA'], traits: { color: ['purple', 'grey'], pattern: 'plain', time: 'night' },
    }),
    S('frogs', 'Malabar Gliding Frog', 'Rhacophorus malabaricus', 'Rhacophoridae', {
      iucn: 'LC', endemic: true, size: '7–10 cm',
      habitat: 'Evergreen and moist forest canopy; breeds over pools, building foam nests on leaves.',
      distribution: 'Endemic to the Western Ghats.',
      id_notes: 'Bright green with large red-orange webbed feet used for gliding.',
      behaviour: 'Nocturnal, arboreal.',
      similar: 'Other Rhacophorus spp.',
      regions: ['IN', 'IN-KL', 'IN-KA', 'IN-TN', 'IN-GA', 'IN-MH'], traits: { color: ['green', 'red'], pattern: 'plain', time: 'night' },
    }),
    S('frogs', 'Common Indian Tree Frog', 'Polypedates maculatus', 'Rhacophoridae', {
      iucn: 'LC', size: '5–8 cm',
      habitat: 'Houses, bathrooms, gardens, forest edges.',
      distribution: 'Most of India, Sri Lanka, Nepal, Bangladesh.',
      id_notes: 'Smooth buff-brown skin, large toe-discs, yellow-spotted inner thighs.',
      behaviour: 'Nocturnal; lays eggs in foam nests above water.',
      similar: 'Polypedates leucomystax (NE India).',
      regions: u('IN', MAIN, 'LK', 'NP', 'BD'), traits: { color: ['brown', 'grey'], pattern: 'plain', time: 'night' },
    }),

    // ───── TURTLES & CROCODILES ─────
    S('turtles', 'Mugger Crocodile', 'Crocodylus palustris', 'Crocodylidae', {
      iucn: 'VU', sensitive: true, size: '2–4 m',
      habitat: 'Rivers, lakes, reservoirs and marshes (freshwater).',
      distribution: 'Most of India except the north-east; Sri Lanka, Nepal, Pakistan, Iran.',
      id_notes: 'Broad snout (broadest of living crocodiles); olive-grey; no ridges in front of eyes.',
      behaviour: 'Can be dangerous; keep distance from banks.',
      similar: 'Saltwater Crocodile (narrower snout, coastal).',
      regions: u('IN', 'IN-GJ', 'IN-RJ', 'IN-MP', 'IN-MH', 'IN-KA', 'IN-TN', 'IN-AP', 'IN-TG', 'IN-OR', 'IN-UP', 'IN-UT', 'IN-KL', 'IN-GA', 'IN-CT', 'LK', 'NP'),
      traits: { color: ['olive', 'grey'], pattern: 'plain', time: 'any' },
    }),
    S('turtles', 'Saltwater Crocodile', 'Crocodylus porosus', 'Crocodylidae', {
      iucn: 'LC', sensitive: true, size: '3–6 m',
      habitat: 'Mangroves, estuaries, tidal creeks, coastal sea.',
      distribution: 'Bhitarkanika (Odisha), Sundarbans (West Bengal), Andaman & Nicobar Islands.',
      id_notes: 'Massive; ridges from eyes along snout; few or no enlarged scales behind the head.',
      behaviour: 'Dangerous. Never swim in creeks in the Andamans or Sundarbans.',
      similar: 'Mugger (broader snout, freshwater).',
      regions: ['IN', 'IN-OR', 'IN-WB', 'IN-AN', 'BD', 'LK'], traits: { color: ['olive', 'grey', 'yellow'], pattern: 'plain', time: 'any' },
    }),
    S('turtles', 'Gharial', 'Gavialis gangeticus', 'Gavialidae', {
      iucn: 'CR', sensitive: true, size: '3.5–6 m',
      habitat: 'Deep, fast-flowing rivers with sandbanks for basking and nesting.',
      distribution: 'Chambal, Girwa, Gandak, Son and Ramganga rivers; Nepal.',
      id_notes: 'Extremely long, thin snout; adult males carry a bulbous “ghara” at the snout tip.',
      behaviour: 'Fish-eater; harmless to people.',
      similar: 'None.',
      regions: ['IN', 'IN-MP', 'IN-RJ', 'IN-UP', 'IN-BR', 'IN-UT', 'NP'], traits: { color: ['olive', 'grey'], pattern: 'plain', time: 'day' },
    }),
    S('turtles', 'Indian Star Tortoise', 'Geochelone elegans', 'Testudinidae', {
      iucn: 'VU', sensitive: true, size: '15–28 cm carapace',
      habitat: 'Dry scrub, grassland and thorn forest.',
      distribution: 'North-west (Gujarat, Rajasthan), south-east India and Sri Lanka. CITES Appendix I — one of the most trafficked tortoises.',
      id_notes: 'Domed shell with raised scutes, each with a yellow star-radiating pattern on black.',
      behaviour: 'Active after rain, early morning and evening.',
      similar: 'None.',
      regions: ['IN', 'IN-GJ', 'IN-RJ', 'IN-AP', 'IN-TN', 'IN-KA', 'IN-TG', 'LK'], traits: { color: ['yellow', 'black'], pattern: 'star', time: 'day' },
    }),
    S('turtles', 'Indian Flapshell Turtle', 'Lissemys punctata', 'Trionychidae', {
      iucn: 'VU', size: '20–35 cm carapace',
      habitat: 'Ponds, tanks, canals, rivers — even temporary water.',
      distribution: 'Throughout mainland India; Sri Lanka, Nepal, Bangladesh, Pakistan.',
      id_notes: 'Soft-shelled with skin flaps on the plastron that close over the hind limbs; olive with yellow spots.',
      behaviour: 'Aestivates in mud during dry season.',
      similar: 'Indian Softshell Turtle (Nilssonia gangetica, no flaps).',
      regions: u('IN', MAIN, 'LK', 'NP', 'BD'), traits: { color: ['olive', 'yellow'], pattern: 'spotted', time: 'any' },
    }),
    S('turtles', 'Olive Ridley Sea Turtle', 'Lepidochelys olivacea', 'Cheloniidae', {
      iucn: 'VU', sensitive: true, size: '60–70 cm carapace',
      habitat: 'Open ocean; nests on sandy beaches in mass arribadas.',
      distribution: 'All Indian coasts; mass nesting at Gahirmatha, Rushikulya and Devi (Odisha).',
      id_notes: 'Small, olive heart-shaped shell with 5+ pairs of costal scutes.',
      behaviour: 'Report stranded or dead turtles to the Forest Department.',
      similar: 'Green Turtle (4 pairs of costal scutes).',
      regions: u('IN', COAST, 'LK', 'BD'), traits: { color: ['olive', 'grey'], pattern: 'plain', time: 'night' },
    }),
    S('turtles', 'Leatherback Sea Turtle', 'Dermochelys coriacea', 'Dermochelyidae', {
      iucn: 'VU', sensitive: true, size: '1.5–2 m carapace',
      habitat: 'Open ocean; nests on high-energy beaches.',
      distribution: 'Nests in Great & Little Nicobar and Little Andaman; rare on mainland coasts.',
      id_notes: 'Largest turtle; leathery black shell with seven longitudinal ridges and white spots.',
      behaviour: 'Feeds on jellyfish; threatened by plastic.',
      similar: 'None.',
      regions: ['IN', 'IN-AN', 'LK'], traits: { color: ['black'], pattern: 'spotted', time: 'night' },
    }),
    S('turtles', 'Northern River Terrapin', 'Batagur baska', 'Geoemydidae', {
      iucn: 'CR', sensitive: true, size: '50–60 cm carapace',
      habitat: 'Tidal rivers and mangrove creeks.',
      distribution: 'Sundarbans (West Bengal, Bangladesh) and Odisha.',
      id_notes: 'Large hard-shelled terrapin; breeding males turn black with a crimson head.',
      behaviour: 'Among the world’s rarest turtles.',
      similar: 'None.',
      regions: ['IN', 'IN-WB', 'IN-OR', 'BD'], traits: { color: ['grey', 'black'], pattern: 'plain', time: 'day' },
    }),
  ];

  // Admin-defined regional checklists (eBird-style). Default: every species whose range includes the region.
  const CHECKLISTS = REGIONS.map(r => ({
    region: r.code,
    species: SPECIES.filter(s => s.regions.includes(r.code)).map(s => s.id),
  })).filter(c => c.species.length);

  root.HW_SEED = { PACKS, PRICES, REGIONS, SPECIES, CHECKLISTS };
  if (typeof module !== 'undefined') module.exports = root.HW_SEED;
})(typeof window !== 'undefined' ? window : globalThis);
