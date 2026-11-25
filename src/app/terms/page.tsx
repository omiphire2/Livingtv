import Link from "next/link";

export const metadata = {
  title: "Terms of Service | LivingTV",
  description: "Terms of Service, content guidelines, and DMCA policy for LivingTV.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-10 max-w-3xl mx-auto space-y-6">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">← Back to LivingTV</Link>
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="text-xs text-zinc-400">Last updated: November 2026</p>
      <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
      <p className="text-zinc-300 leading-relaxed">
        By accessing or streaming on LivingTV, you agree to comply with these Terms of Service and all applicable
        copyright and broadcast laws.
      </p>
      <h2 className="text-xl font-semibold">2. Broadcaster Responsibilities &amp; Copyright</h2>
      <p className="text-zinc-300 leading-relaxed">
        Broadcasters are strictly prohibited from streaming unauthorized copyrighted television feeds, pirated sports
        events, or unlawful material. Every streamer warrants that they hold full rights and licenses for all content
        transmitted through their channel.
      </p>
      <h2 className="text-xl font-semibold">3. Creator Monetization</h2>
      <p className="text-zinc-300 leading-relaxed">
        Eligible channels earn a 40% share of verified ad revenue attributed to their channel impressions, subject to
        traffic validity checks and a $100.00 USD minimum payout threshold.
      </p>
      <h2 className="text-xl font-semibold">4. DMCA &amp; Takedown Requests</h2>
      <p className="text-zinc-300 leading-relaxed">
        Copyright holders may submit takedown notices at any time via our{" "}
        <Link href="/contact" className="text-emerald-400 hover:underline">Contact page</Link>. Verified infringing
        streams are removed promptly.
      </p>
    </main>
  );
}
