-- A visitor who came back to the order form and typed nothing: name and phone are the ones the script
-- remembered in their browser (on the shop's own site) from an earlier visit.
ALTER TABLE leads ADD COLUMN known boolean NOT NULL DEFAULT false;
