/* EXCEÇÕES CONTA × CENTRO DE CUSTO (ou conta × marcação do lançamento) — EDITÁVEIS NO APP (15/11/2026: "irei usar o App para fazer as configurações, e o
   PT só deve ser gerado quando eu disser que pode… o PT, para ser gerado, deverá consultar o app").
   Tabela orc_excecao (migração 055; GLOBAL — não é por versão): uma linha por conta × chave → área. A exceção tem PRIORIDADE MÁXIMA na área final do gasto
   (o lançamento da conta naquele centro de custo, ou com aquela marcação, vai para a área indicada mesmo que a conta seja centralizada em outra) e libera a
   área a orçar a conta. Chave = centro de custo · marcação do lançamento · "ORÇA SEM HISTÓRICO (autorização)" (só autoriza a área a orçar).
   Só a Controladoria inclui, altera (área e motivo) e exclui; o motivo é obrigatório; o banco carimba quem e quando e guarda o histórico (orc_alteracao).
   As exceções que o gerador cria por REGRA (centro de custo que prevalece sobre conta centralizada) não ficam na tabela: aparecem aqui só para leitura, como
   vieram no PT desta versão.
   🔴 O app NÃO recalcula a alocação: o gerador do PT lê esta tabela a CADA geração — a exceção entra nos números quando o PT for gerado de novo.
   Carregado ANTES do orcamento.js; instalado pelo gancho instalaOrcExcecoes() DEPOIS dos outros (embrulha a tela cfg_excecoes, que continua valendo — só
   leitura — enquanto a tabela não existir ou não tiver recebido a lista do PT). Prévia local: D.excecoes_dados (alterações só na tela). Nenhum dado aqui. */
"use strict";
const EXC = { pronto: false, carregando: false, instalada: null, semeada: false, erro: null, rows: [], orig: new Map(), apagar: new Set(), msg: null,
  form: { conta: '', tipo: 'CC', chave: '', area: '', motivo: '' } };
const EXC_AUT = 'ORÇA SEM HISTÓRICO (autorização)';
const EXC_TIPO = { CC: 'Centro de custo', TAG: 'Marcação do lançamento', AUTORIZA: 'Só autoriza a área a orçar' };
const excEdita = () => est.papel === 'controladoria';
const excAtiva = () => EXC.instalada === true && EXC.semeada;
const excTipo = ch => ch === EXC_AUT ? 'AUTORIZA' : /^([0-9]{3,9}|SEM CC)$/.test(ch || '') ? 'CC' : 'TAG';
const excT = v => String(v ?? '').trim() || null;
/* 16/11/2026 — PASSO 1 DA SIMPLIFICAÇÃO DOS DE-PARAS: num lugar só, TUDO o que tira o gasto do centro de custo onde foi lançado — qual regra, de
   que área para qual, quanto (razão jul–out/26 desta versão, |D − C|) e onde se altera. Só leitura: explica o PT desta versão (o que mudar no app depois
   do PT entra na próxima geração). Regra (a 1ª que casar): exceção conta × CC/marcação (app ou regra do CC 0418) · fornecedor que prevalece sobre o CC
   (central) · lançamento sem CC → área padrão da conta · conta centralizada → área dona (ou Gastos Comuns) · outra regra do modelo. */
const EXC_MAPA_T = { CONTA: 'Conta centralizada → área dona', GC: 'Conta de Gastos Comuns (ninguém gere)', SEMCC: 'Sem centro de custo → área padrão da conta',
  FORN: 'Fornecedor que prevalece sobre o CC', EXC: 'Exceção conta × CC / marcação', REGRA: 'Regra do CC 0418 (RJ)', OUTRO: 'Outra regra do modelo' };
const EXC_MAPA_ONDE = { CONTA: 'De-para de contas', GC: 'De-para de contas', SEMCC: 'De-para de contas (área padrão sem CC)', FORN: 'Central de de-para (fornecedor)',
  EXC: 'Exceções (esta tela)', REGRA: 'gerador do PT (regra fixa)', OUTRO: 'regra do modelo' };
function excPedeRazao() {
  if (RAZAO || EXC.razaoPedido || typeof carregaRazao !== 'function') return;
  EXC.razaoPedido = true;
  carregaRazao().then(() => { if (est.tela === 'cfg_excecoes') desenha(); })
    .catch(e => { EXC.razaoErro = e.message || String(e); if (est.tela === 'cfg_excecoes') desenha(); });
}
function excMapa() {
  if (!RAZAO) return null;
  if (EXC._mapa && EXC._mapaR === RAZAO && EXC._mapaD === D) return EXC._mapa;
  const M = (D.meta && D.meta.razao) || {}, C = M.cols || [], st = (M.dic && M.dic.setor) || [], I = n => C.indexOf(n);
  const iC = I('conta'), iCC = I('cc'), iV = I('valor'), iS = I('setor_cc'), iF = I('setor_final'), iFo = I('forn'), iT = I('tag');
  const ap = excApoio(), ex = new Map(ap.pt.map(x => [`${x.conta}|${x.chave}`, x]));
  const fo = new Map(((D.cfg_fornecedor && D.cfg_fornecedor.rows) || []).map(r => [`${r[0]}|${r[2]}`, r]));
  const G = new Map(); let tot = 0;
  RAZAO.forEach(x => {
    const v = Math.abs(+x[iV] || 0); tot += v;
    const s = st[x[iS]] || '', f = st[x[iF]] || '';
    if (s === f) return;
    const c = String(x[iC]), cc = String(x[iCC] || ''), tag = iT >= 0 ? String(x[iT] || '') : '', fn = iFo >= 0 ? String(x[iFo] || '') : '';
    const e = ex.get(`${c}|${cc}`) || (tag ? ex.get(`${c}|${tag}`) : null), ct = ap.conta.get(c) || {}, fr = fo.get(`${fn}|${c}`);
    let k = 'OUTRO', mot = '', quem = '';
    if (e && e.area === f) { k = e.regra ? 'REGRA' : 'EXC'; mot = e.motivo || ''; }
    else if (fr && fr[21] === 'S' && fr[10] === f) { k = 'FORN'; quem = fr[1] || fn; mot = fr[14] || ''; }
    else if (!s) { k = 'SEMCC'; mot = 'lançamento sem centro de custo'; }
    else if (ct.cen && !ct.rateio && ct.gestor === f) { k = f === 'Gastos Comuns (sem gestor)' ? 'GC' : 'CONTA'; mot = ct.fund || ''; }
    const id = [k, c, s, f, quem].join('|');
    let g = G.get(id); if (!g) G.set(id, g = { k, c, de: s, para: f, quem, mot, v: 0, n: 0 });
    g.v += v; g.n++;
  });
  EXC._mapa = { L: [...G.values()].sort((a, b) => b.v - a.v), tot }; EXC._mapaR = RAZAO; EXC._mapaD = D; return EXC._mapa;
}
const excSeguram = () => { const ap = excApoio(); return ap.pt.filter(x => excTipo(x.chave) === 'CC' && (ap.cc.get(x.chave) || {}).setor === x.area).length; };
function excMapaCard() {
  const M = excMapa(), tit = 'Tudo o que tira o gasto do centro de custo — num lugar só';
  if (!M) { excPedeRazao();
    return `<div class="card"><h3>${tit}</h3>${EXC.razaoErro ? `<div class="aviso">Não foi possível carregar o razão desta versão: ${esc(EXC.razaoErro)}</div>` : '<div class="status">Carregando o razão desta versão…</div>'}</div>`; }
  const f = est.f, tipo = f.excMapaTipo || '', busca = String(f.excMapaBusca || '').toUpperCase().trim(), desc = c => (D.contaDesc && D.contaDesc[c]) || '';
  const porT = new Map(); M.L.forEach(g => { const t = porT.get(g.k) || { v: 0, n: 0, c: new Set() }; t.v += g.v; t.n += g.n; t.c.add(g.c); porT.set(g.k, t); });
  const mov = soma(M.L, g => g.v), fica = M.tot - mov, seg = excSeguram();
  const L = M.L.filter(g => (!tipo || g.k === tipo) && (!busca || `${g.c} ${desc(g.c)} ${g.de} ${g.para} ${g.quem}`.toUpperCase().includes(busca)));
  const resumo = Object.keys(EXC_MAPA_T).filter(k => porT.has(k)).map(k => { const t = porT.get(k);
    return `<tr><td>${esc(EXC_MAPA_T[k])}</td><td class="n">${t.c.size}</td><td class="n">${t.n.toLocaleString('pt-BR')}</td>${tdN(t.v)}<td class="n">${pc(div(t.v, M.tot))}</td><td><small>${esc(EXC_MAPA_ONDE[k])}</small></td></tr>`; }).join('');
  return `<div class="card"><h3>${tit} <small>${pc(div(mov, M.tot))} da base muda de área</small></h3>
    <div class="csub">Do PT desta versão (razão jul–out/26, |D − C|): cada linha diz <b>qual regra</b> tirou o gasto da área do centro de custo onde foi lançado, <b>para onde</b>, <b>quanto</b> e <b>onde se altera</b>. Só leitura — o que mudar no app depois do PT entra na próxima geração.</div>
    <div class="tw" style="margin-top:8px"><table class="t"><thead><tr><th>Regra</th><th class="n">Contas</th><th class="n">Lançamentos</th><th class="n">R$ (jul–out)</th><th class="n">% da base</th><th>Onde se altera</th></tr></thead><tbody>
      <tr><td>Fica no próprio centro de custo (nenhuma regra mexe)</td><td></td><td></td>${tdN(fica)}<td class="n">${pc(div(fica, M.tot))}</td><td></td></tr>
      ${resumo}
      <tr style="font-weight:600"><td>Base total</td><td></td><td></td>${tdN(M.tot)}<td class="n">${pc(1)}</td><td></td></tr></tbody></table></div>
    ${seg ? `<div class="csub" style="margin-top:6px">Além disso, <b>${seg}</b> exceção(ões) só seguram no próprio centro de custo o que a centralização da conta tiraria (ex.: frete do Pós-Venda, CC 0418) — no passo 2 deixam de ser necessárias.</div>` : ''}
    <div class="filtros" style="margin:10px 0 6px"><select id="excMapaTipo"><option value="">Todas as regras</option>${Object.entries(EXC_MAPA_T).filter(([k]) => porT.has(k)).map(([k, t]) => `<option value="${k}" ${tipo === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <input id="excMapaBusca" placeholder="Conta, área ou fornecedor" value="${esc(f.excMapaBusca || '')}" style="width:220px"></div>
    <div class="tw" style="max-height:420px"><table class="t"><thead><tr><th>Regra</th><th class="fx">Conta</th><th>Sai de (área do CC)</th><th>Vai para</th><th>Fornecedor</th><th class="n">R$ (jul–out)</th><th class="n">% da base</th><th class="n">Lanç.</th><th>Onde se altera · motivo</th></tr></thead><tbody>
    ${L.slice(0, 300).map(g => `<tr><td class="nw"><small>${esc(EXC_MAPA_T[g.k])}</small></td><td class="fx w"><b>${esc(g.c)}</b> ${esc(desc(g.c))}</td><td>${esc(g.de || 'sem CC')}</td><td>${esc(g.para)}</td><td><small>${esc(g.quem)}</small></td>${tdN(g.v)}<td class="n">${pc(div(g.v, M.tot))}</td><td class="n">${g.n}</td><td class="w"><small><b>${esc(EXC_MAPA_ONDE[g.k])}</b>${g.mot ? ' · ' + esc(String(g.mot).slice(0, 140)) : ''}</small></td></tr>`).join('') || '<tr><td colspan="9" class="vazio">Nada neste filtro.</td></tr>'}
    </tbody></table></div>${L.length > 300 ? '<div class="csub">Mostrando 300 linhas — use o filtro ou a busca.</div>' : ''}</div>`;
}

async function excCarrega() {
  if (EXC.carregando || EXC.pronto) return;
  EXC.carregando = true; EXC.erro = null; let rows = [];
  try {
    if (window.ORC_FONTE_LOCAL) { rows = (D.excecoes_dados || []).map(x => ({ ...x })); EXC.instalada = Array.isArray(D.excecoes_dados); EXC.semeada = EXC.instalada; }
    else if (!['controladoria', 'ceo'].includes(est.papelReal)) { EXC.instalada = null; EXC.semeada = false; }      // sem leitura da tabela para os demais perfis
    else {
      rows = await selTodos(() => SB.from('orc_excecao').select('*').order('id')); EXC.instalada = true; EXC.semeada = rows.length > 0;
      if (!rows.length) {                                              // vazia: ainda não recebeu a lista do PT, ou todas foram excluídas? (marca da semente no histórico)
        const { data, error } = await SB.from('orc_alteracao').select('id').eq('tabela', 'orc_excecao').eq('registro', 'SEMENTE').limit(1);
        if (error) throw error; EXC.semeada = !!(data && data.length);
      }
    }
  } catch (e) {
    rows = [];
    if (/orc_excecao/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205') { EXC.instalada = false; EXC.semeada = false; }
    else { EXC.instalada = null; EXC.semeada = false; EXC.erro = e.message || String(e); }
  }
  EXC.rows = rows; EXC.orig = new Map(rows.map(r => [r.id, { ...r }])); EXC.apagar.clear(); EXC.pronto = true; EXC.carregando = false;
  if (est.tela === 'cfg_excecoes') desenha();
}

/* apoio (só leitura, do PT desta versão): descrição e regra da conta, descrição e setor do centro de custo, marcações, áreas */
function excApoio() {
  if (EXC._ap && EXC._apD === D) return EXC._ap;
  const conta = new Map(((D.cfg_conta && D.cfg_conta.rows) || []).map(r => [String(r[0]), { desc: r[1] || '', cen: r[4] === 'S', gestor: r[5] || '', rateio: r[6] === 'S', fund: r[10] || '' }]));
  const cc = new Map(((D.cfg_cc && D.cfg_cc.rows) || []).filter(r => /^([0-9]{3,9}|SEM CC)$/.test(String(r[0]))).map(r => [String(r[0]), { desc: r[1] || '', setor: r[2] || '' }]));
  const pt = ((D.cfg_excecoes && D.cfg_excecoes.rows) || []).map(r => ({ conta: String(r[0]), chave: String(r[1]), area: r[2], motivo: r[4] || '',
    regra: r.length > 5 && r[5] != null ? /^REGRA/.test(String(r[5])) : /prevalece sobre a conta centralizada/.test(String(r[4] || '')), origem: r.length > 5 ? r[5] : null }));
  const tags = [...new Set(((D.cfg_excecoes && D.cfg_excecoes.tags) || []).concat(pt.filter(x => excTipo(x.chave) === 'TAG').map(x => x.chave), EXC.rows.filter(r => excTipo(r.chave) === 'TAG').map(r => r.chave)))];
  const areas = (D.setores || []).map(s => s.s).filter(s => s !== 'A CLASSIFICAR');
  EXC._ap = { conta, cc, pt, tags, areas }; EXC._apD = D; return EXC._ap;
}
function excAviso(t, erro) { EXC.msg = { t, erro }; const el = $('excAviso'); if (el) { el.className = erro ? 'aviso' : 'ok-box'; el.textContent = t; el.hidden = false; } }
const excMudou = r => { const o = EXC.orig.get(r.id); return !o || excT(r.area) !== excT(o.area) || excT(r.motivo) !== excT(o.motivo); };
const excPend = () => EXC.apagar.size + EXC.rows.filter(excMudou).length;
/* PT × app: o que mudou no app (já salvo) em relação às exceções próprias do PT desta versão */
function excDifPT() {
  const pt = new Map(excApoio().pt.filter(x => !x.regra).map(x => [`${x.conta}|${x.chave}`, x.area])), app = new Map([...EXC.orig.values()].map(r => [r.id, r.area])), out = [];
  app.forEach((a, id) => { if (!pt.has(id)) out.push(`${id.replace('|', ' × ')} incluída`); else if (pt.get(id) !== a) out.push(`${id.replace('|', ' × ')}: ${pt.get(id)} → ${a}`); });
  pt.forEach((a, id) => { if (!app.has(id)) out.push(`${id.replace('|', ' × ')} excluída`); });
  return out;
}

async function excSalva() {
  const novos = EXC.rows.filter(r => !EXC.orig.has(r.id)), alt = EXC.rows.filter(r => EXC.orig.has(r.id) && excMudou(r)), apg = [...EXC.apagar];
  if (!novos.length && !alt.length && !apg.length) return true;
  const semMotivo = novos.concat(alt).filter(r => !excT(r.motivo));
  if (semMotivo.length) { excAviso(`Informe o motivo: ${semMotivo.map(r => r.conta + ' × ' + r.chave).join(' · ')}.`, true); return false; }
  if (window.ORC_FONTE_LOCAL) {
    const agora_ = new Date().toISOString();
    novos.concat(alt).forEach(r => { r.atualizado_em = agora_; r.atualizado_por = 'prévia local'; });
    EXC.orig = new Map(EXC.rows.map(r => [r.id, { ...r }])); EXC.apagar.clear();
    excAviso('Prévia local: alterações guardadas só nesta tela (no app publicado vão para o banco, com histórico de quem e quando).'); return true;
  }
  let n = 0;
  try {
    for (const id of apg) { const { data, error } = await SB.from('orc_excecao').delete().eq('id', id).select('id'); if (error) throw error; if (!data || !data.length) throw new Error(`a exceção ${id} não foi excluída (sem permissão)`); EXC.orig.delete(id); EXC.apagar.delete(id); n++; }
    for (const r of alt) { const { data, error } = await SB.from('orc_excecao').update({ area: r.area, motivo: excT(r.motivo) }).eq('id', r.id).select('id,area,motivo,atualizado_em,atualizado_por');
      if (error) throw error; if (!data || !data.length) throw new Error(`a exceção ${r.id} não foi alterada (sem permissão)`); Object.assign(r, data[0]); EXC.orig.set(r.id, { ...r }); n++; }
    for (const r of novos) { const { data, error } = await SB.from('orc_excecao').insert({ conta: r.conta, chave: r.chave, area: r.area, motivo: excT(r.motivo) }).select('*');
      if (error) throw error; Object.assign(r, data[0]); EXC.orig.set(r.id, { ...r }); n++; }
    EXC.semeada = true;
    excAviso(`✓ ${n} alteração(ões) salva(s), com histórico de quem e quando. Entram na alocação e no orçamento na próxima geração do PT, que lê estas exceções.`); return true;
  } catch (e) { excAviso(`Não foi possível salvar${n ? ` (${n} já salvas)` : ''}: ` + (/duplicate key|23505/.test(e.message || e.code || '') ? 'já existe exceção para esta conta e este centro de custo.' : (e.message || e)), true); return false; }
}

function telaCfgExcecoes(antiga) {
  const tit = 'Exceções conta × centro de custo';
  if (!EXC.pronto) { if (!EXC.carregando) setTimeout(excCarrega, 0); return cabecalho(tit, '') + '<div class="status">Carregando as exceções…</div>'; }
  if (!excAtiva()) {
    const porque = EXC.instalada === false ? 'A edição das exceções entra no ar quando a migração 055 for rodada no banco. Até lá, a fonte é o PT.'
      : EXC.erro ? `Não foi possível ler as exceções editáveis (${esc(EXC.erro)}). Abaixo, o que o PT desta versão usou.`
      : EXC.instalada === true ? 'As exceções editáveis ainda não receberam a lista do PT (semente). Abaixo, o que o PT desta versão usou.' : '';
    return (porque ? `<div class="aviso">${porque}</div>` : '') + antiga();
  }
  const ed = excEdita(), dis = ed ? '' : 'disabled', ap = excApoio(), F = EXC.form, pend = excPend(), dif = excDifPT(), m = D.meta && D.meta.excecoes;
  const regra = ap.pt.filter(x => x.regra), L = EXC.rows.filter(r => !EXC.apagar.has(r.id)).slice().sort((a, b) => a.id.localeCompare(b.id));
  const ccTxt = ch => { const c = ap.cc.get(ch); return c ? `${esc(c.desc)}${c.setor ? ` <small style="color:var(--ink3)">· hoje em ${esc(c.setor)}</small>` : ''}` : (ch === 'SEM CC' ? 'lançamento sem centro de custo' : '<span class="tag r">centro de custo fora da árvore</span>'); };
  const chaveTxt = r => excTipo(r.chave) === 'CC' ? `<b>${esc(r.chave)}</b> ${ccTxt(r.chave)}` : excTipo(r.chave) === 'TAG' ? `<b>${esc(r.chave)}</b> <small style="color:var(--ink3)">marcação do lançamento</small>` : '<small>sem histórico — só autoriza a área a orçar</small>';
  const contaTxt = co => { const c = ap.conta.get(co); return c ? `${esc(c.desc)}<br><small style="color:var(--ink3)">${c.cen ? `centralizada em ${esc(c.gestor)}${c.rateio ? ' · rateio por uso' : ''}` : 'por centro de custo'}</small>` : '<span class="tag r">conta fora do de-para</span>'; };
  const fc = ap.conta.get(F.conta);
  const linha = r => { const novo = !EXC.orig.has(r.id), mud = !novo && excMudou(r);
    return `<tr ${novo || mud ? 'style="background:#FFF7E6"' : ''}><td class="fx w"><b>${esc(r.conta)}</b> ${contaTxt(r.conta)}</td><td class="nw">${esc(EXC_TIPO[excTipo(r.chave)])}</td><td class="w">${chaveTxt(r)}</td>
      <td class="ed"><select data-excid="${esc(r.id)}" data-exck="area" ${dis}>${(ap.areas.includes(r.area) ? ap.areas : ap.areas.concat([r.area])).map(a => `<option ${r.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>${ap.areas.includes(r.area) ? '' : '<br><span class="tag r">área fora da lista</span>'}</td>
      <td class="ed"><input type="text" data-excid="${esc(r.id)}" data-exck="motivo" value="${esc(r.motivo || '')}" style="width:330px" ${dis}></td>
      <td class="nw">${novo ? '<span class="tag y">nova · salvar</span>' : mud ? '<span class="tag y">alterada · salvar</span>' : `<small style="color:var(--ink3)">${r.origem === 'PT' ? 'veio do PT' : 'incluída no app'}${r.atualizado_em && r.origem !== 'PT' ? ' · ' + esc(new Date(r.atualizado_em).toLocaleDateString('pt-BR')) : ''}</small>`}</td>
      <td>${ed ? `<button class="btn" data-excdel="${esc(r.id)}">Remover</button>` : ''}</td></tr>`; };
  return `${cabecalho(tit, 'A exceção tem <b>prioridade máxima</b> na área final do gasto: o lançamento da conta naquele <b>centro de custo</b> (ou com aquela <b>marcação</b>) vai para a área indicada, mesmo que a conta seja centralizada em outra área — e a área passa a poder orçar a conta. É o que resolve a conta centralizada que uma área precisa orçar. No topo, <b>tudo o que tira o gasto do centro de custo</b>, num lugar só: qual regra, quanto e onde se altera.')}
  <div id="excAviso" class="${EXC.msg && EXC.msg.erro ? 'aviso' : 'ok-box'}" ${EXC.msg ? '' : 'hidden'}>${EXC.msg ? esc(EXC.msg.t) : ''}</div>
  ${dif.length ? `<div class="aviso">⚠ <b>${dif.length} diferença(s) entre as exceções do app e as do PT desta versão</b>: ${dif.slice(0, 6).map(esc).join(' · ')}${dif.length > 6 ? ` · e mais ${dif.length - 6}` : ''}. A alocação e os números só mudam quando o PT for gerado de novo — ele lê esta tela a cada geração.</div>`
    : `<div class="info">${m && m.lida_em && !m.sem_leitura ? `O PT desta versão foi gerado com estas exceções (lidas do app em <b>${esc(m.lida_em)}</b>).` : 'As exceções do app são as mesmas que o PT desta versão usou.'} O que for incluído, alterado ou removido aqui entra na <b>próxima geração do PT</b>.</div>`}
  ${excMapaCard()}
  ${ed ? `<div class="card"><h3>Incluir exceção</h3>
    <datalist id="excListaConta">${[...ap.conta.entries()].map(([c, x]) => `<option value="${esc(c)}">${esc(x.desc)}</option>`).join('')}</datalist>
    <div class="filtros" style="align-items:flex-end;gap:10px">
      <label><span class="rot">Conta</span><br><input id="excConta" list="excListaConta" value="${esc(F.conta)}" placeholder="conta contábil" style="width:150px"></label>
      <label><span class="rot">Tipo</span><br><select id="excTipo">${Object.entries(EXC_TIPO).map(([k, t]) => `<option value="${k}" ${F.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${F.tipo === 'CC' ? `<label><span class="rot">Centro de custo</span><br><select id="excChave" style="max-width:290px"><option value="">escolha…</option>${[...ap.cc.entries()].map(([c, x]) => `<option value="${esc(c)}" ${F.chave === c ? 'selected' : ''}>${esc(c)} — ${esc(x.desc)}${x.setor ? ' (' + esc(x.setor) + ')' : ''}</option>`).join('')}</select></label>`
        : F.tipo === 'TAG' ? `<label><span class="rot">Marcação</span><br><select id="excChave"><option value="">escolha…</option>${ap.tags.map(t => `<option ${F.chave === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : ''}
      <label><span class="rot">Área que recebe / orça</span><br><select id="excArea"><option value="">escolha…</option>${ap.areas.map(a => `<option ${F.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
      <label><span class="rot">Motivo (obrigatório)</span><br><input id="excMotivo" type="text" value="${esc(F.motivo)}" style="width:300px"></label>
      <button class="btn primary" id="excIncluir">Incluir</button></div>
    <div class="csub" style="margin-top:6px">${F.conta ? (fc ? `<b>${esc(F.conta)}</b> ${esc(fc.desc)} — ${fc.cen ? `conta centralizada em <b>${esc(fc.gestor)}</b>${fc.rateio ? ' (rateio por uso: já fica na área do centro de custo)' : ''}` : 'conta por centro de custo (cada área já fica com o seu)'}.` : 'Conta fora do de-para de contas.') : 'Escolha a conta para ver como ela é alocada hoje.'}
      ${F.tipo === 'TAG' ? ' As marcações são dadas pelo modelo ao lançamento (pelo histórico); marcação nova se pede à Controladoria.' : F.tipo === 'AUTORIZA' ? ' Só libera a área a orçar a conta: nenhum histórico muda de área.' : ''}</div></div>` : ''}
  <div class="card"><h3>Exceções em vigor no app <small>${L.length}</small></h3>
    <div class="csub">Amarelo = editável pela Controladoria (área e motivo; para trocar a conta ou o centro de custo, remova e inclua de novo).${ed ? '' : ' <b>Somente leitura neste perfil.</b>'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">${ed ? `<button class="btn primary" id="excSalvar" ${pend ? '' : 'disabled'}>Salvar alterações${pend ? ` (${pend})` : ''}</button>
      <button class="btn" id="excDesfaz" ${pend ? '' : 'disabled'}>Desfazer</button>${EXC.apagar.size ? `<span class="tag y">${EXC.apagar.size} remoção(ões) pendente(s)</span>` : ''}` : ''}</div>
    <div class="tw"><table class="t" id="excTab"><thead><tr><th class="fx">Conta</th><th>Tipo</th><th>Centro de custo / marcação</th><th class="ed">Área que recebe / orça</th><th class="ed">Motivo</th><th>Origem</th><th></th></tr></thead><tbody>
    ${L.map(linha).join('') || '<tr><td colspan="7" class="vazio">Nenhuma exceção no app.</td></tr>'}</tbody></table></div></div>
  ${regra.length ? `<div class="card"><h3>Geradas por regra do modelo no PT desta versão <small>${regra.length} · só leitura</small></h3>
    <div class="csub">O modelo cria estas exceções a cada geração (centro de custo da reestruturação sobre conta centralizada em outra área). Para mandar uma delas a outra área, inclua acima a exceção da mesma conta e do mesmo centro de custo — a do app prevalece sobre a regra.</div>
    <div class="tw" style="max-height:300px"><table class="t"><thead><tr><th>Conta</th><th>Centro de custo</th><th>Área</th></tr></thead><tbody>
    ${regra.map(x => `<tr><td class="w"><b>${esc(x.conta)}</b> ${esc((ap.conta.get(x.conta) || {}).desc || '')}</td><td class="nw">${esc(x.chave)}</td><td>${esc(x.area)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}

function posCfgExcecoes() {
  if (!excAtiva()) return;
  const F = EXC.form, ap = excApoio(); EXC.msg = null;
  const mt = $('excMapaTipo'); if (mt) mt.onchange = e => { est.f.excMapaTipo = e.target.value; desenha(); };      // 16/11/2026: mapa do que sai do CC
  const mb = $('excMapaBusca'); if (mb) mb.onchange = e => { est.f.excMapaBusca = e.target.value; desenha(); };
  const liga = (id, k, redesenha) => { const el = $(id); if (el) el.onchange = e => { F[k] = String(e.target.value).trim(); if (k === 'tipo') F.chave = ''; if (redesenha) desenha(); }; };
  liga('excConta', 'conta', true); liga('excTipo', 'tipo', true); liga('excChave', 'chave'); liga('excArea', 'area'); liga('excMotivo', 'motivo');
  const inc = $('excIncluir'); if (inc) inc.onclick = () => {
    if (!excEdita()) return;
    ['excConta', 'excChave', 'excArea', 'excMotivo'].forEach(id => { const el = $(id); if (el) F[{ excConta: 'conta', excChave: 'chave', excArea: 'area', excMotivo: 'motivo' }[id]] = String(el.value).trim(); });
    const chave = F.tipo === 'AUTORIZA' ? EXC_AUT : F.chave, id = `${F.conta}|${chave}`;
    if (!ap.conta.has(F.conta)) return excAviso('Escolha uma conta do de-para de contas.', true);
    if (F.tipo === 'CC' && !ap.cc.has(chave)) return excAviso('Escolha o centro de custo.', true);
    if (F.tipo === 'TAG' && !ap.tags.includes(chave)) return excAviso('Escolha a marcação do lançamento.', true);
    if (!ap.areas.includes(F.area)) return excAviso('Escolha a área que recebe o gasto (ou é autorizada a orçar).', true);
    if (!F.motivo) return excAviso('Informe o motivo da exceção.', true);
    if (EXC.apagar.has(id)) return excAviso(`A exceção ${F.conta} × ${chave} está com a remoção pendente — salve ou desfaça antes de incluir de novo.`, true);
    if (EXC.rows.some(r => r.id === id)) return excAviso(`Já existe exceção para a conta ${F.conta} e ${F.tipo === 'CC' ? 'o centro de custo ' + chave : chave} — altere a área na lista abaixo.`, true);
    EXC.rows.push({ id, conta: F.conta, chave, tipo: F.tipo, area: F.area, motivo: F.motivo, origem: 'MANUAL', atualizado_em: null, atualizado_por: null });
    EXC.form = { conta: '', tipo: F.tipo, chave: '', area: '', motivo: '' }; desenha(); excAviso('Exceção incluída na lista. Clique em Salvar alterações.');
  };
  document.querySelectorAll('#excTab [data-excid]').forEach(el => el.onchange = () => {
    if (!excEdita()) return;
    const r = EXC.rows.find(x => x.id === el.dataset.excid); if (!r) return;
    r[el.dataset.exck] = String(el.value).trim() || null; EXC.msg = null; desenha();
  });
  document.querySelectorAll('#excTab [data-excdel]').forEach(b => b.onclick = () => {
    if (!excEdita()) return;
    const id = b.dataset.excdel; EXC.rows = EXC.rows.filter(r => r.id !== id); if (EXC.orig.has(id)) EXC.apagar.add(id); EXC.msg = null; desenha();
  });
  const s = $('excSalvar'); if (s) s.onclick = async () => { s.disabled = true; await excSalva(); EXC._ap = null; desenha(); };
  const dz = $('excDesfaz'); if (dz) dz.onclick = () => { EXC.rows = [...EXC.orig.values()].map(r => ({ ...r })); EXC.apagar.clear(); EXC.msg = null; EXC._ap = null; desenha(); };
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js antes de inicia(), depois dos outros ganchos) */
function instalaOrcExcecoes() {
  if (window.__orcExc) return; window.__orcExc = true;
  const antiga = TELAS.cfg_excecoes, posAntiga = POS.cfg_excecoes;
  if (!antiga) return;
  TELAS.cfg_excecoes = () => telaCfgExcecoes(antiga);
  POS.cfg_excecoes = () => { if (excAtiva()) posCfgExcecoes(); else if (posAntiga) posAntiga(); };
  window.addEventListener('beforeunload', e => { if (excPend()) { e.preventDefault(); e.returnValue = ''; } });
}
