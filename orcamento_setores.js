/* SETORES × GESTORES — EDITÁVEIS NO APP (15/11/2026: "irei usar o App para fazer as configurações, e o PT só deve ser gerado quando eu disser que pode…
   o PT, para ser gerado, deverá consultar o app"; 5º item da fila, 16/11/2026).
   Tabela orc_setor (migração 057; GLOBAL — não é por versão): uma linha por setor orçamentário com o GESTOR responsável, o GRUPO comparativo (agrupa as
   áreas nos resumos e no mensal), o BLOCO DA DRE onde cai o pessoal do setor, o STATUS (A VALIDAR / VALIDADO) e a observação. A lista de setores é a do
   modelo: a tela não inclui, não exclui e não renomeia setor (setor novo ou fusão mexe na folha, nas vagas e nas decisões). Só a Controladoria altera; o
   banco carimba quem e quando e guarda o histórico (orc_alteracao).
   🔴 O app NÃO recalcula: o gerador do PT lê esta tabela a CADA geração — o bloco da DRE muda a DRE e o grupo muda os resumos quando o PT for gerado de novo.
   Carregado ANTES do orcamento.js; instalado pelo gancho instalaOrcSetores() DEPOIS dos outros (embrulha a tela cfg_setores, que continua valendo — só
   leitura — enquanto a tabela não existir ou não tiver linhas). Prévia local: D.setores_dados (alterações só na tela). Nenhum dado aqui. */
"use strict";
const STS = { pronto: false, carregando: false, instalada: null, erro: null, rows: [], orig: new Map(), sujo: new Set(), msg: null };
const STS_EDIT = ['gestor', 'grupo', 'bloco', 'status', 'observacao'];
const STS_BLOCOS = ['Despesas com Vendas', 'Despesas Operacionais', 'Despesas Gerais e Administrativas'];
const stsEdita = () => est.papel === 'controladoria';
const stsAtiva = () => STS.instalada === true && STS.rows.length > 0;
const stsN = v => String(v ?? '').trim() || null;

async function stsCarrega() {
  if (STS.carregando || STS.pronto) return;
  STS.carregando = true; STS.erro = null;
  try {
    if (window.ORC_FONTE_LOCAL) { STS.rows = (D.setores_dados || []).map(x => ({ ...x })); STS.instalada = Array.isArray(D.setores_dados); }
    else if (!['controladoria', 'ceo'].includes(est.papelReal)) { STS.rows = []; STS.instalada = null; }      // sem leitura da tabela para os demais perfis
    else { STS.rows = await selTodos(() => SB.from('orc_setor').select('*').order('ordem')); STS.instalada = true; }
  } catch (e) {
    STS.rows = [];
    if (/orc_setor/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205') STS.instalada = false;
    else { STS.instalada = null; STS.erro = e.message || String(e); }
  }
  STS.orig = new Map(STS.rows.map(r => [r.id, { ...r }])); STS.sujo.clear(); STS.pronto = true; STS.carregando = false;
  if (est.tela === 'cfg_setores') desenha();
}

function stsAviso(t, erro) { STS.msg = { t, erro }; const el = $('stsAviso'); if (el) { el.className = erro ? 'aviso' : 'ok-box'; el.textContent = t; el.hidden = false; } }
const stsMudou = r => { const o = STS.orig.get(r.id) || {}; return STS_EDIT.filter(k => stsN(r[k]) !== stsN(o[k])); };
function stsMarca(r) { if (stsMudou(r).length) STS.sujo.add(r.id); else STS.sujo.delete(r.id); }
const stsPT = () => new Map((D.setores || []).map(s => [s.s, s]));
/* app (já salvo) × PT desta versão: gestor, grupo ou bloco diferentes */
function stsDifPT() {
  const pt = stsPT(), out = [];
  STS.orig.forEach(o => { const p = pt.get(o.id); if (!p) { out.push({ id: o.id, o: 'fora do PT' }); return; }
    const d = [['gestor', 'gestor', 'gestor'], ['grupo', 'gc', 'grupo'], ['bloco', 'bloco', 'bloco']].filter(([k, kp]) => (stsN(o[k]) || '') !== (stsN(p[kp]) || '')).map(x => x[2]);
    if (d.length) out.push({ id: o.id, o: d.join(', ') }); });
  return out;
}

async function stsSalva() {
  const ids = [...STS.sujo];
  if (!ids.length) return true;
  const semGrupo = ids.map(id => STS.rows.find(x => x.id === id)).filter(r => r && !stsN(r.grupo));
  if (semGrupo.length) { stsAviso(`Informe o grupo comparativo: ${semGrupo.map(r => r.id).join(' · ')}.`, true); return false; }
  if (window.ORC_FONTE_LOCAL) {
    const agora_ = new Date().toISOString();
    ids.forEach(id => { const r = STS.rows.find(x => x.id === id); if (r) { r.atualizado_em = agora_; r.atualizado_por = 'prévia local'; STS.orig.set(id, { ...r }); } });
    STS.sujo.clear(); stsAviso('Prévia local: alterações guardadas só nesta tela (no app publicado vão para o banco, com histórico de quem e quando).'); return true;
  }
  let n = 0;
  try {
    for (const id of ids) {
      const r = STS.rows.find(x => x.id === id); if (!r) { STS.sujo.delete(id); continue; }
      const campos = {}; stsMudou(r).forEach(k => campos[k] = stsN(r[k]));
      if (Object.keys(campos).length) {
        const { data, error } = await SB.from('orc_setor').update(campos).eq('id', id).select('id,gestor,grupo,bloco,status,observacao,atualizado_em,atualizado_por');
        if (error) throw error;
        if (!data || !data.length) throw new Error(`o setor ${id} não foi alterado (sem permissão ou fora da lista)`);
        Object.assign(r, data[0]); n++;
      }
      STS.orig.set(id, { ...r }); STS.sujo.delete(id);
    }
    stsAviso(`✓ ${n} setor(es) salvo(s), com histórico de quem e quando. Entram no PT na próxima geração, que lê esta tela.`); return true;
  } catch (e) { stsAviso(`Não foi possível salvar${n ? ` (${n} já salvos)` : ''}: ` + (e.message || e), true); return false; }
}

function telaCfgSetores(antiga) {
  const tit = 'Setores e usuários';
  if (!STS.pronto) { if (!STS.carregando) setTimeout(stsCarrega, 0); return cabecalho(tit, '') + '<div class="status">Carregando os setores…</div>'; }
  if (!stsAtiva()) {
    const porque = STS.instalada === false ? 'A edição dos setores entra no ar quando a migração 057 for rodada no banco. Até lá, a fonte é o PT.'
      : STS.erro ? `Não foi possível ler os setores editáveis (${esc(STS.erro)}). Abaixo, o que o PT desta versão usou.`
      : STS.instalada === true ? 'Os setores editáveis ainda não receberam a lista do PT (semente). Abaixo, o que o PT desta versão usou.' : '';
    return (porque ? `<div class="aviso">${porque}</div>` : '') + antiga();
  }
  const f = est.f, ed = stsEdita(), dis = ed ? '' : 'disabled', pt = stsPT(), pend = STS.sujo.size, dif = stsDifPT(), m = D.meta && D.meta.setores;
  const grupos = [...new Set(STS.rows.map(r => stsN(r.grupo)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const card = f.stsCard || '', fil = { val: r => r.status === 'VALIDADO', validar: r => r.status !== 'VALIDADO', mud: r => STS.sujo.has(r.id) || dif.some(x => x.id === r.id) };
  const L_ = (card && fil[card] ? STS.rows.filter(fil[card]) : STS.rows).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const kp = (k, lab, v, meta, cls = '') => `<button class="kpi ${cls} ${card === k ? 'sel' : ''}" data-stscard="${k}"><div class="lab">${lab}</div><div class="val">${v}</div><div class="meta">${meta}</div></button>`;
  const linha = r => { const p = pt.get(r.id) || {}, d = dif.find(x => x.id === r.id);
    return `<tr ${STS.sujo.has(r.id) ? 'style="background:#FFF7E6"' : ''}>
      <td class="fx nw"><b>${esc(r.id)}</b>${(p.ccs || []).length ? `<br><small style="color:var(--ink3)">CC ${esc(p.ccs.join(', '))}</small>` : ''}</td>
      <td class="ed"><input type="text" data-stsid="${esc(r.id)}" data-stsk="gestor" value="${esc(r.gestor || '')}" style="width:190px" ${dis}></td>
      <td class="ed"><input list="stsListaGrupo" data-stsid="${esc(r.id)}" data-stsk="grupo" value="${esc(r.grupo || '')}" style="width:180px" ${dis}></td>
      <td class="ed"><select data-stsid="${esc(r.id)}" data-stsk="bloco" ${dis}>${STS_BLOCOS.concat(STS_BLOCOS.includes(r.bloco) ? [] : [r.bloco]).map(o => `<option ${r.bloco === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></td>
      <td>${esc(p.en || '—')}</td><td><small>${esc(p.dir || '—')}</small></td>
      <td class="nw"><span class="tag ${r.status === 'VALIDADO' ? 'g' : 'y'}">${esc(r.status)}</span>${ed ? ` <button class="btn" data-stsst="${esc(r.id)}">${r.status === 'VALIDADO' ? 'Reabrir' : 'Validar'}</button>` : ''}</td>
      <td class="ed"><input type="text" data-stsid="${esc(r.id)}" data-stsk="observacao" value="${esc(r.observacao || '')}" style="width:260px" ${dis}></td>
      <td class="nw">${d ? `<span class="tag r" title="O PT desta versão usou outro valor">PT: ${esc(d.o)}</span>` : '<small style="color:var(--ink3)">igual ao PT</small>'}</td></tr>`; };
  return `${cabecalho(tit, 'Setor orçamentário → <b>gestor</b> responsável, <b>grupo comparativo</b> (agrupa as áreas nos resumos e no mensal) e <b>bloco da DRE</b> onde cai o pessoal do setor. A diretoria e os centros de custo de cada setor vêm da árvore de CC. A lista de setores é do modelo: setor novo, fusão ou troca de nome se pedem à Controladoria (mexem na folha e nas vagas).')}
  <div id="stsAviso" class="${STS.msg && STS.msg.erro ? 'aviso' : 'ok-box'}" ${STS.msg ? '' : 'hidden'}>${STS.msg ? esc(STS.msg.t) : ''}</div>
  ${dif.length ? `<div class="aviso">⚠ <b>${dif.length} setor(es) diferente(s) do PT desta versão</b>: ${dif.slice(0, 8).map(x => `${esc(x.id)} (${esc(x.o)})`).join(' · ')}. O PT só muda quando for gerado de novo — ele lê esta tela a cada geração (o bloco da DRE muda a DRE; o grupo muda os resumos).</div>`
    : `<div class="info">${m && m.lida_em && !m.sem_leitura ? `O PT desta versão foi gerado com estes setores (lidos do app em <b>${esc(m.lida_em)}</b>).` : 'Gestor, grupo e bloco do app são os mesmos que o PT desta versão usou.'} O que for alterado aqui entra na <b>próxima geração do PT</b>.</div>`}
  <datalist id="stsListaGrupo">${grupos.map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist>
  <section class="kpis">
    ${kp('', 'Setores', STS.rows.length, `${grupos.length} grupo(s) comparativo(s)`)}${kp('val', 'Validados', STS.rows.filter(fil.val).length, 'gestor, grupo e bloco conferidos', 'k4')}
    ${kp('validar', 'A validar', STS.rows.filter(fil.validar).length, 'conferir e validar', 'k2')}${kp('mud', 'Diferentes do PT', STS.rows.filter(fil.mud).length, 'entram na próxima geração', 'k3')}
  </section>
  <div class="card"><h3>Setores ${card ? '— filtro do cartão' : ''} <small>${L_.length}</small></h3>
    <div class="csub">Amarelo = editável pela Controladoria.${ed ? '' : ' <b>Somente leitura neste perfil.</b>'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      ${ed ? `<button class="btn primary" id="stsSalvar" ${pend ? '' : 'disabled'}>Salvar alterações${pend ? ` (${pend})` : ''}</button>
      <button class="btn" id="stsDesfaz" ${pend ? '' : 'disabled'}>Desfazer</button>
      <button class="btn" id="stsValidarTodos" ${L_.some(r => r.status !== 'VALIDADO') ? '' : 'disabled'}>Validar os ${L_.filter(r => r.status !== 'VALIDADO').length} deste filtro</button>` : ''}</div>
    <div class="tw"><table class="t" id="stsTab"><thead><tr><th class="fx">Setor</th><th class="ed">Gestor responsável</th><th class="ed">Grupo comparativo</th><th class="ed">Bloco da DRE (pessoal)</th><th>Entregou</th><th>Diretoria (árvore)</th><th>Status</th><th class="ed">Observação</th><th>× PT</th></tr></thead><tbody>
    ${L_.map(linha).join('') || '<tr><td colspan="9" class="vazio">Nenhum setor neste filtro.</td></tr>'}</tbody></table></div></div>
  <div class="card"><h3>Perfis de acesso</h3><div class="csub">O banco trava por área (RLS), não só a tela. O cadastro de usuários (e-mail → perfil e áreas) será desenhado com a Controladoria.</div>
   ${Object.entries(PAPEIS).map(([k, p]) => `<div class="sumline"><span class="t"><b>${esc(p.nm)}</b> — ${esc(p.hint)}</span><span class="v"><span class="tag ${p.ro ? 'b' : 'r'}">${esc(p.badge)}</span></span></div>`).join('')}</div>`;
}

function posCfgSetores() {
  if (!stsAtiva()) return;
  const f = est.f; STS.msg = null;
  document.querySelectorAll('#tela [data-stscard]').forEach(x => x.onclick = () => { f.stsCard = f.stsCard === x.dataset.stscard || !x.dataset.stscard ? null : x.dataset.stscard; desenha(); });
  document.querySelectorAll('#stsTab [data-stsid]').forEach(el => el.onchange = () => {
    if (!stsEdita()) return;
    const r = STS.rows.find(x => x.id === el.dataset.stsid); if (!r) return;
    const k = el.dataset.stsk, v = String(el.value).trim(); STS.msg = null;
    if (k === 'grupo' && !v) { stsAviso(`O grupo comparativo do setor ${r.id} não pode ficar em branco.`, true); el.value = r.grupo || ''; return; }
    if (k === 'bloco' && !STS_BLOCOS.includes(v)) return;
    r[k] = v || null; stsMarca(r); desenha();
  });
  document.querySelectorAll('#tela [data-stsst]').forEach(x => x.onclick = () => {
    const r = STS.rows.find(y => y.id === x.dataset.stsst); if (!r) return;
    r.status = r.status === 'VALIDADO' ? 'A VALIDAR' : 'VALIDADO'; stsMarca(r); desenha();
  });
  const vt = $('stsValidarTodos'); if (vt) vt.onclick = () => {
    const L_ = STS.rows.filter(r => r.status !== 'VALIDADO' && (!f.stsCard || f.stsCard === 'validar' || (f.stsCard === 'mud' && STS.sujo.has(r.id))));
    if (!L_.length || !confirm(`Validar ${L_.length} setor(es) com o que está na tela?`)) return;
    L_.forEach(r => { r.status = 'VALIDADO'; stsMarca(r); }); desenha(); stsAviso(`${L_.length} setor(es) marcados como validados. Clique em Salvar alterações.`);
  };
  const s = $('stsSalvar'); if (s) s.onclick = async () => { s.disabled = true; await stsSalva(); desenha(); };
  const dz = $('stsDesfaz'); if (dz) dz.onclick = () => {
    STS.sujo.forEach(id => { const r = STS.rows.find(x => x.id === id), o = STS.orig.get(id); if (r && o) Object.assign(r, o); });
    STS.sujo.clear(); STS.msg = null; desenha();
  };
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js antes de inicia(), depois dos outros ganchos) */
function instalaOrcSetores() {
  if (window.__orcSts) return; window.__orcSts = true;
  const antiga = TELAS.cfg_setores, posAntiga = POS.cfg_setores;
  if (!antiga) return;
  TELAS.cfg_setores = () => telaCfgSetores(antiga);
  POS.cfg_setores = () => { if (stsAtiva()) posCfgSetores(); else if (posAntiga) posAntiga(); };
  window.addEventListener('beforeunload', e => { if (STS.sujo.size) { e.preventDefault(); e.returnValue = ''; } });
}
