import Link from "next/link";

export const metadata = {
  title: "Contact & DMCA | LivingTV",
  description: "Contact LivingTV support, broadcaster onboarding, and copyright inquiries.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-10 max-w-3xl mx-auto space-y-6">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">← Back to LivingTV</Link>
      <h1 className="text-3xl font-bold">Contact LivingTV</h1>
      <p className="text-zinc-300 leading-relaxed">
        Reach our team for broadcaster support, advertising partnerships, privacy inquiries, or copyright/DMCA notices.
      </p>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3 text-sm text-zinc-300">
        <p><strong className="text-white">General &amp; Creator Support:</strong> support@livingtv.live</p>
        <p><strong className="text-white">Copyright &amp; DMCA Notices:</strong> dmca@livingtv.live</p>
        <p><strong className="text-white">Response Time:</strong> Within 24–48 hours</p>
      </div>
      <div className="pt-4 border-t border-zinc-800 flex flex-wrap gap-4 text-sm text-zinc-400">
        <Link href="/about" className="hover:text-white">About Us</Link>
        <Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-white">Terms of Service</Link>
      </div>
    </main>
  );
}
