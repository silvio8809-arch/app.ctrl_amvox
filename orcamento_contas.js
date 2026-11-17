/* DE-PARA DE CONTAS e DE-PARA DA DRE TCP — EDITÁVEIS NO APP (15/11/2026: "irei usar o App para fazer as configurações, e o PT só deve ser gerado
   quando eu disser que pode… o PT, para ser gerado, deverá consultar o app").
   Tabela orc_depara_conta (migração 053; GLOBAL — não é por versão): uma linha por conta contábil com a REGRA DA CONTA (rubrica, centralizada, área
   gestora, rateio por uso, natureza, auditar, linha da DRE, método, caixa, reajuste, status, observação) e a LINHA DA DRE MODELO TCP (linha, status,
   observação). Só a Controladoria altera; o banco carimba quem e quando e guarda o histórico campo a campo (orc_alteracao). A lista de contas nasce do
   PT (plano de contas + razão): a tela não inclui nem exclui conta.
   🔴 O app NÃO recalcula o orçamento: o gerador do PT lê esta tabela a CADA geração — a alteração entra nos números quando o PT for gerado de novo.
   Carregado ANTES do orcamento.js; instalado pelo gancho instalaOrcContas() DEPOIS dos outros (embrulha as telas cfg_conta e cfg_tcp, que continuam
   valendo — só leitura — enquanto a tabela não existir ou não tiver linhas). Prévia local: D.contas_dados (alterações só na tela). Nenhum dado aqui. */
"use strict";
const CTA = { pronto: false, carregando: false, instalada: null, erro: null, rows: [], orig: new Map(), sujo: new Set(), msg: null };
const CTA_REGRA = ['rubrica', 'centralizada', 'gestor', 'rateio', 'natureza', 'auditar', 'linha_dre', 'metodo', 'caixa', 'reajuste', 'status', 'observacao'];
const CTA_TCP = ['linha_tcp', 'status_tcp', 'obs_tcp'];
const CTA_NAT = ['Folha (simulador)', 'Recorrente', 'Não recorrente', 'Gasto comum (sem gestor)', 'Investimento (CAPEX)'];
const CTA_MET = ['ORÇADO', '% FATURAMENTO', 'CAPEX'];
const CTA_CARGA = 'rotina:orc_depara_contas_app (carga do PT)';        // inclusão de conta nova pela carga: não conta como alteração depois do PT
const ctaEdita = () => est.papel === 'controladoria';
const ctaAtiva = () => CTA.instalada === true && CTA.rows.length > 0;
/* 16/11/2026 — PASSO 1 DA SIMPLIFICAÇÃO DOS DE-PARAS (Silvio: "está ficando muito DE PARA… parece um labirinto" → "Sim, começar passo 1").
   · SUA FILA: só as contas que precisam da resposta do Silvio — "quem gere esta conta?". As outras se resolvem sozinhas e não seguram nada.
     Grupos (a 1ª que casar vale) — MESMA regra do .claude/scripts/orc_fila_contas.py (trava do relatório de anomalias); mudar lá = mudar aqui:
     SEM_VALOR (sem base nem orçado) · FOLHA (simulador) · CAPEX · GC = Gastos Comuns (fila) · PCT = % do faturamento · VARIAS = mais de uma área
     entre os CCs do razão e as áreas que orçaram (fila) · OUTRA = uma área só, conta centralizada em outra e a regra de fato tira o gasto dela (fila) · UMA.
   · QUEM GERE? (uma pergunta no lugar de 3 colunas): Cada área pelo seu CC = centralizada N · Uma área só = centralizada S, rateio N, área gestora
     = dona · Ninguém = centralizada S, rateio N, Gastos Comuns. Grava as MESMAS colunas que o gerador lê: o cálculo do PT não muda.
   · Base por área do CC = razão desta versão (carregado sob demanda); orçado = ORCADO_2027 da versão. */
const CTA_GC = 'Gastos Comuns (sem gestor)';
const CTA_QG = { CC: 'Cada área pelo seu CC', DONO: 'Uma área só (dona)', NINGUEM: 'Ninguém (Gastos Comuns)' };
const ctaQG = r => r.centralizada === 'S' && r.rateio !== 'S' ? (r.gestor === CTA_GC ? 'NINGUEM' : 'DONO') : 'CC';
function ctaPedeRazao() {
  if (RAZAO || CTA.razaoPedido || typeof carregaRazao !== 'function') return;
  CTA.razaoPedido = true;
  carregaRazao().then(() => { if (['cfg_conta', 'cfg_tcp'].includes(est.tela)) desenha(); })
    .catch(e => { CTA.razaoErro = e.message || String(e); if (['cfg_conta', 'cfg_tcp'].includes(est.tela)) desenha(); });
}
function ctaOnde() {                     // base jul–out por área do CC (e sem CC), o que a alocação mandou de uma área para outra, e o orçado 2027 por área
  if (!RAZAO) return null;
  if (CTA._onde && CTA._ondeR === RAZAO && CTA._ondeD === D) return CTA._onde;
  const M = (D.meta && D.meta.razao) || {}, C = M.cols || [], st = (M.dic && M.dic.setor) || [], I = n => C.indexOf(n);
  const iC = I('conta'), iV = I('valor'), iS = I('setor_cc'), iF = I('setor_final');
  const cc = new Map(), sem = new Map(), mov = new Map(), orc = new Map();
  const add = (m, c, k, v) => { let x = m.get(c); if (!x) m.set(c, x = new Map()); x.set(k, (x.get(k) || 0) + v); };
  RAZAO.forEach(x => {
    const c = String(x[iC]), v = Math.abs(+x[iV] || 0), s = st[x[iS]] || '', f = st[x[iF]] || '';
    if (s) add(cc, c, s, v); else sem.set(c, (sem.get(c) || 0) + v);
    if (s && f && f !== s) add(mov, c, s + ' → ' + f, v);
  });
  (D.orcado || []).forEach(o => { const v = Math.abs(+o.tot || 0); if (v && o.s) add(orc, String(o.c), o.s, v); });
  CTA._onde = { cc, sem, mov, orc }; CTA._ondeR = RAZAO; CTA._ondeD = D; return CTA._onde;
}
function ctaGrupo(r) {                   // { g, fila, m } — null enquanto o razão da versão não carregou
  const O = ctaOnde(); if (!O) return null;
  const c = String(r.id), nz = m => new Map([...(m || new Map()).entries()].filter(e => e[0] && e[1]));
  const b = nz(O.cc.get(c)), o = nz(O.orc.get(c)), sc = O.sem.get(c) || 0, g = r.gestor || '';
  const cen = r.centralizada === 'S' && r.rateio !== 'S', areas = new Set([...b.keys(), ...o.keys()]);
  if (!b.size && !o.size && !sc) return { g: 'SEM_VALOR', fila: false, m: 'sem base jul–out nem orçado 2027' };
  if (r.natureza === 'Folha (simulador)') return { g: 'FOLHA', fila: false, m: 'folha: vai pelo simulador, na área de cada pessoa' };
  if (r.metodo === 'CAPEX' || r.natureza === 'Investimento (CAPEX)') return { g: 'CAPEX', fila: false, m: 'investimento: cada área orça o seu' };
  if (g === CTA_GC) return { g: 'GC', fila: true, m: 'Gastos Comuns: confirme que nenhuma área gere' };
  if (r.metodo === '% FATURAMENTO') return { g: 'PCT', fila: false, m: 'projetada pelo % do faturamento' };
  if (areas.size > 1) return { g: 'VARIAS', fila: true, m: `${areas.size} áreas lançaram ou orçaram: uma área só ou cada uma pelo seu CC?` };
  const x = [...areas][0], mv = O.mov.get(c), aoDono = x && mv ? (mv.get(x + ' → ' + g) || 0) : 0;
  if (x && cen && x !== g && (aoDono || !b.has(x))) return { g: 'OUTRA', fila: true, m: `só ${x} lançou ou orçou, mas a conta é de ${g}: confirme` };
  return { g: 'UMA', fila: false, m: 'uma área só: vale o centro de custo' };
}
const ctaTemValor = r => { const O = ctaOnde(), c = String(r.id);
  return O ? !!(O.cc.get(c) || O.sem.get(c) || O.orc.get(c)) : Math.abs((ctaInfo().get(c) || {}).media || 0) > 0; };

async function ctaCarrega() {
  if (CTA.carregando || CTA.pronto) return;
  CTA.carregando = true; CTA.erro = null;
  try {
    if (window.ORC_FONTE_LOCAL) { CTA.rows = (D.contas_dados || []).map(x => ({ ...x })); CTA.instalada = Array.isArray(D.contas_dados); }
    else if (!['controladoria', 'ceo'].includes(est.papelReal)) { CTA.rows = []; CTA.instalada = null; }          // sem leitura da tabela para os demais perfis
    else { CTA.rows = await selTodos(() => SB.from('orc_depara_conta').select('*').order('id')); CTA.instalada = true; }
  } catch (e) {
    CTA.rows = [];
    if (/orc_depara_conta/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205') CTA.instalada = false;
    else { CTA.instalada = null; CTA.erro = e.message || String(e); }
  }
  CTA.orig = new Map(CTA.rows.map(r => [r.id, { ...r }])); CTA.sujo.clear(); CTA.pronto = true; CTA.carregando = false;
  if (['cfg_conta', 'cfg_tcp'].includes(est.tela)) desenha();
}

/* o que o PT desta versão traz de cada conta (descrição, nome da rubrica, média mensal da base) — só leitura, para apoiar a decisão */
function ctaInfo() {
  if (CTA._info && CTA._infoD === D) return CTA._info;
  const m = new Map(); ((D.cfg_conta && D.cfg_conta.rows) || []).forEach(r => m.set(String(r[0]), { desc: r[1] || '', media: typeof r[11] === 'number' ? r[11] : null }));
  CTA._info = m; CTA._infoD = D; return m;
}
const ctaUniq = a => [...new Set(a.filter(x => x != null && x !== ''))];
function ctaListas() {
  if (CTA._listas && CTA._listasD === D && CTA._listasN === CTA.rows.length) return CTA._listas;
  const rub = ((D.cfg_rubricas && D.cfg_rubricas.rows) || []).map(r => [String(r[0]), r[1] || '']);
  const L = {
    rub, rubCod: ctaUniq(rub.map(r => r[0]).concat(CTA.rows.map(r => r.rubrica))),
    gestor: ctaUniq((D.setores || []).map(s => s.s).filter(s => s !== 'A CLASSIFICAR').concat(['Gastos Comuns (sem gestor)'], CTA.rows.map(r => r.gestor))),
    linha: ctaUniq(((D.cfg_linhas_dre && D.cfg_linhas_dre.rows) || []).map(r => r[0]).concat(['PESSOAL'], CTA.rows.map(r => r.linha_dre))),
    tcp: ctaUniq(((D.dre_tcp && D.dre_tcp.linhas) || []).filter(l => l.t === 'd').map(l => l.l).concat(['x'], CTA.rows.map(r => r.linha_tcp))) };
  CTA._listas = L; CTA._listasD = D; CTA._listasN = CTA.rows.length; return L;
}
const ctaRubNome = c => { const r = ctaListas().rub.find(x => x[0] === c); return r ? r[1] : ''; };
function ctaAviso(t, erro) { CTA.msg = { t, erro }; const el = $('ctaAviso'); if (el) { el.className = erro ? 'aviso' : 'ok-box'; el.textContent = t; el.hidden = false; } }
const ctaMudou = r => { const o = CTA.orig.get(r.id) || {}; return CTA_REGRA.concat(CTA_TCP).filter(k => (r[k] ?? null) !== (o[k] ?? null)); };
function ctaMarca(r) { if (ctaMudou(r).length) CTA.sujo.add(r.id); else CTA.sujo.delete(r.id); }

/* PT × app: com que leitura deste de-para o PT desta versão foi gerado, e o que mudou depois */
function ctaLida() { const c = D.meta && D.meta.contas; return c && c.lida_utc && !c.sem_leitura ? new Date(String(c.lida_utc).slice(0, 19) + 'Z') : null; }
const ctaDepois = () => { const l = ctaLida(); return l ? CTA.rows.filter(r => r.atualizado_em && r.atualizado_por !== CTA_CARGA && new Date(r.atualizado_em) > l) : []; };
function ctaAvisoPT(tcp) {
  const c = D.meta && D.meta.contas, l = ctaLida(), nome = tcp ? 'de-para da DRE TCP' : 'de-para de contas';
  if (!l) return `<div class="info">O PT desta versão foi gerado <b>antes</b> de este ${nome} vir para o app${c && c.sem_leitura ? ' (ou sem lê-lo ao vivo)' : ''}: os números da versão seguem o que está no PT. O que for alterado e salvo aqui entra na <b>próxima geração do PT</b>, que lê esta tela a cada vez.</div>`;
  const d = ctaDepois();
  return d.length
    ? `<div class="aviso">⚠ <b>${d.length} conta(s) alterada(s) depois da leitura do PT desta versão</b> (lido do app em ${esc(c.lida_em)}): ${d.slice(0, 8).map(r => esc(r.id)).join(' · ')}${d.length > 8 ? ` · e mais ${d.length - 8}` : ''}. Os números do app só mudam quando o PT for gerado de novo — ele lê esta tela a cada geração.</div>`
    : `<div class="info">O PT desta versão foi gerado com este ${nome} (lido do app em <b>${esc(c.lida_em)}</b> · ${tcp ? c.validadas_tcp : c.validadas} de ${c.contas_no_app} contas validadas). O que for alterado aqui entra na próxima geração do PT.</div>`;
}

async function ctaSalva() {
  const ids = [...CTA.sujo];
  if (!ids.length) return true;
  if (window.ORC_FONTE_LOCAL) {
    const agora_ = new Date().toISOString();
    ids.forEach(id => { const r = CTA.rows.find(x => x.id === id); if (r) { r.atualizado_em = agora_; r.atualizado_por = 'prévia local'; CTA.orig.set(id, { ...r }); } });
    CTA.sujo.clear(); ctaAviso('Prévia local: alterações guardadas só nesta tela (no app publicado vão para o banco, com histórico de quem e quando).'); return true;
  }
  let n = 0;
  try {
    for (const id of ids) {
      const r = CTA.rows.find(x => x.id === id); if (!r) { CTA.sujo.delete(id); continue; }
      const campos = {}; ctaMudou(r).forEach(k => campos[k] = r[k] === '' ? null : r[k]);
      if (Object.keys(campos).length) {
        const { data, error } = await SB.from('orc_depara_conta').update(campos).eq('id', id).select('id,atualizado_em,atualizado_por');
        if (error) throw error;
        if (!data || !data.length) throw new Error(`a conta ${id} não foi alterada (sem permissão ou conta fora do de-para)`);
        r.atualizado_em = data[0].atualizado_em; r.atualizado_por = data[0].atualizado_por; n++;
      }
      CTA.orig.set(id, { ...r }); CTA.sujo.delete(id);
    }
    ctaAviso(`✓ ${n} conta(s) salva(s), com histórico de quem e quando. Entram no orçamento na próxima geração do PT, que lê este de-para.`); return true;
  } catch (e) { ctaAviso(`Não foi possível salvar${n ? ` (${n} conta(s) já salvas)` : ''}: ` + (e.message || e), true); return false; }
}

const ctaSN = (r, k, dis) => `<select data-ctaid="${esc(r.id)}" data-ctak="${k}" ${dis}>${['S', 'N'].map(o => `<option ${r[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
const ctaSel = (r, k, ops, dis, w) => `<select data-ctaid="${esc(r.id)}" data-ctak="${k}" style="max-width:${w}px" ${dis}>${(r[k] == null ? [''].concat(ops) : ops.includes(r[k]) ? ops : ops.concat([r[k]])).map(o => `<option ${(r[k] ?? '') === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;   // sem valor = opção em branco (nunca mostrar a 1ª da lista como se valesse)
const ctaKp = (card, k, lab, v, meta, cls = '') => `<button class="kpi ${cls} ${card === k ? 'sel' : ''}" data-ctacard="${k}"><div class="lab">${lab}</div><div class="val">${v}</div><div class="meta">${meta}</div></button>`;
const ctaStatus = (r, k, ed) => `<span class="tag ${r[k] === 'VALIDADO' ? 'g' : 'y'}">${esc(r[k])}</span>${ed ? ` <button class="btn" data-ctast="${esc(r.id)}" data-ctak="${k}">${r[k] === 'VALIDADO' ? 'Reabrir' : 'Validar'}</button>` : ''}`;
function ctaCarregando(tit) { if (!CTA.carregando) setTimeout(ctaCarrega, 0); return cabecalho(tit, '') + '<div class="status">Carregando o de-para de contas…</div>'; }
function ctaSemTabela(antiga, nome) {
  const porque = CTA.instalada === false ? `A edição do ${nome} entra no ar quando a migração 053 for rodada no banco. Até lá, a fonte é o PT.`
    : CTA.erro ? `Não foi possível ler o ${nome} editável (${esc(CTA.erro)}). Abaixo, o que o PT desta versão usou.`
    : CTA.instalada === true ? `O ${nome} editável ainda não recebeu as contas (a semente vem do PT). Abaixo, o que o PT desta versão usou.` : '';
  return (porque ? `<div class="aviso">${porque}</div>` : '') + antiga();
}

/* ------------------------------------------------------------------ DE-PARA DE CONTAS */
function ctaFiltroConta() {
  const f = est.f, info = ctaInfo(), busca = (f.ctaBusca || '').toUpperCase().trim(), dep = new Set(ctaDepois().map(r => r.id));
  if (f.ctaCard === undefined) f.ctaCard = 'fila';                                    // 16/11/2026: a tela abre na SUA FILA
  const grupo = new Map(CTA.rows.map(r => [r.id, ctaGrupo(r)])), gx = r => grupo.get(r.id);
  const base = CTA.rows.filter(r => (!busca || `${r.id} ${(info.get(r.id) || {}).desc || ''} ${r.gestor || ''} ${r.linha_dre || ''} ${r.rubrica || ''} ${ctaRubNome(r.rubrica)}`.toUpperCase().includes(busca))
    && (!f.ctaGestor || r.gestor === f.ctaGestor) && (!f.ctaNat || r.natureza === f.ctaNat));
  const fil = { validar: r => r.status !== 'VALIDADO', val: r => r.status === 'VALIDADO', cen: r => r.centralizada === 'S' && r.rateio !== 'S', rat: r => r.rateio === 'S',
    pct: r => r.metodo === '% FATURAMENTO', mud: r => dep.has(r.id) || CTA.sujo.has(r.id),
    fila: r => gx(r) ? gx(r).fila && r.status !== 'VALIDADO' : r.status !== 'VALIDADO', resp: r => gx(r) ? gx(r).fila && r.status === 'VALIDADO' : r.status === 'VALIDADO',
    auto: r => !!gx(r) && !gx(r).fila, dono: r => ctaQG(r) === 'DONO', cc: r => ctaQG(r) === 'CC', ninguem: r => ctaQG(r) === 'NINGUEM' };
  const med = r => Math.abs((info.get(r.id) || {}).media || 0);
  const ord = ['fila', 'resp'].includes(f.ctaCard) ? (a, b) => med(b) - med(a) || a.id.localeCompare(b.id) : (a, b) => a.id.localeCompare(b.id);
  const card = f.ctaCard || '', L_ = (card && fil[card] ? base.filter(fil[card]) : base).slice().sort(ord);
  return { base, fil, card, L_, info, gx };
}
function ctaOndeTxt(r) {                 // "onde está hoje": base jul–out por área do CC (%) e quem orçou 2027 (R$)
  const O = ctaOnde(); if (!O) return '<small style="color:var(--ink3)">carregando a base…</small>';
  const c = String(r.id), b = O.cc.get(c), sem = O.sem.get(c) || 0, o = O.orc.get(c);
  const pb = b ? [...b.entries()].filter(e => e[1]).sort((x, y) => y[1] - x[1]) : [], tot = soma(pb, e => e[1]) + sem;
  const po = o ? [...o.entries()].filter(e => e[1]).sort((x, y) => y[1] - x[1]) : [];
  const pp = x => x > 0 && x < 0.005 ? '<1%' : pc(x, 0);
  const tb = pb.map(([a, v]) => `${a} ${pp(v / tot)}`).concat(sem ? [`sem CC ${pp(sem / tot)}`] : []), to = po.map(([a, v]) => `${a} ${rsC(v)}`);
  const curto = (L, n) => L.slice(0, n).join(' · ') + (L.length > n ? ` · +${L.length - n}` : '');
  return `<span title="${esc('Base jul–out por área do CC: ' + (tb.join(' · ') || '—') + ' | Orçado 2027: ' + (to.join(' · ') || '—'))}">`
    + (tot ? `<small><b>Base:</b> ${esc(curto(tb, 3))}</small>` : '<small style="color:var(--ink3)">sem base jul–out</small>')
    + `<br>${to.length ? `<small><b>Orçaram:</b> ${esc(curto(to, 3))}</small>` : '<small style="color:var(--ink3)">ninguém orçou</small>'}</span>`;
}
const ctaStatusConta = (r, ed, x) => x && !x.fila && r.status !== 'VALIDADO' ? `<span class="tag" title="${esc(x.m)}">automática</span>` : ctaStatus(r, 'status', ed);
const ctaMaiorArea = r => { const O = ctaOnde(); if (!O) return null; const c = String(r.id);
  const top = m => m ? [...m.entries()].filter(e => e[0] && e[1] && e[0] !== CTA_GC).sort((a, b) => b[1] - a[1])[0] : null;
  const t = top(O.cc.get(c)) || top(O.orc.get(c)); return t ? t[0] : null; };
function telaCfgConta(antiga) {
  const tit = 'De-para de contas';
  if (!CTA.pronto) return ctaCarregando(tit);
  if (!ctaAtiva()) return ctaSemTabela(antiga, 'de-para de contas');
  ctaPedeRazao();
  const f = est.f, ed = ctaEdita(), dis = ed ? '' : 'disabled', { base, fil, card, L_, info, gx } = ctaFiltroConta(), Ls = ctaListas(), pend = CTA.sujo.size;
  const cont = k => base.filter(fil[k]).length, media = L => soma(L, r => Math.abs((info.get(r.id) || {}).media || 0)), tot = media(base);
  const O = ctaOnde(), todas = !!f.ctaTodas, aguarda = '…';
  const qgSel = r => { const q = ctaQG(r);
    return `<select data-ctaqg="${esc(r.id)}" style="max-width:200px" ${dis}>${Object.entries(CTA_QG).map(([k, t]) => `<option value="${k}" ${q === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`; };
  const gestorInp = r => `<input list="ctaListaGestor" data-ctaid="${esc(r.id)}" data-ctak="gestor" value="${esc(r.gestor || '')}" style="width:170px" ${dis}>`;
  const areaCel = r => { const q = ctaQG(r), sc = O ? O.sem.get(String(r.id)) || 0 : 0;
    return q === 'NINGUEM' ? '<small>Gastos Comuns (sem gestor)</small>' : q === 'DONO' ? gestorInp(r)
      : sc ? `<small style="color:var(--ink3)">o que vem sem CC vai para</small><br>${gestorInp(r)}` : '<small style="color:var(--ink3)">— (cada área fica com o seu)</small>'; };
  const dica = r => { const q = ctaQG(r), o = O && O.orc.get(String(r.id)), out = [];
    if (q === 'DONO' && o) { const outras = [...o.entries()].filter(e => e[1] && e[0] !== r.gestor).map(e => e[0]);
      if (outras.length) out.push(`⚠ ${outras.join(', ')} também orçou: até o passo 2, esse orçado fica fora (trava de duplicidade), salvo exceção`); }
    if (q !== 'NINGUEM' && r.natureza === 'Gasto comum (sem gestor)') out.push('a natureza ainda é "Gasto comum": ajuste em Todas as colunas');
    return out.length ? `<br><small style="color:var(--warn)">${esc(out.join(' · '))}</small>` : ''; };
  const sit = r => { const x = gx(r); return x ? `<br><small style="color:var(--ink3)">${esc(x.m)}</small>` : ''; };
  const linhaC = r => { const i = info.get(r.id) || {};
    return `<tr ${CTA.sujo.has(r.id) ? 'style="background:#FFF7E6"' : ''}>
      <td class="fx w"><b>${esc(r.id)}</b> ${esc(i.desc || '')}${sit(r)}</td>
      ${tdN(i.media)}
      <td class="w">${ctaOndeTxt(r)}</td>
      <td class="ed">${qgSel(r)}${dica(r)}</td>
      <td class="ed">${areaCel(r)}</td>
      <td class="nw">${ctaStatusConta(r, ed, gx(r))}</td>
      <td class="ed"><input type="text" data-ctaid="${esc(r.id)}" data-ctak="observacao" value="${esc(r.observacao || '')}" style="width:190px" ${dis}></td></tr>`; };
  const linha = r => { const i = info.get(r.id) || {};
    return `<tr ${CTA.sujo.has(r.id) ? 'style="background:#FFF7E6"' : ''}>
      <td class="fx w"><b>${esc(r.id)}</b> ${esc(i.desc || '')}${r.fundamento ? `<br><small style="color:var(--ink3)">${esc(r.fundamento)}</small>` : ''}${sit(r)}</td>
      ${tdN(i.media)}
      <td class="ed">${qgSel(r)}${dica(r)}</td>
      <td class="ed"><input list="ctaListaRub" data-ctaid="${esc(r.id)}" data-ctak="rubrica" value="${esc(r.rubrica || '')}" style="width:62px" ${dis}><br><small style="color:var(--ink3)">${esc(ctaRubNome(r.rubrica).slice(0, 24) || 'rubrica inexistente')}</small></td>
      <td class="ed">${ctaSN(r, 'centralizada', dis)}</td>
      <td class="ed">${gestorInp(r)}</td>
      <td class="ed">${ctaSN(r, 'rateio', dis)}</td>
      <td class="ed">${ctaSel(r, 'natureza', CTA_NAT, dis, 150)}</td>
      <td class="ed"><input list="ctaListaLinha" data-ctaid="${esc(r.id)}" data-ctak="linha_dre" value="${esc(r.linha_dre || '')}" style="width:210px" ${dis}></td>
      <td class="ed">${ctaSel(r, 'metodo', CTA_MET, dis, 130)}</td>
      <td class="ed">${ctaSN(r, 'caixa', dis)}</td><td class="ed">${ctaSN(r, 'reajuste', dis)}</td><td class="ed">${ctaSN(r, 'auditar', dis)}</td>
      <td class="nw">${ctaStatusConta(r, ed, gx(r))}</td>
      <td class="ed"><input type="text" data-ctaid="${esc(r.id)}" data-ctak="observacao" value="${esc(r.observacao || '')}" style="width:190px" ${dis}></td></tr>`; };
  const kp = (k, lab, v, meta, cls) => ctaKp(card, k, lab, v, meta, cls);
  const cabC = '<th class="fx">Conta</th><th class="n">Média mensal</th><th>Onde está hoje <small>(base jul–out por área do CC · orçado 2027)</small></th><th class="ed">Quem gere?</th><th class="ed">Área dona / sem CC</th><th>Status</th><th class="ed">Observação</th>';
  const cabT = `<th class="fx">Conta</th><th class="n">Média mensal</th><th class="ed">Quem gere?</th><th class="ed">Rubrica</th><th class="ed" title="S = o gasto vai para a área gestora, qualquer que seja o centro de custo">Centr.</th>
      <th class="ed">Área gestora / padrão sem CC</th><th class="ed" title="S = rateio por uso: fica na área do centro de custo que usou">Rateio</th><th class="ed">Natureza</th><th class="ed">Linha da DRE</th><th class="ed">Método</th>
      <th class="ed" title="Entra no fluxo de caixa">Caixa</th><th class="ed" title="Reajusta pela inflação na projeção do modelo">Reaj.</th><th class="ed" title="Entra na auditoria de alocação">Audit.</th><th>Status</th><th class="ed">Observação</th>`;
  return `${cabecalho(tit, 'A <b>sua fila</b> traz só as contas que precisam de você, com uma pergunta: <b>quem gere esta conta?</b> — cada área pelo seu centro de custo, uma área só (a dona) ou ninguém (Gastos Comuns). As demais se resolvem sozinhas (folha no simulador, % do faturamento, investimento, uma área só ou sem valor) e não seguram o relatório de anomalias. <b>Todas as colunas</b> mostra a regra completa (rubrica, natureza, linha da DRE, método, caixa, reajuste). O app grava as mesmas colunas que o PT lê: nada muda no cálculo até a próxima geração.',
    `<div class="filtros" style="margin-left:auto"><input id="ctaBusca" placeholder="Conta, descrição, área ou linha" value="${esc(f.ctaBusca || '')}" style="width:220px">
      <select id="ctaGestor"><option value="">Todas as áreas gestoras</option>${Ls.gestor.map(g => `<option ${f.ctaGestor === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
      <select id="ctaNat"><option value="">Todas as naturezas</option>${CTA_NAT.map(g => `<option ${f.ctaNat === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>`)}
  <div id="ctaAviso" class="${CTA.msg && CTA.msg.erro ? 'aviso' : 'ok-box'}" ${CTA.msg ? '' : 'hidden'}>${CTA.msg ? esc(CTA.msg.t) : ''}</div>
  ${ctaAvisoPT(false)}
  ${CTA.razaoErro ? `<div class="aviso">Não foi possível carregar o razão desta versão (${esc(CTA.razaoErro)}): a fila usa só o status de cada conta.</div>` : ''}
  <datalist id="ctaListaRub">${Ls.rub.map(r => `<option value="${esc(r[0])}">${esc(r[1])}</option>`).join('')}</datalist>
  <datalist id="ctaListaGestor">${Ls.gestor.map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist>
  <datalist id="ctaListaLinha">${Ls.linha.map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist>
  <section class="kpis">
    ${kp('', 'Contas no de-para', base.length, `média mensal da base ${rsC(tot)}`)}
    ${kp('fila', 'Sua fila', O ? cont('fila') : aguarda, O ? `${pc(div(media(base.filter(fil.fila)), tot))} da média da base · quem gere?` : 'carregando a base…', 'k2')}
    ${kp('resp', 'Respondidas', O ? cont('resp') : aguarda, 'da fila, já validadas', 'k5')}
    ${kp('auto', 'Automáticas', O ? cont('auto') : aguarda, 'folha, % do faturamento, investimento, uma área só ou sem valor')}
    ${kp('dono', 'Uma área só', cont('dono'), 'o gasto vai para a área dona')}
    ${kp('cc', 'Cada área pelo CC', cont('cc'), 'inclui o rateio por uso')}
    ${kp('ninguem', 'Gastos Comuns', cont('ninguem'), 'ninguém gere')}
    ${kp('mud', 'Alteradas depois do PT', cont('mud'), 'ainda não estão nos números', 'k3')}
  </section>
  <div class="card"><h3>${card === 'fila' ? 'Sua fila — quem gere cada conta?' : 'Regra de cada conta'} ${card && card !== 'fila' ? '— filtro do cartão' : ''} <small>${L_.length} conta(s)${card === 'fila' ? ' · as maiores primeiro' : ''}</small></h3>
    <div class="csub">Amarelo = editável pela Controladoria. <b>Cada área pelo seu CC</b> = o gasto fica na área do centro de custo que lançou (inclui o rateio por uso). <b>Uma área só</b> = vai todo para a área dona. <b>Ninguém</b> = Gastos Comuns. Responda, clique em <b>Validar</b> e depois em <b>Salvar alterações</b>. A média mensal e a base vêm do PT desta versão (jul–out/26).${ed ? '' : ' <b>Somente leitura neste perfil.</b>'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      ${ed ? `<button class="btn primary" id="ctaSalvar" ${pend ? '' : 'disabled'}>Salvar alterações${pend ? ` (${pend})` : ''}</button>
      <button class="btn" id="ctaDesfaz" ${pend ? '' : 'disabled'}>Desfazer</button>
      <button class="btn" id="ctaValidarTodos" data-ctak="status" ${L_.some(r => r.status !== 'VALIDADO') ? '' : 'disabled'}>Validar as ${L_.filter(r => r.status !== 'VALIDADO').length} deste filtro</button>` : ''}
      <button class="btn" id="ctaTodas" style="margin-left:auto">${todas ? 'Só o essencial' : 'Todas as colunas'}</button></div>
    <div class="tw" style="margin-top:6px"><table class="t" id="ctaTab"><thead><tr>${todas ? cabT : cabC}</tr></thead><tbody>
    ${L_.slice(0, 300).map(todas ? linha : linhaC).join('') || `<tr><td colspan="${todas ? 15 : 7}" class="vazio">${card === 'fila' && O ? 'Fila vazia: todas as contas que precisam de você já estão validadas.' : 'Nenhuma conta neste filtro.'}</td></tr>`}
    </tbody></table></div>${L_.length > 300 ? '<div class="csub">Mostrando 300 contas — use os cartões, os filtros ou a busca.</div>' : ''}</div>`;
}

/* ------------------------------------------------------------------ DE-PARA DA DRE TCP */
function ctaFiltroTcp() {
  const f = est.f, info = ctaInfo(), busca = (f.tcpBusca || '').toUpperCase().trim(), dep = new Set(ctaDepois().map(r => r.id));
  const base = CTA.rows.filter(r => r.id !== 'CAPEX' && (!busca || `${r.id} ${(info.get(r.id) || {}).desc || ''} ${r.linha_tcp || ''} ${r.linha_dre || ''}`.toUpperCase().includes(busca))
    && (!f.tcpLinha || (r.linha_tcp || '') === f.tcpLinha));
  if (f.tcpCard === undefined) f.tcpCard = 'precisa';                              // 16/11/2026: abre no que precisa de você
  const fil = { precisa: r => (r.linha_tcp === 'x' || !r.linha_tcp) && ctaTemValor(r), validar: r => r.status_tcp !== 'VALIDADO', val: r => r.status_tcp === 'VALIDADO', outras: r => r.linha_tcp === 'Outras despesas', fora: r => r.linha_tcp === 'x' || !r.linha_tcp,
    mud: r => dep.has(r.id) || CTA.sujo.has(r.id) };
  const card = f.tcpCard || '', L_ = (card ? base.filter(fil[card]) : base).slice().sort((a, b) => a.id.localeCompare(b.id));
  return { base, fil, card, L_, info };
}
function telaCfgTcp(antiga) {
  const tit = 'De-para conta → linha da DRE TCP';
  if (!CTA.pronto) return ctaCarregando(tit);
  if (!ctaAtiva()) return ctaSemTabela(antiga, 'de-para da DRE TCP');
  ctaPedeRazao();
  const f = est.f, ed = ctaEdita(), dis = ed ? '' : 'disabled', { base, fil, card, L_, info } = ctaFiltroTcp(), Ls = ctaListas(), pend = CTA.sujo.size;
  const cont = k => base.filter(fil[k]).length, media = L => soma(L, r => Math.abs((info.get(r.id) || {}).media || 0)), tot = media(base);
  const usadas = ctaUniq(CTA.rows.map(r => r.linha_tcp)).sort((a, b) => a.localeCompare(b));
  const linha = r => { const i = info.get(r.id) || {};
    return `<tr ${CTA.sujo.has(r.id) ? 'style="background:#FFF7E6"' : ''}>
      <td class="fx w"><b>${esc(r.id)}</b> ${esc(i.desc || '')}</td>${tdN(i.media)}
      <td class="w"><small>${esc(r.linha_dre || '—')}</small></td>
      <td class="ed"><input list="ctaListaTcp" data-ctaid="${esc(r.id)}" data-ctak="linha_tcp" value="${esc(r.linha_tcp || '')}" style="width:290px" ${dis}>${r.linha_tcp === 'x' ? '<br><small style="color:var(--ink3)">x = fora da DRE TCP (cai em Outras despesas se tiver valor)</small>' : ''}</td>
      <td class="nw">${ctaStatus(r, 'status_tcp', ed)}</td>
      <td class="ed"><input type="text" data-ctaid="${esc(r.id)}" data-ctak="obs_tcp" value="${esc(r.obs_tcp || '')}" style="width:300px" ${dis}></td></tr>`; };
  const kp = (k, lab, v, meta, cls) => ctaKp(card, k, lab, v, meta, cls);
  return `${cabecalho(tit, 'Em que linha da DRE no modelo da TCP cada conta de despesa entra. A linha vem do modelo da TCP (LAL do fechamento mensal) e não muda o total nem o dono: <b>só precisa de você a conta com valor e sem linha</b> (cartão em destaque). A validação conta a conta saiu da sua fila (16/11/2026) e não segura nada. A folha vai para a linha de pessoal pelo bloco do setor; o que não tiver linha cai em <b>Outras despesas</b>.',
    `<div class="filtros" style="margin-left:auto"><input id="tcpBusca" placeholder="Conta, descrição ou linha" value="${esc(f.tcpBusca || '')}" style="width:220px">
      <select id="tcpLinha"><option value="">Todas as linhas da DRE TCP</option>${usadas.map(g => `<option ${f.tcpLinha === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>`)}
  <div id="ctaAviso" class="${CTA.msg && CTA.msg.erro ? 'aviso' : 'ok-box'}" ${CTA.msg ? '' : 'hidden'}>${CTA.msg ? esc(CTA.msg.t) : ''}</div>
  ${ctaAvisoPT(true)}
  <datalist id="ctaListaTcp">${Ls.tcp.map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist>
  <section class="kpis">
    ${kp('', 'Contas', base.length, `média mensal da base ${rsC(tot)}`)}
    ${kp('precisa', 'Precisam de linha', cont('precisa'), 'com valor e sem linha da DRE TCP', 'k2')}
    ${kp('validar', 'A validar', cont('validar'), 'não seguram nada (a linha vem do modelo da TCP)')}
    ${kp('val', 'Validadas', cont('val'), `${pc(div(media(base.filter(fil.val)), tot))} da média da base`, 'k5')}
    ${kp('outras', 'Em Outras despesas', cont('outras'), `${rsC(media(base.filter(fil.outras)))} por mês sem linha própria`, 'k3')}
    ${kp('fora', 'Fora da DRE TCP', cont('fora'), 'marcadas com x ou sem linha')}
    ${kp('mud', 'Alteradas depois do PT', cont('mud'), 'ainda não estão nos números', 'k3')}
  </section>
  <div class="card"><h3>Linha da DRE TCP de cada conta ${card ? '— filtro do cartão' : ''} <small>${L_.length} conta(s)</small></h3>
    <div class="csub">Amarelo = editável pela Controladoria. A linha da DRE do orçamento (ao lado) vem do de-para de contas e só ajuda a conferir.${ed ? '' : ' <b>Somente leitura neste perfil.</b>'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      ${ed ? `<button class="btn primary" id="ctaSalvar" ${pend ? '' : 'disabled'}>Salvar alterações${pend ? ` (${pend})` : ''}</button>
      <button class="btn" id="ctaDesfaz" ${pend ? '' : 'disabled'}>Desfazer</button>
      <button class="btn" id="ctaValidarTodos" data-ctak="status_tcp" ${L_.some(r => r.status_tcp !== 'VALIDADO') ? '' : 'disabled'}>Validar as ${L_.filter(r => r.status_tcp !== 'VALIDADO').length} deste filtro</button>` : ''}</div>
    <div class="tw" style="margin-top:6px"><table class="t" id="ctaTab"><thead><tr><th class="fx">Conta</th><th class="n">Média mensal</th><th>Linha da DRE (orçamento)</th><th class="ed">Linha da DRE TCP</th><th>Status</th><th class="ed">Observação</th></tr></thead><tbody>
    ${L_.slice(0, 300).map(linha).join('') || '<tr><td colspan="6" class="vazio">Nenhuma conta neste filtro.</td></tr>'}
    </tbody></table></div>${L_.length > 300 ? '<div class="csub">Mostrando 300 contas — use os cartões, o filtro ou a busca.</div>' : ''}</div>`;
}

/* ------------------------------------------------------------------ eventos (as duas telas) */
function posCta(tcp) {
  if (!ctaAtiva()) return;
  const f = est.f, Ls = ctaListas(); CTA.msg = null;
  const liga = (id, chave) => { const el = $(id); if (el) el.onchange = e => { f[chave] = e.target.value; desenha(); }; };
  if (tcp) { liga('tcpBusca', 'tcpBusca'); liga('tcpLinha', 'tcpLinha'); } else { liga('ctaBusca', 'ctaBusca'); liga('ctaGestor', 'ctaGestor'); liga('ctaNat', 'ctaNat'); }
  const chaveCard = tcp ? 'tcpCard' : 'ctaCard';
  document.querySelectorAll('#tela [data-ctacard]').forEach(x => x.onclick = () => { f[chaveCard] = f[chaveCard] === x.dataset.ctacard || !x.dataset.ctacard ? null : x.dataset.ctacard; desenha(); });
  const listaDe = { rubrica: () => Ls.rubCod, gestor: () => Ls.gestor, linha_dre: () => Ls.linha, linha_tcp: () => Ls.tcp }, rotulo = { rubrica: 'Rubrica', gestor: 'Área gestora', linha_dre: 'Linha da DRE', linha_tcp: 'Linha da DRE TCP' };
  document.querySelectorAll('#ctaTab [data-ctaid]').forEach(el => el.onchange = () => {
    if (!ctaEdita()) return;
    const r = CTA.rows.find(x => x.id === el.dataset.ctaid); if (!r) return;
    const k = el.dataset.ctak, v = String(el.value).trim();
    CTA.msg = null;                                           // o aviso da ação anterior não acompanha esta
    if (listaDe[k]) {
      if (v && !listaDe[k]().includes(v)) { ctaAviso(`${rotulo[k]} fora da lista: ${v}. Escolha uma das opções.`, true); el.value = r[k] || ''; return; }
      if (!v && k !== 'linha_tcp' && r.id !== 'CAPEX') { ctaAviso(`${rotulo[k]} não pode ficar em branco na conta ${r.id}.`, true); el.value = r[k] || ''; return; }
      r[k] = v || null;
    } else r[k] = v || null;
    ctaMarca(r); desenha();
  });
  document.querySelectorAll('#tela [data-ctast]').forEach(x => x.onclick = () => {
    const r = CTA.rows.find(y => y.id === x.dataset.ctast); if (!r) return;
    const k = x.dataset.ctak; r[k] = r[k] === 'VALIDADO' ? 'A VALIDAR' : 'VALIDADO'; ctaMarca(r); desenha();
  });
  const vt = $('ctaValidarTodos'); if (vt) vt.onclick = () => {
    const k = vt.dataset.ctak, L_ = (tcp ? ctaFiltroTcp() : ctaFiltroConta()).L_.filter(r => r[k] !== 'VALIDADO');
    if (!L_.length || !confirm(`Validar ${L_.length} conta(s) com o que está na tela?`)) return;
    L_.forEach(r => { r[k] = 'VALIDADO'; ctaMarca(r); }); desenha(); ctaAviso(`${L_.length} conta(s) marcadas como validadas. Clique em Salvar alterações.`);
  };
  const tg = $('ctaTodas'); if (tg) tg.onclick = () => { f.ctaTodas = !f.ctaTodas; desenha(); };      // 16/11/2026: só o essencial × todas as colunas
  document.querySelectorAll('#ctaTab [data-ctaqg]').forEach(el => el.onchange = () => {              // 16/11/2026: QUEM GERE? grava as colunas que o PT lê
    if (!ctaEdita()) return;
    const r = CTA.rows.find(x => x.id === el.dataset.ctaqg); if (!r) return;
    const v = el.value; CTA.msg = null;
    if (v === 'NINGUEM') { r.centralizada = 'S'; r.rateio = 'N'; r.gestor = CTA_GC; }
    else if (v === 'DONO') {
      r.centralizada = 'S'; r.rateio = 'N';
      if (!r.gestor || r.gestor === CTA_GC) { const top = ctaMaiorArea(r); if (top) r.gestor = top;
        ctaAviso(top ? `Conta ${r.id}: área dona sugerida = ${top} (a de maior base). Troque no campo ao lado se for outra.` : `Conta ${r.id}: escolha a área dona no campo ao lado.`, !top); }
      else ctaAviso(`Conta ${r.id}: área dona = ${r.gestor} (a que já recebia o que vem sem CC). Troque no campo ao lado se for outra.`);
    } else if (r.centralizada === 'S' && r.rateio !== 'S') { r.centralizada = 'N'; r.rateio = 'N'; }
    ctaMarca(r); desenha();
  });
  const s = $('ctaSalvar'); if (s) s.onclick = async () => { s.disabled = true; await ctaSalva(); desenha(); };
  const dz = $('ctaDesfaz'); if (dz) dz.onclick = () => {
    CTA.sujo.forEach(id => { const r = CTA.rows.find(x => x.id === id), o = CTA.orig.get(id); if (r && o) Object.assign(r, o); });
    CTA.sujo.clear(); CTA.msg = null; desenha();
  };
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js antes de inicia(), depois dos outros ganchos) */
function instalaOrcContas() {
  if (window.__orcCta) return; window.__orcCta = true;
  const antigaC = TELAS.cfg_conta, posC = POS.cfg_conta, antigaT = TELAS.cfg_tcp, posT = POS.cfg_tcp;
  if (antigaC) { TELAS.cfg_conta = () => telaCfgConta(antigaC); POS.cfg_conta = () => { if (ctaAtiva()) posCta(false); else if (posC) posC(); }; }
  if (antigaT) { TELAS.cfg_tcp = () => telaCfgTcp(antigaT); POS.cfg_tcp = () => { if (ctaAtiva()) posCta(true); else if (posT) posT(); }; }
  window.addEventListener('beforeunload', e => { if (CTA.sujo.size) { e.preventDefault(); e.returnValue = ''; } });
}
