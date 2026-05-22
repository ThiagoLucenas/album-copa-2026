const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { action, nome, telefone, codigo } = JSON.parse(event.body || '{}');

    // REGISTRO / LOGIN: envia código de verificação
    if (action === 'register' || action === 'login') {
      if (!nome || !telefone) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nome e telefone são obrigatórios' }) };
      }

      // Normalizar telefone (apenas números)
      const tel = telefone.replace(/\D/g, '');
      if (tel.length < 10 || tel.length > 13) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Telefone inválido' }) };
      }

      // Gerar código de 4 dígitos
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

      // Upsert usuário
      const { data: user, error: upsertError } = await supabase
        .from('users')
        .upsert(
          { telefone: tel, nome, verification_code: code, code_expires_at: expiresAt },
          { onConflict: 'telefone' }
        )
        .select()
        .single();

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro ao registrar' }) };
      }

      // Em produção, aqui enviaria SMS/WhatsApp com o código
      // Por enquanto, retornamos sucesso (código visível apenas no banco)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Código enviado para ${telefone}`,
          user_id: user.id,
          // DEV ONLY - remover em produção:
          _dev_code: code,
        }),
      };
    }

    // VERIFICAR CÓDIGO
    if (action === 'verify') {
      if (!telefone || !codigo) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Telefone e código são obrigatórios' }) };
      }

      const tel = telefone.replace(/\D/g, '');

      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('telefone', tel)
        .single();

      if (fetchError || !user) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
      }

      // Verificar código e expiração
      if (user.verification_code !== codigo) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Código inválido' }) };
      }

      if (new Date(user.code_expires_at) < new Date()) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Código expirado. Solicite um novo.' }) };
      }

      // Gerar token simples (em produção usar JWT)
      const token = Buffer.from(`${user.id}:${Date.now()}:${Math.random().toString(36)}`).toString('base64');

      // Atualizar token no banco
      await supabase
        .from('users')
        .update({ auth_token: token, verification_code: null, code_expires_at: null, verified: true })
        .eq('id', user.id);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          token,
          user: { id: user.id, nome: user.nome, telefone: user.telefone },
        }),
      };
    }

    // VALIDAR TOKEN (para sessões existentes)
    if (action === 'validate') {
      const authHeader = event.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');

      if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token não fornecido' }) };
      }

      const { data: user, error } = await supabase
        .from('users')
        .select('id, nome, telefone')
        .eq('auth_token', token)
        .single();

      if (error || !user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token inválido' }) };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, user }),
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ação inválida' }) };

  } catch (err) {
    console.error('Auth error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
