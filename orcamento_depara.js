/* CENTRAL DE DE-PARA POR FORNECEDOR — Silvio 13/11/2026: "precisa ter uma coluna para informar o centro de custo exclusivo, para servir de base
   para as auditorias… se não tiver configurado para modo exclusivo, então será permitido múltiplo centro de custos, onde no app posso selecionar todos,
   ou alguns, isso tudo servirá de base para auditorias e anomalias".
   Uma linha por fornecedor: MODO EXCLUSIVO (um centro de custo) ou MÚLTIPLO (todos ou alguns) + CONTA CONTÁBIL ADEQUADA; exceções por conta à parte.
   Lançamento do razão fora da regra = ANOMALIA (mesma conta da planilha CLAUDE_CENTRAL_DE_PARA: custo 3110301NNN e despesa 3120101NNN = mesma conta;
   ajuste gerencial fica fora). Carregado ANTES do orcamento.js; instalado pelo gancho instalaOrcDepara() (usa TELAS, POS, MENU, ITENS, D, RAZAO, est, SB…).
   Dados: tabelas orc_depara_fornecedor / orc_depara_excecao (migração 050; GLOBAIS — não são por versão; só a Controladoria altera; histórico em
   orc_alteracao). Prévia local: D.central_dados (alterações só na tela). Carga das sugestões: .claude/scripts/central_depara.py --grava. */
const CEN = { pronto: false, carregando: false, erro: null, rows: [], exc: [], sujo: new Set(), sujoExc: new Set(), apagar: new Set(), apagarExc: new Set(),
  noBanco: new Set(), noBancoExc: new Set(), msg: null, aud: null, audRev: -1, audRz: null, rev: 0 };
const CEN_CAMPOS = ['modo', 'cc_exclusivo', 'todos_ccs', 'ccs_permitidos', 'conta', 'status', 'observacao'];

const cenEq = c => { c = String(c ?? ''); return c.startsWith('3110301') ? '3120101' + c.slice(-3) : c; };   // custo × despesa do mesmo item = mesma conta
const cenEdita = () => est.papel === 'controladoria';
function cenCCs() {                                        // centros de custo do de-para de CC (+ "SEM CC", se a base não trouxer)
  const L = ((D.cfg_cc && D.cfg_cc.rows) || []).map(r => ({ cc: String(r[0]), desc: r[1] || '', area: /^(A CLASSIFICAR|SEM ÁREA)?$/.test(r[2] || '') ? '' : r[2] }))
    .filter(c => /^\d{3,4}$/.test(c.cc) || c.cc === 'SEM CC');
  if (!L.some(c => c.cc === 'SEM CC')) L.push({ cc: 'SEM CC', desc: '(lançamento sem centro de custo)', area: '' });
  return L.sort((a, b) => a.cc.localeCompare(b.cc));
}
const cenCC = cc => cenCCs().find(x => x.cc === String(cc)) || null;
const cenNorm = x => ({ ...x, conta: x.conta == null || x.conta === '' ? null : +x.conta, ccs_permitidos: [...(x.ccs_permitidos || [])], todos_ccs: !!x.todos_ccs });
const cenRegraTxt = r => r.modo === 'EXCLUSIVO' ? `EXCLUSIVO ${r.cc_exclusivo || '—'}` : (r.todos_ccs ? 'MÚLTIPLO — todos' : `MÚLTIPLO — ${(r.ccs_permitidos || []).length} CC(s)`);
const cenRegraOk = r => (r.modo === 'EXCLUSIVO' && !!r.cc_exclusivo) || (r.modo === 'MÚLTIPLO' && (r.todos_ccs || (r.ccs_permitidos || []).length > 0));

async function cenCarrega() {
  if (CEN.carregando) return;
  CEN.carregando = true; CEN.erro = null;
  try {
    if (!RAZAO) await carregaRazao();
    if (window.ORC_FONTE_LOCAL) {
      const c = D.central_dados || { fornecedores: [], excecoes: [] };
      CEN.rows = c.fornecedores.map(cenNorm); CEN.exc = c.excecoes.map(cenNorm);
    } else {
      CEN.rows = (await selTodos(() => SB.from('orc_depara_fornecedor').select('*').order('id'))).map(cenNorm);
      CEN.exc = (await selTodos(() => SB.from('orc_depara_excecao').select('*').order('id'))).map(cenNorm);
    }
  } catch (e) {
    CEN.erro = /orc_depara/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205'
      ? 'As tabelas da central de de-para ainda não existem no banco (migração 050 pendente). Depois do Run, a rotina carrega as sugestões.' : (e.message || String(e));
    CEN.rows = []; CEN.exc = [];
  }
  CEN.noBanco = new Set(CEN.rows.map(r => r.id)); CEN.noBancoExc = new Set(CEN.exc.map(e => e.id));
  CEN.sujo.clear(); CEN.sujoExc.clear(); CEN.apagar.clear(); CEN.apagarExc.clear();
  CEN.pronto = true; CEN.carregando = false; CEN.rev++;
  if (est.tela === 'cfg_central' || est.tela === 'aud_central') desenha();
}

/* auditoria: cada lançamento do razão (jul–out) × regra do fornecedor (ou da exceção por conta) */
function cenAud() {
  if (CEN.aud && CEN.audRev === CEN.rev && CEN.audRz === RAZAO) return CEN.aud;
  const dic = D.meta.razao.dic, regra = new Map(CEN.rows.map(r => [r.id, r])), exc = new Map(CEN.exc.map(e => [e.id, e]));
  const forn = new Map(), fora = new Map(), anom = [], tot = { base: 0, forn: 0, cauda: 0, sem: 0, aj: 0, nBase: 0, nForn: 0 };
  for (const r of RAZAO) {
    const v = r[6] || 0, f = r[13] && r[13] !== 'FSEMCGC' && r[13] !== 'None' ? r[13] : '', cc = r[5] || 'SEM CC', conta = String(r[4]);
    tot.base += v; tot.nBase++;
    if (r[2] === 'AJUSTE') { tot.aj += v; continue; }                    // ajuste gerencial do orçamento: fora da auditoria
    if (!f) { tot.sem += v; continue; }
    const R = regra.get(f), alvo = R ? forn : fora;
    let a = alvo.get(f);
    if (!a) { a = { id: f, nome: dic.nome[r[14]] || '', v: 0, n: 0, meses: new Set(), contas: {}, ccs: {}, anom: [], vAnom: 0 }; alvo.set(f, a); }
    a.v += v; a.n++; a.meses.add(r[0]); a.contas[conta] = (a.contas[conta] || 0) + v; a.ccs[cc] = (a.ccs[cc] || 0) + v;
    if (!R) { tot.cauda += v; continue; }
    tot.forn += v; tot.nForn++;
    const E = exc.get(f + '|' + conta), reg = E || R;
    const ccOk = reg.modo === 'EXCLUSIVO' ? cc === reg.cc_exclusivo : (reg.todos_ccs || (reg.ccs_permitidos || []).includes(cc));
    const ctOk = !!E || cenEq(conta) === cenEq(R.conta);
    if (!ccOk || !ctOk) {
      const txt = (!ccOk ? (reg.modo === 'EXCLUSIVO' ? `CC fora do exclusivo (${reg.cc_exclusivo})` : 'CC fora dos permitidos') : '')
        + (!ccOk && !ctOk ? ' · ' : '') + (!ctOk ? `Conta ≠ adequada (${R.conta ?? '—'})` : '');
      const x = { r, f, ccOk, ctOk, exclusivo: reg.modo === 'EXCLUSIVO', txt };
      anom.push(x); a.anom.push(x); a.vAnom += v;
    }
  }
  CEN.aud = { forn, fora, anom, tot }; CEN.audRev = CEN.rev; CEN.audRz = RAZAO;
  return CEN.aud;
}
const cenTop = o => Object.entries(o).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
function cenSugere(a) {                                    // fornecedor fora da central → sugestão pelo comportamento jul–out (≥ 90% num CC = EXCLUSIVO)
  const ccs = cenTop(a.ccs).filter(([, v]) => Math.abs(v) >= 0.01), tot = soma(ccs, x => Math.abs(x[1])) || 1;
  const eqc = {}; Object.entries(a.contas).forEach(([c, v]) => eqc[cenEq(c)] = (eqc[cenEq(c)] || 0) + v);
  const conta = (cenTop(eqc)[0] || [null])[0], exclusivo = !ccs.length || ccs.length === 1 || Math.abs(ccs[0][1]) / tot >= 0.9;
  return { id: a.id, cnpj: a.id.slice(1, 9), nome: a.nome || a.id, tipo: a.meses.size >= 3 ? 'RECORRENTE (sem contrato)' : 'PONTUAL', modo: exclusivo ? 'EXCLUSIVO' : 'MÚLTIPLO',
    cc_exclusivo: exclusivo ? (ccs[0] || ['SEM CC'])[0] : null, todos_ccs: false, ccs_permitidos: exclusivo ? [] : ccs.map(x => x[0]), conta: conta ? +conta : null,
    politica: 'Incluído no app: sugestão pelo comportamento jul–out', fonte: null, status: 'A VALIDAR', observacao: null, origem: 'MANUAL' };
}
function cenAviso(t, erro) { CEN.msg = { t, erro }; const el = $('cenAviso'); if (el) { el.className = erro ? 'aviso' : 'ok-box'; el.textContent = t; el.hidden = false; } }
function cenMuda(id, exc = false) { (exc ? CEN.sujoExc : CEN.sujo).add(id); CEN.rev++; }

async function cenSalva() {
  const ruins = CEN.rows.filter(r => CEN.sujo.has(r.id) && !cenRegraOk(r)).concat(CEN.exc.filter(e => CEN.sujoExc.has(e.id) && !cenRegraOk(e)));
  if (ruins.length) { cenAviso(`Regra incompleta em ${ruins.length} linha(s): EXCLUSIVO precisa do centro de custo; MÚLTIPLO precisa de TODOS ou de pelo menos um CC (${ruins[0].nome || ruins[0].id}).`, true); return false; }
  const n = CEN.sujo.size + CEN.sujoExc.size + CEN.apagar.size + CEN.apagarExc.size;
  if (!n) return true;
  if (window.ORC_FONTE_LOCAL) {
    CEN.sujo.forEach(id => CEN.noBanco.add(id)); CEN.sujoExc.forEach(id => CEN.noBancoExc.add(id));
    CEN.sujo.clear(); CEN.sujoExc.clear(); CEN.apagar.clear(); CEN.apagarExc.clear();
    cenAviso('Prévia local: alterações guardadas só nesta tela (no app publicado vão para o banco, com histórico de quem e quando).'); return true;
  }
  try {
    for (const id of CEN.apagarExc) { if (CEN.noBancoExc.has(id)) { const { error } = await SB.from('orc_depara_excecao').delete().eq('id', id); if (error) throw error; } CEN.noBancoExc.delete(id); }
    CEN.apagarExc.clear();
    for (const id of CEN.apagar) { if (CEN.noBanco.has(id)) { const { error } = await SB.from('orc_depara_fornecedor').delete().eq('id', id); if (error) throw error; } CEN.noBanco.delete(id); }
    CEN.apagar.clear();
    for (const id of [...CEN.sujo]) {
      const r = CEN.rows.find(x => x.id === id); if (!r) { CEN.sujo.delete(id); continue; }
      const campos = {}; CEN_CAMPOS.forEach(k => campos[k] = r[k] === '' ? null : r[k]);
      if (CEN.noBanco.has(id)) { const { error } = await SB.from('orc_depara_fornecedor').update(campos).eq('id', id); if (error) throw error; }
      else { const { error } = await SB.from('orc_depara_fornecedor').insert({ id: r.id, cnpj: r.cnpj, nome: r.nome, tipo: r.tipo, politica: r.politica, fonte: r.fonte, origem: 'MANUAL', ...campos }); if (error) throw error; CEN.noBanco.add(id); }
      CEN.sujo.delete(id);
    }
    for (const id of [...CEN.sujoExc]) {
      const e = CEN.exc.find(x => x.id === id); if (!e) { CEN.sujoExc.delete(id); continue; }
      const campos = { modo: e.modo, cc_exclusivo: e.cc_exclusivo || null, todos_ccs: e.todos_ccs, ccs_permitidos: e.ccs_permitidos, status: e.status, observacao: e.observacao || null };
      if (CEN.noBancoExc.has(id)) { const { error } = await SB.from('orc_depara_excecao').update(campos).eq('id', id); if (error) throw error; }
      else { const { error } = await SB.from('orc_depara_excecao').insert({ id: e.id, fornecedor: e.fornecedor, conta: e.conta, origem_regra: e.origem_regra, ...campos }); if (error) throw error; CEN.noBancoExc.add(id); }
      CEN.sujoExc.delete(id);
    }
    cenAviso('✓ Alterações salvas (com histórico de quem e quando).'); return true;
  } catch (e) { cenAviso('Não foi possível salvar: ' + (e.message || e), true); return false; }
}

const cenFiltros = aud => ({
  exc: r => r.modo === 'EXCLUSIVO', todos: r => r.modo === 'MÚLTIPLO' && r.todos_ccs, alguns: r => r.modo === 'MÚLTIPLO' && !r.todos_ccs,
  validar: r => r.status !== 'VALIDADO', anom: r => ((aud.forn.get(r.id) || {}).anom || []).length > 0 });
const cenCarregando = () => { setTimeout(cenCarrega, 0); return '<div class="status">Carregando a central de de-para e o razão jul–out…</div>'; };

function telaCentral() {
  if (!CEN.pronto || !RAZAO) return cenCarregando();
  const tit = 'Central de de-para — fornecedores';
  if (CEN.erro) return cabecalho(tit, '') + `<div class="aviso">${esc(CEN.erro)}</div>`;
  const f = est.f, aud = cenAud(), ed = cenEdita(), filtros = cenFiltros(aud), busca = (f.cenBusca || '').toUpperCase().trim(), card = f.cenCard || '';
  const casa = (r, a) => !busca || `${r.nome} ${r.id} ${r.tipo || ''} ${r.conta || ''} ${r.cc_exclusivo || ''} ${(r.ccs_permitidos || []).join(' ')} ${Object.keys((a || {}).ccs || {}).join(' ')}`.toUpperCase().includes(busca);
  const base = CEN.rows.filter(r => casa(r, aud.forn.get(r.id)));
  const cont = k => base.filter(filtros[k]).length;
  const foraL = [...aud.fora.values()].filter(a => !busca || `${a.nome} ${a.id}`.toUpperCase().includes(busca)).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  let L_ = card && card !== 'fora' ? base.filter(filtros[card]) : base;
  const val = r => (aud.forn.get(r.id) || { v: 0 }).v;
  L_ = L_.slice().sort((x, y) => Math.abs(val(y)) - Math.abs(val(x)) || x.nome.localeCompare(y.nome));
  const ccs = cenCCs(), nAn = soma(base, r => ((aud.forn.get(r.id) || {}).anom || []).length), vAn = soma(base, r => (aud.forn.get(r.id) || {}).vAnom || 0);
  const pend = CEN.sujo.size + CEN.sujoExc.size + CEN.apagar.size + CEN.apagarExc.size;
  const kp = (k, lab, v, meta, cls = '') => `<button class="kpi ${cls} ${card === k ? 'sel' : ''}" data-cencard="${k}"><div class="lab">${lab}</div><div class="val">${v}</div><div class="meta">${meta}</div></button>`;
  const linha = r => {
    const a = aud.forn.get(r.id) || { v: 0, n: 0, ccs: {}, contas: {}, anom: [], vAnom: 0 }, usados = cenTop(a.ccs).filter(([, v]) => Math.abs(v) >= 0.01);
    const eqc = {}; Object.entries(a.contas).forEach(([c, v]) => eqc[cenEq(c)] = (eqc[cenEq(c)] || 0) + Math.abs(v));
    const maisUsada = (cenTop(eqc)[0] || [null])[0], cx = cenCC(r.cc_exclusivo), exs = CEN.exc.filter(e => e.fornecedor === r.id).length;
    const dis = ed ? '' : 'disabled';
    return `<tr ${CEN.sujo.has(r.id) ? 'style="background:#FFF7E6"' : ''}>
      <td class="fx w"><b>${esc(r.nome)}</b><br><small style="color:var(--ink3)">${esc(r.cnpj || r.id)} · ${esc(r.tipo || '')}${r.origem === 'MANUAL' ? ' · incluído no app' : ''}</small></td>
      ${tdN(a.v)}
      <td class="w"><small>${usados.slice(0, 3).map(([c, v]) => `${esc(c)} ${esc(((cenCC(c) || {}).area || '').slice(0, 22))} (${fmt(v)})`).join('<br>') || '—'}${usados.length > 3 ? `<br>+ ${usados.length - 3} CC(s)` : ''}</small></td>
      <td class="ed"><select data-cenid="${esc(r.id)}" data-cenk="modo" ${dis}>${['EXCLUSIVO', 'MÚLTIPLO'].map(o => `<option ${r.modo === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
      <td class="ed nw">${r.modo === 'EXCLUSIVO'
        ? `<input list="cenListaCC" data-cenid="${esc(r.id)}" data-cenk="cc_exclusivo" value="${esc(r.cc_exclusivo || '')}" style="width:74px" ${dis}><br><small style="color:var(--ink3)">${esc(cx ? `${cx.desc} · ${cx.area}`.slice(0, 34) : (r.cc_exclusivo ? 'CC inexistente' : 'informe o CC'))}</small>`
        : `<button class="btn" data-cenccs="${esc(r.id)}">${r.todos_ccs ? 'TODOS' : `${r.ccs_permitidos.length} CC(s)`}</button>${r.todos_ccs ? '' : `<br><small style="color:var(--ink3)">${esc(r.ccs_permitidos.slice(0, 5).join(', '))}${r.ccs_permitidos.length > 5 ? '…' : ''}</small>`}`}</td>
      <td class="ed"><input list="cenListaConta" data-cenid="${esc(r.id)}" data-cenk="conta" value="${esc(r.conta ?? '')}" style="width:104px" ${dis}><br><small style="color:var(--ink3)">${esc((D.contaDesc[String(r.conta)] || (r.conta ? 'conta sem de-para' : 'informe a conta')).slice(0, 30))}${maisUsada && cenEq(r.conta) !== maisUsada ? `<br>mais usada: ${esc(maisUsada)}` : ''}</small></td>
      <td class="nw">${a.anom.length ? `<button class="btn" data-cendet="${esc(r.id)}" title="Ver os lançamentos fora da regra"><span class="tag r">${a.anom.length}</span> ${fmt(a.vAnom)}</button>` : '<small style="color:var(--ink3)">—</small>'}</td>
      <td class="nw"><span class="tag ${r.status === 'VALIDADO' ? 'g' : 'y'}">${esc(r.status)}</span>${ed ? ` <button class="btn" data-censt="${esc(r.id)}">${r.status === 'VALIDADO' ? 'Reabrir' : 'Validar'}</button>` : ''}</td>
      <td class="nw"><button class="btn" data-cendet="${esc(r.id)}">Regra${exs ? ` · ${exs} exc.` : ''}</button></td>
      <td class="ed"><input type="text" data-cenid="${esc(r.id)}" data-cenk="observacao" value="${esc(r.observacao || '')}" style="width:170px" ${dis}></td></tr>`;
  };
  return `${cabecalho(tit, 'Uma linha por fornecedor: <b>EXCLUSIVO</b> (um centro de custo — lançado em outro CC vira anomalia) ou <b>MÚLTIPLO</b> (todos ou alguns centros de custo) e a <b>conta contábil adequada</b>. É a base das auditorias e do relatório de anomalias. O que o fornecedor não resolve segue a conta e o centro de custo.',
    `<div class="filtros" style="margin-left:auto"><input id="cenBusca" placeholder="Fornecedor, CNPJ, conta ou CC" value="${esc(f.cenBusca || '')}" style="width:230px"></div>`)}
  <div id="cenAviso" class="${CEN.msg && CEN.msg.erro ? 'aviso' : 'ok-box'}" ${CEN.msg ? '' : 'hidden'}>${CEN.msg ? esc(CEN.msg.t) : ''}</div>
  <datalist id="cenListaCC">${ccs.map(c => `<option value="${esc(c.cc)}">${esc(c.desc)} · ${esc(c.area)}</option>`).join('')}</datalist>
  <datalist id="cenListaConta">${Object.entries(D.contaDesc).map(([c, d]) => `<option value="${esc(c)}">${esc(d)}</option>`).join('')}</datalist>
  <section class="kpis">
    ${kp('', 'Fornecedores na central', base.length, `${rsC(soma(base, val))} em jul–out · ${pc(div(aud.tot.forn, aud.tot.base))} da base`)}
    ${kp('exc', 'Exclusivo', cont('exc'), 'um centro de custo')}${kp('todos', 'Múltiplo — todos', cont('todos'), 'consumo de cada área', 'k5')}
    ${kp('alguns', 'Múltiplo — alguns', cont('alguns'), 'lista de centros de custo', 'k5')}${kp('validar', 'A validar', cont('validar'), 'sugestão ainda não confirmada', 'k2')}
    ${kp('anom', 'Com anomalia', cont('anom'), `${nAn} lançamento(s) · ${rsC(vAn)}`, 'k3')}
    ${kp('fora', 'Fora da central', foraL.length, `${rsC(soma(foraL, a => a.v))} · seguem a conta e o CC`)}
  </section>
  ${card === 'fora' ? `<div class="card"><h3>Fornecedores fora da central <small>${foraL.length} · seguem a regra da conta e do centro de custo</small></h3>
    <div class="csub">Para auditar um fornecedor por centro de custo e conta, inclua-o na central (a sugestão vem do comportamento de jul–out: 90% ou mais num CC = exclusivo).</div>
    <div class="tw" style="margin-top:6px"><table class="t"><thead><tr><th class="fx">Fornecedor</th><th class="n">Valor jul–out</th><th>Meses</th><th>CCs usados</th><th>Contas</th><th>Sugestão</th><th></th></tr></thead><tbody>
    ${foraL.slice(0, 200).map(a => { const s = cenSugere(a); return `<tr><td class="fx w"><b>${esc(a.nome || a.id)}</b><br><small style="color:var(--ink3)">${esc(a.id.slice(1))}</small></td>${tdN(a.v)}<td>${a.meses.size}</td>
      <td class="w"><small>${cenTop(a.ccs).slice(0, 3).map(([c, v]) => `${esc(c)} (${fmt(v)})`).join(' · ')}</small></td><td class="w"><small>${cenTop(a.contas).slice(0, 2).map(([c, v]) => `${esc(c)} (${fmt(v)})`).join(' · ')}</small></td>
      <td class="nw">${esc(cenRegraTxt(s))} · conta ${esc(s.conta ?? '—')}</td><td>${ed ? `<button class="btn" data-cenincluir="${esc(a.id)}">Incluir</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="vazio">Nenhum fornecedor fora da central neste filtro.</td></tr>'}
    </tbody></table></div>${foraL.length > 200 ? '<div class="csub">Mostrando os 200 maiores — use a busca.</div>' : ''}</div>`
  : `<div class="card"><h3>Regras por fornecedor ${card ? '— filtro do cartão' : ''} <small>${L_.length} linha(s)</small></h3>
    <div class="csub">Amarelo = editável pela Controladoria. <b>Anomalias</b> = lançamentos de jul–out fora da regra da linha (recalcula a cada alteração). <b>Regra</b> abre a política, as exceções por conta e os lançamentos.${ed ? '' : ' <b>Somente leitura neste perfil.</b>'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      ${ed ? `<button class="btn primary" id="cenSalvar" ${pend ? '' : 'disabled'}>Salvar alterações${pend ? ` (${pend})` : ''}</button>
      <button class="btn" id="cenValidarTodos" ${L_.some(r => r.status !== 'VALIDADO') ? '' : 'disabled'}>Validar as ${L_.filter(r => r.status !== 'VALIDADO').length} deste filtro</button>` : ''}</div>
    <div class="tw" style="margin-top:6px"><table class="t" id="cenTab"><thead><tr><th class="fx">Fornecedor</th><th class="n">Valor jul–out</th><th>CCs usados</th><th class="ed">Modo</th><th class="ed">Centro(s) de custo</th>
      <th class="ed">Conta adequada</th><th>Anomalias</th><th>Status</th><th></th><th class="ed">Observação</th></tr></thead><tbody>
    ${L_.slice(0, 300).map(linha).join('') || '<tr><td colspan="10" class="vazio">Nenhum fornecedor neste filtro.</td></tr>'}
    </tbody></table></div>${L_.length > 300 ? '<div class="csub">Mostrando 300 linhas — use os cartões ou a busca.</div>' : ''}</div>`}`;
}

/* painel: seleção dos centros de custo permitidos (todos ou alguns) — fornecedor ou exceção por conta */
function cenPainelCCs(id, exc = false) {
  const r = (exc ? CEN.exc : CEN.rows).find(x => x.id === id); if (!r) return;
  const a = cenAud().forn.get(exc ? r.fornecedor : r.id) || { ccs: {} }, sel = new Set(r.ccs_permitidos || []), porArea = {};
  const SEM = 'Sem área no orçamento'; cenCCs().forEach(c => (porArea[c.area || SEM] ||= []).push(c));
  abrePainel(`<div class="pl-top"><div><h3>Centros de custo permitidos</h3><p>${esc(exc ? `${id.replace('|', ' · conta ')}` : r.nome)} · marque todos ou alguns; lançamento fora deles vira anomalia</p></div><button class="x" data-fecha>Fechar ✕</button></div>
   <div class="pl-corpo">
    <label style="display:flex;gap:6px;align-items:center;font-weight:600;margin-bottom:8px"><input type="checkbox" id="cenTodos" ${r.todos_ccs ? 'checked' : ''}> TODOS os centros de custo (consumo de cada área)</label>
    <div id="cenLista" style="${r.todos_ccs ? 'opacity:.45;pointer-events:none' : ''}">
    ${Object.keys(porArea).sort((x, y) => (x === SEM) - (y === SEM) || x.localeCompare(y)).map(ar => `<div style="margin:8px 0 2px;font-size:12px;color:var(--ink3);text-transform:uppercase">${esc(ar)}</div>` + porArea[ar].map(c =>
      `<label style="display:flex;gap:6px;align-items:center;font-size:13px;padding:1px 0"><input type="checkbox" data-cc="${esc(c.cc)}" ${sel.has(c.cc) ? 'checked' : ''}> <b>${esc(c.cc)}</b> ${esc(c.desc)}${a.ccs[c.cc] ? ` <small style="color:var(--ink3)">· usado: ${fmt(a.ccs[c.cc])}</small>` : ''}</label>`).join('')).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="cenAplicaCCs">Aplicar</button><button class="btn" data-fecha>Cancelar</button></div>
   </div>`);
  $('drill').querySelectorAll('[data-fecha]').forEach(b => b.onclick = fechaPainel);
  $('cenTodos').onchange = e => { $('cenLista').style.opacity = e.target.checked ? '.45' : ''; $('cenLista').style.pointerEvents = e.target.checked ? 'none' : ''; };
  $('cenAplicaCCs').onclick = () => {
    const todos = $('cenTodos').checked, lista = [...$('drill').querySelectorAll('[data-cc]')].filter(x => x.checked).map(x => x.dataset.cc);
    if (!todos && !lista.length) { alert('Marque TODOS ou pelo menos um centro de custo.'); return; }
    r.todos_ccs = todos; r.ccs_permitidos = todos ? [] : lista; cenMuda(id, exc); fechaPainel(); desenha();
  };
}

/* painel do fornecedor: regra, política, exceções por conta e lançamentos fora da regra */
function cenPainelForn(id) {
  const r = CEN.rows.find(x => x.id === id); if (!r) return;
  const aud = cenAud(), a = aud.forn.get(id) || { v: 0, n: 0, ccs: {}, contas: {}, anom: [], vAnom: 0 }, ed = cenEdita(), dic = D.meta.razao.dic;
  const exs = CEN.exc.filter(e => e.fornecedor === id), an = a.anom.slice().sort((x, y) => Math.abs(y.r[6]) - Math.abs(x.r[6]));
  abrePainel(`<div class="pl-top"><div><h3>${esc(r.nome)}</h3><p>${esc(r.cnpj || r.id)} · ${esc(r.tipo || '')} · ${esc(cenRegraTxt(r))} · conta ${esc(r.conta ?? '—')} ${esc(D.contaDesc[String(r.conta)] || '')}</p></div><button class="x" data-fecha>Fechar ✕</button></div>
   <div class="pl-corpo">
    <div class="kpis"><div class="kpi"><div class="lab">Valor jul–out</div><div class="val">${fmt(a.v)}</div><div class="meta">${a.n} lançamento(s)</div></div>
      <div class="kpi k3"><div class="lab">Fora da regra</div><div class="val">${a.anom.length}</div><div class="meta">${rs(a.vAnom)}</div></div>
      <div class="kpi k5"><div class="lab">Status</div><div class="val" style="font-size:16px">${esc(r.status)}</div><div class="meta">${esc(r.atualizado_por && !/^rotina/.test(r.atualizado_por) ? r.atualizado_por : 'sugestão da rotina')}</div></div></div>
    ${r.politica ? `<div class="csub"><b>Por que esta regra:</b> ${esc(r.politica)}</div>` : ''}${r.fonte ? `<div class="csub"><b>Decisão registrada:</b> ${esc(r.fonte)}</div>` : ''}
    <div class="csub"><b>CCs usados:</b> ${cenTop(a.ccs).map(([c, v]) => `${esc(c)} ${esc((cenCC(c) || {}).area || '')} (${fmt(v)})`).join(' · ') || '—'}<br><b>Contas usadas:</b> ${cenTop(a.contas).map(([c, v]) => `${esc(c)} ${esc(D.contaDesc[c] || '')} (${fmt(v)})`).join(' · ') || '—'}</div>
    <h4 style="margin:6px 0 -6px">Exceções por conta <small style="font-weight:400;color:var(--ink3)">— outra conta que este fornecedor pode usar, com regra própria de centro de custo</small></h4>
    <div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Conta</th><th>Modo</th><th>Centro(s) de custo</th><th>Origem</th><th>Status</th><th></th></tr></thead><tbody>
    ${exs.map(e => `<tr ${CEN.sujoExc.has(e.id) ? 'style="background:#FFF7E6"' : ''}><td class="nw">${esc(e.conta)}<br><small style="color:var(--ink3)">${esc(D.contaDesc[String(e.conta)] || '')}</small></td><td>${esc(e.modo)}</td>
      <td class="nw">${e.modo === 'EXCLUSIVO' ? `${esc(e.cc_exclusivo)} <small style="color:var(--ink3)">${esc((cenCC(e.cc_exclusivo) || {}).area || '')}</small>` : (ed ? `<button class="btn" data-cenexccs="${esc(e.id)}">${e.todos_ccs ? 'TODOS' : `${e.ccs_permitidos.length} CC(s)`}</button>` : (e.todos_ccs ? 'TODOS' : esc(e.ccs_permitidos.join(', '))))}</td>
      <td class="w"><small>${esc(e.origem_regra || '')}</small></td><td><span class="tag ${e.status === 'VALIDADO' ? 'g' : 'y'}">${esc(e.status)}</span></td><td>${ed ? `<button class="btn" data-cenexdel="${esc(e.id)}">Remover</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma exceção: só a conta adequada é aceita.</td></tr>'}
    </tbody></table></div>
    ${ed ? `<div class="filtros" style="flex-wrap:wrap;gap:8px;margin:8px 0"><span class="rot">Nova exceção — conta</span><input id="cenExConta" list="cenListaConta" style="width:110px">
      <span class="rot">Modo</span><select id="cenExModo"><option>EXCLUSIVO</option><option>MÚLTIPLO</option></select>
      <span class="rot">CC (se exclusivo)</span><input id="cenExCC" list="cenListaCC" style="width:74px" value="${esc(r.cc_exclusivo || '')}"><button class="btn" id="cenExAdd">Incluir exceção</button></div>
      <div class="csub">Exceção MÚLTIPLO entra com TODOS os centros de custo; depois use o botão da linha para escolher alguns. Lembre de <b>Salvar alterações</b> na tela.</div>` : ''}
    <h4 style="margin:6px 0 -6px">Lançamentos fora da regra <small style="font-weight:400;color:var(--ink3)">— ${an.length} de ${a.n} em jul–out</small></h4>
    <div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Mês</th><th>Lote/Doc</th><th>Conta</th><th>CC</th><th>Área do CC</th><th>Histórico</th><th class="n">D − C</th><th>Motivo</th></tr></thead><tbody>
    ${an.slice(0, 300).map(x => `<tr><td class="nw">${MESES[+String(x.r[0]).slice(4) - 1]}/26</td><td class="nw">${esc(x.r[2])}/${esc(x.r[3])}</td><td>${esc(x.r[4])}</td><td>${esc(x.r[5] || 'SEM CC')}</td><td>${esc(dic.setor[x.r[10]] || '')}</td><td class="w">${esc(x.r[7])}</td>${tdN(x.r[6], { uni: 'R$', dec: 2 })}<td class="w"><span class="tag r">${esc(x.txt)}</span></td></tr>`).join('') || '<tr><td colspan="8" class="vazio">Nenhum lançamento fora da regra.</td></tr>'}
    </tbody></table></div>${an.length > 300 ? `<div class="vazio">Mostrando 300 de ${an.length}.</div>` : ''}
    ${ed && r.origem === 'MANUAL' ? `<div style="margin-top:14px"><button class="btn" id="cenRemove">Remover este fornecedor da central</button> <small style="color:var(--ink3)">volta a seguir a conta e o centro de custo</small></div>` : ''}
   </div>`);
  const dr = $('drill');
  dr.querySelectorAll('[data-fecha]').forEach(b => b.onclick = fechaPainel);
  dr.querySelectorAll('[data-cenexdel]').forEach(b => b.onclick = () => { const k = b.dataset.cenexdel; CEN.exc = CEN.exc.filter(e => e.id !== k); CEN.sujoExc.delete(k); if (CEN.noBancoExc.has(k)) CEN.apagarExc.add(k); CEN.rev++; desenha(); cenPainelForn(id); });
  dr.querySelectorAll('[data-cenexccs]').forEach(b => b.onclick = () => cenPainelCCs(b.dataset.cenexccs, true));
  const add = $('cenExAdd'); if (add) add.onclick = () => {
    const conta = String($('cenExConta').value).trim(), modo = $('cenExModo').value, cc = String($('cenExCC').value).trim();
    if (!D.contaDesc[conta]) { alert('Informe uma conta do plano (de-para de contas).'); return; }
    if (cenEq(conta) === cenEq(r.conta)) { alert('Esta já é a conta adequada do fornecedor.'); return; }
    if (CEN.exc.some(e => e.id === id + '|' + conta)) { alert('Já existe exceção para esta conta.'); return; }
    if (modo === 'EXCLUSIVO' && !cenCC(cc)) { alert('Informe um centro de custo válido para a exceção exclusiva.'); return; }
    const e = { id: id + '|' + conta, fornecedor: id, conta: +conta, modo, cc_exclusivo: modo === 'EXCLUSIVO' ? cc : null, todos_ccs: modo === 'MÚLTIPLO', ccs_permitidos: [], origem_regra: 'Incluída no app', status: 'VALIDADO', observacao: null };
    CEN.exc.push(e); CEN.apagarExc.delete(e.id); cenMuda(e.id, true); desenha(); cenPainelForn(id);
  };
  const rem = $('cenRemove'); if (rem) rem.onclick = () => {
    if (!confirm(`Remover ${r.nome} da central? As exceções dele saem junto.`)) return;
    CEN.exc.filter(e => e.fornecedor === id).forEach(e => { CEN.sujoExc.delete(e.id); if (CEN.noBancoExc.has(e.id)) CEN.apagarExc.add(e.id); });
    CEN.exc = CEN.exc.filter(e => e.fornecedor !== id); CEN.rows = CEN.rows.filter(x => x.id !== id); CEN.sujo.delete(id); if (CEN.noBanco.has(id)) CEN.apagar.add(id);
    CEN.rev++; fechaPainel(); desenha();
  };
}

function posCentral() {
  const f = est.f; CEN.msg = null;
  const b = $('cenBusca'); if (b) b.onchange = e => { f.cenBusca = e.target.value; desenha(); };
  document.querySelectorAll('#tela [data-cencard]').forEach(x => x.onclick = () => { f.cenCard = f.cenCard === x.dataset.cencard || !x.dataset.cencard ? null : x.dataset.cencard; desenha(); });
  document.querySelectorAll('#cenTab [data-cenid]').forEach(el => el.onchange = () => {
    const r = CEN.rows.find(x => x.id === el.dataset.cenid); if (!r) return;
    const k = el.dataset.cenk, v = String(el.value).trim();
    if (k === 'modo') {
      r.modo = v;
      const usados = cenTop((cenAud().forn.get(r.id) || { ccs: {} }).ccs).filter(x => Math.abs(x[1]) >= 0.01).map(x => x[0]);
      if (v === 'EXCLUSIVO') { if (!r.cc_exclusivo) r.cc_exclusivo = usados[0] || (r.ccs_permitidos || [])[0] || null; }
      else if (!r.todos_ccs && !(r.ccs_permitidos || []).length) { r.ccs_permitidos = [...new Set([r.cc_exclusivo, ...usados].filter(Boolean))]; if (!r.ccs_permitidos.length) r.todos_ccs = true; }
    } else if (k === 'cc_exclusivo') {
      if (!cenCC(v)) { cenAviso(`Centro de custo inexistente: ${v || '(vazio)'}. Escolha um da lista.`, true); el.value = r.cc_exclusivo || ''; return; }
      r.cc_exclusivo = v;
    } else if (k === 'conta') {
      if (!D.contaDesc[v]) { cenAviso(`Conta fora do de-para de contas: ${v || '(vazia)'}.`, true); el.value = r.conta ?? ''; return; }
      r.conta = +v;
    } else r[k] = v || null;
    cenMuda(r.id); desenha();
  });
  document.querySelectorAll('#tela [data-cenccs]').forEach(x => x.onclick = () => { if (cenEdita()) cenPainelCCs(x.dataset.cenccs); else cenPainelForn(x.dataset.cenccs); });
  document.querySelectorAll('#tela [data-cendet]').forEach(x => x.onclick = () => cenPainelForn(x.dataset.cendet));
  document.querySelectorAll('#tela [data-censt]').forEach(x => x.onclick = () => {
    const r = CEN.rows.find(y => y.id === x.dataset.censt); if (!r) return;
    if (r.status !== 'VALIDADO' && !cenRegraOk(r)) { cenAviso('Complete a regra antes de validar (centro de custo ou lista de CCs).', true); return; }
    r.status = r.status === 'VALIDADO' ? 'A VALIDAR' : 'VALIDADO'; cenMuda(r.id); desenha();
  });
  document.querySelectorAll('#tela [data-cenincluir]').forEach(x => x.onclick = () => {
    const a = cenAud().fora.get(x.dataset.cenincluir); if (!a || CEN.rows.some(r => r.id === a.id)) return;
    const s = cenSugere(a); CEN.rows.push(s); CEN.apagar.delete(s.id); cenMuda(s.id); f.cenCard = null; f.cenBusca = s.nome; desenha();
    cenAviso(`${s.nome} incluído na central (${cenRegraTxt(s)}). Confira a regra e clique em Salvar alterações.`);
  });
  const vt = $('cenValidarTodos'); if (vt) vt.onclick = () => {
    const aud = cenAud(), filtros = cenFiltros(aud), busca = (f.cenBusca || '').toUpperCase().trim(), card = f.cenCard;
    const L_ = CEN.rows.filter(r => r.status !== 'VALIDADO' && cenRegraOk(r) && (!card || card === 'fora' || filtros[card](r)) && (!busca || `${r.nome} ${r.id} ${r.tipo || ''} ${r.conta || ''}`.toUpperCase().includes(busca)));
    if (!L_.length || !confirm(`Validar ${L_.length} fornecedor(es) com a regra que está na tela?`)) return;
    L_.forEach(r => { r.status = 'VALIDADO'; CEN.sujo.add(r.id); }); CEN.rev++; desenha(); cenAviso(`${L_.length} regra(s) marcadas como validadas. Clique em Salvar alterações.`);
  };
  const s = $('cenSalvar'); if (s) s.onclick = async () => { s.disabled = true; await cenSalva(); desenha(); };
}

/* AUDITORIA — lançamentos fora da regra do fornecedor (CC e conta) */
function telaAudCentral() {
  if (!CEN.pronto || !RAZAO) return cenCarregando();
  const tit = 'Auditoria — fornecedor × centro de custo × conta';
  if (CEN.erro) return cabecalho(tit, '') + `<div class="aviso">${esc(CEN.erro)}</div>`;
  const f = est.f, aud = cenAud(), card = f.audCenCard || '', dic = D.meta.razao.dic, regra = new Map(CEN.rows.map(r => [r.id, r]));
  const fil = { exc: x => !x.ccOk && x.exclusivo, perm: x => !x.ccOk && !x.exclusivo, conta: x => !x.ctOk };
  const A = card ? aud.anom.filter(fil[card]) : aud.anom, porF = new Map();
  A.forEach(x => { let g = porF.get(x.f); if (!g) { g = { f: x.f, n: 0, v: 0, cc: 0, ct: 0 }; porF.set(x.f, g); } g.n++; g.v += x.r[6] || 0; if (!x.ccOk) g.cc++; if (!x.ctOk) g.ct++; });
  const G = [...porF.values()].sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const kp = (k, lab, L, cls = '') => `<button class="kpi ${cls} ${card === k ? 'sel' : ''}" data-audcen="${k}"><div class="lab">${lab}</div><div class="val">${L.length}</div><div class="meta">${rsC(soma(L, x => x.r[6]))}</div></button>`;
  const t = aud.tot;
  return `${cabecalho(tit, 'Lançamentos de jul–out/26 dos fornecedores da central que estão fora da regra: centro de custo diferente do exclusivo, fora dos centros de custo permitidos ou em conta diferente da adequada. Ajuste gerencial do orçamento não entra.')}
  <section class="kpis">${kp('', 'Lançamentos fora da regra', aud.anom, 'k3')}${kp('exc', 'CC fora do exclusivo', aud.anom.filter(fil.exc))}${kp('perm', 'CC fora dos permitidos', aud.anom.filter(fil.perm))}${kp('conta', 'Conta ≠ adequada', aud.anom.filter(fil.conta))}
    <div class="kpi k5"><div class="lab">Cobertura da central</div><div class="val">${pc(div(t.forn, t.base))}</div><div class="meta">cauda ${pc(div(t.cauda, t.base))} · sem fornecedor ${pc(div(t.sem, t.base))}</div></div></section>
  <div class="card"><h3>Por fornecedor <small>${G.length} fornecedor(es) · ${A.length} lançamento(s)</small></h3>
    <div class="csub">Clique no fornecedor para ver os lançamentos e a regra. As regras são mantidas em <a href="#cfg_central">Configuração › Central de de-para</a>.</div>
    <div class="tw solta"><table class="t"><thead><tr><th>Fornecedor</th><th>Regra</th><th>Conta adequada</th><th class="n">Lançamentos</th><th class="n">CC</th><th class="n">Conta</th><th class="n">Valor</th></tr></thead><tbody>
    ${G.slice(0, 300).map(g => { const r = regra.get(g.f) || {}; return `<tr style="cursor:pointer" data-cendet="${esc(g.f)}"><td class="w"><b>${esc(r.nome || g.f)}</b><br><small style="color:var(--ink3)">${esc(r.tipo || '')}</small></td>
      <td class="nw">${esc(cenRegraTxt(r))}${r.modo === 'EXCLUSIVO' ? ` <small style="color:var(--ink3)">${esc((cenCC(r.cc_exclusivo) || {}).area || '')}</small>` : ''}</td><td class="nw">${esc(r.conta ?? '—')}<br><small style="color:var(--ink3)">${esc((D.contaDesc[String(r.conta)] || '').slice(0, 28))}</small></td>
      <td class="n">${g.n}</td><td class="n">${g.cc || '–'}</td><td class="n">${g.ct || '–'}</td>${tdN(g.v, { uni: 'R$', dec: 2 })}</tr>`; }).join('') || '<tr><td colspan="7" class="vazio">Nenhum lançamento fora da regra.</td></tr>'}
    </tbody></table></div></div>
  <div class="card"><h3>Lançamentos <small>${A.length} · maiores primeiro</small></h3>
    <div class="tw solta"><table class="t"><thead><tr><th>Mês</th><th>Fornecedor</th><th>Conta</th><th>CC</th><th>Área do CC</th><th>Histórico</th><th class="n">D − C</th><th>Motivo</th></tr></thead><tbody>
    ${A.slice().sort((a, b) => Math.abs(b.r[6]) - Math.abs(a.r[6])).slice(0, 300).map(x => `<tr><td class="nw">${MESES[+String(x.r[0]).slice(4) - 1]}/26</td><td class="w">${esc(dic.nome[x.r[14]] || x.f)}</td><td>${esc(x.r[4])}</td><td>${esc(x.r[5] || 'SEM CC')}</td><td>${esc(dic.setor[x.r[10]] || '')}</td><td class="w">${esc(x.r[7])}</td>${tdN(x.r[6], { uni: 'R$', dec: 2 })}<td class="w"><span class="tag r">${esc(x.txt)}</span></td></tr>`).join('')}
    </tbody></table></div>${A.length > 300 ? `<div class="csub">Mostrando 300 de ${A.length} lançamentos.</div>` : ''}</div>`;
}
function posAudCentral() {
  document.querySelectorAll('#tela [data-audcen]').forEach(x => x.onclick = () => { est.f.audCenCard = est.f.audCenCard === x.dataset.audcen || !x.dataset.audcen ? null : x.dataset.audcen; desenha(); });
  document.querySelectorAll('#tela [data-cendet]').forEach(x => x.onclick = () => cenPainelForn(x.dataset.cendet));
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js antes de inicia()) */
function instalaOrcDepara() {
  if (window.__orcDep) return; window.__orcDep = true;
  const poe = (grupo, it, antes) => {
    const g = MENU.find(x => x.g === grupo); if (!g || g.itens.some(i => i.id === it.id)) return;
    const k = g.itens.findIndex(i => i.id === antes); g.itens.splice(k < 0 ? g.itens.length : k, 0, it); ITENS[it.id] = { ...it, g: g.g, gt: g.t };
  };
  poe('cfg', { id: 'cfg_central', t: 'Central de de-para (fornecedores)', ico: '⚙', r: CT_CEO }, 'cfg_conta');
  poe('aud', { id: 'aud_central', t: 'Fornecedor × CC × conta', ico: '⚑', r: CT_CEO }, 'aud_aloc');
  TELAS.cfg_central = telaCentral; POS.cfg_central = posCentral; TELAS.aud_central = telaAudCentral; POS.aud_central = posAudCentral;
  window.addEventListener('beforeunload', e => { if (CEN.sujo.size || CEN.sujoExc.size || CEN.apagar.size || CEN.apagarExc.size) { e.preventDefault(); e.returnValue = ''; } });
}
