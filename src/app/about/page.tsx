import Link from "next/link";

export const metadata = {
  title: "About Us | LivingTV",
  description: "Learn about LivingTV, our live streaming creators, and authorized broadcast channels.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-10 max-w-3xl mx-auto space-y-6">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">← Back to LivingTV</Link>
      <h1 className="text-3xl font-bold">About LivingTV</h1>
      <p className="text-zinc-300 leading-relaxed">
        LivingTV is a live television and creator streaming platform designed for continuous, reliable broadcasts.
        Independent broadcasters, educators, entertainers, and community stations stream directly to viewers worldwide
        through standard RTMP and HLS broadcast pipelines.
      </p>
      <h2 className="text-xl font-semibold text-white">Broadcast Authorization &amp; Standards</h2>
      <p className="text-zinc-300 leading-relaxed">
        All channels broadcast on LivingTV are stream-authorized by their respective creators and rights holders.
        We require every broadcaster to own or hold explicit distribution rights for the audio, video, and live feeds
        they publish on our network.
      </p>
      <div className="pt-4 border-t border-zinc-800 flex flex-wrap gap-4 text-sm text-zinc-400">
        <Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-white">Terms of Service</Link>
        <Link href="/contact" className="hover:text-white">Contact</Link>
      </div>
    </main>
  );
}
