/* App ORÇAMENTO & CONTROLADORIA 2027 — lógica das telas (16/11/2026: o app é a fonte da configuração; o PT é o espelho, gerado do app).
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
    { id: 'aud_aloc', t: 'Alocação × política', ico: '⚑', r: CT_CEO }, { id: 'aud_forn', t: 'Fornecedor fora da regra (PT)', ico: '⚑', r: CT_CEO },
    { id: 'aud_troca', t: 'Comissões × assessoria', ico: '⚑', r: CT_CEO }, { id: 'aud_recor', t: 'Contratos e licenças', ico: '⚑', r: CT_CEO },
    { id: 'aud_mapa', t: 'Mapa de anomalias contábeis', ico: '⚑', r: CT_CEO }, { id: 'aud_ajustes', t: 'Ajustes gerenciais', ico: '⚑', r: CT_CEO },
    { id: 'aud_anom', t: 'Anomalias por área (Thor)', ico: '⚑', r: CT_CEO }] },
  { g: 'cfg', t: 'Configuração', itens: [
    { id: 'cfg_premissas', t: 'Premissas', ico: '⚙', r: CT }, { id: 'cfg_conta', t: 'De-para de contas', ico: '⚙', r: CT },
    { id: 'cfg_tcp', t: 'De-para DRE TCP', ico: '⚙', r: CT }, { id: 'cfg_fornecedor', t: 'Fornecedor × conta (visão da central)', ico: '⚙', r: CT },
    { id: 'cfg_representantes', t: 'Representantes (comissão % RB)', ico: '⚙', r: CT },
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
    FOLHA = fd ? { P: fd.premissa, pos: fd.posicoes.map(x => ({ ...x })), proj: fd.projecao, origem: 'carga do PT (' + D.meta.arquivo + ')', sujo: new Set(), noBanco: new Set(fd.posicoes.map(x => x.id)), premSuja: false, Pbase: fd.premissa_pt || null } : null;
    return;
  }
  const rv = await SB.from('orc_versao').select('*').order('codigo');
  est.legado = !!rv.error;
  est.versoes = rv.error ? [{ codigo: 'V1', nome: '', status: 'RASCUNHO' }] : rv.data;
  est.versoes.sort((a, b) => (+String(a.codigo).slice(1) || 0) - (+String(b.codigo).slice(1) || 0));   // V10 depois da V9 (a ordem do banco é texto)
  if (!est.versao || !est.versoes.some(v => v.codigo === est.versao)) {
    const f = est.versoes.find(v => v.status === 'APROVADA FINAL'); est.versao = (f || est.versoes[est.versoes.length - 1]).codigo;
  }
  // 25/11/2026: o bloco 'composicao' (versão analítica para o orçado × realizado de 2027) fica fora da abertura, como o razão — lido só quando a tela usar
  let q = SB.from('orc_bloco').select('nome,dados').not('nome', 'like', 'razao_%').neq('nome', 'composicao').order('ordem');
  if (!est.legado) q = q.eq('versao', est.versao);
  const { data, error } = await q;
  if (error) throw error;
  if (!data || !data.length) throw new Error('base vazia ou sem permissão');
  D = {}; data.forEach(b => D[b.nome] = b.dados); RAZAO = null; FOLHA = null;
  if (est.legado) return;
  const v = est.versao;
  const [pos, prem, proj] = await Promise.all([
    selTodos(() => SB.from('orc_folha_posicao').select('*').eq('versao', v).order('id')),
    SB.from('orc_folha_premissa').select('*').eq('versao', v).maybeSingle(),      // 16/11/2026: * = dados + linha de base (dados_pt, migração 058)
    selTodos(() => SB.from('orc_folha_projecao').select('*').eq('versao', v).order('area'))]);
  if (prem.error || !prem.data) return;
  const ult = proj.reduce((a, r) => (!a || r.projetado_em > a.projetado_em) ? r : a, null);
  FOLHA = { P: prem.data.dados, pos: pos.map(x => ({ ...x, salario: +x.salario, adicional: +x.adicional, he_media: +x.he_media, qtd: +x.qtd, pct_promo: x.pct_promo == null ? null : +x.pct_promo })),
    proj: proj.map(r => ({ ...r, conta: +r.conta, m: r.m.map(Number), base: r.base == null ? null : +r.base })),
    origem: ult ? `${ult.projetado_por || ''} em ${new Date(ult.projetado_em).toLocaleString('pt-BR')}` : '—', sujo: new Set(), noBanco: new Set(pos.map(x => x.id)), premSuja: false,
    Pbase: prem.data.dados_pt || null, Pem: prem.data.atualizado_em || null, Ppor: prem.data.atualizado_por || '' };
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
  $('selCen').innerHTML = D.meta.cenarios.map(c => `<option value="${esc(c)}" ${c === D.meta.cenario ? '' : 'disabled'}>${esc(c)}${c === D.meta.cenario ? ' — ' + rsC(D.meta.receita) : ' (exige nova geração)'}</option>`).join('');
  $('selVer').innerHTML = (est.versoes || []).map(v => `<option value="${esc(v.codigo)}" ${v.codigo === est.versao ? 'selected' : ''}>${esc(v.codigo)}${v.nome ? ' · ' + esc(v.nome.replace(/^V\d+\s*·\s*/, '')) : ''} — ${esc(v.status)}</option>`).join('');
  $('selVer').onchange = e => trocaVersao(e.target.value);
  const u = lsGet('uni'); if (u) est.uni = u;
  $('selUni').value = est.uni;
  $('selPer').onchange = e => { est.per = e.target.value; desenha(); };
  $('selUni').onchange = e => { est.uni = e.target.value; lsSet('uni', est.uni); desenha(); };
  $('menuBtn').onclick = e => { e.stopPropagation(); document.body.classList.toggle('menu-on'); };
  document.querySelector('.main').addEventListener('click', () => document.body.classList.remove('menu-on'));   // celular: tocar fora fecha o menu
  const f = $('faixaFase');                       // 16/11/2026 (Silvio): o app é o protagonista — a configuração se faz aqui; o PT é o espelho, gerado do app
  const ptV = (String(D.meta.arquivo || '').match(/_V(\d+)_/) || [])[1];
  f.hidden = false;
  f.innerHTML = `<b>O app é a fonte; o PT é o espelho.</b> Premissas, de-paras, exceções, centros de custo, setores, folha e decisões por linha se alteram aqui, com histórico de quem e quando. ` +
    `O PT de gestão orçamentária é gerado a partir do app quando o Silvio pedir, para envio e análise. Números da versão ${esc(est.versao || '')}: ${ptV ? 'PT V' + esc(ptV) : esc(D.meta.arquivo)} de ${esc(D.meta.arquivo_mod)} — o que for salvo depois entra na próxima geração.`;
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
function trava(txt) { return `<div class="aviso">🔒 <b>Ainda não editável nesta tela.</b> ${txt || 'O que muda os números se altera em Configuração e em Decisões por linha, com histórico de quem e quando.'}</div>`; }
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
    const tc = l.tcp, dt = tc == null ? null : (l.dif != null ? l.dif : l.tot - tc), tot = l.t === 'sal' ? (l.l.startsWith('Saldo inicial') ? l.m[0] : l.m[11]) : l.tot;   // 19/11/2026: Δ do PT (Impostos pagos + PIS/COFINS × TCP)
    return `<tr class="${l.t}"><td class="fx"><div class="lbl">${esc(l.l)}</div></td>${tdN(tot)}${tc == null ? '<td class="n">—</td><td></td>' : tdN(tc) + `<td class="n ${cd(dt)}">${fmt(dt, { sinal: true })}</td>`}
      ${l.m.map((x, i) => tdN(x, { cls: i === m ? 'hl' : '' })).join('')}</tr>`;
  }).join('');
  return `${cabecalho('Fluxo de caixa projetado 2027 — método direto', esc(D.caixa.nota))}
  <section class="kpis">
    <div class="kpi k5"><div class="lab">Saldo inicial 01/01/2027</div><div class="val">${rsC(si.m[0])}</div><div class="meta">projetado: média jul–out/26 ± nov–dez/26</div></div>
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
  <div class="info">O ciclo acontece no app: a Controladoria configura (premissas, de-paras, exceções) e decide em <b>Decisões por linha</b>, com histórico de quem e quando; o PT é gerado a partir do app quando o Silvio pedir, para envio e análise. Próxima etapa no app: o gestor explicar as variações em <b>Meu orçamento</b>. Nenhum comunicado sai sem ordem do Silvio.</div>`;
};
POS.ciclo = () => document.querySelectorAll('#tela [data-setor]').forEach(b => b.onclick = () => { est.f.mxgSetor = b.dataset.setor; vai('mxg'); });

/* ---------------------------------------------------------------- MEU ORÇAMENTO */
/* 16/11/2026 (passo 2): linhas desta área levadas à linha da área dona (conta de uma área só) — o gasto é decidido lá, uma vez */
function meuLevados(s) {
  const chave = 'orçado por ' + s + ', levado à área dona ', L = (D.orcado || []).filter(o => String(o.arq || '').includes(chave));
  if (!L.length) return '';
  return `<div class="info">📤 <b>${L.length} linha(s) desta área foram para a linha da área dona da conta</b> (conta de uma área só — o gasto é decidido lá, uma vez): ` +
    L.slice(0, 8).map(o => `${esc(o.c)} ${esc(o.d || '')} → ${esc(o.s)} (${rsC(+o.tot || 0)})`).join(' · ') + (L.length > 8 ? ` · e mais ${L.length - 8}` : '') + '.</div>';
}
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
  return `${cabecalho('Meu orçamento — ' + esc(s), `Gestor: <b>${esc(setorDe(s).gestor || '—')}</b> · grade conta × mês com justificativa. Origem: arquivo entregue pelo gestor (V1_Inicial), carregado na geração da versão.`,
    vis.length > 1 ? `<div class="filtros" style="margin-left:auto"><span class="rot">Área</span><select id="meuSetor">${vis.map(x => `<option ${x === s ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>` : '')}
  ${trava('O orçado é o do arquivo entregue pelo gestor. Correção de valor: em <b>Decisões por linha</b> (OUTRO, com valor e motivo). O preenchimento pelo próprio gestor aqui é a próxima etapa do app.')}
  ${meuLevados(s)}
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
    const campos = ['qtd', 'mes_adm', 'mes_desl', 'tipo_desl', 'mes_promo', 'pct_promo', 'justificativa', 'funcao', 'salario', 'convencao', 'tipo', 'plano']
      .concat(folhaTemAut() ? ['autorizada_por'] : []);   // 17/11/2026 (migração 059): o banco carimba quem e quando autorizou
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
/* 16/11/2026 — FOLHA LIDA DE VOLTA PELO PT ("Folha no PT"): linha de base = valor do PT carregado (orc_folha_posicao.pt / orc_folha_premissa.dados_pt,
   migração 058). O que difere dela foi ALTERADO NO APP e prevalece na próxima geração do PT — mesma comparação do .claude/scripts/orc_folha_app.py. */
const FL_EDIT = ['qtd', 'mes_adm', 'mes_desl', 'tipo_desl', 'mes_promo', 'pct_promo', 'justificativa', 'funcao', 'salario', 'convencao', 'tipo', 'plano'];
const FL_ROT = { qtd: 'qtd', mes_adm: 'mês admissão', mes_desl: 'mês desligamento', tipo_desl: 'tipo desligamento', mes_promo: 'mês promoção', pct_promo: '% promoção',
  justificativa: 'justificativa', funcao: 'função', salario: 'salário', convencao: 'convenção', tipo: 'tipo', plano: 'plano' };
function flNorm(k, v) {
  if (['mes_adm', 'mes_desl', 'mes_promo'].includes(k)) return v == null || v === '' || !Math.round(+v) ? null : Math.round(+v);
  if (k === 'qtd' || k === 'salario') return Math.round((+v || 0) * 100) / 100;
  if (k === 'pct_promo') return v == null || v === '' ? null : Math.round(+v * 1e6) / 1e6;
  const t = v == null ? '' : String(v).trim();
  return t || ({ convencao: 'BA', tipo: 'CLT', plano: 'N' })[k] || null;
}
const flTemBase = () => !!FOLHA && (FOLHA.pos.some(x => x.pt) || !!FOLHA.Pbase);
function flAlteradoPos(x) {     // campos alterados no app; vaga criada no app (sem linha de base) = ['vaga nova']
  if (!x.pt) return /^V/.test(x.id) && flTemBase() ? ['vaga nova'] : [];
  return FL_EDIT.filter(k => flNorm(k, x[k]) !== flNorm(k, x.pt[k]));
}
function flCaminhos(P) {        // = orc_folha_app.caminhos: só o que a tela altera + pessoas por área
  const o = {}; if (!P) return o;
  (P.dissidio || []).forEach(d => { if (!d.conv) return; const c = 'Dissídio ' + d.conv;
    o[c + ' · %'] = +(+d.pct || 0).toFixed(6); o[c + ' · mês data-base'] = Math.round(+d.db) || null; o[c + ' · mês aplicação'] = Math.round(+d.ap) || null; o[c + ' · compensação'] = d.comp || null; });
  Object.entries(P.p || {}).forEach(([k, v]) => o[FOLHA_ROT[k] || k] = typeof v === 'string' ? v : +(+v || 0).toFixed(6));
  (P.beneficios || []).forEach(b => { if (!b.nome) return;
    o[b.nome + ' · valor'] = +(+b.valor || 0).toFixed(2); o[b.nome + ' · reajuste'] = +(+b.reaj || 0).toFixed(6); o[b.nome + ' · mês'] = Math.round(+b.mes) || 13;
    o[b.nome + ' · fornecedor'] = (b.forn || []).slice().sort().join(';') || null;
    Object.entries(b.pessoas || {}).forEach(([a, n]) => { if (+n) o[b.nome + ' · pessoas ' + a] = +(+n).toFixed(2); });
    // 18/11/2026: benefício POR PESSOA (código → S / valor / 0) — = orc_folha_app.caminhos
    Object.entries(b.por_id || {}).forEach(([c, v]) => { o[b.nome + ' · ' + c] = (v === true || String(v).trim().toUpperCase() === 'S') ? 'S' : +(+v || 0).toFixed(2); }); });
  return o;
}
/* 18/11/2026 — BENEFÍCIOS POR PESSOA (planilha do RH): código anônimo × benefício. S = recebe o valor padrão · número = R$/mês próprio · 0 = não recebe ·
   vazio = vale a regra. É a tabela BENEFÍCIOS POR PESSOA da PREMISSAS_FOLHA do PT (o que muda aqui entra no PT na próxima geração). */
const flPpTot = b => Object.values(b.por_id || {}).reduce((s, v) => s + (String(v).trim().toUpperCase() === 'S' ? (+b.valor || 0) : (+v || 0)), 0);
function flCardPorPessoa(P, pe) {
  const BS = P.beneficios.map((b, i) => [b, i]).filter(([b]) => b.quem === 'LISTA' || Object.keys(b.por_id || {}).length);
  if (!BS.length) return '';
  const pos = Object.fromEntries((FOLHA.pos || []).map(x => [x.id, x]));
  const ord = c => [String(c)[0], +(String(c).replace(/\D/g, '') || 0)];
  const cods = [...new Set(BS.flatMap(([b]) => Object.keys(b.por_id || {})).concat(FOLHA._ppExtra || []))]
    .sort((a, b) => { const x = ord(a), y = ord(b); return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]; });
  const vv = (b, c) => { const v = (b.por_id || {})[c]; return v == null ? '' : (String(v).trim().toUpperCase() === 'S' ? 'S' : String(+v)); };
  const livres = (FOLHA.pos || []).map(x => x.id).filter(id => !cods.includes(id)).sort();
  return `<div class="card"><h3>Benefícios por pessoa ${pe ? '' : '<small>leitura</small>'} <small>${cods.length} códigos · planilha do RH</small></h3>
    <div class="csub">Código anônimo × benefício: <b>S</b> = recebe o valor padrão · número = valor próprio (R$/mês) · <b>0</b> = não recebe · vazio = vale a regra (quem recebe e convenção). Benefício LISTA = só quem tem valor aqui. Vale no PROJETAR FOLHA e entra no PT na próxima geração.</div>
    <div class="tw solta" style="max-height:440px"><table class="t"><thead><tr><th class="fx">Código</th><th>Área</th><th>Função</th>${BS.map(([b]) => `<th class="ed n" title="${esc(b.nome)}">${esc(b.nome.replace(/ \(.*\)$/, ''))}</th>`).join('')}</tr></thead><tbody>
    ${cods.map(c => `<tr><td class="fx nw"><b>${esc(c)}</b></td><td class="nw">${esc((pos[c] || {}).area || '—')}</td><td class="nw">${esc((pos[c] || {}).funcao || '')}</td>${BS.map(([b, i]) => `<td class="ed n"><input type="text" data-fpid="${i}" data-fpc="${esc(c)}" value="${esc(vv(b, c))}" ${pe ? '' : 'disabled'} style="width:62px"></td>`).join('')}</tr>`).join('')}
    </tbody><tfoot><tr><td colspan="3">Total R$/mês (S × valor padrão + valores próprios)</td>${BS.map(([b, i]) => `<td class="n" data-fppt="${i}">${Math.round(flPpTot(b)).toLocaleString('pt-BR')}</td>`).join('')}</tr></tfoot></table></div>
    ${pe ? `<div style="margin-top:6px"><select id="flPpCod"><option value="">+ incluir código…</option>${livres.map(id => `<option>${esc(id)}</option>`).join('')}</select></div>` : ''}</div>`;
}
function flAlteradoPrem() {
  if (!FOLHA || !FOLHA.Pbase) return [];
  const a = flCaminhos(FOLHA.P), b = flCaminhos(FOLHA.Pbase);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => (a[k] ?? null) !== (b[k] ?? null)).map(k => ({ k, pt: b[k] ?? null, app: a[k] ?? null }));
}
const flV = (v, pct) => v == null || v === '' ? '—' : typeof v === 'number' ? (pct ? (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%'
  : v.toLocaleString('pt-BR', { maximumFractionDigits: 6 })) : String(v);
/* 26/11/2026 (Silvio: "Sim, corrigir"): o aviso dizia "Alterado no app em relação ao PT carregado — entra na próxima geração" para TODA posição diferente
   da folha do mês, mas o PT aplica essas alterações a cada geração (aba FOLHA_APP). Agora separa: já está no PT carregado (gravada pela carga ou alterada
   até a leitura da folha pelo PT — D.meta.folha_app.lida_utc) × alterada depois da leitura ou ainda não salva (entra na próxima geração). */
const flLidaPT = () => { const u = D && D.meta && D.meta.folha_app && D.meta.folha_app.lida_utc; if (!u) return null;
  const t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(u) ? u : u + 'Z'); return isNaN(t) ? null : t; };
function flDepoisDoPT(em, por, sujo) {
  if (sujo) return true;                                                     // editado nesta tela e ainda não salvo
  const t = flLidaPT(); if (t == null) return true;                          // PT sem a leitura da folha do app: como antes
  if (/^rotina:orc_folha_app \(carga/.test(String(por || ''))) return false;  // gravado pela carga = o que o PT carregado tem
  const e = em ? Date.parse(em) : NaN; return !isNaN(e) && e > t;
}
function flQuadroAlteracoes(posA) {
  if (!flTemBase()) return '';
  const pk = new Set(Object.keys(FOLHA.P.p || {}).map(k => FOLHA_ROT[k] || k)),          // % como na tela: dissídio, reajuste e parâmetros entre 0 e 1
    pctQ = (k, v) => typeof v === 'number' && (/ · %$| · reajuste$/.test(k) || (pk.has(k) && v > 0 && v < 1));
  const lp = posA.map(x => [x, flAlteradoPos(x)]).filter(([, k]) => k.length), lq = flAlteradoPrem();
  if (!lp.length && !lq.length) return `<div class="csub">Folha do app = folha do mês (nada alterado no app).</div>`;
  const fa = (D.meta && D.meta.folha_app) || {}, lida = fa.lida_em ? ` (folha do app lida em ${esc(fa.lida_em)})` : '';
  const novaP = lp.filter(([x]) => flDepoisDoPT(x.atualizado_em, x.atualizado_por, FOLHA.sujo && FOLHA.sujo.has(x.id))),
    noPtP = lp.filter(p => !novaP.includes(p));
  const premNova = lq.length && flDepoisDoPT(FOLHA.Pem, FOLHA.Ppor, FOLHA.premSuja), nNova = novaP.length + (premNova ? lq.length : 0);
  const it = ([x, ks]) => ks[0] === 'vaga nova' ? `<li><b>${esc(x.id)}</b> (${esc(x.area)}) — vaga criada no app</li>`
    : `<li><b>${esc(x.id)}</b> (${esc(x.area)}) — ${ks.map(k => `${esc(FL_ROT[k] || k)}: ${esc(flV(flNorm(k, x.pt[k]), k === 'pct_promo'))} → <b>${esc(flV(flNorm(k, x[k]), k === 'pct_promo'))}</b>`).join(' · ')}</li>`;
  const ul = l => `<ul style="margin:6px 0 0 18px;font-size:12px;line-height:1.7">${l.map(it).join('')}</ul>`;
  const ulq = `<ul style="margin:6px 0 0 18px;font-size:12px;line-height:1.7">${lq.map(q => `<li>${esc(q.k)}: ${esc(flV(q.pt, pctQ(q.k, q.pt ?? q.app)))} → <b>${esc(flV(q.app, pctQ(q.k, q.app ?? q.pt)))}</b></li>`).join('')}</ul>`;
  return `<details class="card prem-det"><summary>Folha alterada no app em relação à folha do mês: <b>${lp.length}</b> posição(ões) · <b>${lq.length}</b> premissa(s) —
      ${nNova ? `<b>${nNova}</b> alteração(ões) feita(s) depois da geração do PT carregado <b>entram na próxima geração</b>; as demais já estão no PT${lida}`
              : `<b>todas já estão no PT carregado</b>${lida}`}</summary>
    <div class="csub">O PT é gerado com a folha do mês do Protheus e, por cima, o que foi alterado aqui (aba FOLHA_APP do PT). Valor da folha do mês → valor do app.</div>
    ${novaP.length ? `<div class="csub" style="margin-top:6px"><b>Depois da geração do PT carregado — entram na próxima geração:</b></div>${ul(novaP)}` : ''}
    ${noPtP.length ? `<div class="csub" style="margin-top:6px"><b>Já no PT carregado:</b></div>${ul(noPtP)}` : ''}
    ${lq.length ? `<div class="csub" style="margin-top:6px"><b>Premissas da folha — ${premNova ? 'entram na próxima geração' : 'já no PT carregado'}:</b></div>${ulq}` : ''}</details>`;
}
/* 17/11/2026 — SIMULADOR DE FOLHA REVISADO (Silvio: "Aprovo"): situação de cada posição, trava do quadro e modelo para baixar */
const FL_SIT_ORD = ['OCUPADA', 'VAGA PREVISTA', 'VAGA NÃO OCUPADA', 'CORTE ORÇAMENTÁRIO', 'AUMENTO DE QUADRO — CORTE ORÇAMENTÁRIO', 'AUMENTO DE QUADRO — AUTORIZADO'];
const folhaSitTag = s => `<span class="tag ${/CORTE/.test(s) ? 'r' : /AUTORIZADO/.test(s) ? 'y' : s === 'VAGA PREVISTA' ? 'b' : s === 'OCUPADA' ? 'g' : ''}">${esc(s)}</span>`;
const folhaTemAut = () => !!FOLHA && (!!window.ORC_FONTE_LOCAL || FOLHA.pos.some(x => 'autorizada_por' in x));
function folhaSitCelula(x, t) {
  const s = folhaSituacao(x, t); if (!s) return '';
  const ctl = est.papel === 'controladoria' && podeEditarFolha(x.area) && folhaTemAut();
  let h = folhaSitTag(s);
  if (x.autorizada_por) h += `<br><small style="color:var(--ink3)" title="Autorizada pela Controladoria">autorizada · ${esc(String(x.autorizada_por))}${x.autorizada_em ? ' · ' + esc(new Date(x.autorizada_em).toLocaleDateString('pt-BR')) : ''}</small>`;
  if (ctl && /^V/.test(x.id) && t && t.corte) h += `<br><button class="btn" data-flaut="${esc(x.id)}" data-flautv="1" style="margin-top:3px" title="Exceção à trava do quadro: a vaga passa a contar no GESTOR (fica no histórico)">Autorizar aumento</button>`;
  if (ctl && x.autorizada_por) h += `<br><button class="btn" data-flaut="${esc(x.id)}" data-flautv="0" style="margin-top:3px">Retirar autorização</button>`;
  return h;
}
async function baixaModeloFolha() {
  const salva = (blob, nome) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); };
  try {
    if (window.ORC_FONTE_LOCAL) { const r = await fetch('Simulador_FOPAG_2027_REVISADO.xlsx'); if (!r.ok) throw new Error('modelo não está na prévia'); salva(await r.blob(), 'Simulador_FOPAG_2027_REVISADO.xlsx'); return; }
    const { data, error } = await SB.from('orc_arquivo').select('nome,tipo,conteudo').eq('id', 'simulador_folha_revisado').maybeSingle();
    if (error || !data) { avisoFolha('O modelo revisado ainda não foi carregado no app (migração 059 + carga do arquivo pela Controladoria).', true); return; }
    const bin = atob(data.conteudo), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    salva(new Blob([u8], { type: data.tipo }), data.nome);
  } catch (e) { avisoFolha('Não foi possível baixar o modelo: ' + (e.message || e), true); }
}
function proximaVaga(area) {
  const ai = Object.keys(FOLHA.P.areas).indexOf(area) + 1, pre = 'V' + String(ai).padStart(2, '0');
  const n = FOLHA.pos.filter(x => x.id.startsWith(pre)).map(x => +x.id.slice(3) || 0);
  return pre + (Math.max(0, ...n) + 1);
}
/* rótulos dos parâmetros de encargos / provisões / rescisão (tela da folha e exportação em Excel/PDF) */
const FOLHA_ROT = { inss: 'INSS patronal', terceiros: 'Outras entidades (terceiros)', rat: 'RAT/SAT', fgts: 'FGTS', fgts_apr: 'FGTS do aprendiz', prov_fer: 'Provisão de férias (1/12 × 4/3)',
  prov_13: 'Provisão de 13º (1/12)', enc_prov: 'Encargos sobre provisões (S/N)', meses_fer: 'Meses médios de férias em aberto', inss_pl: 'INSS sobre pró-labore',
  enc_abono: 'Encargos sobre o abono (S/N) — testado: N', aviso_base: 'Aviso prévio — dias base', aviso_ano: 'Aviso — dias por ano', aviso_max: 'Aviso — máximo de dias',
  multa_sjc: 'Multa FGTS sem justa causa', multa_acordo: 'Multa FGTS no acordo', aviso_acordo: 'Aviso no acordo (fração)', p13_mes1: 'Caixa: mês da 1ª parcela do 13º',
  p13_pct1: 'Caixa: % na 1ª parcela', p13_mes2: 'Caixa: mês da 2ª parcela do 13º' };
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
  const TRV = folhaTrava(posA), posE = folhaComTrava(posA);          // 17/11/2026: trava do quadro (2027 ≤ out/26) — simulador revisado
  const calc = posE.map(x => folhaPosicao(x, P));
  const pes = { fG: Array(12).fill(0), pjG: Array(12).fill(0), fM: Array(12).fill(0), adm: Array(12).fill(0), des: Array(12).fill(0), pro: Array(12).fill(0) };
  calc.forEach(l => { for (let i = 0; i < 12; i++) { if (l.PJ) pes.pjG[i] += l.ativo[i]; else pes.fG[i] += l.ativo[i]; if (!l.PJ) pes.fM[i] += l.BK; }
    const x = l.x; if (+x.mes_adm) pes.adm[x.mes_adm - 1] += +x.qtd || 0; if (+x.mes_desl) pes.des[x.mes_desl - 1]++; if (+x.mes_promo) pes.pro[x.mes_promo - 1]++; });
  const nFolha = posA.filter(x => /^P/.test(x.id)).length, nPJ = posA.filter(x => /^J/.test(x.id)).length;
  const vagas = posE.filter(x => /^V/.test(x.id) && (+x.qtd || 0) > 0 && +x.mes_adm).reduce((s, x) => s + (+x.qtd || 0), 0);
  const SIT = {}; posA.forEach(x => { const s_ = folhaSituacao(x, TRV[x.id]); if (s_) SIT[s_] = (SIT[s_] || 0) + 1; });
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
    <button class="btn" id="flModelo" title="Planilha do simulador de folha REVISADO (em branco, com a tabela de benefícios 2027) — o modelo a seguir pelos gestores">⬇ Simulador de folha — modelo revisado</button>
    ${ed ? `<button class="btn" id="flSalva" ${pendentes ? '' : 'disabled'}>Salvar alterações${pendentes ? ` (${pendentes})` : ''}</button><button class="btn primary" id="flProj">PROJETAR FOLHA — ${esc(area || (vis.length === 1 ? vis[0] : 'todas as áreas'))}</button>` : `<span class="tag">${versaoEditavel() ? 'somente leitura neste perfil' : 'versão fechada — somente leitura'}</span>`}
  </div>
  <div id="flAviso" hidden></div>
  ${flQuadroAlteracoes(posA)}
  <div class="csub">Situação das posições: ${FL_SIT_ORD.filter(k => SIT[k]).map(k => `${folhaSitTag(k)} ${SIT[k]}`).join(' · ') || '—'} · <b>trava do quadro</b>: por área e mês, CLT + aprendiz do GESTOR ≤ posição de out/2026 (vaga que passa fica fora; reposição vale; exceção só autorizada pela Controladoria).</div>
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
      <div class="tw" style="margin-top:8px"><table class="t" id="flTab"><thead><tr><th class="fx">ID</th><th>Área</th><th>Função</th><th>Tipo</th><th>Conv.</th><th>Admissão</th><th class="n">Salário</th><th class="n">Adicionais</th><th>Plano</th><th>Afast.</th><th>Situação</th>
        <th class="ed">Qtd</th><th class="ed">Mês admissão</th><th class="ed">Mês desligamento</th><th class="ed">Tipo de desligamento</th><th class="ed">Mês promoção</th><th class="ed">% promoção</th><th class="ed">Justificativa</th></tr></thead><tbody>
      ${lst.map(x => { const e = podeEditarFolha(x.area), vg = /^V/.test(x.id), ctl = est.papel === 'controladoria' && e, cad = e && (vg || ctl);
        const alt = flAlteradoPos(x);
        return `<tr ${FOLHA.sujo.has(x.id) ? 'style="background:#FFF7E6"' : ''}><td class="fx nw"><b>${esc(x.id)}</b>${alt.length ? ` <span class="tag y" title="Alterado no app (prevalece na próxima geração do PT): ${esc(alt.map(k => FL_ROT[k] || k).join(', '))}">app</span>` : ''}</td><td class="nw">${esc(x.area)}</td>
          <td>${cad ? inp(x.id, 'funcao', x.funcao, false, 180, 'text') : esc(x.funcao || '')}</td>
          <td>${cad ? sel(x.id, 'tipo', ['CLT', 'APRENDIZ', 'ESTAGIÁRIO', 'PJ'], x.tipo) : esc(x.tipo)}</td>
          <td>${cad ? sel(x.id, 'convencao', ['BA', 'SP', 'SEM BENEFÍCIO'], x.convencao) : esc(x.convencao)}</td><td>${esc(x.admissao || '')}</td>
          <td class="n">${cad ? inp(x.id, 'salario', x.salario, false, 90) : fmt(+x.salario, { uni: 'R$', dec: 2 })}</td>${tdN(+x.adicional, { uni: 'R$', dec: 2 })}
          <td>${cad ? sel(x.id, 'plano', ['S', 'N'], x.plano) : esc(x.plano)}</td><td>${esc(x.afastado)}</td>
          <td class="nw">${folhaSitCelula(x, TRV[x.id])}</td>
          <td class="ed">${inp(x.id, 'qtd', x.qtd, !e, 55)}</td><td class="ed">${inp(x.id, 'mes_adm', x.mes_adm, !e, 55)}</td><td class="ed">${inp(x.id, 'mes_desl', x.mes_desl, !e, 55)}</td>
          <td class="ed">${sel(x.id, 'tipo_desl', ['SEM JUSTA CAUSA', 'PEDIDO', 'ACORDO'], x.tipo_desl, !e)}</td><td class="ed">${inp(x.id, 'mes_promo', x.mes_promo, !e, 55)}</td>
          <td class="ed">${inp(x.id, 'pct_promo', x.pct_promo == null ? '' : +(x.pct_promo * 100).toFixed(2), !e, 60)}</td><td class="ed">${inp(x.id, 'justificativa', x.justificativa, !e, 200, 'text')}</td></tr>`; }).join('')}
      </tbody></table></div><div class="csub">% promoção em pontos percentuais (10 = 10%). Mês = 1 a 12.</div></div>`;
  }
  const pe = podeEditarPremissa(), pin = (path, v_, w = 70, tp = 'number') => `<input type="${tp}" data-fp="${path}" value="${esc(v_ ?? '')}" ${pe ? '' : 'disabled'} style="width:${w}px">`;
  const ROT = FOLHA_ROT;
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
  <div class="tw solta"><table class="t"><thead><tr><th>Benefício</th><th class="ed n">R$/pessoa/mês</th><th class="ed n">Reajuste %</th><th class="ed n">Mês</th><th>Quem</th><th>Convenção</th><th>Conta</th><th class="ed" title="Raiz do CNPJ (8 dígitos) do fornecedor deste benefício; vários separados por ponto e vírgula. No painel Fornecedores × meses, o esperado desse fornecedor passa a ser o do simulador (quadro da área × valor por pessoa).">Fornecedor do benefício (raiz do CNPJ)</th></tr></thead><tbody>
    ${P.beneficios.map((b, i) => `<tr><td>${esc(b.nome)}</td>${b.quem === 'HISTÓRICO' ? `<td class="n" title="Benefício pelo histórico: vale a média mensal jul–out/26 do fornecedor em cada área (centro de custo), sem valor por pessoa. Soma das áreas ao lado.">histórico · ${Math.round(Object.values(b.hist || {}).reduce((s, v) => s + (+v || 0), 0)).toLocaleString('pt-BR')}/mês</td>` : (b.quem === 'LISTA' && !(+b.valor) ? `<td class="n" title="Valor próprio de cada pessoa — cartão Benefícios por pessoa abaixo">por pessoa · ${Math.round(flPpTot(b)).toLocaleString('pt-BR')}/mês</td>` : `<td class="ed">${pin(`beneficios.${i}.valor`, +(+b.valor).toFixed(2), 90)}</td>`)}<td class="ed">${pin(`beneficios.${i}.reaj%`, +(b.reaj * 100).toFixed(2), 60)}</td><td class="ed">${pin(`beneficios.${i}.mes`, b.mes > 12 ? '' : b.mes, 50)}</td><td${b.quem === 'PESSOAS' ? ` title="Nº de pessoas informado por área (tabela PESSOAS POR ÁREA do PT) × valor por pessoa: ${esc(Object.entries(b.pessoas || {}).map(([a, n]) => a + ' ' + n).join(' · ') || 'sem pessoas informadas')}"` : ''}>${esc(b.quem)}${b.quem === 'PESSOAS' ? ' · ' + Object.values(b.pessoas || {}).reduce((s, v) => s + (+v || 0), 0) : ''}${Object.keys(b.por_id || {}).length ? ' · por pessoa ' + Object.keys(b.por_id).length : ''}</td><td>${esc(b.conv)}</td><td>${esc(b.conta)}</td><td class="ed">${pin(`beneficios.${i}.forn`, (b.forn || []).join('; '), 150, 'text')}</td></tr>`).join('')}
  </tbody></table></div>
  ${(() => { const PS = P.beneficios.map((b, i) => [b, i]).filter(([b]) => b.quem === 'PESSOAS'); if (!PS.length) return '';
    const AR = Object.keys(P.areas || {}), tot = b => Object.values(b.pessoas || {}).reduce((t_, n) => t_ + (+n || 0), 0);
    return `<div class="card"><h3>Pessoas por área — benefícios por PESSOAS ${pe ? '' : '<small>leitura</small>'}</h3><div class="csub">Nº de pessoas que usam o benefício em cada área (ex.: transporte por fornecedor) × valor por pessoa. Vale no PROJETAR FOLHA e entra no PT na próxima geração.</div>
      <div class="tw solta" style="max-height:440px"><table class="t"><thead><tr><th>Área</th>${PS.map(([b]) => `<th class="ed n">${esc(b.nome)}</th>`).join('')}</tr></thead><tbody>
      ${AR.map(a => `<tr><td class="nw">${esc(a)}</td>${PS.map(([b, i]) => `<td class="ed n"><input type="number" min="0" step="1" data-fpes="${i}" data-fpa="${esc(a)}" value="${esc((b.pessoas || {})[a] || '')}" ${pe ? '' : 'disabled'} style="width:70px"></td>`).join('')}</tr>`).join('')}
      </tbody><tfoot><tr><td>Total</td>${PS.map(([b, i]) => `<td class="n" data-fpt="${i}">${tot(b)}</td>`).join('')}</tr></tfoot></table></div></div>`; })()}
  ${flCardPorPessoa(P, pe)}
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
  const mo = $('flModelo'); if (mo) mo.onclick = () => baixaModeloFolha();
  document.querySelectorAll('#tela [data-flaut]').forEach(b => b.onclick = () => {       // 17/11/2026: exceção à trava do quadro (só Controladoria)
    const x = FOLHA.pos.find(p => p.id === b.dataset.flaut); if (!x) return;
    if (b.dataset.flautv === '1') { x.autorizada_por = window.USUARIO_EMAIL || 'controladoria'; x.autorizada_em = new Date().toISOString(); }
    else { x.autorizada_por = null; x.autorizada_em = null; }
    FOLHA.sujo.add(x.id); desenha();
    avisoFolha(b.dataset.flautv === '1' ? `Aumento de quadro autorizado em ${x.id} — Salvar e PROJETAR FOLHA (o banco registra quem e quando).` : `Autorização retirada em ${x.id} — Salvar e PROJETAR FOLHA.`);
  });
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
    if (k === 'forn') {   // 14/11/2026: fornecedor do benefício (painel Fornecedores × meses) = raízes de CNPJ; aceita o CNPJ inteiro
      const L = [...new Set(String(el.value).split(/[;,\s]+/).filter(Boolean).map(c => { c = c.replace(/\D/g, ''); return c.length === 14 ? c.slice(0, 8) : c; }))];
      if (L.some(c => c.length !== 8)) { alert('Informe a raiz do CNPJ (os 8 primeiros dígitos) ou o CNPJ inteiro; vários separados por ponto e vírgula.'); el.value = (o.forn || []).join('; '); return; }
      if (L.length) o.forn = L; else delete o.forn;
      el.value = L.join('; '); FOLHA.premSuja = true; marca(); return;
    }
    o[k] = v; if (path.startsWith('dissidio')) { const d = FOLHA.P.dissidio[+ks[1]]; d.atraso = Math.max(0, (+d.ap || 0) - (+d.db || 0)); }
    FOLHA.premSuja = true; marca();
  });
  // 16/11/2026: pessoas por área dos benefícios por PESSOAS (b.pessoas[área]; vazio ou 0 = ninguém)
  document.querySelectorAll('#tela [data-fpes]').forEach(el => el.onchange = () => {
    const b = FOLHA.P.beneficios[+el.dataset.fpes], a = el.dataset.fpa, n = el.value === '' ? 0 : +el.value;
    if (!Number.isFinite(n) || n < 0) { alert('Informe o número de pessoas (0 ou mais).'); el.value = (b.pessoas || {})[a] || ''; return; }
    b.pessoas = b.pessoas || {}; if (n) b.pessoas[a] = n; else { delete b.pessoas[a]; el.value = ''; }
    const t = document.querySelector(`#tela [data-fpt="${el.dataset.fpes}"]`); if (t) t.textContent = Object.values(b.pessoas).reduce((t_, x) => t_ + (+x || 0), 0);
    el.closest('td').style.background = '#FFF7E6'; FOLHA.premSuja = true; marca();
  });
  // 18/11/2026: benefícios POR PESSOA (b.por_id[código] = 'S' | número | 0; vazio = sai do mapa e vale a regra)
  document.querySelectorAll('#tela [data-fpid]').forEach(el => el.onchange = () => {
    const b = FOLHA.P.beneficios[+el.dataset.fpid], c = el.dataset.fpc, t = el.value.trim().toUpperCase().replace(',', '.');
    if (t !== '' && t !== 'S' && !(Number.isFinite(+t) && +t >= 0)) {
      alert('Use S (valor padrão), um valor em R$ (0 = não recebe) ou deixe vazio (vale a regra).'); el.value = ((b.por_id || {})[c] ?? '') + ''; return;
    }
    b.por_id = b.por_id || {};
    if (t === '') delete b.por_id[c]; else b.por_id[c] = t === 'S' ? 'S' : +t;
    if (!Object.keys(b.por_id).length) delete b.por_id;
    const tt = document.querySelector(`#tela [data-fppt="${el.dataset.fpid}"]`); if (tt) tt.textContent = Math.round(flPpTot(b)).toLocaleString('pt-BR');
    el.closest('td').style.background = '#FFF7E6'; FOLHA.premSuja = true; marca();
  });
  const ppSel = $('flPpCod'); if (ppSel) ppSel.onchange = () => { if (!ppSel.value) return; (FOLHA._ppExtra = FOLHA._ppExtra || []).push(ppSel.value); desenha(); };
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
    <td class="ed"><select disabled title="Decida na tela Decisões por linha"><option>${esc(l.de || '(padrão)')}</option>${ro ? '' : '<option>GESTOR</option><option>MODELO</option><option>OUTRO</option>'}</select></td><td class="n ed">${l.vo == null ? '—' : fmt(l.vo)}</td><td>${esc(l.da)}</td>${tdN(l.vf)}<td class="n ${cd(l.dfm, true)}">${fmt(l.dfm, { sinal: true })}</td><td class="nw">${l.semDec ? '<span class="tag y">a decidir</span>' : esc(l.st)}</td><td class="w ed">${esc(l.co) || '—'}</td></tr>`).join('')}
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
  const tagSt = s => `<span class="tag ${s === 'APROVADA FINAL' ? 'g' : s === 'EM REVISÃO' || s === 'ENVIADA À DIRETORIA' ? 'b' : s === 'REPROVADA' ? 'r' : s === 'SUBSTITUÍDA' ? '' : 'y'}">${esc(s)}</span>`;
  const dirV = v => [v.enviada_em ? `enviada ${dt_(v.enviada_em)}` : '', v.diretoria_decisao ? `<b>${esc(v.diretoria_decisao)}</b> ${dt_(v.diretoria_em)}` : '',
    v.diretoria_parecer ? `<small style="color:var(--ink3)">${esc(v.diretoria_parecer)}</small>` : '', v.rodada_de ? `<small>rodada após a reprova da ${esc(v.rodada_de)}</small>` : ''].filter(Boolean).join('<br>') || '—';
  const dt_ = x => x ? new Date(x).toLocaleString('pt-BR') : '—';
  return `${cabecalho('Versões (rodadas) e cenários', 'Cada rodada guarda o orçamento inteiro (DRE, linhas, folha, premissas, decisões e a composição analítica). Fluxo com a Diretoria: a Controladoria fecha a versão de trabalho e envia à Diretoria (fica fechada para edição) → a Diretoria APROVA (vira a FINAL, congelada — só ela vale no Orçado × Realizado mensal) ou REPROVA (fica no histórico com o motivo e abre a rodada seguinte, cópia, para os ajustes) — até a versão aprovada.')}
  ${fin ? `<div class="ok-box">✓ Versão FINAL aprovada: <b>${esc(fin.codigo)} · ${esc(fin.nome || '')}</b> em ${dt_(fin.aprovada_em)} por ${esc(fin.aprovada_por || '')} — referência do acompanhamento mensal.</div>`
        : '<div class="aviso">Nenhuma versão aprovada como FINAL ainda — o acompanhamento usa a versão selecionada como referência provisória.</div>'}
  <div id="vrAviso" hidden></div>
  <div class="tw solta"><table class="t"><thead><tr><th>Versão</th><th>Nome</th><th>Situação</th><th>Origem</th><th>Criada</th><th>Diretoria</th><th></th></tr></thead><tbody>
    ${(est.versoes || []).map(v => `<tr ${v.codigo === est.versao ? 'class="hl"' : ''}><td><b>${esc(v.codigo)}</b>${v.codigo === est.versao ? ' <span class="tag b">aberta</span>' : ''}</td><td>${esc(v.nome || '')}</td><td>${tagSt(v.status)}</td><td class="w">${esc(v.origem || '')}</td>
      <td class="nw">${dt_(v.criada_em)}<br><small style="color:var(--ink3)">${esc(v.criada_por || '')}</small></td><td class="w">${dirV(v)}</td>
      <td class="nw">${v.codigo !== est.versao ? `<button class="btn" data-vabre="${esc(v.codigo)}">Abrir</button> ` : ''}${ctl ? `<button class="btn" data-vnova="${esc(v.codigo)}">Nova rodada a partir desta</button> ` +
        (['RASCUNHO'].includes(v.status) ? `<button class="btn" data-vst="${esc(v.codigo)}|EM REVISÃO">Em revisão</button> ` : '') +
        (['RASCUNHO', 'EM REVISÃO'].includes(v.status) ? `<button class="btn primary" data-vfx="${esc(v.codigo)}|ENVIAR">Fechar e enviar à Diretoria</button>` : '') +
        (v.status === 'ENVIADA À DIRETORIA' ? `<button class="btn primary" data-vfx="${esc(v.codigo)}|APROVAR">Diretoria aprovou</button> <button class="btn" data-vfx="${esc(v.codigo)}|REPROVAR">Diretoria reprovou → nova rodada</button> <button class="btn" data-vfx="${esc(v.codigo)}|REABRIR">Reabrir para ajuste</button>` : '') : ''}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="row2">
   <div class="card"><h3>Cenários de receita 2027</h3><div class="csub">Curva mensal do faturamento</div>
    ${Object.entries(rec).filter(([k]) => k !== 'Adotado').map(([k, r]) => `<div class="sumline"><span class="t">${esc(k)} ${k === D.meta.cenario ? '<span class="tag g">calculado</span>' : '<span class="tag">exige nova geração</span>'}<br><small style="color:var(--ink3)">${esc(r.rotulo)}</small></span><span class="v">${rsC(r.tot)}</span></div>`).join('')}</div>
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
  // Fluxo com a Diretoria (Silvio 25/11/2026; migração 063, RPC orc_fluxo_versao — só a Controladoria): ENVIAR · APROVAR · REPROVAR (→ rodada seguinte) · REABRIR
  document.querySelectorAll('#tela [data-vfx]').forEach(b => b.onclick = async () => {
    const [cod, acao] = b.dataset.vfx.split('|'), prox = 'V' + (Math.max(0, ...est.versoes.map(v => +v.codigo.slice(1) || 0)) + 1);
    const P = {
      ENVIAR: [`Observação do envio (opcional — ex.: "enviada à Diretoria por e-mail em ${new Date().toLocaleDateString('pt-BR')}"):`, false,
        `Fechar ${cod} e enviar à Diretoria? A versão fica FECHADA para edição (gestores, Controladoria e rotinas) até a decisão da Diretoria. Exige a composição analítica conferida (carga do PT, sem rateio).`],
      APROVAR: ['Quem aprovou e onde (reunião, ata ou e-mail)?', true,
        `Registrar a APROVAÇÃO da ${cod} pela Diretoria? Ela vira a versão FINAL do orçamento 2027 — congelada, referência do Orçado × Realizado mensal.`],
      REPROVAR: ['Motivo da reprova — o que a Diretoria pediu para mudar?', true,
        `Registrar a REPROVA da ${cod}? Ela fica REPROVADA (histórico, com o motivo) e a rodada ${prox} é criada como cópia dela, em RASCUNHO, para os ajustes.`],
      REABRIR: ['Por que a versão volta para ajuste antes da decisão da Diretoria?', true,
        `Reabrir ${cod}? Ela sai da Diretoria e volta a RASCUNHO (editável).`] }[acao];
    const txt = prompt(P[0], ''); if (txt === null) return;
    if (P[1] && !txt.trim()) return aviso('Informação obrigatória para registrar ' + acao.toLowerCase() + ' — nada foi alterado.', true);
    if (!confirm(P[2])) return;
    if (window.ORC_FONTE_LOCAL) {
      const v = est.versoes.find(x => x.codigo === cod), agora = new Date().toISOString();
      if (acao === 'ENVIAR') Object.assign(v, { status: 'ENVIADA À DIRETORIA', enviada_em: agora, enviada_por: 'prévia', diretoria_parecer: txt });
      if (acao === 'APROVAR') { est.versoes.forEach(x => { if (x.status === 'APROVADA FINAL') x.status = 'SUBSTITUÍDA'; }); Object.assign(v, { status: 'APROVADA FINAL', aprovada_em: agora, aprovada_por: 'prévia', diretoria_decisao: 'APROVADA', diretoria_em: agora, diretoria_parecer: txt }); }
      if (acao === 'REPROVAR') { Object.assign(v, { status: 'REPROVADA', diretoria_decisao: 'REPROVADA', diretoria_em: agora, diretoria_parecer: txt }); est.versoes.push({ codigo: prox, nome: `${prox} · rodada (reprova da ${cod})`, status: 'RASCUNHO', origem: 'cópia de ' + cod, rodada_de: cod, criada_em: agora, criada_por: 'prévia' }); }
      if (acao === 'REABRIR') Object.assign(v, { status: 'RASCUNHO', diretoria_decisao: 'REABERTA', diretoria_em: agora, diretoria_parecer: txt });
      montaSeletores(); desenha(); return;
    }
    const { data, error } = await SB.rpc('orc_fluxo_versao', { p_codigo: cod, p_acao: acao, p_texto: txt });
    if (error) return aviso((/orc_fluxo_versao|function|schema cache/i.test(error.message) && !/Versão|versão|Diretoria|Informe|composição/.test(error.message)
      ? 'O fluxo da Diretoria ainda não está no banco (migração 063 a rodar no Supabase). ' : 'Não foi possível registrar: ') + error.message, true);
    await trocaVersao(acao === 'REPROVAR' && data ? data : est.versao);
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
  return `${cabecalho('Auditoria — fornecedor lançado fora da regra validada', 'Confronto do PT: regras VALIDADAS da central de de-para (centro de custo exclusivo ou permitidos e conta adequada) × lançamentos de jul–out/26. A auditoria ao vivo, que inclui as regras ainda a validar, está em Fornecedor × CC × conta.')}
  <section class="kpis"><div class="kpi"><div class="lab">Lançamentos fora da regra validada</div><div class="val down">${F.length}</div><div class="meta">${rs(soma(F, r => r[6]))}</div></div>
   <div class="kpi k3"><div class="lab">Pares fornecedor × conta fora</div><div class="val">${pares.length}</div><div class="meta">na visão fornecedor × conta do PT</div></div></section>
  <div class="tw solta"><table class="t"><thead><tr><th>Mês</th><th>Fornecedor</th><th>Conta</th><th>CC</th><th>Área do CC</th><th>Histórico</th><th class="n">D − C</th><th>Confronto</th></tr></thead><tbody>
   ${F.sort((a, b) => Math.abs(b[6]) - Math.abs(a[6])).map(r => `<tr><td>${MESES[+String(r[0]).slice(4) - 1]}/26</td><td class="w">${esc(dic.nome[r[14]])}</td><td>${esc(r[4])}</td><td>${esc(r[5])}</td><td>${esc(dic.setor[r[10]])}</td><td class="w">${esc(r[7])}</td>${tdN(r[6], { uni: 'R$', dec: 2 })}<td class="w"><span class="tag r">${esc(dic.conf[r[15]])}</span></td></tr>`).join('')}
  </tbody></table></div>
  <div class="card"><h3>Pares fornecedor × conta com lançamento fora da regra validada</h3>${tabelaSimples(cf, pares, [1, 2, 3, 5, 9, 10, 11, 13, 14, 20])}</div>`;
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
  ${ct.length ? '' : '<div class="info">Nenhum gestor marcou CONTRATO = S no template 2027 — a coluna existe na grade de Meu orçamento (obrigatória para despesa recorrente quando o gestor preencher no app).</div>'}`;
};
TELAS.aud_mapa = () => `${cabecalho('Mapa de anomalias de contabilização', 'Fornecedor × conta × mês: fornecedor que troca de conta, conta que muda de padrão, lançamento fora do comportamento histórico. Pré-final do fechamento desde 11/11/2026.')}
  <div class="info">Fonte: rotina do detector de contabilização (skill <b>detector-contabilizacao</b>) sobre o razão do Protheus. Entra no app com a carga mensal do Protheus (a construir) — o mês fechado gera o mapa e a tela mostra o que mudou em relação ao mês anterior, com abertura até o lançamento.</div>
  <div class="tw solta"><table class="t"><thead><tr><th>Fornecedor</th><th>Conta habitual</th><th>Conta no mês</th><th>Mês</th><th class="n">Valor</th><th>Tipo</th><th>Situação</th></tr></thead><tbody><tr><td colspan="7" class="vazio">Aguardando a primeira carga mensal.</td></tr></tbody></table></div>`;
TELAS.aud_ajustes = () => {
  const A = D.ajustes, por = {}; A.rows.forEach(r => { const x = por[r[1]] ||= { n: 0, v: 0, e: 0 }; x.n++; x.v += r[10]; x.e += r[14]; });
  return `${cabecalho('Ajustes gerenciais do realizado 2026', esc(A.nota))}
  ${trava('STATUS e APLICAR (S/N) ainda não se alteram no app: hoje os ajustes vêm da lista da Controladoria e entram a cada geração da versão. A edição aqui, com histórico, é uma próxima etapa.')}
  <section class="kpis">${Object.entries(por).map(([t, x]) => `<div class="kpi k5"><div class="lab">${esc(t)}</div><div class="val">${rsC(x.v)}</div><div class="meta">${x.n} ajuste(s) · efeito anualizado ${rsC(x.e)}</div></div>`).join('')}</section>
  ${tabelaSimples(A, A.rows, [0, 1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14])}`;
};
TELAS.aud_anom = () => {
  const A = D.anomalias, area = est.f.anArea || '', grav = est.f.anGrav || null;
  const lista = A.lista.filter(r => (!area || r[0] === area) && (!grav || r[4] === grav));
  const gravs = [...new Set(A.lista.map(r => r[4]))];
  return `${cabecalho('Relatório de anomalias orçamentárias por área', `Fonte: ${esc(A.fonte)}. Regras R1–R6 + I1 (acima da inflação sem explicação, sem histórico, gasto não orçado, conta de outro gestor, linha incompleta, diretoria não segregada, % do faturamento).`)}
  <div class="aviso">🔒 <b>Envio bloqueado.</b> Nenhum comunicado aos gestores sai sem ordem do Silvio (revisão área por área). O envio pelo Thor só sai com ordem dele, depois dos de-paras concluídos.</div>
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
const FILTRAVEIS = /^(TIPO DE PJ|CONTA × TIPO|BENEFÍCIO|ÁREA PELO TIPO|STATUS|SITUAÇÃO|RUBRICA|NATUREZA|CENTRALIZADA|DEPTO GESTOR|LINHA DA DRE|MÉTODO|SETOR|SETOR ORÇAMENTÁRIO|ÁREA RESPONSÁVEL|ÁREA PREDOMINANTE|LINHA DRE TCP|GRUPO|LISTA DO COMUNICADO|REAJUSTE|RATEIO|PREVALECE|CAIXA|AUDITAR|CLASSIFICAÇÃO|GERENTE|UF)/;
const CFG_NOTA = {          // 16/11/2026: o app é a fonte — estas telas mostram o que o PT desta versão usou e dizem onde se altera
  fornecedor: 'Só leitura: é o que o PT desta versão usou. A regra de cada fornecedor se altera em <a href="#cfg_central">Configuração › Central de de-para (fornecedores)</a>; o PT lê a central a cada geração.',
  representantes: 'Só leitura: lista do app Comercial, lida a cada geração do PT. A comissão é % da receita bruta (premissa).' };
function telaCfg(chave, titulo, desc) {
  const b = D['cfg_' + chave], fk = 'cfg_' + chave, f = est.f[fk] ||= { filtros: {}, ord: null, lim: 200 };
  const filtraveis = b.cols.map((c, i) => [c, i]).filter(([c, i]) => FILTRAVEIS.test(c) && new Set(b.rows.map(r => r[i])).size <= 60);
  let rows = b.rows.filter(r => Object.entries(f.filtros).every(([i, v]) => v === '' || String(r[i] ?? '') === v));
  if (f.ord) { const [i, dir] = f.ord; rows = rows.slice().sort((a, c) => { const x = a[i], y = c[i]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR', { numeric: true })) * dir; }); }
  const iSt = b.cols.findIndex(c => c === 'STATUS'), cont = {}; if (iSt >= 0) b.rows.forEach(r => cont[r[iSt]] = (cont[r[iSt]] || 0) + 1);
  const tipos = b.tipos || [];
  return `${cabecalho(titulo, desc || esc(b.nota))}
  ${CFG_NOTA[chave] ? `<div class="info">${CFG_NOTA[chave]}</div>` : ''}
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
 ['tcp', 'De-para conta → linha da DRE TCP', null], ['fornecedor', 'De-para de fornecedores', 'Fornecedor × conta → área responsável, rateio e se prevalece sobre o CC (regra 1b do setor final; as regras estão na Central de de-para).'],
 ['cc', 'De-para de centros de custo', 'CC → setor orçamentário (validado pela árvore de CC em 11/11/2026).'],
 ['representantes', 'Representantes — comissão = % da receita bruta', '🔴 REGRA DURA (Silvio 13/11/2026): a linha de comissões é estimada em % da receita bruta; contratos e despesas de representante são ignorados no orçamento, exceto os contratos dos gerentes comerciais. Lista de representantes do app Comercial.'], ['excecoes', 'Exceções conta × CC / TAG → setor', 'Prioridade máxima na regra do setor final.']].forEach(([k, t, d]) => {
  TELAS['cfg_' + k] = () => D['cfg_' + k] ? telaCfg(k, t, d) : `${cabecalho(t, d || '')}<p class="nota">Sem dados nesta versão (regerar os blocos do PT).</p>`;
  POS['cfg_' + k] = () => { if (D['cfg_' + k]) posCfg(k); }; });

TELAS.cfg_premissas = () => {
  const P = D.premissas, val = v => typeof v === 'number' ? (Math.abs(v) < 1 && v !== 0 ? pc(v, 2) : fmt(v, { uni: 'R$' })) : esc(v);
  return `${cabecalho('Premissas do orçamento, da DRE e do caixa 2027', 'As premissas se alteram no app e entram na próxima geração do PT. Inflação = IPCA 2027 do Boletim Focus, atualizar a cada boletim.')}
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
  <div class="card arvore"><ul>${Object.entries(g).sort().map(([gr, rs]) => `<li><span class="no">${esc(gr === '—' ? 'Fora da árvore (NÃO USAR)' : gr)}</span> <span class="tag">${rs.length} CC</span><ul>
   ${rs.sort((a, c) => String(a[1]).localeCompare(String(c[1]))).map(r => `<li class="cc"><code>${esc(r[1])}</code> ${esc(r[2])} → <b>${esc(r[3])}</b> <span class="tag ${r[4] === 'VÁLIDO' ? 'g' : 'r'}">${esc(r[4])}</span> ${r[6] === 'S' ? '' : '<span class="tag y">sai da lista</span>'} <small style="color:var(--ink3)">${typeof r[5] === 'number' ? r[5] + ' lanç. desde 01/07' : ''} ${esc(r[7])}</small></li>`).join('')}</ul></li>`).join('')}</ul></div>`;
};
TELAS.cfg_setores = () => `${cabecalho('Setores e usuários', 'Setor orçamentário → gestor, grupo comparativo, bloco da DRE (onde cai o pessoal) e diretoria. A diretoria de cada setor é derivada da árvore de CC (maioria dos CCs ativos) — A VALIDAR.')}
  ${trava('Setores e gestores se alteram aqui quando a tabela do app está ativa; os usuários (e-mail → perfil e áreas) são cadastrados pelo administrador.')}
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
TELAS.sis_hist = () => `${cabecalho('Histórico de alterações', 'Trilha imutável: toda alteração salva no app (premissas, de-paras, exceções, centros de custo, setores, decisões, contratos e folha) grava quem, quando, registro, antes e depois. Ninguém altera nem apaga — só se acrescenta.')}
  <div class="tw solta"><table class="t"><thead><tr><th>Quando</th><th>Quem</th><th>Tela</th><th>Registro</th><th>Campo</th><th>Antes</th><th>Depois</th><th>Versão</th></tr></thead>
  <tbody><tr><td colspan="8" class="vazio">A trilha já é gravada no banco a cada alteração salva no app. A exibição da lista aqui é uma próxima etapa.</td></tr></tbody></table></div>`;
TELAS.sis_bases = () => {
  const M = D.meta, cargas = [
    ['Razão de resultado (CT2, contas 3.x)', 'extrai_base_orcamento.py', 'linhas · razao_*', 'mensal (após o fechamento) + sob demanda'],
    ['Contas fora da janela (jan–jun/26)', 'extrai_fora_janela_orcamento.py', 'linhas (rastreio, modelo 0)', 'na geração da versão'],
    ['Receita, deduções, CMV e IR (CT2)', 'extrai_base_dre_receita.py', 'dre · dre_tcp', 'mensal'],
    ['Saldos de disponibilidades (1110*)', 'extrai_saldo_caixa.py', 'base_caixa · caixa', 'mensal'],
    ['Aging a receber e a pagar', 'extrai_aging_orcamento.py', 'aging · caixa', 'mensal'],
    ['Ajustes gerenciais do realizado', 'ajustes_gerenciais_orcamento.py', 'ajustes', 'quando houver ajuste novo'],
    ['Realizado 2027 (CT2)', 'carga mensal (a construir)', 'acompanhamento', 'mensal a partir de jan/2027']];
  return `${cabecalho('Bases e cargas', 'O app é a fonte da configuração; o Protheus entra por extração somente leitura. A cada geração (só com ordem do Silvio), o gerador lê a configuração do app e os dados do Protheus, monta o PT — o espelho do app, para envio e análise — e a versão é carregada aqui.')}
  <div class="row2"><div class="card"><h3>Origem dos números desta versão</h3>
   ${[['Fonte', 'PT de gestão orçamentária gerado a partir da configuração do app (o espelho do app)'], ['Arquivo', M.arquivo], ['Salvo em', M.arquivo_mod], ['Blocos gerados em', M.gerado_em], ['Data-base do realizado', M.data_base + ' (jul–out/26 × ' + M.fator + ')'], ['Cenário', M.cenario + ' — ' + rs(M.receita)], ['Razão por lançamento', M.razao.linhas.toLocaleString('pt-BR') + ' lançamentos em ' + M.razao.partes + ' bloco(s)'],
     ...(M.central ? [['Central de de-para (fornecedores)', 'lida do app pelo gerador do PT em ' + M.central.lida_em + ' · última alteração ' + M.central.ultima + ' · ' + M.central.validados + ' de ' + M.central.fornecedores + ' validados · ' + M.central.excecoes + ' exceção(ões)']] : []), ['Contrato de dados', M.contrato]]
     .map(([t, v]) => `<div class="sumline"><span class="t">${esc(t)}</span><span class="v" style="max-width:62%;font-weight:500">${esc(v)}</span></div>`).join('')}</div>
   <div class="card"><h3>Blocos (orc_bloco) <small>assinatura SHA-256</small></h3><div class="tw solta" style="max-height:330px"><table class="t"><thead><tr><th>Bloco</th><th>SHA-256 (12)</th></tr></thead><tbody>
    ${Object.entries(M.sha || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td><code>${esc(v)}</code></td></tr>`).join('')}</tbody></table></div></div></div>
  <div class="tw solta"><table class="t"><thead><tr><th>Configuração no app (a fonte)</th><th>Onde se altera</th><th>Tabela</th></tr></thead><tbody>
   ${[['Premissas gerais', 'Configuração › Premissas', 'orc_premissa'], ['De-para de contas e linha da DRE TCP', 'Configuração › De-para de contas / De-para DRE TCP', 'orc_depara_conta'],
      ['Exceções de área (conta × CC ou marcação)', 'Configuração › Exceções', 'orc_excecao'], ['Centros de custo → área', 'Configuração › De-para de CC', 'orc_depara_cc'],
      ['Setores × gestores', 'Configuração › Setores e usuários', 'orc_setor'], ['Regras por fornecedor e apelidos', 'Configuração › Central de de-para (fornecedores)', 'orc_depara_fornecedor · orc_depara_excecao · orc_fornecedor_apelido'],
      ['Decisões por linha (GESTOR · MODELO · OUTRO)', 'Orçamento 2027 › Decisões por linha', 'orc_decisao'], ['Contratos recorrentes 2027', 'Orçamento 2027 › Contratos recorrentes', 'orc_contrato'],
      ['Folha 2027 (posições e premissas)', 'Orçamento 2027 › Folha 2027 (simulador)', 'orc_folha_posicao · orc_folha_premissa']]
     .map(c => `<tr><td>${esc(c[0])}</td><td>${esc(c[1])}</td><td><code>${esc(c[2])}</code></td></tr>`).join('')}</tbody></table></div>
  <div class="info">Na geração do PT (só com ordem do Silvio), o gerador lê toda a configuração acima direto do app e os dados do Protheus abaixo; o PT sai como espelho do app, para envio e análise, e a versão é carregada aqui.</div>
  <div class="tw solta"><table class="t"><thead><tr><th>Dados do Protheus (somente leitura)</th><th>Extrator (somente leitura, .env)</th><th>Alimenta</th><th>Periodicidade</th></tr></thead><tbody>
   ${cargas.map(c => `<tr><td>${esc(c[0])}</td><td><code>${esc(c[1])}</code></td><td>${esc(c[2])}</td><td>${esc(c[3])}</td></tr>`).join('')}</tbody></table></div>`;
};

if (typeof instalaOrcDre === 'function') instalaOrcDre();   // 13/11/2026: DRE (rótulos + detalhe por linha) e Premissas orçamentárias — orcamento_dre.js
if (typeof instalaOrcContratos === 'function') instalaOrcContratos();   // 13/11/2026: Contratos recorrentes 2027 (inclusão/alteração/exclusão) — orcamento_contratos.js
if (typeof instalaOrcDepara === 'function') instalaOrcDepara();         // 13/11/2026: Central de de-para por fornecedor + auditoria CC × conta — orcamento_depara.js
if (typeof instalaOrcExporta === 'function') instalaOrcExporta();       // 14/11/2026: Excel e PDF da DRE 2027, da DRE TCP e da Folha 2027 (simulador) — orcamento_exporta.js
if (typeof instalaOrcFornecedores === 'function') instalaOrcFornecedores();   // 14/11/2026: painel Fornecedores × meses (lacunas do orçado por fornecedor) — orcamento_fornecedores.js
if (typeof instalaOrcPremissas === 'function') instalaOrcPremissas();     // 14/11/2026: premissas gerais EDITÁVEIS (Configuração › Premissas; o PT lê a cada geração) — orcamento_premissas.js
if (typeof instalaOrcContas === 'function') instalaOrcContas();           // 15/11/2026: de-para de contas e da DRE TCP EDITÁVEIS (o PT lê a cada geração) — orcamento_contas.js
if (typeof instalaOrcDecisoes === 'function') instalaOrcDecisoes();       // 15/11/2026: decisões por linha EDITÁVEIS (o PT lê a cada geração) — orcamento_decisoes.js
if (typeof instalaOrcExcecoes === 'function') instalaOrcExcecoes();       // 15/11/2026: exceções conta × centro de custo EDITÁVEIS (o PT lê a cada geração) — orcamento_excecoes.js
if (typeof instalaOrcCC === 'function') instalaOrcCC();                   // 16/11/2026: de-para de centros de custo EDITÁVEL (o PT lê a cada geração) — orcamento_cc.js
if (typeof instalaOrcSetores === 'function') instalaOrcSetores();         // 16/11/2026: setores × gestores EDITÁVEIS (o PT lê a cada geração) — orcamento_setores.js
inicia();
