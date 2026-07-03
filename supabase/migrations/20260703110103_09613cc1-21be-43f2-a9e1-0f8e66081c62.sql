
DO $$
DECLARE
  v_uid uuid;
  v_email text := 'alansilveira@pulsarprocessos.com.br';
  v_senha text := 'Connect01';
  v_nome  text := 'Alan Silveira';
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', v_email,
      crypt(v_senha, gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('nome', v_nome),
      false
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', v_email, now(), now(), now()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt(v_senha, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_uid;
  END IF;

  INSERT INTO public.usuarios_perfis (id, nome, email, role, id_loja, ativo)
  VALUES (v_uid, v_nome, v_email, 'administrador', NULL, true)
  ON CONFLICT (id) DO UPDATE
     SET nome = EXCLUDED.nome,
         email = EXCLUDED.email,
         role = 'administrador',
         ativo = true;
END $$;
