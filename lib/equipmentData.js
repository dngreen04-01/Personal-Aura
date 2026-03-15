// Shared equipment categories used by both private locations and shared gym database
export const EQUIPMENT_CATEGORIES = [
  { category: 'Free Weights', items: [
    { id: 'barbell', label: 'Barbell' },
    { id: 'dumbbells', label: 'Dumbbells' },
    { id: 'ez_curl_bar', label: 'EZ Curl Bar' },
    { id: 'kettlebells', label: 'Kettlebells' },
  ]},
  { category: 'Machines', items: [
    { id: 'cable_machine', label: 'Cable Machine' },
    { id: 'smith_machine', label: 'Smith Machine' },
    { id: 'leg_press', label: 'Leg Press' },
    { id: 'lat_pulldown', label: 'Lat Pulldown' },
    { id: 'chest_press', label: 'Chest Press Machine' },
    { id: 'leg_curl', label: 'Leg Curl Machine' },
    { id: 'leg_extension', label: 'Leg Extension' },
  ]},
  { category: 'Bodyweight & Other', items: [
    { id: 'pull_up_bar', label: 'Pull-up Bar' },
    { id: 'dip_bars', label: 'Dip Bars' },
    { id: 'bench', label: 'Bench (Flat/Incline)' },
    { id: 'resistance_bands', label: 'Resistance Bands' },
    { id: 'trx', label: 'TRX / Suspension Trainer' },
  ]},
];

export const ALL_EQUIPMENT_IDS = EQUIPMENT_CATEGORIES.flatMap(c => c.items.map(i => i.id));
