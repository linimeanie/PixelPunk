-- 0002 added attio_person_id without noticing guardians already had an
-- attio_id column for this exact purpose. Fold the data back in and drop
-- the duplicate.
update guardians set attio_id = attio_person_id where attio_id is null and attio_person_id is not null;
alter table guardians drop column if exists attio_person_id;
