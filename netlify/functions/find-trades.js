const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

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

/**
 * MOTOR DE IA PARA TROCAS INTELIGENTES
 * 
 * Algoritmo de match:
 * 1. Busca todos os usuários com figurinhas sincronizadas
 * 2. Para cada usuário, calcula:
 *    - Figurinhas que EU preciso e ELE tem repetidas (ele pode me dar)
 *    - Figurinhas que ELE precisa e EU tenho repetidas (eu posso dar)
 * 3. Score de compatibilidade = min(pode_me_dar, posso_dar) 
 *    (quanto mais equilibrada a troca, melhor)
 * 4. Classifica matches por score e retorna top resultados
 * 5. Identifica "trocas perfeitas" (ambos têm o que o outro precisa)
 */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const user = await getUser(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autenticado' }) };
  }

  try {
    // 1. Buscar dados do usuário atual
    const { data: myData, error: myError } = await supabase
      .from('user_stickers')
      .select('missing_list, repeats_list, stickers_data')
      .eq('user_id', user.id)
      .single();

    if (myError || !myData) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          matches: [],
          message: 'Sincronize suas figurinhas primeiro para encontrar trocas.',
        }),
      };
    }

    const myMissing = new Set(myData.missing_list || []);
    const myRepeats = new Set(myData.repeats_list || []);

    if (myMissing.size === 0 && myRepeats.size === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          matches: [],
          message: 'Você não tem figurinhas faltantes nem repetidas para trocar.',
        }),
      };
    }

    // 2. Buscar todos os outros usuários com dados sincronizados
    const { data: allUsers, error: allError } = await supabase
      .from('user_stickers')
      .select('user_id, missing_list, repeats_list')
      .neq('user_id', user.id);

    if (allError || !allUsers || allUsers.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          matches: [],
          message: 'Ainda não há outros colecionadores cadastrados. Convide amigos!',
        }),
      };
    }

    // 3. Buscar nomes/telefones dos usuários
    const userIds = allUsers.map(u => u.user_id);
    const { data: userProfiles } = await supabase
      .from('users')
      .select('id, nome, telefone')
      .in('id', userIds);

    const profileMap = {};
    (userProfiles || []).forEach(p => { profileMap[p.id] = p; });

    // 4. Calcular matches
    const matches = [];

    for (const other of allUsers) {
      const otherMissing = new Set(other.missing_list || []);
      const otherRepeats = new Set(other.repeats_list || []);
      const profile = profileMap[other.user_id];

      if (!profile) continue;

      // Figurinhas que ele tem repetidas e eu preciso
      const canGiveMe = [];
      for (const sticker of myMissing) {
        if (otherRepeats.has(sticker)) canGiveMe.push(sticker);
      }

      // Figurinhas que eu tenho repetidas e ele precisa
      const canTakeFromMe = [];
      for (const sticker of otherMissing) {
        if (myRepeats.has(sticker)) canTakeFromMe.push(sticker);
      }

      // Só incluir se há pelo menos 1 troca possível
      if (canGiveMe.length === 0 && canTakeFromMe.length === 0) continue;

      // Score de compatibilidade
      // Troca perfeita: ambos têm algo para dar
      const isPerfectTrade = canGiveMe.length > 0 && canTakeFromMe.length > 0;
      const balanceScore = Math.min(canGiveMe.length, canTakeFromMe.length);
      const totalScore = canGiveMe.length + canTakeFromMe.length;
      
      // Score final: prioriza trocas equilibradas e com mais figurinhas
      const score = isPerfectTrade 
        ? (balanceScore * 10) + totalScore 
        : totalScore;

      matches.push({
        user_id: other.user_id,
        nome: profile.nome,
        telefone: profile.telefone,
        telefone_masked: profile.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'),
        whatsapp_link: `https://wa.me/55${profile.telefone}`,
        can_give_me: canGiveMe.slice(0, 20), // limitar para não sobrecarregar
        can_give_me_count: canGiveMe.length,
        can_take_from_me: canTakeFromMe.slice(0, 20),
        can_take_from_me_count: canTakeFromMe.length,
        is_perfect_trade: isPerfectTrade,
        score,
        trade_summary: isPerfectTrade
          ? `Troca perfeita! Ele tem ${canGiveMe.length} que você precisa e precisa de ${canTakeFromMe.length} que você tem.`
          : canGiveMe.length > 0
            ? `Ele tem ${canGiveMe.length} figurinha(s) que você precisa.`
            : `Você tem ${canTakeFromMe.length} figurinha(s) que ele precisa.`,
      });
    }

    // 5. Ordenar por score (melhores trocas primeiro)
    matches.sort((a, b) => b.score - a.score);

    // 6. Estatísticas gerais
    const perfectTrades = matches.filter(m => m.is_perfect_trade).length;
    const totalPossibleStickers = matches.reduce((sum, m) => sum + m.can_give_me_count, 0);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        matches: matches.slice(0, 50), // top 50 matches
        stats: {
          total_matches: matches.length,
          perfect_trades: perfectTrades,
          total_stickers_available: totalPossibleStickers,
          my_missing: myMissing.size,
          my_repeats: myRepeats.size,
        },
        message: matches.length > 0
          ? `Encontramos ${matches.length} colecionador(es) para trocar! ${perfectTrades} troca(s) perfeita(s).`
          : 'Nenhuma troca encontrada no momento. Convide mais amigos!',
      }),
    };

  } catch (err) {
    console.error('Find trades error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
