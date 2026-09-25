-- Add the user's Web series / Movies category using the shared capture model.
alter table public.captures
  drop constraint if exists captures_type_check;

alter table public.captures
  add constraint captures_type_check check (type in (
    'Capture', 'Knowledge', 'Idea', 'Project', 'Decision', 'Milestone',
    'Goal', 'Journal', 'Book', 'Resource', 'Media', 'Task', 'Person'
  ));
