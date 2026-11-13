/* App ORÇAMENTO & CONTROLADORIA 2027 — lógica das telas (fase 1: leitura + layout das telas de trabalho).
   Dados: blocos da tabela orc_bloco (Supabase, RLS por aplicativo 'orcamento'); na prévia local, window.ORC_FONTE_LOCAL.
   Contrato dos blocos: .claude/scripts/orc_app_dados.py · Especificação: docs/ESPECIFICACAO_APP_ORCAMENTO.md */
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const soma = (a, f = x => x) => a.reduce((s, x) => s + (f(x) || 0), 0);
let D = null, RAZAO = null, FOLHA = null;

/* ------------------------------------------------------------------------------------------- perfis e menu */
const PAPEIS = {
  controladoria: { nm: 'Controladoria', badge: 'Acesso total', ro: false, hint: 'Leitura, decisões por linha e configuração do modelo.' },
  ceo: { nm: 'CEO', badge: 'Visão total · leitura', ro: true, hint: 'Toda a empresa, sem edição.' },
  diretor: { nm: 'Diretor de área', badge: 'Visão da diretoria', ro: true, hint: 'Áreas da sua diretoria (árvore de CC).' },
  gestor: { nm: 'Gestor de área', badge: 'Minha área', ro: true, hint: 'Só a sua área e o seu orçamento.' },
};
const TODOS = '*', CT = 'controladoria', CT_CEO = 'controladoria,ceo', CT_CEO_DIR = 'controladoria,ceo,diretor';
const MENU = [
  { id: 'inicio', t: 'Início', ico: '⌂', r: TODOS },
  { g: 'dem', t: 'Demonstrações', itens: [
    { id: 'dre', t: 'DRE 2027', ico: '▤', r: CT_CEO_DIR }, { id: 'dre_tcp', t: 'DRE TCP', ico: '▤', r: CT_CEO_DIR },
    { id: 'caixa', t: 'Fluxo de caixa', ico: '◫', r: CT_CEO_DIR }, { id: 'resumo', t: 'Resumo por área', ico: '▦', r: TODOS },
    { id: 'mensal', t: 'Mensal', ico: '▥', r: TODOS }] },
  { g: 'orc', t: 'Orçamento 2027', itens: [
    { id: 'ciclo', t: 'Ciclo do orçamento', ico: '◷', r: TODOS }, { id: 'meu', t: 'Meu orçamento', ico: '✎', r: TODOS },
    { id: 'folha', t: 'Folha 2027 (simulador)', ico: '☷', r: TODOS },
    { id: 'mxg', t: 'Modelo × Gestor', ico: '⇄', r: TODOS }, { id: 'decisoes', t: 'Decisões por linha', ico: '✓', r: CT_CEO_DIR },
    { id: 'projecao', t: 'Projeção final', ico: '▧', r: TODOS }, { id: 'versoes', t: 'Versões e cenários', ico: '⧉', r: CT_CEO }] },
  { g: 'acomp', t: 'Acompanhamento 2027', itens: [
    { id: 'orcreal', t: 'Orçado × Realizado', ico: '◔', r: TODOS }, { id: 'desvios', t: 'Explicações de desvio', ico: '✍', r: TODOS }] },
  { g: 'aud', t: 'Auditorias mensais', itens: [
    { id: 'aud_aloc', t: 'Alocação × política', ico: '⚑', r: CT_CEO }, { id: 'aud_forn', t: 'Fornecedor fora da área', ico: '⚑', r: CT_CEO },
    { id: 'aud_troca', t: 'Comissões × assessoria', ico: '⚑', r: CT_CEO }, { id: 'aud_recor', t: 'Contratos e licenças', ico: '⚑', r: CT_CEO },
    { id: 'aud_mapa', t: 'Mapa de anomalias contábeis', ico: '⚑', r: CT_CEO }, { id: 'aud_ajustes', t: 'Ajustes gerenciais', ico: '⚑', r: CT_CEO },
    { id: 'aud_anom', t: 'Anomalias por área (Thor)', ico: '⚑', r: CT_CEO }] },
  { g: 'cfg', t: 'Configuração', itens: [
    { id: 'cfg_premissas', t: 'Premissas', ico: '⚙', r: CT }, { id: 'cfg_conta', t: 'De-para de contas', ico: '⚙', r: CT },
    { id: 'cfg_tcp', t: 'De-para DRE TCP', ico: '⚙', r: CT }, { id: 'cfg_fornecedor', t: 'De-para de fornecedores', ico: '⚙', r: CT },
    { id: 'cfg_cc', t: 'De-para de CC', ico: '⚙', r: CT }, { id: 'cfg_arvore', t: 'Árvore de CC', ico: '⚙', r: CT },
    { id: 'cfg_excecoes', t: 'Exceções', ico: '⚙', r: CT }, { id: 'cfg_setores', t: 'Setores e usuários', ico: '⚙', r: CT },
    { id: 'cfg_rubricas', t: 'Rubricas e linhas da DRE', ico: '⚙', r: CT }] },
  { g: 'sis', t: 'Sistema', itens: [
    { id: 'sis_checks', t: 'Checks de integridade', ico: '✔', r: CT }, { id: 'sis_hist', t: 'Histórico de alterações', ico: '☰', r: CT },
    { id: 'sis_bases', t: 'Bases e cargas', ico: '⛁', r: CT }] },
];
const ITENS = {}; MENU.forEach(m => m.itens ? m.itens.forEach(i => ITENS[i.id] = { ...i, g: m.g, gt: m.t }) : ITENS[m.id] = m);

const est = { tela: 'inicio', papelReal: 'controladoria', papel: 'controladoria', escDir: '', escSetor: '', per: 'ano', cen: 'P&D',
  uni: 'R$', grpAberto: {}, f: {} };
const lsGet = k => { try { return localStorage.getItem('orc.' + k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem('orc.' + k, v); } catch (e) { } };

function pode(item, papel = est.papel) { return item.r === TODOS || item.r.split(',').includes(papel); }

/* ------------------------------------------------------------------------------------------- formatação */
function fmt(v, o = {}) {
  if (v == null || v === '') return '—';
  if (typeof v !== 'number') return esc(v);
  const uni = o.uni || est.uni; let x = v, d = o.dec ?? 0;
  if (uni === 'mil') { x = v / 1e3; d = o.dec ?? 1; } else if (uni === 'mi') { x = v / 1e6; d = o.dec ?? 2; }
  if (Math.abs(x) < 0.5 * Math.pow(10, -d)) return o.zero ?? '–';
  const s = Math.abs(x).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  return (x < 0 ? '−' : (o.sinal && x > 0 ? '+' : '')) + s;
}
const rs = v => (v < 0 ? '−' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rsC = v => { const a = Math.abs(v); const t = a >= 1e6 ? (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + ' mi'
  : a >= 1e3 ? (a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' mil' : a.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  return (v < 0 ? '−' : '') + 'R$ ' + t; };
const pc = (v, d = 1) => v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : '') + Math.abs(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const div = (a, b) => b ? a / b : null;
const uniTxt = () => ({ 'R$': 'R$', mil: 'R$ mil', mi: 'R$ milhões' }[est.uni]);
/* Δ colorido: em despesa (valor positivo = gasto) subir é ruim; em DRE/caixa (sinal de resultado) subir é bom */
const cd = (v, despesa) => !v || Math.abs(v) < 0.5 ? '' : ((v > 0) !== !!despesa ? 'up' : 'down');
const tdN = (v, o = {}) => `<td class="n ${o.cls || ''}" title="${typeof v === 'number' ? rs(v) : ''}">${fmt(v, o)}</td>`;
const tdP = (v, cls = '') => `<td class="n ${cls}">${pc(v)}</td>`;
const mesTxt = i => MESES[i] + '/27';

/* ------------------------------------------------------------------------------------------- escopo (visão por área) */
function setoresVisiveis() {
  const todos = D.setores.map(s => s.s);
  if (est.papel === 'controladoria' || est.papel === 'ceo') return new Set(todos);
  if (est.papel === 'diretor') return new Set(D.setores.filter(s => s.dir === est.escDir).map(s => s.s));
  return new Set([est.escSetor]);
}
function escopoTxt() {
  if (est.papel === 'controladoria' || est.papel === 'ceo') return 'Consolidado AMVOX';
  if (est.papel === 'diretor') return est.escDir || '—';
  return est.escSetor || '—';
}
const linhasVis = () => { const v = setoresVisiveis(); return D.linhas.filter(l => v.has(l.s)); };
const setorDe = nome => D.setores.find(s => s.s === nome) || {};

/* ------------------------------------------------------------------------------------------- carga */
async function inicia() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.replace('index.html'); return; }
  let apps = [], papelApp = 'CONSULTA';
  try { const { data } = await SB.from('profiles').select('papel,apps').eq('id', session.user.id).single();
        apps = (data && data.apps) || []; papelApp = (data && data.papel) || 'CONSULTA'; } catch (e) { }
  if (!apps.includes('orcamento')) { semAcessoApp('o app de Orçamento & Controladoria'); return; }
  window.PAPEL = papelApp;
  window.USUARIO_EMAIL = session.user.email;
  window.USUARIO_NOME = (session.user.user_metadata && session.user.user_metadata.nome) || '';
  /* perfil do orçamento: do banco (orc_perfil, migração 048 — cadastro orc_usuario); sem a 048: ADM → Controladoria, demais → Gestor */
  est.papelReal = est.papel = papelApp === 'ADM' ? 'controladoria' : 'gestor';
  if (!window.ORC_FONTE_LOCAL) {
    try { const { data, error } = await SB.rpc('orc_perfil'); if (!error && data && PAPEIS[data]) est.papelReal = est.papel = data; } catch (e) { }
  }
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  document.documentElement.style.visibility = 'visible';
  document.dispatchEvent(new CustomEvent('papel-pronto'));
  try { await carregaDados(); } catch (e) {
    $('status').innerHTML = '<span style="color:var(--brand)">Não foi possível carregar o orçamento (' + esc(e.message || e) +
      '). Saia e entre de novo; se continuar, avise a Controladoria.</span>';
    return;
  }
  mostraConectado('Orçamento: ' + PAPEIS[est.papelReal].nm);
  prepara();
  $('status').remove();
  montaSeletores();
  const h = location.hash.replace('#', '');
  est.tela = ITENS[h] ? h : (ITENS[lsGet('tela')] ? lsGet('tela') : 'inicio');
  aplicaPapel(false);
  window.addEventListener('hashchange', () => { const t = location.hash.replace('#', ''); if (ITENS[t] && t !== est.tela) vai(t, false); });
}
/* carga de UMA versão (migração 048: orc_versao + orc_bloco por versão + folha com trava por área); sem a 048 = modo antigo */
async function selTodos(fq) {                 // PostgREST devolve no máximo 1000 linhas por chamada → pagina
  let out = [], i = 0;
  for (;;) { const { data, error } = await fq().range(i, i + 999); if (error) throw error; out = out.concat(data || []); if (!data || data.length < 1000) return out; i += 1000; }
}
async function carregaDados() {
  if (window.ORC_FONTE_LOCAL) {                                     // só na prévia local
    D = await (await fetch(window.ORC_FONTE_LOCAL, { cache: 'no-store' })).json();
    const p = D.meta.razao.partes; RAZAO = [];
    for (let i = 1; i <= p; i++) RAZAO = RAZAO.concat(D['razao_' + i] || []), delete D['razao_' + i];
    est.versoes = est.versoes || D.versoes || [{ codigo: 'V1', nome: D.meta.versao, status: 'RASCUNHO', origem: D.meta.arquivo }];
    est.versao = est.versao || est.versoes[0].codigo; est.legado = false;
    const fd = D.folha_dados;
    FOLHA = fd ? { P: fd.premissa, pos: fd.posicoes.map(x => ({ ...x })), proj: fd.projecao, origem: 'carga do PT (' + D.meta.arquivo + ')', sujo: new Set(), noBanco: new Set(fd.posicoes.map(x => x.id)), premSuja: false } : null;
    return;
  }
  const rv = await SB.from('orc_versao').select('*').order('codigo');
  est.legado = !!rv.error;
  est.versoes = rv.error ? [{ codigo: 'V1', nome: '', status: 'RASCUNHO' }] : rv.data;
  if (!est.versao || !est.versoes.some(v => v.codigo === est.versao)) {
    const f = est.versoes.find(v => v.status === 'APROVADA FINAL'); est.versao = (f || est.versoes[est.versoes.length - 1]).codigo;
  }
  let q = SB.from('orc_bloco').select('nome,dados').not('nome', 'like', 'razao_%').order('ordem');
  if (!est.legado) q = q.eq('versao', est.versao);
  const { data, error } = await q;
  if (error) throw error;
  if (!data || !data.length) throw new Error('base vazia ou sem permissão');
  D = {}; data.forEach(b => D[b.nome] = b.dados); RAZAO = null; FOLHA = null;
  if (est.legado) return;
  const v = est.versao;
  const [pos, prem, proj] = await Promise.all([
    selTodos(() => SB.from('orc_folha_posicao').select('*').eq('versao', v).order('id')),
    SB.from('orc_folha_premissa').select('dados,atualizado_em,atualizado_por').eq('versao', v).maybeSingle(),
    selTodos(() => SB.from('orc_folha_projecao').select('*').eq('versao', v).order('area'))]);
  if (prem.error || !prem.data) return;
  const ult = proj.reduce((a, r) => (!a || r.projetado_em > a.projetado_em) ? r : a, null);
  FOLHA = { P: prem.data.dados, pos: pos.map(x => ({ ...x, salario: +x.salario, adicional: +x.adicional, he_media: +x.he_media, qtd: +x.qtd, pct_promo: x.pct_promo == null ? null : +x.pct_promo })),
    proj: proj.map(r => ({ ...r, conta: +r.conta, m: r.m.map(Number), base: r.base == null ? null : +r.base })),
    origem: ult ? `${ult.projetado_por || ''} em ${new Date(ult.projetado_em).toLocaleString('pt-BR')}` : '—', sujo: new Set(), noBanco: new Set(pos.map(x => x.id)), premSuja: false };
}
const versaoAtual = () => (est.versoes || []).find(v => v.codigo === est.versao) || { codigo: est.versao, status: 'RASCUNHO' };
const versaoEditavel = () => ['RASCUNHO', 'EM REVISÃO'].includes(versaoAtual().status);
async function trocaVersao(v) {
  est.versao = v; $('tela').innerHTML = '<div class="status">Carregando a versão ' + esc(v) + '…</div>';
  try { await carregaDados(); prepara(); montaSeletores(); desenha(); } catch (e) { $('tela').innerHTML = `<div class="aviso">${esc(e.message || e)}</div>`; }
}
async function carregaRazao() {
  if (RAZAO) return RAZAO;
  let q = SB.from('orc_bloco').select('nome,dados').like('nome', 'razao_%').order('ordem');
  if (!est.legado) q = q.eq('versao', est.versao);
  const { data, error } = await q;
  if (error) throw error;
  RAZAO = []; (data || []).forEach(b => RAZAO = RAZAO.concat(b.dados));
  return RAZAO;
}
function prepara() {
  D.rub = {}; (D.cfg_rubricas.rows || []).forEach(r => D.rub[r[0]] = r[1]);
  D.contaDesc = {}; (D.cfg_conta.rows || []).forEach(r => D.contaDesc[String(r[0])] = r[1]);
  D.linhas.forEach(l => { l.semDec = /^PADRÃO/.test(l.st); l.aExplicar = l.pe === 'FALTA EXPLICAÇÃO'; });
  D.fat = D.premissas.receita['Adotado'].m;
  est.escDir = est.escDir || 'Diretoria Operacional';
  est.escSetor = est.escSetor || 'Facilities';
  // gestor/diretor reais: as áreas são as que o banco libera na folha (RLS da orc_folha_posicao por orc_usuario.areas)
  if (!window.ORC_FONTE_LOCAL && est.papelReal === 'gestor' && FOLHA && FOLHA.pos.length) est.escSetor = FOLHA.pos[0].area;
}

/* ------------------------------------------------------------------------------------------- seletores, menu, usuário */
function montaSeletores() {
  $('selPer').innerHTML = '<option value="ano">Ano 2027</option>' + MESES.map((m, i) => `<option value="${i}">${m}/2027</option>`).join('');
  $('selCen').innerHTML = D.meta.cenarios.map(c => `<option value="${esc(c)}" ${c === D.meta.cenario ? '' : 'disabled'}>${esc(c)}${c === D.meta.cenario ? ' — ' + rsC(D.meta.receita) : ' (motor — fase 3)'}</option>`).join('');
  $('selVer').innerHTML = (est.versoes || []).map(v => `<option value="${esc(v.codigo)}" ${v.codigo === est.versao ? 'selected' : ''}>${esc(v.codigo)}${v.nome ? ' · ' + esc(v.nome.replace(/^V\d+\s*·\s*/, '')) : ''} — ${esc(v.status)}</option>`).join('');
  $('selVer').onchange = e => trocaVersao(e.target.value);
  const u = lsGet('uni'); if (u) est.uni = u;
  $('selUni').value = est.uni;
  $('selPer').onchange = e => { est.per = e.target.value; desenha(); };
  $('selUni').onchange = e => { est.uni = e.target.value; lsSet('uni', est.uni); desenha(); };
  $('menuBtn').onclick = e => { e.stopPropagation(); document.body.classList.toggle('menu-on'); };
  document.querySelector('.main').addEventListener('click', () => document.body.classList.remove('menu-on'));   // celular: tocar fora fecha o menu
  const f = $('faixaFase');
  f.hidden = false;
  f.innerHTML = `<b>PRÉVIA · Fase ${esc(D.meta.fase)}.</b> Números: ${esc(D.meta.arquivo)} (salvo ${esc(D.meta.arquivo_mod)}) — fonte provisória até a carga do Protheus (fase 2/3). ` +
    `Campos de entrada aparecem em amarelo e ficam travados até a fase 2; o PT continua sendo a ferramenta de trabalho.`;
  $('foot').innerHTML = `Orçamento &amp; Controladoria 2027 · contrato de dados ${esc(D.meta.contrato)} · blocos gerados em ${esc(D.meta.gerado_em)} · base realizada jul–out/26 (data-base ${esc(D.meta.data_base)})`;
}
function montaMenu() {
  const nav = $('nav');
  nav.innerHTML = MENU.map(m => {
    if (!m.itens) return itemMenu(m);
    const algum = m.itens.some(i => pode(i));
    const aberto = est.grpAberto[m.g] ?? m.itens.some(i => i.id === est.tela) ?? false;
    return `<button class="grp ${algum ? '' : 'locked'}" data-g="${m.g}">${esc(m.t)}<span class="seta ${aberto ? 'ab' : ''}">›</span></button>
      <div class="itens ${aberto ? '' : 'fechado'}" id="grp-${m.g}">${m.itens.map(itemMenu).join('')}</div>`;
  }).join('');
  nav.querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); if (!a.classList.contains('locked')) { vai(a.dataset.t); document.body.classList.remove('menu-on'); } });
  nav.querySelectorAll('.grp').forEach(b => b.onclick = () => {
    const g = b.dataset.g, el = $('grp-' + g), ab = el.classList.contains('fechado');
    est.grpAberto[g] = ab; el.classList.toggle('fechado', !ab); b.querySelector('.seta').classList.toggle('ab', ab);
  });
}
function itemMenu(i) {
  const ok = pode(i);
  return `<a href="#${i.id}" data-t="${i.id}" class="${i.id === est.tela ? 'active' : ''} ${ok ? '' : 'locked'}" title="${ok ? '' : 'Sem acesso neste perfil'}">` +
    `<span class="ico">${i.ico || '·'}</span>${esc(i.t)}${ok ? '' : '<span class="lk">🔒</span>'}</a>`;
}
function montaUsuario() {
  const p = PAPEIS[est.papel], quem = window.USUARIO_NOME || window.USUARIO_EMAIL || '';
  const ini = (quem.replace(/@.*/, '').split(/[.\s]+/).map(x => x[0] || '').join('').slice(0, 2) || 'CT').toUpperCase();
  let h = `<div class="who"><div class="avatar">${esc(ini)}</div><div><div class="nm">${esc(quem)}</div><div class="rl">${esc(PAPEIS[est.papelReal].nm)}${est.papel !== est.papelReal ? ' · vendo como ' + esc(p.nm) : ''}</div></div></div>`;
  if (est.papelReal === 'controladoria') {
    const dirs = [...new Set(D.setores.map(s => s.dir))].filter(d => d !== 'Presidência');
    h += `<label for="verComo">Ver como (teste de perfil)</label><select id="verComo">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${k === est.papel ? 'selected' : ''}>${v.nm}</option>`).join('')}</select>`;
    if (est.papel === 'diretor') h += `<label for="verDir">Diretoria</label><select id="verDir">${dirs.map(d => `<option ${d === est.escDir ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>`;
    if (est.papel === 'gestor') h += `<label for="verSet">Área</label><select id="verSet">${D.setores.filter(s => s.s !== 'A CLASSIFICAR').map(s => `<option ${s.s === est.escSetor ? 'selected' : ''}>${esc(s.s)}</option>`).join('')}</select>`;
  }
  h += `<div class="rolehint">${esc(p.hint)}</div>`;
  $('userbox').innerHTML = h;
  const vc = $('verComo'); if (vc) vc.onchange = e => { est.papel = e.target.value; aplicaPapel(); };
  const vd = $('verDir'); if (vd) vd.onchange = e => { est.escDir = e.target.value; aplicaPapel(); };
  const vs = $('verSet'); if (vs) vs.onchange = e => { est.escSetor = e.target.value; aplicaPapel(); };
}
function aplicaPapel(redesenha = true) {
  if (!pode(ITENS[est.tela])) est.tela = 'inicio';
  const p = PAPEIS[est.papel], b = $('accessBadge');
  b.textContent = p.badge + (est.papel !== est.papelReal ? ' (simulação)' : ''); b.className = 'access-badge' + (p.ro ? ' ro' : '');
  montaUsuario();
  vai(est.tela, false);
}
function vai(t, hist = true) {
  if (!ITENS[t] || !pode(ITENS[t])) t = 'inicio';
  est.tela = t; lsSet('tela', t);
  if (hist && location.hash !== '#' + t) history.pushState(null, '', '#' + t);
  montaMenu();
  desenha();
  window.scrollTo(0, 0);
}
function desenha() {
  const it = ITENS[est.tela];
  $('scrTitle').textContent = it.t;
  $('scopeSub').textContent = (it.gt ? it.gt + ' · ' : '') + escopoTxt() + ' · ' + (est.per === 'ano' ? 'Ano 2027' : mesTxt(+est.per)) + ' · valores em ' + uniTxt();
  const f = TELAS[est.tela];
  try { $('tela').innerHTML = f ? f() : vazioTela(it.t); }
  catch (e) { console.error(e); $('tela').innerHTML = `<div class="aviso">Erro ao montar a tela: ${esc(e.message)}</div>`; }
  const pos = POS[est.tela]; if (pos) pos();
}
const vazioTela = t => `<div class="card"><h3>${esc(t)}</h3><div class="csub">Em construção.</div></div>`;

/* ------------------------------------------------------------------------------------------- utilidades de tela */
const dreLinha = nome => D.dre.linhas.find(l => l.l === nome) || { base: 0, orc: 0, tcp: 0, m: Array(12).fill(0) };
const cxLinha = nome => D.caixa.linhas.find(l => l.l === nome) || { tot: 0, m: Array(12).fill(0) };
function cabecalho(t, p, extra = '') { return `<div class="head-row"><div class="title"><h2>${t}</h2>${p ? `<p>${p}</p>` : ''}</div>${extra}</div>`; }
function trava(txt) { return `<div class="aviso">🔒 <b>Edição na fase 2.</b> ${txt || 'Os campos em amarelo serão editáveis aqui, com histórico de quem alterou e quando. Até lá, a fonte é o PT.'}</div>`; }
function chips(nome, opcoes, atual, multi = false) {
  return `<div class="chips" data-chips="${nome}">` + opcoes.map(o => {
    const v = typeof o === 'string' ? o : o.v, t = typeof o === 'string' ? o : o.t, on = multi ? (atual || []).includes(v) : atual === v;
    return `<button class="chip ${on ? 'on' : ''}" data-v="${esc(v)}">${t}</button>`;
  }).join('') + '</div>';
}
function ligaChips(nome, cb, multi = false) {
  document.querySelectorAll(`[data-chips="${nome}"] .chip`).forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    if (multi) { const a = new Set(est.f[nome] || []); a.has(v) ? a.delete(v) : a.add(v); est.f[nome] = [...a]; }
    else est.f[nome] = est.f[nome] === v ? null : v;
    cb ? cb() : desenha();
  });
}
function grafBarras(serie, { w = 640, h = 210, cor = '#C8102E', cor2 = '#C4CCD6', linha = null, rot = MESES, fmtY = v => fmt(v, { uni: 'mi', dec: 1 }), zero = true } = {}) {
  const padL = 46, padB = 24, padT = 10, iw = w - padL - 10, ih = h - padB - padT, n = serie.length;
  const vals = serie.concat(linha || []);
  let mx = Math.max(0, ...vals), mn = Math.min(0, ...vals);
  if (!zero) { const lo = Math.min(...vals); mx = Math.max(...vals); mn = lo - (mx - lo) * 0.6; }        // eixo aproximado: realça a variação mês a mês
  if (mx === mn) mx = mn + 1;
  const rg = (mx - mn) * 1.08, y = v => padT + ih * (1 - (v - mn) / rg), slot = iw / n, bw = Math.min(22, slot * .55);
  let g = '';
  for (let i = 0; i <= 4; i++) { const gv = mn + rg / 4 * i, gy = y(gv); g += `<line x1="${padL}" y1="${gy}" x2="${w - 8}" y2="${gy}" stroke="#EEF1F5"/><text x="${padL - 6}" y="${gy + 3}" text-anchor="end" font-size="9.5" fill="#8A93A0">${fmtY(gv)}</text>`; }
  const b0 = zero ? 0 : mn;
  g += `<line x1="${padL}" y1="${y(b0)}" x2="${w - 8}" y2="${y(b0)}" stroke="#C9D1DC"/>`;
  serie.forEach((v, i) => { const cx = padL + slot * i + slot / 2, y0 = y(b0), yv = y(v);
    g += `<rect x="${cx - bw / 2}" y="${Math.min(y0, yv)}" width="${bw}" height="${Math.max(1, Math.abs(yv - y0))}" rx="3" fill="${v < 0 ? cor : cor2}"><title>${rot[i]}: ${rs(v)}</title></rect>`;
    g += `<text x="${cx}" y="${h - 8}" text-anchor="middle" font-size="10" fill="#5B6472">${rot[i]}</text>`; });
  if (linha) { const pts = linha.map((v, i) => `${padL + slot * i + slot / 2},${y(v)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="#1F6FEB" stroke-width="2"/>` + linha.map((v, i) => `<circle cx="${padL + slot * i + slot / 2}" cy="${y(v)}" r="3" fill="#1F6FEB"><title>${rot[i]}: ${rs(v)}</title></circle>`).join(''); }
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">${g}</svg>`;
}
function grafLinhas(series, { w = 640, h = 200, rot = MESES } = {}) {
  const padL = 46, padB = 24, padT = 10, iw = w - padL - 10, ih = h - padB - padT, n = rot.length;
  const all = series.flatMap(s => s.v); let mx = Math.max(...all, 0), mn = Math.min(...all, 0); if (mx === mn) mx += 1;
  const rg = (mx - mn) * 1.08, y = v => padT + ih * (1 - (v - mn) / rg), x = i => padL + iw / (n - 1) * i;
  let g = '';
  for (let i = 0; i <= 4; i++) { const gv = mn + rg / 4 * i; g += `<line x1="${padL}" y1="${y(gv)}" x2="${w - 8}" y2="${y(gv)}" stroke="#EEF1F5"/><text x="${padL - 6}" y="${y(gv) + 3}" text-anchor="end" font-size="9.5" fill="#8A93A0">${fmt(gv, { uni: 'mi', dec: 1 })}</text>`; }
  rot.forEach((r, i) => g += `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" font-size="10" fill="#5B6472">${r}</text>`);
  series.forEach(s => { g += `<polyline points="${s.v.map((v, i) => x(i) + ',' + y(v)).join(' ')}" fill="none" stroke="${s.cor}" stroke-width="2" ${s.tr ? 'stroke-dasharray="5 4"' : ''}/>` +
    s.v.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${s.cor}"><title>${s.t} · ${rot[i]}: ${rs(v)}</title></circle>`).join(''); });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">${g}</svg>`;
}
function abrePainel(html) { $('drill').innerHTML = html; $('drill').classList.add('on'); $('veu').classList.add('on'); $('drill').setAttribute('aria-hidden', 'false');
  $('drill').querySelectorAll('[data-fecha]').forEach(b => b.onclick = fechaPainel); }
function fechaPainel() { $('drill').classList.remove('on'); $('veu').classList.remove('on'); $('drill').setAttribute('aria-hidden', 'true'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechaPainel(); });
document.addEventListener('DOMContentLoaded', () => { $('veu').onclick = fechaPainel; });

/* abertura até o lançamento: base 2026 de uma linha setor × conta (razão jul–out/26) */
async function abreLancamentos(setor, conta, titulo) {
  abrePainel(`<div class="pl-top"><div><h3>${esc(titulo || conta)}</h3><p>Carregando o razão…</p></div><button class="x" data-fecha>Fechar ✕</button></div>`);
  let R; try { R = await carregaRazao(); } catch (e) { abrePainel(`<div class="pl-top"><div><h3>Erro</h3><p>${esc(e.message)}</p></div><button class="x" data-fecha>Fechar ✕</button></div>`); return; }
  const dic = D.meta.razao.dic, iS = dic.setor.indexOf(setor);
  let L = R.filter(r => r[4] === conta && (setor == null || r[11] === iS)), noCC = false;
  /* 13/11/2026: sem base na área (setor final) → mostra o razão dos CCs da área (base foi para outra área pela política: centralizada, exceção, fornecedor) */
  if (!L.length && setor != null) { L = R.filter(r => r[4] === conta && r[10] === iS); noCC = L.length > 0; }
  L = L.sort((a, b) => a[0] - b[0] || Math.abs(b[6]) - Math.abs(a[6]));
  const pm = {}; L.forEach(r => pm[r[0]] = (pm[r[0]] || 0) + r[6]);
  const tot = soma(L, r => r[6]), fator = D.meta.fator || 3;
  abrePainel(`<div class="pl-top"><div><h3>${esc(titulo || conta)}</h3><p>${esc(setor || 'todas as áreas')} · conta ${esc(conta)} ${esc(D.contaDesc[conta] || '')} · razão jul–out/26 (CT2, somente leitura)</p></div><button class="x" data-fecha>Fechar ✕</button></div>
   <div class="pl-corpo">
    ${noCC ? `<div class="aviso">Sem base nesta área: os lançamentos abaixo estão nos <b>CCs da área</b>, mas a base foi para <b>${esc([...new Set(L.map(r => dic.setor[r[11]]))].join(', '))}</b> pela política (conta centralizada, exceção ou fornecedor que prevalece). Por isso a linha não é "sem histórico".</div>` : ''}
    <div class="kpis">${Object.entries(pm).map(([m, v]) => `<div class="kpi k5"><div class="lab">${MESES[+String(m).slice(4) - 1]}/26</div><div class="val">${fmt(v)}</div></div>`).join('')}
      <div class="kpi"><div class="lab">${noCC ? 'Razão nos CCs da área' : 'Base anualizada'} (× ${fator})</div><div class="val">${fmt(tot * fator)}</div><div class="meta">${L.length} lançamento(s) · soma ${rs(tot)}</div></div></div>
    <div class="tw solta"><table class="t"><thead><tr><th>Mês</th><th>Dia</th><th>Lote/Doc</th><th>LP</th><th>CC</th><th>Área do CC</th><th>Histórico</th><th>Fornecedor</th><th class="n">D − C</th><th>Alocação</th></tr></thead><tbody>
    ${L.slice(0, 400).map(r => `<tr><td class="nw">${MESES[+String(r[0]).slice(4) - 1]}/26</td><td>${esc(r[1])}</td><td class="nw">${esc(r[2])}/${esc(r[3])}</td><td>${esc(r[8])}</td><td>${esc(r[5])}</td><td>${esc(dic.setor[r[10]])}</td><td class="w">${esc(r[7])}</td><td class="w">${esc(dic.nome[r[14]] || '')}</td>${tdN(r[6], { uni: 'R$', dec: 2 })}<td>${/^FORA/.test(dic.aloc[r[12]]) ? `<span class="tag r">${esc(dic.aloc[r[12]])}</span>` : esc(dic.aloc[r[12]])}</td></tr>`).join('')}
    </tbody></table></div>${L.length > 400 ? `<div class="vazio">Mostrando 400 de ${L.length} lançamentos.</div>` : ''}${!L.length ? '<div class="vazio">Sem lançamentos na janela (conta fora da janela = modelo 0).</div>' : ''}
   </div>`);
}

/* ======================================================================================================== TELAS */
const TELAS = {}, POS = {};

/* ---------------------------------------------------------------- INÍCIO */
TELAS.inicio = () => {
  if (est.papel === 'diretor' || est.papel === 'gestor') return inicioArea();
  const m = est.per === 'ano' ? null : +est.per, val = (l, k = 'orc') => m == null ? l[k] : l.m[m];
  const fat = dreLinha('Faturamento'), ebitda = dreLinha('EBITDA recorrente'), ll = dreLinha('Lucro Líquido'), rl = dreLinha('(=) Receita Líquida');
  const sf = cxLinha('Saldo final de caixa'), si = cxLinha('Saldo inicial de caixa');
  const fv = val(fat), ev = val(ebitda), lv = val(ll);
  const caixaV = m == null ? sf.m[11] : sf.m[m];
  const comp = D.dre.composicao.slice(0, 3), compT = soma(comp, c => c[1]);
  const pend = D.checks.rows.filter(r => r[3] === 'PENDENTE'), anal = D.checks.rows.filter(r => r[3] === 'ANALISAR');
  const hoje = new Date(), prox = D.meta.ciclo.find(c => new Date(c[1] + 'T23:59:59') >= hoje);
  const sint = [['(=) Receita Líquida', 'Receita líquida'], ['(=) Lucro Bruto', 'Lucro bruto'], ['(=) Margem de Contribuição', 'Margem de contribuição'], ['EBITDA recorrente', 'EBITDA recorrente'], ['Lucro Líquido', 'Lucro líquido']];
  return `
  ${cabecalho('Painel executivo — Orçamento 2027', `Cenário de receita <b>${esc(D.meta.cenario)}</b> · ${esc(D.meta.versao)} · ${m == null ? 'ano 2027' : 'mês ' + mesTxt(m)}. Clique num cartão para abrir a tela correspondente.`)}
  <section class="kpis">
    <button class="kpi" data-ir="dre"><div class="lab">Faturamento ${m == null ? '2027' : mesTxt(m)}</div><div class="val">${rsC(fv)}</div><div class="meta">${m == null ? `Base 2026 ${rsC(fat.base)} · <span class="${cd(fat.orc - fat.base)}">${pc(div(fat.orc - fat.base, fat.base))}</span><br>Plano TCP ${rsC(fat.tcp)}` : `acumulado jan–${MESES[m]}: ${rsC(soma(fat.m.slice(0, m + 1)))}`}</div></button>
    <button class="kpi k2" data-ir="dre"><div class="lab">EBITDA recorrente</div><div class="val ${ev < 0 ? 'down' : 'up'}">${rsC(ev)}</div><div class="meta">margem ${pc(div(ev, fv))}${m == null ? ` · base 2026 ${rsC(ebitda.base)}<br>Plano TCP ${rsC(ebitda.tcp)}` : ''}</div></button>
    <button class="kpi k3" data-ir="dre"><div class="lab">Lucro líquido</div><div class="val ${lv < 0 ? 'down' : 'up'}">${rsC(lv)}</div><div class="meta">margem ${pc(div(lv, fv))}${m == null ? ` · base 2026 ${rsC(ll.base)}<br>Plano TCP ${rsC(ll.tcp)}` : ''}</div></button>
    <button class="kpi k4" data-ir="caixa"><div class="lab">Saldo de caixa ${m == null ? 'dez/27' : 'fim de ' + mesTxt(m)}</div><div class="val ${caixaV < 0 ? 'down' : ''}">${rsC(caixaV)}</div><div class="meta">inicial 01/01/27 ${rsC(si.m[0])}<br>mínimo ${rsC(D.caixa.saldo_min)} em ${esc(D.caixa.mes_min)}</div></button>
  </section>
  <section class="row2">
    <div class="card"><h3>EBITDA recorrente mensal 2027</h3><div class="csub">R$ milhões · cenário ${esc(D.meta.cenario)}</div>
      ${grafBarras(ebitda.m, { h: 150 })}
      <h3 style="margin-top:12px">Saldo de caixa no fim do mês</h3><div class="csub">R$ milhões · mínimo ${rsC(D.caixa.saldo_min)} em ${esc(D.caixa.mes_min)}</div>
      ${grafLinhas([{ t: 'Saldo final', v: sf.m, cor: '#1F6FEB' }], { h: 150 })}</div>
    <div class="card"><h3>Síntese da DRE 2027</h3><div class="csub">${m == null ? 'Ano' : mesTxt(m)} · % da receita líquida</div>
      ${sint.map(([k, t], i) => { const l = dreLinha(k), v = val(l); return `<div class="sumline ${i === 4 ? 'big' : ''} clic" data-ir="dre"><span class="t">${t}</span><span class="v ${v < 0 ? 'down' : ''}">${rsC(v)}<small>${pc(div(v, val(rl)))}</small></span></div>`; }).join('')}
    </div>
  </section>
  <section class="row3">
    <div class="card"><h3>Despesas 2027 pela decisão por linha</h3><div class="csub">Composição das despesas projetadas (DRE) — clique para ver as linhas</div>
      ${comp.map(c => { const k = /GESTOR/.test(c[0]) ? 'GESTOR' : /MODELO/.test(c[0]) ? 'MODELO' : 'OUTRO';
        return `<div class="sumline clic" data-ir="decisoes" data-dec="${k}"><span class="t">${esc(c[0].replace(/\s*\(.*\)/, ''))}</span><span class="v">${rsC(c[1])}<small>${pc(div(c[1], compT))}</small></span></div><div class="barra"><i style="width:${Math.max(0, div(c[1], compT) * 100)}%"></i></div>`; }).join('')}
      <div class="sumline big"><span class="t">Total</span><span class="v">${rsC(compT)}<small>100%</small></span></div></div>
    <div class="card"><h3>Ciclo do orçamento</h3><div class="csub">Prazos das diretrizes de 09/10/2026</div>
      ${D.meta.ciclo.map(c => { const d = new Date(c[1] + 'T23:59:59'), feito = d < hoje, ag = prox && c[0] === prox[0];
        return `<div class="sumline clic" data-ir="ciclo"><span class="t">${feito ? '✓' : ag ? '▶' : '·'} ${esc(c[0])}</span><span class="v ${ag ? 'down' : ''}">${d.toLocaleDateString('pt-BR')}</span></div>`; }).join('')}</div>
    <div class="card"><h3>Pendências do modelo <small>CHECKS</small></h3><div class="csub">${esc(D.checks.status)}</div>
      ${pend.concat(anal).slice(0, 7).map(r => `<div class="sumline ${est.papel === 'controladoria' ? 'clic' : ''}" data-ir="${est.papel === 'controladoria' ? 'sis_checks' : ''}"><span class="t">${esc(r[1])}</span><span class="v"><span class="tag ${r[3] === 'PENDENTE' ? 'y' : 'b'}">${esc(typeof r[2] === 'number' && r[2] < 1 && r[2] > 0 ? pc(r[2]) : fmt(r[2], { uni: 'R$' }))}</span></span></div>`).join('')}</div>
  </section>`;
};
POS.inicio = () => document.querySelectorAll('#tela [data-ir]').forEach(b => { if (!b.dataset.ir) return; b.onclick = () => { if (b.dataset.dec) est.f.dec = b.dataset.dec; vai(b.dataset.ir); }; });

function inicioArea() {
  const L = linhasVis(), m = est.per === 'ano' ? null : +est.per;
  const t = { b: soma(L, l => l.b), mo: soma(L, l => l.mo), ge: soma(L, l => l.ge), vf: soma(L, l => l.vf) };
  const porS = {}; L.forEach(l => { const x = porS[l.s] ||= { b: 0, mo: 0, ge: 0, vf: 0, ex: 0, sd: 0, mf: 0 }; x.b += l.b; x.mo += l.mo; x.ge += l.ge; x.vf += l.vf; x.ex += l.aExplicar ? 1 : 0; x.sd += l.semDec ? 1 : 0; x.mf += m == null ? 0 : l.mf[m]; });
  const exp = L.filter(l => l.aExplicar).length;
  return `${cabecalho('Painel da área — ' + esc(escopoTxt()), 'Base 2026 = realizado jul–out/26 anualizado · Modelo = base × inflação (contratos e compras) · Final = decisão da Controladoria por linha.')}
  <section class="kpis">
    <button class="kpi k5" data-ir="mxg"><div class="lab">Base 2026 (anualizada)</div><div class="val">${rsC(t.b)}</div><div class="meta">realizado jul–out/26 × ${D.meta.fator}</div></button>
    <button class="kpi k2" data-ir="mxg"><div class="lab">Projetado pelo modelo</div><div class="val">${rsC(t.mo)}</div><div class="meta">inflação ${pc(D.meta.inflacao_exata, 2)} nas compras</div></button>
    <button class="kpi k3" data-ir="meu"><div class="lab">Orçado pelo gestor</div><div class="val">${rsC(t.ge)}</div><div class="meta"><span class="${cd(t.ge - t.mo, true)}">${pc(div(t.ge - t.mo, t.mo))}</span> sobre o modelo</div></button>
    <button class="kpi"><div class="lab">Final 2027 (decisão)</div><div class="val">${rsC(t.vf)}</div><div class="meta">${exp} conta(s) a explicar · ${L.filter(l => l.semDec).length} sem decisão</div></button>
  </section>
  <div class="tw solta"><table class="t"><thead><tr><th>Área</th><th>Gestor</th><th class="n">Base 2026</th><th class="n">Modelo</th><th class="n">Gestor</th><th class="n">Δ gestor × modelo</th><th class="n">Final 2027</th>${m == null ? '' : `<th class="n hl">Final ${mesTxt(m)}</th>`}<th class="n">A explicar</th><th class="n">Sem decisão</th></tr></thead><tbody>
  ${Object.entries(porS).map(([s, x]) => `<tr><td>${esc(s)}</td><td>${esc(setorDe(s).gestor)}</td>${tdN(x.b)}${tdN(x.mo)}${tdN(x.ge)}<td class="n ${cd(x.ge - x.mo, true)}">${pc(div(x.ge - x.mo, x.mo))}</td>${tdN(x.vf)}${m == null ? '' : tdN(x.mf, { cls: 'hl' })}<td class="n">${x.ex || '–'}</td><td class="n">${x.sd || '–'}</td></tr>`).join('')}
  </tbody></table></div>`;
}
POS.inicio2 = null;

/* ---------------------------------------------------------------- DRE 2027 */
TELAS.dre = () => {
  const modo = est.f.dreModo || 'anual', fat = dreLinha('Faturamento'), m = est.per === 'ano' ? null : +est.per;
  const corpo = D.dre.linhas.map(l => {
    const p = l.t === 'p', v = x => p ? `<td class="n">${pc(x)}</td>` : tdN(x);
    if (modo === 'anual') {
      const dl = l.orc - l.base, dt = l.orc - l.tcp;
      return `<tr class="${l.t}"><td class="fx"><div class="lbl">${esc(l.l)}</div></td>${v(l.base)}${p ? '<td></td>' : tdP(div(l.base, fat.base))}${v(l.orc)}${p ? '<td></td>' : tdP(div(l.orc, fat.orc))}
        ${p ? '<td></td><td></td>' : `<td class="n ${cd(dl)}">${fmt(dl, { sinal: true })}</td><td class="n ${cd(dl)}">${pc(div(dl, Math.abs(l.base)))}</td>`}
        ${v(l.tcp)}${p ? '<td></td>' : tdP(div(l.tcp, fat.tcp))}${p ? '<td></td>' : `<td class="n ${cd(dt)}">${fmt(dt, { sinal: true })}</td>`}</tr>`;
    }
    return `<tr class="${l.t}"><td class="fx"><div class="lbl">${esc(l.l)}</div></td>${l.m.map((x, i) => p ? `<td class="n ${i === m ? 'hl' : ''}">${pc(x)}</td>` : tdN(x, { cls: i === m ? 'hl' : '' })).join('')}${v(l.orc)}${p ? '<td></td>' : tdP(div(l.orc, fat.orc))}</tr>`;
  }).join('');
  const cab = modo === 'anual'
    ? `<th class="fx">Linha</th><th class="n">Base 2026</th><th class="n">% fat.</th><th class="n">Orçado 2027</th><th class="n">% fat.</th><th class="n">Δ R$</th><th class="n">Δ %</th><th class="n">Plano TCP 2027</th><th class="n">% fat.</th><th class="n">Δ orçado × TCP</th>`
    : `<th class="fx">Linha</th>${MESES.map((x, i) => `<th class="n ${i === m ? 'hl' : ''}">${x}/27</th>`).join('')}<th class="n">Total 2027</th><th class="n">% fat.</th>`;
  const comp = D.dre.composicao, ct = comp[3] ? comp[3][1] : soma(comp.slice(0, 3), c => c[1]);
  return `${cabecalho('DRE projetada 2027', esc(D.dre.nota), chips('dreModo', [{ v: 'anual', t: 'Anual × base × TCP' }, { v: 'mensal', t: 'Mês a mês' }], modo))}
  <div class="legend"><i><b>Base 2026</b> = realizado jul–out/26 anualizado</i><i><b>Δ</b> verde = melhora o resultado · vermelho = piora</i><i>Valores em ${uniTxt()} · despesa negativa</i></div>
  <div class="tw"><table class="t dre"><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table></div>
  <div class="card"><h3>Composição das despesas projetadas 2027 pela decisão por linha</h3><div class="csub">Clique numa decisão para ver as linhas.</div>
   ${comp.map((c, i) => `<div class="sumline ${i < 3 ? 'clic' : 'big'}" ${i < 3 ? `data-dec="${['GESTOR', 'MODELO', 'OUTRO'][i]}"` : ''}><span class="t">${esc(c[0])}</span><span class="v">${fmt(c[1])}<small>${c[2] ? pc(c[2]) : pc(div(c[1], ct))}</small></span></div>`).join('')}</div>`;
};
POS.dre = () => { ligaChips('dreModo'); document.querySelectorAll('#tela [data-dec]').forEach(b => b.onclick = () => { est.f.dec = b.dataset.dec; vai('decisoes'); }); };

/* ---------------------------------------------------------------- DRE TCP */
TELAS.dre_tcp = () => {
  const m = est.per === 'ano' ? null : +est.per, fechados = est.f.tcpFech || {};
  let sec = '';
  const corpo = D.dre_tcp.linhas.map(l => {
    if (l.t === 'h') { sec = l.l; return `<tr class="h" data-sec="${esc(sec)}"><td class="fx" colspan="1"><div class="lbl"><span class="tgl">${fechados[sec] ? '▸' : '▾'}</span>${esc(l.l)}</div></td><td colspan="14"></td></tr>`; }
    const p = l.t === 'p', oc = l.t === 'd' && fechados[sec] ? 'oculta' : '';
    if (l.t === 'c') { const ok = l.m.every(x => Math.abs(x) < 0.01) && Math.abs(l.tot) < 0.01;
      return `<tr class="c"><td class="fx"><div class="lbl">${esc(l.l)}</div></td><td class="n"><span class="ck ${ok ? 'ok' : 'no'}">${ok ? '✓ 0' : fmt(l.tot)}</span></td><td></td>${l.m.map(x => `<td class="n">${Math.abs(x) < 0.01 ? '✓' : fmt(x)}</td>`).join('')}</tr>`; }
    return `<tr class="${l.t} ${oc}" data-de="${esc(sec)}"><td class="fx"><div class="lbl">${esc(l.l)}</div></td>${p ? `<td class="n">${pc(l.tot)}</td><td></td>` : tdN(l.tot) + tdP(l.prl)}${l.m.map((x, i) => p ? `<td class="n ${i === m ? 'hl' : ''}">${pc(x)}</td>` : tdN(x, { cls: i === m ? 'hl' : '' })).join('')}</tr>`;
  }).join('');
  return `${cabecalho('DRE 2027 — estrutura do modelo TCP', esc(D.dre_tcp.nota))}
  <div class="row2" style="grid-template-columns:1fr">
  <div class="tw"><table class="t dre"><thead><tr><th class="fx">Linha</th><th class="n">Total 2027</th><th class="n">% RL</th>${MESES.map((x, i) => `<th class="n ${i === m ? 'hl' : ''}">${x}/27</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table></div></div>
  <div class="card"><h3>Participações usadas para desdobrar receita, impostos e CMV/CPV <small>realizado jul–out/26 no modelo TCP</small></h3>
   <div class="row3" style="gap:0 24px">${D.dre_tcp.participacoes.map(p => `<div class="sumline"><span class="t">${esc(p[0])}</span><span class="v">${pc(p[1], 2)}</span></div>`).join('')}</div></div>`;
};
POS.dre_tcp = () => document.querySelectorAll('#tela tr.h').forEach(tr => tr.onclick = () => {
  const s = tr.dataset.sec; est.f.tcpFech = est.f.tcpFech || {}; est.f.tcpFech[s] = !est.f.tcpFech[s]; desenha(); });

/* ---------------------------------------------------------------- FLUXO DE CAIXA */
TELAS.caixa = () => {
  const m = est.per === 'ano' ? null : +est.per, sf = cxLinha('Saldo final de caixa'), si = cxLinha('Saldo inicial de caixa'), ger = cxLinha('(=) GERAÇÃO DE CAIXA');
  const fco = cxLinha('(=) FLUXO DE CAIXA OPERACIONAL');
  const corpo = D.caixa.linhas.map(l => {
    if (l.t === 'h') return `<tr class="h"><td class="fx"><div class="lbl">${esc(l.l)}</div></td><td colspan="15"></td></tr>`;
    const tc = l.tcp, dt = tc == null ? null : l.tot - tc, tot = l.t === 'sal' ? (l.l.startsWith('Saldo inicial') ? l.m[0] : l.m[11]) : l.tot;
    return `<tr class="${l.t}"><td class="fx"><div class="lbl">${esc(l.l)}</div></td>${tdN(tot)}${tc == null ? '<td class="n">—</td><td></td>' : tdN(tc) + `<td class="n ${cd(dt)}">${fmt(dt, { sinal: true })}</td>`}
      ${l.m.map((x, i) => tdN(x, { cls: i === m ? 'hl' : '' })).join('')}</tr>`;
  }).join('');
  return `${cabecalho('Fluxo de caixa projetado 2027 — método direto', esc(D.caixa.nota))}
  <section class="kpis">
    <div class="kpi k5"><div class="lab">Saldo inicial 01/01/2027</div><div class="val">${rsC(si.m[0])}</div><div class="meta">média dos saldos livres jul–out/26</div></div>
    <div class="kpi ${fco.tot < 0 ? '' : 'k4'}"><div class="lab">Fluxo operacional 2027</div><div class="val ${fco.tot < 0 ? 'down' : 'up'}">${rsC(fco.tot)}</div><div class="meta">geração total ${rsC(ger.tot)}</div></div>
    <div class="kpi k2"><div class="lab">Saldo final dez/27</div><div class="val ${sf.m[11] < 0 ? 'down' : ''}">${rsC(sf.m[11])}</div><div class="meta">${m == null ? '' : 'fim de ' + mesTxt(m) + ': ' + rsC(sf.m[m])}</div></div>
    <div class="kpi k3"><div class="lab">Saldo mínimo do ano</div><div class="val ${D.caixa.saldo_min < 0 ? 'down' : ''}">${rsC(D.caixa.saldo_min)}</div><div class="meta">em ${esc(D.caixa.mes_min)}</div></div>
  </section>
  <div class="card"><h3>Geração de caixa no mês <small>barras</small> × saldo no fim do mês <small>linha azul</small></h3><div class="csub">R$ milhões</div>${grafBarras(ger.m, { linha: sf.m })}</div>
  <div class="tw"><table class="t dre"><thead><tr><th class="fx">Linha</th><th class="n">Total 2027</th><th class="n">Plano TCP 2027</th><th class="n">Δ × TCP</th>${MESES.map((x, i) => `<th class="n ${i === m ? 'hl' : ''}">${x}/27</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table></div>
  ${D.caixa.obs ? `<div class="info">${esc(D.caixa.obs)}</div>` : ''}`;
};

/* ---------------------------------------------------------------- RESUMO POR ÁREA */
const NATS = ['Folha (simulador)', 'Recorrente', 'Não recorrente', 'Gasto comum (sem gestor)', 'Investimento (CAPEX)'];
TELAS.resumo = () => {
  const nat = est.f.nat, todas = linhasVis(), L = todas.filter(l => !nat || l.n === nat), abertos = est.f.resAb || {};
  const g = {}; L.forEach(l => { const x = g[l.gc] ||= { b: 0, mo: 0, ge: 0, vf: 0, rub: {} }; x.b += l.b; x.mo += l.mo; x.ge += l.ge; x.vf += l.vf;
    const r = x.rub[l.r] ||= { b: 0, mo: 0, ge: 0, vf: 0 }; r.b += l.b; r.mo += l.mo; r.ge += l.ge; r.vf += l.vf; });
  const T = { b: soma(L, l => l.b), mo: soma(L, l => l.mo), ge: soma(L, l => l.ge), vf: soma(L, l => l.vf) };
  const ordem = D.setores.map(s => s.s).filter(s => g[s]).concat(Object.keys(g).filter(k => !D.setores.find(s => s.s === k)));
  const lin = (nome, x, sub, k) => `<tr class="${sub ? 'grade-sub' : 'clic'}" ${sub ? '' : `data-area="${esc(k)}"`}><td>${sub ? esc(nome) : `<span class="tgl">${abertos[k] ? '▾' : '▸'}</span> <b>${esc(nome)}</b>`}</td><td>${sub ? '' : esc(setorDe(k).gestor || '')}</td>
    ${tdN(x.b)}${tdP(div(x.b, T.b))}${tdN(x.mo)}${tdN(x.ge)}${tdN(x.vf)}${tdP(div(x.vf, T.vf))}<td class="n ${cd(x.vf - x.b, true)}">${fmt(x.vf - x.b, { sinal: true })}</td><td class="n ${cd(x.vf - x.b, true)}">${pc(div(x.vf - x.b, Math.abs(x.b)))}</td></tr>`;
  const corpo = ordem.map(k => lin(k, g[k], false, k) + (abertos[k] ? Object.entries(g[k].rub).sort((a, b) => a[0].localeCompare(b[0])).map(([r, x]) => lin(r + ' ' + (D.rub[r] || ''), x, true)).join('') : '')).join('');
  const ref = D.ref.modelo_x_gestor_q1.find(r => r[0] === 'TOTAL');
  const confere = !nat && est.papel !== 'diretor' && est.papel !== 'gestor' && ref ? (Math.abs(T.b - ref[2]) < 0.05 && Math.abs(T.mo - ref[3]) < 0.05 && Math.abs(T.ge - ref[4]) < 0.05 && Math.abs(T.vf - ref[5]) < 0.05) : null;
  return `${cabecalho('Resumo por área', 'Despesas orçáveis por área (grupo comparativo): base 2026, modelo, orçado pelo gestor e final pela decisão por linha. Clique numa área para abrir as rubricas.')}
  <section class="kpis">${[{ v: '', t: 'Todas as naturezas' }].concat(NATS.map(n => ({ v: n, t: n }))).map(o => { const LL = todas.filter(l => !o.v || l.n === o.v);
    return `<button class="kpi ${(nat || '') === o.v ? 'sel' : ''} ${o.v ? 'k5' : ''}" data-nat="${esc(o.v)}"><div class="lab">${esc(o.t)}</div><div class="val">${rsC(soma(LL, l => l.vf))}</div><div class="meta">final 2027 · ${pc(div(soma(LL, l => l.vf), soma(todas, l => l.vf)))} · base ${rsC(soma(LL, l => l.b))}</div></button>`; }).join('')}</section>
  <div class="tw solta"><table class="t"><thead><tr><th>Área</th><th>Gestor</th><th class="n">Base 2026</th><th class="n">part.</th><th class="n">Modelo 2027</th><th class="n">Orçado gestor</th><th class="n">Final 2027</th><th class="n">part.</th><th class="n">Δ final − base</th><th class="n">Δ %</th></tr></thead>
   <tbody>${corpo}</tbody><tfoot><tr><td>Total ${nat ? '· ' + esc(nat) : ''}</td><td></td>${tdN(T.b)}<td class="n">100%</td>${tdN(T.mo)}${tdN(T.ge)}${tdN(T.vf)}<td class="n">100%</td><td class="n">${fmt(T.vf - T.b, { sinal: true })}</td><td class="n">${pc(div(T.vf - T.b, T.b))}</td></tr></tfoot></table></div>
  ${confere == null ? '' : confere ? '<div class="ok-box">✓ Total confere com o PT (MODELO_X_GESTOR, quadro 1): base, modelo, gestor e final.</div>' : '<div class="aviso">⚠️ Total diverge do PT — ver Sistema › Checks.</div>'}`;
};
POS.resumo = () => {
  document.querySelectorAll('#tela [data-nat]').forEach(b => b.onclick = () => { est.f.nat = b.dataset.nat || null; desenha(); });
  document.querySelectorAll('#tela tr[data-area]').forEach(tr => tr.onclick = () => { const k = tr.dataset.area; est.f.resAb = est.f.resAb || {}; est.f.resAb[k] = !est.f.resAb[k]; desenha(); });
};

/* ---------------------------------------------------------------- MENSAL */
TELAS.mensal = () => {
  const med = est.f.medMes || 'mf', L = linhasVis(), m = est.per === 'ano' ? null : +est.per, nomes = { mf: 'Final 2027 (decisão)', mg: 'Orçado pelo gestor', mm: 'Projetado pelo modelo' };
  const g = {}; L.forEach(l => { const a = g[l.gc] ||= Array(12).fill(0); l[med].forEach((v, i) => a[i] += v); });
  const tot = Array(12).fill(0); Object.values(g).forEach(a => a.forEach((v, i) => tot[i] += v)); const T = soma(tot);
  const ordem = D.setores.map(s => s.s).filter(s => g[s]);
  const corpo = ordem.map(k => { const a = g[k], t = soma(a); return `<tr><td class="fx">${esc(k)}</td>${a.map((v, i) => tdN(v, { cls: i === m ? 'hl' : '' })).join('')}${tdN(t)}${tdP(div(t, T))}</tr>`; }).join('');
  const todos = est.papel === 'controladoria' || est.papel === 'ceo';
  let conf = '';
  if (todos && med === 'mf') { const ref = D.ref.mensal_final.find(r => r[0] === 'TOTAL'); const ok = ref && ref.slice(1, 13).every((v, i) => Math.abs(v - tot[i]) < 0.05);
    conf = ok ? '<div class="ok-box">✓ Confere com o PT (MENSAL_2027, bloco FINAL) mês a mês.</div>' : '<div class="aviso">⚠️ Diverge do PT (MENSAL_2027) — ver Sistema › Checks.</div>'; }
  return `${cabecalho('Mensal 2027 — área × mês', 'Despesas orçáveis por área e mês. A linha de faturamento é a do cenário escolhido.', chips('medMes', Object.entries(nomes).map(([v, t]) => ({ v, t })), med))}
  <div class="tw"><table class="t"><thead><tr><th class="fx">Área — ${esc(nomes[med])}</th>${MESES.map((x, i) => `<th class="n ${i === m ? 'hl' : ''}">${x}/27</th>`).join('')}<th class="n">Total 2027</th><th class="n">part.</th></tr></thead>
  <tbody>${corpo}</tbody><tfoot>
   <tr><td class="fx">Total</td>${tot.map((v, i) => tdN(v, { cls: i === m ? 'hl' : '' })).join('')}${tdN(T)}<td class="n">100%</td></tr>
  </tfoot></table></div>
  <div class="tw solta"><table class="t"><thead><tr><th class="fx">Referência</th>${MESES.map(x => `<th class="n">${x}/27</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
   <tr><td class="fx">Faturamento (cenário ${esc(D.meta.cenario)})</td>${D.fat.map(v => tdN(v)).join('')}${tdN(soma(D.fat))}</tr>
   ${todos ? `<tr><td class="fx">Despesas ÷ faturamento</td>${tot.map((v, i) => tdP(div(v, D.fat[i]))).join('')}${tdP(div(T, soma(D.fat)))}</tr>` : ''}
  </tbody></table></div>${conf}`;
};
POS.mensal = () => ligaChips('medMes');

/* ---------------------------------------------------------------- CICLO */
TELAS.ciclo = () => {
  const hoje = new Date(), vis = setoresVisiveis();
  const proxI = D.meta.ciclo.findIndex(c => new Date(c[1] + 'T23:59:59') >= hoje);
  const st = {}; D.linhas.forEach(l => { if (!vis.has(l.s)) return; const x = st[l.s] ||= { n: 0, ex: 0, sd: 0, b: 0, mo: 0, ge: 0, vf: 0 };
    x.n++; x.ex += l.aExplicar; x.sd += l.semDec; x.b += l.b; x.mo += l.mo; x.ge += l.ge; x.vf += l.vf; });
  const fase = (s, x) => { const se = setorDe(s);
    if (se.en !== 'S') return ['sem', 'Sem orçamento do gestor — Controladoria orça', 'c'];
    if (x.ge === 0 && x.b > 0) return ['esboco', 'Sem orçado carregado', 'r'];
    if (x.ex > 0) return ['explica', `${x.ex} conta(s) a explicar pelo gestor`, 'r'];
    if (x.sd > 0) return ['decide', `${x.sd} linha(s) aguardando decisão`, 'y'];
    return ['ok', 'Fechado', 'g']; };
  const cols = [['esboco', 'Sem orçado'], ['explica', 'Explicação do gestor'], ['decide', 'Decisão da Controladoria'], ['ok', 'Fechado'], ['sem', 'Controladoria orça']];
  const fz = Object.entries(st).map(([s, x]) => ({ s, x, f: fase(s, x) }));
  return `${cabecalho('Ciclo do orçamento 2027', 'Prazos das diretrizes (09/10/2026) e situação de cada área no fluxo: realizado 2026 → modelo → explicação das variações pelo gestor → decisão por linha da Controladoria → DRE, caixa e resumos.')}
  <div class="linha-tempo">${D.meta.ciclo.map((c, i) => { const d = new Date(c[1] + 'T23:59:59'), dias = Math.ceil((d - hoje) / 864e5);
    return `<div class="marco ${d < hoje ? 'feito' : i === proxI ? 'agora' : ''}"><div class="d">${d.toLocaleDateString('pt-BR')}</div><div class="n">${esc(c[0])}</div><span class="tag ${d < hoje ? 'g' : i === proxI ? 'r' : ''}">${d < hoje ? 'concluído' : dias === 0 ? 'hoje' : 'faltam ' + dias + ' dia(s)'}</span> <span class="tag">${esc(c[2])}</span></div>`; }).join('')}</div>
  <div class="quadro">${cols.map(([k, t]) => { const it = fz.filter(z => z.f[0] === k);
    return `<div class="coluna"><h4><span>${t}</span><span>${it.length}</span></h4>${it.map(z => `<div class="cartao" data-setor="${esc(z.s)}"><b>${esc(z.s)}</b><span>${esc(setorDe(z.s).gestor || '—')} · ${esc(z.f[1])}</span></div>`).join('') || '<div class="vazio">—</div>'}</div>`; }).join('')}</div>
  <div class="tw solta"><table class="t"><thead><tr><th></th><th>Área</th><th>Gestor</th><th>Diretoria</th><th>Entregou</th><th class="n">Linhas</th><th class="n">Base 2026</th><th class="n">Modelo</th><th class="n">Gestor</th><th class="n">Δ %</th><th class="n">A explicar</th><th class="n">Sem decisão</th><th>Situação</th></tr></thead><tbody>
   ${fz.map(({ s, x, f }) => `<tr class="clic" data-setor="${esc(s)}"><td><span class="sem ${f[2]}"></span></td><td>${esc(s)}</td><td>${esc(setorDe(s).gestor)}</td><td>${esc(setorDe(s).dir)}</td><td>${esc(setorDe(s).en)}</td><td class="n">${x.n}</td>${tdN(x.b)}${tdN(x.mo)}${tdN(x.ge)}<td class="n ${cd(x.ge - x.mo, true)}">${pc(div(x.ge - x.mo, x.mo))}</td><td class="n">${x.ex || '–'}</td><td class="n">${x.sd || '–'}</td><td>${esc(f[1])}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="info">Próximo passo do ciclo no app (fase 2): o gestor explica as variações na tela <b>Meu orçamento</b>, a Controladoria decide em <b>Decisões por linha</b>, e cada entrega fica registrada com quem e quando. Nenhum comunicado sai sem ordem do Silvio.</div>`;
};
POS.ciclo = () => document.querySelectorAll('#tela [data-setor]').forEach(b => b.onclick = () => { est.f.mxgSetor = b.dataset.setor; vai('mxg'); });

/* ---------------------------------------------------------------- MEU ORÇAMENTO */
TELAS.meu = () => {
  const vis = [...setoresVisiveis()].filter(s => s !== 'A CLASSIFICAR');
  let s = est.f.meuSetor; if (!vis.includes(s)) s = est.f.meuSetor = (vis.includes(est.escSetor) ? est.escSetor : vis.find(x => D.orcado.some(o => o.s === x)) || vis[0]);
  const O = D.orcado.filter(o => o.s === s), L = D.linhas.filter(l => l.s === s), fil = est.f.meuFil;
  const OO = O.filter(o => !fil || (fil === 'just' ? o.ck === 'FALTA JUSTIFICATIVA' : fil === 'nat' ? o.ck === 'FALTA NATUREZA' : true));
  const tot = Array(12).fill(0); OO.forEach(o => o.m.forEach((v, i) => tot[i] += v));
  const naoOrc = L.filter(l => /^NÃO ORÇADO/.test(l.si));
  const T = { o: soma(O, o => o.tot), b: soma(L, l => l.b), mo: soma(L, l => l.mo) };
  const nj = O.filter(o => o.ck === 'FALTA JUSTIFICATIVA').length, nn = O.filter(o => o.ck === 'FALTA NATUREZA').length;
  const ckTag = c => c === 'OK' ? '<span class="tag g">OK</span>' : c === 'FALTA JUSTIFICATIVA' ? '<span class="tag r">falta justificativa</span>' : c === 'FALTA NATUREZA' ? '<span class="tag y">falta natureza</span>' : `<span class="tag b">${esc(c)}</span>`;
  return `${cabecalho('Meu orçamento — ' + esc(s), `Gestor: <b>${esc(setorDe(s).gestor || '—')}</b> · grade conta × mês com justificativa. Origem atual: arquivo do gestor (V1_Inicial) carregado no PT.`,
    vis.length > 1 ? `<div class="filtros" style="margin-left:auto"><span class="rot">Área</span><select id="meuSetor">${vis.map(x => `<option ${x === s ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>` : '')}
  ${trava('O gestor vai preencher e justificar aqui; a Controladoria vê na hora. Até lá, alterações continuam no PT.')}
  <section class="kpis">
    <button class="kpi ${!fil ? 'sel' : ''}" data-fil=""><div class="lab">Orçado 2027</div><div class="val">${rsC(T.o)}</div><div class="meta">${O.length} linha(s)</div></button>
    <div class="kpi k5"><div class="lab">Base 2026 (anualizada)</div><div class="val">${rsC(T.b)}</div><div class="meta">Δ orçado ${pc(div(T.o - T.b, T.b))}</div></div>
    <div class="kpi k2"><div class="lab">Projetado pelo modelo</div><div class="val">${rsC(T.mo)}</div><div class="meta">Δ orçado ${pc(div(T.o - T.mo, T.mo))}</div></div>
    <button class="kpi k3 ${fil === 'just' ? 'sel' : ''}" data-fil="just"><div class="lab">Falta justificativa</div><div class="val ${nj ? 'down' : ''}">${nj}</div><div class="meta">linha(s) acima do modelo ou sem base</div></button>
    <button class="kpi k3 ${fil === 'nat' ? 'sel' : ''}" data-fil="nat"><div class="lab">Falta natureza</div><div class="val ${nn ? 'warn' : ''}">${nn}</div><div class="meta">conta fora do de-para</div></button>
  </section>
  <div class="tw"><table class="t"><thead><tr><th class="fx">Conta</th><th>Descrição</th><th>Fornecedor</th><th>Rec.</th>${MESES.map(x => `<th class="n ed">${x}</th>`).join('')}<th class="n">Total 2027</th><th class="n">Base 2026 (área × conta)</th><th class="n">Δ %</th><th class="ed">Justificativa do incremento</th><th>Check</th></tr></thead><tbody>
  ${OO.map(o => `<tr><td class="fx nw">${esc(o.c)}</td><td class="w">${esc(o.d)}<br><small style="color:var(--ink3)">${esc(D.contaDesc[o.c] || '')}</small></td><td>${esc(o.f)}</td><td>${esc(o.rec)}</td>${o.m.map(v => tdN(v, { cls: 'ed' })).join('')}${tdN(o.tot)}${tdN(o.bsc)}<td class="n ${cd(o.dl, true)}">${o.dp == null ? '—' : pc(o.dp)}</td><td class="w ed">${esc(o.ju) || '<span style="color:var(--ink3)">—</span>'}</td><td>${ckTag(o.ck)}</td></tr>`).join('') || '<tr><td colspan="21" class="vazio">Nenhuma linha orçada para esta área.</td></tr>'}
  </tbody><tfoot><tr><td class="fx">Total</td><td></td><td></td><td></td>${tot.map(v => tdN(v)).join('')}${tdN(soma(tot))}<td></td><td></td><td></td><td></td></tr></tfoot></table></div>
  ${naoOrc.length ? `<div class="card"><h3>Contas com gasto em 2026 que não foram orçadas <small>${naoOrc.length} conta(s) · base ${rsC(soma(naoOrc, l => l.b))}</small></h3><div class="csub">Confirmar se o gasto deixa de existir em 2027. Clique para ver os lançamentos de 2026.</div>
   <div class="tw solta"><table class="t"><thead><tr><th>Conta</th><th>Descrição</th><th class="n">Base 2026</th><th class="n">Modelo 2027</th><th>Decisão hoje</th></tr></thead><tbody>
   ${naoOrc.map(l => `<tr class="clic" data-lanc="${esc(l.c)}"><td>${esc(l.c)}</td><td>${esc(l.d)}</td>${tdN(l.b)}${tdN(l.mo)}<td>${esc(l.da)} → ${fmt(l.vf)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
};
POS.meu = () => {
  const s = $('meuSetor'); if (s) s.onchange = e => { est.f.meuSetor = e.target.value; desenha(); };
  document.querySelectorAll('#tela [data-fil]').forEach(b => b.onclick = () => { est.f.meuFil = b.dataset.fil || null; desenha(); });
  document.querySelectorAll('#tela [data-lanc]').forEach(tr => tr.onclick = () => abreLancamentos(est.f.meuSetor, tr.dataset.lanc, 'Base 2026 — ' + tr.dataset.lanc));
};

/* ---------------------------------------------------------------- FOLHA 2027 (simulador) — 13/11/2026
   Por DEPARTAMENTO (área) e CONSOLIDADO. "Ver folha analítico": posição a posição — Controladoria e CEO veem tudo, gestores e demais só a
   sua área (no banco: RLS da orc_folha_posicao). Edição → Salvar → PROJETAR FOLHA recalcula no navegador (orcamento_folha.js, mesmas
   regras do PT) e grava a projeção da área; o consolidado soma as áreas. */
const COMP_FOLHA_ORDEM = () => (FOLHA ? FOLHA.P.componentes.map(c => c[0]).concat(FOLHA.P.beneficios.map(b => b.nome)) : []);
const areasFolha = () => { const v = setoresVisiveis(); return Object.keys(FOLHA.P.areas || {}).filter(a => v.has(a)); };
const podeEditarFolha = a => versaoEditavel() && (est.papel === 'controladoria' || (est.papel === 'gestor' && setoresVisiveis().has(a)));
const podeEditarPremissa = () => versaoEditavel() && est.papel === 'controladoria';
function folhaSel() {
  const vis = areasFolha(), a = est.f.flArea && vis.includes(est.f.flArea) ? est.f.flArea : null;
  return { vis, area: a, areas: a ? [a] : vis };
}
async function salvaFolha() {
  if (!FOLHA.sujo.size && !FOLHA.premSuja) return true;
  if (window.ORC_FONTE_LOCAL) { FOLHA.sujo.forEach(id => FOLHA.noBanco.add(id)); FOLHA.sujo.clear(); FOLHA.premSuja = false; avisoFolha('Prévia local: alterações guardadas só nesta tela (no app publicado vão para o banco, com histórico).'); return true; }
  try {
    const campos = ['qtd', 'mes_adm', 'mes_desl', 'tipo_desl', 'mes_promo', 'pct_promo', 'justificativa', 'funcao', 'salario', 'convencao', 'tipo', 'plano'];
    for (const id of FOLHA.sujo) {
      const x = FOLHA.pos.find(p => p.id === id); if (!x) continue;
      if (FOLHA.noBanco.has(id)) {
        const upd = {}; campos.forEach(k => upd[k] = x[k] === '' ? null : x[k]);
        const { error } = await SB.from('orc_folha_posicao').update(upd).eq('versao', est.versao).eq('id', id); if (error) throw error;
      } else {
        const { error } = await SB.from('orc_folha_posicao').insert({ ...x, versao: est.versao }); if (error) throw error;
        FOLHA.noBanco.add(id);
      }
    }
    FOLHA.sujo.clear();
    if (FOLHA.premSuja) { const { error } = await SB.from('orc_folha_premissa').update({ dados: FOLHA.P }).eq('versao', est.versao); if (error) throw error; FOLHA.premSuja = false; }
    avisoFolha('✓ Alterações salvas (com histórico de quem e quando).'); return true;
  } catch (e) { avisoFolha('Não foi possível salvar: ' + (e.message || e), true); return false; }
}
async function projetaFolha() {
  const { areas } = folhaSel(), ed = areas.filter(podeEditarFolha);
  if (!ed.length) { avisoFolha('Seu perfil não projeta esta área (ou a versão está fechada).', true); return; }
  if (!(await salvaFolha())) return;
  const novo = projetarFolha(FOLHA.P, FOLHA.pos, ed);
  FOLHA.proj = FOLHA.proj.filter(r => !ed.includes(r.area)).concat(novo);
  const quem = window.USUARIO_EMAIL || 'prévia', quando = new Date();
  if (!window.ORC_FONTE_LOCAL) {
    try {
      for (const a of ed) { const { error } = await SB.from('orc_folha_projecao').delete().eq('versao', est.versao).eq('area', a); if (error) throw error; }
      const linhas = novo.map(r => ({ versao: est.versao, area: r.area, cenario: r.cenario, componente: r.componente, destino: r.destino, conta: r.conta,
        setor_final: r.setor_final, m: r.m, base: r.base, projetado_por: quem }));
      for (let i = 0; i < linhas.length; i += 500) { const { error } = await SB.from('orc_folha_projecao').insert(linhas.slice(i, i + 500)); if (error) throw error; }
    } catch (e) { avisoFolha('Projeção calculada, mas não gravada: ' + (e.message || e), true); desenha(); return; }
  }
  FOLHA.origem = `${quem} em ${quando.toLocaleString('pt-BR')} (${ed.length === 1 ? ed[0] : ed.length + ' áreas'})`;
  desenha(); avisoFolha(`✓ Folha projetada: ${ed.length === 1 ? ed[0] : ed.length + ' áreas'} — salários, encargos, provisões, benefícios e rescisões recalculados.`);
}
function avisoFolha(txt_, erro) { const el = $('flAviso'); if (el) { el.className = erro ? 'aviso' : 'ok-box'; el.textContent = txt_; el.hidden = false; } }
function proximaVaga(area) {
  const ai = Object.keys(FOLHA.P.areas).indexOf(area) + 1, pre = 'V' + String(ai).padStart(2, '0');
  const n = FOLHA.pos.filter(x => x.id.startsWith(pre)).map(x => +x.id.slice(3) || 0);
  return pre + (Math.max(0, ...n) + 1);
}
TELAS.folha = () => {
  if (!FOLHA) return `${cabecalho('Folha 2027 — simulador', '')}<div class="info">A folha entra com a migração 048 (versões e folha por área) e a carga do PT com o simulador (<b>--folha</b>).</div>`;
  const { vis, area, areas } = folhaSel(), cen = est.f.flCen || 'GESTOR', m = est.per === 'ano' ? null : +est.per;
  const NPJ = FOLHA_NPJ, P = FOLHA.P;
  const rows = FOLHA.proj.filter(r => areas.includes(r.area));
  const somaComp = c => { const o = {}; rows.filter(r => r.cenario === c).forEach(r => { const a = o[r.componente] ||= Array(13).fill(0); r.m.forEach((v, i) => { a[i] += v; a[12] += v; }); }); return o; };
  const CG = somaComp('GESTOR'), CM = somaComp('MODELO'), comp = cen === 'GESTOR' ? CG : CM;
  const tot = (o, semPJ = true) => { const a = Array(12).fill(0); Object.entries(o).forEach(([n, v]) => { if (!semPJ || n !== NPJ) v.slice(0, 12).forEach((x, i) => a[i] += x); }); return a; };
  const tG = tot(CG), tM = tot(CM), totC = cen === 'GESTOR' ? tG : tM;
  const posA = FOLHA.pos.filter(x => areas.includes(x.area));
  const calc = posA.map(x => folhaPosicao(x, P));
  const pes = { fG: Array(12).fill(0), pjG: Array(12).fill(0), fM: Array(12).fill(0), adm: Array(12).fill(0), des: Array(12).fill(0), pro: Array(12).fill(0) };
  calc.forEach(l => { for (let i = 0; i < 12; i++) { if (l.PJ) pes.pjG[i] += l.ativo[i]; else pes.fG[i] += l.ativo[i]; if (!l.PJ) pes.fM[i] += l.BK; }
    const x = l.x; if (+x.mes_adm) pes.adm[x.mes_adm - 1] += +x.qtd || 0; if (+x.mes_desl) pes.des[x.mes_desl - 1]++; if (+x.mes_promo) pes.pro[x.mes_promo - 1]++; });
  const nFolha = posA.filter(x => /^P/.test(x.id)).length, nPJ = posA.filter(x => /^J/.test(x.id)).length;
  const vagas = posA.filter(x => /^V/.test(x.id) && (+x.qtd || 0) > 0 && +x.mes_adm).reduce((s, x) => s + (+x.qtd || 0), 0);
  const orcG = (D.folha && D.folha.resumo || []).filter(r => areas.includes(r[0])).reduce((s, r) => s + (r[5] || 0), 0);
  const pjH = (CG[NPJ] || [])[12] || 0;
  const caixa = folhaCaixa(rows, P);
  const ed = area ? podeEditarFolha(area) : vis.some(podeEditarFolha), anal = est.f.flAnal;
  const pendentes = FOLHA.sujo.size + (FOLHA.premSuja ? 1 : 0);
  const v = versaoAtual();
  let html = `${cabecalho('Folha 2027 — por departamento e consolidado', `MODELO = quadro atual + dissídio + benefícios + sazonalidade · GESTOR = MODELO + admissões, desligamentos e promoções. Versão <b>${esc(v.codigo)}</b> (${esc(v.status)}). Última projeção: <b>${esc(FOLHA.origem)}</b>.`)}
  <div class="filtros"><span class="rot">Departamento</span><select id="flArea"><option value="">Consolidado — ${vis.length} área(s)</option>${vis.map(a => `<option ${a === area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    ${chips('flCen', [{ v: 'GESTOR', t: 'GESTOR' }, { v: 'MODELO', t: 'MODELO' }], cen)}
    <button class="btn" id="flAnal">${anal ? '▾ Ocultar folha analítico' : '▸ Ver folha analítico'}</button>
    ${ed ? `<button class="btn" id="flSalva" ${pendentes ? '' : 'disabled'}>Salvar alterações${pendentes ? ` (${pendentes})` : ''}</button><button class="btn primary" id="flProj">PROJETAR FOLHA — ${esc(area || (vis.length === 1 ? vis[0] : 'todas as áreas'))}</button>` : `<span class="tag">${versaoEditavel() ? 'somente leitura neste perfil' : 'versão fechada — somente leitura'}</span>`}
  </div>
  <div id="flAviso" hidden></div>
  <section class="kpis">
    <div class="kpi k5"><div class="lab">Pessoas na folha</div><div class="val">${nFolha}</div><div class="meta">+ ${nPJ} PJ (provisório) · vagas novas ${vagas} · desligamentos ${soma(pes.des)} · promoções ${soma(pes.pro)}</div></div>
    <button class="kpi ${cen === 'MODELO' ? 'sel' : ''}" data-flcen="MODELO"><div class="lab">Folha 2027 — MODELO</div><div class="val">${rsC(soma(tM))}</div><div class="meta">quadro atual × dissídio · sem honorários PJ</div></button>
    <button class="kpi k2 ${cen === 'GESTOR' ? 'sel' : ''}" data-flcen="GESTOR"><div class="lab">Folha 2027 — GESTOR</div><div class="val">${rsC(soma(tG))}</div><div class="meta">Δ sobre o modelo <span class="${cd(soma(tG) - soma(tM), true)}">${rsC(soma(tG) - soma(tM))}</span></div></button>
    <div class="kpi k3"><div class="lab">Orçado pelo gestor (natureza Folha)</div><div class="val">${rsC(orcG)}</div><div class="meta">Δ sobre o GESTOR <span class="${cd(orcG - soma(tG), true)}">${rsC(orcG - soma(tG))}</span></div></div>
    <div class="kpi k4"><div class="lab">PJ — honorários 2027</div><div class="val">${rsC(pjH)}</div><div class="meta">informativo · conta Assessoria (3120301001)</div></div>
  </section>
  <div class="row2">
    <div class="card"><h3>Folha mensal — ${esc(cen)} <small>barras</small> × ${cen === 'GESTOR' ? 'MODELO' : 'GESTOR'} <small>linha azul</small></h3><div class="csub">R$ milhões · sem honorários PJ · o mês de aplicação traz dissídio, abono e ajuste das provisões</div>
      ${grafBarras(totC, { linha: cen === 'GESTOR' ? tM : tG, cor2: '#C8102E', zero: false, fmtY: x => fmt(x, { uni: 'mi', dec: 2 }) })}</div>
    <div class="tw solta"><table class="t"><thead><tr><th>Pessoas e movimentações</th>${MESES.map(x => `<th class="n">${x}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Folha — GESTOR</td>${pes.fG.map(x => `<td class="n">${fmt(x, { uni: 'R$' })}</td>`).join('')}</tr>
      <tr><td>PJ — GESTOR</td>${pes.pjG.map(x => `<td class="n">${fmt(x, { uni: 'R$' })}</td>`).join('')}</tr>
      <tr><td>Folha — MODELO</td>${pes.fM.map(x => `<td class="n">${fmt(x, { uni: 'R$' })}</td>`).join('')}</tr>
      <tr><td>Admissões (pessoas)</td>${pes.adm.map(x => `<td class="n">${x || '–'}</td>`).join('')}</tr>
      <tr><td>Desligamentos</td>${pes.des.map(x => `<td class="n">${x || '–'}</td>`).join('')}</tr>
      <tr><td>Promoções</td>${pes.pro.map(x => `<td class="n">${x || '–'}</td>`).join('')}</tr></tbody></table></div>
  </div>
  <div class="tw solta"><table class="t"><thead><tr><th class="fx">Componente — ${esc(cen)}</th>${MESES.map((x, i) => `<th class="n ${i === m ? 'hl' : ''}">${x}/27</th>`).join('')}<th class="n">Total 2027</th><th class="n">part.</th><th class="n">${cen === 'GESTOR' ? 'MODELO' : 'GESTOR'}</th><th class="n">Δ</th></tr></thead><tbody>
    ${COMP_FOLHA_ORDEM().filter(n => (comp[n] || []).some(x => Math.abs(x) > 0.5) || ((cen === 'GESTOR' ? CM : CG)[n] || []).some(x => Math.abs(x) > 0.5)).map(n => { const a = comp[n] || Array(13).fill(0), o = (cen === 'GESTOR' ? CM : CG)[n] || Array(13).fill(0), pj = n === NPJ;
      return `<tr ${pj ? 'style="color:var(--ink3);font-style:italic"' : ''}><td class="fx">${esc(n)}</td>${a.slice(0, 12).map((x, i) => tdN(x, { cls: i === m ? 'hl' : '' })).join('')}${tdN(a[12])}${pj ? '<td class="n">—</td>' : tdP(div(a[12], soma(totC)))}${tdN(o[12])}<td class="n ${cd(a[12] - o[12], true)}">${fmt(a[12] - o[12], { sinal: true })}</td></tr>`; }).join('')}
  </tbody><tfoot><tr><td class="fx">Total da folha (sem PJ)</td>${totC.map((x, i) => tdN(x, { cls: i === m ? 'hl' : '' })).join('')}${tdN(soma(totC))}<td class="n">100%</td>${tdN(soma(cen === 'GESTOR' ? tM : tG))}<td class="n">${fmt(soma(totC) - soma(cen === 'GESTOR' ? tM : tG), { sinal: true })}</td></tr></tfoot></table></div>`;
  if (!area) {   // consolidado: uma linha por área
    html += `<div class="tw solta"><table class="t"><thead><tr><th>Área</th><th class="n">Pessoas</th><th class="n">PJ</th><th class="n">MODELO 2027</th><th class="n">GESTOR 2027</th><th class="n">part.</th><th class="n">Δ GESTOR − MODELO</th><th class="n">Orçado pelo gestor</th><th class="n">PJ honorários</th></tr></thead><tbody>
    ${vis.map(a => { const r = FOLHA.proj.filter(x => x.area === a), s = (c, pj) => r.filter(x => x.cenario === c && (pj ? x.componente === NPJ : x.componente !== NPJ)).reduce((t_, x) => t_ + soma(x.m), 0);
      const o = ((D.folha && D.folha.resumo) || []).find(x => x[0] === a); const pa = FOLHA.pos.filter(x => x.area === a);
      return `<tr class="clic" data-flarea="${esc(a)}"><td>${esc(a)}</td><td class="n">${pa.filter(x => /^P/.test(x.id)).length || '–'}</td><td class="n">${pa.filter(x => /^J/.test(x.id)).length || '–'}</td>${tdN(s('MODELO'))}${tdN(s('GESTOR'))}${tdP(div(s('GESTOR'), soma(tG)))}<td class="n ${cd(s('GESTOR') - s('MODELO'), true)}">${fmt(s('GESTOR') - s('MODELO'), { sinal: true })}</td>${tdN(o ? o[5] : 0)}${tdN(s('GESTOR', true))}</tr>`; }).join('')}
    </tbody><tfoot><tr><td>Total</td><td class="n">${nFolha}</td><td class="n">${nPJ}</td>${tdN(soma(tM))}${tdN(soma(tG))}<td class="n">100%</td><td class="n">${fmt(soma(tG) - soma(tM), { sinal: true })}</td>${tdN(orcG)}${tdN(pjH)}</tr></tfoot></table></div>`;
  }
  if (anal) {
    const lst = posA.slice().sort((a, b) => a.area.localeCompare(b.area) || a.id.localeCompare(b.id));
    const sel = (id, k, ops, v_, dis) => `<select data-fid="${esc(id)}" data-fk="${k}" ${dis ? 'disabled' : ''}><option value=""></option>${ops.map(o => `<option ${String(v_ ?? '') === String(o) ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    const inp = (id, k, v_, dis, w = 70, tp = 'number') => `<input type="${tp}" data-fid="${esc(id)}" data-fk="${k}" value="${esc(v_ ?? '')}" ${dis ? 'disabled' : ''} style="width:${w}px">`;
    html += `<div class="card"><h3>Folha analítica — ${esc(area || 'todas as áreas visíveis')} <small>${lst.length} linha(s) · ID anônimo</small></h3>
      <div class="csub">Controladoria e CEO veem todas as áreas; gestores e demais só a sua (trava no banco). Amarelo = movimentação (gestor da área e Controladoria); salário, função, convenção, tipo e plano de posição existente: só Controladoria. Depois de alterar: <b>Salvar</b> e <b>PROJETAR FOLHA</b>.</div>
      ${area && podeEditarFolha(area) ? `<button class="btn" id="flVaga">+ Vaga nova em ${esc(area)}</button>` : ''}
      <div class="tw" style="margin-top:8px"><table class="t" id="flTab"><thead><tr><th class="fx">ID</th><th>Área</th><th>Função</th><th>Tipo</th><th>Conv.</th><th>Admissão</th><th class="n">Salário</th><th class="n">Adicionais</th><th>Plano</th><th>Afast.</th>
        <th class="ed">Qtd</th><th class="ed">Mês admissão</th><th class="ed">Mês desligamento</th><th class="ed">Tipo de desligamento</th><th class="ed">Mês promoção</th><th class="ed">% promoção</th><th class="ed">Justificativa</th></tr></thead><tbody>
      ${lst.map(x => { const e = podeEditarFolha(x.area), vg = /^V/.test(x.id), ctl = est.papel === 'controladoria' && e, cad = e && (vg || ctl);
        return `<tr ${FOLHA.sujo.has(x.id) ? 'style="background:#FFF7E6"' : ''}><td class="fx nw"><b>${esc(x.id)}</b></td><td class="nw">${esc(x.area)}</td>
          <td>${cad ? inp(x.id, 'funcao', x.funcao, false, 180, 'text') : esc(x.funcao || '')}</td>
          <td>${cad ? sel(x.id, 'tipo', ['CLT', 'APRENDIZ', 'ESTAGIÁRIO', 'PJ'], x.tipo) : esc(x.tipo)}</td>
          <td>${cad ? sel(x.id, 'convencao', ['BA', 'SP', 'SEM BENEFÍCIO'], x.convencao) : esc(x.convencao)}</td><td>${esc(x.admissao || '')}</td>
          <td class="n">${cad ? inp(x.id, 'salario', x.salario, false, 90) : fmt(+x.salario, { uni: 'R$', dec: 2 })}</td>${tdN(+x.adicional, { uni: 'R$', dec: 2 })}
          <td>${cad ? sel(x.id, 'plano', ['S', 'N'], x.plano) : esc(x.plano)}</td><td>${esc(x.afastado)}</td>
          <td class="ed">${inp(x.id, 'qtd', x.qtd, !e, 55)}</td><td class="ed">${inp(x.id, 'mes_adm', x.mes_adm, !e, 55)}</td><td class="ed">${inp(x.id, 'mes_desl', x.mes_desl, !e, 55)}</td>
          <td class="ed">${sel(x.id, 'tipo_desl', ['SEM JUSTA CAUSA', 'PEDIDO', 'ACORDO'], x.tipo_desl, !e)}</td><td class="ed">${inp(x.id, 'mes_promo', x.mes_promo, !e, 55)}</td>
          <td class="ed">${inp(x.id, 'pct_promo', x.pct_promo == null ? '' : +(x.pct_promo * 100).toFixed(2), !e, 60)}</td><td class="ed">${inp(x.id, 'justificativa', x.justificativa, !e, 200, 'text')}</td></tr>`; }).join('')}
      </tbody></table></div><div class="csub">% promoção em pontos percentuais (10 = 10%). Mês = 1 a 12.</div></div>`;
  }
  const pe = podeEditarPremissa(), pin = (path, v_, w = 70, tp = 'number') => `<input type="${tp}" data-fp="${path}" value="${esc(v_ ?? '')}" ${pe ? '' : 'disabled'} style="width:${w}px">`;
  const ROT = { inss: 'INSS patronal', terceiros: 'Outras entidades (terceiros)', rat: 'RAT/SAT', fgts: 'FGTS', fgts_apr: 'FGTS do aprendiz', prov_fer: 'Provisão de férias (1/12 × 4/3)',
    prov_13: 'Provisão de 13º (1/12)', enc_prov: 'Encargos sobre provisões (S/N)', meses_fer: 'Meses médios de férias em aberto', inss_pl: 'INSS sobre pró-labore',
    enc_abono: 'Encargos sobre o abono (S/N) — testado: N', aviso_base: 'Aviso prévio — dias base', aviso_ano: 'Aviso — dias por ano', aviso_max: 'Aviso — máximo de dias',
    multa_sjc: 'Multa FGTS sem justa causa', multa_acordo: 'Multa FGTS no acordo', aviso_acordo: 'Aviso no acordo (fração)', p13_mes1: 'Caixa: mês da 1ª parcela do 13º',
    p13_pct1: 'Caixa: % na 1ª parcela', p13_mes2: 'Caixa: mês da 2ª parcela do 13º' };
  html += `<div class="row2">
    <div class="card"><h3>Dissídio 2027 por convenção ${pe ? '' : '<small>leitura</small>'}</h3><div class="csub">Entra no mês de APLICAÇÃO; o atraso desde a data-base é compensado por ABONO (sem encargos — testado na folha), RETROATIVO (com encargos) ou NENHUMA.</div>
      <div class="tw solta"><table class="t"><thead><tr><th>Convenção</th><th class="ed">% dissídio</th><th class="ed">Mês data-base</th><th class="ed">Mês aplicação</th><th class="ed">Compensação</th><th class="n">Atraso</th></tr></thead><tbody>
      ${P.dissidio.map((d, i) => `<tr><td><b>${esc(d.conv)}</b></td><td class="ed">${pin(`dissidio.${i}.pct%`, +(d.pct * 100).toFixed(4))}</td><td class="ed">${pin(`dissidio.${i}.db`, d.db, 55)}</td><td class="ed">${pin(`dissidio.${i}.ap`, d.ap, 55)}</td>
        <td class="ed"><select data-fp="dissidio.${i}.comp" ${pe ? '' : 'disabled'}>${['ABONO', 'RETROATIVO', 'NENHUMA'].map(o => `<option ${o === d.comp ? 'selected' : ''}>${o}</option>`).join('')}</select></td><td class="n">${Math.max(0, d.ap - d.db)}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card"><h3>Encargos, provisões, rescisão e caixa</h3><div class="tw solta" style="max-height:330px"><table class="t"><tbody>
      ${Object.entries(P.p).map(([k, v_]) => `<tr><td>${esc(ROT[k] || k)}</td><td class="ed n">${typeof v_ === 'string' ? `<select data-fp="p.${k}" ${pe ? '' : 'disabled'}><option ${v_ === 'S' ? 'selected' : ''}>S</option><option ${v_ === 'N' ? 'selected' : ''}>N</option></select>` : pin(`p.${k}${v_ > 0 && v_ < 1 ? '%' : ''}`, v_ > 0 && v_ < 1 ? +(v_ * 100).toFixed(4) : v_)}</td></tr>`).join('')}
    </tbody></table></div><div class="csub">percentuais em pontos (20 = 20%)</div></div>
  </div>
  <div class="tw solta"><table class="t"><thead><tr><th>Benefício</th><th class="ed n">R$/pessoa/mês</th><th class="ed n">Reajuste %</th><th class="ed n">Mês</th><th>Quem</th><th>Convenção</th><th>Conta</th></tr></thead><tbody>
    ${P.beneficios.map((b, i) => `<tr><td>${esc(b.nome)}</td><td class="ed">${pin(`beneficios.${i}.valor`, +(+b.valor).toFixed(2), 90)}</td><td class="ed">${pin(`beneficios.${i}.reaj%`, +(b.reaj * 100).toFixed(2), 60)}</td><td class="ed">${pin(`beneficios.${i}.mes`, b.mes > 12 ? '' : b.mes, 50)}</td><td>${esc(b.quem)}</td><td>${esc(b.conv)}</td><td>${esc(b.conta)}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="card"><h3>Efeito de caixa — 13º e férias <small>cenário MODELO · R$ mil</small></h3><div class="tw solta"><table class="t"><thead><tr><th>Linha</th>${MESES.map(x => `<th class="n">${x}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
    ${caixa.map(([n, a], i) => `<tr ${i === 4 ? 'style="font-weight:700"' : ''}><td class="nw">${esc(n)}</td>${a.map(x => tdN(x, { uni: 'mil', dec: 0 })).join('')}${tdN(soma(a), { uni: 'mil', dec: 0 })}</tr>`).join('')}</tbody></table></div></div>`;
  if ((est.papel === 'controladoria' || est.papel === 'ceo') && D.folha && D.folha.calibracao) {
    const F_ = D.folha, calSt = est.f.flCal || null, cal = F_.calibracao.filter(c => !calSt || c[7] === calSt), calCont = {}; F_.calibracao.forEach(c => calCont[c[7]] = (calCont[c[7]] || 0) + 1);
    html += `<div class="card"><h3>Calibração — mês-base × realizado <small>da carga do PT · por setor final × conta (R$/mês)</small></h3><div class="csub">Δ relevante = premissa a revisar ou evento do realizado (rescisão, estorno). Benefícios dos PJ entram quando a lista oficial chegar.</div>
      <div class="filtros"><span class="rot">Situação</span>${chips('flCal', Object.entries(calCont).map(([s, n]) => ({ v: s, t: esc(s) + `<small>${n}</small>` })), calSt)}</div>
      <div class="tw solta" style="max-height:380px"><table class="t"><thead><tr><th>Setor final</th><th>Conta</th><th>Descrição</th><th class="n">Simulado</th><th class="n">Realizado médio jul–out</th><th class="n">Δ</th><th class="n">Δ %</th><th>Situação</th></tr></thead><tbody>
      ${cal.map(c => `<tr><td>${esc(c[0])}</td><td>${esc(c[1])}</td><td>${esc(c[2])}</td>${tdN(c[3])}${tdN(c[4])}<td class="n ${cd(c[5], true)}">${fmt(c[5], { sinal: true })}</td><td class="n">${pc(c[6], 0)}</td><td><span class="tag ${c[7] === 'OK' ? 'g' : c[7] === 'ANALISAR' ? 'r' : c[7] === '—' ? '' : 'y'}">${esc(c[7])}</span></td></tr>`).join('')}
      </tbody></table></div></div>`;
  }
  return html;
};
POS.folha = () => {
  const ar = $('flArea'); if (ar) ar.onchange = e => { est.f.flArea = e.target.value || null; desenha(); };
  ligaChips('flCen'); ligaChips('flCal');
  document.querySelectorAll('#tela [data-flcen]').forEach(b => b.onclick = () => { est.f.flCen = b.dataset.flcen; desenha(); });
  document.querySelectorAll('#tela [data-flarea]').forEach(tr => tr.onclick = () => { est.f.flArea = tr.dataset.flarea; desenha(); });
  const an = $('flAnal'); if (an) an.onclick = () => { est.f.flAnal = !est.f.flAnal; desenha(); };
  const sv = $('flSalva'); if (sv) sv.onclick = async () => { await salvaFolha(); desenha(); };
  const pj = $('flProj'); if (pj) pj.onclick = async () => { pj.disabled = true; pj.textContent = 'Projetando…'; await projetaFolha(); };
  const vg = $('flVaga'); if (vg) vg.onclick = () => { const a = est.f.flArea, id = proximaVaga(a);
    FOLHA.pos.push({ id, area: a, funcao: '', filial: '', convencao: 'BA', tipo: 'CLT', admissao: '', meses_casa: 0, salario: 0, adicional: 0, plano: 'S', he_media: 0, afastado: 'N', qtd: 1, mes_adm: 1 });
    FOLHA.sujo.add(id); desenha(); };
  const marca = () => { const n = FOLHA.sujo.size + (FOLHA.premSuja ? 1 : 0), b = $('flSalva'); if (b) { b.disabled = !n; b.textContent = 'Salvar alterações' + (n ? ` (${n})` : ''); } };
  document.querySelectorAll('#tela [data-fid]').forEach(el => el.onchange = () => {
    const x = FOLHA.pos.find(p => p.id === el.dataset.fid), k = el.dataset.fk; let v = el.value;
    if (['qtd', 'salario', 'mes_adm', 'mes_desl', 'mes_promo'].includes(k)) v = v === '' ? null : +v;
    if (k === 'pct_promo') v = v === '' ? null : +v / 100;
    if (['mes_adm', 'mes_desl', 'mes_promo'].includes(k) && v != null && (v < 1 || v > 12)) { el.value = ''; v = null; }
    x[k] = v === '' ? null : v; FOLHA.sujo.add(x.id); el.closest('tr').style.background = '#FFF7E6'; marca();
  });
  document.querySelectorAll('#tela [data-fp]').forEach(el => el.onchange = () => {
    let path = el.dataset.fp, pct = path.endsWith('%'); if (pct) path = path.slice(0, -1);
    const ks = path.split('.'); let o = FOLHA.P; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    const k = ks[ks.length - 1], v = el.tagName === 'SELECT' ? el.value : (el.value === '' ? (k === 'mes' ? 13 : 0) : (pct ? +el.value / 100 : +el.value));
    o[k] = v; if (path.startsWith('dissidio')) { const d = FOLHA.P.dissidio[+ks[1]]; d.atraso = Math.max(0, (+d.ap || 0) - (+d.db || 0)); }
    FOLHA.premSuja = true; marca();
  });
};

/* ---------------------------------------------------------------- MODELO × GESTOR */
const SITS = ['ACIMA DA INFLAÇÃO — EXPLICAR', 'SEM HISTÓRICO NA BASE — EXPLICAR', 'HISTÓRICO NO CC, BASE EM OUTRA ÁREA — EXPLICAR', 'NÃO ORÇADO PELO GESTOR — confirmar', 'OK — dentro da inflação', 'SETOR SEM ORÇAMENTO — vale o modelo', 'FORA DA JANELA — modelo 0 (gasto deixou de existir)'];
const sitTag = s => /EXPLICAR/.test(s) ? `<span class="tag r">${esc(s)}</span>` : /^NÃO ORÇADO/.test(s) ? `<span class="tag y">${esc(s)}</span>` : /^OK/.test(s) ? `<span class="tag g">${esc(s)}</span>` : `<span class="tag">${esc(s)}</span>`;
TELAS.mxg = () => {
  const vis = setoresVisiveis(), Lv = D.linhas.filter(l => vis.has(l.s)), sel = est.f.mxgSetor && vis.has(est.f.mxgSetor) ? est.f.mxgSetor : null, sits = est.f.mxgSit || [];
  const q1 = {}; Lv.forEach(l => { const x = q1[l.s] ||= { b: 0, mo: 0, ge: 0, vf: 0, ex: 0, sd: 0 }; x.b += l.b; x.mo += l.mo; x.ge += l.ge; x.vf += l.vf; x.ex += l.aExplicar; x.sd += l.semDec; });
  const T = { b: soma(Lv, l => l.b), mo: soma(Lv, l => l.mo), ge: soma(Lv, l => l.ge), vf: soma(Lv, l => l.vf) };
  let L = Lv.filter(l => (!sel || l.s === sel) && (!sits.length || sits.includes(l.si)));
  L = L.slice().sort((a, b) => Math.abs(b.dg) - Math.abs(a.dg));
  const lim = est.f.mxgTodas ? L.length : 300;
  const cont = {}; Lv.filter(l => !sel || l.s === sel).forEach(l => cont[l.si] = (cont[l.si] || 0) + 1);
  return `${cabecalho('Projetado pelo modelo × projetado pelo gestor', `Modelo = base 2026 × (1 + inflação ${pc(D.meta.inflacao_exata, 2)}) nas contas de compra; folha, comissões, tributos, provisões e financeiro sem reajuste. Tolerância sem explicação: ${pc(D.meta.tolerancia, 2)}. Clique numa área para filtrar; numa linha para abrir os lançamentos de 2026.`)}
  <div class="tw solta" style="max-height:360px"><table class="t"><thead><tr><th>Quadro 1 — área</th><th>Entregou</th><th class="n">Base 2026</th><th class="n">Modelo</th><th class="n">Gestor</th><th class="n">Δ gestor − modelo</th><th class="n">Δ %</th><th class="n">A explicar</th><th class="n">Final 2027</th><th class="n">Δ final − modelo</th><th class="n">Sem decisão</th></tr></thead><tbody>
  ${Object.entries(q1).map(([s, x]) => `<tr class="clic ${s === sel ? 'hl' : ''}" data-q1="${esc(s)}"><td class="${s === sel ? 'hl' : ''}"><b>${esc(s)}</b></td><td>${esc(setorDe(s).en)}</td>${tdN(x.b)}${tdN(x.mo)}${tdN(x.ge)}<td class="n ${cd(x.ge - x.mo, true)}">${fmt(x.ge - x.mo, { sinal: true })}</td><td class="n ${cd(x.ge - x.mo, true)}">${pc(div(x.ge - x.mo, x.mo))}</td><td class="n">${x.ex || '–'}</td>${tdN(x.vf)}<td class="n ${cd(x.vf - x.mo, true)}">${fmt(x.vf - x.mo, { sinal: true })}</td><td class="n">${x.sd || '–'}</td></tr>`).join('')}
  </tbody><tfoot><tr><td>Total</td><td></td>${tdN(T.b)}${tdN(T.mo)}${tdN(T.ge)}<td class="n">${fmt(T.ge - T.mo, { sinal: true })}</td><td class="n">${pc(div(T.ge - T.mo, T.mo))}</td><td class="n">${Lv.filter(l => l.aExplicar).length}</td>${tdN(T.vf)}<td class="n">${fmt(T.vf - T.mo, { sinal: true })}</td><td class="n">${Lv.filter(l => l.semDec).length}</td></tr></tfoot></table></div>
  <div class="filtros"><span class="rot">Situação</span>${chips('mxgSit', SITS.map(s => ({ v: s, t: esc(s.replace(/ — .*/, '')) + `<small>${cont[s] || 0}</small>` })), sits, true)}
   ${sel ? `<span class="chip on" id="limpaSel">Área: ${esc(sel)} ✕</span>` : ''}<span class="rot" style="margin-left:auto">${L.length} linha(s)</span></div>
  <div class="tw"><table class="t"><thead><tr><th class="fx">Área · conta</th><th>Descrição</th><th>Rub.</th><th class="n">Base 2026</th><th class="n">Reaj.</th><th class="n">Modelo</th><th class="n">Gestor</th><th class="n">Δ</th><th class="n">Δ %</th><th>Situação</th><th class="ed">Explicação do gestor</th><th>Decisão</th><th class="n">Final 2027</th></tr></thead><tbody>
  ${L.slice(0, lim).map(l => `<tr class="clic" data-s="${esc(l.s)}" data-c="${esc(l.c)}"><td class="fx nw"><small style="color:var(--ink3)">${esc(l.s)}</small><br>${esc(l.c)}</td><td class="w">${esc(l.d)}</td><td>${esc(l.r)}</td>${tdN(l.b)}<td class="n">${l.pa ? pc(l.pa) : '–'}</td>${tdN(l.mo)}${tdN(l.ge)}<td class="n ${cd(l.dg, true)}">${fmt(l.dg, { sinal: true })}</td><td class="n ${cd(l.dg, true)}">${l.dp == null ? '—' : pc(l.dp)}</td><td>${sitTag(l.si)}</td><td class="w ed">${esc(l.ex) || '<span style="color:var(--ink3)">—</span>'}</td><td class="nw">${esc(l.da)}${l.semDec ? ' <span class="tag y">padrão</span>' : ''}</td>${tdN(l.vf)}</tr>`).join('')}
  </tbody></table></div>${L.length > lim ? `<button class="btn" id="mxgTodas">Mostrar as ${L.length} linhas</button>` : ''}`;
};
POS.mxg = () => {
  ligaChips('mxgSit', null, true);
  document.querySelectorAll('#tela [data-q1]').forEach(tr => tr.onclick = () => { est.f.mxgSetor = est.f.mxgSetor === tr.dataset.q1 ? null : tr.dataset.q1; desenha(); });
  const ls = $('limpaSel'); if (ls) ls.onclick = () => { est.f.mxgSetor = null; desenha(); };
  const mt = $('mxgTodas'); if (mt) mt.onclick = () => { est.f.mxgTodas = true; desenha(); };
  document.querySelectorAll('#tela tr[data-c]').forEach(tr => tr.onclick = () => abreLancamentos(tr.dataset.s, tr.dataset.c, tr.dataset.s + ' · ' + tr.dataset.c));
};

/* ---------------------------------------------------------------- DECISÕES POR LINHA */
TELAS.decisoes = () => {
  const Lv = linhasVis(), dec = est.f.dec, stf = est.f.decSt;
  const L = Lv.filter(l => (!dec || l.da === dec) && (!stf || (stf === 'pad' ? l.semDec : stf === 'dec' ? !l.semDec && l.st !== '—' : l.st === '—')));
  const lim = est.f.decTodas ? L.length : 300, ro = PAPEIS[est.papel].ro;
  const card = (k, t, cls) => { const LL = Lv.filter(l => l.da === k); return `<button class="kpi ${cls} ${dec === k ? 'sel' : ''}" data-dec="${k}"><div class="lab">Decisão ${t}</div><div class="val">${rsC(soma(LL, l => l.vf))}</div><div class="meta">${LL.length} linha(s) · ${pc(div(soma(LL, l => l.vf), soma(Lv, l => l.vf)))} do final</div></button>`; };
  return `${cabecalho('Decisões por linha (área × conta)', 'A Controladoria decide em cada linha qual número vale para 2027: GESTOR (orçado), MODELO (base × inflação ou % do faturamento) ou OUTRO (valor definido pela Controladoria). A decisão alimenta a Projeção final, a DRE, a DRE TCP, o caixa e os resumos.')}
  ${trava('A coluna Decisão, o Valor outro e o Comentário viram campos editáveis (só Controladoria), com histórico. Hoje: padrão do PT — GESTOR se a área entregou, MODELO se não entregou ou se a conta é por % do faturamento.')}
  <section class="kpis">${card('GESTOR', 'GESTOR', '')}${card('MODELO', 'MODELO', 'k2')}${card('OUTRO', 'OUTRO', 'k3')}
   <button class="kpi k5 ${stf === 'pad' ? 'sel' : ''}" data-st="pad"><div class="lab">Sem decisão (padrão)</div><div class="val warn">${Lv.filter(l => l.semDec).length}</div><div class="meta">linhas usando o padrão do PT</div></button></section>
  <div class="tw"><table class="t"><thead><tr><th class="fx">Área · conta</th><th>Descrição</th><th>Método</th><th class="n">Modelo</th><th class="n">Gestor</th><th>Explicação do gestor</th><th class="ed">Decisão</th><th class="n ed">Valor outro</th><th>Aplicada</th><th class="n">Valor final</th><th class="n">Δ final − modelo</th><th>Status</th><th class="ed">Comentário da Controladoria</th></tr></thead><tbody>
  ${L.slice(0, lim).map(l => `<tr><td class="fx nw"><small style="color:var(--ink3)">${esc(l.s)}</small><br>${esc(l.c)}</td><td class="w">${esc(l.d)}</td><td class="nw">${esc(l.me)}</td>${tdN(l.mo)}${tdN(l.ge)}<td class="w">${esc(l.ex) || '—'}</td>
    <td class="ed"><select disabled title="Edição na fase 2"><option>${esc(l.de || '(padrão)')}</option>${ro ? '' : '<option>GESTOR</option><option>MODELO</option><option>OUTRO</option>'}</select></td><td class="n ed">${l.vo == null ? '—' : fmt(l.vo)}</td><td>${esc(l.da)}</td>${tdN(l.vf)}<td class="n ${cd(l.dfm, true)}">${fmt(l.dfm, { sinal: true })}</td><td class="nw">${l.semDec ? '<span class="tag y">a decidir</span>' : esc(l.st)}</td><td class="w ed">${esc(l.co) || '—'}</td></tr>`).join('')}
  </tbody><tfoot><tr><td class="fx">Total (${L.length})</td><td></td><td></td>${tdN(soma(L, l => l.mo))}${tdN(soma(L, l => l.ge))}<td></td><td></td><td></td><td></td>${tdN(soma(L, l => l.vf))}<td class="n">${fmt(soma(L, l => l.dfm), { sinal: true })}</td><td></td><td></td></tr></tfoot></table></div>
  ${L.length > lim ? `<button class="btn" id="decTodas">Mostrar as ${L.length} linhas</button>` : ''}`;
};
POS.decisoes = () => {
  document.querySelectorAll('#tela [data-dec]').forEach(b => b.onclick = () => { est.f.dec = est.f.dec === b.dataset.dec ? null : b.dataset.dec; desenha(); });
  document.querySelectorAll('#tela [data-st]').forEach(b => b.onclick = () => { est.f.decSt = est.f.decSt === b.dataset.st ? null : b.dataset.st; desenha(); });
  const t = $('decTodas'); if (t) t.onclick = () => { est.f.decTodas = true; desenha(); };
};

/* ---------------------------------------------------------------- PROJEÇÃO FINAL */
TELAS.projecao = () => {
  const vis = [...setoresVisiveis()], m = est.per === 'ano' ? null : +est.per, fs = est.f.pjSetor || '', fl = est.f.pjLinha || '', zer = est.f.pjZer;
  const Lv = linhasVis(), linhasDre = [...new Set(Lv.map(l => l.ld))].filter(Boolean).sort();
  const L = Lv.filter(l => (!fs || l.s === fs) && (!fl || l.ld === fl) && (zer || Math.abs(l.vf) > 0.005 || l.mf.some(v => Math.abs(v) > 0.005)));
  const tot = Array(12).fill(0); L.forEach(l => l.mf.forEach((v, i) => tot[i] += v));
  return `${cabecalho('Projeção final 2027 — área × conta × mês', 'GESTOR = meses do orçado · MODELO = meses da projeção inercial · OUTRO = valor da Controladoria repartido pela curva. É a fonte da DRE, da DRE TCP e do caixa.')}
  <div class="filtros"><span class="rot">Área</span><select id="pjSetor"><option value="">Todas</option>${vis.filter(s => Lv.some(l => l.s === s)).map(s => `<option ${s === fs ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
   <span class="rot">Linha da DRE</span><select id="pjLinha"><option value="">Todas</option>${linhasDre.map(s => `<option value="${esc(s)}" ${s === fl ? 'selected' : ''}>${esc(s === '0' ? '(CAPEX — fora da DRE)' : s)}</option>`).join('')}</select>
   <label class="chip ${zer ? 'on' : ''}" id="pjZer">${zer ? '✓ ' : ''}mostrar linhas zeradas</label><span class="rot" style="margin-left:auto">${L.length} linha(s)</span></div>
  <div class="tw"><table class="t"><thead><tr><th class="fx">Área · conta</th><th>Descrição</th><th>Decisão</th><th>Linha da DRE</th>${MESES.map((x, i) => `<th class="n ${i === m ? 'hl' : ''}">${x}/27</th>`).join('')}<th class="n">Total 2027</th></tr></thead><tbody>
  ${L.map(l => `<tr><td class="fx nw"><small style="color:var(--ink3)">${esc(l.s)}</small><br>${esc(l.c)}</td><td class="w">${esc(l.d)}</td><td>${esc(l.da)}</td><td class="nw">${esc(l.ld === '0' ? 'CAPEX' : l.ld)}</td>${l.mf.map((v, i) => tdN(v, { cls: i === m ? 'hl' : '' })).join('')}${tdN(l.vf)}</tr>`).join('')}
  </tbody><tfoot><tr><td class="fx">Total</td><td></td><td></td><td></td>${tot.map((v, i) => tdN(v, { cls: i === m ? 'hl' : '' })).join('')}${tdN(soma(tot))}</tr></tfoot></table></div>`;
};
POS.projecao = () => { $('pjSetor').onchange = e => { est.f.pjSetor = e.target.value; desenha(); }; $('pjLinha').onchange = e => { est.f.pjLinha = e.target.value; desenha(); };
  $('pjZer').onclick = () => { est.f.pjZer = !est.f.pjZer; desenha(); }; };

/* ---------------------------------------------------------------- VERSÕES E CENÁRIOS */
TELAS.versoes = () => {
  const rec = D.premissas.receita, sel = D.dre.linhas.filter(l => l.t !== 'd' && l.t !== 'p'), ctl = est.papelReal === 'controladoria' && est.papel === 'controladoria';
  const fin = (est.versoes || []).find(v => v.status === 'APROVADA FINAL');
  const tagSt = s => `<span class="tag ${s === 'APROVADA FINAL' ? 'g' : s === 'EM REVISÃO' ? 'b' : s === 'SUBSTITUÍDA' ? '' : 'y'}">${esc(s)}</span>`;
  const dt_ = x => x ? new Date(x).toLocaleString('pt-BR') : '—';
  return `${cabecalho('Versões (rodadas) e cenários', 'Cada rodada guarda o orçamento inteiro (DRE, linhas, folha, premissas, decisões). A Controladoria cria nova rodada a partir de uma versão, coloca em revisão e aprova a FINAL — só ela vale no Orçado × Realizado mensal. Versão aprovada fica fechada para edição.')}
  ${fin ? `<div class="ok-box">✓ Versão FINAL aprovada: <b>${esc(fin.codigo)} · ${esc(fin.nome || '')}</b> em ${dt_(fin.aprovada_em)} por ${esc(fin.aprovada_por || '')} — referência do acompanhamento mensal.</div>`
        : '<div class="aviso">Nenhuma versão aprovada como FINAL ainda — o acompanhamento usa a versão selecionada como referência provisória.</div>'}
  <div id="vrAviso" hidden></div>
  <div class="tw solta"><table class="t"><thead><tr><th>Versão</th><th>Nome</th><th>Situação</th><th>Origem</th><th>Criada</th><th>Aprovada</th><th></th></tr></thead><tbody>
    ${(est.versoes || []).map(v => `<tr ${v.codigo === est.versao ? 'class="hl"' : ''}><td><b>${esc(v.codigo)}</b>${v.codigo === est.versao ? ' <span class="tag b">aberta</span>' : ''}</td><td>${esc(v.nome || '')}</td><td>${tagSt(v.status)}</td><td class="w">${esc(v.origem || '')}</td>
      <td class="nw">${dt_(v.criada_em)}<br><small style="color:var(--ink3)">${esc(v.criada_por || '')}</small></td><td class="nw">${dt_(v.aprovada_em)}</td>
      <td class="nw">${v.codigo !== est.versao ? `<button class="btn" data-vabre="${esc(v.codigo)}">Abrir</button> ` : ''}${ctl ? `<button class="btn" data-vnova="${esc(v.codigo)}">Nova rodada a partir desta</button> ` +
        (['RASCUNHO'].includes(v.status) ? `<button class="btn" data-vst="${esc(v.codigo)}|EM REVISÃO">Em revisão</button> ` : '') +
        (['RASCUNHO', 'EM REVISÃO'].includes(v.status) ? `<button class="btn primary" data-vst="${esc(v.codigo)}|APROVADA FINAL">Aprovar como FINAL</button>` : '') : ''}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="row2">
   <div class="card"><h3>Cenários de receita 2027</h3><div class="csub">Curva mensal do faturamento</div>
    ${Object.entries(rec).filter(([k]) => k !== 'Adotado').map(([k, r]) => `<div class="sumline"><span class="t">${esc(k)} ${k === D.meta.cenario ? '<span class="tag g">calculado</span>' : '<span class="tag">motor — fase 3</span>'}<br><small style="color:var(--ink3)">${esc(r.rotulo)}</small></span><span class="v">${rsC(r.tot)}</span></div>`).join('')}</div>
   <div class="card"><div class="legend"><i><span class="sw" style="background:#C8102E"></span>P&amp;D</i><i><span class="sw" style="background:#1F6FEB"></span>Plano TCP</i></div>
    ${grafLinhas([{ t: 'P&D', v: rec['P&D'].m, cor: '#C8102E' }, { t: 'Plano TCP', v: rec['Plano TCP'].m, cor: '#1F6FEB', tr: true }])}</div>
  </div>
  <div class="tw solta"><table class="t dre"><thead><tr><th class="fx">DRE — lado a lado</th><th class="n">Base 2026</th><th class="n">Orçado 2027 (${esc(D.meta.cenario)})</th><th class="n">Plano TCP 2027</th><th class="n">Δ orçado × TCP</th><th class="n">Δ orçado × base</th></tr></thead><tbody>
   ${sel.map(l => `<tr class="${l.t}"><td class="fx"><div class="lbl">${esc(l.l)}</div></td>${tdN(l.base)}${tdN(l.orc)}${tdN(l.tcp)}<td class="n ${cd(l.orc - l.tcp)}">${fmt(l.orc - l.tcp, { sinal: true })}</td><td class="n ${cd(l.orc - l.base)}">${fmt(l.orc - l.base, { sinal: true })}</td></tr>`).join('')}
  </tbody></table></div>`;
};

POS.versoes = () => {
  const aviso = (x, erro) => { const el = $('vrAviso'); el.hidden = false; el.className = erro ? 'aviso' : 'ok-box'; el.textContent = x; };
  document.querySelectorAll('#tela [data-vabre]').forEach(b => b.onclick = () => trocaVersao(b.dataset.vabre));
  document.querySelectorAll('#tela [data-vnova]').forEach(b => b.onclick = async () => {
    const base = b.dataset.vnova, prox = 'V' + (Math.max(0, ...est.versoes.map(v => +v.codigo.slice(1) || 0)) + 1);
    const nome = prompt(`Nome da nova rodada ${prox} (cópia de ${base}):`, `${prox} · revisão`); if (!nome) return;
    if (window.ORC_FONTE_LOCAL) { est.versoes.push({ codigo: prox, nome, status: 'RASCUNHO', origem: 'cópia de ' + base, criada_em: new Date().toISOString(), criada_por: 'prévia' }); montaSeletores(); desenha(); aviso('Prévia local: rodada criada só nesta tela.'); return; }
    const { error } = await SB.rpc('orc_nova_versao', { p_codigo: prox, p_nome: nome, p_base: base });
    if (error) return aviso('Não foi possível criar: ' + error.message, true);
    await trocaVersao(prox);
  });
  document.querySelectorAll('#tela [data-vst]').forEach(b => b.onclick = async () => {
    const [cod, st] = b.dataset.vst.split('|');
    if (st === 'APROVADA FINAL' && !confirm(`Aprovar ${cod} como versão FINAL do orçamento 2027? Ela passa a ser a referência do Orçado × Realizado e fica fechada para edição (a final anterior vira SUBSTITUÍDA).`)) return;
    if (window.ORC_FONTE_LOCAL) { est.versoes.forEach(v => { if (st === 'APROVADA FINAL' && v.status === 'APROVADA FINAL') v.status = 'SUBSTITUÍDA'; if (v.codigo === cod) { v.status = st; if (st === 'APROVADA FINAL') { v.aprovada_em = new Date().toISOString(); v.aprovada_por = 'prévia'; } } }); montaSeletores(); desenha(); return; }
    const { error } = await SB.rpc('orc_status_versao', { p_codigo: cod, p_status: st });
    if (error) return aviso('Não foi possível mudar a situação: ' + error.message, true);
    await trocaVersao(est.versao);
  });
};

/* ---------------------------------------------------------------- ACOMPANHAMENTO */
TELAS.orcreal = () => {
  const m = est.per === 'ano' ? 0 : +est.per, L = linhasVis(), tol = D.meta.tolerancia;
  const g = {}; L.forEach(l => { const x = g[l.gc] ||= { om: 0, oa: 0 }; x.om += l.mf[m]; x.oa += soma(l.mf.slice(0, m + 1)); });
  return `${cabecalho('Orçado × Realizado — ' + mesTxt(m), `Semáforo pela tolerância (${pc(tol, 2)}): <span class="sem g"></span> dentro · <span class="sem y"></span> até 2× a tolerância · <span class="sem r"></span> acima de 2× · <span class="sem c"></span> aguardando realizado. Abertura: área → conta → lançamento.`)}
  <div class="info">Versão de referência: ${(() => { const f = (est.versoes || []).find(v => v.status === 'APROVADA FINAL'); return f ? `<b>${esc(f.codigo)} · ${esc(f.nome || '')}</b> (FINAL aprovada)` : `<b>${esc(est.versao)}</b> — provisória (nenhuma versão aprovada como FINAL)`; })()}</div>
  <div class="aviso">O realizado de 2027 entra com a carga do Protheus a partir do fechamento de <b>jan/2027</b>. A grade abaixo já mostra o orçado (final pela decisão) do mês e do acumulado; escolha o mês no seletor <b>Período</b>.</div>
  <div class="tw solta"><table class="t"><thead><tr><th></th><th>Área</th><th class="n">Orçado ${mesTxt(m)}</th><th class="n">Realizado</th><th class="n">Δ</th><th class="n">Δ %</th><th class="n">Orçado acum. jan–${MESES[m]}</th><th class="n">Realizado acum.</th><th class="n">Δ acum.</th><th>Explicação</th></tr></thead><tbody>
  ${Object.entries(g).map(([k, x]) => `<tr><td><span class="sem c"></span></td><td>${esc(k)}</td>${tdN(x.om)}<td class="n">—</td><td class="n">—</td><td class="n">—</td>${tdN(x.oa)}<td class="n">—</td><td class="n">—</td><td style="color:var(--ink3)">—</td></tr>`).join('')}
  </tbody><tfoot><tr><td></td><td>Total</td>${tdN(soma(Object.values(g), x => x.om))}<td class="n">—</td><td></td><td></td>${tdN(soma(Object.values(g), x => x.oa))}<td class="n">—</td><td></td><td></td></tr></tfoot></table></div>`;
};
TELAS.desvios = () => `${cabecalho('Explicações de desvio', 'Quando uma linha passa da tolerância, o gestor registra a explicação e a Controladoria aceita ou devolve. Tudo com data, quem e versão.')}
  <div class="tw solta"><table class="t"><thead><tr><th>Mês</th><th>Área</th><th>Conta</th><th class="n">Orçado</th><th class="n">Realizado</th><th class="n">Δ</th><th>Explicação do gestor</th><th>Situação</th><th>Quem / quando</th></tr></thead>
  <tbody><tr><td colspan="9" class="vazio">Nenhum desvio ainda — o acompanhamento começa com o realizado de jan/2027.</td></tr></tbody></table></div>`;

/* ---------------------------------------------------------------- AUDITORIAS */
TELAS.aud_aloc = () => {
  if (!RAZAO) { carregaRazao().then(desenha).catch(e => $('tela').innerHTML = `<div class="aviso">${esc(e.message)}</div>`); return '<div class="status">Carregando o razão…</div>'; }
  const dic = D.meta.razao.dic, meses = [...new Set(RAZAO.map(r => r[0]))].sort(), mm = +(est.f.audMes || meses[meses.length - 1]);
  const R = RAZAO.filter(r => r[0] === mm), F = R.filter(r => /^FORA/.test(dic.aloc[r[12]])), totM = soma(R, r => r[6]);
  const tipos = {}; F.forEach(r => { const t = dic.aloc[r[12]], x = tipos[t] ||= { n: 0, v: 0 }; x.n++; x.v += r[6]; });
  const porS = {}; F.forEach(r => { const s = dic.setor[r[10]] || '(sem CC / sem setor)', x = porS[s] ||= { n: 0, v: 0 }; x.n++; x.v += r[6]; });
  const porC = {}; R.forEach(r => { const x = porC[r[4]] ||= { n: 0, v: 0, t: 0 }; x.t += r[6]; if (/^FORA/.test(dic.aloc[r[12]])) { x.n++; x.v += r[6]; } });
  const cf = Object.entries(porC).filter(([, x]) => x.n).sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v));
  const ref = mm === 202610 ? '<div class="ok-box">✓ out/26 confere com o PT (AUDITORIA_ALOCACAO): 252 lançamentos · R$ 224.760,52 fora da política · gasto do mês 4.341 lançamentos · R$ 6.149.599,58.</div>' : '';
  return `${cabecalho('Auditoria — alocação de gasto × política (POP PCF 07)', 'Conta de gestão centralizada lançada fora do gestor, conta orçada por área sem CC, CC sem setor. Detalhe por lançamento; mês a mês.', chips('audMes', meses.map(x => ({ v: String(x), t: MESES[+String(x).slice(4) - 1] + '/' + String(x).slice(2, 4) })), String(mm)))}
  <section class="kpis"><div class="kpi"><div class="lab">Fora da política no mês</div><div class="val down">${rsC(soma(F, r => r[6]))}</div><div class="meta">${F.length} lançamento(s) · ${pc(div(soma(F, r => r[6]), totM))} do gasto do mês</div></div>
   <div class="kpi k5"><div class="lab">Gasto do mês (escopo)</div><div class="val">${rsC(totM)}</div><div class="meta">${R.length} lançamento(s)</div></div>
   ${Object.entries(tipos).map(([t, x]) => `<div class="kpi k3"><div class="lab">${esc(t.replace(/^FORA — /, ''))}</div><div class="val">${rsC(x.v)}</div><div class="meta">${x.n} lançamento(s)</div></div>`).join('')}</section>
  ${ref}
  <div class="row2">
   <div class="tw solta"><table class="t"><thead><tr><th>Área do CC lançado</th><th class="n">Nº</th><th class="n">R$ fora</th><th class="n">part.</th></tr></thead><tbody>
    ${Object.entries(porS).sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v)).map(([s, x]) => `<tr><td>${esc(s)}</td><td class="n">${x.n}</td>${tdN(x.v)}${tdP(div(x.v, soma(F, r => r[6])))}</tr>`).join('')}</tbody></table></div>
   <div class="tw solta"><table class="t"><thead><tr><th>Conta</th><th class="n">Nº</th><th class="n">R$ fora</th><th class="n">% da conta</th></tr></thead><tbody>
    ${cf.map(([c, x]) => `<tr class="clic" data-conta="${esc(c)}"><td>${esc(c)} <small style="color:var(--ink3)">${esc(D.contaDesc[c] || '')}</small></td><td class="n">${x.n}</td>${tdN(x.v)}${tdP(div(x.v, x.t))}</tr>`).join('')}</tbody></table></div>
  </div>
  <div class="tw"><table class="t"><thead><tr><th>Dia</th><th>Lote/Doc</th><th>Conta</th><th>CC</th><th>Área do CC</th><th>Área pela política</th><th>Histórico</th><th class="n">D − C</th><th>Tipo</th></tr></thead><tbody>
   ${F.slice().sort((a, b) => Math.abs(b[6]) - Math.abs(a[6])).slice(0, 300).map(r => `<tr><td>${esc(r[1])}</td><td class="nw">${esc(r[2])}/${esc(r[3])}</td><td>${esc(r[4])}</td><td>${esc(r[5])}</td><td>${esc(dic.setor[r[10]])}</td><td>${esc(dic.setor[r[11]])}</td><td class="w">${esc(r[7])}</td>${tdN(r[6], { uni: 'R$', dec: 2 })}<td><span class="tag r">${esc(dic.aloc[r[12]].replace(/^FORA — /, ''))}</span></td></tr>`).join('')}
  </tbody></table></div>`;
};
POS.aud_aloc = () => { ligaChips('audMes'); document.querySelectorAll('#tela [data-conta]').forEach(tr => tr.onclick = () => abreLancamentos(null, tr.dataset.conta, 'Conta ' + tr.dataset.conta)); };

TELAS.aud_forn = () => {
  if (!RAZAO) { carregaRazao().then(desenha); return '<div class="status">Carregando o razão…</div>'; }
  const dic = D.meta.razao.dic, F = RAZAO.filter(r => /^FORA/.test(dic.conf[r[15]] || ''));
  const cf = D.cfg_fornecedor, iS = cf.cols.indexOf('SITUAÇÃO'), pares = cf.rows.filter(r => /^FORA/.test(String(r[iS] || '')));
  return `${cabecalho('Auditoria — fornecedor lançado fora da área responsável', 'Confronto do de-para de fornecedores (área responsável, rateio, prevalece sobre o CC) com o CC do lançamento. Janela jul–out/26.')}
  <section class="kpis"><div class="kpi"><div class="lab">Lançamentos fora da área</div><div class="val down">${F.length}</div><div class="meta">${rs(soma(F, r => r[6]))}</div></div>
   <div class="kpi k3"><div class="lab">Pares fornecedor × conta fora</div><div class="val">${pares.length}</div><div class="meta">no de-para de fornecedores</div></div></section>
  <div class="tw solta"><table class="t"><thead><tr><th>Mês</th><th>Fornecedor</th><th>Conta</th><th>CC</th><th>Área do CC</th><th>Histórico</th><th class="n">D − C</th><th>Confronto</th></tr></thead><tbody>
   ${F.sort((a, b) => Math.abs(b[6]) - Math.abs(a[6])).map(r => `<tr><td>${MESES[+String(r[0]).slice(4) - 1]}/26</td><td class="w">${esc(dic.nome[r[14]])}</td><td>${esc(r[4])}</td><td>${esc(r[5])}</td><td>${esc(dic.setor[r[10]])}</td><td class="w">${esc(r[7])}</td>${tdN(r[6], { uni: 'R$', dec: 2 })}<td class="w"><span class="tag r">${esc(dic.conf[r[15]])}</span></td></tr>`).join('')}
  </tbody></table></div>
  <div class="card"><h3>Pares no de-para de fornecedores com situação FORA</h3>${tabelaSimples(cf, pares, [1, 2, 3, 5, 9, 10, 11, 13, 14, 20])}</div>`;
};
function tabelaSimples(b, rows, idx) {
  const tipos = b.tipos || [];
  return `<div class="tw solta"><table class="t"><thead><tr>${idx.map(i => `<th class="${tipos[i] === 'n' ? 'n' : ''} ${b.edit.includes(i) ? 'ed' : ''}">${esc(b.cols[i])}</th>`).join('')}</tr></thead><tbody>
   ${rows.map(r => `<tr>${idx.map(i => tipos[i] === 'n' ? tdN(typeof r[i] === 'number' ? r[i] : null, { cls: b.edit.includes(i) ? 'ed' : '' }) : tipos[i] === 'p' ? `<td class="n">${pc(r[i])}</td>` : `<td class="${String(r[i] ?? '').length > 40 ? 'w' : ''} ${b.edit.includes(i) ? 'ed' : ''}">${esc(r[i])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${idx.length}" class="vazio">Nenhuma linha.</td></tr>`}</tbody></table></div>`;
}
TELAS.aud_troca = () => {
  const A = D.ajustes, rows = A.rows.filter(r => /COMISSOES/i.test(r[2]));
  const ida = rows.filter(r => String(r[5]).startsWith('3120203')), volta = rows.filter(r => !String(r[5]).startsWith('3120203'));
  return `${cabecalho('Auditoria — contas trocadas: comissões × assessoria comercial', 'Fixo mensal de representante/consultoria lançado em Comissões (é Assessoria) e o inverso. Origem: análise do Silvio na DRE dinâmica; aplicado como ajuste gerencial do realizado (base 2026).')}
  <section class="kpis"><div class="kpi"><div class="lab">Comissões → assessoria</div><div class="val">${rsC(soma(ida, r => r[10]))}</div><div class="meta">${ida.length} lançamento(s)</div></div>
   <div class="kpi k2"><div class="lab">Assessoria → comissões</div><div class="val">${rsC(soma(volta, r => r[10]))}</div><div class="meta">${volta.length} lançamento(s)</div></div>
   <div class="kpi k5"><div class="lab">Efeito anualizado na origem</div><div class="val">${rsC(soma(rows, r => r[14]))}</div><div class="meta">sobre a base 2026</div></div></section>
  ${tabelaSimples(A, rows, [0, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14])}`;
};
TELAS.aud_recor = () => {
  const A = D.ajustes, rows = A.rows.filter(r => /NORMALIZA/.test(r[1])), ct = D.orcado.filter(o => o.ct === 'S');
  return `${cabecalho('Auditoria — recorrência de contratos e licenças', 'Licenças e suportes com valor fora do padrão mensal (pontual, encerrado, duplicidade, excesso) são normalizados na base 2026; contratos recorrentes informados pelos gestores ficam listados para revisão e renegociação.')}
  <section class="kpis"><div class="kpi"><div class="lab">Normalizações na base 2026</div><div class="val">${rsC(soma(rows, r => r[10]))}</div><div class="meta">${rows.length} lançamento(s) · efeito anualizado ${rsC(soma(rows, r => r[14]))}</div></div>
   <div class="kpi k3"><div class="lab">Contratos informados pelos gestores</div><div class="val">${ct.length}</div><div class="meta">linhas do orçado com CONTRATO = S</div></div></section>
  ${tabelaSimples(A, rows, [0, 3, 5, 6, 8, 10, 11, 12, 13, 14])}
  ${ct.length ? '' : '<div class="info">Nenhum gestor marcou CONTRATO = S no template 2027 — a coluna existe na grade de Meu orçamento (fase 2: obrigatória para despesa recorrente).</div>'}`;
};
TELAS.aud_mapa = () => `${cabecalho('Mapa de anomalias de contabilização', 'Fornecedor × conta × mês: fornecedor que troca de conta, conta que muda de padrão, lançamento fora do comportamento histórico. Pré-final do fechamento desde 11/11/2026.')}
  <div class="info">Fonte: rotina do detector de contabilização (skill <b>detector-contabilizacao</b>) sobre o razão do Protheus. Entra no app com a carga mensal (fase 2) — o mês fechado gera o mapa e a tela mostra o que mudou em relação ao mês anterior, com abertura até o lançamento.</div>
  <div class="tw solta"><table class="t"><thead><tr><th>Fornecedor</th><th>Conta habitual</th><th>Conta no mês</th><th>Mês</th><th class="n">Valor</th><th>Tipo</th><th>Situação</th></tr></thead><tbody><tr><td colspan="7" class="vazio">Aguardando a primeira carga mensal.</td></tr></tbody></table></div>`;
TELAS.aud_ajustes = () => {
  const A = D.ajustes, por = {}; A.rows.forEach(r => { const x = por[r[1]] ||= { n: 0, v: 0, e: 0 }; x.n++; x.v += r[10]; x.e += r[14]; });
  return `${cabecalho('Ajustes gerenciais do realizado 2026', esc(A.nota))}
  ${trava('STATUS e APLICAR (S/N) viram campos editáveis; cada mudança recalcula a base 2026 e fica no histórico.')}
  <section class="kpis">${Object.entries(por).map(([t, x]) => `<div class="kpi k5"><div class="lab">${esc(t)}</div><div class="val">${rsC(x.v)}</div><div class="meta">${x.n} ajuste(s) · efeito anualizado ${rsC(x.e)}</div></div>`).join('')}</section>
  ${tabelaSimples(A, A.rows, [0, 1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14])}`;
};
TELAS.aud_anom = () => {
  const A = D.anomalias, area = est.f.anArea || '', grav = est.f.anGrav || null;
  const lista = A.lista.filter(r => (!area || r[0] === area) && (!grav || r[4] === grav));
  const gravs = [...new Set(A.lista.map(r => r[4]))];
  return `${cabecalho('Relatório de anomalias orçamentárias por área', `Fonte: ${esc(A.fonte)}. Regras R1–R6 + I1 (acima da inflação sem explicação, sem histórico, gasto não orçado, conta de outro gestor, linha incompleta, diretoria não segregada, % do faturamento).`)}
  <div class="aviso">🔒 <b>Envio bloqueado.</b> Nenhum comunicado aos gestores sai sem ordem do Silvio (revisão área por área). O botão de envio pelo Thor fica desligado nesta fase.</div>
  <div class="tw solta"><table class="t"><thead><tr>${A.cab_resumo.map((c, i) => `<th class="${i ? 'n' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>
   ${A.resumo.map(r => `<tr class="clic" data-area="${esc(r[0])}"><td>${esc(r[0])}</td>${tdN(r[1])}${tdN(r[2])}<td class="n">${pc(r[3])}</td>${r.slice(4).map(v => `<td class="n">${v || '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  <div class="filtros"><span class="rot">Área</span><select id="anArea"><option value="">Todas</option>${A.resumo.map(r => `<option ${r[0] === area ? 'selected' : ''}>${esc(r[0])}</option>`).join('')}</select>
   <span class="rot">Gravidade</span>${chips('anGrav', gravs, grav)}<button class="btn primary" disabled title="Envio só com ordem do Silvio">Enviar à área pelo Thor</button><span class="rot" style="margin-left:auto">${lista.length} item(ns)</span></div>
  <div class="tw"><table class="t"><thead><tr>${A.cols.map((c, i) => `<th class="${[7, 8, 9, 10].includes(i) ? 'n' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>
   ${lista.slice(0, 500).map(r => `<tr>${r.map((v, i) => i === 9 ? `<td class="n">${v == null ? '—' : pc(v)}</td>` : [7, 8, 10].includes(i) ? tdN(v) : i === 4 ? `<td><span class="tag ${v === 'corrigir' ? 'r' : 'y'}">${esc(v)}</span></td>` : `<td class="${String(v).length > 40 ? 'w' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
};
POS.aud_anom = () => { $('anArea').onchange = e => { est.f.anArea = e.target.value; desenha(); }; ligaChips('anGrav');
  document.querySelectorAll('#tela tr[data-area]').forEach(tr => tr.onclick = () => { est.f.anArea = tr.dataset.area; desenha(); }); };

/* ---------------------------------------------------------------- CONFIGURAÇÃO (tabelas genéricas) */
const FILTRAVEIS = /^(TIPO DE PJ|CONTA × TIPO|BENEFÍCIO|ÁREA PELO TIPO|STATUS|SITUAÇÃO|RUBRICA|NATUREZA|CENTRALIZADA|DEPTO GESTOR|LINHA DA DRE|MÉTODO|SETOR|SETOR ORÇAMENTÁRIO|ÁREA RESPONSÁVEL|ÁREA PREDOMINANTE|LINHA DRE TCP|GRUPO|LISTA DO COMUNICADO|REAJUSTE|RATEIO|PREVALECE|CAIXA|AUDITAR)/;
function telaCfg(chave, titulo, desc) {
  const b = D['cfg_' + chave], fk = 'cfg_' + chave, f = est.f[fk] ||= { filtros: {}, ord: null, lim: 200 };
  const filtraveis = b.cols.map((c, i) => [c, i]).filter(([c, i]) => FILTRAVEIS.test(c) && new Set(b.rows.map(r => r[i])).size <= 60);
  let rows = b.rows.filter(r => Object.entries(f.filtros).every(([i, v]) => v === '' || String(r[i] ?? '') === v));
  if (f.ord) { const [i, dir] = f.ord; rows = rows.slice().sort((a, c) => { const x = a[i], y = c[i]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR', { numeric: true })) * dir; }); }
  const iSt = b.cols.findIndex(c => c === 'STATUS'), cont = {}; if (iSt >= 0) b.rows.forEach(r => cont[r[iSt]] = (cont[r[iSt]] || 0) + 1);
  const tipos = b.tipos || [];
  return `${cabecalho(titulo, desc || esc(b.nota))}
  ${trava('Colunas em amarelo = entrada da Controladoria. Quando os de-paras do PT forem concluídos, eles são importados para cá (você não refaz).')}
  ${iSt >= 0 ? `<section class="kpis">${Object.entries(cont).sort((a, c) => c[1] - a[1]).map(([s, n]) => `<button class="kpi ${/VALIDAR/.test(s) ? 'k3' : 'k4'} ${f.filtros[iSt] === s ? 'sel' : ''}" data-stv="${esc(s)}"><div class="lab">${esc(s || '(vazio)')}</div><div class="val">${n}</div><div class="meta">${pc(div(n, b.rows.length))} das linhas</div></button>`).join('')}</section>` : ''}
  ${filtraveis.length ? `<div class="filtros">${filtraveis.map(([c, i]) => `<span class="rot">${esc(c)}</span><select data-fi="${i}"><option value="">Todos</option>${[...new Set(b.rows.map(r => String(r[i] ?? '')))].sort().map(v => `<option ${f.filtros[i] === v ? 'selected' : ''} value="${esc(v)}">${esc(v || '(vazio)')}</option>`).join('')}</select>`).join('')}<span class="rot" style="margin-left:auto">${rows.length} de ${b.rows.length}</span></div>` : ''}
  <div class="tw"><table class="t"><thead><tr>${b.cols.map((c, i) => `<th class="sort ${tipos[i] === 'n' || tipos[i] === 'p' ? 'n' : ''} ${b.edit.includes(i) ? 'ed' : ''}" data-ord="${i}">${esc(c)}${f.ord && f.ord[0] === i ? (f.ord[1] > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
  ${rows.slice(0, f.lim).map(r => `<tr>${r.map((v, i) => tipos[i] === 'n' ? tdN(typeof v === 'number' ? v : null, { cls: b.edit.includes(i) ? 'ed' : '' }) : tipos[i] === 'p' ? `<td class="n ${b.edit.includes(i) ? 'ed' : ''}">${typeof v === 'number' ? pc(v) : esc(v)}</td>` : `<td class="${String(v ?? '').length > 45 ? 'w' : 'nw'} ${b.edit.includes(i) ? 'ed' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>${rows.length > f.lim ? `<button class="btn" id="cfgMais">Mostrar mais (${rows.length - f.lim} restantes)</button>` : ''}`;
}
function posCfg(chave) {
  const fk = 'cfg_' + chave, f = est.f[fk], b = D[fk], iSt = b.cols.findIndex(c => c === 'STATUS');
  document.querySelectorAll('#tela [data-fi]').forEach(s => s.onchange = e => { f.filtros[s.dataset.fi] = e.target.value; f.lim = 200; desenha(); });
  document.querySelectorAll('#tela [data-ord]').forEach(th => th.onclick = () => { const i = +th.dataset.ord; f.ord = f.ord && f.ord[0] === i ? [i, -f.ord[1]] : [i, 1]; desenha(); });
  document.querySelectorAll('#tela [data-stv]').forEach(k => k.onclick = () => { f.filtros[iSt] = f.filtros[iSt] === k.dataset.stv ? '' : k.dataset.stv; desenha(); });
  const m = $('cfgMais'); if (m) m.onclick = () => { f.lim += 400; desenha(); };
}
[['conta', 'De-para de contas', 'Conta contábil → rubrica, gestão (centralizada ou por CC), natureza, linha da DRE, método de projeção, caixa e reajuste pela inflação.'],
 ['tcp', 'De-para conta → linha da DRE TCP', null], ['fornecedor', 'De-para de fornecedores', 'Fornecedor × conta → área responsável, rateio e se prevalece sobre o CC (regra 1b do setor final: Localiza, Movida e Sem Parar → Facilities; Serasa → TI).'],
 ['cc', 'De-para de centros de custo', 'CC → setor orçamentário (validado pela árvore de CC em 11/11/2026).'], ['excecoes', 'Exceções conta × CC / TAG → setor', 'Prioridade máxima na regra do setor final.']].forEach(([k, t, d]) => {
  TELAS['cfg_' + k] = () => telaCfg(k, t, d); POS['cfg_' + k] = () => posCfg(k); });

TELAS.cfg_premissas = () => {
  const P = D.premissas, val = v => typeof v === 'number' ? (Math.abs(v) < 1 && v !== 0 ? pc(v, 2) : fmt(v, { uni: 'R$' })) : esc(v);
  return `${cabecalho('Premissas do orçamento, da DRE e do caixa 2027', 'Mudou a premissa, tudo recalcula (motor — fase 3). Inflação = IPCA 2027 do Boletim Focus, atualizar a cada boletim.')}
  ${trava('Os valores em amarelo serão editáveis (só Controladoria), com histórico de quem mudou.')}
  <div class="row2">
   <div class="card"><h3>Parâmetros gerais</h3>${P.params.concat(P.modelo_gestor).map(p => `<div class="sumline"><span class="t">${esc(p[0])}<br><small style="color:var(--ink3)">${esc(p[2])}</small></span><span class="v" style="background:var(--ed);padding:2px 6px;border-radius:4px">${val(p[1])}</span></div>`).join('')}</div>
   <div class="card"><h3>Premissas do fluxo de caixa</h3>${P.caixa.map(p => `<div class="sumline"><span class="t">${esc(p[0])}${p[2] ? `<br><small style="color:var(--ink3)">${esc(p[2])}</small>` : ''}</span><span class="v" style="background:var(--ed);padding:2px 6px;border-radius:4px">${p[1] == null ? '(vazio)' : val(p[1])}</span></div>`).join('')}</div>
  </div>
  <div class="tw solta"><table class="t"><thead><tr><th class="fx">Receita 2027 por cenário</th>${MESES.map(m => `<th class="n">${m}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
   ${Object.entries(P.receita).map(([k, r]) => `<tr class="${k === 'Adotado' ? 'hl' : ''}"><td class="fx"><b>${esc(k)}</b><br><small style="color:var(--ink3)">${esc(r.rotulo)}</small></td>${r.m.map(v => tdN(v, { cls: k === 'Manual' ? 'ed' : '' })).join('')}${tdN(r.tot)}</tr>`).join('')}
   ${P.plano_compras.map(r => `<tr><td class="fx">${esc(r.rotulo)}</td>${r.m.map(v => tdN(v)).join('')}${tdN(r.tot)}</tr>`).join('')}</tbody></table></div>
  <div class="tw solta"><table class="t"><thead><tr><th>Driver da DRE (% do faturamento)</th><th class="n">Realizado jul–out/26</th><th class="n">Plano TCP 2027</th><th class="n ed">Sobrescrever</th><th class="n">Adotado 2027</th><th>Observação</th></tr></thead><tbody>
   ${P.drivers.map(d => `<tr><td>${esc(d[0])}</td><td class="n">${pc(d[1], 2)}</td><td class="n">${pc(d[2], 2)}</td><td class="n ed">${d[3] == null ? '—' : pc(d[3], 2)}</td><td class="n"><b>${pc(d[4], 2)}</b></td><td class="w">${esc(d[5])}</td></tr>`).join('')}</tbody></table></div>
  <div class="card"><h3>Diretrizes 2027</h3>${P.diretrizes.map(d => `<div class="sumline"><span class="t">${esc(d[0])} ${esc(d[1])}</span></div>`).join('')}</div>`;
};
TELAS.cfg_arvore = () => {
  const b = D.cfg_arvore, g = {}; b.rows.forEach(r => (g[r[0]] ||= []).push(r));
  return `${cabecalho('Árvore de centros de custo', 'Validada pelo Silvio em 11/11/2026. É a base do acesso por área (cada perfil enxerga o seu nó e tudo abaixo dele).')}
  ${trava('Área do orçamento, Manter e Observação editáveis aqui; CC novo no Protheus aparece como pendência.')}
  <div class="card arvore"><ul>${Object.entries(g).sort().map(([gr, rs]) => `<li><span class="no">${esc(gr === '—' ? 'Fora da árvore (NÃO USAR)' : gr)}</span> <span class="tag">${rs.length} CC</span><ul>
   ${rs.sort((a, c) => String(a[1]).localeCompare(String(c[1]))).map(r => `<li class="cc"><code>${esc(r[1])}</code> ${esc(r[2])} → <b>${esc(r[3])}</b> <span class="tag ${r[4] === 'VÁLIDO' ? 'g' : 'r'}">${esc(r[4])}</span> ${r[6] === 'S' ? '' : '<span class="tag y">sai da lista</span>'} <small style="color:var(--ink3)">${typeof r[5] === 'number' ? r[5] + ' lanç. desde 01/07' : ''} ${esc(r[7])}</small></li>`).join('')}</ul></li>`).join('')}</ul></div>`;
};
TELAS.cfg_setores = () => `${cabecalho('Setores e usuários', 'Setor orçamentário → gestor, grupo comparativo, bloco da DRE (onde cai o pessoal) e diretoria. A diretoria de cada setor é derivada da árvore de CC (maioria dos CCs ativos) — A VALIDAR.')}
  ${trava('Gestor, grupo, bloco e diretoria editáveis; o cadastro de usuários (e-mail → perfil e áreas) nasce aqui na fase 2.')}
  <div class="tw solta"><table class="t"><thead><tr><th>Setor</th><th class="ed">Gestor responsável</th><th class="ed">Grupo comparativo</th><th class="ed">Bloco da DRE (pessoal)</th><th>Entregou</th><th class="ed">Diretoria (derivada)</th><th>Ramo da árvore</th><th>CCs</th><th>Observação</th></tr></thead><tbody>
  ${D.setores.map(s => `<tr><td><b>${esc(s.s)}</b></td><td class="ed">${esc(s.gestor)}</td><td class="ed">${esc(s.gc)}</td><td class="ed">${esc(s.bloco)}</td><td>${esc(s.en)}</td><td class="ed">${esc(s.dir)} <span class="tag y">a validar</span></td><td>${esc(s.ramo)}</td><td>${esc(s.ccs.join(', '))}</td><td class="w">${esc(s.obs)}</td></tr>`).join('')}</tbody></table></div>
  <div class="card"><h3>Perfis de acesso</h3><div class="csub">O banco trava por área (RLS sobre a árvore de CC), não só a tela.</div>
   ${Object.entries(PAPEIS).map(([k, p]) => `<div class="sumline"><span class="t"><b>${esc(p.nm)}</b> — ${esc(p.hint)}</span><span class="v"><span class="tag ${p.ro ? 'b' : 'r'}">${esc(p.badge)}</span></span></div>`).join('')}</div>`;
TELAS.cfg_rubricas = () => `${cabecalho('Rubricas e linhas da DRE', 'Rubricas orçamentárias (.01xx) e a ligação de cada linha da DRE com o grupo do fluxo de caixa.')}
  <div class="row2" style="grid-template-columns:1fr 1fr">${tabelaSimples(D.cfg_rubricas, D.cfg_rubricas.rows, [0, 1])}${tabelaSimples(D.cfg_linhas_dre, D.cfg_linhas_dre.rows, [0, 1])}</div>`;

/* ---------------------------------------------------------------- SISTEMA */
function checksApp() {
  const out = [], ok = (n, v, tol = 0.05) => out.push([n, v, Math.abs(v) <= tol]);
  const porS = {}; D.linhas.forEach(l => { const x = porS[l.s] ||= [0, 0, 0, 0]; x[0] += l.b; x[1] += l.mo; x[2] += l.ge; x[3] += l.vf; });
  let d = [0, 0, 0, 0]; D.ref.modelo_x_gestor_q1.filter(r => r[0] !== 'TOTAL').forEach(r => { const x = porS[r[0]] || [0, 0, 0, 0]; for (let i = 0; i < 4; i++) d[i] += Math.abs(x[i] - r[2 + i]); });
  ['base 2026', 'modelo', 'gestor', 'final 2027'].forEach((n, i) => ok(`Linhas área × conta somadas por área × PT MODELO_X_GESTOR quadro 1 — ${n} (Σ |Δ|)`, d[i]));
  ok('Linhas em que Σ meses ≠ valor final', D.linhas.filter(l => Math.abs(soma(l.mf) - l.vf) > 0.01).length, 0);
  const g = {}; D.linhas.forEach(l => { const a = g[l.gc] ||= Array(12).fill(0); l.mf.forEach((v, i) => a[i] += v); });
  ok('Mensal FINAL por área × PT MENSAL_2027 (Σ |Δ| nos 12 meses)', soma(D.ref.mensal_final.filter(r => r[0] !== 'TOTAL'), r => soma(r.slice(1, 13).map((v, i) => Math.abs(v - ((g[r[0]] || [])[i] || 0))))));
  const go = {}; D.orcado.forEach(o => { const a = go[o.g] ||= Array(12).fill(0); o.m.forEach((v, i) => a[i] += v); });
  ok('Orçado dos gestores por área × PT MENSAL_2027 bloco orçado (Σ |Δ|)', soma(D.ref.mensal_gestor.filter(r => r[0] !== 'TOTAL' && !/^Faturamento|^Orçado/.test(r[0])), r => soma(r.slice(1, 13).map((v, i) => Math.abs(v - ((go[r[0]] || [])[i] || 0))))));
  const rgs = D.ref.resumo_grupos.filter(r => r[0] !== 'TOTAL'); const pg = {}; D.linhas.forEach(l => { const x = pg[l.gc] ||= [0, 0]; x[0] += l.b; x[1] += l.vf; });
  ok('Resumo por área (base e final) × PT RESUMO_SETOR quadro por grupo (Σ |Δ|)', soma(rgs, r => Math.abs((pg[r[0]] || [0, 0])[0] - r[1]) + Math.abs((pg[r[0]] || [0, 0])[1] - r[4])));
  const despDre = soma(D.linhas.filter(l => l.ld && l.ld !== '0'), l => l.vf), compT = (D.dre.composicao[3] || [])[1] || 0;
  ok('Despesas das linhas (final, sem CAPEX) × composição da DRE 2027', despDre - compT);
  const llT = D.dre_tcp.linhas.find(l => l.l === 'Resultado Líquido'), llD = dreLinha('Lucro Líquido');
  ok('DRE TCP resultado líquido × DRE 2027 lucro líquido (12 meses)', llT ? soma(llT.m.map((v, i) => Math.abs(v - llD.m[i]))) : 999);
  const si = cxLinha('Saldo inicial de caixa'), sf = cxLinha('Saldo final de caixa'), ge = cxLinha('(=) GERAÇÃO DE CAIXA');
  ok('Caixa: saldo final − saldo inicial − geração (12 meses)', soma(sf.m.map((v, i) => Math.abs(v - si.m[i] - ge.m[i]))));
  ok('Caixa: saldo inicial do mês = saldo final do mês anterior', soma(si.m.slice(1).map((v, i) => Math.abs(v - sf.m[i]))));
  if (RAZAO) { const dic = D.meta.razao.dic, s = {}; RAZAO.forEach(r => { const k = dic.setor[r[11]] + '|' + r[4]; s[k] = (s[k] || 0) + r[6]; });
    ok('Razão jul–out/26 × fator × base 2026 por área × conta (Σ |Δ|)', soma(D.linhas, l => Math.abs((s[l.s + '|' + l.c] || 0) * D.meta.fator - l.b))); }
  return out;
}
TELAS.sis_checks = () => {
  const C = D.checks, fil = est.f.ckSt, rows = C.rows.filter(r => !fil || r[3] === fil), cont = {}; C.rows.forEach(r => cont[r[3]] = (cont[r[3]] || 0) + 1);
  const A = checksApp(), aOk = A.every(x => x[2]);
  if (!RAZAO) carregaRazao().then(() => est.tela === 'sis_checks' && desenha()).catch(() => { });
  return `${cabecalho('Checks de integridade', `Duas camadas: (1) o app refaz no navegador as somas a partir das linhas e compara com o PT; (2) os ${C.rows.length} testes do PT (integridade, pendências e auditorias).`)}
  <div class="${aOk ? 'ok-box' : 'aviso'}"><b>${aOk ? '✓ O app confere com o PT em todos os testes.' : '⚠️ Há divergência entre o app e o PT — ver abaixo.'}</b></div>
  <div class="tw solta"><table class="t"><thead><tr><th>Conferência app × PT</th><th class="n">Diferença</th><th>Resultado</th></tr></thead><tbody>
   ${A.map(([n, v, k]) => `<tr><td>${esc(n)}</td><td class="n">${typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : esc(v)}</td><td class="nw"><span class="ck ${k ? 'ok' : 'no'}">${k ? '✓ CONFERE' : '✗ DIVERGE'}</span></td></tr>`).join('')}
   ${RAZAO ? '' : '<tr><td colspan="3" class="vazio">Carregando o razão para o teste por lançamento…</td></tr>'}</tbody></table></div>
  <section class="kpis">${Object.entries(cont).map(([s, n]) => `<button class="kpi ${s === 'CONFERE' ? 'k4' : s === 'PENDENTE' ? 'k3' : 'k2'} ${fil === s ? 'sel' : ''}" data-ck="${esc(s)}"><div class="lab">${esc(s)}</div><div class="val">${n}</div><div class="meta">teste(s) do PT</div></button>`).join('')}</section>
  <div class="tw solta"><table class="t"><thead><tr><th class="n">#</th><th>Teste do PT</th><th class="n">Valor</th><th>Resultado</th><th>Tipo</th></tr></thead><tbody>
   ${rows.map(r => `<tr><td class="n">${r[0]}</td><td class="w">${esc(r[1])}</td><td class="n">${typeof r[2] === 'number' ? r[2].toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : esc(r[2])}</td><td><span class="tag ${r[3] === 'CONFERE' ? 'g' : r[3] === 'PENDENTE' ? 'y' : 'b'}">${esc(r[3])}</span></td><td>${esc(r[4])}</td></tr>`).join('')}</tbody></table></div>
  <div class="info">Status geral do PT: <b>${esc(C.status)}</b></div>`;
};
POS.sis_checks = () => document.querySelectorAll('#tela [data-ck]').forEach(b => b.onclick = () => { est.f.ckSt = est.f.ckSt === b.dataset.ck ? null : b.dataset.ck; desenha(); });
TELAS.sis_hist = () => `${cabecalho('Histórico de alterações', 'Trilha imutável: toda alteração de premissa, de-para, orçado, decisão ou ajuste grava quem, quando, tela, registro, antes e depois. Ninguém altera nem apaga — só se acrescenta.')}
  <div class="tw solta"><table class="t"><thead><tr><th>Quando</th><th>Quem</th><th>Tela</th><th>Registro</th><th>Campo</th><th>Antes</th><th>Depois</th><th>Versão</th></tr></thead>
  <tbody><tr><td colspan="8" class="vazio">Nenhuma alteração — a edição no app abre na fase 2.</td></tr></tbody></table></div>`;
TELAS.sis_bases = () => {
  const M = D.meta, cargas = [
    ['Razão de resultado (CT2, contas 3.x)', 'extrai_base_orcamento.py', 'linhas · razao_*', 'mensal (após o fechamento) + sob demanda'],
    ['Contas fora da janela (jan–jun/26)', 'extrai_fora_janela_orcamento.py', 'linhas (rastreio, modelo 0)', 'na geração da versão'],
    ['Receita, deduções, CMV e IR (CT2)', 'extrai_base_dre_receita.py', 'dre · dre_tcp', 'mensal'],
    ['Saldos de disponibilidades (1110*)', 'extrai_saldo_caixa.py', 'base_caixa · caixa', 'mensal'],
    ['Aging a receber e a pagar', 'extrai_aging_orcamento.py', 'aging · caixa', 'mensal'],
    ['Ajustes gerenciais do realizado', 'ajustes_gerenciais_orcamento.py', 'ajustes', 'quando houver ajuste novo'],
    ['Realizado 2027 (CT2)', 'carga mensal (fase 2)', 'acompanhamento', 'mensal a partir de jan/2027']];
  return `${cabecalho('Bases e cargas', 'O app lê o Protheus (somente leitura) por extração para o Supabase — como os demais apps. O PT Excel é só referência de conferência.')}
  <div class="row2"><div class="card"><h3>Origem dos números desta prévia</h3>
   ${[['Fonte', M.fonte_desc], ['Arquivo', M.arquivo], ['Salvo em', M.arquivo_mod], ['Blocos gerados em', M.gerado_em], ['Data-base do realizado', M.data_base + ' (jul–out/26 × ' + M.fator + ')'], ['Cenário', M.cenario + ' — ' + rs(M.receita)], ['Razão por lançamento', M.razao.linhas.toLocaleString('pt-BR') + ' lançamentos em ' + M.razao.partes + ' bloco(s)'], ['Contrato de dados', M.contrato]]
     .map(([t, v]) => `<div class="sumline"><span class="t">${esc(t)}</span><span class="v" style="max-width:62%;font-weight:500">${esc(v)}</span></div>`).join('')}</div>
   <div class="card"><h3>Blocos (orc_bloco) <small>assinatura SHA-256</small></h3><div class="tw solta" style="max-height:330px"><table class="t"><thead><tr><th>Bloco</th><th>SHA-256 (12)</th></tr></thead><tbody>
    ${Object.entries(M.sha || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td><code>${esc(v)}</code></td></tr>`).join('')}</tbody></table></div></div></div>
  <div class="tw solta"><table class="t"><thead><tr><th>Carga do Protheus (fase 2)</th><th>Extrator (somente leitura, .env)</th><th>Alimenta</th><th>Periodicidade</th></tr></thead><tbody>
   ${cargas.map(c => `<tr><td>${esc(c[0])}</td><td><code>${esc(c[1])}</code></td><td>${esc(c[2])}</td><td>${esc(c[3])}</td></tr>`).join('')}</tbody></table></div>`;
};

if (typeof instalaOrcDre === 'function') instalaOrcDre();   // 13/11/2026: DRE (rótulos + detalhe por linha) e Premissas orçamentárias — orcamento_dre.js
inicia();
