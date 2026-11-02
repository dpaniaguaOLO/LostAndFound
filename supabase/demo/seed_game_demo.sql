-- Datos de prueba del juego (puntos, insignias, ranking) para el proyecto Supabase.
--
--   supabase db query --linked -f supabase/demo/seed_game_demo.sql
--   (deshacer: supabase db query --linked -f supabase/demo/cleanup_game_demo.sql)
--
-- Crea 12 colaboradores demo SIN contraseña (no pueden iniciar sesión: no hay
-- credenciales demo públicas), objetos encontrados, devoluciones con reclamación
-- aprobada, reclamaciones pendientes, reportes de perdidos y avisos. Al colaborador
-- 777 le da estadísticas para TODAS las insignias (incluida Leyenda de OLO).
--
-- Todo lo creado lleva un id que empieza por 'dddddddd-' (así lo borra el script
-- de limpieza). Las fotos de los objetos demo son rutas sin archivo: la app muestra
-- el marcador de "sin imagen". Requiere las migraciones 016 y 017.
-- Idempotente: si ya se ejecutó, no hace nada.

do $$
declare
  cats constant text[] := array['ELECTRONICS','CLOTHING','ACCESSORIES','DOCUMENTS','KEYS','BAGS','WALLET','JEWELRY','OTHER'];
  -- Títulos por categoría (mismo orden que cats).
  titles constant text[][] := array[
    array['Cargador de móvil','Audífonos inalámbricos','Mouse inalámbrico','Power bank','Cable USB-C','Calculadora'],
    array['Chaqueta negra','Bufanda gris','Gorra azul','Suéter de lana','Impermeable amarillo','Chaleco reflectivo'],
    array['Paraguas negro','Lentes de sol','Reloj de pulsera','Termo metálico','Botella de agua','Gafas de lectura'],
    array['Carné de empleado','Licencia de conducir','Cuaderno de notas','Carpeta con facturas','Pasaporte','Agenda 2026'],
    array['Llaves de casa','Llave de locker','Llavero con control','Llaves del carro','Tarjeta de acceso','Llave de bodega'],
    array['Mochila gris','Bolso de mano','Lonchera azul','Maletín de cuero','Bolsa de gimnasio','Estuche de lápices'],
    array['Billetera café','Monedero rojo','Tarjetero negro','Billetera de tela','Porta tarjetas','Cartera pequeña'],
    array['Anillo plateado','Pulsera dorada','Arete de perla','Cadena con dije','Reloj elegante','Collar de cuentas'],
    array['Taza personalizada','Libro de bolsillo','Peluche pequeño','Planta en maceta','Cojín lumbar','Juego de cubiertos']
  ];
  locs constant text[] := array['Recepción','Comedor','Sala de reuniones 2','Parqueo','Bodega central','Baños planta 1',
                                'Lobby','Cafetería','Oficina de RRHH','Área de despacho','Sala de capacitación','Pasillo norte'];
  -- name, published, returned, fast, categories, months, photos, claimed, lost_reports, days since joined
  -- Fila 1: el colaborador 777, con estadísticas para todas las insignias al máximo.
  players constant text[][] := array[
    array['Donovan','110','100','50','9','14','60','2','1','500'],
    array['Lucía Fernández','40','30','12','7','8','25','2','2','420'],
    array['Marco Rojas','30','22','6','6','6','10','1','1','380'],
    array['Sofía Jiménez','20','15','10','5','5','15','1','1','300'],
    array['Diego Vargas','14','9','2','4','4','3','1','0','260'],
    array['Valeria Mora','10','6','3','3','3','6','1','1','240'],
    array['Andrés Solís','8','5','0','3','2','0','0','1','200'],
    array['Camila Araya','6','3','1','2','2','2','1','1','150'],
    array['Pablo Castro','5','2','2','2','1','1','0','0','120'],
    array['Gabriela Quesada','3','1','0','1','1','0','0','1','90'],
    array['Esteban Navarro','2','0','0','1','1','2','0','1','60'],
    array['Natalia Brenes','1','0','0','1','1','0','0','1','30'],
    array['Ricardo Ulate','0','0','0','1','1','0','0','2','14']
  ];

  donovan uuid;
  uids uuid[] := '{}'; -- uids[i] = colaborador de players[i] (uids[1] = 777)
  n int := 0;          -- contador para ids deterministas
  i int; j int;
  uid uuid; other uuid; item uuid; claim uuid;
  pub int; ret int; fast int; ncat int; months int; photos int; claimed int; nlost int;
  cat int; status text; created timestamptz; returned timestamptz; title text;

  next_id constant text := 'dddddddd-%s-4000-8000-%s';
begin
  if exists (select 1 from public.profiles where employee_id = 'demo-01') then
    raise notice 'Datos demo ya cargados: nada que hacer.';
    return;
  end if;
  select id into donovan from public.profiles where employee_id = '777';
  if donovan is null then
    raise exception 'No existe el colaborador 777';
  end if;
  perform setseed(0.42);
  uids := array[donovan];

  -- 1) Colaboradores demo (el trigger handle_new_user crea su perfil).
  for i in 2..array_length(players, 1) loop
    uid := format(next_id, '0000', lpad((i - 1)::text, 12, '0'))::uuid;
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      format('demo-%s@lostandfound.olo', lpad((i - 1)::text, 2, '0')), '', now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', players[i][1], 'employee_id', format('demo-%s', lpad((i - 1)::text, 2, '0'))),
      now(), now(), '', '', '', ''
    );
    update public.profiles set created_at = now() - make_interval(days => players[i][10]::int) where id = uid;
    uids := uids || uid;
  end loop;

  -- 2) Objetos encontrados, devoluciones y reclamaciones.
  for i in 1..array_length(players, 1) loop
    uid := uids[i];
    pub := players[i][2]::int; ret := players[i][3]::int; fast := players[i][4]::int; ncat := players[i][5]::int;
    months := players[i][6]::int; photos := players[i][7]::int; claimed := players[i][8]::int;

    for j in 1..pub loop
      n := n + 1;
      item := format(next_id, '0001', lpad(n::text, 12, '0'))::uuid;
      cat := ((j - 1) % ncat) + 1;
      title := titles[cat][((j - 1) / ncat) % 6 + 1];
      -- Reclama otro colaborador demo distinto del autor (nunca el 777, que es real).
      other := uids[((i + j) % (array_length(uids, 1) - 1)) + 2];
      if other = uid then other := uids[((i + j + 1) % (array_length(uids, 1) - 1)) + 2]; end if;

      if j <= ret then
        status := 'RETURNED';
        -- Devoluciones repartidas en `months` meses distintos (la más reciente, hace días).
        returned := date_trunc('month', now()) - make_interval(months => (j - 1) % months)
                    + make_interval(days => 1 + floor(random() * 20)::int, hours => 9 + floor(random() * 8)::int);
        if returned > now() then returned := now() - interval '2 hours'; end if;
        created := returned - case when j <= fast
                                then make_interval(hours => 1 + floor(random() * 20)::int)
                                else make_interval(days => 2 + floor(random() * 10)::int) end;
      elsif j <= ret + claimed then
        status := 'CLAIMED'; returned := null;
        created := now() - make_interval(days => 1 + floor(random() * 5)::int);
      else
        status := 'PUBLISHED'; returned := null;
        created := now() - make_interval(days => floor(random() * 25)::int, hours => floor(random() * 12)::int);
      end if;

      insert into public.found_items (id, title, description, category, location, found_at, image_path,
                                      status, returned_at, reporter_id, created_at, updated_at)
      values (item, title,
              format('%s encontrado en %s. Lo tengo guardado, escríbeme para coordinar la entrega.',
                     title, locs[(n % array_length(locs, 1)) + 1]),
              cats[cat], locs[(n % array_length(locs, 1)) + 1], created - interval '1 hour',
              case when j <= photos then format('%s/%s.jpg', uid, gen_random_uuid()) end,
              status, returned, uid, created, coalesce(returned, created));

      if status in ('RETURNED', 'CLAIMED') then
        n := n + 1;
        insert into public.claims (id, found_item_id, claimant_id, message, status, reviewer_id, created_at, updated_at)
        values (format(next_id, '0003', lpad(n::text, 12, '0'))::uuid, item, other,
                format('¡Es mío! Lo perdí cerca de %s.', locs[(n % array_length(locs, 1)) + 1]),
                'APPROVED', uid, created + interval '30 minutes', created + interval '1 hour');
      elsif j = pub and i <= 3 then
        -- Una reclamación pendiente en el último publicado de los primeros jugadores.
        n := n + 1;
        claim := format(next_id, '0003', lpad(n::text, 12, '0'))::uuid;
        insert into public.claims (id, found_item_id, claimant_id, message, status, created_at, updated_at)
        values (claim, item, other, 'Creo que es mío, ¿podemos vernos en recepción?', 'PENDING', now() - interval '3 hours', now() - interval '3 hours');
        n := n + 1;
        insert into public.notifications (id, user_id, type, title, body, related_item_id, created_at)
        values (format(next_id, '0004', lpad(n::text, 12, '0'))::uuid, uid, 'CLAIM_REQUESTED', 'Nueva solicitud de reclamación',
                format('Alguien reclama "%s". Revisa la solicitud.', title), item, now() - interval '3 hours');
      end if;
    end loop;
  end loop;

  -- 3) Reportes de objetos perdidos (los del top 3 saldrán destacados en el muro).
  for i in 1..array_length(players, 1) loop
    uid := uids[i];
    nlost := players[i][9]::int;
    for j in 1..nlost loop
      n := n + 1;
      cat := ((i + j) % 9) + 1;
      title := titles[cat][((i + j) % 6) + 1];
      insert into public.lost_reports (id, title, description, category, location, lost_at, status, reporter_id, created_at, updated_at)
      values (format(next_id, '0002', lpad(n::text, 12, '0'))::uuid, title,
              format('Perdí mi %s, creo que en %s. Si alguien lo encuentra, ¡gracias!', lower(title), locs[(n % array_length(locs, 1)) + 1]),
              cats[cat], locs[(n % array_length(locs, 1)) + 1],
              now() - make_interval(days => 1 + (i + j) % 6),
              case when j = 2 and i % 2 = 0 then 'RESOLVED' else 'OPEN' end,
              uid, now() - make_interval(days => (i + j) % 6, hours => i), now() - make_interval(days => (i + j) % 6, hours => i));
    end loop;
  end loop;

  raise notice 'Datos demo cargados: % colaboradores, % filas.', array_length(uids, 1), n;
end;
$$;

-- Resumen: el ranking tal como lo verá la app.
select p.employee_id, p.name, s.points, s.published, s.published_photo as photos, s.returned,
       s.fast_returned as fast, s.categories, s.active_months as months
  from public.game_stats() s join public.profiles p on p.id = s.user_id
 where s.points > 0
 order by s.points desc
 limit 15;
