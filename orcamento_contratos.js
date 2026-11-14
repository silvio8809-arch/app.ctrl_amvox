/* CONTRATOS RECORRENTES 2027 — Silvio 13/11/2026: "Sobre a aba contratos recorrentes 2027, pode criar e no app, possibilitar a inclusão,
   alteração e exclusão." Carregado ANTES do orcamento.js; instalado pelo gancho instalaOrcContratos() (usa TELAS, POS, MENU, ITENS, D, est, SB… de lá).
   Dados: tabela orc_contrato da versão (migração 049; trava por ÁREA no banco + histórico em orc_alteracao). Prévia local: D.contratos_dados
   (alterações só na tela). Valor 2027 = mesmas fórmulas da aba CONTRATOS_RECORRENTES_2027 do PT; as edições voltam ao PT na próxima geração
   (orc_app_dados.py --le-contratos → gerador --contratos-app). */
const CTR = { versao: null, rows: [], sujo: new Set(), noBanco: new Set(), apagar: new Set(), carregando: false, erro: null };
const CT_ACOES = ['RENOVA', 'RENEGOCIA', 'ENCERRA', 'NOVO'];
const CT_NAT = ['FIXO', 'VARIÁVEL', 'VARIÁVEL (sob demanda)', 'FORA DO TIPO'];
const CT_NUM = new Set(['conta', 'valor_2027', 'mes_acao', 'valor_reneg', 'mes_reajuste', 'pct_reajuste']);
const CT_CAMPOS = ['area', 'conta', 'natureza', 'fornecedor', 'cnpj', 'valor_2027', 'acao', 'mes_acao', 'valor_reneg', 'mes_reajuste', 'pct_reajuste', 'justificativa', 'excluido'];

const ctAcao = r => r.acao || ((r.existe_2027 || '').startsWith('S') ? 'RENOVA' : 'ENCERRA');
function ctMeses(r) {                                       // = CONTRATOS_RECORRENTES_2027 col. AJ–AU
  const out = Array(12).fill(0);
  if (r.excluido || r.natureza !== 'FIXO') return out;
  const ac = ctAcao(r), v = +r.valor_2027 || 0, ma = +r.mes_acao || 0, mr = +r.mes_reajuste || 0, pr = +r.pct_reajuste || 0, vr = +r.valor_reneg || 0;
  for (let m = 1; m <= 12; m++) {
    const R = 1 + (mr > 0 && m >= mr ? pr : 0);
    out[m - 1] = ac === 'ENCERRA' ? (m < ma ? v * R : 0) : ac === 'NOVO' ? (m >= Math.max(1, ma) ? v * R : 0)
      : (ac === 'RENEGOCIA' && m >= Math.max(1, ma)) ? vr : v * R;
  }
  return out;
}
const ctTotal = r => soma(ctMeses(r));
const ctPodeEditar = r => versaoEditavel() && (est.papel === 'controladoria' || (est.papel === 'gestor' && setoresVisiveis().has(r.area)));
const ctCtl = () => versaoEditavel() && est.papel === 'controladoria';
const ctLinha = (a, c) => (D.linhas || []).find(l => l.s === a && String(l.c) === String(c));

async function ctCarrega() {
  if (CTR.carregando || CTR.versao === est.versao) return;
  CTR.carregando = true; CTR.erro = null;
  try {
    if (window.ORC_FONTE_LOCAL) CTR.rows = (D.contratos_dados || []).map(x => ({ ...x }));
    else {
      CTR.rows = (await selTodos(() => SB.from('orc_contrato').select('*').eq('versao', est.versao).order('id')))
        .map(x => ({ ...x, conta: x.conta == null ? null : +x.conta, valor_2027: x.valor_2027 == null ? null : +x.valor_2027,
                     valor_reneg: x.valor_reneg == null ? null : +x.valor_reneg, pct_reajuste: x.pct_reajuste == null ? null : +x.pct_reajuste,
                     realizado_janela: +x.realizado_janela || 0, media_mensal: +x.media_mensal || 0, preco_contrato: +x.preco_contrato || 0 }));
    }
    CTR.noBanco = new Set(CTR.rows.map(r => r.id)); CTR.sujo.clear(); CTR.apagar.clear(); CTR.versao = est.versao;
  } catch (e) {
    CTR.erro = /orc_contrato/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205'
      ? 'A tabela de contratos ainda não existe no banco (migração 049 pendente).' : (e.message || String(e));
    CTR.versao = est.versao; CTR.rows = [];
  }
  CTR.carregando = false;
  if (est.tela === 'contratos') desenha();
}
function ctAviso(t, erro) {                              // guarda a mensagem: o desenho seguinte a mostra de novo (e depois some)
  CTR.msg = { t, erro }; const el = $('ctAviso'); if (el) { el.className = erro ? 'aviso' : 'ok-box'; el.textContent = t; el.hidden = false; }
}

async function ctSalva() {
  if (!CTR.sujo.size && !CTR.apagar.size) return true;
  if (window.ORC_FONTE_LOCAL) {
    CTR.sujo.forEach(id => CTR.noBanco.add(id)); CTR.sujo.clear(); CTR.apagar.clear();
    ctAviso('Prévia local: alterações guardadas só nesta tela (no app publicado vão para o banco, com histórico de quem e quando).'); return true;
  }
  try {
    for (const id of CTR.apagar) {
      if (CTR.noBanco.has(id)) { const { error } = await SB.from('orc_contrato').delete().eq('versao', est.versao).eq('id', id); if (error) throw error; }
      CTR.noBanco.delete(id);
    }
    CTR.apagar.clear();
    for (const id of CTR.sujo) {
      const r = CTR.rows.find(x => x.id === id); if (!r) continue;
      if (CTR.noBanco.has(id)) {
        const upd = {}; CT_CAMPOS.forEach(k => upd[k] = r[k] === '' ? null : r[k]);
        const { error } = await SB.from('orc_contrato').update(upd).eq('versao', est.versao).eq('id', id); if (error) throw error;
      } else {
        const ins = { versao: est.versao, id: r.id, origem: 'MANUAL', area: r.area, conta: r.conta, natureza: r.natureza, fornecedor: r.fornecedor, cnpj: r.cnpj,
          valor_2027: r.valor_2027, acao: r.acao, mes_acao: r.mes_acao, valor_reneg: r.valor_reneg, mes_reajuste: r.mes_reajuste, pct_reajuste: r.pct_reajuste,
          justificativa: r.justificativa, existe_2027: r.existe_2027, fonte_valor: r.fonte_valor };
        const { error } = await SB.from('orc_contrato').insert(ins); if (error) throw error;
        CTR.noBanco.add(id);
      }
    }
    CTR.sujo.clear(); ctAviso('✓ Alterações salvas (com histórico de quem e quando). Entram no PT na próxima geração.'); return true;
  } catch (e) { ctAviso('Não foi possível salvar: ' + (e.message || e), true); return false; }
}

function telaContratos() {
  if (CTR.versao !== est.versao) { setTimeout(ctCarrega, 0); return '<div class="status">Carregando os contratos da versão ' + esc(est.versao) + '…</div>'; }   // depois do desenho atual
  if (CTR.erro) return cabecalho('Contratos recorrentes 2027', '') + `<div class="aviso">${esc(CTR.erro)}</div>`;
  const vis = setoresVisiveis(), f = est.f;
  const base = CTR.rows.filter(r => vis.has(r.area) || (r.area === 'A CLASSIFICAR' && est.papel === 'controladoria'));
  const busca = (f.ctBusca || '').toUpperCase().trim();
  const filtroCard = { renova: r => !r.excluido && ctAcao(r) === 'RENOVA' && r.natureza === 'FIXO', reneg: r => !r.excluido && ctAcao(r) === 'RENEGOCIA',
    encerra: r => !r.excluido && ctAcao(r) === 'ENCERRA' && r.natureza === 'FIXO', novo: r => r.origem === 'MANUAL' && !r.excluido,
    vencido: r => !r.excluido && r.natureza === 'FIXO' && r.fim && r.fim < '2026-11-01' && Math.abs(r.realizado_janela) > 0.005,
    excl: r => r.excluido, var: r => r.natureza !== 'FIXO' };
  let L_ = base.filter(r => (!f.ctArea || r.area === f.ctArea) && (!busca || `${r.fornecedor} ${r.contrato} ${r.cnpj} ${r.conta} ${r.tipo_pj}`.toUpperCase().includes(busca)));
  const L0 = L_, cont = k => L0.filter(filtroCard[k]).length;          // contagem dos cartões ANTES do filtro do cartão / só fixos
  const tot = soma(L_.filter(r => !r.excluido), ctTotal);
  const card = f.ctCard;
  if (card) L_ = L_.filter(filtroCard[card]);
  else if (!f.ctTodos) L_ = L_.filter(r => !r.excluido && r.natureza === 'FIXO');
  L_.sort((a, b) => (a.area || '').localeCompare(b.area || '') || String(a.conta).localeCompare(String(b.conta)) || ctTotal(b) - ctTotal(a));
  const areas = [...vis].filter(a => base.some(r => r.area === a)).sort();
  const edAreas = [...vis].filter(a => ctPodeEditar({ area: a })).sort();
  const sel = (r, k, ops, dis) => `<select data-cid="${esc(r.id)}" data-ck="${k}" ${dis ? 'disabled' : ''}><option value=""></option>${ops.map(o => `<option ${String(r[k] ?? '') === String(o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const inp = (r, k, w, dis, tp = 'number', v = r[k]) => `<input type="${tp}" data-cid="${esc(r.id)}" data-ck="${k}" value="${esc(v ?? '')}" ${dis ? 'disabled' : ''} style="width:${w}px">`;
  const kp = (k, lab, val, meta, cls = '') => `<button class="kpi ${cls} ${card === k ? 'sel' : ''}" data-ctcard="${k}"><div class="lab">${lab}</div><div class="val">${val}</div><div class="meta">${meta}</div></button>`;
  // efeito por área × conta (decisão CONTRATO): modelo − base dos fornecedores com contrato × (1 + % aplicado) + contratos 2027 (ao vivo)
  const porLinha = {};
  base.filter(r => !r.excluido && r.natureza === 'FIXO' && (!f.ctArea || r.area === f.ctArea)).forEach(r => { const k = r.area + '|' + r.conta; porLinha[k] = (porLinha[k] || 0) + ctTotal(r); });
  const efeito = Object.entries(porLinha).map(([k, v]) => { const [a, c] = k.split('|'), l = ctLinha(a, c);
    const mc = !l ? null : (l.me === '% FATURAMENTO' ? l.mo : (Math.abs(l.mo) < 0.005 ? v : l.mo - (l.bc || 0) * (1 + (l.pa || 0)) + v));
    return { a, c, v, l, mc }; }).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  const somaPT = soma(D.linhas || [], l => l.ct || 0), somaApp = soma(efeito.filter(e => e.l), e => e.v);
  const temPT = (D.linhas || []).some(l => l.ct != null);
  return `${cabecalho('Contratos recorrentes 2027', 'Módulo de contratos do Protheus + cadastro de PJ × base jul–out/26 (uma linha por fornecedor × conta × área). Valor mensal, ação e reajuste por linha — a decisão <b>CONTRATO</b> (Decisões por linha) usa estes valores.',
    `<div class="filtros" style="margin-left:auto"><span class="rot">Área</span><select id="ctArea"><option value="">Todas as visíveis</option>${areas.map(a => `<option ${a === f.ctArea ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
     <input id="ctBusca" placeholder="Fornecedor, contrato, CNPJ, conta" value="${esc(f.ctBusca || '')}" style="width:220px"></div>`)}
  <div id="ctAviso" class="${CTR.msg && CTR.msg.erro ? 'aviso' : 'ok-box'}" ${CTR.msg ? '' : 'hidden'}>${CTR.msg ? esc(CTR.msg.t) : ''}</div>
  <section class="kpis">
    ${kp('', 'Contratos 2027 (fixo)', rsC(tot), `${base.filter(r => !r.excluido && r.natureza === 'FIXO').length} linha(s) fixas`)}
    ${kp('renova', 'Renova', cont('renova'), 'existe em 2027')}${kp('reneg', 'Renegocia', cont('reneg'), 'valor novo a partir do mês', 'k2')}
    ${kp('encerra', 'Encerra', cont('encerra'), 'não existe / encerra no mês', 'k3')}${kp('novo', 'Incluídos', cont('novo'), 'linhas novas (app/PT)', 'k5')}
    ${kp('vencido', 'Vencido e pago', cont('vencido'), 'atualizar o contrato no TOTVS', 'k3')}${kp('var', 'Variável / fora do tipo', cont('var'), 'segue o modelo (não soma)')}
    ${est.papel === 'controladoria' ? kp('excl', 'Excluídos', cont('excl'), 'restaurar aqui') : ''}
  </section>
  <div class="card"><h3>Contratos ${card ? '— filtro do cartão' : f.ctTodos ? '— todos' : '— fixos ativos'} <small>${L_.length} linha(s)</small></h3>
    <div class="csub">Amarelo = editável (gestor: linhas da sua área; Controladoria: tudo, inclusive área, conta e natureza). <b>Ação</b>: RENOVA · RENEGOCIA (valor novo a partir do mês) · ENCERRA (para a partir do mês; vazio = o ano todo) · NOVO (começa no mês). Reajuste: % a partir do mês (padrão: aniversário do contrato × inflação nas contas com reajuste).
      ${versaoEditavel() ? '' : ' <b>Versão fechada: só leitura.</b>'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      ${edAreas.length ? `<button class="btn" id="ctNovo">+ Incluir contrato</button>` : ''}
      <button class="btn primary" id="ctSalvar" ${CTR.sujo.size || CTR.apagar.size ? '' : 'disabled'}>Salvar alterações${CTR.sujo.size + CTR.apagar.size ? ` (${CTR.sujo.size + CTR.apagar.size})` : ''}</button>
      <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" id="ctTodos" ${f.ctTodos ? 'checked' : ''}> mostrar variáveis e encerrados</label></div>
    ${f.ctIncluir ? `<div class="card" style="background:#FFFBEA"><h3>Incluir contrato</h3><div class="filtros" style="flex-wrap:wrap;gap:8px">
      <span class="rot">Fornecedor</span><input id="niForn" style="width:220px"><span class="rot">CNPJ (raiz)</span><input id="niCnpj" style="width:90px">
      <span class="rot">Área</span><select id="niArea">${edAreas.map(a => `<option ${a === f.ctArea ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
      <span class="rot">Conta</span><input id="niConta" type="number" style="width:110px"><span class="rot">R$/mês</span><input id="niValor" type="number" style="width:100px">
      <span class="rot">Começa no mês</span><input id="niMes" type="number" min="1" max="12" value="1" style="width:55px">
      <span class="rot">Justificativa</span><input id="niJust" style="width:260px">
      <button class="btn primary" id="niOk">Incluir</button><button class="btn" id="niCancela">Cancelar</button></div></div>` : ''}
    <div class="tw" style="margin-top:6px"><table class="t" id="ctTab"><thead><tr><th class="fx">Contrato</th><th>Fornecedor</th><th>Tipo de PJ</th><th>Área</th><th>Conta</th><th>Natureza</th><th>Fim</th>
      <th class="n">Realizado jul–out</th><th class="n">Média mensal</th><th>Existe em 2027</th><th class="n ed">Valor mensal 2027</th><th class="ed">Ação</th><th class="ed">Mês</th>
      <th class="n ed">Valor renegociado</th><th class="ed">Mês reaj.</th><th class="ed">% reaj.</th><th class="n">Total 2027</th><th class="ed">Justificativa</th><th></th></tr></thead><tbody>
    ${L_.slice(0, 600).map(r => { const e = ctPodeEditar(r), man = r.origem === 'MANUAL', ctl = ctCtl() && e, est_ = man ? e : ctl;
      return `<tr ${CTR.sujo.has(r.id) ? 'style="background:#FFF7E6"' : r.excluido ? 'style="opacity:.55;text-decoration:line-through"' : ''}>
        <td class="fx nw" title="${esc(r.id)}">${r.contrato ? esc(r.contrato) : `<span style="color:var(--ink3)">${man ? 'incluído' : '—'}</span>`}${r.situacao ? `<br><small style="color:var(--ink3)">${esc(r.situacao)}</small>` : ''}</td>
        <td class="w">${man && e ? inp(r, 'fornecedor', 170, false, 'text') : esc(r.fornecedor || '')}<br><small style="color:var(--ink3)">${esc(r.cnpj || '')} · ${esc(r.origem)}</small></td>
        <td>${esc(r.tipo_pj && r.tipo_pj !== '—' ? r.tipo_pj : '')}</td>
        <td class="nw">${est_ ? sel(r, 'area', edAreas.includes(r.area) ? edAreas : [r.area, ...edAreas]) : esc(r.area)}</td>
        <td class="nw">${est_ ? inp(r, 'conta', 95) : esc(r.conta ?? '')}<br><small style="color:var(--ink3)">${esc((D.contaDesc || {})[String(r.conta)] || '')}</small></td>
        <td>${est_ ? sel(r, 'natureza', CT_NAT) : esc(r.natureza)}</td><td class="nw">${r.fim ? esc(r.fim.split('-').reverse().join('/')) : '—'}</td>
        ${tdN(+r.realizado_janela || 0)}${tdN(+r.media_mensal || 0)}<td class="w"><small>${esc(r.existe_2027 || (man ? 'S — incluído' : ''))}</small></td>
        <td class="n ed">${inp(r, 'valor_2027', 95, !e || r.excluido)}</td><td class="ed">${sel(r, 'acao', CT_ACOES, !e || r.excluido)}</td>
        <td class="ed">${inp(r, 'mes_acao', 48, !e || r.excluido)}</td><td class="n ed">${inp(r, 'valor_reneg', 90, !e || r.excluido)}</td>
        <td class="ed">${inp(r, 'mes_reajuste', 48, !e || r.excluido)}</td><td class="ed">${inp(r, 'pct_reajuste', 55, !e || r.excluido, 'number', r.pct_reajuste == null ? '' : +(r.pct_reajuste * 100).toFixed(2))}</td>
        ${tdN(ctTotal(r))}<td class="ed">${inp(r, 'justificativa', 190, !e, 'text')}</td>
        <td>${e ? (r.excluido ? (ctCtl() ? `<button class="btn" data-ctrest="${esc(r.id)}">Restaurar</button>` : '') : `<button class="btn" data-ctdel="${esc(r.id)}" title="${man ? 'Apaga a linha incluída' : 'Tira o contrato do orçamento 2027 (fica marcado como excluído; a Controladoria restaura)'}">Excluir</button>`) : ''}</td></tr>`; }).join('')
      || '<tr><td colspan="19" class="vazio">Nenhum contrato neste filtro.</td></tr>'}
    </tbody></table></div>${L_.length > 600 ? '<div class="csub">Mostrando 600 linhas — use os filtros.</div>' : ''}
    <div class="csub">% reaj. em pontos percentuais (4,5 = 4,5%). Mês = 1 a 12.</div></div>
  <div class="card"><h3>Efeito por área × conta — decisão CONTRATO <small>${efeito.length} linha(s) com contrato fixo</small></h3>
    <div class="csub">Modelo c/ contratos = modelo da linha − base dos fornecedores com contrato (anualizada, com o reajuste do modelo) + contratos 2027 (recalculado com as edições desta tela). A decisão de cada linha é feita em <a href="#decisoes">Decisões por linha</a>.
      ${temPT && est.papel === 'controladoria' ? ` Conferência: contratos 2027 no PT ${rsC(somaPT)} × nesta tela ${rsC(somaApp)}${Math.abs(somaPT - somaApp) < 1 ? ' — <b>✓ igual ao PT</b>' : ' — diferença = edições ainda não levadas ao PT'}.` : ''}</div>
    <div class="tw solta"><table class="t"><thead><tr><th>Área</th><th>Conta</th><th class="n">Modelo</th><th class="n">Base dos contratos</th><th class="n">Contratos 2027</th><th class="n">Modelo c/ contratos</th><th>Decisão hoje</th><th class="n">Final hoje</th><th class="n">Δ c/ contratos − final</th></tr></thead><tbody>
    ${efeito.map(x => `<tr><td>${esc(x.a)}</td><td>${esc(x.c)}<br><small style="color:var(--ink3)">${esc((D.contaDesc || {})[x.c] || '')}</small></td>${x.l ? tdN(x.l.mo) + tdN(x.l.bc || 0) : '<td class="n">—</td><td class="n">—</td>'}${tdN(x.v)}
      ${x.l ? tdN(x.mc) + `<td>${esc(x.l.da)}</td>` + tdN(x.l.vf) + `<td class="n ${cd(x.mc - x.l.vf, true)}">${fmt(x.mc - x.l.vf, { sinal: true })}</td>` : '<td colspan="4"><span class="tag r">sem linha no orçamento</span></td>'}</tr>`).join('') || '<tr><td colspan="9" class="vazio">—</td></tr>'}
    </tbody></table></div></div>`;
}
function posContratos() {
  const f = est.f; CTR.msg = null;                        // a mensagem aparece uma vez
  const a = $('ctArea'); if (a) a.onchange = e => { f.ctArea = e.target.value || null; desenha(); };
  const b = $('ctBusca'); if (b) b.onchange = e => { f.ctBusca = e.target.value; desenha(); };
  const t = $('ctTodos'); if (t) t.onchange = e => { f.ctTodos = e.target.checked; desenha(); };
  document.querySelectorAll('#tela [data-ctcard]').forEach(x => x.onclick = () => { f.ctCard = f.ctCard === x.dataset.ctcard || !x.dataset.ctcard ? null : x.dataset.ctcard; desenha(); });
  document.querySelectorAll('#ctTab [data-cid]').forEach(el => el.onchange = () => {
    const r = CTR.rows.find(x => x.id === el.dataset.cid); if (!r) return;
    const k = el.dataset.ck; let v = el.value;
    if (CT_NUM.has(k)) { v = v === '' ? null : +String(v).replace(',', '.'); if (k === 'pct_reajuste' && v != null) v = v / 100; }
    if ((k === 'mes_acao' || k === 'mes_reajuste') && v != null && (v < 1 || v > 12)) { ctAviso('Mês deve ser de 1 a 12.', true); el.value = r[k] ?? ''; return; }
    r[k] = v === '' ? null : v; CTR.sujo.add(r.id); desenha();
  });
  document.querySelectorAll('#tela [data-ctdel]').forEach(x => x.onclick = () => {
    const r = CTR.rows.find(y => y.id === x.dataset.ctdel); if (!r) return;
    if (r.origem === 'MANUAL') { CTR.rows = CTR.rows.filter(y => y.id !== r.id); CTR.sujo.delete(r.id); if (CTR.noBanco.has(r.id)) CTR.apagar.add(r.id); }
    else { r.excluido = true; CTR.sujo.add(r.id); }
    desenha(); ctAviso(`Contrato marcado para excluir: ${r.fornecedor || r.id}. Clique em Salvar alterações.`);
  });
  document.querySelectorAll('#tela [data-ctrest]').forEach(x => x.onclick = () => {
    const r = CTR.rows.find(y => y.id === x.dataset.ctrest); if (!r) return; r.excluido = false; CTR.sujo.add(r.id); desenha();
  });
  const n = $('ctNovo'); if (n) n.onclick = () => { f.ctIncluir = true; desenha(); };
  const c = $('niCancela'); if (c) c.onclick = () => { f.ctIncluir = false; desenha(); };
  const ok = $('niOk'); if (ok) ok.onclick = () => {
    const forn = $('niForn').value.trim(), area = $('niArea').value, conta = +$('niConta').value, valor = +String($('niValor').value).replace(',', '.'), mes = +$('niMes').value || 1;
    if (!forn || !area || !conta || !(valor > 0) || mes < 1 || mes > 12) { ctAviso('Preencha fornecedor, área, conta, valor mensal (> 0) e mês (1 a 12).', true); return; }
    const id = 'N' + Date.now().toString(36).toUpperCase();
    CTR.rows.push({ id, origem: 'MANUAL', area, conta, natureza: 'FIXO', fornecedor: forn, cnpj: $('niCnpj').value.trim() || null, valor_2027: valor, acao: mes > 1 ? 'NOVO' : 'RENOVA',
      mes_acao: mes > 1 ? mes : null, valor_reneg: null, mes_reajuste: null, pct_reajuste: null, justificativa: $('niJust').value.trim() || null, existe_2027: 'S — incluído (app)',
      fonte_valor: 'incluído no app', realizado_janela: 0, media_mensal: 0, preco_contrato: 0, excluido: false, contrato: null, situacao: null, fim: null, tipo_pj: null });
    CTR.sujo.add(id); f.ctIncluir = false; f.ctArea = area; desenha(); ctAviso('Contrato incluído na tela. Clique em Salvar alterações.');
  };
  const s = $('ctSalvar'); if (s) s.onclick = async () => { s.disabled = true; await ctSalva(); desenha(); };
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js antes de inicia()) */
function instalaOrcContratos() {
  if (window.__orcCtr) return; window.__orcCtr = true;
  const g = MENU.find(x => x.g === 'orc');
  if (g && !g.itens.some(i => i.id === 'contratos')) {
    const it = { id: 'contratos', t: 'Contratos recorrentes', ico: '⧉', r: TODOS };
    g.itens.splice(Math.max(0, g.itens.findIndex(i => i.id === 'folha') + 1), 0, it);
    ITENS[it.id] = { ...it, g: g.g, gt: g.t };
  }
  TELAS.contratos = telaContratos; POS.contratos = posContratos;
  window.addEventListener('beforeunload', e => { if (CTR.sujo.size || CTR.apagar.size) { e.preventDefault(); e.returnValue = ''; } });
}
