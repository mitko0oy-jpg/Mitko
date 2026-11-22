-- How many orders a sales entry stands for (sales from the ConvertBuilder pages that are not in OrderDesk).
ALTER TABLE acc_entries ADD COLUMN orders integer;
