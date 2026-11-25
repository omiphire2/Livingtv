import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | LivingTV",
  description: "Privacy Policy, cookies, analytics, and advertising disclosures for LivingTV.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-10 max-w-3xl mx-auto space-y-6">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">← Back to LivingTV</Link>
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-xs text-zinc-400">Last updated: November 2026</p>
      <p className="text-zinc-300 leading-relaxed">
        LivingTV respects your privacy. This Privacy Policy explains how we collect, use, and protect information
        when you watch live channels, register a broadcaster account, or interact with advertisements on our platform.
      </p>
      <h2 className="text-xl font-semibold">1. Information We Collect</h2>
      <p className="text-zinc-300 leading-relaxed">
        When you create an account or channel, we store your email address, profile details, and channel metadata
        through our authentication and database provider (Supabase). For viewers, we log basic anonymized playback
        and ad-impression telemetry to calculate broadcaster revenue shares.
      </p>
      <h2 className="text-xl font-semibold">2. Cookies &amp; Third-Party Advertising (Google AdSense &amp; Ad Networks)</h2>
      <p className="text-zinc-300 leading-relaxed">
        Third-party vendors, including Google, use cookies to serve ads based on a user&apos;s prior visits to this
        website or other websites. Google&apos;s use of advertising cookies enables it and its partners to serve ads
        to users based on their visit to LivingTV and/or other sites on the Internet. Users may opt out of personalized
        advertising by visiting Google Ads Settings.
      </p>
      <h2 className="text-xl font-semibold">3. Data Security &amp; Contact</h2>
      <p className="text-zinc-300 leading-relaxed">
        We do not sell personal user data. For privacy inquiries or data deletion requests, visit our{" "}
        <Link href="/contact" className="text-emerald-400 hover:underline">Contact page</Link>.
      </p>
    </main>
  );
}
