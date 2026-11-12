-- Revoke direct execution of an unused event-trigger helper from public API roles.
-- The function remains available to database administration; it is not dropped.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
