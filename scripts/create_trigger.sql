-- Run this in Supabase SQL Editor
-- Auto-syncs users.total_routes/total_km/total_challenges from user_route_runs

CREATE OR REPLACE FUNCTION sync_user_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_completed = true THEN
    UPDATE public.users
    SET
      total_routes = (SELECT COUNT(*) FROM public.user_route_runs WHERE user_id = NEW.user_id AND is_completed = true),
      total_km = (SELECT ROUND(COALESCE(SUM(total_km), 0)::numeric, 2) FROM public.user_route_runs WHERE user_id = NEW.user_id AND is_completed = true),
      total_challenges = (SELECT COALESCE(SUM(challenges_completed), 0) FROM public.user_route_runs WHERE user_id = NEW.user_id AND is_completed = true)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_run_completed ON public.user_route_runs;
CREATE TRIGGER on_run_completed
  AFTER INSERT OR UPDATE ON public.user_route_runs
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_stats();

-- Backfill existing data
UPDATE public.users u
SET
  total_routes = COALESCE((SELECT COUNT(*) FROM public.user_route_runs ur WHERE ur.user_id = u.id AND ur.is_completed = true), 0),
  total_km = COALESCE((SELECT ROUND(SUM(ur.total_km)::numeric, 2) FROM public.user_route_runs ur WHERE ur.user_id = u.id AND ur.is_completed = true), 0),
  total_challenges = COALESCE((SELECT SUM(ur.challenges_completed) FROM public.user_route_runs ur WHERE ur.user_id = u.id AND ur.is_completed = true), 0);

-- Backfill kraj from routes.region for runs that have null kraj
UPDATE public.user_route_runs ur
SET kraj = r.region
FROM public.routes r
WHERE ur.route_id = r.id AND ur.kraj IS NULL AND r.region IS NOT NULL;
