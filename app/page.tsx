import Tour from "@/components/tour/Tour";
import { Logo } from "@/components/brand/Logo";

export default function Home() {
  return (
    <main id="top">
      <Tour />
      <footer className="foot">
        <Logo tone="white" className="foot__logo" />
        <p>The tower, home and neighbourhood in this tour are an illustrative 3D model, not a real listing, floor plan or location.</p>
      </footer>
    </main>
  );
}
