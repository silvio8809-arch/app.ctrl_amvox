/* PREMISSAS GERAIS EDITÁVEIS — Silvio 14/11/2026: "onde posso atualizar as premissas no app e consequentemente no PT?" → "Sim, editar no app".
   Carregado ANTES do orcamento.js; instalado pelo gancho instalaOrcPremissas() (usa TELAS, POS, D, est, SB… de lá), DEPOIS do instalaOrcDre().
   Dados: tabela orc_premissa da versão (migração 052 — só a Controladoria altera, em versão editável; histórico em orc_alteracao).
   Uma linha por célula de entrada (amarela) da aba PREMISSAS do PT. O gerador do PT lê esta tabela a cada geração e grava na célula SÓ a premissa
   ALTERADA AQUI (editada = true — o banco marca quando uma pessoa muda o valor); essa prevalece sobre o PT. A que ninguém alterou segue o PT.
   "Voltar a seguir o PT" desmarca. O app NÃO recalcula a DRE: o que muda aqui aparece nos números depois que o PT for gerado de novo e
   recarregado (valor ≠ valor_pt = pendente).
   Prévia local: D.premissas_app (alterações só na tela). Sem a migração 052 a tela antiga (só leitura) continua valendo. */
const PRM = { versao: null, rows: [], sujo: new Map(), soltar: new Set(), inval: new Map(), carregando: false, erro: null, instalada: null, motivo: '', msg: null };
const PRM_NUM = new Set(['numero', 'percentual', 'inteiro', 'mes']);

const prmAtiva = () => PRM.instalada === true && PRM.versao === est.versao && PRM.rows.length > 0;
const prmPode = () => versaoEditavel() && est.papel === 'controladoria';
const prmVazio = v => v == null || v === '';
const prmTxt = v => prmVazio(v) ? null : String(v);
const prmVal = r => PRM.soltar.has(r.id) ? prmTxt(r.valor_pt) : PRM.sujo.has(r.id) ? PRM.sujo.get(r.id) : prmTxt(r.valor);     // o que está na tela
const prmMexidas = () => new Set([...PRM.sujo.keys(), ...PRM.soltar]);
const prmN = v => prmVazio(v) ? 0 : Number(v);
function prmIgual(a, b, tipo) {
  if (prmVazio(a) || prmVazio(b)) return prmVazio(a) && prmVazio(b);
  if (PRM_NUM.has(tipo)) { const x = Number(a), y = Number(b); return Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y)); }
  return String(a).trim() === String(b).trim();
}
function prmCanon(n, casas) {                     // número → texto gravado (ponto decimal, sem notação científica)
  const x = +(+n).toFixed(casas); let s = String(x);
  if (/e/i.test(s)) s = x.toFixed(casas).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}
function prmFmt(v, tipo) {                        // valor gravado → como aparece no campo
  if (prmVazio(v)) return '';
  if (tipo === 'percentual') return (+(Number(v) * 100).toFixed(8)).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
  if (tipo === 'numero') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
  return String(v);
}
const prmMostra = (v, tipo) => prmVazio(v) ? 'vazio' : prmFmt(v, tipo) + (tipo === 'percentual' ? '%' : '');
function prmParse(txt, r) {                       // texto digitado → valor gravado (ou null); lança Error com a explicação
  let s = String(txt == null ? '' : txt).trim();
  if (r.tipo === 'sn' || r.tipo === 'lista') { if (!s) throw new Error('não pode ficar vazio'); return s; }
  if (r.tipo === 'texto') return s || null;
  s = s.replace(/\s|R\$|%/g, '').replace(/[−–]/g, '-');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');          // 1.234.567 = milhar
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('não é número');
  const n = Number(s);
  if (r.tipo === 'inteiro' || r.tipo === 'mes') {
    if (!Number.isInteger(n)) throw new Error('precisa ser número inteiro');
    if (r.tipo === 'mes' && (n < 1 || n > 12)) throw new Error('o mês vai de 1 a 12');
    return String(n);
  }
  return r.tipo === 'percentual' ? prmCanon(n / 100, 10) : prmCanon(n, 6);
}
const prmNome = r => r.rotulo + (r.coluna ? ' · ' + r.coluna : '');
const prmDriver = r => ((D.premissas && D.premissas.drivers) || []).find(d => String(d[0]).trim() === String(r.rotulo).trim());
const prmAch = (g, pre) => PRM.rows.filter(r => r.grupo === g && r.rotulo.startsWith(pre));

async function prmCarrega() {
  if (PRM.carregando || PRM.versao === est.versao) return;
  PRM.carregando = true; PRM.erro = null;
  try {
    if (window.ORC_FONTE_LOCAL) { PRM.rows = (D.premissas_app || []).map(x => ({ ...x })); PRM.instalada = Array.isArray(D.premissas_app); }
    else if (!['controladoria', 'ceo'].includes(est.papelReal)) { PRM.rows = []; PRM.instalada = null; }          // sem leitura da tabela para os demais perfis
    else { PRM.rows = await selTodos(() => SB.from('orc_premissa').select('*').eq('versao', est.versao).order('ordem')); PRM.instalada = true; }
  } catch (e) {
    PRM.rows = [];
    if (/orc_premissa/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205') PRM.instalada = false;
    else { PRM.instalada = null; PRM.erro = e.message || String(e); }
  }
  PRM.sujo.clear(); PRM.soltar.clear(); PRM.inval.clear(); PRM.motivo = ''; PRM.versao = est.versao; PRM.carregando = false;
  if (['cfg_premissas', 'premissas_orc'].includes(est.tela)) desenha();
}
function prmAviso(t, erro) {                      // guarda a mensagem: o desenho seguinte a mostra de novo (e depois some)
  PRM.msg = { t, erro }; const el = $('prmAviso'); if (el) { el.className = erro ? 'aviso' : 'ok-box'; el.textContent = t; el.hidden = false; }
}
const prmPendentes = () => PRM.rows.filter(r => !prmIgual(r.valor, r.valor_pt, r.tipo));

/* ---------------------------------------------------------------- receita (cenário e curvas) com o que está na tela */
function prmReceitaCalc() {
  const g = 'Receita 2027', um = pre => prmAch(g, pre)[0], curva = pre => MESES.map(m => prmAch(g, pre).find(r => r.coluna === m));
  const cen = um('CENÁRIO'), tcp = um('PLANO TCP'), pdR = curva('P&D'), manR = curva('MANUAL');
  if (!cen || !tcp || pdR.some(x => !x) || manR.some(x => !x)) return null;
  const pd = pdR.map(r => prmN(prmVal(r))), man = manR.map(r => prmN(prmVal(r))), tPd = soma(pd), tT = prmN(prmVal(tcp));
  const tc = pd.map(v => tPd ? tT * v / tPd : 0), c = prmVal(cen);
  return { cen, tcp, pdR, manR, pd, man, tc, tPd, tT, c, adot: c === 'PLANO TCP' ? tc : c === 'MANUAL' ? man : pd };
}
function prmRegras() {                            // regras de conjunto — só travam o que foi mexido
  const er = [], suj = pre => [...prmMexidas()].some(id => { const r = PRM.rows.find(x => x.id === id); return r && pre(r); });
  const rec = PRM.rows.filter(r => r.grupo === 'Fluxo de caixa' && r.rotulo.startsWith('Recebimento'));
  if (rec.length && suj(r => rec.includes(r))) {
    const s = soma(rec, r => prmN(prmVal(r)));
    if (Math.abs(s - 1) > 1e-6) er.push(`Os prazos de recebimento precisam somar 100% (estão em ${pc(s, 2)}).`);
  }
  const R = prmReceitaCalc();
  if (R && suj(r => r.grupo === 'Receita 2027')) {
    if (R.tPd <= 0) er.push('A curva da meta do P&D não pode ficar zerada (ela dá a sazonalidade do Plano TCP).');
    if (R.c === 'MANUAL' && soma(R.man) <= 0) er.push('Cenário MANUAL exige a curva mensal preenchida.');
    if (R.c === 'PLANO TCP' && R.tT <= 0) er.push('Cenário PLANO TCP exige o total do plano.');
  }
  return er;
}
function prmSinal(r, novo) {                      // driver de dedução entra com o mesmo sinal do realizado
  if (!r.grupo.startsWith('Drivers') || prmVazio(novo)) return;
  const d = prmDriver(r), real = d && +d[1];
  if (real && Number(novo) && Math.sign(real) !== Math.sign(Number(novo)))
    throw new Error(`o sinal precisa ser o do realizado (${pc(real, 2)}) — ${real < 0 ? 'dedução entra negativa' : 'este percentual é positivo'}`);
}

/* ---------------------------------------------------------------- campos */
function prmTag(r) {
  if (PRM.inval.has(r.id)) return `<span class="tag r" title="${esc(PRM.inval.get(r.id))}">inválido</span>`;
  if (PRM.soltar.has(r.id)) return '<span class="tag r" title="Ao salvar, esta premissa deixa de ser fixada pelo app e volta a seguir o PT">volta ao PT · não salvo</span>';
  if (PRM.sujo.has(r.id)) return '<span class="tag r">não salvo</span>';
  const quem = r.editada ? `Alterada no app por ${r.atualizado_por || '—'}${r.atualizado_em ? ' em ' + new Date(r.atualizado_em).toLocaleString('pt-BR') : ''}${r.justificativa ? ' — ' + r.justificativa : ''}` : '';
  const solta = r.editada && prmPode() ? `<button class="prm-solta" data-prmsolta="${esc(r.id)}" title="Voltar a seguir o PT (desfaz a alteração feita no app)">↺</button>` : '';
  if (!prmIgual(r.valor, r.valor_pt, r.tipo)) return `<span class="tag y" title="${esc(quem + '. ')}O PT carregado nesta versão ainda usa este valor — muda na próxima geração">PT: ${esc(prmMostra(r.valor_pt, r.tipo))}</span>${solta}`;
  return r.editada ? `<span class="tag b" title="${esc(quem)}. O PT desta versão já está com este valor">alterada no app</span>${solta}` : '';
}
function prmCampo(r, ph) {
  const v = prmVal(r), dis = prmPode() ? '' : 'disabled', cls = 'prm-in' + (PRM.sujo.has(r.id) || PRM.soltar.has(r.id) ? ' sujo' : '') + (PRM.inval.has(r.id) ? ' erro' : '');
  if (r.tipo === 'sn' || r.tipo === 'lista') {
    const ops = r.tipo === 'sn' ? ['S', 'N'] : (r.opcoes || []);
    return `<select class="${cls}" data-prm="${esc(r.id)}" ${dis}>${ops.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  return `<input class="${cls}" data-prm="${esc(r.id)}" value="${esc(prmFmt(v, r.tipo))}" inputmode="decimal" autocomplete="off" placeholder="${esc(ph || '')}" ${dis}>` +
    (r.tipo === 'percentual' ? '<span class="prm-suf">%</span>' : '');
}
const prmLinha = r => `<div class="sumline prm-l"><span class="t">${esc(prmNome(r))}${r.observacao ? `<br><small>${esc(r.observacao)}</small>` : ''}</span>
  <span class="v prm-v">${prmCampo(r)}<span data-prmtag="${esc(r.id)}">${prmTag(r)}</span></span></div>`;
const prmCartao = (titulo, sub, corpo) => `<div class="card"><h3>${esc(titulo)}</h3>${sub ? `<div class="csub">${sub}</div>` : ''}${corpo}</div>`;

function prmReceitaHtml() {
  const R = prmReceitaCalc(), g = 'Receita 2027';
  if (!R) return prmCartao(g, '', PRM.rows.filter(r => r.grupo === g).map(prmLinha).join(''));
  const cel = (r) => `<td class="n ed">${prmCampo(r)}<div data-prmtag="${esc(r.id)}">${prmTag(r)}</div></td>`;
  const calc = (id, vs) => vs.map((v, i) => `<td class="n" id="${id}-${i}">${fmt(v)}</td>`).join('');
  return `<div class="card"><h3>Receita 2027 — cenário e curvas</h3>
    <div class="csub">O cenário escolhido dá o faturamento do ano, que puxa os percentuais da DRE, as contas por % do faturamento e os recebimentos do caixa.</div>
    ${prmLinha(R.cen)}
    <div class="sumline big"><span class="t">Faturamento 2027 com o que está nesta tela</span><span class="v" id="prm-adot-res"></span></div>
    <div class="tw solta" style="margin-top:8px"><table class="t prm-curva"><thead><tr><th class="fx">Curva mensal (R$)</th>${MESES.map(m => `<th class="n">${m}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
      <tr><td class="fx"><b>${esc(R.pdR[0].rotulo)}</b></td>${R.pdR.map(cel).join('')}<td class="n" id="prm-pd-tot"></td></tr>
      <tr><td class="fx"><b>${esc(R.tcp.rotulo)}</b><br><small style="color:var(--ink3)">total do plano na sazonalidade da meta do P&amp;D</small></td>${calc('prm-tcp', R.tc)}<td class="n ed">${prmCampo(R.tcp)}<div data-prmtag="${esc(R.tcp.id)}">${prmTag(R.tcp)}</div></td></tr>
      <tr><td class="fx"><b>${esc(R.manR[0].rotulo)}</b><br><small style="color:var(--ink3)">só vale com o cenário MANUAL</small></td>${R.manR.map(cel).join('')}<td class="n" id="prm-man-tot"></td></tr>
      <tr class="hl"><td class="fx"><b>Adotado</b></td>${calc('prm-adot', R.adot)}<td class="n" id="prm-adot-tot"></td></tr>
    </tbody></table></div></div>`;
}
function prmDriversHtml(rows) {
  return `<div class="card"><h3>${esc(rows[0].grupo)}</h3>
    <div class="csub">Vazio = usa o realizado jul–out/26. Para assumir uma meta (a do Plano TCP ou outra), digite o percentual em “Sobrescrever”, com o mesmo sinal do realizado.</div>
    <div class="tw solta"><table class="t"><thead><tr><th>Driver</th><th class="n">Realizado jul–out/26</th><th class="n">Plano TCP 2027</th><th class="n ed">Sobrescrever</th><th class="n">Adotado</th><th></th></tr></thead><tbody>
    ${rows.map(r => { const d = prmDriver(r); return `<tr><td class="w">${esc(r.rotulo)}${r.observacao ? `<br><small style="color:var(--ink3)">${esc(r.observacao)}</small>` : ''}</td>
      <td class="n">${d ? pc(d[1], 2) : '—'}</td><td class="n">${d ? pc(d[2], 2) : '—'}</td><td class="n ed nw">${prmCampo(r, 'realizado')}</td>
      <td class="n"><b data-prmadot="${esc(r.id)}"></b></td><td class="nw" data-prmtag="${esc(r.id)}">${prmTag(r)}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}
function prmSoLeitura() {                         // o que NÃO se altera aqui: vem da base do realizado, de fórmula ou da planilha do P&D
  const P = D.premissas, tem = new Set(PRM.rows.map(r => String(r.rotulo).trim()));
  const val = v => typeof v === 'number' ? (Math.abs(v) < 1 && v !== 0 ? pc(v, 2) : fmt(v, { uni: 'R$' })) : esc(v == null ? '(vazio)' : v);
  const fora = (P.params || []).concat(P.modelo_gestor || [], P.compras || [], P.caixa || []).filter(p => p[0] && !tem.has(String(p[0]).trim()));
  return `<details class="card"><summary style="cursor:pointer;font-weight:700">Demais parâmetros (só leitura: vêm da base do realizado, de fórmula ou da planilha do P&amp;D)</summary>
    ${fora.map(p => `<div class="sumline"><span class="t">${esc(p[0])}${p[2] ? `<br><small style="color:var(--ink3)">${esc(p[2])}</small>` : ''}</span><span class="v">${val(p[1])}</span></div>`).join('')}
    <div class="tw solta" style="margin-top:8px"><table class="t"><thead><tr><th class="fx">Plano de compras do P&amp;D (planilha do P&amp;D)</th>${MESES.map(m => `<th class="n">${m}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
    ${(P.plano_compras || []).map(r => `<tr><td class="fx">${esc(r.rotulo)}</td>${r.m.map(v => tdN(v)).join('')}${tdN(r.tot)}</tr>`).join('')}</tbody></table></div></details>
  <div class="card"><h3>Diretrizes 2027</h3>${(P.diretrizes || []).map(d => `<div class="sumline"><span class="t">${esc(d[0])} ${esc(d[1])}</span></div>`).join('')}</div>`;
}
function prmEstado() {                            // o PT desta versão × o que está salvo aqui
  const pend = prmPendentes(), m = D.meta.premissas_app, nEd = PRM.rows.filter(r => r.editada).length;
  const ult = PRM.rows.filter(r => r.atualizado_em && !/carga do PT/.test(r.atualizado_por || '')).sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)))[0];
  const ultTxt = ult ? ` Última alteração: ${new Date(ult.atualizado_em).toLocaleString('pt-BR')} por ${esc(ult.atualizado_por || '—')} (${esc(prmNome(ult))}).` : '';
  if (pend.length) return `<div class="aviso">⚠ <b>${pend.length} premissa(s) alterada(s) que o PT desta versão ainda não reflete:</b>
    ${pend.slice(0, 6).map(r => `${esc(prmNome(r))} = <b>${esc(prmMostra(r.valor, r.tipo))}</b> (PT: ${esc(prmMostra(r.valor_pt, r.tipo))})`).join(' · ')}${pend.length > 6 ? ` · e mais ${pend.length - 6}` : ''}.
    Os números do app (DRE, caixa, painéis) só mudam depois que o PT for gerado de novo e recarregado.${ultTxt}</div>`;
  return `<div class="ok-box">✓ O PT desta versão está com as mesmas premissas desta tela${m ? ` (lidas do app em ${esc(m.lida_em)})` : ' — ele é anterior à leitura das premissas pelo app, que começa na próxima geração'}.
    ${nEd ? `${nEd} premissa(s) alterada(s) no app (as demais seguem o PT).` : 'Nenhuma premissa foi alterada no app: todas seguem o PT.'}${ultTxt}</div>`;
}
function telaCfgPremissas(antiga) {
  if (PRM.versao !== est.versao) { if (!PRM.carregando) setTimeout(prmCarrega, 0); return cabecalho('Premissas do orçamento, da DRE e do caixa 2027', '') + '<div class="status">Carregando as premissas…</div>'; }
  if (!prmAtiva()) {
    const porque = PRM.instalada === false ? 'A edição das premissas entra no ar quando a migração 052 for rodada no banco. Até lá, a fonte é a aba PREMISSAS do PT.'
      : PRM.erro ? 'Não foi possível ler as premissas editáveis (' + esc(PRM.erro) + '). Abaixo, o que o PT desta versão usou.'
      : 'A lista de premissas editáveis desta versão ainda não foi carregada — entra na próxima carga do PT. Abaixo, o que o PT desta versão usou.';
    return `<div class="aviso">${porque}</div>` + antiga();
  }
  const pode = prmPode(), grupos = [...new Set(PRM.rows.map(r => r.grupo))], msg = PRM.msg; PRM.msg = null;
  let h = `${cabecalho('Premissas do orçamento, da DRE e do caixa 2027', 'Altere e salve: fica o histórico de quem mudou, e o PT lê estes valores a cada geração. ' +
    'O app não recalcula a DRE sozinho — os números mudam depois que o PT for gerado de novo e recarregado.')}
  ${prmEstado()}
  <div class="card prm-barra">${pode ? `<div class="prm-barra-l"><input id="prmMotivo" class="prm-motivo" maxlength="300" placeholder="Motivo da alteração — quem decidiu e quando (fica no histórico)" value="${esc(PRM.motivo)}">
      <button class="btn primary" id="prmSalvar">Salvar alterações</button><button class="btn" id="prmDesfaz">Desfazer</button><span class="csub" id="prmCont"></span></div>`
    : `<div class="csub">🔒 Só a Controladoria altera as premissas, e só em versão em rascunho ou em revisão${versaoEditavel() ? '' : ' (esta versão está fechada)'}.</div>`}
    <div id="prmAviso" class="${msg && msg.erro ? 'aviso' : 'ok-box'}" style="margin-top:8px" ${msg ? '' : 'hidden'}>${msg ? esc(msg.t) : ''}</div></div>`;
  grupos.forEach(g => {
    const rows = PRM.rows.filter(r => r.grupo === g);
    if (g === 'Receita 2027') h += prmReceitaHtml();
    else if (g.startsWith('Drivers')) h += prmDriversHtml(rows);
    else h += prmCartao(g, g === 'Fluxo de caixa' ? 'Soma dos prazos de recebimento: <b id="prm-soma-rec"></b> (tem de dar 100%)' : '', rows.map(prmLinha).join(''));
  });
  return h + prmSoLeitura();
}
function prmDerivados() {                         // atualiza o que é calculado, sem redesenhar a tela (não perde o foco de quem está digitando)
  const R = prmReceitaCalc(), poe = (id, t) => { const el = $(id); if (el) el.innerHTML = t; };
  if (R) {
    R.tc.forEach((v, i) => poe('prm-tcp-' + i, fmt(v))); R.adot.forEach((v, i) => poe('prm-adot-' + i, fmt(v)));
    poe('prm-pd-tot', fmt(R.tPd)); poe('prm-man-tot', fmt(soma(R.man))); poe('prm-adot-tot', '<b>' + fmt(soma(R.adot)) + '</b>');
    const tot = soma(R.adot), pt = +D.meta.receita || 0, dif = tot - pt;
    poe('prm-adot-res', `${rsC(tot)} <small>cenário ${esc(R.c || '')}${Math.abs(dif) > 0.5 ? ` · o PT desta versão está com ${rsC(pt)} (${dif > 0 ? '+' : '−'}${rsC(Math.abs(dif)).replace('R$ ', 'R$ ')})` : ' · igual ao PT desta versão'}</small>`);
  }
  PRM.rows.filter(r => r.grupo.startsWith('Drivers')).forEach(r => {
    const el = document.querySelector(`#tela [data-prmadot="${r.id}"]`), d = prmDriver(r), v = prmVal(r);
    if (el) el.textContent = prmVazio(v) ? (d ? pc(d[1], 2) : '—') : pc(Number(v), 2);
  });
  const rec = PRM.rows.filter(r => r.grupo === 'Fluxo de caixa' && r.rotulo.startsWith('Recebimento'));
  if (rec.length) { const s = soma(rec, r => prmN(prmVal(r))); poe('prm-soma-rec', `<span style="color:${Math.abs(s - 1) > 1e-6 ? 'var(--neg)' : 'inherit'}">${pc(s, 2)}</span>`); }
  const n = prmMexidas().size, bs = $('prmSalvar'), bd = $('prmDesfaz');
  if (bs) bs.disabled = !n || PRM.inval.size > 0; if (bd) bd.disabled = !n && !PRM.inval.size;
  poe('prmCont', n ? `${n} alteração(ões) não salva(s)` : (PRM.inval.size ? 'corrija o campo inválido' : 'nenhuma alteração pendente de salvar'));
}
function prmMudou(el) {
  const r = PRM.rows.find(x => x.id === el.dataset.prm); if (!r) return;
  PRM.soltar.delete(r.id);                         // digitou de novo: não volta mais ao PT, vale o que digitou
  try {
    const novo = prmParse(el.value, r); prmSinal(r, novo); PRM.inval.delete(r.id);
    if (prmIgual(novo, r.valor, r.tipo)) PRM.sujo.delete(r.id); else PRM.sujo.set(r.id, novo);
    if (el.tagName === 'INPUT') el.value = prmFmt(novo, r.tipo);
  } catch (e) { PRM.inval.set(r.id, e.message); PRM.sujo.delete(r.id); prmAviso(`${prmNome(r)}: ${e.message}.`, true); }
  el.classList.toggle('sujo', PRM.sujo.has(r.id)); el.classList.toggle('erro', PRM.inval.has(r.id));
  document.querySelectorAll(`#tela [data-prmtag="${r.id}"]`).forEach(t => t.innerHTML = prmTag(r));
  if (!PRM.inval.size && PRM.msg && PRM.msg.erro) { PRM.msg = null; const a = $('prmAviso'); if (a) a.hidden = true; }
  prmDerivados();
}
function prmSolta(id) {                            // "voltar a seguir o PT": o campo mostra o valor do PT e a mudança entra no próximo Salvar
  const r = PRM.rows.find(x => x.id === id); if (!r || !r.editada || !prmPode()) return;
  PRM.sujo.delete(id); PRM.inval.delete(id); PRM.soltar.add(id); desenha();
}
async function prmSalva() {
  const n = prmMexidas().size;
  if (!n || PRM.inval.size) return;
  const er = prmRegras(), motivo = (PRM.motivo || '').trim();
  if (er.length) return prmAviso(er.join(' '), true);
  if (motivo.length < 5) { prmAviso('Informe o motivo da alteração (quem decidiu e quando) — ele fica no histórico.', true); const m = $('prmMotivo'); if (m) m.focus(); return; }
  if (window.ORC_FONTE_LOCAL) {
    const agora = new Date().toISOString();
    PRM.sujo.forEach((v, id) => Object.assign(PRM.rows.find(x => x.id === id), { valor: v, editada: true, justificativa: motivo, atualizado_em: agora, atualizado_por: 'prévia local' }));
    PRM.soltar.forEach(id => { const r = PRM.rows.find(x => x.id === id); Object.assign(r, { valor: r.valor_pt, editada: false, justificativa: motivo, atualizado_em: agora, atualizado_por: 'prévia local' }); });
    PRM.sujo.clear(); PRM.soltar.clear(); PRM.motivo = '';
    prmAviso(`Prévia local: ${n} alteração(ões) guardada(s) só nesta tela (no app publicado vão para o banco, com histórico de quem e quando).`); desenha(); return;
  }
  const bs = $('prmSalvar'); if (bs) bs.disabled = true;
  const cols = 'id,valor,valor_pt,editada,justificativa,atualizado_em,atualizado_por';
  const grava = async (id, campos) => {              // o banco marca "editada" quando o valor muda e devolve o valor do PT quando se desmarca
    const { data, error } = await SB.from('orc_premissa').update(campos).eq('versao', est.versao).eq('id', id).select(cols);
    if (error) throw error;
    if (!data || !data.length) throw new Error('sem permissão para alterar (só a Controladoria, em versão em rascunho ou em revisão)');
    Object.assign(PRM.rows.find(x => x.id === id), data[0]);
  };
  try {
    for (const [id, valor] of [...PRM.sujo]) { await grava(id, { valor, justificativa: motivo }); PRM.sujo.delete(id); }
    for (const id of [...PRM.soltar]) { await grava(id, { editada: false, justificativa: motivo }); PRM.soltar.delete(id); }
  } catch (e) {
    const falta = prmMexidas().size;
    prmAviso('Não foi possível salvar: ' + (e.message || e) + (falta < n ? ` — ${n - falta} de ${n} já tinham sido salvas.` : ''), true); desenha(); return;
  }
  PRM.motivo = '';
  prmAviso(`✓ ${n} alteração(ões) salva(s), com histórico. Elas entram no PT na próxima geração; os números do app mudam depois da nova carga.`); desenha();
}
function posCfgPremissas() {
  if (!prmAtiva()) return;
  document.querySelectorAll('#tela [data-prm]').forEach(el => el.addEventListener('change', () => prmMudou(el)));
  const m = $('prmMotivo'); if (m) m.addEventListener('input', () => { PRM.motivo = m.value; });
  const bs = $('prmSalvar'); if (bs) bs.onclick = prmSalva;
  const bd = $('prmDesfaz'); if (bd) bd.onclick = () => { PRM.sujo.clear(); PRM.soltar.clear(); PRM.inval.clear(); PRM.msg = null; desenha(); };
  prmDerivados();
}
/* faixa na tela Premissas orçamentárias: avisa quando há premissa salva que o PT ainda não reflete */
function prmFaixa() {
  if (!['controladoria', 'ceo'].includes(est.papelReal)) return '';
  if (PRM.versao !== est.versao) { if (!PRM.carregando) setTimeout(prmCarrega, 0); return ''; }
  const pend = prmAtiva() ? prmPendentes() : [];
  if (!pend.length) return '';
  return `<div class="aviso" style="margin-bottom:10px">⚠ <b>${pend.length} premissa(s) já alterada(s) no app que este PT ainda não reflete</b> (${pend.slice(0, 4).map(r => esc(prmNome(r))).join(' · ')}${pend.length > 4 ? ' · …' : ''}).
    Os valores abaixo são os do PT carregado; mudam quando ele for gerado de novo.${est.papel === 'controladoria' ? ' Confira em <a href="#cfg_premissas">Configuração › Premissas</a>.' : ''}</div>`;
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js, DEPOIS do instalaOrcDre) */
function instalaOrcPremissas() {
  if (window.__orcPrem) return; window.__orcPrem = true;
  const st = document.createElement('style');
  st.textContent = `.prm-in{width:128px;text-align:right;font:inherit;font-size:13px;font-variant-numeric:tabular-nums;padding:4px 7px;border:1px solid #E3CF8A;border-radius:6px;background:var(--ed);color:var(--ink)}
select.prm-in{width:auto;text-align:left;padding-right:4px}.prm-in:disabled{opacity:.8;cursor:not-allowed}
.prm-in.sujo{border-color:var(--brand);box-shadow:0 0 0 2px rgba(200,16,46,.13)}.prm-in.erro{border-color:#B42318;background:#FDECEA}
.prm-suf{font-size:12px;color:var(--ink3);margin-left:3px}.prm-l .t small{color:var(--ink3)}
.prm-v{display:flex;align-items:center;gap:6px;justify-content:flex-end;white-space:nowrap;flex:none}
.prm-barra-l{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.prm-motivo{flex:1;min-width:260px;font:inherit;font-size:13px;padding:7px 10px;border:1px solid var(--line);border-radius:7px}
table.prm-curva .prm-in{width:104px}table.prm-curva td.ed{padding:4px 5px}
.prm-solta{border:1px solid var(--line);background:var(--surface);color:var(--ink2);border-radius:6px;font-size:12px;line-height:1;padding:3px 6px;margin-left:4px;cursor:pointer}
.prm-solta:hover{border-color:var(--brand);color:var(--brand)}`;
  document.head.appendChild(st);
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-prmsolta]'); if (b && est.tela === 'cfg_premissas') prmSolta(b.dataset.prmsolta); });
  const antiga = TELAS.cfg_premissas, posAntiga = POS.cfg_premissas, antigaPO = TELAS.premissas_orc;
  if (antiga) TELAS.cfg_premissas = () => telaCfgPremissas(antiga);
  POS.cfg_premissas = () => { if (prmAtiva()) posCfgPremissas(); else if (posAntiga) posAntiga(); };
  if (antigaPO) TELAS.premissas_orc = () => prmFaixa() + antigaPO();
}
