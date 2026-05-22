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

// Middleware: validar token e retornar user
async function getUser(event) {
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, nome, telefone')
    .eq('auth_token', token)
    .single();

  return error ? null : user;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const user = await getUser(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autenticado' }) };
  }

  // GET: buscar figurinhas do usuário
  if (event.httpMethod === 'GET') {
    const { data, error } = await supabase
      .from('user_stickers')
      .select('stickers_data, updated_at')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro ao buscar dados' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        stickers: data ? data.stickers_data : null,
        updated_at: data ? data.updated_at : null,
      }),
    };
  }

  // POST: salvar figurinhas do usuário
  if (event.httpMethod === 'POST') {
    try {
      const { stickers } = JSON.parse(event.body || '{}');

      if (!stickers || typeof stickers !== 'object') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Dados inválidos' }) };
      }

      // Calcular estatísticas para o motor de trocas
      const entries = Object.entries(stickers);
      const have = entries.filter(([, v]) => v > 0).map(([k]) => k);
      const missing = entries.filter(([, v]) => v === 0).map(([k]) => k);
      const repeats = entries.filter(([, v]) => v > 1).map(([k]) => k);

      const { error } = await supabase
        .from('user_stickers')
        .upsert({
          user_id: user.id,
          stickers_data: stickers,
          have_list: have,
          missing_list: missing,
          repeats_list: repeats,
          total_have: have.length,
          total_missing: missing.length,
          total_repeats: repeats.length,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('Sync error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro ao salvar' }) };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, synced_at: new Date().toISOString() }),
      };

    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
