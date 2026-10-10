/* =====================================================================================
   REDES — ARQUIVO ÚNICO DE REGRAS (Política de Vendas para Redes, minuta v0.5 + decisões de 07/10/2026)
   Alimenta o MOTOR (validação da solicitação, faixa, metas, acompanhamento e desenquadramento), a aba
   REGRAS E TESTES (texto de cada regra) e a BATERIA DE TESTES automáticos. Mudou a regra aqui, muda o
   cálculo, o texto e o teste ao mesmo tempo. Os VALORES vêm da tabela rede_parametro (ADM edita); os
   padrões abaixo só valem se o banco não responder. Nenhum dado de negócio neste arquivo.
   ===================================================================================== */
const RD_DEF = {
  versaoTela: '0.2',
  versaoPolitica: 'minuta v0.5 (07/10/2026) + aprovação final pela Controladoria',
  padrao: { MIN_CNPJS: 30, META_MINIMA: 0, TETO_F1: 5e6, TETO_F2: 10e6, DESC_F1: .05, DESC_F2: .075, DESC_F3: .10,
            TOLERANCIA: .90, TRIM_REBAIXA: 2, TRIM_INATIVO: 2, CARENCIA: 1,
            SAZ_T1: .256, SAZ_T2: .199, SAZ_T3: .213, SAZ_T4: .332, DEFESA_MIN: 80, PRAZO_ORDEM_DIAS: 5,
            CAMP_INICIO: '2026-10-01', CAMP_FIM: '2026-12-31', CAMP_PCT: .10, CAMP_MESES: 6, BONIF_PRAZO_DIAS: 30, BONIF_TOLERANCIA: .01 },
  regras: [
    { id: 'R01', grupo: 'Solicitação', nome: 'CNPJ válido', texto: 'Todo CNPJ da lista precisa ter 14 dígitos e dígitos verificadores corretos.' },
    { id: 'R02', grupo: 'Solicitação', nome: 'Sem repetição', texto: 'O mesmo CNPJ não pode aparecer duas vezes na lista.' },
    { id: 'R03', grupo: 'Solicitação', nome: 'Cadastrado no TOTVS', texto: 'O CNPJ precisa existir no cadastro de clientes (cópia diária do Protheus).' },
    { id: 'R04', grupo: 'Solicitação', nome: 'Não bloqueado', texto: 'CNPJ bloqueado no cadastro não conta para a rede.' },
    { id: 'R05', grupo: 'Solicitação', nome: 'Uma rede por CNPJ', texto: 'O CNPJ não pode estar em outra rede em análise ou ativa.' },
    { id: 'R06', grupo: 'Solicitação', nome: 'Mínimo de CNPJs', texto: P => `A rede precisa de pelo menos ${P.MIN_CNPJS} CNPJs que passem nas regras R01 a R05 (da mesma empresa ou não).` },
    { id: 'R07', grupo: 'Solicitação', nome: 'Meta e prazo', texto: 'Meta de faturamento maior que zero e prazo de 6 ou 12 meses, começando no 1º dia de um trimestre civil.' },
    { id: 'R08', grupo: 'Solicitação', nome: 'Faixa pela meta', texto: P => `A faixa é decidida pela meta ANUALIZADA pela sazonalidade (prazo de 12 meses = a própria meta): até ${brl(P.TETO_F1)} = Faixa 1 (${pct(P.DESC_F1)}); até ${brl(P.TETO_F2)} = Faixa 2 (${pct(P.DESC_F2)}); acima = Faixa 3 (${pct(P.DESC_F3)}). ` + (P.META_MINIMA > 0 ? `Meta anualizada abaixo de ${brl(P.META_MINIMA)} não enquadra.` : 'Sem meta mínima (a barreira é o número de CNPJs).') },
    { id: 'R09', grupo: 'Solicitação', nome: 'Defesa comercial', texto: P => `O Comercial explica por que a rede merece a tabela (mínimo de ${P.DEFESA_MIN} caracteres).` },
    { id: 'R10', grupo: 'Solicitação', nome: 'VPC conferido', texto: 'Aviso: o SFA aplica o VPC do CADASTRO de cada CNPJ, por fora da tabela. CNPJs com VPC diferente de zero precisam ser conferidos contra o acordo antes da aprovação.' },
    { id: 'R11', grupo: 'Solicitação', nome: 'Grupo', texto: 'Aviso: numa rede do tipo GRUPO todos os CNPJs deveriam ser do mesmo grupo de clientes do TOTVS; grupos diferentes indicam rede ASSOCIATIVA.' },
    { id: 'R12', grupo: 'Solicitação', nome: 'Grupo dividido', texto: 'Aviso: lista os outros CNPJs do mesmo GRUPO (grupo de clientes ou mesma raiz de CNPJ) que ficaram fora da lista e os que já estão em outra rede — para evitar vinculação indevida da tabela a só parte do grupo.' },
    { id: 'A01', grupo: 'Aprovação', nome: 'Aprovação final da Controladoria', texto: 'Só a Controladoria (perfil ADM) aprova, reprova ou devolve, sempre com parecer. A decisão fica registrada (quem, quando, parecer).' },
    { id: 'A02', grupo: 'Aprovação', nome: 'Ordem ao Faturamento', texto: 'A aprovação gera a ordem ao Faturamento (Samuel) de VINCULAR os CNPJs à tabela da faixa no TOTVS. As tabelas são reconhecidas AUTOMATICAMENTE pelo nome no TOTVS ("REDES FAIXA 1/2/3") e a ordem é dada como CUMPRIDA sozinha quando o cadastro de todos os CNPJs bate — sem baixa manual.' },
    { id: 'A03', grupo: 'Aprovação', nome: 'Varredura de vínculos', texto: 'De hora em hora o app varre o cadastro: cliente em tabela de rede sem estar numa rede aprovada daquela faixa = VÍNCULO INDEVIDO; CNPJ de rede aprovada fora da tabela da sua faixa (sem ordem aberta no prazo) = FORA DA TABELA.' },
    { id: 'M01', grupo: 'Acompanhamento', nome: 'Meta acumulada com sazonalidade', texto: P => `A meta é distribuída pelos trimestres do contrato pelo peso de cada trimestre civil nas vendas (${pct(P.SAZ_T1)} · ${pct(P.SAZ_T2)} · ${pct(P.SAZ_T3)} · ${pct(P.SAZ_T4)}). Cobra-se a meta ACUMULADA desde o início.` },
    { id: 'M02', grupo: 'Acompanhamento', nome: 'Realizado', texto: 'Realizado = venda de todos os CNPJs ativos da rede no trimestre (valor da mercadoria sem IPI, vendas normais de produto acabado/revenda, sem bonificação), pela mesma carga diária da aba Curva.' },
    { id: 'M03', grupo: 'Acompanhamento', nome: 'Aviso', texto: P => `Realizado acumulado abaixo de ${pct(P.TOLERANCIA)} da meta acumulada = AVISO.` },
    { id: 'M04', grupo: 'Acompanhamento', nome: 'Rebaixa', texto: P => `${P.TRIM_REBAIXA} trimestres seguidos abaixo = REBAIXA uma faixa. Na Faixa 1 = PERDE A TABELA.` },
    { id: 'M05', grupo: 'Acompanhamento', nome: 'Sobe', texto: P => `${P.TRIM_REBAIXA} trimestres seguidos com o realizado anualizado acima do teto da faixa vigente = SOBE uma faixa.` },
    { id: 'M06', grupo: 'Acompanhamento', nome: 'CNPJ inativo', texto: P => `CNPJ sem compra em ${P.TRIM_INATIVO} trimestres seguidos sai da rede (só ele).` },
    { id: 'M07', grupo: 'Acompanhamento', nome: 'Mínimo de CNPJs ativos', texto: P => `Abaixo de ${P.MIN_CNPJS} CNPJs ativos, a rede tem ${P.CARENCIA} trimestre(s) para repor; não repondo, perde a tabela.` },
    { id: 'M08', grupo: 'Acompanhamento', nome: 'Falta de estoque da AMVOX', texto: 'Trimestre com exceção registrada pela Controladoria (ruptura nossa) não conta: sai da meta e do realizado acumulados e não avança aviso/rebaixa.' },
    { id: 'M09', grupo: 'Acompanhamento', nome: 'Ação vira ordem', texto: 'Rebaixa, subida, perda da tabela e saída de CNPJ são aplicadas pela Controladoria e geram ordem ao Faturamento, conferida no cadastro.' },
    { id: 'B01', grupo: 'Bonificação cliente novo / reativação', nome: 'Grupo inteiro', texto: 'O cliente é avaliado pelo GRUPO: todos os CNPJs do mesmo grupo de clientes do TOTVS e todos os CNPJs da mesma raiz (filiais). Política Comercial 01/10/2026 + Alfredo Caran 07/10/2026.' },
    { id: 'B02', grupo: 'Bonificação cliente novo / reativação', nome: 'Controle por NOTA', texto: 'Fatura-se o 1º pedido; no app escolhe-se a(s) nota(s) desse pedido entre as notas de venda do CNPJ emitidas na campanha. Data e valor (sem IPI) vêm da nota. Se o pedido saiu em mais de uma nota, todas precisam ser do mesmo dia.' },
    { id: 'B03', grupo: 'Bonificação cliente novo / reativação', nome: 'Cliente novo', texto: 'Nenhum CNPJ do grupo tinha compra antes da nota escolhida = CLIENTE NOVO, elegível.' },
    { id: 'B04', grupo: 'Bonificação cliente novo / reativação', nome: 'Reativação', texto: P => `A última compra de QUALQUER CNPJ do grupo antes da nota foi há mais de ${P.CAMP_MESES} meses = REATIVAÇÃO, elegível. Se alguém do grupo comprou dentro de ${P.CAMP_MESES} meses antes da nota, NÃO é reativação — inclusive quando comprava por uma filial e agora compra por outra. Se já houve nota do grupo na campanha antes desta, ela não é o 1º pedido.` },
    { id: 'B06', grupo: 'Bonificação cliente novo / reativação', nome: 'Baixa pela nota de bonificação', texto: P => `Depois da aprovação, o app liga sozinho a aprovação à 1ª nota de bonificação (CFOP 5910/6910) do GRUPO emitida a partir da data da aprovação, em até ${P.BONIF_PRAZO_DIAS} dias: situação CONCEDIDA (NF EMITIDA). Nota acima do aprovado (tolerância ${pct(P.BONIF_TOLERANCIA)}) = NF ACIMA DO APROVADO; sem nota no prazo = NOTA NÃO EMITIDA NO PRAZO. Cada nota de bonificação liga a uma aprovação só.` },
    { id: 'B05', grupo: 'Bonificação cliente novo / reativação', nome: 'Uma por grupo, cada nota uma vez', texto: P => `Bonificação em produto de ${pct(P.CAMP_PCT)} do valor da(s) nota(s) do 1º pedido, uma única vez por grupo, para notas de ${P.CAMP_INICIO} a ${P.CAMP_FIM}. O registro só aceita cliente elegível, recusa a segunda bonificação do grupo e não deixa a mesma nota ser usada duas vezes.` }
  ]
};
function pct(x){ return (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'; }
function brl(x){ return 'R$ ' + Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }

/* ===================================================================================== MOTOR */
const RD = {
  dig: s => String(s ?? '').replace(/\D/g, ''),
  cnpjValido(c){
    c = RD.dig(c); if(c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    const dv = n => { const p = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      const s = p.reduce((a, w, i) => a + w * +c[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
    return dv(12) === +c[12] && dv(13) === +c[13];
  },
  saz: (P, t) => P['SAZ_T' + t],
  /* trimestres do contrato: k = 1..prazo/3, com ano/trimestre civil e meses AAAA-MM */
  trimestres(ano, tri, prazo){
    const out = [];
    for(let k = 0; k < prazo / 3; k++){
      const t0 = tri - 1 + k, a = ano + Math.floor(t0 / 4), t = t0 % 4 + 1;
      out.push({ k: k + 1, ano: a, tri: t, meses: [0, 1, 2].map(i => `${a}-${String((t - 1) * 3 + 1 + i).padStart(2, '0')}`) });
    }
    return out;
  },
  participacao(prazo, tri, P){ return prazo >= 12 ? 1 : RD.saz(P, tri) + RD.saz(P, tri % 4 + 1); },
  metaAnual(meta, prazo, tri, P){ return meta / RD.participacao(prazo, tri, P); },
  faixa(metaAnual, P){ return metaAnual < P.META_MINIMA || !(metaAnual > 0) ? 0 : metaAnual <= P.TETO_F1 ? 1 : metaAnual <= P.TETO_F2 ? 2 : 3; },
  desconto: (f, P) => f ? P['DESC_F' + f] : 0,
  teto: (f, P) => [P.META_MINIMA, P.TETO_F1, P.TETO_F2, Infinity][f],
  /* acompanhamento: realizados[k-1] = valor do trimestre (null = ainda não medido); excecoes = Set de k */
  avalia({ meta, prazo, ano, tri, faixaEntrada, realizados, excecoes }, P){
    const T = RD.trimestres(ano, tri, prazo), part = RD.participacao(prazo, tri, P), ex = excecoes || new Set();
    let mAc = 0, rAc = 0, pAc = 0, seqAb = 0, seqUp = 0, fx = faixaEntrada, acaoAnt = '';
    return T.map((q, i) => {
      const peso = RD.saz(P, q.tri), real = realizados[i], linha = { ...q, peso, metaTri: meta * peso / part, real };
      if(real == null){ return { ...linha, status: '', acao: '', faixa: fx }; }
      if(ex.has(q.k)){ return { ...linha, status: 'EXCEÇÃO', acao: 'Exceção (falta de estoque AMVOX) — não conta', faixa: fx, mAc, rAc }; }
      mAc += meta * peso / part; rAc += real; pAc += peso;
      const pctR = mAc ? rAc / mAc : 0, ok = pctR >= P.TOLERANCIA - 1e-9, anual = rAc / pAc;
      seqAb = ok ? 0 : (acaoAnt.startsWith('REBAIXA') ? 0 : seqAb) + 1;
      seqUp = ok && fx > 0 && anual > RD.teto(fx, P) ? (acaoAnt.startsWith('SOBE') ? 0 : seqUp) + 1 : 0;
      const antes = fx;
      if(seqAb >= P.TRIM_REBAIXA) fx = Math.max(0, fx - 1);
      else if(seqUp >= P.TRIM_REBAIXA) fx = Math.min(3, fx + 1);
      const acao = fx < antes ? (fx === 0 ? 'PERDE A TABELA' : `REBAIXA → FAIXA ${fx}`) : fx > antes ? `SOBE → FAIXA ${fx}` : ok ? 'OK' : 'AVISO';
      acaoAnt = acao; if(fx > antes) seqUp = 0;
      return { ...linha, mAc, rAc, pct: pctR, status: ok ? 'OK' : 'ABAIXO', anual, seqAb, seqUp, acao, faixa: fx, faixaAntes: antes };
    });
  },
  /* atividade por CNPJ: compras[cnpj] = [valor tri1, tri2, ...] até o trimestre medido 'atual' */
  atividade(compras, atual, P){
    const st = {};
    Object.entries(compras).forEach(([c, v]) => {
      const janela = v.slice(Math.max(0, atual - P.TRIM_INATIVO), atual);
      st[c] = atual >= P.TRIM_INATIVO && janela.length === P.TRIM_INATIVO && janela.every(x => !(x > 0)) ? 'INATIVO' : 'ATIVO';
    });
    // histórico do mínimo de CNPJs ativos: carência de P.CARENCIA trimestre(s)
    let seq = 0, situacao = 'OK';
    for(let k = 1; k <= atual; k++){
      const ativos = Object.values(compras).filter(v => !(k >= P.TRIM_INATIVO && v.slice(k - P.TRIM_INATIVO, k).every(x => !(x > 0)))).length;
      seq = ativos < P.MIN_CNPJS ? seq + 1 : 0;
      situacao = seq === 0 ? 'OK' : seq <= P.CARENCIA ? 'ABAIXO DO MÍNIMO — em carência' : 'PERDE A TABELA (não repôs CNPJs)';
    }
    return { st, ativos: Object.values(st).filter(x => x === 'ATIVO').length, situacao };
  },
  /* requisitos da solicitação. cad: Map cnpj -> [linhas do cadastro]; emOutra: Map cnpj -> 'nº/nome da rede' */
  requisitos(sol, cnpjs, cad, emOutra, P, grupo){
    const vistos = new Map(); cnpjs.forEach(c => vistos.set(c, (vistos.get(c) || 0) + 1));
    const itens = [...vistos.keys()].map(c => {
      const linhas = cad.get(c) || [], ativo = linhas.find(l => !l.bloqueado), l = ativo || linhas[0];
      const prob = [];
      if(!RD.cnpjValido(c)) prob.push('R01');
      if(vistos.get(c) > 1) prob.push('R02');
      if(!linhas.length) prob.push('R03'); else if(!ativo) prob.push('R04');
      if(emOutra.has(c)) prob.push('R05');
      return { cnpj: c, cad: l || null, prob, conta: !prob.length, outra: emOutra.get(c) || '' };
    });
    const validos = itens.filter(i => i.conta).length;
    const ma = sol.meta > 0 && [6, 12].includes(+sol.prazo) ? RD.metaAnual(sol.meta, +sol.prazo, +sol.tri, P) : 0, f = RD.faixa(ma, P);
    const lista = id => itens.filter(i => i.prob.includes(id)).map(i => i.cnpj);
    const vpc = itens.filter(i => i.cad && +i.cad.vpc > 0), grupos = new Set(itens.filter(i => i.cad).map(i => i.cad.grupo || '(sem grupo)'));
    const R = [
      { id: 'R01', ok: !lista('R01').length, nivel: 'BLOQUEIA', det: lista('R01') },
      { id: 'R02', ok: !lista('R02').length, nivel: 'BLOQUEIA', det: lista('R02') },
      { id: 'R03', ok: !lista('R03').length, nivel: 'BLOQUEIA', det: lista('R03') },
      { id: 'R04', ok: !lista('R04').length, nivel: 'ALERTA', det: lista('R04') },
      { id: 'R05', ok: !lista('R05').length, nivel: 'BLOQUEIA', det: lista('R05').map(c => `${c} (${emOutra.get(c)})`) },
      { id: 'R06', ok: validos >= P.MIN_CNPJS, nivel: 'BLOQUEIA', det: [`${validos} CNPJs válidos de ${P.MIN_CNPJS} exigidos`] },
      { id: 'R07', ok: sol.meta > 0 && [6, 12].includes(+sol.prazo) && sol.tri >= 1 && sol.tri <= 4 && sol.ano > 2000, nivel: 'BLOQUEIA', det: [] },
      { id: 'R08', ok: f >= 1, nivel: 'BLOQUEIA', det: [ma ? `meta anualizada ${brl(ma)} → ${f ? 'FAIXA ' + f + ' (' + pct(RD.desconto(f, P)) + ')' : 'não enquadra'}` : ''] },
      { id: 'R09', ok: String(sol.defesa || '').trim().length >= P.DEFESA_MIN, nivel: 'BLOQUEIA', det: [`${String(sol.defesa || '').trim().length} de ${P.DEFESA_MIN} caracteres`] },
      { id: 'R10', ok: !vpc.length, nivel: 'ALERTA', det: vpc.map(i => `${i.cnpj} VPC ${pct(+i.cad.vpc / 100)}`) },
      { id: 'R11', ok: sol.tipo !== 'GRUPO' || grupos.size <= 1, nivel: 'ALERTA', det: [`${grupos.size} grupo(s): ${[...grupos].slice(0, 6).join(', ')}`] }
    ];
    if(grupo){   // R12: outros CNPJs do mesmo grupo fora da lista / em outra rede
      const fora = new Map(); grupo.filter(g => !g.bloqueado && !vistos.has(g.cnpj)).forEach(g => fora.set(g.cnpj, g));
      const outra = [...fora.values()].filter(g => g.rede_id);
      R.push({ id: 'R12', ok: !fora.size, nivel: 'ALERTA', det: fora.size ? [`${fora.size} CNPJ(s) do mesmo grupo fora da lista` + (outra.length ? `, ${outra.length} em outra rede (${[...new Set(outra.map(g => 'nº ' + g.rede_id + ' ' + g.rede_nome))].slice(0, 3).join('; ')})` : ''),
        ...[...fora.values()].slice(0, 8).map(g => `${g.cnpj} ${g.nome || ''}`)] : [] });
    }
    return { itens, R, validos, metaAnual: ma, faixa: f, podeEnviar: R.every(r => r.ok || r.nivel !== 'BLOQUEIA') };
  }
};

/* bonificação: espelho da função bonif_avaliar do banco (a tela compara os dois e avisa se divergirem).
   membros = [{ult_antes:'AAAA-MM-DD'|null, antigo:bool}] (compras do grupo ANTES da nota); data = emissão da nota;
   usada = nota já usada; concedida = bonificação anterior do grupo na campanha */
RD.corteMeses = function(data, meses){           // igual ao Postgres (data − interval 'N months'): dia limitado ao último dia do mês
  const [y, m, d] = data.split('-').map(Number), t = (y * 12 + m - 1) - meses, ty = Math.floor(t / 12), tm = t % 12 + 1;
  const ult = new Date(ty, tm, 0).getDate(); return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`;
};
RD.bonif = function({ membros, data, usada, concedida }, P){
  const corte = RD.corteMeses(data, P.CAMP_MESES), datas = membros.map(m => m.ult_antes).filter(Boolean).sort();
  const ult = datas.length ? datas[datas.length - 1] : null, antigo = membros.some(m => m.antigo);
  const c = data < P.CAMP_INICIO || data > P.CAMP_FIM ? 'FORA DA CAMPANHA' : usada || concedida ? 'JÁ CONCEDIDA'
        : ult && ult >= corte ? 'NÃO É REATIVAÇÃO' : !ult && !antigo ? 'CLIENTE NOVO' : 'REATIVAÇÃO';
  return { classificacao: c, elegivel: c === 'CLIENTE NOVO' || c === 'REATIVAÇÃO', ult, corte };
};

/* ===================================================================================== TESTES
   Cada regra tem pelo menos um caso. A aba "Regras e testes" roda todos com os parâmetros PADRÃO (os casos
   foram escritos para eles) e mostra PASSOU/FALHOU — a garantia de que o motor faz o que a política diz. */
const RD_TESTES = (() => {
  const P = RD_DEF.padrao, T = [];
  const t = (regra, nome, fn) => T.push({ regra, nome, fn });
  const eq = (a, b, msg) => { if(JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };
  const cad = (lista) => new Map(lista.map(x => [x.cnpj, [x]]));
  const gera = n => { const out = []; let base = 11222333; while(out.length < n){ const b = String(base++).padStart(8, '0') + '0001';
      const dv = p => { const w = p === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; const s = w.reduce((a, x, i) => a + x * +(b + (p === 13 ? d1 : ''))[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
      var d1 = String(dv(12)); out.push(b + d1 + dv(13)); } return out; };
  t('R01', 'CNPJ com dígito certo passa; com dígito errado falha; repetido (111…) falha', () => {
    eq(RD.cnpjValido('11.222.333/0001-81'), true, 'válido'); eq(RD.cnpjValido('11222333000182'), false, 'DV errado'); eq(RD.cnpjValido('11111111111111'), false, 'repetido'); });
  t('R06', '30 CNPJs válidos no cadastro = OK; 29 = bloqueia', () => {
    const c = gera(30), m = cad(c.map(x => ({ cnpj: x, bloqueado: false, vpc: 0, grupo: 'G1' })));
    const s = { meta: 1e6, prazo: 12, tri: 1, ano: 2027, defesa: 'x'.repeat(80), tipo: 'GRUPO' };
    eq(RD.requisitos(s, c, m, new Map(), P).R.find(r => r.id === 'R06').ok, true, '30');
    eq(RD.requisitos(s, c.slice(0, 29), m, new Map(), P).R.find(r => r.id === 'R06').ok, false, '29'); });
  t('R02-R05', 'Repetido, fora do cadastro, bloqueado e em outra rede não contam', () => {
    const c = gera(4), m = cad([{ cnpj: c[0], bloqueado: false, vpc: 0 }, { cnpj: c[1], bloqueado: true, vpc: 0 }, { cnpj: c[3], bloqueado: false, vpc: 0 }]);
    const r = RD.requisitos({ meta: 1, prazo: 12, tri: 1, ano: 2027, defesa: '' }, [c[0], c[0], c[1], c[2], c[3]], m, new Map([[c[3], 'nº 9']]), P);
    eq(r.validos, 0, 'nenhum conta'); eq(r.itens.find(i => i.cnpj === c[1]).prob, ['R04'], 'bloqueado'); eq(r.itens.find(i => i.cnpj === c[2]).prob, ['R03'], 'sem cadastro'); });
  t('R12', 'CNPJ do mesmo grupo fora da lista gera aviso (não bloqueia); bloqueado não conta', () => {
    const c = gera(31), m = cad(c.slice(0, 30).map(x => ({ cnpj: x, bloqueado: false, vpc: 0, grupo: 'G' })));
    const s = { meta: 1e6, prazo: 12, tri: 1, ano: 2027, defesa: 'x'.repeat(80), tipo: 'GRUPO' };
    const r = RD.requisitos(s, c.slice(0, 30), m, new Map(), P, [{ cnpj: c[30], nome: 'filial fora', bloqueado: false }]);
    eq([r.R.find(x => x.id === 'R12').ok, r.podeEnviar], [false, true], 'aviso');
    eq(RD.requisitos(s, c.slice(0, 30), m, new Map(), P, [{ cnpj: c[30], bloqueado: true }]).R.find(x => x.id === 'R12').ok, true, 'bloqueado'); });
  t('R08', 'Faixas nos limites: 5 mi = F1 · 5.000.001 = F2 · 10 mi = F2 · 10.000.001 = F3', () => {
    eq([5e6, 5e6 + 1, 10e6, 10e6 + 1].map(v => RD.faixa(v, P)), [1, 2, 2, 3], 'faixas'); });
  t('R08', 'Sem meta mínima: qualquer meta > 0 entra na Faixa 1; com mínimo de 1 mi, 999 mil não enquadra', () => {
    eq(RD.faixa(200000, P), 1, 'sem mínimo'); eq(RD.faixa(999000, { ...P, META_MINIMA: 1e6 }), 0, 'com mínimo'); });
  t('R08', 'Prazo de 6 meses é anualizado pela sazonalidade (entrada no 1º tri: 3 mi ÷ 45,5% = 6,59 mi → F2)', () => {
    eq(Math.round(RD.metaAnual(3e6, 6, 1, P)), Math.round(3e6 / (.256 + .199)), 'anualizada'); eq(RD.faixa(RD.metaAnual(3e6, 6, 1, P), P), 2, 'faixa'); });
  t('R09', 'Defesa abaixo do mínimo bloqueia o envio', () => {
    const c = gera(30), m = cad(c.map(x => ({ cnpj: x, bloqueado: false, vpc: 0 })));
    eq(RD.requisitos({ meta: 1e6, prazo: 12, tri: 1, ano: 2027, defesa: 'curta' }, c, m, new Map(), P).podeEnviar, false, 'bloqueia'); });
  t('M01', 'Meta acumulada sazonal: 6 mi entrando no 1º tri → 1,536 mi no 1º e 2,73 mi no semestre', () => {
    const a = RD.avalia({ meta: 6e6, prazo: 12, ano: 2027, tri: 1, faixaEntrada: 2, realizados: [2e6, 1e6, null, null] }, P);
    eq(Math.round(a[0].mAc), 1536000, '1º tri'); eq(Math.round(a[1].mAc), 2730000, 'semestre'); });
  t('M03', 'Exatamente 90% da meta acumulada = OK; abaixo = AVISO', () => {
    const a = RD.avalia({ meta: 6e6, prazo: 12, ano: 2027, tri: 1, faixaEntrada: 2, realizados: [1536000 * .9, null, null, null] }, P); eq(a[0].acao, 'OK', '90%');
    const b = RD.avalia({ meta: 6e6, prazo: 12, ano: 2027, tri: 1, faixaEntrada: 2, realizados: [1536000 * .89, null, null, null] }, P); eq(b[0].acao, 'AVISO', '89%'); });
  t('M04', 'Caso da planilha: F2 → OK, AVISO, REBAIXA → FAIXA 1', () => {
    const a = RD.avalia({ meta: 6e6, prazo: 12, ano: 2027, tri: 1, faixaEntrada: 2, realizados: [1694896.64, 716400.05, 894600.12, null] }, P);
    eq(a.slice(0, 3).map(x => x.acao), ['OK', 'AVISO', 'REBAIXA → FAIXA 1'], 'sequência'); eq(a[2].faixa, 1, 'faixa'); });
  t('M04', 'Na Faixa 1: AVISO e depois PERDE A TABELA', () => {
    const a = RD.avalia({ meta: 3e6, prazo: 12, ano: 2027, tri: 1, faixaEntrada: 1, realizados: [768000, 298500, 319500, null] }, P);
    eq(a.slice(0, 3).map(x => x.acao), ['OK', 'AVISO', 'PERDE A TABELA'], 'sequência'); eq(a[2].faixa, 0, 'faixa'); });
  t('M04', 'Depois de rebaixar, a contagem recomeça (novo AVISO antes de nova rebaixa)', () => {
    const a = RD.avalia({ meta: 12e6, prazo: 12, ano: 2027, tri: 1, faixaEntrada: 3, realizados: [1e6, 1e6, 1e6, 1e6] }, P);
    eq(a.map(x => x.acao), ['AVISO', 'REBAIXA → FAIXA 2', 'AVISO', 'REBAIXA → FAIXA 1'], 'sequência'); });
  t('M05', 'Realizado anualizado acima do teto em 2 trimestres seguidos: SOBE uma faixa', () => {
    const a = RD.avalia({ meta: 4e6, prazo: 12, ano: 2027, tri: 1, faixaEntrada: 1, realizados: [2e6, 2e6, null, null] }, P);
    eq(a.slice(0, 2).map(x => x.acao), ['OK', 'SOBE → FAIXA 2'], 'sobe'); });
  t('M06', 'CNPJ sem compra nos 2 últimos trimestres = INATIVO; com compra em 1 deles = ATIVO', () => {
    const r = RD.atividade({ a: [10, 0, 0], b: [0, 0, 5], c: [5, 5, 5] }, 3, P); eq([r.st.a, r.st.b, r.st.c], ['INATIVO', 'ATIVO', 'ATIVO'], 'situação'); });
  t('M07', 'Abaixo de 30 ativos: carência de 1 trimestre e depois perde a tabela', () => {
    const compras = {}; gera(31).forEach((c, i) => compras[c] = i < 3 ? [10, 0, 0, 0] : [10, 10, 10, 10]);
    eq(RD.atividade(compras, 2, P).situacao, 'OK', 'tri 2'); eq(RD.atividade(compras, 3, P).situacao, 'ABAIXO DO MÍNIMO — em carência', 'tri 3');
    eq(RD.atividade(compras, 4, P).situacao, 'PERDE A TABELA (não repôs CNPJs)', 'tri 4'); });
  t('M08', 'Trimestre com exceção de ruptura não conta nem avança a rebaixa', () => {
    const a = RD.avalia({ meta: 6e6, prazo: 12, ano: 2027, tri: 1, faixaEntrada: 2, realizados: [1e6, 1e5, 1e6, null], excecoes: new Set([2]) }, P);
    eq(a.slice(0, 3).map(x => x.acao.startsWith('Exceção') ? 'EXC' : x.acao), ['AVISO', 'EXC', 'REBAIXA → FAIXA 1'], 'sequência'); });
  t('R07', 'Trimestres do contrato atravessam o ano: entrada no 4º tri de 2026 por 12 meses', () => {
    eq(RD.trimestres(2026, 4, 12).map(q => `${q.ano}T${q.tri}`), ['2026T4', '2027T1', '2027T2', '2027T3'], 'trimestres'); });
  const bP = { ...P };
  const B = (membros, data, extra) => RD.bonif({ membros, data, ...(extra || {}) }, bP).classificacao;
  t('B03', 'Grupo sem nenhuma compra antes da nota = CLIENTE NOVO', () => { eq(B([{ ult_antes: null }, { ult_antes: null }], '2026-10-15'), 'CLIENTE NOVO', 'novo'); });
  t('B04', 'Grupo comprou há 7 meses = REATIVAÇÃO', () => { eq(B([{ ult_antes: '2026-03-10' }], '2026-10-15'), 'REATIVAÇÃO', 'reativação'); });
  t('B04', 'Grupo só comprou antes do início das notas carregadas = REATIVAÇÃO', () => { eq(B([{ ult_antes: null, antigo: true }], '2026-10-15'), 'REATIVAÇÃO', 'antigo'); });
  t('B04', 'Filial comprou há 2 meses, nota sai por OUTRA filial = NÃO É REATIVAÇÃO', () => {
    eq(B([{ cnpj: 'filial A', ult_antes: '2026-08-01' }, { cnpj: 'filial B (nota)', ult_antes: '2025-01-05' }], '2026-10-15'), 'NÃO É REATIVAÇÃO', 'grupo'); });
  t('B04', 'Já houve nota do grupo na campanha antes desta = não é o 1º pedido', () => { eq(B([{ ult_antes: '2026-10-03' }], '2026-10-20'), 'NÃO É REATIVAÇÃO', '2ª nota'); });
  t('B04', 'Exatamente 6 meses antes ainda é compra recente (não é reativação)', () => { eq(B([{ ult_antes: '2026-04-15' }], '2026-10-15'), 'NÃO É REATIVAÇÃO', 'limite'); });
  t('B04', 'Fim de mês igual ao banco: 31/12 → corte 30/06; 31/08 → 28/02', () => { eq(RD.corteMeses('2026-12-31', 6), '2026-06-30', '31/12'); eq(RD.corteMeses('2027-08-31', 6), '2027-02-28', '31/08'); });
  t('B05', 'Grupo que já recebeu a bonificação = JÁ CONCEDIDA; nota já usada = JÁ CONCEDIDA', () => {
    eq(B([{ ult_antes: null }], '2026-11-15', { concedida: { id: 1 } }), 'JÁ CONCEDIDA', 'grupo'); eq(B([{ ult_antes: null }], '2026-11-15', { usada: true }), 'JÁ CONCEDIDA', 'nota'); });
  t('B05', 'Nota fora do período da campanha = FORA DA CAMPANHA', () => { eq(B([{ ult_antes: null }], '2027-01-05'), 'FORA DA CAMPANHA', 'período'); });
  return T;
})();
function rodaTestes(){
  return RD_TESTES.map(x => { try { x.fn(); return { ...x, ok: true, erro: '' }; } catch(e){ return { ...x, ok: false, erro: e.message }; } });
}
