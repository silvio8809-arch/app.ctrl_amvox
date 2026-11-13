/* App ORÇAMENTO & CONTROLADORIA 2027 — DRE (rótulos e detalhamento por linha) + PREMISSAS ORÇAMENTÁRIAS (13/11/2026, pedido do Silvio).
   Carregado ANTES do orcamento.js; instalado pelo gancho `instalaOrcDre()` no fim do orcamento.js (usa TELAS, POS, MENU, D, est… de lá).
   1. DRE 2027: linha de detalhe mostra só o item ("Inovatec", não "Despesas Gerais e Administrativas — Inovatec"); o grupo é o subtotal.
   2. DRE TCP e DRE 2027: clique na linha abre o painel lateral com a composição — como se chegou ao valor, mês a mês, por área, por conta,
      método de projeção, decisão aplicada, base 2026 × 2027 e abertura até o lançamento (abreLancamentos).
   3. Premissas orçamentárias: uma seção por grupo da DRE/caixa com os parâmetros que montaram o valor, onde se mudam e quanto pesam;
      o "?" de cada grupo da DRE TCP, da DRE 2027 e do caixa leva direto ao trecho. */
"use strict";
const ORC_DRE_GRUPOS = ['Despesas com Vendas', 'Despesas Operacionais', 'Despesas Gerais e Administrativas'];
function rotuloDRE(l) {
  const s = String(l ?? '');
  for (const g of ORC_DRE_GRUPOS) if (s.startsWith(g + ' — ')) return s.slice(g.length + 3);
  return s;
}

/* ------------------------------------------------------------------ mapa linha → seção das premissas */
const PREM_DRE = { 'Faturamento': 'receita', '(-) Impostos': 'impostos', '(-) VPC': 'vpc', '(-) Devoluções': 'devolucoes', '(-) Custos': 'cmv',
  '(-) DVV': 'dvv', 'Despesas com Vendas': 'despesas', 'Despesas Operacionais': 'despesas', 'Despesas Gerais e Administrativas': 'despesas',
  '(-) Gastos de importação': 'naorec', '(-) Despesas de reestruturação': 'naorec', '(-) D&A': 'naorec', '(+/-) Resultado financeiro': 'naorec',
  '(+/-) Outras receitas/despesas': 'naorec', '(-) IR / CSLL': 'naorec' };
const PREM_TCP = { 'FATURAMENTO BRUTO': 'receita', 'DEDUÇÕES DE RECEITA I': 'devolucoes', 'DEDUÇÕES DE RECEITA II': 'impostos', 'CUSTOS DIRETOS': 'cmv',
  'DDV': 'dvv', 'Despesas com vendas': 'despesas', 'Despesas operacionais': 'despesas', 'Despesas Gerais e Administrativas': 'despesas',
  'Despesas operacionais não recorrentes': 'naorec', 'Custos de reestruturação': 'naorec', 'Societario': 'despesas', 'Resultado fianceiro': 'naorec',
  'Outras despesas Não Operacionais': 'naorec', 'Provisão para créditos de liquidação duvidosa': 'pcld', 'D&A': 'naorec', 'IRPJ/CSLL': 'naorec',
  'Descontos Comerciais (VPC)': 'vpc' };
const PREM_CX = { '  (+) Recebimentos de clientes': 'caixa', '  (−) Impostos pagos': 'caixa', '  (−) Fornecedores (CMV / CPV)': 'compras',
  '  (−) Mão de obra direta': 'folha', '  (−) Comissões, frete e VPC': 'dvv', '  (−) Despesas SG&A': 'despesas',
  '  (−) Despesas não recorrentes (reestruturação)': 'naorec', '  (−) Investimentos (capex)': 'decisao', '  (−) Pagamento aos credores da RJ': 'rj',
  '  (−) Parcelamentos de impostos': 'rj', 'Saldo inicial de caixa': 'caixa' };
const PREM_DRE_DET = { 'CMV / CPV': 'cmv', 'Mão de obra': 'folha', 'Bon. em mer.': 'cmv', 'Bonificações': 'dvv', 'Frete': 'dvv', 'Comissões': 'dvv',
  'PCLD': 'pcld', 'Pessoal': 'folha', 'Inovatec': 'despesas' };
const iconePrem = (sec, t) => sec ? `<a class="prem-ic" href="#premissas_orc" data-prem="${sec}" title="${esc(t || 'Premissas deste grupo')}">?</a>` : '';
function ligaIconesPrem(raiz = document) {
  raiz.querySelectorAll('[data-prem]').forEach(a => a.onclick = e => { e.preventDefault(); e.stopPropagation(); fechaPainel(); est.f.premSec = a.dataset.prem; vai('premissas_orc'); });
}

/* ------------------------------------------------------------------ drivers e participações (dados das PREMISSAS e da DRE_TCP) */
const DRV_NOME = { '(-) Impostos': 'Impostos', '(-) VPC': 'VPC (desconto na nota)', '(-) Devoluções': 'Devoluções', 'CMV / CPV': 'CMV / CPV',
  'Bon. em mer.': 'Bon. em mercadoria (recebida)' };
const drv = nome => (D.premissas.drivers || []).find(d => d[0] === nome) || [nome, 0, 0, null, 0, ''];
const drvPCLD = () => (D.premissas.drivers || []).find(d => /PCLD/.test(d[0])) || ['PCLD', 0, 0, null, 0, ''];
const drvIR = () => (D.premissas.drivers || []).find(d => /^IR/.test(d[0])) || ['IR', 0, 0, null, 0, ''];
const partTCP = i => ((D.dre_tcp.participacoes || [])[i] || ['', 0]);
/* linha TCP sem chave (ou com parcela pelo driver) → como sai da DRE 2027 */
const TCP_DRV = {
  'Receita de vendas de mercadoria': { dre: 'Faturamento', part: 0 }, 'Receita de vendas de produtos': { dre: 'Faturamento', part: 1 },
  'Descontos incondicionais': { dre: 'Faturamento', part: 2 }, 'Devolução vendas e mercadorias': { dre: '(-) Devoluções' },
  'Icms': { dre: '(-) Impostos', part: 3 }, '(-) Subvenção para investimentos': { dre: '(-) Impostos', part: 4 }, 'IPI': { dre: '(-) Impostos', part: 5 },
  'Pis/Cofins': { dre: '(-) Impostos', part: 6 }, 'CMV': { dre: 'CMV / CPV', part: 7 }, 'CPV': { dre: 'CMV / CPV', part: 8 },
  'Bonificação em mercadoria': { dre: 'Bon. em mer.' }, 'Descontos Comerciais (VPC)': { dre: '(-) VPC', ld: 'VPC' },
  'Provisão para créditos de liquidação duvidosa': { dre: 'Despesas Operacionais — PCLD', ld: 'Despesas Operacionais — PCLD' },
  'IRPJ/CSLL': { dre: '(-) IR / CSLL', ld: 'IR / CSLL' } };
const dreL = nome => D.dre.linhas.find(l => l.l === nome || l.k === nome) || { l: nome, base: 0, orc: 0, tcp: 0, m: Array(12).fill(0) };
const fatM = () => dreL('Faturamento').m;

/* como um valor da DRE 2027 sai do driver: texto + série mensal */
function explicaDriver(nomeDRE) {
  const F = fatM(), fT = soma(F), l = dreL(nomeDRE);
  if (nomeDRE === 'Faturamento') {
    const r = D.premissas.receita, ad = r['Adotado'] || {};
    return { txt: `Faturamento bruto 2027 = cenário <b>${esc(D.meta.cenario)}</b> (PREMISSAS!B13): ${esc((r['P&D'] || {}).rotulo || '')}. ` +
      `Curva mensal digitada na linha 15 (P&D), 16 (Plano TCP = ${rsC((r['Plano TCP'] || {}).tot || 0)} na curva do P&D) ou 17 (manual); a linha 19 é a adotada.`,
      serie: ad.m || F, prem: 'receita' };
  }
  if (DRV_NOME[nomeDRE]) {
    const d = drv(DRV_NOME[nomeDRE]), dt = l.m.map((v, i) => v - d[4] * F[i]);
    const extra = Math.abs(soma(dt)) > 100 ? ` Mais <b>${rsC(soma(dt))}</b> de contas de despesa classificadas nesta linha (abaixo).` : '';
    return { txt: `${esc(d[0])} = <b>${pc(d[4], 2)}</b> do faturamento × faturamento do mês (${rsC(fT)} no ano). ` +
      `Realizado jul–out/26 ${pc(d[1], 2)} · Plano TCP ${pc(d[2], 2)} · ${d[3] == null ? 'sem sobrescrita (vale o realizado)' : 'sobrescrito para ' + pc(d[3], 2)}. ${esc(d[5] || '')}.${extra}`,
      serie: F.map(v => d[4] * v), prem: nomeDRE === '(-) VPC' ? 'vpc' : nomeDRE === '(-) Impostos' ? 'impostos' : nomeDRE === '(-) Devoluções' ? 'devolucoes' : 'cmv' };
  }
  if (/PCLD/.test(nomeDRE)) {
    const d = drvPCLD(), base = F.map((v, i) => v + dreL('(-) VPC').m[i] + dreL('(-) Devoluções').m[i]);
    return { txt: `PCLD = <b>${pc(d[4], 2)}</b> × (faturamento − VPC − devoluções) do mês (${rsC(soma(base))} no ano). ${esc(d[5] || '')}. A conta de PDD (3120204001) fica só como rastreio.`,
      serie: base.map(v => -d[4] * v), prem: 'pcld' };
  }
  if (/IR \/ CSLL/.test(nomeDRE)) {
    const d = drvIR(), lair = dreL('LAIR').m;
    return { txt: `IR / CSLL = <b>${pc(d[4], 2)}</b> do LAIR positivo do mês. ${esc(d[5] || '')}.`, serie: lair.map(v => -Math.max(0, v) * d[4]), prem: 'naorec' };
  }
  return null;
}

/* ------------------------------------------------------------------ painel de composição (DRE TCP e DRE 2027) */
const METODO_TXT = l => l.da === 'GESTOR' ? 'ORÇADO pelo gestor (ORCADO_2027)'
  : l.da === 'OUTRO' ? 'OUTRO — valor definido pela Controladoria'
  : l.me === '% FATURAMENTO' ? '% do faturamento (realizado jul–out/26 ÷ faturamento × faturamento 2027)'
  : /FORA DA JANELA/.test(l.si) ? 'MODELO = 0 (gasto só em jan–jun/26, fora da janela)'
  : l.n === 'Folha (simulador)' ? `MODELO = base 2026${l.rj === 'S' ? ' × (1 + inflação)' : ''} (folha; simulador quando PREMISSAS_FOLHA!B4 = S)`
  : l.rj === 'S' ? `MODELO = base 2026 × (1 + inflação ${pc(D.meta.inflacao_exata, 2)})` : 'MODELO = base 2026 sem reajuste';
function tabelaMeses(series, m) {
  return `<div class="tw solta"><table class="t"><thead><tr><th class="fx">Série</th>${MESES.map((x, i) => `<th class="n ${i === m ? 'hl' : ''}">${x}/27</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
    ${series.map(([t, a, cls]) => `<tr class="${cls || ''}"><td class="fx nw">${t}</td>${a.map((v, i) => tdN(v, { cls: i === m ? 'hl' : '' })).join('')}${tdN(soma(a))}</tr>`).join('')}</tbody></table></div>`;
}
function painelComposicao({ titulo, sub, tot, prl, m12, L, sinal = -1, drvNome, secao, ehGrupo }) {
  const m = est.per === 'ano' ? null : +est.per;
  const F = fatM(), fT = soma(F), rl = soma(dreL('(=) Receita Líquida').m);
  let h = `<div class="pl-top"><div><h3>${esc(titulo)} ${iconePrem(secao)}</h3><p>${sub}</p></div><button class="x" data-fecha>Fechar ✕</button></div><div class="pl-corpo">`;
  const compL = L.reduce((a, l) => (l.mf.forEach((v, i) => a[i] += sinal * v), a), Array(12).fill(0));
  const resto = m12.map((v, i) => v - compL[i]);
  const base = sinal * soma(L, l => l.b);
  h += `<section class="kpis">
    <div class="kpi"><div class="lab">Total 2027</div><div class="val ${tot < 0 ? 'down' : ''}">${rsC(tot)}</div><div class="meta">${prl == null ? '' : pc(prl) + ' da receita líquida · '}${pc(div(tot, fT))} do faturamento</div></div>
    ${L.length ? `<div class="kpi k5"><div class="lab">Base 2026 (anualizada)</div><div class="val">${rsC(base)}</div><div class="meta">realizado jul–out/26 × ${D.meta.fator} · Δ ${rsC(soma(compL) - base)} (${pc(div(soma(compL) - base, Math.abs(base)))})</div></div>` : ''}
    ${L.length ? `<div class="kpi k2"><div class="lab">Contas (área × conta)</div><div class="val">${L.length}</div><div class="meta">${new Set(L.map(l => l.s)).size} área(s) · ${new Set(L.map(l => l.c)).size} conta(s)</div></div>` : ''}
    ${m == null ? '' : `<div class="kpi k3"><div class="lab">${mesTxt(m)}</div><div class="val">${rsC(m12[m])}</div><div class="meta">acumulado jan–${MESES[m]}: ${rsC(soma(m12.slice(0, m + 1)))}</div></div>`}
  </section>`;
  /* 1. como se chegou ao valor */
  const ex = drvNome ? explicaDriver(drvNome) : null;
  const temResto = Math.abs(soma(resto)) > 1;
  h += `<div class="card"><h3>Como se chegou ao valor</h3>`;
  if (ex) h += `<p class="exp">${ex.txt}</p>`;
  if (L.length) {
    const porDec = {}; L.forEach(l => { const k = l.da + '|' + METODO_TXT(l); const x = porDec[k] ||= { n: 0, v: 0, b: 0 }; x.n++; x.v += sinal * l.vf; x.b += sinal * l.b; });
    h += `<p class="exp">${ex ? 'Parcela das contas de despesa' : 'Soma das linhas área × conta da <b>Projeção final</b>'} cuja linha ${ehGrupo ? 'é deste grupo' : 'é esta'}: cada linha vale pela <b>decisão</b> da Controladoria (GESTOR = orçado, MODELO = base × inflação ou % do faturamento, OUTRO = valor definido); sem decisão vale o padrão (GESTOR se a área entregou; MODELO se não entregou ou se a conta é por % do faturamento).</p>
      <div class="tw solta"><table class="t"><thead><tr><th>Decisão aplicada</th><th>Método de projeção</th><th class="n">Linhas</th><th class="n">Base 2026</th><th class="n">2027</th><th class="n">part.</th></tr></thead><tbody>
      ${Object.entries(porDec).sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v)).map(([k, x]) => { const [da, mt] = k.split('|'); return `<tr><td><span class="tag ${da === 'GESTOR' ? 'b' : da === 'MODELO' ? 'y' : 'r'}">${esc(da)}</span></td><td class="w">${esc(mt)}</td><td class="n">${x.n}</td>${tdN(x.b)}${tdN(x.v)}${tdP(div(x.v, soma(compL)))}</tr>`; }).join('')}</tbody></table></div>`;
  }
  if (!ex && !L.length) h += `<p class="exp">${Math.abs(tot) < 0.5 ? 'Linha sem valor projetado em 2027 (nenhuma conta do de-para cai aqui, ou todas com decisão = 0).' : 'Subtotal da DRE (soma das linhas acima).'}</p>`;
  const conf = L.length && !temResto ? '<div class="ok-box">✓ A soma das contas é exatamente o valor da linha, mês a mês.</div>'
    : L.length && ex ? `<div class="info">Linha = parcela do driver ${rsC(soma(resto))} + contas ${rsC(soma(compL))}.</div>`
    : L.length && temResto ? `<div class="aviso">Diferença entre a linha e a soma das contas: ${rsC(soma(resto))} — ver Sistema › Checks.</div>` : '';
  h += conf + '</div>';
  /* 2. mês a mês */
  const series = [['Total da linha', m12, 'b']];
  if (ex && L.length) series.push(['Parcela do driver', resto], ['Contas (área × conta)', compL]);
  else if (ex) series.push(['Pelo driver (conferência)', ex.serie]);
  if (drvNome && drvNome !== 'Faturamento') series.push(['Faturamento do cenário', F]);
  h += `<div class="card"><h3>Montante por mês</h3>${grafBarras(m12, { h: 140, fmtY: v => fmt(v, { uni: 'mi', dec: 2 }) })}${tabelaMeses(series, m)}</div>`;
  if (L.length) {
    /* 3. por área (setor) × mês */
    const porS = {}; L.forEach(l => { const x = porS[l.s] ||= { b: 0, v: 0, mf: Array(12).fill(0) }; x.b += sinal * l.b; x.v += sinal * l.vf; l.mf.forEach((v, i) => x.mf[i] += sinal * v); });
    const ordS = Object.entries(porS).sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v));
    h += `<div class="card"><h3>Por área (departamento) <small>${ordS.length} área(s)</small></h3><div class="tw solta"><table class="t"><thead><tr><th class="fx">Área</th><th class="n">Base 2026</th><th class="n">2027</th><th class="n">part.</th><th class="n">Δ × base</th>${MESES.map((x, i) => `<th class="n ${i === m ? 'hl' : ''}">${x}</th>`).join('')}</tr></thead><tbody>
      ${ordS.map(([s, x]) => `<tr class="clic" data-cs="${esc(s)}"><td class="fx nw">${esc(s)}<br><small style="color:var(--ink3)">${esc(setorDe(s).gestor || '')}</small></td>${tdN(x.b)}${tdN(x.v)}${tdP(div(x.v, soma(compL)))}<td class="n ${cd(x.v - x.b)}">${fmt(x.v - x.b, { sinal: true })}</td>${x.mf.map((v, i) => tdN(v, { cls: i === m ? 'hl' : '' })).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    /* 4. por conta contábil */
    const porC = {}; L.forEach(l => { const x = porC[l.c] ||= { d: l.d, b: 0, v: 0, n: 0 }; x.b += sinal * l.b; x.v += sinal * l.vf; x.n++; });
    h += `<div class="card"><h3>Por conta contábil <small>${Object.keys(porC).length} conta(s)</small></h3><div class="tw solta"><table class="t"><thead><tr><th>Conta</th><th>Descrição</th><th class="n">Áreas</th><th class="n">Base 2026</th><th class="n">2027</th><th class="n">part.</th><th class="n">Δ %</th></tr></thead><tbody>
      ${Object.entries(porC).sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v)).map(([c, x]) => `<tr class="clic" data-cc="${esc(c)}"><td class="nw">${esc(c)}</td><td class="w">${esc(x.d)}</td><td class="n">${x.n}</td>${tdN(x.b)}${tdN(x.v)}${tdP(div(x.v, soma(compL)))}<td class="n ${cd(x.v - x.b)}">${pc(div(x.v - x.b, Math.abs(x.b)))}</td></tr>`).join('')}</tbody></table></div></div>`;
    /* 5. linhas área × conta: método, decisão, base × modelo × gestor × final → lançamentos */
    const LL = L.slice().sort((a, b) => Math.abs(b.vf) - Math.abs(a.vf));
    h += `<div class="card"><h3>Linhas área × conta — método, decisão e base 2026 × 2027</h3><div class="csub">Clique numa linha para abrir os lançamentos do razão jul–out/26 que formam a base 2026.</div>
      <div class="tw solta" style="max-height:420px"><table class="t"><thead><tr><th>Área · conta</th><th>Método de projeção</th><th>Decisão</th><th class="n">Base 2026</th><th class="n">Modelo</th><th class="n">Gestor</th><th class="n">Final 2027</th><th class="n">Δ final − base</th><th>Situação / explicação</th></tr></thead><tbody>
      ${LL.map(l => `<tr class="clic" data-ls="${esc(l.s)}" data-lc="${esc(l.c)}"><td class="nw"><small style="color:var(--ink3)">${esc(l.s)}</small><br>${esc(l.c)} ${esc(l.d)}</td><td class="w">${esc(METODO_TXT(l))}</td>
        <td class="nw"><span class="tag ${l.da === 'GESTOR' ? 'b' : l.da === 'MODELO' ? 'y' : 'r'}">${esc(l.da)}</span>${/^PADRÃO/.test(l.st) ? ' <small style="color:var(--ink3)">padrão</small>' : ''}</td>
        ${tdN(sinal * l.b)}${tdN(sinal * l.mo)}${tdN(sinal * l.ge)}${tdN(sinal * l.vf)}<td class="n ${cd(sinal * (l.vf - l.b))}">${fmt(sinal * (l.vf - l.b), { sinal: true })}</td><td class="w"><small>${esc(l.si)}${l.ex ? ' · ' + esc(l.ex) : ''}${l.co ? ' · Controladoria: ' + esc(l.co) : ''}</small></td></tr>`).join('')}</tbody></table></div></div>`;
  }
  h += `<div class="info">Valores na unidade escolhida (${uniTxt()}), no sinal da DRE (despesa negativa). ${secao ? `Premissas que formam esta linha: ${iconePrem(secao)} <a href="#premissas_orc" data-prem="${secao}">abrir a seção</a>.` : ''}</div></div>`;
  abrePainel(h);
  const dr = $('drill');
  dr.querySelectorAll('[data-ls]').forEach(tr => tr.onclick = () => abreLancamentos(tr.dataset.ls, tr.dataset.lc, tr.dataset.ls + ' · ' + tr.dataset.lc));
  dr.querySelectorAll('[data-cc]').forEach(tr => tr.onclick = () => abreLancamentos(null, tr.dataset.cc, 'Conta ' + tr.dataset.cc));
  dr.querySelectorAll('[data-cs]').forEach(tr => tr.onclick = () => painelComposicao({ titulo, sub: sub + ' · área ' + esc(tr.dataset.cs), tot: soma(L.filter(l => l.s === tr.dataset.cs), l => sinal * l.vf),
    prl: null, m12: L.filter(l => l.s === tr.dataset.cs).reduce((a, l) => (l.mf.forEach((v, i) => a[i] += sinal * v), a), Array(12).fill(0)),
    L: L.filter(l => l.s === tr.dataset.cs), sinal, secao, ehGrupo }));
  ligaIconesPrem(dr);
}
/* linhas (área × conta) de uma linha da DRE TCP: chave = linha TCP da PROJECAO_FINAL; (via DRE_2027) = VPC / PCLD / IR pela linha da DRE */
function linhasTCP(l) {
  const dv = TCP_DRV[l.l];
  if (dv && dv.ld) return D.linhas.filter(x => x.ld === dv.ld);
  return l.chave ? D.linhas.filter(x => x.tcp === l.chave) : [];
}
function abreDetalheTCP(i) {
  const T = D.dre_tcp.linhas, l = T[i]; if (!l) return;
  let sec = '';                                       // contexto: grupo da linha → seção (cabeçalho) → "após <subtotal>"
  for (let k = i - 1; k >= 0; k--) {
    const x = T[k];
    if (x.t === 's' && l.t === 'd') { sec = x.l; break; }
    if (x.t === 'h') { sec = x.l; break; }
    if (x.t === 't') { sec = 'após ' + x.l; break; }
  }
  const secPrem = PREM_TCP[l.l] || PREM_TCP[grupoTCP(i)] || PREM_TCP[sec] || 'despesas';
  if (l.t === 's') {                                   // grupo: as linhas de detalhe abaixo dele
    const det = []; for (let k = i + 1; k < T.length && T[k].t === 'd'; k++) det.push(T[k]);
    const L = det.flatMap(linhasTCP);
    return painelComposicao({ titulo: l.l, sub: `DRE TCP · ${esc(sec)} · grupo com ${det.length} linha(s): ${det.filter(d => Math.abs(d.tot) > 0.5).map(d => esc(d.l)).join(', ') || '—'}`,
      tot: l.tot, prl: l.prl, m12: l.m, L, secao: secPrem, ehGrupo: true });
  }
  const dv = TCP_DRV[l.l];
  if (dv && dv.part != null) {                         // desdobramento da DRE 2027 pela participação jul–out/26
    const base = dreL(dv.dre), p = partTCP(dv.part), ex = explicaDriver(dv.dre);
    const h = `<div class="pl-top"><div><h3>${esc(l.l)} ${iconePrem(secPrem)}</h3><p>DRE TCP · ${esc(sec)} · desdobrada da DRE 2027 pela participação realizada jul–out/26</p></div><button class="x" data-fecha>Fechar ✕</button></div>
     <div class="pl-corpo"><section class="kpis"><div class="kpi"><div class="lab">Total 2027</div><div class="val ${l.tot < 0 ? 'down' : ''}">${rsC(l.tot)}</div><div class="meta">${l.prl == null ? '' : pc(l.prl) + ' da receita líquida'}</div></div>
       <div class="kpi k5"><div class="lab">${esc(p[0])}</div><div class="val">${pc(p[1], 2)}</div><div class="meta">participação jul–out/26 no modelo TCP (DRE_TCP col. S, amarelo)</div></div>
       <div class="kpi k2"><div class="lab">${esc(rotuloDRE(base.l))} — DRE 2027</div><div class="val">${rsC(soma(base.m))}</div><div class="meta">base do desdobramento</div></div></section>
     <div class="card"><h3>Como se chegou ao valor</h3><p class="exp"><b>${esc(l.l)}</b> = ${esc(rotuloDRE(base.l))} da DRE 2027 × <b>${pc(p[1], 2)}</b> (${esc(p[0])}).</p>${ex ? `<p class="exp">${ex.txt}</p>` : ''}
       <p class="exp">A participação vem do realizado jul–out/26 na DRE mensal entregue à TCP (o modelo TCP abre receita, impostos e CMV/CPV em mais linhas do que o orçamento projeta); a última de cada grupo fecha em 100%.</p></div>
     <div class="card"><h3>Montante por mês</h3>${grafBarras(l.m, { h: 140, fmtY: v => fmt(v, { uni: 'mi', dec: 2 }) })}${tabelaMeses([['Total da linha', l.m, 'b'], [esc(rotuloDRE(base.l)) + ' (DRE 2027)', base.m], ['Faturamento do cenário', fatM()]], est.per === 'ano' ? null : +est.per)}</div>
     <div class="info">Base 2026: realizado jul–out/26 anualizado na DRE 2027 = ${rsC(base.base * p[1])} (${esc(rotuloDRE(base.l))} ${rsC(base.base)} × participação). Sem abertura por conta: vem do faturamento e das deduções do razão (BASE_DRE).</div></div>`;
    abrePainel(h); ligaIconesPrem($('drill')); return;
  }
  painelComposicao({ titulo: l.l, sub: `DRE TCP · ${esc(sec)}${l.chave ? ' · chave ' + esc(l.chave) : ''}`, tot: l.tot, prl: l.prl, m12: l.m,
    L: linhasTCP(l), drvNome: dv ? dv.dre : null, secao: secPrem });
}
function grupoTCP(i) { const T = D.dre_tcp.linhas; for (let k = i; k >= 0; k--) { if (T[k].t === 's') return T[k].l; if (T[k].t !== 'd') return ''; } return ''; }
function abreDetalheDRE(i) {
  const l = D.dre.linhas[i]; if (!l || l.t === 'p') return;
  const fT = soma(fatM()), rlT = soma(dreL('(=) Receita Líquida').m);
  const key = l.k || l.l, sec = PREM_DRE[l.l] || PREM_DRE_DET[rotuloDRE(l.l)] || PREM_DRE[l.g] || 'despesas';
  if (l.t === 's') {
    const L = D.linhas.filter(x => x.ld && x.ld.startsWith(l.l + ' — '));
    return painelComposicao({ titulo: l.l, sub: 'DRE 2027 · grupo (subtotal das linhas acima)', tot: l.orc, prl: div(l.orc, rlT), m12: l.m, L, secao: sec, ehGrupo: true });
  }
  if (l.t === 't' || (l.t === 'l' && !DRV_NOME[l.l] && l.l !== 'Faturamento' && !/^\(-\) (Gastos|Despesas de reestr|D&A|IR)|^\(\+\/-\)/.test(l.l))) {
    return abrePainel(`<div class="pl-top"><div><h3>${esc(l.l)}</h3><p>DRE 2027 · subtotal</p></div><button class="x" data-fecha>Fechar ✕</button></div><div class="pl-corpo">
      <div class="card"><h3>${rsC(l.orc)} <small>${pc(div(l.orc, fT))} do faturamento · base 2026 ${rsC(l.base)} · Plano TCP ${rsC(l.tcp)}</small></h3><p class="exp">Subtotal: soma das linhas acima na DRE. Clique numa linha de detalhe ou num grupo para ver a composição.</p>
      ${tabelaMeses([['Total', l.m, 'b']], est.per === 'ano' ? null : +est.per)}</div></div>`);
  }
  const ldKey = { '(-) Gastos de importação': 'Gastos de importação', '(-) Despesas de reestruturação': 'Despesas de reestruturação', '(-) D&A': 'D&A',
    '(+/-) Resultado financeiro': 'Resultado financeiro', '(+/-) Outras receitas/despesas': 'Outras receitas/despesas', '(-) IR / CSLL': 'IR / CSLL',
    '(-) VPC': 'VPC', 'Mão de obra': 'Mão de obra', 'Bonificações': 'DVV — Bonificações', 'Frete': 'DVV — Frete', 'Comissões': 'DVV — Comissões' }[l.l] || key;
  const L = D.linhas.filter(x => x.ld === ldKey);
  const drvNome = DRV_NOME[l.l] || l.l === 'Faturamento' ? l.l : /PCLD/.test(key) ? 'Despesas Operacionais — PCLD' : /IR \/ CSLL/.test(l.l) ? '(-) IR / CSLL' : null;
  painelComposicao({ titulo: rotuloDRE(l.l) + (l.g ? ' — ' + l.g : ''), sub: `DRE 2027 · ${l.g ? 'grupo ' + esc(l.g) + ' · ' : ''}chave da linha "${esc(ldKey)}" (LINHAS_DRE / DE_PARA_CONTA col. M)`,
    tot: l.orc, prl: div(l.orc, rlT), m12: l.m, L, drvNome, secao: sec, sinal: l.l === 'Faturamento' ? 1 : -1 });
}

/* ------------------------------------------------------------------ ganchos nas telas existentes (sem reescrever o orcamento.js) */
function decoraDRE() {
  const trs = [...document.querySelectorAll('#tela table.dre tbody tr')];
  if (trs.length !== D.dre.linhas.length) return;
  trs.forEach((tr, i) => {
    const l = D.dre.linhas[i], lb = tr.querySelector('.lbl'); if (!lb || lb.textContent.trim() !== l.l) return;
    lb.textContent = rotuloDRE(l.l);
    const sec = PREM_DRE[l.l]; if (sec) lb.insertAdjacentHTML('beforeend', iconePrem(sec, 'Premissas: ' + l.l));
    if (l.t !== 'p') { tr.classList.add('dclic'); tr.title = 'Clique para ver a composição'; tr.onclick = () => abreDetalheDRE(i); }
  });
  ligaIconesPrem(document.querySelector('#tela'));
}
function decoraTCP() {
  const trs = [...document.querySelectorAll('#tela table.dre tbody tr')];
  if (trs.length !== D.dre_tcp.linhas.length) return;
  trs.forEach((tr, i) => {
    const l = D.dre_tcp.linhas[i], lb = tr.querySelector('.lbl'); if (!lb || !lb.textContent.includes(l.l)) return;
    const sec = PREM_TCP[l.l];
    if (sec) lb.insertAdjacentHTML('beforeend', iconePrem(sec, 'Premissas: ' + l.l));
    if (l.t === 'd' || l.t === 's') { tr.classList.add('dclic'); tr.title = 'Clique para ver a composição'; tr.onclick = () => abreDetalheTCP(i); }
  });
  ligaIconesPrem(document.querySelector('#tela'));
}
function decoraCaixa() {
  const trs = [...document.querySelectorAll('#tela table.dre tbody tr')];
  if (trs.length !== D.caixa.linhas.length) return;
  trs.forEach((tr, i) => {
    const l = D.caixa.linhas[i], lb = tr.querySelector('.lbl'); if (!lb) return;
    const raw = Object.keys(PREM_CX).find(k => k.trim() === l.l.trim());
    const sec = raw ? PREM_CX[raw] : /Sinal já pago|plano P&D/.test(l.l) ? 'compras' : /aging/.test(l.l) ? 'compras' : '';
    if (sec) lb.insertAdjacentHTML('beforeend', iconePrem(sec, 'Premissas: ' + l.l.trim()));
  });
  ligaIconesPrem(document.querySelector('#tela'));
}

/* ------------------------------------------------------------------ PREMISSAS ORÇAMENTÁRIAS */
const PREM_SECOES = [['receita', 'Receita (cenário de faturamento)'], ['impostos', 'Impostos sobre vendas'], ['vpc', 'VPC — desconto comercial'],
  ['devolucoes', 'Devoluções'], ['cmv', 'CMV / CPV e bonificação em mercadoria'], ['dvv', 'DVV — frete, comissões e bonificações'],
  ['despesas', 'Despesas com vendas, operacionais e G&A'], ['decisao', 'Regra de decisão por linha · inflação · tolerância'], ['folha', 'Folha (simulador)'],
  ['pcld', 'PCLD / inadimplência'], ['naorec', 'Abaixo do EBITDA: importação, reestruturação, D&A, financeiro, IR'], ['caixa', 'Caixa: recebimentos, impostos, saldo inicial'],
  ['compras', 'Compras do P&D × adiantamentos (PA)'], ['rj', 'Plano da RJ e parcelamentos']];
const onde = (pt, app) => `<span class="onde"><b>PT</b> ${esc(pt)}${app ? ` · <b>App</b> ${esc(app)}` : ''}</span>`;
function tabPrem(rows) {
  return `<div class="tw solta"><table class="t prem-tab"><thead><tr><th>Parâmetro</th><th class="n">Valor atual</th><th>Onde se muda</th><th>Peso no resultado</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="w">${r[0]}</td><td class="n nw"><span class="pv">${r[1]}</span></td><td class="w">${r[2]}</td><td class="w"><small>${r[3] || ''}</small></td></tr>`).join('')}</tbody></table></div>`;
}
const pFmt = v => v == null || v === '' ? '(vazio)' : typeof v === 'number' ? (Math.abs(v) < 1 && v !== 0 ? pc(v, 2) : Math.abs(v) >= 1000 ? rs(v) : v.toLocaleString('pt-BR')) : esc(v);
const disc = itens => itens.filter(Boolean).length ? `<div class="disc"><b>Para discutir</b><ul>${itens.filter(Boolean).map(t => `<li>${t}</li>`).join('')}</ul></div>` : '';
function secPrem(id, titulo, valor, como, tab, discutir) {
  return `<section class="card prem-sec" id="prem-${id}"><div class="prem-cab"><h3>${esc(titulo)}</h3>${valor ? `<span class="prem-val">${valor}</span>` : ''}</div>
    <p class="exp">${como}</p>${tab ? tabPrem(tab) : ''}${disc(discutir || [])}</section>`;
}
function telaPremissas() {
  const P = D.premissas, F = fatM(), fT = soma(F), rl = dreL('(=) Receita Líquida'), rlT = soma(rl.m), mc = soma(dreL('(=) Margem de Contribuição').m);
  const eb = soma(dreL('EBITDA recorrente').m), ll = soma(dreL('Lucro Líquido').m);
  const par = (i) => P.params[i] || ['', '', ''], cx = k => (P.caixa || []).find(c => c[0].startsWith(k)) || ['', null, ''];
  const pp = v => fT * v;                                   // peso de 1 p.p. do faturamento
  const d = n => drv(n), ad = (P.adicionais || []);
  const adV = re => (ad.find(a => re.test(a[0])) || [])[1], adA = re => (ad.find(a => re.test(a[0])) || [])[3] || '';
  const fatBase = dreL('Faturamento').base, tcpFat = dreL('Faturamento').tcp;
  const Lm = D.linhas.filter(l => l.da === 'MODELO'), Lg = D.linhas.filter(l => l.da === 'GESTOR'), Lo = D.linhas.filter(l => l.da === 'OUTRO');
  const semDec = D.linhas.filter(l => /^PADRÃO/.test(l.st)).length;
  const rjS = D.linhas.filter(l => l.rj === 'S'), rjSM = rjS.filter(l => l.da === 'MODELO');
  const contasS = D.cfg_conta ? D.cfg_conta.rows.filter(r => r[15] === 'S') : [];
  const despDRE = (D.dre.composicao[3] || [])[1] || 0;
  const pctFat = D.linhas.filter(l => l.me === '% FATURAMENTO');
  let h = `${cabecalho('Premissas orçamentárias 2027', 'O porquê de cada número: para cada grupo da DRE e do caixa, as premissas que montaram o valor, onde se mudam e quanto pesam no resultado. ' +
    'Objetivo: provocar a discussão interna e a mudança de parâmetro. Todo parâmetro fica numa aba própria do PT (PREMISSAS / PREMISSAS_FOLHA) e, no app, em Configuração › Premissas.')}
  <div class="filtros prem-indice">${PREM_SECOES.map(([k, t]) => `<a class="chip" href="#premissas_orc" data-ir-prem="${k}">${esc(t)}</a>`).join('')}</div>
  <section class="kpis">
    <div class="kpi"><div class="lab">Faturamento 2027</div><div class="val">${rsC(fT)}</div><div class="meta">cenário ${esc(D.meta.cenario)} · base 2026 ${rsC(fatBase)}</div></div>
    <div class="kpi k5"><div class="lab">Margem de contribuição</div><div class="val ${mc < 0 ? 'down' : ''}">${rsC(mc)}</div><div class="meta">${pc(div(mc, fT))} do faturamento</div></div>
    <div class="kpi k2"><div class="lab">EBITDA recorrente</div><div class="val ${eb < 0 ? 'down' : 'up'}">${rsC(eb)}</div><div class="meta">lucro líquido ${rsC(ll)}</div></div>
    <div class="kpi k3"><div class="lab">1 p.p. do faturamento</div><div class="val">${rsC(pp(0.01))}</div><div class="meta">peso de cada ponto percentual de driver no EBITDA</div></div>
  </section>`;
  /* receita */
  h += secPrem('receita', 'Receita (cenário de faturamento)', rsC(fT),
    `Faturamento bruto 2027 = curva mensal do cenário escolhido. <b>P&amp;D</b>: meta do Victor Lima (planilha de planejamento de compras, 05/10/2026), na sazonalidade média 2022–2024 da empresa. <b>Plano TCP</b>: ${rsC(tcpFat)} (modelo da RJ) na mesma curva. <b>Manual</b>: a curva digitada. A receita puxa todos os drivers (% do faturamento), as contas por % do faturamento e os recebimentos do caixa.`,
    [['Cenário de receita', esc(D.meta.cenario), onde('PREMISSAS!B13 (P&D / PLANO TCP / MANUAL)', 'Versões e cenários'), `cada R$ 1 mi de faturamento a menos tira ≈ ${rsC(div(mc, fT) * 1e6)} da margem de contribuição (MC ${pc(div(mc, fT))})`],
     ['Meta P&amp;D (curva mensal)', rsC((P.receita['P&D'] || {}).tot || 0), onde('PREMISSAS linha 15 (amarelo)'), ''],
     ['Plano TCP — total', rsC((P.receita['Plano TCP'] || {}).tot || 0), onde('PREMISSAS!O16'), ''],
     ['Manual (curva)', rsC((P.receita['Manual'] || {}).tot || 0), onde('PREMISSAS linha 17'), ''],
     ['Escala das compras pela receita', pFmt((P.compras[0] || [])[1]) + ' · fator ' + pFmt((P.compras[1] || [])[1]), onde('PREMISSAS!B20', ''), 'S = o desembolso do plano de compras acompanha o cenário de receita']],
    [`Meta do P&amp;D ${rsC(fT)} × run-rate 2026 ${rsC(fatBase)} (${pc(div(fT - fatBase, fatBase))}) × Plano TCP ${rsC(tcpFat)}: qual cenário a Diretoria assume?`,
     'A meta é base, não limite (diretriz 2): a compra 2027 do P&amp;D foi dimensionada para esta receita — mudar o cenário sem mudar o plano de compras quebra o estoque.']);
  /* drivers */
  const drvSec = (id, nome, txt, extra) => { const x = d(nome); return secPrem(id, PREM_SECOES.find(s => s[0] === id)[1], `${pc(x[4], 2)} do faturamento · ${rsC(soma(dreL(Object.keys(DRV_NOME).find(k => DRV_NOME[k] === nome)).m))}`,
    txt, [[`${esc(nome)} — adotado`, pc(x[4], 2), onde(`PREMISSAS col. D (sobrescrever) na linha do driver`, 'Configuração › Premissas'), `±1 p.p. = ${rsC(pp(0.01))} no EBITDA`],
          ['Realizado jul–out/26', pc(x[1], 2), onde('BASE_DRE (razão, só leitura)'), ''], ['Plano TCP 2027', pc(x[2], 2), onde('modelo da RJ (TCP)'), `adotar o TCP muda o EBITDA em ${rsC(pp(x[2] - x[4]))}`],
          ['Sobrescrita', x[3] == null ? '(vazio = realizado)' : pc(x[3], 2), onde('PREMISSAS col. D'), '']].concat(extra || []),
    [`${esc(x[5] || '')}`, Math.abs(x[2] - x[4]) > 0.01 ? `Realizado ${pc(x[1], 2)} × TCP ${pc(x[2], 2)}: diferença de ${rsC(pp(x[2] - x[4]))} no ano. Manter o realizado ou assumir meta?` : '']); };
  h += drvSec('impostos', 'Impostos', 'Impostos sobre vendas (ICMS líquido da subvenção, IPI, PIS/COFINS) = % do faturamento calibrado no realizado jul–out/26. Na DRE TCP são abertos em ICMS, subvenção, IPI e PIS/COFINS pelas participações jul–out/26 (DRE_TCP col. S).');
  h += drvSec('vpc', 'VPC (desconto na nota)', 'VPC = % do faturamento (desconto comercial na nota, conta 3110103006) + contas de VPC de contrato classificadas na linha VPC do de-para (ex.: 3120206).');
  h += drvSec('devolucoes', 'Devoluções', 'Devoluções = % do faturamento do realizado jul–out/26, inclusive devolução com refaturamento.');
  h += drvSec('cmv', 'CMV / CPV', 'CMV/CPV = % do faturamento (o custo acompanha a receita). Bonificação em mercadoria recebida do fornecedor = % do faturamento (crédito no custo). Na DRE TCP: CMV × CPV pelas participações jul–out/26.',
    [['Bonificação em mercadoria — adotado', pc(d('Bon. em mercadoria (recebida)')[4], 2), onde('PREMISSAS col. D'), '']]);
  /* DVV */
  const dvv = ['Bonificações', 'Frete', 'Comissões'].map(n => [n, soma(dreL(n).m)]);
  h += secPrem('dvv', 'DVV — frete, comissões e bonificações', rsC(soma(dvv, x => x[1])),
    `Frete, comissões e bonificações em produtos entram pelas contas do de-para com <b>MÉTODO = % FATURAMENTO</b>: % realizado (gasto jul–out/26 ÷ faturamento jul–out/26) × faturamento 2027 do mês. A linha do gestor fica informativa, salvo decisão GESTOR/OUTRO. ${pctFat.length} linha(s) área × conta nesse método.`,
    dvv.map(([n, v]) => [`${n} 2027`, rsC(v), onde('DE_PARA_CONTA col. N (MÉTODO) · MODELO_X_GESTOR col. S (decisão)', 'Configuração › De-para de contas'), `${pc(div(v, fT), 2)} do faturamento`]),
    ['Comissão só no recebimento e frete por UF/VPC do contrato: o % médio esconde o mix de canal — vale abrir por canal na próxima rodada?']);
  /* despesas */
  const porDec = [['GESTOR', Lg], ['MODELO', Lm], ['OUTRO', Lo]].map(([k, L]) => [k, soma(L, l => l.vf), L.length]);
  h += secPrem('despesas', 'Despesas com vendas, operacionais e G&A', rsC(-despDRE),
    `Cada linha área × conta vale pela <b>decisão por linha</b> (seção abaixo): GESTOR = orçado no template 2027; MODELO = base 2026 (jul–out/26 × ${D.meta.fator}) × (1 + inflação) só nas contas de compra (REAJUSTE = S); OUTRO = valor da Controladoria. O bloco da DRE (vendas / operacionais / G&amp;A) vem da conta (LINHA DA DRE) e, no pessoal, do BLOCO DA DRE do setor. Inovatec = % do faturamento. PCLD = driver (seção PCLD).`,
    porDec.map(([k, v, n]) => [`Decisão ${k}`, rsC(v), onde('MODELO_X_GESTOR col. S/T', 'Orçamento 2027 › Decisões por linha'), `${n} linha(s) · ${pc(div(v, despDRE))} das despesas`])
      .concat([['Linhas sem decisão (padrão aplicado)', String(semDec), onde('MODELO_X_GESTOR col. S'), 'padrão: GESTOR se a área entregou; MODELO se não entregou ou se a conta é por % do faturamento']]),
    [`${semDec} linha(s) ainda no padrão: a decisão final é da Controladoria, linha a linha.`, 'Gastos Comuns (tributos, D&amp;A, provisões) são orçados pelo MODELO sem gestor — quem responde por eles em 2027?']);
  /* decisão / inflação / tolerância */
  h += secPrem('decisao', 'Regra de decisão por linha · inflação · tolerância', `inflação ${pc(D.meta.inflacao_exata, 2)}`,
    `Fluxo: realizado 2026 alinhado → modelo → variação do gestor acima da tolerância é explicada → a Controladoria decide por linha (GESTOR / MODELO / OUTRO) → projeção final → DRE, DRE TCP, caixa e resumos. A inflação reajusta só as contas de <b>compra</b> (contratos recorrentes e fornecedores: REAJUSTE = S, ${contasS.length} conta(s)); folha, comissões, tributos, provisões, D&amp;A e financeiro ficam sem reajuste.`,
    [['Inflação 2027 (IPCA, Boletim Focus)', pc(D.meta.inflacao_exata, 2), onde('PREMISSAS!B10 — atualizar a cada boletim (próximo 16/11)', 'Configuração › Premissas'), `+1 p.p. = ${rsC(soma(rjS, l => l.b) * 0.01)} no modelo · ${rsC(soma(rjSM, l => l.b) * 0.01)} na DRE (só linhas com decisão MODELO)`],
     ['Tolerância do Δ gestor × modelo sem explicação', pc(D.meta.tolerancia, 2), onde('PREMISSAS!F5 (padrão = inflação)'), 'acima disto o gestor explica a variação (Modelo × Gestor)'],
     ['Limite de incremento sem justificativa (R$)', pFmt(par(4)[1]), onde('PREMISSAS!B9'), 'diretriz: todo incremento precisa ser defendido'],
     ['Usar projeção inercial nos setores que não entregaram', pFmt(par(6)[1]), onde('PREMISSAS!B11'), 'N = a DRE só com o que os gestores orçaram'],
     ['Contas que reajustam pela inflação', `${contasS.length} conta(s)`, onde('DE_PARA_CONTA col. P (S/N)', 'Configuração › De-para de contas'), `base 2026 dessas contas: ${rsC(soma(rjS, l => l.b))}`],
     ['Base 2026 = realizado jul–out/26 × fator', `× ${D.meta.fator}`, onde('PREMISSAS!B6/B7 (meses da base)'), 'jun/26 foi o mês de ajuste do balanço (fora da base)']],
    ['Inflação única para tudo que é compra: contratos com índice próprio (IGP-M, dólar) pedem reajuste específico?', 'Tolerância = inflação: aceitar variação sem explicação até a inflação ou exigir explicação de todo aumento?']) +
    (contasS.length ? `<details class="card prem-det"><summary>Contas com REAJUSTE = S (${contasS.length})</summary><div class="tw solta" style="max-height:300px"><table class="t"><thead><tr><th>Conta</th><th>Descrição</th><th>Rubrica</th><th>Linha da DRE</th><th class="n">Base 2026 (linhas)</th></tr></thead><tbody>
      ${contasS.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[3])}</td><td>${esc(r[12])}</td>${tdN(soma(D.linhas.filter(l => l.c === String(r[0])), l => l.b))}</tr>`).join('')}</tbody></table></div></details>` : '');
  /* folha */
  const Fo = D.folha;
  h += secPrem('folha', 'Folha (simulador)', Fo ? `chave ${esc(Fo.chave || 'N')}` : '',
    Fo ? `Folha por área no simulador (PREMISSAS_FOLHA): quadro atual (out/26) + <b>dissídio por convenção</b> com data-base e mês de aplicação separados (atraso compensado por abono, sem encargos — testado na folha) + benefícios + sazonalidade (HE, 13º, férias) + admissões, desligamentos e promoções do gestor. A chave PREMISSAS_FOLHA!B4 = S faz a projeção do MODELO usar o simulador nas contas que ele cobre; com N, a folha segue base 2026 × decisão.`
       : 'O simulador de folha entra com o PT gerado com --folha (abas PREMISSAS_FOLHA, QUADRO_FOLHA, SIMULADOR_FOLHA).',
    Fo ? (Fo.dissidio || []).map(x => [`Dissídio ${esc(x[0])}`, `${pc(x[1], 2)} · data-base ${esc(x[2])} · aplica ${esc(x[3])} · ${esc(x[4])}`, onde('PREMISSAS_FOLHA (dissídio)', 'Orçamento 2027 › Folha 2027'), 'cada 1 p.p. de dissídio ≈ 1% da folha + encargos a partir do mês de aplicação'])
      .concat((Fo.parametros || []).slice(0, 8).map(x => [esc(x[0]), pFmt(x[1]), onde('PREMISSAS_FOLHA'), esc(x[2] || '')]))
      .concat([['Chave: projeção usa o simulador', esc(Fo.chave || 'N'), onde('PREMISSAS_FOLHA!B4'), '']]) : null,
    ['Lista oficial de PJ (nome, razão social, valor mensal) ainda pendente: os honorários entram como informativo em Assessoria.', 'Benefícios calibrados (assistência médica, alimentação) abaixo do realizado — premissa ou enxugamento?']);
  /* PCLD */
  const pcl = drvPCLD(), pclL = soma(dreL('Despesas Operacionais — PCLD').m);
  const bRec = soma(F) + soma(dreL('(-) VPC').m) + soma(dreL('(-) Devoluções').m);
  h += secPrem('pcld', 'PCLD / inadimplência', `${pc(pcl[4], 2)} · ${rsC(pclL)}`,
    'PCLD = % × (faturamento − VPC − devoluções) do mês, na linha Despesas operacionais — PCLD; o mesmo % reduz os recebimentos no caixa. A conta de PDD (3120204001) fica só como rastreio.',
    [['Inadimplência / PCLD — adotado', pc(pcl[4], 2), onde('PREMISSAS col. D (linha do PCLD)', 'Configuração › Premissas'), `+0,1 p.p. = ${rsC(bRec * 0.001)} no EBITDA e no caixa`], ['Plano TCP', pc(pcl[2], 2), onde('modelo da RJ'), `adotar o TCP: ${rsC(bRec * (pcl[2] - pcl[4]))}`]],
    [esc(pcl[5] || '')]);
  /* abaixo do EBITDA */
  const ab = ['(-) Gastos de importação', '(-) Despesas de reestruturação', '(-) D&A', '(+/-) Resultado financeiro', '(+/-) Outras receitas/despesas', '(-) IR / CSLL'].map(n => [n, soma(dreL(n).m)]);
  h += secPrem('naorec', 'Abaixo do EBITDA: importação, reestruturação, D&A, financeiro, IR', rsC(soma(ab, x => x[1])),
    'Gastos de importação, reestruturação (CC 0418, gestora Luma/TCP), D&amp;A e resultado financeiro: contas do de-para nessas linhas, pela mesma decisão por linha. IR/CSLL = % do LAIR positivo (padrão 0: prejuízo fiscal acumulado).',
    ab.map(([n, v]) => [esc(n), rsC(v), onde('DE_PARA_CONTA col. M (linha da DRE) · MODELO_X_GESTOR'), '']).concat([['IR / CSLL — % do LAIR positivo', pc(drvIR()[4], 2), onde('PREMISSAS col. D (linha do IR)'), esc(drvIR()[5] || '')]]),
    ['Juros de empréstimos (5,7 mi em jan–jun/26) ficaram fora da janela (modelo 0): a dívida extraconcursal gera juros em 2027?']);
  /* caixa */
  const rec = (P.caixa || []).filter(c => /^Recebimento em|^Recebimento à vista/.test(c[0]));
  const cxI = cxLinha('Saldo inicial de caixa'), cxF = cxLinha('Saldo final de caixa');
  h += secPrem('caixa', 'Caixa: recebimentos, impostos, saldo inicial', `saldo dez/27 ${rsC(cxF.m[11])}`,
    `Método direto, mensal. Recebimentos = (faturamento − VPC − devoluções) × (1 − PCLD) nos prazos abaixo (jan–abr/27 recebem as vendas de set–dez/26); a carteira de 31/10 entra pelo aging oficial. Impostos da competência pagos no mês seguinte. Saldo inicial = média dos saldos LIVRES de fim de mês jul–out/26 das disponibilidades (BASE_CAIXA col. C).`,
    rec.map(c => [esc(c[0]), pc(c[1], 0), onde('PREMISSAS (premissas do caixa)', 'Configuração › Premissas'), esc(c[2] || '')])
      .concat([['Defasagem do pagamento de impostos (meses)', pFmt(cx('Defasagem')[1]), onde('PREMISSAS (caixa)'), ''],
        ['Saldo de caixa em 01/01/2027', rs(cxI.m[0]), onde('PREMISSAS (caixa) — sobrescrever na última linha do bloco'), esc(cx('Saldo de caixa em 01/01/2027 (R$) — projetado')[2] || '')],
        ['Usar aging a receber 31/10 para a carteira', pFmt(cx('Usar aging')[1]), onde('PREMISSAS (caixa)'), ''],
        ['Recuperação dos títulos a receber vencidos em 31/10', pFmt(cx('Recuperação')[1]), onde('PREMISSAS (caixa)'), 'A CONFIRMAR — 0 = conservador'],
        ['Pagamento dos fornecedores pós-pedido vencidos em 31/10', pFmt(cx('Pagamento em 2027')[1]), onde('PREMISSAS (caixa)'), 'A CONFIRMAR'],
        ['Faturamento nov/26 e dez/26', `${pFmt(cx('Faturamento nov')[1])} · ${pFmt(cx('Faturamento dez')[1])}`, onde('PREMISSAS (caixa)'), 'vazio = média jul–out/26']]),
    ['Saldo inicial pela média jul–out/26 não desconta o que sai em nov–dez/26 (sinal das compras de out–dez/26 do plano, 13º): usar o saldo projetado de 31/12?',
     `BCO QI SCD e EVERBLUE PAY contados como livres — confirmar (BASE_CAIXA col. C).`]);
  /* compras do P&D × PA */
  const CP = D.compras_pa, pl = P.plano_compras || [];
  const r_ = i => CP ? (CP.resumo[i] || ['', 0])[1] : 0;
  h += secPrem('compras', 'Compras do P&D × adiantamentos (PA)', `${rsC((pl[0] || {}).tot || 0)} ao fornecedor`,
    `Fornecedores de importação = cronograma de desembolso do <b>plano de compras do P&amp;D</b> (planilha do Victor Lima): cada compra (modelo × mês, out/26 a set/27) paga o sinal no pedido e os saldos em dias do embarque, pela condição do fornecedor; frete + impostos ≈ 30% na chegada. O que já foi comprado antes de 06/10/2026 tem fluxo próprio (aging a pagar 31/10). ` +
    (CP ? `<b>Adiantamentos:</b> os POs do plano com PA já pago (Protheus, SE2 × EIC) são casados com a compra do plano do mesmo modelo; só o que o PA pagou além do que o plano já põe em 2026 sai do caixa 2027 (linha "(+) Sinal já pago em 2026").` : 'Sem a aba COMPRAS_PA_2027 (gerar com --compras-pa).'),
    [['Pagamento ao fornecedor 2027 (plano)', rsC((pl[0] || {}).tot || 0), onde('PREMISSAS linha 22 (planilha do P&D)'), 'escala com o cenário de receita (PREMISSAS!B20)'],
     ['Frete + impostos de importação 2027 (plano)', rsC((pl[1] || {}).tot || 0), onde('PREMISSAS linha 23'), ''],
     ...(CP ? [['Deduzir o sinal já pago (PA) dos POs do plano', pFmt(adV(/deduzir do caixa 2027/)), onde('PREMISSAS!' + adA(/deduzir do caixa 2027/)), ''],
       ['POs do plano com PA · sinal pago', `${r_(1)} PO · ${rsC(r_(2))}`, onde('COMPRAS_PA_2027 (Protheus, só leitura)'), `o plano já põe ${rsC(r_(3))} dessas compras em 2026`],
       ['<b>Duplicidade deduzida do caixa 2027</b>', `<b>${rsC(r_(5))}</b>`, onde('COMPRAS_PA_2027 · FLUXO_CAIXA_2027'), 'PA além do que o plano já põe em 2026'],
       ['Calendário real do saldo desses POs em 2027 (informativo)', rsC(r_(6)), onde('COMPRAS_PA_2027'), `plano em 2027 para as mesmas compras: ${rsC(r_(4))}`],
       ['POs com PA de modelo FORA do plano — saldo US$', fmt(r_(7), { uni: 'R$' }), onde('COMPRAS_PA_2027'), 'não está no caixa — conferir com o P&amp;D'],
       ['Já comprado (antes de 06/10) com PA e sem embarque — saldo R$', rsC(r_(8)), onde('COMPRAS_PA_2027'), 'não está no caixa 2027 (nem no plano, nem no aging)'],
       ['Câmbio do plano (R$/US$)', pFmt(adV(/câmbio do plano/)), onde('PREMISSAS!' + adA(/câmbio do plano/)), 'só nas conversões informativas']] : [])],
    CP ? [`O plano previa ${rsC(r_(3) + r_(4))} para as compras de out–nov/26 já colocadas; os pedidos saíram juntos em 05/11 e embarcam 15–30/12: o saldo cai todo em fev–abr/27 (${rsC(r_(6))} pelo calendário real × ${rsC(r_(4))} no plano).`,
      r_(8) > 0 ? `${rsC(r_(8))} de POs já comprados antes do plano ainda sem embarque não estão no caixa 2027 — incluir como "compras já contratadas"?` : '',
      r_(7) > 0 ? `${[...new Set(CP.pos.filter(p => /^MODELO FORA/.test(p.sit)).map(p => esc(p.modelo)))].join(', ')} comprado(s) com PA sem compra no plano do P&amp;D (POs ${CP.pos.filter(p => /^MODELO FORA/.test(p.sit)).map(p => esc(p.po)).join(', ')}): substitui outro modelo do plano ou é compra a mais?` : ''] : []);
  if (CP) h += tabelaPA(CP);
  /* RJ */
  const cxRJ = (D.caixa.linhas.find(l => /credores da RJ/.test(l.l)) || { m: [0] }).m, cxPa = (D.caixa.linhas.find(l => /Parcelamentos de impostos/.test(l.l)) || { m: [0] }).m;
  h += secPrem('rj', 'Plano da RJ e parcelamentos', rsC(soma(cxRJ) + soma(cxPa)),
    'Pagamentos do plano de recuperação judicial (modelo da TCP, 27/08/2026; 2027 é igual nas opções 1, 2 e 3 por carência) e parcelamentos fiscais extraconcursais. A concursal do aging (emissão até 29/05/2026) sai pelo plano da RJ, não pelo aging.',
    ad.filter(a => /RJ|fiscal/i.test(a[0])).map(a => [esc(a[0]), pFmt(a[1]), onde('PREMISSAS!' + a[3], 'Configuração › Premissas'), esc(a[2] || '')]),
    ['Início das parcelas Classe I e III (fev/27) ainda A CONFIRMAR com a TCP.']);
  return h;
}
function tabelaPA(CP) {
  const P_ = CP.pos.filter(p => p.sit === 'NO PLANO');
  return `<details class="card prem-det" ${est.f.premPA ? 'open' : ''} id="premPA"><summary>POs do plano com PA — por PO (${P_.length}) · dedução e calendário real</summary>
   <div class="tw solta" style="max-height:380px"><table class="t"><thead><tr><th>PO · PI</th><th>Fornecedor</th><th>Modelo</th><th class="n">Un.</th><th class="n">FOB US$</th><th>PA</th><th class="n">PA R$</th><th class="n">% pago</th><th>Mês de compra no plano</th><th class="n">Plano 2026</th><th class="n">Plano 2027</th><th class="n">Dedução 2027</th><th class="n">Real 2027 (inf.)</th></tr></thead><tbody>
   ${P_.map(p => `<tr><td class="nw"><b>${esc(p.po)}</b><br><small>${esc(p.pi)}</small></td><td class="w"><small>${esc(p.forn)}</small></td><td class="nw">${esc(p.modelo)}</td><td class="n">${fmt(p.un, { uni: 'R$' })}</td><td class="n">${fmt(p.fob, { uni: 'R$' })}</td><td class="nw"><small>${esc(p.pa)}<br>${esc(p.pa_data)}</small></td>${tdN(p.pa_brl)}${tdP(p.pct_pago)}
     <td class="nw"><small>${CP.alocacao.filter(a => a.po === p.po).map(a => `${esc(a.mes || 'sem mês')}: ${fmt(a.un, { uni: 'R$' })} un`).join('<br>')}</small></td>${tdN(p.pl26)}${tdN(p.pl27)}${tdN(p.ded)}${tdN(p.real27)}</tr>`).join('')}</tbody>
   <tfoot><tr><td>Total</td><td></td><td></td><td></td><td class="n">${fmt(soma(P_, p => p.fob), { uni: 'R$' })}</td><td></td>${tdN(soma(P_, p => p.pa_brl))}<td></td><td></td>${tdN(soma(P_, p => p.pl26))}${tdN(soma(P_, p => p.pl27))}${tdN(soma(P_, p => p.ded))}${tdN(soma(P_, p => p.real27))}</tr></tfoot></table></div>
   ${CP.pos.filter(p => p.sit !== 'NO PLANO').length ? `<div class="csub" style="margin-top:8px">Fora do plano: ${CP.pos.filter(p => p.sit !== 'NO PLANO').map(p => `${esc(p.po)} (${esc(p.modelo || 'peças')}, ${esc(p.sit.replace(/ —.*/, ''))})`).join(' · ')}</div>` : ''}
   ${CP.ja_comprado.length ? `<div class="tw solta" style="margin-top:8px"><table class="t"><thead><tr><th>Já comprado sem embarque · PO · PI</th><th>Fornecedor</th><th>Data do PO</th><th>Embarque previsto</th><th class="n">FOB US$</th><th class="n">PA US$</th><th class="n">Saldo US$</th><th class="n">Saldo R$</th><th>Obs.</th></tr></thead><tbody>
     ${CP.ja_comprado.map(x => `<tr><td class="nw">${esc(x.po)} · ${esc(x.pi)}</td><td class="w"><small>${esc(x.forn)}</small></td><td>${esc(x.data_po)}</td><td>${esc(x.emb)}</td><td class="n">${fmt(x.fob, { uni: 'R$' })}</td><td class="n">${fmt(x.pa, { uni: 'R$' })}</td><td class="n">${fmt(x.saldo_usd, { uni: 'R$' })}</td>${tdN(x.saldo_brl)}<td class="w"><small>${esc(x.obs)}</small></td></tr>`).join('')}</tbody></table></div>` : ''}
  </details>`;
}
function posPrem() {
  document.querySelectorAll('#tela [data-ir-prem]').forEach(a => a.onclick = e => { e.preventDefault(); rolaPrem(a.dataset.irPrem); });
  ligaIconesPrem(document.querySelector('#tela'));
  if (est.f.premSec) { const s = est.f.premSec; est.f.premSec = null; setTimeout(() => rolaPrem(s), 30); }
}
function rolaPrem(s) {
  const el = document.getElementById('prem-' + s); if (!el) return;
  document.querySelectorAll('.prem-sec.foco').forEach(x => x.classList.remove('foco'));
  el.classList.add('foco'); el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/* Configuração › Premissas: acrescenta os parâmetros adicionais (antes fixos no gerador) */
function adicionaisHtml() {
  const ad = (D.premissas && D.premissas.adicionais) || [];
  if (!ad.length) return '';
  return `<div class="card"><h3>Parâmetros adicionais — plano da RJ e compras do P&amp;D <small>antes fixos no gerador; PREMISSAS (bloco abaixo das diretrizes)</small></h3>
    ${ad.map(p => `<div class="sumline"><span class="t">${esc(p[0])}<br><small style="color:var(--ink3)">${esc(p[2])} · PREMISSAS!${esc(p[3])}</small></span><span class="v" style="background:var(--ed);padding:2px 6px;border-radius:4px">${pFmt(p[1])}</span></div>`).join('')}
    <div class="csub" style="margin-top:6px">O porquê de cada premissa e quanto ela pesa: <a href="#premissas_orc" data-prem="rj">Premissas orçamentárias</a>.</div></div>`;
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js antes de inicia()) */
function instalaOrcDre() {
  if (window.__orcDre) return; window.__orcDre = true;
  const st = document.createElement('style');
  st.textContent = `.prem-ic{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;border:1px solid #9AA6B5;color:#5B6472;font-size:10px;font-weight:800;margin-left:6px;text-decoration:none;cursor:pointer;flex-shrink:0;font-style:normal;text-transform:none;letter-spacing:0;background:#fff;line-height:1}
.prem-ic:hover{background:#C8102E;border-color:#C8102E;color:#fff}
table.dre tr.t .prem-ic{background:transparent;color:#fff;border-color:#9AA6B5}
table.dre tr.dclic{cursor:pointer}table.dre tr.dclic:hover td{background:#F4F7FB}table.dre tr.t.dclic:hover td{background:#22324A}
.prem-sec{scroll-margin-top:96px}.prem-sec.foco{box-shadow:0 0 0 2px #C8102E}
.prem-cab{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}.prem-val{font-weight:800;font-size:15px;color:var(--ink)}
p.exp{font-size:13px;line-height:1.5;color:var(--ink2);margin:6px 0 10px}
.prem-tab td{vertical-align:top}.prem-tab .pv{background:var(--ed);padding:2px 6px;border-radius:4px;font-weight:700}.onde{font-size:12px;color:var(--ink2)}
.disc{margin-top:10px;background:#FFF8F0;border:1px solid #F3D9BF;border-radius:8px;padding:8px 12px;font-size:12.5px}.disc ul{margin:4px 0 0 18px}.disc li{margin:3px 0}
.prem-indice{flex-wrap:wrap}.prem-indice .chip{text-decoration:none}
details.prem-det summary{cursor:pointer;font-weight:700}
@media (max-width:700px){.prem-tab th:nth-child(4),.prem-tab td:nth-child(4){display:none}}`;
  document.head.appendChild(st);
  const g = MENU.find(x => x.g === 'orc');
  if (g && !g.itens.some(i => i.id === 'premissas_orc')) {
    const it = { id: 'premissas_orc', t: 'Premissas orçamentárias', ico: '?', r: CT_CEO_DIR };    // mostra DRE e caixa da empresa → mesmos perfis da DRE
    g.itens.splice(Math.max(0, g.itens.findIndex(i => i.id === 'versoes')), 0, it);
    ITENS[it.id] = { ...it, g: g.g, gt: g.t };
  }
  TELAS.premissas_orc = telaPremissas; POS.premissas_orc = posPrem;
  const pd = POS.dre, pt = POS.dre_tcp, pc_ = POS.caixa, tc = TELAS.cfg_premissas, pcf = POS.cfg_premissas;
  POS.dre = () => { if (pd) pd(); decoraDRE(); };
  POS.dre_tcp = () => { if (pt) pt(); decoraTCP(); };
  POS.caixa = () => { if (pc_) pc_(); decoraCaixa(); };
  if (tc) TELAS.cfg_premissas = () => tc() + adicionaisHtml();
  POS.cfg_premissas = () => { if (pcf) pcf(); ligaIconesPrem(document.querySelector('#tela')); };
}
