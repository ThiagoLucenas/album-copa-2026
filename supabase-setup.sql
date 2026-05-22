-- ============================================
-- ÁLBUM COPA 2026 — Setup do Banco de Dados
-- Execute este SQL no Supabase SQL Editor
-- ============================================

-- 1. Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT UNIQUE NOT NULL,
  verification_code TEXT,
  code_expires_at TIMESTAMPTZ,
  auth_token TEXT,
  verified BOOLEAN DEFAULT FALSE,
  is_premium BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_telefone ON users(telefone);
CREATE INDEX IF NOT EXISTS idx_users_auth_token ON users(auth_token);

-- 2. Tabela de Figurinhas dos Usuários
CREATE TABLE IF NOT EXISTS user_stickers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  stickers_data JSONB NOT NULL DEFAULT '{}',
  have_list TEXT[] DEFAULT '{}',
  missing_list TEXT[] DEFAULT '{}',
  repeats_list TEXT[] DEFAULT '{}',
  total_have INTEGER DEFAULT 0,
  total_missing INTEGER DEFAULT 0,
  total_repeats INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para o motor de trocas (busca por arrays)
CREATE INDEX IF NOT EXISTS idx_stickers_user_id ON user_stickers(user_id);
CREATE INDEX IF NOT EXISTS idx_stickers_repeats ON user_stickers USING GIN(repeats_list);
CREATE INDEX IF NOT EXISTS idx_stickers_missing ON user_stickers USING GIN(missing_list);

-- 3. Tabela de Histórico de Trocas (opcional, para rastreamento)
CREATE TABLE IF NOT EXISTS trade_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a UUID REFERENCES users(id),
  user_b UUID REFERENCES users(id),
  stickers_a_to_b TEXT[] DEFAULT '{}',
  stickers_b_to_a TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'proposed', -- proposed, accepted, completed, cancelled
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS (Row Level Security) - Segurança
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

-- Políticas: permitir acesso via service_key (backend)
-- O backend usa SUPABASE_SERVICE_KEY que bypassa RLS
-- Se quiser acesso direto do frontend, adicione políticas específicas

-- 5. Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER stickers_updated_at
  BEFORE UPDATE ON user_stickers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- PRONTO! Banco configurado para o Álbum Copa 2026
-- ============================================
