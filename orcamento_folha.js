/* MOTOR DA FOLHA 2027 — mesmas regras do PT (.claude/scripts/pt_folha_2027.py: QUADRO_FOLHA → SIMULADOR_FOLHA), 13/11/2026.
   Entrada: premissa (dissídio por convenção, encargos, provisões, rescisão, curvas, % HE/adicionais/MOD por área, benefícios,
   componentes e contas centralizadas) + posições (anônimas; movimentações do gestor). Saída: linhas (cenário × área × componente ×
   destino) com conta, setor final, 12 meses e o mês-base — o mesmo formato da tabela orc_folha_projecao.
   Roda no navegador: o PROJETAR FOLHA recalcula a(s) área(s) e a consolidação soma as áreas. Nenhum dado embutido aqui. */
"use strict";
const FOLHA_NPJ = 'Honorários PJ (informativo — conta Assessoria)';

function folhaPosicao(x, P) {
  const dis = P._dis || (P._dis = Object.fromEntries((P.dissidio || []).filter(d => d.conv).map(d => [d.conv, d])));
  const p = P.p, d = dis[x.convencao];
  const U = /^[PJ]/.test(x.id), PJ = x.tipo === 'PJ', PL = x.tipo === 'PRÓ-LABORE', AF = x.afastado === 'S';
  const V = PJ ? 0 : (d ? +d.pct || 0 : 0), W = d ? (+d.ap || 13) : 13, X = d ? +d.atraso || 0 : 0, Y = d ? d.comp : 'NENHUMA';
  const Z = (+x.salario || 0) + (+x.adicional || 0);
  const adm = +x.mes_adm || 0, desl = +x.mes_desl || 0, prom = +x.mes_promo || 0, pp = +x.pct_promo || 0, qtd = +x.qtd || 0;
  const ativo = [], remG = [], remM = [];
  for (let m = 1; m <= 12; m++) {
    const a = ((adm > 0 && m < adm) || (desl > 0 && m >= desl)) ? 0 : qtd;
    ativo.push(a);
    remG.push(AF ? 0 : Z * (1 + ((m >= W && (adm === 0 || adm < W)) ? V : 0)) * (1 + ((prom > 0 && m >= prom) ? pp : 0)) * a);
    remM.push((!U || AF) ? 0 : Z * (1 + (m >= W ? V : 0)));
  }
  const BK = U ? 1 : 0;
  const ativoW = (W >= 1 && W <= 12) ? ativo[W - 1] : 0;
  const BL = (!U || AF) ? 0 : Z * V * X;
  const meses13 = adm > 0 ? Math.max(0, W - adm) : W - 1;
  const BO = (AF || W > 12) ? 0 : Z * V * meses13 / 12 * ativoW;
  const BP = (AF || W > 12) ? 0 : Z * V * p.meses_fer / 12 * 4 / 3 * ativoW;
  const BQ = (!U || AF || W > 12) ? 0 : Z * V * (W - 1) / 12;
  const BR = (!U || AF || W > 12) ? 0 : Z * V * p.meses_fer / 12 * 4 / 3;
  const BS = desl === 0 ? 0 : Z * (1 + (desl > W ? V : 0)) * (1 + ((prom > 0 && desl > prom) ? pp : 0));
  const BT = desl === 0 ? 0 : (adm > 0 ? desl - adm : (+x.meses_casa || 0) + desl);
  const BU = (desl === 0 || x.tipo_desl === 'PEDIDO' || AF || PJ) ? 0
    : BS / 30 * Math.min(p.aviso_max, p.aviso_base + p.aviso_ano * Math.floor(BT / 12)) * (x.tipo_desl === 'ACORDO' ? p.aviso_acordo : 1) * Math.max(1, qtd);
  const BV = (desl === 0 || x.tipo_desl === 'PEDIDO' || PJ) ? 0
    : (x.tipo_desl === 'ACORDO' ? p.multa_acordo : p.multa_sjc) * p.fgts * BS * BT * Math.max(1, qtd);
  const BW = (!U || AF || PJ || PL) ? 0 : Z;
  return { x, U, PJ, PL, W, Y, Z, ativo, remG, remM, BK, BM: BL * ativoW, BN: BL, BO, BP, BQ, BR, BU, BV, BW, desl };
}

/* direcionadores de uma área num cenário: { REM:[12], ..., base:{...} } */
function folhaDirecionadores(linhas, area, cen, P) {
  const L = linhas.filter(l => l.x.area === area), z = () => Array(12).fill(0);
  const D = { REM: z(), REM_APR: z(), PL: z(), PJ: z(), HE: z(), ABONO: z(), RETRO: z(), AVISO: z(), MULTA: z(), AJ13: z(), AJFER: z(),
    HC_BA: z(), HC_SP: z(), HCP_BA: z(), HCP_SP: z(), HCO_BA: z(), HCO_SP: z() };
  // Silvio 13/11/2026: diretores (reembolso de combustível) e gerentes (benefícios no cartão Flash) não recebem o benefício OPERACIONAL (fretado)
  const oper = l => !/^(DIRETOR|GERENTE)/.test(String(l.x.funcao || '').toUpperCase());
  const ar = (P.areas || {})[area] || {}, he = +ar.he || 0;
  for (const l of L) {
    const rem = cen === 'GESTOR' ? l.remG : l.remM, at = cen === 'GESTOR' ? l.ativo : Array(12).fill(l.BK);
    const t = l.x.tipo, cv = l.x.convencao, pl = l.x.plano === 'S';
    for (let i = 0; i < 12; i++) {
      const m = i + 1;
      if (!l.PL && !l.PJ) D.REM[i] += rem[i];
      if (t === 'APRENDIZ') D.REM_APR[i] += rem[i];
      if (l.PL) D.PL[i] += rem[i];
      if (l.PJ) D.PJ[i] += rem[i];
      if (l.W === m) {
        const comp = cen === 'GESTOR' ? l.BM : l.BN;
        if (l.Y === 'ABONO') D.ABONO[i] += comp;
        if (l.Y === 'RETROATIVO') D.RETRO[i] += comp;
        D.AJ13[i] += cen === 'GESTOR' ? l.BO : l.BQ;
        D.AJFER[i] += cen === 'GESTOR' ? l.BP : l.BR;
      }
      if (cen === 'GESTOR' && l.desl === m) { D.AVISO[i] += l.BU; D.MULTA[i] += l.BV; }
      if (cv === 'BA' && !l.PL) D.HC_BA[i] += at[i];
      if (cv === 'SP' && !l.PL) D.HC_SP[i] += at[i];
      if (cv === 'BA' && pl) D.HCP_BA[i] += at[i];
      if (cv === 'SP' && pl) D.HCP_SP[i] += at[i];
      if (cv === 'BA' && !l.PL && oper(l)) D.HCO_BA[i] += at[i];
      if (cv === 'SP' && !l.PL && oper(l)) D.HCO_SP[i] += at[i];
    }
  }
  for (let i = 0; i < 12; i++) D.HE[i] = D.REM[i] * he * (+P.curvas.he[i] || 0);
  // mês-base (calibração): quadro atual sem dissídio, HE real jul–out, sem eventos
  const B = { REM: 0, REM_APR: 0, PL: 0, PJ: 0, HE: 0, ABONO: 0, RETRO: 0, AVISO: 0, MULTA: 0, AJ13: 0, AJFER: 0, HC_BA: 0, HC_SP: 0, HCP_BA: 0, HCP_SP: 0,
    HCO_BA: 0, HCO_SP: 0 };
  for (const l of L) {
    B.REM += l.BW; if (l.x.tipo === 'APRENDIZ') B.REM_APR += l.BW;
    if (l.PL) B.PL += l.Z; if (l.PJ) B.PJ += l.Z;
    B.HE += +l.x.he_media || 0;
    const cv = l.x.convencao, pl = l.x.plano === 'S';
    if (cv === 'BA' && !l.PL) B.HC_BA += l.BK; if (cv === 'SP' && !l.PL) B.HC_SP += l.BK;
    if (cv === 'BA' && pl) B.HCP_BA += l.BK; if (cv === 'SP' && pl) B.HCP_SP += l.BK;
    if (cv === 'BA' && !l.PL && oper(l)) B.HCO_BA += l.BK; if (cv === 'SP' && !l.PL && oper(l)) B.HCO_SP += l.BK;
  }
  D.base = B;
  return D;
}

/* componentes × destino de uma área/cenário */
function folhaComponentes(D, area, cen, P) {
  const p = P.p, INSS_T = p.inss + p.terceiros + p.rat, encAb = p.enc_abono === 'S' ? 1 : 0, encProv = p.enc_prov === 'S' ? 1 : 0;
  const ar = (P.areas || {})[area] || {}, mod = +ar.mod || 0, shs = 1 - (+ar.adic || 0);
  const central = P.central || {};
  const setorFinal = conta => central[String(conta)] || area;
  const val = (d, k) => (k === 'base' ? D.base[d] : D[d][k]);
  const formula = (nome, k) => {
    const g = d => val(d, k), prov = (g('REM') + g('HE')) * (p.prov_fer + p.prov_13) + g('AJFER') + g('AJ13');
    switch (nome) {
      case 'Salários': return g('REM') * shs + g('RETRO');
      case 'Adicionais fixos (triênio/quinquênio)': return g('REM') * (1 - shs);
      case 'Horas extras + DSR': return g('HE');
      case 'Abono do dissídio (compensação do atraso)': return g('ABONO');
      case 'Pró-labore': return g('PL');
      case 'INSS (patronal + terceiros + RAT)': return (g('REM') + g('HE') + g('RETRO') + encAb * g('ABONO')) * INSS_T + g('PL') * p.inss_pl;
      case 'FGTS': return (g('REM') - g('REM_APR') + g('HE') + g('RETRO') + encAb * g('ABONO')) * p.fgts + g('REM_APR') * p.fgts_apr + g('AVISO') * p.fgts;
      case 'Provisão de férias + 1/3': return (g('REM') + g('HE')) * p.prov_fer;
      case 'Provisão de 13º': return (g('REM') + g('HE')) * p.prov_13;
      case 'Ajuste da provisão de férias pelo dissídio': return g('AJFER');
      case 'Ajuste da provisão de 13º pelo dissídio': return g('AJ13');
      case 'INSS sobre provisões e ajustes': return encProv * prov * INSS_T;
      case 'FGTS sobre provisões e ajustes': return encProv * prov * p.fgts;
      case 'Aviso prévio indenizado (rescisão)': return g('AVISO');
      case 'Multa do FGTS (rescisão)': return g('MULTA');
      case FOLHA_NPJ: return g('PJ');
    }
    return 0;
  };
  const out = [];
  for (const [nome, cd, cm] of P.componentes) {
    const dest = cm ? [['DESPESA', cd, 1 - mod], ['MOD', cm, mod]] : [['DESPESA', cd, 1]];
    for (const [destino, conta, fator] of dest) {
      const m = []; for (let i = 0; i < 12; i++) m.push(formula(nome, i) * fator);
      out.push({ cenario: cen, area, componente: nome, destino, conta, setor_final: setorFinal(conta), m, base: cen === 'MODELO' ? formula(nome, 'base') * fator : null });
    }
  }
  for (const b of P.beneficios) {
    const hc = k => (b.conv === 'SP' ? 0 : (b.quem === 'PLANO' ? val('HCP_BA', k) : b.quem === 'OPERACIONAL' ? val('HCO_BA', k) : val('HC_BA', k)))
      + (b.conv === 'BA' ? 0 : (b.quem === 'PLANO' ? val('HCP_SP', k) : b.quem === 'OPERACIONAL' ? val('HCO_SP', k) : val('HC_SP', k)));
    const m = []; for (let i = 0; i < 12; i++) m.push(hc(i) * (+b.valor || 0) * (1 + ((i + 1) >= (+b.mes || 13) ? (+b.reaj || 0) : 0)));
    out.push({ cenario: cen, area, componente: b.nome, destino: 'DESPESA', conta: +b.conta, setor_final: setorFinal(b.conta), m,
      base: cen === 'MODELO' ? hc('base') * (+b.valor || 0) : null });
  }
  return out;
}

/* PROJETAR FOLHA: posições (com as edições) → linhas por área e cenário; areas = lista a projetar */
function projetarFolha(P, posicoes, areas) {
  P._dis = null;
  const linhas = posicoes.map(x => folhaPosicao(x, P));
  const out = [];
  for (const area of areas) for (const cen of ['MODELO', 'GESTOR']) out.push(...folhaComponentes(folhaDirecionadores(linhas, area, cen, P), area, cen, P));
  return out;
}

/* efeito de caixa (13º e férias) a partir das linhas MODELO */
function folhaCaixa(linhas, P) {
  const soma = nomes => { const a = Array(12).fill(0); linhas.filter(l => l.cenario === 'MODELO' && nomes.includes(l.componente)).forEach(l => l.m.forEach((v, i) => a[i] += v)); return a; };
  const p13 = soma(['Provisão de 13º', 'Ajuste da provisão de 13º pelo dissídio']), pfe = soma(['Provisão de férias + 1/3', 'Ajuste da provisão de férias pelo dissídio']);
  const t13 = p13.reduce((s, v) => s + v, 0), tfe = pfe.reduce((s, v) => s + v, 0), p = P.p;
  const pg13 = p13.map((_, i) => (i + 1 === p.p13_mes1 ? p.p13_pct1 * t13 : 0) + (i + 1 === p.p13_mes2 ? (1 - p.p13_pct1) * t13 : 0));
  const pgfe = pfe.map((_, i) => tfe * (+P.curvas.ferias[i] || 0));
  return [['Provisão de 13º + ajuste (DRE)', p13], ['13º pago (caixa)', pg13], ['Provisão de férias + ajuste (DRE)', pfe], ['Férias pagas (caixa)', pgfe],
          ['Efeito de caixa (provisões − pagamentos)', p13.map((v, i) => v - pg13[i] + pfe[i] - pgfe[i])]];
}
