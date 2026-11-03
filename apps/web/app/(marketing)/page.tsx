import Tour from "@/components/tour/Tour";
import { LOGO_V } from "@/components/tour/config";

export default function Home() {
  return (
    <main id="top" className="gharaana">
      <Tour />
      <footer className="foot">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static vector logo; next/image has nothing to optimise */}
        <img src={`/brand/logo-white.svg${LOGO_V}`} alt="Gharaana" width={4784} height={1013} loading="lazy" className="foot__logo" />
        <p>The tower, home and neighbourhood in this tour are an illustrative film, not a real listing, floor plan or location.</p>
      </footer>
    </main>
  );
}
