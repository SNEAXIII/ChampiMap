-- Waypoints synchronisés de Champi Map.
create table public.waypoints (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  -- Horloge serveur : sert de curseur pour la réception, indépendante des horloges des téléphones.
  synced_at timestamptz not null default clock_timestamp()
);

create index waypoints_user_synced_at on public.waypoints (user_id, synced_at);

alter table public.waypoints enable row level security;

-- Le rôle authenticated doit avoir le privilège SQL de base ; RLS restreint ensuite aux lignes de l'utilisateur.
-- Pas de delete : la suppression reste logique (deleted_at), cf. commentaire plus bas.
grant select, insert, update on public.waypoints to authenticated;

create policy "waypoints: lecture de ses lignes" on public.waypoints
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "waypoints: création de ses lignes" on public.waypoints
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "waypoints: modification de ses lignes" on public.waypoints
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Pas de politique delete : la suppression est logique (deleted_at).

-- Le plus récent gagne : une mise à jour plus ancienne (ou égale) que la ligne stockée est ignorée.
create function public.waypoints_last_write_wins() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  -- clock_timestamp() : valeurs distinctes même pour plusieurs lignes d'un même upsert (pagination par synced_at).
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

create trigger waypoints_last_write_wins
  before insert or update on public.waypoints
  for each row execute function public.waypoints_last_write_wins();
