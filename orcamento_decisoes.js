/* DECISÕES POR LINHA (área × conta) — EDITÁVEIS NO APP (15/11/2026: "irei usar o App para fazer as configurações, e o PT só deve ser gerado quando eu
   disser que pode… o PT, para ser gerado, deverá consultar o app").
   Tabela orc_decisao (migração 054; POR VERSÃO): uma linha por área × conta com o que VALE (decisão GESTOR / MODELO / OUTRO / CONTRATO — vazio = padrão do
   PT —, valor outro, explicação do gestor e comentário), o que o PT carregado traz (colunas _pt) e a TRAVA (regra do modelo que prevalece: a linha fica só
   leitura). Só a Controladoria altera, em versão editável; o banco carimba quem e quando e guarda o histórico campo a campo (orc_alteracao). A lista de
   linhas nasce do PT: a tela não inclui nem exclui linha.
   🔴 O app NÃO recalcula o orçamento: o gerador do PT lê esta tabela a CADA geração. A tela mostra o valor final ESTIMADO da linha alterada (o número do
   gestor, do modelo, do contrato ou o valor digitado) — a DRE, o caixa e os resumos só mudam quando o PT for gerado de novo.
   Carregado ANTES do orcamento.js; instalado pelo gancho instalaOrcDecisoes() DEPOIS dos outros (embrulha a tela decisoes, que continua valendo — só
   leitura — enquanto a tabela não existir ou não tiver linhas nesta versão). Prévia local: D.decisoes_dados (alterações só na tela). Nenhum dado aqui. */
"use strict";
const DCS = { versao: null, carregando: false, instalada: null, erro: null, rows: new Map(), orig: new Map(), sujo: new Set(), msg: null };
const DCS_CAMPOS = ['decisao', 'valor_outro', 'explicacao', 'comentario'];
const DCS_OPC = ['GESTOR', 'MODELO', 'OUTRO', 'CONTRATO'];

/* 17/11/2026 — TRAVA DOS APROVADOS (migração 061; Silvio: "não quero correr o risco de perder nada do que já foi configurado e aprovado para a área, por conta de
   atualização do orçamento"). Salvar uma decisão (ou "Aprovar a área") grava a APROVAÇÃO da linha: a decisão que vale, o número do gestor e o valor final; o banco
   carimba quando e quem. Na geração do PT, linha aprovada com GESTOR cujo orçado do gestor mudou depois mantém o valor aprovado (o PT traz OUTRO e o comentário
   "🔶 RECONFIRMAR") até a reconfirmação aqui: aceitar o número novo ou manter o aprovado. Sem a migração 061 nada disso aparece. */
const DCS_APROV = ['aprovado_gestor', 'aprovado_valor', 'aprovado_decisao'];
const dcsTemAprov = () => { for (const r of DCS.rows.values()) return 'aprovado_em' in r; return false; };
const dcsAp = (k, v) => k === 'aprovado_decisao' ? (String(v ?? '').trim() || null) : (v == null || v === '' || !isFinite(+v) ? null : Math.round(+v * 100) / 100);
const dcsMudouAp = r => { const o = DCS.orig.get(r.id) || {}; return DCS_APROV.filter(k => dcsAp(k, r[k]) !== dcsAp(k, o[k])); };
const dcsMantido = r => !!(r && r.aprovado_decisao === 'GESTOR' && r.decisao_pt === 'OUTRO' && /^🔶 RECONFIRMAR/.test(r.comentario_pt || ''));
const dcsReconf = (l, r) => dcsMantido(r) && Math.abs((+l.ge || 0) - (+r.aprovado_gestor || 0)) > 1;      // o PT manteve o aprovado e o gestor ainda está noutro número
const dcsDataBr = ts => { const d = ts ? new Date(ts) : null; return d && !isNaN(d) ? d.toLocaleDateString('pt-BR') : ''; };
function dcsFoto(l, r) {                 // aprovação = o que a tela mostra agora: a decisão que vale, o número do gestor e o valor final
  const d = r.decisao || dcsPadrao(l), fin = d === 'GESTOR' ? l.ge : d === 'MODELO' ? l.mo : d === 'CONTRATO' ? (l.mc ?? l.mo) : (r.valor_outro ?? 0);
  return { aprovado_decisao: d, aprovado_gestor: dcsAp('aprovado_gestor', +l.ge || 0), aprovado_valor: dcsAp('aprovado_valor', +fin || 0) };
}
function dcsAprovHtml(l, r, id, ed) {
  if (!r || r.trava) return '';
  const quem = String(r.aprovado_por || '').startsWith('semente') ? 'semente das decisões já digitadas' : String(r.aprovado_por || '').split('@')[0];
  const det = r.aprovado_em ? `Aprovado em ${dcsDataBr(r.aprovado_em)}${quem ? ' (' + quem + ')' : ''}: ${r.aprovado_decisao} ${rs(+r.aprovado_valor || 0)} — gestor ${rs(+r.aprovado_gestor || 0)}` : '';
  if (DCS.sujo.has(id) && dcsMudouAp(r).length) return '<span class="tag b" title="A aprovação é gravada ao salvar">aprova ao salvar</span>';
  if (dcsReconf(l, r)) return `<span class="tag y" title="${esc(det)}. O gestor mudou o orçado para ${esc(rs(+l.ge || 0))}: o PT manteve o aprovado até você decidir.">🔶 reconfirmar</span>
    <br><small style="color:var(--ink3)">aprovado ${rs(+r.aprovado_valor || 0)}<br>gestor agora ${rs(+l.ge || 0)}</small>${ed ? `<br><button class="btn" data-dcsaceita="${esc(id)}" style="padding:2px 8px;font-size:12px;margin-top:4px">Aceitar o novo</button>
    <button class="btn" data-dcsmantem="${esc(id)}" style="padding:2px 8px;font-size:12px;margin-top:4px">Manter o aprovado</button>` : ''}`;
  if (dcsMantido(r)) return `<span class="tag b" title="${esc(det)}">aceito · o número novo entra na próxima geração</span>`;
  return r.aprovado_em ? `<span class="tag g" title="${esc(det)}">✔ ${dcsDataBr(r.aprovado_em)}</span>` : '';
}
const dcsAtiva = () => DCS.instalada === true && DCS.versao === est.versao && DCS.rows.size > 0;
const dcsEdita = () => est.papel === 'controladoria' && versaoEditavel();
const dcsN = (k, v) => k === 'valor_outro' ? (v == null || v === '' || !isFinite(+v) ? null : Math.round(+v * 100) / 100) : (String(v ?? '').trim() || null);
const dcsId = l => `${l.s}|${l.c}`;

async function dcsCarrega() {
  if (DCS.carregando || DCS.versao === est.versao) return;
  DCS.carregando = true; DCS.erro = null; let rows = [];
  const v = est.versao;
  try {
    if (window.ORC_FONTE_LOCAL) { rows = (D.decisoes_dados || []).map(x => ({ ...x })); DCS.instalada = Array.isArray(D.decisoes_dados); }
    else if (!['controladoria', 'ceo'].includes(est.papelReal)) DCS.instalada = null;                              // sem leitura da tabela para os demais perfis
    else { rows = await selTodos(() => SB.from('orc_decisao').select('*').eq('versao', v).order('id')); DCS.instalada = true; }
  } catch (e) {
    rows = [];
    if (/orc_decisao/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205') DCS.instalada = false;
    else { DCS.instalada = null; DCS.erro = e.message || String(e); }
  }
  rows.forEach(r => DCS_CAMPOS.forEach(k => { r[k] = dcsN(k, r[k]); r[k + '_pt'] = dcsN(k, r[k + '_pt']); }));
  rows.forEach(r => { if ('aprovado_em' in r) DCS_APROV.forEach(k => { r[k] = dcsAp(k, r[k]); }); });          // 17/11/2026: trava dos aprovados (061)
  DCS.rows = new Map(rows.map(r => [r.id, r])); DCS.orig = new Map(rows.map(r => [r.id, { ...r }]));
  DCS.sujo.clear(); DCS.msg = null; DCS.versao = v; DCS.carregando = false; DCS._ids = null;
  if (est.tela === 'decisoes') desenha();
}

const dcsMudou = r => { const o = DCS.orig.get(r.id) || {}; return DCS_CAMPOS.filter(k => dcsN(k, r[k]) !== dcsN(k, o[k])); };
function dcsMarca(r) { if (dcsMudou(r).length || (dcsTemAprov() && dcsMudouAp(r).length)) DCS.sujo.add(r.id); else DCS.sujo.delete(r.id); }
/* o PT desta versão ainda não reflete a linha: linha livre em que o que vale no app ≠ o que o PT carregado traz */
const dcsPend = r => !!r && !r.trava && !dcsMantido(r) && DCS_CAMPOS.some(k => dcsN(k, r[k]) !== dcsN(k, r[k + '_pt']));   // 17/11: aprovado mantido não é pendência
/* sem decisão digitada vale o padrão do PT: CAPEX = GESTOR · área que não entregou ou conta por % do faturamento = MODELO · senão GESTOR */
function dcsPadrao(l) {
  if (l.c === 'CAPEX') return 'GESTOR';
  if (!l.de) return l.da || 'GESTOR';                                   // o PT desta versão já aplicava o padrão nesta linha
  return l.en === 'N' || l.me === '% FATURAMENTO' ? 'MODELO' : 'GESTOR';
}
/* decisão que vale e valor final da linha com o que está na tela (linha travada ou igual ao PT = o número do PT; alterada = estimativa) */
const dcsVale = (l, r) => !r || r.trava || !dcsPend(r) ? l.da : (r.decisao || dcsPadrao(l));
function dcsFinal(l, r) {
  if (!r || r.trava || !dcsPend(r)) return l.vf;
  const d = r.decisao || dcsPadrao(l);
  return d === 'GESTOR' ? l.ge : d === 'MODELO' ? l.mo : d === 'CONTRATO' ? (l.mc ?? l.mo) : (r.valor_outro ?? 0);
}
const dcsNada = l => Math.abs(l.mo) < 0.01 && Math.abs(l.ge) < 0.01;      // modelo e gestor zerados: não há o que decidir
const dcsSemDec = (l, r) => r ? !r.trava && !r.decisao && !r.aprovado_em && !dcsNada(l) : l.semDec;      // 17/11: linha aprovada (área) não fica "a decidir"
/* 16/11/2026 (Silvio): linha travada pela DUPLICIDADE (conta centralizada em outra área, sem base nem exceção) — a decisão não tem efeito; ao tentar
   alterar, um alerta diz por quê e como liberar (exceção conta × centro de custo em Configuração › Exceções, ou "Só autoriza a área a orçar") */
const dcsTravaDup = r => !!(r && r.trava && /^Trava de duplicidade/i.test(r.trava));
/* 16/11/2026 — PASSO 2 DA SIMPLIFICAÇÃO DOS DE-PARAS (Silvio: "vamos ao passo 2"):
   (a) linha a RESPONDER (status do PT "RESPONDER — …"): conta "cada área pelo seu CC" em que a área orçou sem histórico próprio e OUTRA área tem o histórico
       — fica fora do valor final até a resposta: "Já contado em …" (decisão MODELO) ou "Gasto novo" (decisão GESTOR + motivo obrigatório no comentário);
   (b) a linha da área dona mostra o orçado que veio de outra área (ORCADO_2027 col. AJ "orçado por X, levado à área dona Y") — o gasto é decidido ali, uma vez. */
const dcsResp = (l, r) => /^RESPONDER/.test(l.st || '') && !(r && (r.decisao || r.trava));
const dcsRespPT = id => { const l = (D.linhas || []).find(x => dcsId(x) === id); return !!(l && /^RESPONDER/.test(l.st || '')); };
const dcsOutras = l => [...new Set((D.linhas || []).filter(x => String(x.c) === String(l.c) && x.s !== l.s && Math.abs(x.b || 0) >= 0.01).map(x => x.s))];
function dcsLev(l) {
  if (!DCS._lev || DCS._levD !== D) {
    const m = new Map();
    (D.orcado || []).forEach(o => { const a = /orçado por (.+?), levado à área dona /.exec(o.arq || ''); if (!a) return;
      const k = `${o.s}|${o.c}`, x = m.get(k) || new Map(); x.set(a[1], (x.get(a[1]) || 0) + (+o.tot || 0)); m.set(k, x); });
    DCS._lev = m; DCS._levD = D;
  }
  return DCS._lev.get(dcsId(l));
}
const dcsLevTxt = l => { const x = dcsLev(l);
  return x ? `<br><small style="color:var(--ink3)" title="Orçado por outra área numa conta desta área (uma área só): entra aqui e é decidido nesta linha — passo 2">📥 inclui orçado de ${[...x.entries()].map(([a, v]) => `${esc(a)} ${rsC(v)}`).join(' · ')}</small>` : ''; };
const dcsRespHtml = (l, id, ed) => { const ou = dcsOutras(l), q = ou.join(', ') || 'outra área';
  return `<span class="tag r" title="${esc(l.st || '')}">🔒 responder</span>${ed ? `<br><button class="btn" data-dcsresp="${esc(id)}" data-dcsr="ja" style="margin-top:4px" title="O gasto já está no histórico de ${esc(q)}: esta linha fica fora (MODELO)">Já contado em ${esc(ou.slice(0, 2).join(', ') || 'outra área')}${ou.length > 2 ? '…' : ''}</button> <button class="btn" data-dcsresp="${esc(id)}" data-dcsr="novo" style="margin-top:4px" title="Gasto que não existia: conta nesta linha (GESTOR), com o motivo">Gasto novo</button>` : ''}`; };
function dcsComoLiberar(l) {
  const cta = ((D.cfg_conta && D.cfg_conta.rows) || []).find(x => String(x[0]) === String(l.c)), dono = (cta && cta[5]) || 'outra área';
  const dic = D.meta && D.meta.razao && D.meta.razao.dic;
  const ccs = RAZAO && dic ? [...new Set(RAZAO.filter(x => String(x[4]) === String(l.c) && dic.setor[x[10]] === l.s && x[5]).map(x => x[5]))].sort() : [];
  const daArea = ((D.cfg_arvore && D.cfg_arvore.rows) || []).filter(x => x[3] === l.s && x[4] !== 'NÃO USAR').map(x => x[1]);
  return `Essa conta (${l.c} ${l.d || ''}) é de ${dono}: esta linha fica fora do valor final (vale o modelo). Na geração do PT, o orçado de área que entregou orçamento vai para a linha de ${dono} e é decidido lá; ficam fora só orçado informativo, kit e unidade descontinuada.\n\n`
    + (ccs.length ? `Se ${l.s} deve gerir parte desta conta, crie uma exceção em Configuração › Exceções — conta ${l.c} × centro de custo ${ccs.join(' / ')} → ${l.s} (é onde ${l.s} lançou essa conta).`
                  : `${l.s} não lançou essa conta nos próprios centros de custo${daArea.length ? ` (${daArea.join(', ')})` : ''}. Se ${l.s} deve gerir parte desta conta, crie em Configuração › Exceções uma exceção do tipo "Só autoriza a área a orçar" para a conta ${l.c} → ${l.s}.`)
    + `\n\nA exceção entra na próxima geração do PT.`;
}
function dcsNum(s) {                                                    // "1.234,56" · "1234,56" · "1.234" · "1234.56" → número; vazio = null; inválido = NaN
  s = String(s ?? '').replace(/[R$\s]/g, ''); if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = Number(s); return isFinite(v) ? Math.round(v * 100) / 100 : NaN;
}
const dcsBr = v => v == null ? '' : (+v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function dcsAviso(t, erro) { DCS.msg = { t, erro }; const el = $('dcsAviso'); if (el) { el.className = erro ? 'aviso' : 'ok-box'; el.textContent = t; el.hidden = false; } }
function dcsIdsPT() { if (!DCS._ids || DCS._idsD !== D) { DCS._ids = new Set(D.linhas.map(dcsId)); DCS._idsD = D; } return DCS._ids; }
/* decisões guardadas de linhas que não estão no PT desta versão (a linha saiu pela política de alocação): ficam guardadas, não entram nos números */
const dcsOrfas = () => { const ids = dcsIdsPT(); return [...DCS.rows.values()].filter(r => !ids.has(r.id) && DCS_CAMPOS.some(k => r[k] != null)); };

async function dcsSalva() {
  const ids = [...DCS.sujo];
  if (!ids.length) return true;
  const semValor = ids.map(id => DCS.rows.get(id)).filter(r => r && r.decisao === 'OUTRO' && r.valor_outro == null);
  if (semValor.length) { dcsAviso(`A decisão OUTRO exige o valor (R$/ano): ${semValor.slice(0, 6).map(r => r.area + ' × ' + r.conta).join(' · ')}${semValor.length > 6 ? ' …' : ''}.`, true); return false; }
  const semMotivo = ids.map(id => DCS.rows.get(id)).filter(r => r && r.decisao === 'GESTOR' && dcsRespPT(r.id) && !String(r.comentario || '').trim());   // 16/11/2026 (passo 2)
  if (semMotivo.length) { dcsAviso(`Gasto novo (GESTOR) em linha a responder exige o motivo no comentário: ${semMotivo.slice(0, 6).map(r => r.area + ' × ' + r.conta).join(' · ')}${semMotivo.length > 6 ? ' …' : ''}.`, true); return false; }
  const ap_ = dcsTemAprov();             // 17/11/2026: decisão alterada leva a aprovação (o que a tela mostra agora); aprovação sozinha (área / reconfirmação) já vem pronta
  if (ap_) ids.forEach(id => { const r = DCS.rows.get(id), l = r && (D.linhas || []).find(x => dcsId(x) === id); if (r && l && !r.trava && dcsMudou(r).length) Object.assign(r, dcsFoto(l, r)); });
  const nAp = ap_ ? ids.filter(id => { const r = DCS.rows.get(id); return r && dcsMudouAp(r).length; }).length : 0;
  if (window.ORC_FONTE_LOCAL) {
    const agora_ = new Date().toISOString();
    ids.forEach(id => { const r = DCS.rows.get(id); if (r) { if (ap_ && dcsMudouAp(r).length) { r.aprovado_em = agora_; r.aprovado_por = 'prévia local'; }
      r.atualizado_em = agora_; r.atualizado_por = 'prévia local'; DCS.orig.set(id, { ...r }); } });
    DCS.sujo.clear(); dcsAviso('Prévia local: decisões guardadas só nesta tela (no app publicado vão para o banco, com histórico de quem e quando).'); return true;
  }
  let n = 0;
  try {
    for (const id of ids) {
      const r = DCS.rows.get(id); if (!r) { DCS.sujo.delete(id); continue; }
      const campos = {}; dcsMudou(r).forEach(k => campos[k] = dcsN(k, r[k]));
      if (ap_) dcsMudouAp(r).forEach(k => campos[k] = dcsAp(k, r[k]));
      if (Object.keys(campos).length) {
        const { data, error } = await SB.from('orc_decisao').update(campos).eq('versao', est.versao).eq('id', id).select('id,decisao,valor_outro,explicacao,comentario,atualizado_em,atualizado_por' + (ap_ ? ',aprovado_gestor,aprovado_valor,aprovado_decisao,aprovado_em,aprovado_por' : ''));
        if (error) throw error;
        if (!data || !data.length) throw new Error(`a linha ${r.area} × ${r.conta} não foi alterada (sem permissão, versão fechada ou linha fora do app)`);
        DCS_CAMPOS.forEach(k => r[k] = dcsN(k, data[0][k])); r.atualizado_em = data[0].atualizado_em; r.atualizado_por = data[0].atualizado_por; n++;
        if (ap_) { DCS_APROV.forEach(k => r[k] = dcsAp(k, data[0][k])); r.aprovado_em = data[0].aprovado_em; r.aprovado_por = data[0].aprovado_por; }
      }
      DCS.orig.set(id, { ...r }); DCS.sujo.delete(id);
    }
    dcsAviso(`✓ ${n} linha(s) salva(s)${nAp ? ` (${nAp} com a aprovação gravada)` : ''}, com histórico de quem e quando. Entram na DRE, no caixa e nos resumos na próxima geração do PT, que lê estas decisões.`); return true;
  } catch (e) { dcsAviso(`Não foi possível salvar${n ? ` (${n} linha(s) já salvas)` : ''}: ` + (e.message || e), true); return false; }
}

function dcsLista() {
  const f = est.f, busca = (f.dcsBusca || '').toUpperCase().trim();
  const Lv = linhasVis().map(l => { const r = DCS.rows.get(dcsId(l)); return { l, r, vale: dcsVale(l, r), fin: dcsFinal(l, r), pend: dcsPend(r), sem: dcsSemDec(l, r) }; });
  const base = Lv.filter(x => (!f.dcsArea || x.l.s === f.dcsArea) && (!busca || `${x.l.s} ${x.l.c} ${x.l.d} ${x.l.r || ''} ${(x.r && x.r.comentario) || ''}`.toUpperCase().includes(busca)));
  const fil = { GESTOR: x => x.vale === 'GESTOR', MODELO: x => x.vale === 'MODELO', OUTRO: x => x.vale === 'OUTRO', CONTRATO: x => x.vale === 'CONTRATO',
    pad: x => x.sem, trav: x => !!(x.r && x.r.trava), mud: x => x.pend || (x.r && DCS.sujo.has(x.r.id)), resp: x => dcsResp(x.l, x.r), aprov: x => !!(x.r && x.r.aprovado_em), reconf: x => !!x.r && dcsReconf(x.l, x.r) };
  const card = f.dcsCard || '', L_ = card && fil[card] ? base.filter(fil[card]) : base;
  return { Lv, base, fil, card, L_ };
}

function telaDecisoes(antiga) {
  const tit = 'Decisões por linha (área × conta)';
  if (DCS.versao !== est.versao) { if (!DCS.carregando) setTimeout(dcsCarrega, 0); return cabecalho(tit, '') + '<div class="status">Carregando as decisões por linha…</div>'; }
  if (!dcsAtiva()) {
    const porque = DCS.instalada === false ? 'A edição das decisões por linha entra no ar quando a migração 054 for rodada no banco. Até lá, a fonte é o PT.'
      : DCS.erro ? `Não foi possível ler as decisões editáveis (${esc(DCS.erro)}). Abaixo, o que o PT desta versão usou.`
      : DCS.instalada === true ? 'As decisões editáveis ainda não receberam as linhas desta versão (a semente vem do PT). Abaixo, o que o PT desta versão usou.' : '';
    return (porque ? `<div class="aviso">${porque}</div>` : '') + antiga();
  }
  const f = est.f, ed = dcsEdita(), dis = ed ? '' : 'disabled', { Lv, base, fil, card, L_ } = dcsLista(), pend = DCS.sujo.size;
  const areas = [...new Set(Lv.map(x => x.l.s))], temCt = Lv.some(x => Math.abs(x.l.ct || 0) > 0.005 || x.vale === 'CONTRATO');
  const tot = soma(base, x => x.fin), lim = f.dcsTodas ? L_.length : 300;
  const mud = Lv.filter(x => x.pend), dMud = soma(mud, x => x.fin - x.l.vf), totPT = soma(Lv, x => x.l.vf), orf = dcsOrfas(), m = D.meta && D.meta.decisoes;
  const kp = (k, lab, cls, sub) => { const LL = base.filter(fil[k]); return `<button class="kpi ${cls} ${card === k ? 'sel' : ''}" data-dcscard="${k}"><div class="lab">${lab}</div><div class="val">${sub ? LL.length : rsC(soma(LL, x => x.fin))}</div><div class="meta">${sub || `${LL.length} linha(s) · ${pc(div(soma(LL, x => x.fin), tot))} do final`}</div></button>`; };
  const linha = x => { const l = x.l, r = x.r, id = dcsId(l), tr = r && r.trava, dl = ed && r && !tr ? '' : 'disabled';
    const ops = DCS_OPC.filter(o => o !== 'CONTRATO' || Math.abs(l.ct || 0) > 0.005 || (r && r.decisao === 'CONTRATO'));
    const dec = r ? (tr ? (r.decisao_pt || '') : (r.decisao || '')) : (l.de || ''), vo = r ? (tr ? r.valor_outro_pt : r.valor_outro) : l.vo;
    const sit = !r ? '<span class="tag b" title="Linha nova no PT: entra nas decisões editáveis na próxima carga">entra na próxima carga</span>'
      : tr ? (dcsTravaDup(r) ? `<span class="tag r" data-dcslib="${esc(id)}" style="cursor:pointer" title="Conta centralizada: a decisão desta linha não tem efeito — clique para ver como liberar">🔒 centralizada · sem efeito</span>`
        : `<span class="tag" title="${esc(r.trava)}">🔒 regra do modelo</span>`) : dcsResp(l, r) ? dcsRespHtml(l, id, ed) : x.pend ? '<span class="tag r" title="O PT desta versão ainda não reflete esta linha">alterada · fora do PT</span>'
      : x.sem ? '<span class="tag y">a decidir</span>' : dcsNada(l) ? '—' : '<span class="tag g">decidida</span>';
    return `<tr ${r && DCS.sujo.has(id) ? 'style="background:#FFF7E6"' : ''}>
      <td class="fx nw"><small style="color:var(--ink3)">${esc(l.s)}</small><br>${esc(l.c)}</td><td class="w">${esc(l.d)}${dcsLevTxt(l)}</td><td class="nw">${esc(l.me)}</td><td class="n" title="${rs(+l.mo || 0)} — clique para ver a composição do modelo"><a href="#" data-dcsmod="${esc(id)}" style="color:inherit;text-decoration:underline dotted;text-underline-offset:3px">${fmt(l.mo)}</a></td>${tdN(l.ge)}${temCt ? tdN(Math.abs(l.ct || 0) > 0.005 ? l.mc : null) : ''}
      <td class="ed"><input type="text" data-dcsid="${esc(id)}" data-dcsk="explicacao" value="${esc(r ? (tr ? r.explicacao_pt : r.explicacao) || '' : l.ex || '')}" style="width:150px" ${dl}></td>
      <td class="ed">${dcsTravaDup(r) ? `<span data-dcslib="${esc(id)}" style="cursor:pointer;display:inline-block" title="Conta centralizada: clique para ver como liberar">` : ''}<select data-dcsid="${esc(id)}" data-dcsk="decisao" ${dl}${dcsTravaDup(r) ? ' style="pointer-events:none"' : ''}><option value="">(padrão: ${esc(dcsPadrao(l))})</option>${ops.concat(dec && !ops.includes(dec) ? [dec] : []).map(o => `<option ${dec === o ? 'selected' : ''}>${o}</option>`).join('')}</select>${dcsTravaDup(r) ? '</span>' : ''}</td>
      <td class="n ed"><input type="text" inputmode="decimal" data-dcsid="${esc(id)}" data-dcsk="valor_outro" value="${dcsBr(vo)}" style="width:104px;text-align:right" ${dec === 'OUTRO' ? dl : 'disabled'}></td>
      <td class="nw">${esc(x.vale || '')}</td>
      <td class="n" title="${x.pend ? 'Estimativa com a decisão da tela; o PT confirma na próxima geração' : ''}">${fmt(x.fin)}${x.pend ? `<br><small style="color:var(--ink3)">PT: ${fmt(l.vf)}</small>` : ''}</td>
      <td class="n ${cd(x.fin - l.mo, true)}">${fmt(x.fin - l.mo, { sinal: true })}</td><td class="nw">${sit}</td>${dcsTemAprov() ? `<td class="nw">${dcsAprovHtml(l, r, id, ed)}</td>` : ''}
      <td class="ed"><input type="text" data-dcsid="${esc(id)}" data-dcsk="comentario" value="${esc(r ? (tr ? r.comentario_pt : r.comentario) || '' : l.co || '')}" style="width:230px" ${dl}>${tr ? `<br><small style="color:var(--ink3)">🔒 ${esc(r.trava)}</small>` : ''}</td></tr>`; };
  return `${cabecalho(tit, 'A Controladoria decide em cada linha qual número vale para 2027: <b>GESTOR</b> (orçado), <b>MODELO</b> (base × inflação ou % do faturamento), <b>OUTRO</b> (valor definido pela Controladoria) ou <b>CONTRATO</b> (modelo com o valor fixo dos contratos). Sem decisão vale o padrão. A decisão alimenta a Projeção final, a DRE, a DRE TCP, o caixa e os resumos. Linha <b>a responder</b>: a área orçou sem histórico e outra área tem o histórico da conta — fica fora até você dizer se já está contado lá ou se é gasto novo. Orçado de outra área em conta de uma área só aparece na linha da dona (📥).',
    `<div class="filtros" style="margin-left:auto"><input id="dcsBusca" placeholder="Área, conta ou descrição" value="${esc(f.dcsBusca || '')}" style="width:210px">
      ${areas.length > 1 ? `<select id="dcsArea"><option value="">Todas as áreas</option>${areas.map(a => `<option ${f.dcsArea === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>` : ''}</div>`)}
  <div id="dcsAviso" class="${DCS.msg && DCS.msg.erro ? 'aviso' : 'ok-box'}" ${DCS.msg ? '' : 'hidden'}>${DCS.msg ? esc(DCS.msg.t) : ''}</div>
  ${mud.length ? `<div class="aviso">⚠ <b>${mud.length} linha(s) com decisão que o PT desta versão ainda não reflete</b> — efeito estimado no valor final: <b>${fmt(dMud, { sinal: true })}</b> (${pc(div(dMud, totPT), 2)} do final de ${rsC(totPT)}). A DRE, o caixa e os resumos só mudam quando o PT for gerado de novo — ele lê estas decisões a cada geração.</div>`
    : `<div class="info">${m && m.lida_em && !m.sem_leitura ? `O PT desta versão foi gerado com estas decisões (lidas do app em <b>${esc(m.lida_em)}</b>).` : 'O PT desta versão foi gerado <b>antes</b> de as decisões virem para o app: os números seguem o que está no PT.'} O que for decidido e salvo aqui entra na <b>próxima geração do PT</b>.</div>`}
  <section class="kpis">
    ${kp('GESTOR', 'Decisão GESTOR', '')}${kp('MODELO', 'Decisão MODELO', 'k2')}${kp('OUTRO', 'Decisão OUTRO', 'k3')}${temCt ? kp('CONTRATO', 'Decisão CONTRATO', 'k4') : ''}
    ${Lv.some(x => /^RESPONDER/.test(x.l.st || '')) ? kp('resp', 'Responder', 'k2', 'já contado em outra área ou gasto novo?') : ''}${dcsTemAprov() && Lv.some(x => x.r && dcsReconf(x.l, x.r)) ? kp('reconf', '🔶 Reconfirmar', 'k2', 'o gestor mudou o número depois da aprovação') : ''}${dcsTemAprov() ? kp('aprov', 'Aprovadas', 'k4', 'linhas com a aprovação gravada') : ''}${kp('pad', 'Sem decisão (padrão)', 'k5', 'linhas usando o padrão')}${kp('trav', 'Definidas por regra', 'k5', 'só leitura: a regra do modelo prevalece')}${kp('mud', 'Alteradas · fora do PT', 'k3', 'entram na próxima geração')}
  </section>
  <div class="card"><h3>Decisão de cada linha ${card ? '— filtro do cartão' : ''} <small>${L_.length} linha(s)</small></h3>
    <div class="csub">Amarelo = editável pela Controladoria${ed ? '' : versaoEditavel() ? ' — <b>somente leitura neste perfil</b>' : ' — <b>esta versão está fechada</b>'}. O <b>valor final</b> de linha alterada é uma estimativa (o número do gestor, do modelo, do contrato ou o valor digitado); o PT confirma na próxima geração.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      ${ed ? `<button class="btn primary" id="dcsSalvar" ${pend ? '' : 'disabled'}>Salvar alterações${pend ? ` (${pend})` : ''}</button>
      <button class="btn" id="dcsDesfaz" ${pend ? '' : 'disabled'}>Desfazer</button>` : ''}${ed && dcsTemAprov() ? (f.dcsArea ? `<button class="btn" id="dcsAprovaArea" title="Grava a aprovação das linhas de ${esc(f.dcsArea)} com os números de agora; se o gestor mudar o número depois, o PT mantém o aprovado até você reconfirmar">✔ Aprovar a área ${esc(f.dcsArea)}</button>` : '<small style="color:var(--ink3);align-self:center">Para aprovar uma área inteira, escolha a área no filtro.</small>') : ''}</div>
    <div class="tw" style="margin-top:6px"><table class="t" id="dcsTab"><thead><tr><th class="fx">Área · conta</th><th>Descrição</th><th>Método</th><th class="n">Modelo</th><th class="n">Gestor</th>${temCt ? '<th class="n" title="Modelo com o valor fixo dos contratos da linha">Contrato</th>' : ''}
      <th class="ed">Explicação do gestor</th><th class="ed">Decisão</th><th class="n ed">Valor outro (R$/ano)</th><th>Vale</th><th class="n">Valor final</th><th class="n">Δ final − modelo</th><th>Situação</th>${dcsTemAprov() ? '<th title="Aprovação gravada da linha — trava dos aprovados (17/11/2026)">Aprovação</th>' : ''}<th class="ed">Comentário da Controladoria</th></tr></thead><tbody>
    ${L_.slice(0, lim).map(linha).join('') || `<tr><td colspan="${(temCt ? 14 : 13) + (dcsTemAprov() ? 1 : 0)}" class="vazio">Nenhuma linha neste filtro.</td></tr>`}
    </tbody><tfoot><tr><td class="fx">Total (${L_.length})</td><td></td><td></td>${tdN(soma(L_, x => x.l.mo))}${tdN(soma(L_, x => x.l.ge))}${temCt ? '<td></td>' : ''}<td></td><td></td><td></td><td></td>${tdN(soma(L_, x => x.fin))}<td class="n">${fmt(soma(L_, x => x.fin - x.l.mo), { sinal: true })}</td><td></td>${dcsTemAprov() ? '<td></td>' : ''}<td></td></tr></tfoot></table></div>
    ${L_.length > lim ? `<button class="btn" id="dcsTodas">Mostrar as ${L_.length} linhas</button>` : ''}</div>
  ${orf.length ? `<div class="card"><h3>Decisões guardadas de linhas que não estão no PT desta versão <small>${orf.length}</small></h3><div class="csub">A linha (área × conta) saiu do PT — em geral pela política de alocação. A decisão fica guardada e volta a valer se a linha voltar; não entra nos números.</div>
    <div class="tw"><table class="t"><thead><tr><th>Área</th><th>Conta</th><th>Decisão</th><th class="n">Valor outro</th><th>Comentário</th></tr></thead><tbody>
    ${orf.map(r => `<tr><td>${esc(r.area)}</td><td>${esc(r.conta)}</td><td>${esc(r.decisao || '—')}</td>${tdN(r.valor_outro)}<td class="w">${esc(r.comentario || r.explicacao || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}

function posDecisoes() {
  if (!dcsAtiva()) return;
  const f = est.f; DCS.msg = null;
  const liga = (id, chave) => { const el = $(id); if (el) el.onchange = e => { f[chave] = e.target.value; desenha(); }; };
  liga('dcsBusca', 'dcsBusca'); liga('dcsArea', 'dcsArea');
  document.querySelectorAll('#tela [data-dcscard]').forEach(x => x.onclick = () => { f.dcsCard = f.dcsCard === x.dataset.dcscard ? null : x.dataset.dcscard; desenha(); });
  document.querySelectorAll('#dcsTab [data-dcsid]').forEach(el => el.onchange = () => {
    if (!dcsEdita()) return;
    const r = DCS.rows.get(el.dataset.dcsid); if (!r || r.trava) return;
    const k = el.dataset.dcsk; DCS.msg = null;                    // o aviso da ação anterior não acompanha esta
    if (k === 'decisao') { r.decisao = el.value || null; if (r.decisao !== 'OUTRO') r.valor_outro = null; }
    else if (k === 'valor_outro') {
      const v = dcsNum(el.value);
      if (Number.isNaN(v)) { dcsAviso(`Valor inválido na linha ${r.area} × ${r.conta}: ${el.value}. Use o formato 1.234,56.`, true); el.value = dcsBr(r.valor_outro); return; }
      r.valor_outro = v;
    } else r[k] = String(el.value).trim() || null;
    dcsMarca(r); desenha();
    if (k === 'decisao' && r.decisao === 'OUTRO' && r.valor_outro == null) { const i = document.querySelector(`#dcsTab input[data-dcsk="valor_outro"][data-dcsid="${CSS.escape(r.id)}"]`); if (i) i.focus(); }
  });
  document.querySelectorAll('#dcsTab [data-dcsmod]').forEach(a => a.onclick = e => {         // 16/11/2026: composição do modelo da linha
    e.preventDefault(); const l = (D.linhas || []).find(x => dcsId(x) === a.dataset.dcsmod); if (l) dcsComposicao(l);
  });
  document.querySelectorAll('#dcsTab [data-dcslib]').forEach(el => el.onclick = async () => {        // 16/11/2026: linha travada pela duplicidade
    const l = (D.linhas || []).find(x => dcsId(x) === el.dataset.dcslib); if (!l) return;
    if (!RAZAO && typeof carregaRazao === 'function') { try { await carregaRazao(); } catch (e) { } }
    alert(dcsComoLiberar(l));
  });
  document.querySelectorAll('#dcsTab [data-dcsresp]').forEach(b => b.onclick = () => {      // 16/11/2026 (passo 2): resposta da linha a RESPONDER
    if (!dcsEdita()) return;
    const r = DCS.rows.get(b.dataset.dcsresp); if (!r || r.trava) return;
    const l = (D.linhas || []).find(x => dcsId(x) === r.id), ou = l ? dcsOutras(l) : [];
    const resto = String(r.comentario || '').replace(/^(JÁ CONTADO EM|GASTO NOVO:)[^·]*·?\s*/, '').trim();
    if (b.dataset.dcsr === 'ja') r.decisao = 'MODELO', r.comentario = `JÁ CONTADO EM ${ou.join(', ') || 'outra área'} (passo 2)` + (resto ? ' · ' + resto : '');
    else {
      const mot = prompt(`Gasto novo em ${r.area} × ${r.conta} — qual é o motivo? (obrigatório; fica no comentário da Controladoria)`);
      if (!mot || !mot.trim()) { dcsAviso('Gasto novo exige o motivo — nada foi alterado.', true); return; }
      r.decisao = 'GESTOR'; r.comentario = `GASTO NOVO: ${mot.trim()} (passo 2)` + (resto ? ' · ' + resto : '');
    }
    r.valor_outro = null; DCS.msg = null; dcsMarca(r); desenha();
    dcsAviso(`Resposta registrada em ${r.area} × ${r.conta} (${r.decisao}). Clique em Salvar alterações — entra na próxima geração do PT.`);
  });
  document.querySelectorAll('#dcsTab [data-dcsaceita]').forEach(b => b.onclick = () => {      // 17/11/2026: aceitar o número novo do gestor (trava dos aprovados)
    if (!dcsEdita()) return;
    const r = DCS.rows.get(b.dataset.dcsaceita), l = r && (D.linhas || []).find(x => dcsId(x) === r.id); if (!r || !l || r.trava) return;
    Object.assign(r, { aprovado_decisao: 'GESTOR', aprovado_gestor: dcsAp('aprovado_gestor', +l.ge || 0), aprovado_valor: dcsAp('aprovado_valor', +l.ge || 0) });
    DCS.msg = null; dcsMarca(r); desenha();
    dcsAviso(`Número novo aceito em ${r.area} × ${r.conta}: ${rs(+l.ge || 0)}. Clique em Salvar alterações — entra na próxima geração do PT.`);
  });
  document.querySelectorAll('#dcsTab [data-dcsmantem]').forEach(b => b.onclick = () => {      // 17/11/2026: manter o aprovado = OUTRO com o valor aprovado
    if (!dcsEdita()) return;
    const r = DCS.rows.get(b.dataset.dcsmantem), l = r && (D.linhas || []).find(x => dcsId(x) === r.id); if (!r || !l || r.trava) return;
    const v = +r.aprovado_valor || 0, nota = `mantido o aprovado de ${dcsDataBr(r.aprovado_em)} (o gestor mudou para ${rs(+l.ge || 0)})`;
    r.decisao = 'OUTRO'; r.valor_outro = dcsAp('aprovado_valor', v); r.comentario = (r.comentario ? r.comentario + ' · ' : '') + nota;
    Object.assign(r, { aprovado_decisao: 'OUTRO', aprovado_gestor: dcsAp('aprovado_gestor', +l.ge || 0), aprovado_valor: dcsAp('aprovado_valor', v) });
    DCS.msg = null; dcsMarca(r); desenha();
    dcsAviso(`Aprovado mantido em ${r.area} × ${r.conta}: OUTRO ${rs(v)}. Clique em Salvar alterações — entra na próxima geração do PT.`);
  });
  const apA = $('dcsAprovaArea'); if (apA) apA.onclick = () => {                          // 17/11/2026: aprovar a área inteira com os números de agora
    if (!dcsEdita()) return;
    const { base } = dcsLista(), alvo = base.filter(x => x.r && !x.r.trava && !dcsNada(x.l) && !dcsReconf(x.l, x.r)), rec = base.filter(x => x.r && dcsReconf(x.l, x.r)).length;
    const muda = alvo.filter(x => { const ft = dcsFoto(x.l, x.r); return !x.r.aprovado_em || DCS_APROV.some(k => dcsAp(k, ft[k]) !== dcsAp(k, x.r[k])); });
    if (!muda.length) { dcsAviso(`Nada a aprovar em ${f.dcsArea}: as linhas já estão aprovadas com os números de agora${rec ? ` (${rec} a reconfirmar uma a uma)` : ''}.`); return; }
    if (!confirm(`Aprovar ${muda.length} linha(s) de ${f.dcsArea} com os números de agora (decisão que vale, número do gestor e valor final)?\n\nSe o gestor mudar o número `
      + 'depois, o PT mantém o aprovado até você reconfirmar.' + (rec ? `\n${rec} linha(s) a reconfirmar ficam de fora (decida uma a uma).` : ''))) return;
    muda.forEach(x => { Object.assign(x.r, dcsFoto(x.l, x.r)); dcsMarca(x.r); });
    DCS.msg = null; desenha();
    dcsAviso(`${muda.length} linha(s) de ${f.dcsArea} marcadas para aprovar. Clique em Salvar alterações para gravar (com histórico de quem e quando).`);
  };
  const s = $('dcsSalvar'); if (s) s.onclick = async () => { s.disabled = true; await dcsSalva(); desenha(); };
  const dz = $('dcsDesfaz'); if (dz) dz.onclick = () => {
    DCS.sujo.forEach(id => { const r = DCS.rows.get(id), o = DCS.orig.get(id); if (r && o) Object.assign(r, o); });
    DCS.sujo.clear(); DCS.msg = null; desenha();
  };
  const t = $('dcsTodas'); if (t) t.onclick = () => { f.dcsTodas = true; desenha(); };
}

/* ------------------------------------------------------------------ COMPOSIÇÃO DO MODELO (16/11/2026 — "Não seria ideal poder clicar sobre o valor do modelo,
   e ser exibida a composição que o modelo montou?"). Clique no MODELO da linha abre o painel com: a conta do modelo (realizado jul–out/26 que ficou na área ×
   anualização × (1 + reajuste), ou % do faturamento × faturamento 2027), a base por fornecedor e por mês (ajuste gerencial à parte), o modelo mês a mês e, para
   confrontar com o orçado, os itens do gestor e a conta do CONTRATO. Tudo dos dados da versão (linha do PT, razão, orçado e contratos do app): nada é
   recalculado no banco nem gravado. dcsCompoe() = os números (a conferência usa a mesma função); dcsComposicao() = o painel. */
function dcsCompoe(l, R) {
  const dic = D.meta.razao.dic, iS = dic.setor.indexOf(l.s), fator = D.meta.fator || 3, pa = +l.pa || 0, conta = String(l.c);
  const L = R.filter(r => String(r[4]) === conta && r[11] === iS), meses = [...new Set(R.map(r => r[0]))].sort();
  const pct = l.me === '% FATURAMENTO', fat = dreLinha('Faturamento'), k = pct ? (fat.base ? fat.orc / fat.base : 0) : 1 + pa;   // modelo = base anual × k
  const tot = soma(L, r => r[6]), base = tot * fator, calc = base * k, resto = (+l.mo || 0) - calc;
  const G = new Map();
  L.forEach(r => {
    const aj = String(r[2]).toUpperCase() === 'AJUSTE', nome = r[13] ? (dic.nome[r[14]] || r[13]) : '', key = (aj ? 'AJ|' : '') + (r[13] || '—');
    const g = G.get(key) || { nome: aj ? 'Ajuste gerencial' + (nome ? ' — ' + nome : '') : (nome || 'Sem fornecedor (folha, provisões, tributos e lançamentos manuais)'),
      forn: r[13] || '', aj, m: {}, t: 0, n: 0 };
    g.m[r[0]] = (g.m[r[0]] || 0) + r[6]; g.t += r[6]; g.n++; G.set(key, g);
  });
  const grupos = [...G.values()].sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
  const outras = L.length ? [] : [...new Set(R.filter(r => String(r[4]) === conta && r[10] === iS).map(r => dic.setor[r[11]]))];   // lançou no CC, base foi para outra área
  return { L, meses, pct, fat, k, pa, fator, tot, base, calc, resto, grupos, outras, conta };
}
async function dcsComposicao(l) {
  const cab = sub => `<div class="pl-top"><div><h3>Composição do modelo — ${esc(l.s)} · ${esc(l.c)}</h3><p>${sub}</p></div><button class="x" data-fecha>Fechar ✕</button></div>`;
  abrePainel(cab('Carregando o razão…'));
  let R; try { R = await carregaRazao(); } catch (e) { abrePainel(cab('Não foi possível ler o razão: ' + esc(e.message || e))); return; }
  if (typeof ctCarrega === 'function') { try { await ctCarrega(); } catch (e) { } }
  const x = dcsCompoe(l, R), v = n => fmt(n, { uni: 'R$', dec: 2, zero: '–' }), mo = +l.mo || 0, mes = m => MESES[+String(m).slice(4) - 1] + '/' + String(m).slice(2, 4);
  const cfg = ((D.cfg_conta && D.cfg_conta.rows) || []).find(r => String(r[0]) === x.conta), reajConta = !!(cfg && cfg[15] === 'S');
  const sl = (t, n, forte, txt) => `<div class="sumline${forte ? ' big' : ''}"><span class="t">${t}</span><span class="v">${txt != null ? txt : v(n)}</span></div>`;
  let calc = sl(`Realizado jul–out/26 que ficou nesta área <small>${x.L.length} lançamento(s)</small>`, x.tot) + sl(`× ${x.fator} — anualização da janela de 4 meses`, x.base);
  if (x.pct) calc += sl(`÷ faturamento base 2026 (${v(x.fat.base)})`, null, false, pc(div(x.base, x.fat.base), 2) + ' do faturamento')
    + sl(`× faturamento 2027 — cenário ${esc(D.meta.cenario || '')} (${v(x.fat.orc)})`, x.calc);
  else calc += x.pa ? sl(`× (1 + ${pc(x.pa, 2)}) — inflação 2027 ${reajConta ? '(conta de compra: reajusta)' : '(área sem orçamento próprio: inflação em todas as contas)'}`, x.calc)
    : sl('sem reajuste — conta fora das compras (folha, comissões, tributos, provisões, financeiro…)', x.calc);
  if (Math.abs(x.resto) >= 0.05) calc += sl('+ fora da base jul–out — compra anual ou gasto fora da janela, no mesmo mês de 2027 (aba PROJECAO_INERCIAL do PT)', x.resto);
  calc += sl('= Modelo 2027', mo, true);
  const ctr = (typeof CTR !== 'undefined' && CTR.versao === est.versao ? CTR.rows : []).filter(c => !c.excluido && c.area === l.s && String(c.conta) === x.conta);
  const clvl = c => c.clvl || (String(c.id || '').match(/^(F\d+)\|/) || [])[1] || '', comCt = new Set(ctr.filter(c => c.natureza === 'FIXO').map(clvl).filter(Boolean));
  const LIM = 30, gs = x.grupos.slice(0, LIM), resto = x.grupos.slice(LIM);
  const linhaG = (g, nome) => `<tr><td class="w">${nome}${g.forn && comCt.has(g.forn) && !g.aj ? ' <span class="tag b" title="Fornecedor com contrato nesta linha (Contratos recorrentes)">contrato</span>' : ''}</td>${x.meses.map(m => `<td class="n">${v(g.m[m] || 0)}</td>`).join('')}<td class="n">${v(g.t)}</td><td class="n"><b>${v(g.t * x.fator * x.k)}</b></td></tr>`;
  const outrosG = resto.length ? { m: {}, t: 0, forn: '', aj: false } : null;
  if (outrosG) resto.forEach(g => { x.meses.forEach(m => outrosG.m[m] = (outrosG.m[m] || 0) + (g.m[m] || 0)); outrosG.t += g.t; });
  const tabG = x.grupos.length ? `<div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Fornecedor (R$)</th>${x.meses.map(m => `<th class="n">${mes(m)}</th>`).join('')}<th class="n">Janela</th><th class="n" title="Janela × ${x.fator} × ${x.pct ? 'faturamento 2027 ÷ faturamento base' : '(1 + reajuste)'}">No modelo 2027</th></tr></thead><tbody>
      ${gs.map(g => linhaG(g, esc(g.nome))).join('')}${outrosG ? linhaG(outrosG, `Outros ${resto.length} fornecedor(es)`) : ''}</tbody>
      <tfoot><tr><td>Total da base</td>${x.meses.map(m => `<td class="n">${v(soma(x.L.filter(r => r[0] === m), r => r[6]))}</td>`).join('')}<td class="n">${v(x.tot)}</td><td class="n">${v(x.calc)}</td></tr></tfoot></table></div>`
    : `<div class="vazio">${x.outras.length ? `Sem base nesta área: os lançamentos dos centros de custo da área nesta conta foram para <b>${esc(x.outras.join(', '))}</b> (conta centralizada, exceção ou fornecedor que prevalece).` : 'Sem lançamentos na janela jul–out/26 nesta área e conta.'}</div>`;
  const sem = i => `<tr>${MESES.slice(i, i + 6).map(m => `<th style="position:static;text-align:right;font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;padding:6px 10px 0;border:0">${m}/27</th>`).join('')}</tr><tr>${l.mm.slice(i, i + 6).map(n => `<td class="n">${v(n)}</td>`).join('')}</tr>`;
  const mm = (l.mm || []).length === 12 ? `<div class="tw solta" style="flex:none"><table class="t"><tbody>${sem(0)}${sem(6)}</tbody><tfoot><tr><td colspan="5">Total 2027</td><td class="n">${v(soma(l.mm))}</td></tr></tfoot></table></div>` : '';
  const orc = (D.orcado || []).filter(o => o.s === l.s && String(o.c) === x.conta);
  const tabO = orc.length ? `<div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Item do orçado do gestor</th><th>Fornecedor</th><th>Recorrência</th><th class="n">Total 2027 (R$)</th></tr></thead><tbody>
      ${orc.map(o => `<tr><td class="w">${esc(o.d)}</td><td class="w">${esc(o.f || '')}</td><td>${esc(o.rec || o.n || '')}</td><td class="n">${v(o.tot)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total do gestor (coluna GESTOR)</td><td></td><td></td><td class="n">${v(+l.ge || 0)}</td></tr></tfoot></table></div>`
    : `<div class="vazio">O gestor não orçou esta linha (GESTOR = ${v(+l.ge || 0)}).</div>`;
  const ct = +l.ct || 0, bc = +l.bc || 0, mc = +l.mc || 0, totCt = c => typeof ctTotal === 'function' ? ctTotal(c) : (+c.valor_2027 || 0) * 12;
  const blocoCt = (Math.abs(ct) > 0.005 || Math.abs(bc) > 0.005 || ctr.length) ? `<h4 style="margin:14px 0 6px">Contratos da linha e a coluna CONTRATO</h4>
      ${x.pct ? '<div class="csub">Linha por % do faturamento: a coluna CONTRATO é o próprio modelo.</div>'
        : `<div class="csub">CONTRATO = modelo ${v(mo)} − base dos fornecedores com contrato ${v(bc)} × (1 + ${pc(x.pa, 2)}) + contratos 2027 ${v(ct)} = <b>${v(mc)}</b> (valores do PT desta versão).</div>`}
      ${ctr.length ? `<div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Contrato no app</th><th>Natureza</th><th>Ação</th><th class="n">Valor mensal 2027</th><th class="n">Total 2027</th></tr></thead><tbody>
        ${ctr.map(c => `<tr><td class="w">${esc(c.fornecedor || c.id)}</td><td>${esc(c.natureza || '')}</td><td>${esc(c.acao || (String(c.existe_2027 || '').startsWith('S') ? 'RENOVA' : 'ENCERRA'))}${c.mes_acao ? ' · mês ' + esc(c.mes_acao) : ''}</td><td class="n">${v(+c.valor_2027 || 0)}</td><td class="n">${v(c.natureza === 'FIXO' ? totCt(c) : 0)}</td></tr>`).join('')}</tbody></table></div>
        <div class="csub">Só os contratos FIXOS somam. Edição feita no app depois do PT entra na próxima geração.</div>` : ''}` : '';
  abrePainel(cab(`${esc((D.contaDesc && D.contaDesc[x.conta]) || l.d || '')} · método ${esc(l.me || '')} · decisão no PT: ${esc(l.da || '—')}`) + `<div class="pl-corpo">
    <div class="card"><h3>Como o modelo chegou a ${v(mo)}</h3>${calc}</div>
    <h4 style="margin:14px 0 6px">Base por fornecedor — o que o modelo levou em conta</h4>${tabG}
    ${x.L.length ? `<div style="margin:8px 0"><button class="btn" id="dcsLanc">Ver os ${x.L.length} lançamento(s)</button></div>` : ''}
    ${mm ? `<h4 style="margin:14px 0 6px">Modelo mês a mês (2027)</h4>${mm}` : ''}
    <h4 style="margin:14px 0 6px">Para confrontar: orçado do gestor nesta linha</h4>${tabO}${blocoCt}</div>`);
  const b = $('dcsLanc'); if (b) b.onclick = () => abreLancamentos(l.s, x.conta, `${l.s} · ${x.conta} — base 2026`);
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js antes de inicia(), depois dos outros ganchos) */
function instalaOrcDecisoes() {
  if (window.__orcDcs) return; window.__orcDcs = true;
  const antiga = TELAS.decisoes, posAntiga = POS.decisoes;
  if (!antiga) return;
  TELAS.decisoes = () => telaDecisoes(antiga);
  POS.decisoes = () => { if (dcsAtiva()) posDecisoes(); else if (posAntiga) posAntiga(); };
  window.addEventListener('beforeunload', e => { if (DCS.sujo.size) { e.preventDefault(); e.returnValue = ''; } });
}
