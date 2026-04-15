/** Shape of entries in `investor_groups.json` / `investor_group_candidates.json`. */
export type IntelGroup = {
  id: string;
  label: string;
  member_count: number;
  total_stocks: number;
  total_pct_sum?: number;
  confidence?: string;
  detection_method?: string;
  members: string[];
};
