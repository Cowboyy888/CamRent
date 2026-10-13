-- Defence in depth. The `private` schema is not exposed through the Data API,
-- but functions get EXECUTE for PUBLIC by default, so any signed-in session
-- with direct SQL access could call them. The automation engine and the
-- notification writers are only ever called by the database itself (triggers,
-- pg_cron, and the SECURITY DEFINER wrappers in `public`), which run as the
-- owner and do not need this grant.
revoke execute on function
  private.run_automation(text, uuid, text, uuid),
  private.run_rule(text, uuid, jsonb, uuid),
  private.claim_event(uuid, text, text, uuid, text, text),
  private.fail_event(uuid, text, text, uuid, text, text, text),
  private.notify(uuid, public.notification_type, text, uuid, text),
  private.notify_managers(public.notification_type, text, uuid, text, uuid),
  private.rule_new_inquiry_task(uuid, jsonb, uuid),
  private.rule_unassigned_inquiry_notify(uuid, jsonb, uuid),
  private.rule_no_contact_sla(uuid, jsonb, uuid),
  private.rule_viewing_confirmation_task(uuid, jsonb, uuid),
  private.rule_viewing_completed_prompt(uuid, jsonb, uuid),
  private.rule_negotiation_followup(uuid, jsonb, uuid),
  private.rule_overdue_task_reminder(uuid, jsonb, uuid),
  private.rule_upcoming_viewing_reminder(uuid, jsonb, uuid),
  private.rule_lease_expiry_renewal(uuid, jsonb, uuid)
  from public, anon, authenticated;
