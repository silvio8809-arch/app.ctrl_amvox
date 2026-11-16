/* DE-PARA DE CENTROS DE CUSTO (árvore de CC → área do orçamento) — EDITÁVEL NO APP (15/11/2026: "irei usar o App para fazer as configurações, e o PT só
   deve ser gerado quando eu disser que pode… o PT, para ser gerado, deverá consultar o app"; 4º item da fila, 16/11/2026).
   Tabela orc_depara_cc (migração 056; GLOBAL — não é por versão): uma linha por centro de custo com a ÁREA do orçamento que recebe o lançamento feito no CC,
   a LISTA (VÁLIDO / NÃO USAR), MANTER na lista do comunicado (S/N), STATUS (A VALIDAR / VALIDADO) e observação; descrição, grupo da árvore e lançamentos são
   só leitura. Substitui a planilha da árvore validada. Só a Controladoria altera; o banco carimba quem e quando e guarda o histórico (orc_alteracao).
   A lista de CCs nasce do PT (cadastro + razão): a tela não inclui nem exclui centro de custo.
   🔴 O app NÃO recalcula a alocação: o gerador do PT lê esta tabela a CADA geração — a alteração entra nos números quando o PT for gerado de novo.
   A tela mostra quanto da base de cada CC fica hoje na área do CC (lançamento cuja área final é a do CC): é o que tende a mudar de área se ela mudar.
   Carregado ANTES do orcamento.js; instalado pelo gancho instalaOrcCC() DEPOIS dos outros (embrulha a tela cfg_cc, que continua valendo — só leitura —
   enquanto a tabela não existir ou não tiver linhas; e põe um aviso na tela cfg_arvore). Prévia local: D.ccs_dados (alterações só na tela). Nenhum dado aqui. */
"use strict";
const CCS = { pronto: false, carregando: false, instalada: null, erro: null, rows: [], orig: new Map(), sujo: new Set(), msg: null };
const CCS_EDIT = ['area', 'lista', 'manter', 'status', 'observacao'];
const CCS_CARGA = 'rotina:orc_depara_cc_app (carga do PT)';
const ccsEdita = () => est.papel === 'controladoria';
const ccsAtiva = () => CCS.instalada === true && CCS.rows.length > 0;
const ccsN = v => String(v ?? '').trim() || null;

async function ccsCarrega() {
  if (CCS.carregando || CCS.pronto) return;
  CCS.carregando = true; CCS.erro = null;
  try {
    if (window.ORC_FONTE_LOCAL) { CCS.rows = (D.ccs_dados || []).map(x => ({ ...x })); CCS.instalada = Array.isArray(D.ccs_dados); }
    else if (!['controladoria', 'ceo'].includes(est.papelReal)) { CCS.rows = []; CCS.instalada = null; }      // sem leitura da tabela para os demais perfis
    else {
      CCS.rows = await selTodos(() => SB.from('orc_depara_cc').select('*').order('id')); CCS.instalada = true;
      if (CCS.rows.length && !RAZAO) { try { await carregaRazao(); } catch (e) { } }      // base por CC (o razão é carregado sob demanda no app publicado)
    }
  } catch (e) {
    CCS.rows = [];
    if (/orc_depara_cc/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205') CCS.instalada = false;
    else { CCS.instalada = null; CCS.erro = e.message || String(e); }
  }
  CCS.orig = new Map(CCS.rows.map(r => [r.id, { ...r }])); CCS.sujo.clear(); CCS.pronto = true; CCS.carregando = false;
  if (['cfg_cc', 'cfg_arvore'].includes(est.tela)) desenha();
}

/* apoio (do PT desta versão, só leitura): base da janela por CC — total e o que vai para a área PELO CC —, área e status que o PT usou, áreas possíveis */
function ccsApoio() {
  if (CCS._ap && CCS._apD === D && CCS._apR === !!RAZAO) return CCS._ap;
  const base = new Map();
  if (typeof RAZAO !== 'undefined' && RAZAO && D.meta && D.meta.razao) {
    const dic = D.meta.razao.dic.setor;
    RAZAO.forEach(r => { const cc = String(r[5] || ''); if (!cc) return; const x = base.get(cc) || { v: 0, n: 0, pelo: 0 }; x.v += r[6]; x.n++;
      const sc = dic[r[10]] || ''; if (sc && sc === (dic[r[11]] || '')) x.pelo += r[6]; base.set(cc, x); });
  }
  const pt = new Map(((D.cfg_cc && D.cfg_cc.rows) || []).map(r => [String(r[0]), { area: r[2] || '', status: r[3] || '' }]));
  const areas = (D.setores || []).map(s => s.s).filter(s => s !== 'A CLASSIFICAR' && s !== 'Jurídico');     // Jurídico: orçado centralizado em Facilities (regra)
  CCS._ap = { base, pt, areas }; CCS._apD = D; CCS._apR = !!RAZAO; return CCS._ap;
}
function ccsAviso(t, erro) { CCS.msg = { t, erro }; const el = $('ccsAviso'); if (el) { el.className = erro ? 'aviso' : 'ok-box'; el.textContent = t; el.hidden = false; } }
const ccsMudou = r => { const o = CCS.orig.get(r.id) || {}; return CCS_EDIT.filter(k => ccsN(r[k]) !== ccsN(o[k])); };
function ccsMarca(r) { if (ccsMudou(r).length) CCS.sujo.add(r.id); else CCS.sujo.delete(r.id); }
const ccsAreaVale = r => r.lista === 'VÁLIDO' ? (ccsN(r.area) || '') : '';
/* app (já salvo) × PT desta versão: CC cuja área que vale mudou */
function ccsDifPT() {
  const ap = ccsApoio(), out = [];
  CCS.orig.forEach(o => { const p = ap.pt.get(o.id); if (!p) { out.push({ id: o.id, de: '(fora do PT)', para: ccsAreaVale(o) }); return; }
    const para = ccsAreaVale(o); if ((p.area || '') !== para) out.push({ id: o.id, de: p.area || '(sem área)', para: para || '(sem área)' }); });
  return out;
}

async function ccsSalva() {
  const ids = [...CCS.sujo];
  if (!ids.length) return true;
  if (window.ORC_FONTE_LOCAL) {
    const agora_ = new Date().toISOString();
    ids.forEach(id => { const r = CCS.rows.find(x => x.id === id); if (r) { r.atualizado_em = agora_; r.atualizado_por = 'prévia local'; CCS.orig.set(id, { ...r }); } });
    CCS.sujo.clear(); ccsAviso('Prévia local: alterações guardadas só nesta tela (no app publicado vão para o banco, com histórico de quem e quando).'); return true;
  }
  let n = 0;
  try {
    for (const id of ids) {
      const r = CCS.rows.find(x => x.id === id); if (!r) { CCS.sujo.delete(id); continue; }
      const campos = {}; ccsMudou(r).forEach(k => campos[k] = ccsN(r[k]));
      if (Object.keys(campos).length) {
        const { data, error } = await SB.from('orc_depara_cc').update(campos).eq('id', id).select('id,area,lista,manter,status,observacao,atualizado_em,atualizado_por');
        if (error) throw error;
        if (!data || !data.length) throw new Error(`o centro de custo ${id} não foi alterado (sem permissão ou fora do de-para)`);
        Object.assign(r, data[0]); n++;
      }
      CCS.orig.set(id, { ...r }); CCS.sujo.delete(id);
    }
    ccsAviso(`✓ ${n} centro(s) de custo salvo(s), com histórico de quem e quando. Entram na alocação e no orçamento na próxima geração do PT, que lê este de-para.`); return true;
  } catch (e) { ccsAviso(`Não foi possível salvar${n ? ` (${n} já salvos)` : ''}: ` + (e.message || e), true); return false; }
}

function ccsFiltro() {
  const f = est.f, busca = (f.ccsBusca || '').toUpperCase().trim(), dif = new Set(ccsDifPT().map(x => x.id));
  const base = CCS.rows.filter(r => (!busca || `${r.id} ${r.descricao || ''} ${r.area || ''} ${r.grupo || ''} ${r.observacao || ''}`.toUpperCase().includes(busca))
    && (!f.ccsGrupo || (r.grupo || '—') === f.ccsGrupo) && (!f.ccsArea || ccsAreaVale(r) === f.ccsArea));
  const fil = { val: r => r.lista === 'VÁLIDO', nao: r => r.lista !== 'VÁLIDO', sem: r => r.lista === 'VÁLIDO' && !ccsN(r.area), validar: r => r.status !== 'VALIDADO',
    mud: r => dif.has(r.id) || CCS.sujo.has(r.id) };
  const card = f.ccsCard || '', L_ = (card && fil[card] ? base.filter(fil[card]) : base).slice().sort((a, b) => a.id.localeCompare(b.id));
  return { base, fil, card, L_ };
}

function telaCfgCC(antiga) {
  const tit = 'De-para de centros de custo';
  if (!CCS.pronto) { if (!CCS.carregando) setTimeout(ccsCarrega, 0); return cabecalho(tit, '') + '<div class="status">Carregando o de-para de centros de custo…</div>'; }
  if (!ccsAtiva()) {
    const porque = CCS.instalada === false ? 'A edição do de-para de centros de custo entra no ar quando a migração 056 for rodada no banco. Até lá, a fonte é o PT.'
      : CCS.erro ? `Não foi possível ler o de-para de centros de custo editável (${esc(CCS.erro)}). Abaixo, o que o PT desta versão usou.`
      : CCS.instalada === true ? 'O de-para de centros de custo editável ainda não recebeu os centros de custo (a semente vem do PT). Abaixo, o que o PT desta versão usou.' : '';
    return (porque ? `<div class="aviso">${porque}</div>` : '') + antiga();
  }
  const f = est.f, ed = ccsEdita(), dis = ed ? '' : 'disabled', ap = ccsApoio(), { base, fil, card, L_ } = ccsFiltro(), pend = CCS.sujo.size, dif = ccsDifPT(), m = D.meta && D.meta.ccs;
  const cont = k => base.filter(fil[k]).length, b = cc => ap.base.get(cc) || { v: 0, n: 0, pelo: 0 }, totPelo = soma(base, r => Math.abs(b(r.id).pelo));
  const movel = soma(dif, x => b(x.id).pelo), grupos = [...new Set(CCS.rows.map(r => r.grupo || '—'))].sort(), areasUsadas = [...new Set(CCS.rows.map(ccsAreaVale).filter(Boolean))].sort();
  const kp = (k, lab, v, meta, cls = '') => `<button class="kpi ${cls} ${card === k ? 'sel' : ''}" data-ccscard="${k}"><div class="lab">${lab}</div><div class="val">${v}</div><div class="meta">${meta}</div></button>`;
  const linha = r => { const bb = b(r.id), p = ap.pt.get(r.id), nao = r.lista !== 'VÁLIDO', vale = ccsAreaVale(r), mudou = p && (p.area || '') !== vale;
    const ops = ap.areas.concat(r.area && !ap.areas.includes(r.area) ? [r.area] : []);
    return `<tr ${CCS.sujo.has(r.id) ? 'style="background:#FFF7E6"' : ''}>
      <td class="fx w"><b>${esc(r.id)}</b> ${esc(r.descricao || '')}<br><small style="color:var(--ink3)">${esc(r.grupo || '—')}${r.lancamentos != null ? ` · ${r.lancamentos.toLocaleString('pt-BR')} lanç. desde 01/07` : ''}</small></td>
      ${tdN(bb.v)}<td class="n" title="Parte da base que hoje fica na área do centro de custo — é o que tende a mudar de área se a área do CC mudar (conta centralizada e exceção têm prioridade)">${fmt(bb.pelo)}<br><small style="color:var(--ink3)">${bb.n} lanç.</small></td>
      <td class="ed"><select data-ccsid="${esc(r.id)}" data-ccsk="area" style="max-width:210px" ${nao ? 'disabled' : dis}><option value="">${nao ? '—' : '(sem área — consultar)'}</option>${ops.map(a => `<option ${!nao && r.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>${!nao && r.area && !ap.areas.includes(r.area) ? '<br><span class="tag r">área fora da lista</span>' : ''}</td>
      <td class="ed"><select data-ccsid="${esc(r.id)}" data-ccsk="lista" ${dis}>${['VÁLIDO', 'NÃO USAR'].map(o => `<option ${r.lista === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
      <td class="ed"><select data-ccsid="${esc(r.id)}" data-ccsk="manter" ${dis}>${['S', 'N'].map(o => `<option ${r.manter === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
      <td class="nw"><span class="tag ${r.status === 'VALIDADO' ? 'g' : 'y'}">${esc(r.status)}</span>${ed ? ` <button class="btn" data-ccsst="${esc(r.id)}">${r.status === 'VALIDADO' ? 'Reabrir' : 'Validar'}</button>` : ''}</td>
      <td class="ed"><input type="text" data-ccsid="${esc(r.id)}" data-ccsk="observacao" value="${esc(r.observacao || '')}" style="width:240px" ${dis}></td>
      <td class="nw">${!p ? '<span class="tag b">fora do PT desta versão</span>' : mudou ? `<span class="tag r" title="Área que o PT desta versão usou">PT: ${esc(p.area || 'sem área')}</span>` : '<small style="color:var(--ink3)">igual ao PT</small>'}</td></tr>`; };
  return `${cabecalho(tit, 'Em que <b>área do orçamento</b> cai o lançamento feito em cada centro de custo. Vale para as contas que não são centralizadas e para as de rateio por uso; conta centralizada e exceção conta × CC têm prioridade. CC <b>NÃO USAR</b> = código que não se usa mais; <b>manter</b> = fica na lista do comunicado aos gestores.',
    `<div class="filtros" style="margin-left:auto"><input id="ccsBusca" placeholder="CC, descrição, área ou grupo" value="${esc(f.ccsBusca || '')}" style="width:200px">
      <select id="ccsGrupo"><option value="">Todos os grupos</option>${grupos.map(g => `<option ${f.ccsGrupo === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
      <select id="ccsArea"><option value="">Todas as áreas</option>${areasUsadas.map(a => `<option ${f.ccsArea === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>`)}
  <div id="ccsAviso" class="${CCS.msg && CCS.msg.erro ? 'aviso' : 'ok-box'}" ${CCS.msg ? '' : 'hidden'}>${CCS.msg ? esc(CCS.msg.t) : ''}</div>
  ${dif.length ? `<div class="aviso">⚠ <b>${dif.length} centro(s) de custo com área diferente da que o PT desta versão usou</b>: ${dif.slice(0, 6).map(x => `${esc(x.id)} ${esc(x.de)} → ${esc(x.para)}`).join(' · ')}${dif.length > 6 ? ` · e mais ${dif.length - 6}` : ''}. Base da janela que tende a mudar de área (lançamentos que hoje ficam na área do CC): <b>${rsC(movel)}</b>. A alocação e os números só mudam quando o PT for gerado de novo — ele lê esta tela a cada geração.</div>`
    : `<div class="info">${m && m.lida_em && !m.sem_leitura ? `O PT desta versão foi gerado com este de-para (lido do app em <b>${esc(m.lida_em)}</b>).` : 'As áreas do app são as mesmas que o PT desta versão usou.'} O que for alterado aqui entra na <b>próxima geração do PT</b>.</div>`}
  <section class="kpis">
    ${kp('', 'Centros de custo', base.length, `base na área do CC ${rsC(totPelo)}`)}
    ${kp('val', 'Válidos', cont('val'), 'recebem lançamento')}${kp('nao', 'Não usar', cont('nao'), 'códigos fora de uso', 'k5')}
    ${kp('sem', 'Válidos sem área', cont('sem'), 'caem no padrão da conta', 'k3')}${kp('validar', 'A validar', cont('validar'), 'conferir e validar', 'k2')}
    ${kp('mud', 'Diferentes do PT', cont('mud'), 'entram na próxima geração', 'k3')}
  </section>
  <div class="card"><h3>Área de cada centro de custo ${card ? '— filtro do cartão' : ''} <small>${L_.length} CC(s)</small></h3>
    <div class="csub">Amarelo = editável pela Controladoria. A <b>base</b> é o realizado jul–out/26 do PT desta versão (todas as contas); <b>na área do CC</b> é a parte que hoje fica na área do centro de custo — é o que tende a mudar de área se ela mudar. O Jurídico não aparece na lista de áreas: é orçado centralizado em Facilities.${ed ? '' : ' <b>Somente leitura neste perfil.</b>'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
      ${ed ? `<button class="btn primary" id="ccsSalvar" ${pend ? '' : 'disabled'}>Salvar alterações${pend ? ` (${pend})` : ''}</button>
      <button class="btn" id="ccsDesfaz" ${pend ? '' : 'disabled'}>Desfazer</button>
      <button class="btn" id="ccsValidarTodos" ${L_.some(r => r.status !== 'VALIDADO') ? '' : 'disabled'}>Validar os ${L_.filter(r => r.status !== 'VALIDADO').length} deste filtro</button>` : ''}</div>
    <div class="tw" style="margin-top:6px"><table class="t" id="ccsTab"><thead><tr><th class="fx">Centro de custo</th><th class="n">Base jul–out</th><th class="n" title="Parte da base que hoje fica na área do centro de custo">Na área do CC</th><th class="ed">Área do orçamento</th><th class="ed">Lista</th><th class="ed" title="Fica na lista do comunicado aos gestores">Manter</th><th>Status</th><th class="ed">Observação</th><th>× PT</th></tr></thead><tbody>
    ${L_.map(linha).join('') || '<tr><td colspan="9" class="vazio">Nenhum centro de custo neste filtro.</td></tr>'}
    </tbody></table></div></div>`;
}

function posCfgCC() {
  if (!ccsAtiva()) return;
  const f = est.f, ap = ccsApoio(); CCS.msg = null;
  const liga = (id, chave) => { const el = $(id); if (el) el.onchange = e => { f[chave] = e.target.value; desenha(); }; };
  liga('ccsBusca', 'ccsBusca'); liga('ccsGrupo', 'ccsGrupo'); liga('ccsArea', 'ccsArea');
  document.querySelectorAll('#tela [data-ccscard]').forEach(x => x.onclick = () => { f.ccsCard = f.ccsCard === x.dataset.ccscard || !x.dataset.ccscard ? null : x.dataset.ccscard; desenha(); });
  document.querySelectorAll('#ccsTab [data-ccsid]').forEach(el => el.onchange = () => {
    if (!ccsEdita()) return;
    const r = CCS.rows.find(x => x.id === el.dataset.ccsid); if (!r) return;
    const k = el.dataset.ccsk, v = String(el.value).trim(); CCS.msg = null;          // o aviso da ação anterior não acompanha esta
    if (k === 'area' && v && !ap.areas.includes(v)) { ccsAviso(`Área fora da lista: ${v}. Escolha uma das opções.`, true); el.value = r.area || ''; return; }
    if (k === 'lista' && !['VÁLIDO', 'NÃO USAR'].includes(v)) return;
    if (k === 'manter' && !['S', 'N'].includes(v)) return;
    r[k] = v || null; ccsMarca(r); desenha();
  });
  document.querySelectorAll('#tela [data-ccsst]').forEach(x => x.onclick = () => {
    const r = CCS.rows.find(y => y.id === x.dataset.ccsst); if (!r) return;
    r.status = r.status === 'VALIDADO' ? 'A VALIDAR' : 'VALIDADO'; ccsMarca(r); desenha();
  });
  const vt = $('ccsValidarTodos'); if (vt) vt.onclick = () => {
    const L_ = ccsFiltro().L_.filter(r => r.status !== 'VALIDADO');
    if (!L_.length || !confirm(`Validar ${L_.length} centro(s) de custo com o que está na tela?`)) return;
    L_.forEach(r => { r.status = 'VALIDADO'; ccsMarca(r); }); desenha(); ccsAviso(`${L_.length} centro(s) de custo marcados como validados. Clique em Salvar alterações.`);
  };
  const s = $('ccsSalvar'); if (s) s.onclick = async () => { s.disabled = true; await ccsSalva(); desenha(); };
  const dz = $('ccsDesfaz'); if (dz) dz.onclick = () => {
    CCS.sujo.forEach(id => { const r = CCS.rows.find(x => x.id === id), o = CCS.orig.get(id); if (r && o) Object.assign(r, o); });
    CCS.sujo.clear(); CCS.msg = null; desenha();
  };
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js antes de inicia(), depois dos outros ganchos) */
function instalaOrcCC() {
  if (window.__orcCcs) return; window.__orcCcs = true;
  const antiga = TELAS.cfg_cc, posAntiga = POS.cfg_cc, antigaArv = TELAS.cfg_arvore;
  if (antiga) { TELAS.cfg_cc = () => telaCfgCC(antiga); POS.cfg_cc = () => { if (ccsAtiva()) posCfgCC(); else if (posAntiga) posAntiga(); }; }
  if (antigaArv) TELAS.cfg_arvore = () => {
    if (!CCS.pronto && !CCS.carregando) setTimeout(ccsCarrega, 0);
    return (ccsAtiva() ? '<div class="info">A árvore de centros de custo se altera em <b>Configuração › De-para de CC</b> (o app é a mestra). Abaixo, o que o PT desta versão usou.</div>' : '') + antigaArv();
  };
  window.addEventListener('beforeunload', e => { if (CCS.sujo.size) { e.preventDefault(); e.returnValue = ''; } });
}
