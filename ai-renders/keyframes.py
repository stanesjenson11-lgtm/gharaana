# Photoreal stills of the new storyboard shots, to approve the look before any video is generated.
# Each still = the 3D layout frame (camera, framing, layout) + a photoreal reference from the finished film (look).
# The approved stills are later sent to the video model as references.
# Usage: python keyframes.py [shot ...]   (default: all; key from GEMINI_API_KEY; writes videos/keyframes/<shot>.jpg)
import base64, json, os, subprocess, sys, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).parent
SHOTS, SEG = HERE / "shots", HERE / "videos" / "segments"
OUT = HERE / "videos" / "keyframes"; OUT.mkdir(parents=True, exist_ok=True)
MODEL = os.environ.get("IMAGE_MODEL", "gemini-3.1-flash-image")
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

# the same reference frames restyle.py sends with the video segments: (file, segment fit, frame)
REFS = {"interior": ("ref-interior", "3-door-fit", 175), "tower": ("ref-tower", "2-orbit-fit", 48),
        "opening": ("ref-opening", "1-descent-fit", 1)}

INTERIOR = ("Image 2 is this same living room photographed a few seconds earlier. Take every material, colour and the "
            "lighting from image 2, not from image 1: the light honey-coloured herringbone oak floor, white walls, soft "
            "warm daylight and its airy, gently desaturated colour grading, the linen sofa with its yellow, navy and "
            "black-and-white patterned cushions, the fiddle-leaf fig in a woven basket, the brass lamps and side tables, "
            "the round marble coffee table, the framed blue-and-yellow wavy-line print, the leather lounge chair. "
            "Furniture that image 2 doesn't show is styled to match it.")
CITY = ("The tower and the city must look like image 2: the same tall white residential tower with curved white balcony "
        "bands, the same dark blue-grey glass skyscrapers and white office blocks, the same soft morning light and colour "
        "grading. Every rooftop, terrace and balcony looks lived-in and real: air-conditioning units and vents, water "
        "tanks, solar panels, railings and parapets, potted plants and rooftop gardens, clothes drying on lines, satellite "
        "dishes, weathering and stains on concrete, real textures, layers and soft natural shadows.")
ENDING = ("Same colour grading, soft morning haze, clouds and light as image 2, the opening frame of this film; the same "
          "tower and the same buildings around it.")

# shot -> (3D frame, reference, what the frame shows, look rule)
SHOTLIST = {
    "10": ("t60.98", "interior", "The living room at eye level.", INTERIOR),
    "11": ("t63.00", "interior", "The living room, the camera starting to rise and tilt down.", INTERIOR),
    "12": ("t64.50", "interior", "The living area seen from higher up, looking down at the sofa and coffee table.", INTERIOR),
    "13": ("t66.00", "interior", "Looking down at the sofa, rug, coffee table and lounge chair from about 2.6 m.", INTERIOR),
    "14": ("t67.47", "interior", "Looking almost straight down at the living room from above.", INTERIOR),
    "15": ("t69.00", "interior", "The living room seen from directly above; the tops of the walls read as a clean "
                                 "architectural cutaway with no ceiling.", INTERIOR),
    "16": ("t72.00", "interior", "The whole apartment seen from directly above as an architectural cutaway with no roof: "
                                 "bedrooms, bathroom, kitchen and living room, all furnished.", INTERIOR),
    "17": ("t76.00", "interior", "The whole floor of the tower seen from directly above as an architectural cutaway with no "
                                 "roof: four furnished apartments around a central lift core, wooden corner terraces with "
                                 "planters and small tables.", INTERIOR),
    "18": ("t81.25", "tower", "From high above: the tower's cutaway floor in the middle of its plaza with lawns, trees "
                              "and a reflecting pool, city blocks around.", CITY),
    "19": ("t82.60", "tower", "Higher above: the plaza with the tower in the middle of the city grid.", CITY),
    "20": ("t84.22", "tower", "High above the city looking straight down; the tower is small in the middle.", CITY),
    "21": ("t86.0", "tower", "Very high above the city (about 400 m) looking straight down; the tower is small, exactly "
                             "the size and position it has in image 1, its flat roof in the middle of its plaza. Same "
                             "framing and scale as image 1; do not zoom in.", CITY),
    "22": ("t90.00", "tower", "Straight down from very high: the neighbourhood, streets with cars, a park with a pond, "
                              "the tower in its plaza in the middle.", CITY),
    "23": ("t93.59", "tower", "The camera starting to tilt up over the city; the tower in the middle.", CITY),
    "24": ("t95.10", "tower", "Tilting down over the city: the tall white tower stands up whole among the blocks.", CITY),
    "25": ("t96.27", "tower", "Coming down beside the tower among dark glass skyscrapers.", CITY),
    "26": ("t99.32", "opening", "Coming down among the dark glass towers toward the opening view; haze starts to gather "
                                "over the streets.", ENDING + " " + CITY),
    "27": ("t101.5", "opening", "Settling into the opening view: the tower among dark glass towers. The haze is thin, "
                                "light and cool exactly like image 2, not thick fog; same light, cool colour grading and "
                                "clouds as image 2.", ENDING),
}

def ref_path(kind):
    name, fit, frame = REFS[kind]
    jpg = SEG / f"{name}.jpg"
    if not jpg.exists():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(SEG / f"{fit}.mp4"), "-vf", f"select=eq(n\\,{frame})",
                        "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "2", str(jpg)], check=True)
    return jpg

def inline(path):
    return {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(Path(path).read_bytes()).decode()}}

def make(shot):
    frame, kind, what, look = SHOTLIST[shot]
    text = ("Image 1 is a rough 3D layout frame from our film: use it only for the camera position, angle, framing, "
            "composition and where every building, wall and piece of furniture stands; ignore its colours and materials. "
            "Make one photorealistic frame of the same film, like real drone or interior footage on a high-end cinema "
            f"camera. {what} {look} Generic city with no famous landmarks; no text, logos or watermarks.")
    body = {"contents": [{"parts": [inline(SHOTS / f"{frame}.jpg"), inline(ref_path(kind)), {"text": text}]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "16:9"}}}
    req = urllib.request.Request(URL, json.dumps(body).encode(),
                                 {"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=240))
    except urllib.error.HTTPError as e:
        print(f"FAIL {shot} HTTP {e.code} {e.read().decode()[:300]}", flush=True); return
    parts = res.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    img = next((p["inlineData"] for p in parts if "inlineData" in p), None)
    if not img:
        print(f"FAIL {shot} no image: {json.dumps(res)[:300]}", flush=True); return
    (OUT / f"{shot}.jpg").write_bytes(base64.b64decode(img["data"]))
    print(f"ok {shot} usage={json.dumps(res.get('usageMetadata', {}))}", flush=True)

if __name__ == "__main__":
    if not os.environ.get("GEMINI_API_KEY"): sys.exit("GEMINI_API_KEY is not set")
    for shot in sys.argv[1:] or SHOTLIST: make(shot)
