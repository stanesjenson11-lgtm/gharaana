// What a listing's details must look like. The owner's posting form and the team's editor check the same rules.
import { z } from "zod";
import { youtubeId } from "./format.ts";
import { AMENITIES, RENTALS } from "./search.ts";

const money = z.coerce.number().int().min(0).max(1_000_000_000);
const optionalMoney = z.preprocess((v) => (v === "" || v === undefined ? 0 : v), money);
export const ROOMS = ["living", "bedroom", "kitchen", "bathroom", "exterior", "balcony"] as const;

/** Everything about the home itself: no photos, proof or owner. */
export const homeFields = z.object({
  type: z.enum(RENTALS ? ["rent", "buy"] : ["buy"], "We only list homes for sale right now"),
  kind: z.enum(["apartment", "independent-house", "villa"]),
  bhk: z.coerce.number().int().min(0).max(4),
  carpetSqft: z.coerce.number().int().min(100, "Carpet area looks too small").max(20000),
  floor: z.coerce.number().int().min(0).max(80),
  totalFloors: z.coerce.number().int().min(1).max(80),
  facing: z.string().min(1),
  furnishing: z.enum(["full", "semi", "none"]),
  saleCondition: z.enum(["new", "resale"]).optional(),
  bathrooms: z.coerce.number().int().min(1, "Add at least one bathroom").max(10),
  balconies: z.coerce.number().int().min(0).max(10),
  videoUrl: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v ? youtubeId(v) : ""))
    .refine((v) => v !== null, "Paste a YouTube link, like https://youtu.be/…")
    .optional(),
  ageYears: z.coerce.number().int().min(0).max(100),
  locality: z.string().trim().min(2, "Tell us the locality").max(80),
  area: z.string().trim().min(2, "Add the block, sector or street").max(120),
  address: z.string().trim().min(10, "Add the full address, it stays private").max(400),
  description: z.string().trim().min(40, "Describe the home in a sentence or two (at least 40 characters)").max(1500),
  price: money.min(1000, "Enter the rent or price"),
  maintenance: optionalMoney,
  deposit: optionalMoney,
  availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  tenants: z.array(z.enum(["family", "bachelors", "company"])),
  pets: z.enum(["yes", "no"]),
  food: z.enum(["any", "veg"]),
  parking: z.enum(["none", "bike", "car"]),
  amenities: z.array(z.enum(AMENITIES)),
});

export type Home = z.output<typeof homeFields>;

/** The rules that look across fields. Applied to any schema built on homeFields. */
export function homeRules<T extends z.ZodType<Home>>(schema: T) {
  return schema
    .refine((d) => d.floor <= d.totalFloors, { path: ["floor"], message: "Floor can't be above the top floor" })
    .refine((d) => d.type === "buy" || d.deposit > 0, { path: ["deposit"], message: "Enter the security deposit" })
    .refine((d) => d.type === "rent" || d.saleCondition, { path: ["saleCondition"], message: "Choose new or resale" });
}

/** The title every listing carries, made from what it is and where it is. */
export function homeTitle(d: Pick<Home, "bhk" | "kind" | "area" | "locality">) {
  const word = { apartment: "flat", "independent-house": "independent house", villa: "villa" }[d.kind];
  return `${d.bhk === 0 ? "1 RK studio" : `${d.bhk} BHK ${word}`} in ${d.area}, ${d.locality}`;
}

/** First error message for each field, the shape forms show. */
export function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}
