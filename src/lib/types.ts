export interface Channel {
  id: string;
  owner_id: string | null;
  channel_name: string;
  description: string | null;
  category: string;
  logo_url: string | null;
  stream_key: string;
  custom_hls_url: string | null;
  is_live: boolean;
  comments_enabled: boolean;
  status: "pending" | "active" | "suspended";
  viewer_count: number;
}

export type AdPlacement =
  | "all_over"
  | "video_interstitial"
  | "banner_bottom"
  | "banner_sidebar"
  | "channel_feed"
  | "pause_overlay";

export type AdMediaKind = "code" | "image" | "video";

export interface AdItem {
  id: string;
  title: string;
  advertiser_name: string | null;
  ad_type: AdPlacement;
  media_kind?: AdMediaKind | null;
  ad_code: string | null;
  media_url: string | null;
  click_through_url: string | null;
  duration_seconds: number;
  is_active: boolean;
}

export interface CommentItem {
  id: string;
  channel_id: string;
  user_id: string;
  user_name: string;
  message: string;
  created_at: string;
}
