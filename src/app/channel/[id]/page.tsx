import React, { Suspense } from "react";
import ChannelDetailClient from "./ChannelDetailClient";

async function ChannelRouteContent({
params,
}: {
params: Promise<{ id: string }>;
}) {
const { id } = await params;
return <ChannelDetailClient channelId={id} />;
}

export default function ChannelDetailPage({
params,
}: {
params: Promise<{ id: string }>;
}) {
return (
<Suspense
  fallback={
    <div className="min-h-screen bg-zinc-950 text-zinc-400 flex items-center justify-center text-sm">
      Loading channel...
    </div>
  }
>
  <ChannelRouteContent params={params} />
</Suspense>
);
}
