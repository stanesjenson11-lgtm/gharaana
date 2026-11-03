// Sample listings for development and demos, loaded into Postgres by scripts/seed-db.ts.
import { LOCALITIES } from "./places.ts";
import { RENTALS, type Listing, type Photo, type PropertyKind, type Room } from "./search.ts";

const u = (id: string) => `https://images.unsplash.com/photo-${id}?fit=crop&ar=4:3`;
const pool = (room: Room, rows: [string, string][]): Photo[] => rows.map(([id, credit]) => ({ src: u(id), room, credit }));

// All photos from Unsplash (free licence). Credits kept for the photo viewer.
const LIVING = pool("living", [
  ["1745429523615-2a82c60bfc02", "Poojan Thanekar"],
  ["1745429523617-0d837856ca35", "Poojan Thanekar"],
  ["1745429523637-60f5986cc1db", "Poojan Thanekar"],
  ["1645237455598-e8f02d706a4e", "Kapil Rai"],
  ["1638454795595-0a0abf68614d", "Lotus Design N Print"],
  ["1757924461488-ef9ad0670978", "Aalo Lens"],
  ["1665249934445-1de680641f50", "Danilo Rios"],
  ["1628592102751-ba83b0314276", "Huy Nguyen"],
  ["1745301558339-44eb3217d5da", "Spl Interiors"],
  ["1746517757473-7c88850e539b", "Spl Interiors"],
  ["1682662046610-fbdb3db4bd74", "Pyx Photography"],
  ["1742319096901-b8dc2e2734cc", "Mustafa Fatemi"],
  ["1682662046486-23b39bda0799", "Pyx Photography"],
  ["1785402231092-859d0a6c4397", "Home Makers Interior"],
  ["1740989488591-55648f155236", "Annie Spratt"],
  ["1576324743689-80f049ed6f44", "Ayyappan Mk"],
]);
const BEDROOM = pool("bedroom", [
  ["1750420556288-d0e32a6f517b", "Spl Interiors"],
  ["1785232273548-4beae5334903", "Home Makers Interior"],
  ["1771327811795-6197403af846", "Anisha Deb"],
  ["1771328756144-02bde5549a9a", "Anisha Deb"],
  ["1771327811766-5f4149190b3d", "Anisha Deb"],
  ["1771328756051-dff10c3feaab", "Anisha Deb"],
  ["1662352137320-d1ac1494c8f1", "Antony Hyson Seltran"],
  ["1640912744459-0aea6e0b1bd5", "Kapil Rai"],
]);
const KITCHEN = pool("kitchen", [
  ["1745429523635-ad375f836bf2", "Poojan Thanekar"],
  ["1764080582659-652c0000ff1d", "Poojan Thanekar"],
  ["1702014861373-527115231f8c", "Aquilion Property"],
  ["1737233463795-34fccdfc67bb", "Prydumano Design"],
  ["1702014859908-d48b9b844240", "Aquilion Property"],
]);
const BATHROOM = pool("bathroom", [
  ["1737233523182-99e287258d58", "Prydumano Design"],
  ["1737233536991-8ee3f92b7781", "Prydumano Design"],
  ["1702014860610-06a4c3f83381", "Aquilion Property"],
  ["1781249144526-2cfd9375dc7a", "Irena Oze"],
]);
const APARTMENT = pool("exterior", [
  ["1630618468400-ac074bd3408f", "Sanjan Shetty"],
  ["1629692747458-b3360f3267d0", "Tony Sebastian"],
  ["1564486593523-38d62206e706", "J Ahmed Sait"],
  ["1639335944967-03b902ead5fd", "Abhijit M"],
  ["1663985139222-6af2f8646104", "Jacob Vathikulam"],
  ["1636392881522-e1f0e14fcfe2", "Aabid Sakir"],
  ["1670504503763-7026e1ad278b", "Ankit Ahirwar"],
]);
const HOUSE = pool("exterior", [
  ["1643602475901-9f67ab7d8196", "Aabid Sakir"],
  ["1665329140125-7f29b6fe01b9", "Rushikesh Patil"],
  ["1605640214887-5f1f80e46cd4", "Hrishikesh Nag"],
]);
const BALCONY = pool("balcony", [
  ["1765775585873-868ae680fc26", "Uppu Vamsi"],
  ["1655122899565-18f1322f1d78", "Vishwanth Pindiboina"],
  ["1600555179901-107bf80d25cf", "Punid Ramesh"],
  ["1638967439123-04ba332b681a", "Vishwanth Pindiboina"],
]);

// Shift each lap through a pool so listings 16 apart (often neighbours on the map) don't share a cover.
const pick = (p: Photo[], i: number) => p[(i + Math.floor(i / p.length) * 3) % p.length];

function photosFor(i: number, kind: PropertyKind, bhk: number): Photo[] {
  const outside = kind === "apartment" ? pick(APARTMENT, i) : pick(HOUSE, i);
  const inside = [pick(LIVING, i), pick(BEDROOM, i), pick(KITCHEN, i), pick(BATHROOM, i)];
  if (bhk >= 2) inside.splice(2, 0, pick(BEDROOM, i + 3));
  const all = [...inside, pick(BALCONY, i)];
  // Houses lead with the outside; flats lead with the living room.
  return kind === "apartment" ? [...all.slice(0, 1), outside, ...all.slice(1)] : [outside, ...all];
}

const AMENITY_SETS = {
  society: ["Lift", "Power backup", "24×7 security", "Gym", "Swimming pool", "Club house", "Children's play area", "Gas pipeline", "CCTV", "Visitor parking"],
  building: ["Lift", "Power backup", "24×7 security", "Intercom", "Rainwater harvesting"],
  house: ["Power backup", "Rainwater harvesting"],
};

const KIND_WORD: Record<PropertyKind, string> = { apartment: "flat", "independent-house": "independent house", villa: "villa" };
const FURNISHED = { full: "fully furnished", semi: "semi-furnished", none: "unfurnished" } as const;
const ordinal = (n: number) => (n === 0 ? "ground" : n + (["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? "th"));

type Spec = Pick<Listing, "type" | "bhk" | "area" | "price" | "carpetSqft" | "floor" | "totalFloors" | "furnishing" | "facing" | "ageYears" | "listedDaysAgo" | "confirmedDaysAgo"> &
  Partial<Listing> & { at: keyof typeof LOCALITIES; d: [number, number]; who: string; amen: keyof typeof AMENITY_SETS; note: string };

const SPECS: Spec[] = [
  { type: "rent", at: "Koramangala", area: "5th Block", d: [0.002, -0.003], bhk: 2, price: 45000, maintenance: 2500, deposit: 225000, carpetSqft: 1150, floor: 3, totalFloors: 4, furnishing: "semi", facing: "East", ageYears: 8, pets: true, parking: "car", who: "Priya S.", amen: "building", listedDaysAgo: 6, confirmedDaysAgo: 2, note: "Five minutes' walk to Forum Mall and the 80 Feet Road cafés." },
  { type: "rent", at: "Koramangala", area: "8th Block", d: [-0.005, -0.008], bhk: 1, price: 26000, maintenance: 1500, deposit: 100000, carpetSqft: 620, floor: 2, totalFloors: 3, furnishing: "full", facing: "North", ageYears: 12, availableInDays: 7, tenants: ["bachelors"], parking: "bike", who: "Ramesh K.", amen: "house", listedDaysAgo: 3, confirmedDaysAgo: 0, note: "Comes with a washing machine, fridge and two air conditioners." },
  { type: "rent", at: "Koramangala", area: "1st Block", d: [0.006, 0.006], bhk: 3, price: 72000, maintenance: 6000, deposit: 400000, carpetSqft: 1650, floor: 6, totalFloors: 12, furnishing: "semi", facing: "North-East", ageYears: 4, availableInDays: 15, tenants: ["family"], pets: true, parking: "car", balconies: 2, who: "Ananya R.", amen: "society", listedDaysAgo: 10, confirmedDaysAgo: 1, note: "Gated society with a pool, gym and a large children's play area." },
  { type: "rent", at: "HSR Layout", area: "Sector 2", d: [0.003, -0.004], bhk: 2, price: 38000, maintenance: 3000, deposit: 150000, carpetSqft: 1100, floor: 2, totalFloors: 4, furnishing: "semi", facing: "East", ageYears: 6, pets: true, parking: "car", who: "Mohammed I.", amen: "building", listedDaysAgo: 4, confirmedDaysAgo: 1, note: "A quiet, tree-lined street ten minutes from the Outer Ring Road." },
  { type: "rent", at: "HSR Layout", area: "Sector 6", d: [-0.004, 0.003], bhk: 0, price: 14000, maintenance: 0, deposit: 50000, carpetSqft: 350, floor: 3, totalFloors: 3, furnishing: "full", facing: "West", ageYears: 10, tenants: ["bachelors"], parking: "bike", who: "Lakshmi N.", amen: "house", listedDaysAgo: 2, confirmedDaysAgo: 0, note: "A compact studio with its own kitchenette, right for one person." },
  { type: "rent", at: "HSR Layout", area: "Sector 1", d: [0.007, 0.002], bhk: 3, price: 62000, maintenance: 5000, deposit: 300000, carpetSqft: 1500, floor: 5, totalFloors: 9, furnishing: "full", facing: "North", ageYears: 3, availableInDays: 30, tenants: ["family", "company"], nonVeg: false, parking: "car", balconies: 2, who: "Vikram P.", amen: "society", listedDaysAgo: 15, confirmedDaysAgo: 4, note: "A corner flat with cross-ventilation and a view over the Agara lake park." },
  { type: "rent", at: "Indiranagar", area: "12th Main", d: [-0.002, 0.003], bhk: 2, price: 55000, maintenance: 3500, deposit: 300000, carpetSqft: 1200, floor: 1, totalFloors: 3, furnishing: "semi", facing: "East", ageYears: 15, availableInDays: 7, pets: true, parking: "car", who: "Sunita D.", amen: "building", listedDaysAgo: 8, confirmedDaysAgo: 3, note: "A full floor in a three-storey house, two lanes from 12th Main." },
  { type: "rent", at: "Indiranagar", area: "Defence Colony", kind: "independent-house", d: [0.005, -0.002], bhk: 3, price: 95000, maintenance: 0, deposit: 500000, carpetSqft: 2200, floor: 0, totalFloors: 2, furnishing: "semi", facing: "North", ageYears: 20, availableInDays: 30, tenants: ["family"], pets: true, parking: "car", balconies: 2, who: "Arjun M.", amen: "house", listedDaysAgo: 20, confirmedDaysAgo: 6, note: "The whole house, with a front garden and a covered car porch." },
  { type: "rent", at: "Indiranagar", area: "HAL 2nd Stage", d: [0.001, -0.004], bhk: 1, price: 30000, maintenance: 2000, deposit: 150000, carpetSqft: 650, floor: 2, totalFloors: 4, furnishing: "full", facing: "South", ageYears: 9, parking: "bike", who: "Kavya H.", amen: "building", listedDaysAgo: 1, confirmedDaysAgo: 0, note: "Two minutes' walk from Indiranagar metro station." },
  { type: "rent", at: "Whitefield", area: "ITPL Main Road", d: [0.008, -0.01], bhk: 2, price: 34000, maintenance: 4500, deposit: 170000, carpetSqft: 1180, floor: 9, totalFloors: 14, furnishing: "semi", facing: "East", ageYears: 5, pets: true, parking: "car", balconies: 2, who: "Farhan A.", amen: "society", listedDaysAgo: 5, confirmedDaysAgo: 2, note: "Walk to ITPL. The society runs a shuttle to Hoodi metro." },
  { type: "rent", at: "Whitefield", area: "Varthur Road", kind: "villa", d: [-0.012, 0.004], bhk: 3, price: 85000, maintenance: 7000, deposit: 500000, carpetSqft: 2400, floor: 0, totalFloors: 2, furnishing: "full", facing: "East", ageYears: 2, availableInDays: 15, tenants: ["family"], pets: true, parking: "car", bathrooms: 4, balconies: 3, who: "Deepa V.", amen: "society", listedDaysAgo: 9, confirmedDaysAgo: 3, note: "A villa in a gated community with a clubhouse and round-the-clock security." },
  { type: "rent", at: "Whitefield", area: "Hope Farm Junction", d: [0.004, 0.006], bhk: 1, price: 20000, maintenance: 2000, deposit: 80000, carpetSqft: 600, floor: 4, totalFloors: 6, furnishing: "semi", facing: "West", ageYears: 7, availableInDays: 7, parking: "bike", who: "Suresh B.", amen: "building", listedDaysAgo: 6, confirmedDaysAgo: 1, note: "Bus stop at the gate, and a supermarket on the ground floor." },
  { type: "rent", at: "Bellandur", area: "near Ecospace", d: [0.002, -0.004], bhk: 2, price: 42000, maintenance: 4000, deposit: 200000, carpetSqft: 1250, floor: 11, totalFloors: 18, furnishing: "semi", facing: "North-East", ageYears: 4, tenants: ["company"], pets: true, parking: "car", balconies: 2, who: "Meera J.", amen: "society", listedDaysAgo: 3, confirmedDaysAgo: 0, note: "Across the road from the Ecospace business park." },
  { type: "rent", at: "Bellandur", area: "Green Glen Layout", d: [-0.005, 0.004], bhk: 3, price: 68000, maintenance: 6500, deposit: 350000, carpetSqft: 1700, floor: 7, totalFloors: 14, furnishing: "full", facing: "East", ageYears: 6, availableInDays: 30, tenants: ["family"], pets: true, parking: "car", balconies: 2, who: "Rahul G.", amen: "society", listedDaysAgo: 18, confirmedDaysAgo: 8, note: "Fully furnished, down to the curtains and a modular kitchen." },
  { type: "rent", at: "Marathahalli", area: "AECS Layout", d: [0.003, 0.002], bhk: 2, price: 28000, maintenance: 2000, deposit: 120000, carpetSqft: 1000, floor: 2, totalFloors: 4, furnishing: "none", facing: "East", ageYears: 11, pets: true, parking: "bike", who: "Shalini T.", amen: "building", listedDaysAgo: 7, confirmedDaysAgo: 2, note: "Unfurnished and freshly painted, so you can bring your own things." },
  { type: "rent", at: "Electronic City", area: "Phase 1", d: [0.004, -0.003], bhk: 2, price: 22000, maintenance: 3000, deposit: 100000, carpetSqft: 1050, floor: 5, totalFloors: 12, furnishing: "semi", facing: "North", ageYears: 7, tenants: ["bachelors", "company"], parking: "car", who: "Naveen C.", amen: "society", listedDaysAgo: 4, confirmedDaysAgo: 1, note: "Ten minutes from the Electronic City metro and the Infosys campus." },
  { type: "rent", at: "JP Nagar", area: "6th Phase", d: [0.002, 0.004], bhk: 3, price: 48000, maintenance: 3000, deposit: 250000, carpetSqft: 1450, floor: 1, totalFloors: 3, furnishing: "semi", facing: "East", ageYears: 12, availableInDays: 15, tenants: ["family"], pets: true, parking: "car", balconies: 2, who: "Asha L.", amen: "building", listedDaysAgo: 11, confirmedDaysAgo: 5, note: "Walking distance to the JP Nagar 6th Phase park and schools." },
  { type: "rent", at: "Jayanagar", area: "4th Block", d: [0.001, -0.002], bhk: 2, price: 40000, maintenance: 1000, deposit: 250000, carpetSqft: 1100, floor: 1, totalFloors: 2, furnishing: "none", facing: "North", ageYears: 25, tenants: ["family"], nonVeg: false, parking: "car", who: "Karthik R.", amen: "house", listedDaysAgo: 9, confirmedDaysAgo: 2, note: "Five minutes from the 4th Block shopping complex." },
  { type: "rent", at: "BTM Layout", area: "2nd Stage", d: [-0.002, 0.003], bhk: 1, price: 18000, maintenance: 1000, deposit: 60000, carpetSqft: 550, floor: 3, totalFloors: 4, furnishing: "semi", facing: "South", ageYears: 10, tenants: ["bachelors"], parking: "bike", who: "Divya P.", amen: "house", listedDaysAgo: 2, confirmedDaysAgo: 0, note: "Near the BTM metro station and Udupi Garden." },
  { type: "rent", at: "Hebbal", area: "Kempapura", d: [0.004, 0.005], bhk: 2, price: 36000, maintenance: 4000, deposit: 180000, carpetSqft: 1200, floor: 8, totalFloors: 15, furnishing: "semi", facing: "East", ageYears: 3, availableInDays: 7, pets: true, parking: "car", balconies: 2, who: "Imran S.", amen: "society", listedDaysAgo: 5, confirmedDaysAgo: 1, note: "Lake view from the balcony, twenty minutes to the airport road." },
  { type: "rent", at: "Yelahanka", area: "New Town", kind: "independent-house", d: [-0.003, 0.004], bhk: 3, price: 32000, maintenance: 0, deposit: 150000, carpetSqft: 1600, floor: 0, totalFloors: 2, furnishing: "none", facing: "East", ageYears: 14, tenants: ["family"], pets: true, parking: "car", who: "Pooja K.", amen: "house", listedDaysAgo: 12, confirmedDaysAgo: 3, note: "A ground-floor house with its own gate and a small garden." },
  { type: "rent", at: "Malleshwaram", area: "15th Cross", d: [0.002, 0.003], bhk: 2, price: 35000, maintenance: 1500, deposit: 200000, carpetSqft: 1050, floor: 2, totalFloors: 3, furnishing: "semi", facing: "North", ageYears: 18, availableInDays: 15, tenants: ["family"], nonVeg: false, parking: "bike", who: "Venkatesh M.", amen: "building", listedDaysAgo: 14, confirmedDaysAgo: 4, note: "Walk to Sampige Road and the 8th Cross market." },
  { type: "buy", at: "Koramangala", area: "3rd Block", d: [-0.003, 0.004], bhk: 3, price: 28_500_000, maintenance: 7000, carpetSqft: 1750, floor: 4, totalFloors: 8, furnishing: "semi", facing: "East", ageYears: 6, parking: "car", balconies: 2, who: "Nandini B.", amen: "society", listedDaysAgo: 20, confirmedDaysAgo: 3, note: "Khata and occupancy certificate in place, ready to register." },
  { type: "buy", at: "HSR Layout", area: "Sector 7", d: [-0.006, -0.005], bhk: 2, price: 13_500_000, maintenance: 4000, carpetSqft: 1180, floor: 3, totalFloors: 5, furnishing: "none", facing: "North-East", ageYears: 3, parking: "car", who: "Gaurav T.", amen: "building", listedDaysAgo: 9, confirmedDaysAgo: 2, note: "A three-year-old building with one covered car park included." },
  { type: "buy", at: "Whitefield", area: "Kundalahalli", d: [0.006, -0.03], bhk: 3, price: 16_000_000, maintenance: 5500, carpetSqft: 1650, floor: 12, totalFloors: 20, furnishing: "semi", facing: "East", ageYears: 5, parking: "car", balconies: 2, who: "Rekha S.", amen: "society", listedDaysAgo: 16, confirmedDaysAgo: 5, note: "A high floor with a clear view east over the lake." },
  { type: "buy", at: "Electronic City", area: "Phase 2", d: [-0.006, 0.008], bhk: 2, price: 6_800_000, maintenance: 2800, carpetSqft: 1050, floor: 6, totalFloors: 12, furnishing: "none", facing: "North", ageYears: 4, parking: "car", who: "Joseph D.", amen: "society", listedDaysAgo: 7, confirmedDaysAgo: 1, note: "Close to the Electronic City Phase 2 offices and the elevated expressway." },
  { type: "buy", at: "JP Nagar", area: "2nd Phase", kind: "independent-house", d: [0.007, -0.004], bhk: 4, price: 42_000_000, maintenance: 0, carpetSqft: 3200, floor: 0, totalFloors: 3, furnishing: "semi", facing: "East", ageYears: 9, parking: "car", bathrooms: 4, balconies: 3, who: "Arvind N.", amen: "house", listedDaysAgo: 25, confirmedDaysAgo: 10, note: "A three-storey house on a 40 × 60 site, with rental income from the top floor." },
];

function describe(s: Spec, kind: PropertyKind) {
  const what = s.bhk === 0 ? "studio" : `${s.bhk} BHK ${KIND_WORD[kind]}`;
  const where = kind === "apartment" ? `on the ${ordinal(s.floor)} floor of a ${s.totalFloors}-storey building` : `across ${s.totalFloors} floors`;
  return `A ${FURNISHED[s.furnishing]} ${what} ${where} in ${s.area}, ${s.at}, ${s.ageYears} years old and facing ${s.facing.toLowerCase()}. ${s.note}`;
}

// Rough 2026 sale rates (₹ per sq ft of carpet area) for turning the samples into sale listings while rentals are off.
// ponytail: sample numbers only; real listings carry the owner's price.
const RATE: Record<string, number> = {
  Koramangala: 16000, "HSR Layout": 13000, Indiranagar: 18000, Whitefield: 9500, Bellandur: 10500, Marathahalli: 9000,
  "Electronic City": 6500, "JP Nagar": 11000, Jayanagar: 15000, "BTM Layout": 10000, Hebbal: 11500, Yelahanka: 7500, Malleshwaram: 15000,
};

export const SEED: Listing[] = SPECS.map((s, i) => {
  const kind = s.kind ?? "apartment";
  const sale = s.type === "buy" || !RENTALS;
  const price = s.type === "buy" || RENTALS ? s.price : Math.round((s.carpetSqft * RATE[s.at] * (kind === "apartment" ? 1 : 1.35)) / 1e5) * 1e5;
  const [lat, lng] = LOCALITIES[s.at];
  const slug = `${s.bhk === 0 ? "1rk" : `${s.bhk}bhk`}-${s.area}-${s.at}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `${slug}-${i + 1}`,
    type: sale ? "buy" : s.type,
    kind,
    bhk: s.bhk,
    title: `${s.bhk === 0 ? "1 RK studio" : `${s.bhk} BHK ${KIND_WORD[kind]}`} in ${s.area}, ${s.at}`,
    locality: s.at,
    area: s.area,
    lat: lat + s.d[0],
    lng: lng + s.d[1],
    price,
    maintenance: s.maintenance ?? 0,
    deposit: sale ? 0 : (s.deposit ?? 0),
    carpetSqft: s.carpetSqft,
    floor: s.floor,
    totalFloors: s.totalFloors,
    furnishing: s.furnishing,
    facing: s.facing,
    ageYears: s.ageYears,
    availableInDays: s.availableInDays ?? 0,
    tenants: sale ? [] : (s.tenants ?? []),
    pets: s.pets ?? false,
    nonVeg: s.nonVeg ?? true,
    parking: s.parking ?? "none",
    bathrooms: s.bathrooms ?? Math.max(1, s.bhk),
    balconies: s.balconies ?? 1,
    amenities: [...AMENITY_SETS[s.amen]],
    description: describe(s, kind),
    photos: photosFor(i, kind, s.bhk),
    owner: { name: s.who, verified: true },
    listedDaysAgo: s.listedDaysAgo,
    confirmedDaysAgo: s.confirmedDaysAgo,
    sample: true,
    saleCondition: sale ? (s.ageYears <= 3 ? "new" : "resale") : null,
    // Half the samples show the staff-visit badge, visited the day after they were listed.
    visitVerifiedAt: i % 2 ? null : new Date(Date.now() - Math.max(s.listedDaysAgo - 1, 0) * 86_400_000),
  };
});
