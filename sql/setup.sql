-- ============================================================================
-- Onboarding da ferramenta `comparador-imagens` - Registry Supabase (idempotente)
-- ============================================================================
-- ONDE RODAR
--   Supabase SQL Editor (Dashboard). Roda como `service_role`, que bypassa RLS.
--   Pode reexecutar à vontade: `ON CONFLICT` evita duplicatas e erros.
--
-- CONTRATO RLS DO REGISTRY
--   Este script APENAS faz INSERT em `applications` e `user_applications`.
--   Nunca crie ou recrie policies nessas tabelas (recursão infinita, erro 42P17).
--   A ferramenta não tem tabelas próprias: nenhuma imagem é gravada.
-- ============================================================================

BEGIN;

INSERT INTO public.applications (slug, name, url, icon, category, is_active, status)
VALUES (
  'comparador-imagens',
  'Comparador de Imagens',
  'https://allanuchoa.github.io/comparador-imagens/',
  'image',
  'Utilidades',
  true,
  'active'
)
ON CONFLICT (slug) DO UPDATE SET
  name      = EXCLUDED.name,
  url       = EXCLUDED.url,
  icon      = EXCLUDED.icon,
  category  = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  status    = EXCLUDED.status;

-- Acesso por e-mail: adicione outros separados por vírgula.
INSERT INTO public.user_applications (user_id, application_id)
SELECT u.id, a.id
FROM   auth.users u
CROSS JOIN public.applications a
WHERE  a.slug = 'comparador-imagens'
  AND  u.email IN ('seu-email@exemplo.com')
ON CONFLICT (user_id, application_id) DO NOTHING;

COMMIT;

-- VERIFICAÇÃO (opcional)
-- SELECT slug, name, url, icon, category, is_active, status
-- FROM   public.applications WHERE slug = 'comparador-imagens';
