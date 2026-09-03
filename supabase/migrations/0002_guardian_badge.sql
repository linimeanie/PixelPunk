-- Tracks whether a guardian is a confirmed Attio guardian, and for which
-- edition. '27 takes priority over '26 when both are confirmed (set by
-- application logic, not enforced here).
alter table guardians
  add column if not exists guardian_badge text,
  add column if not exists attio_person_id text;
