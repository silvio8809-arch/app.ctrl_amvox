/* FORNECEDORES × MESES — Silvio 14/11/2026: "um painel que demonstre os fornecedores na coluna e o valor orçado mês a mês e conta, para encontrar
   as lacunas". Carregado ANTES do orcamento.js; instalado pelo gancho instalaOrcFornecedores() (usa TELAS, POS, MENU, ITENS, D, RAZAO, est, CTR, ctMeses…).
   A tela calcula com o que a versão já tem — razão jul–out/26 (líquido dos ajustes gerenciais), decisões por linha (D.linhas), orçado do gestor
   (D.orcado) e contratos recorrentes (CTR.rows, ao vivo) — mais os APELIDOS de fornecedor da Central de de-para (CEN.ap, tabela orc_fornecedor_apelido).
   O CASAMENTO do nome digitado pelo gestor com o fornecedor é feito AQUI, ao vivo (fmCasa): apelido novo na central vale na hora.
   UMA LINHA = fornecedor × conta × área. DE ONDE VEM o orçado do fornecedor (og):
     CONTRATO  linha decidida por CONTRATO (ou OUTRO = gestor + contrato) → meses do contrato (ctMeses)
     GESTOR    o gestor nomeou o fornecedor no orçamento e a decisão da linha é GESTOR/OUTRO → meses do gestor
     MODELO    linha decidida pelo MODELO (ou parte sem contrato da decisão CONTRATO) → histórico do fornecedor × fator × (1 + % aplicado), na curva da linha
     CONTA     decisão GESTOR/OUTRO sem fornecedor nomeado → não há valor por fornecedor; mostra a NECESSIDADE (contrato ou histórico + inflação)
               e a COBERTURA da conta = saldo da conta (orçado − fornecedores nomeados) ÷ histórico que esse saldo precisa cobrir
     PCT       linha orçada por % do faturamento (comissões, fretes…) → fora da leitura por fornecedor
   SITUAÇÃO (sit): LAC_SEM recorrente sem orçado · LAC_MES meses sem valor · ABAIXO cobertura < 100% − tolerância do modelo · NOVO orçado sem histórico ·
     SEM_COR nome do gestor sem correspondência na base · EV_MOD 1–2 meses na janela anualizados pelo modelo · OK · EVENTUAL · FORA / FORA_P (decisão) ·
     PCT · AJUSTE (histórico zerado por ajuste gerencial). Recorrente = lançamento em ≥ 75% dos meses da janela (conta gêmea 3110301 ↔ 3120101 conta junto).
   Conferência: protótipo independente em Python (painel_proto.py) → mesmas linhas, origem, situação e valores.
   2ª RODADA (Silvio 14/11/2026; APROVADO e publicado em 14/11): (a) APELIDO — nome que o gestor escreve (nome fantasia, nome antigo, abreviação) casado com o
     fornecedor da base; casamento 'A' = apelido confirmado de fornecedor sem lançamento na janela → entra como NOVO, não como sem correspondência;
     apelido PENDENTE = informado mas com divergência → NÃO casa: segue SEM_COR com a observação, e o valor continua no saldo da conta);
   (b) BENEFÍCIO DA FOLHA — fornecedor amarrado a um benefício do simulador (premissas da folha: FOLHA.P.beneficios[].forn — hoje refeitório e
     vale-refeição): o ESPERADO é o do simulador de folha (quadro da área × valor por pessoa, cenário do gestor) e não o contrato/histórico; na conta do
     benefício a cobertura das linhas "na conta" é saldo ÷ simulador; a parcela lançada na conta gêmea de custo soma na cobertura (x.totG). */
const FM = { rz: null, agg: null, rows: [], vis: [] };
const FM_OG = {
  CONTRATO: { t: 'Contrato', cor: '#1F6FEB', cel: 'ct', d: 'linha decidida por contrato' },
  GESTOR: { t: 'Gestor nomeou', cor: '#1A7F4B', cel: 'ge', d: 'o gestor escreveu o fornecedor no orçamento' },
  MODELO: { t: 'Modelo', cor: '#0E7490', cel: 'mo', d: 'histórico do fornecedor + inflação' },
  CONTA: { t: 'Na conta', cor: '#9AA5B4', cel: 'nc', d: 'o gestor orçou a conta sem nomear o fornecedor' },
  PCT: { t: '% faturamento', cor: '#C9D1DC', cel: 'vz', d: 'linha orçada por % do faturamento' },
  DRIVER: { t: 'Regra do modelo', cor: '#C9D1DC', cel: 'vz', d: 'linha orçada por regra do modelo' },
  SEM: { t: 'Sem fornecedor', cor: '#E3E7ED', d: 'folha, provisões e lançamentos sem fornecedor' },
};
const FM_SIT = {
  LAC_SEM: { t: 'Lacuna: sem orçado', tl: 'Lacuna: recorrente sem orçado', c: 'r', g: 'lac' }, LAC_MES: { t: 'Lacuna: meses', tl: 'Lacuna: meses sem valor', c: 'r', g: 'lac' },
  ABAIXO: { t: 'Abaixo do esperado', tl: 'Abaixo do esperado', c: 'y', g: 'abx' }, NOVO: { t: 'Novo', tl: 'Novo: orçado sem histórico', c: 'b', g: 'novo' },
  SEM_COR: { t: 'Sem correspondência', tl: 'Nome do gestor sem correspondência na base', c: 'b', g: 'novo' }, EV_MOD: { t: 'Eventual projetado', tl: 'Eventual projetado pelo modelo', c: 'y', g: 'evm' },
  OK: { t: 'Coberto', tl: 'Coberto', c: 'g', g: 'ok' }, FORA: { t: 'Fora (decisão)', tl: 'Fora de 2027 por decisão', c: '', g: 'fora' }, FORA_P: { t: 'Encerra (decisão)', tl: 'Encerra em 2027 por decisão', c: '', g: 'fora' },
  EVENTUAL: { t: 'Eventual', tl: 'Eventual', c: '', g: 'ev' }, PCT: { t: '% do faturamento', tl: 'Orçado por % do faturamento', c: '', g: 'pct' }, AJUSTE: { t: 'Sem base líquida', tl: 'Sem base líquida na janela (ajuste gerencial ou estorno)', c: '', g: 'aj' },
};
const FM_SIMF = 'simulador de folha';
const FM_FORA_PRINCIPAL = new Set(['ev', 'pct', 'aj']);      // grupos fora da leitura principal (aparecem pelos botões "fora da leitura")
const fmNz = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const fmMes26 = m => MESES[+String(m).slice(4) - 1] + '/' + String(m).slice(2, 4);
// nomes GENÉRICOS que o gestor escreve no lugar do fornecedor (não são fornecedor): o valor fica "na conta"
const FM_GENERICOS = new Set(['', 'AMVOX', 'DIVERSOS', 'INTERNO', 'GOVERNO', 'TODOS POSTOS', 'REEMBOLSO', 'OUTROS EQUIPAMENTOS', 'FORNECEDORES DIVERSOS', 'SISTEMAS DE APOIO',
  'PALLET TAMBEM', 'TREINAMENTO E AUXILIO EDUCACAO']);
// 1ª palavra significativa (≥ 3 letras) de cada alternativa separada por '/' (o que vem depois de ' - ' é descrição)
const fmTokens = nome => String(nome || '').split('/').map(a => fmNz(a.split(' - ')[0]).split(' ')[0]).filter(p => p && p.length >= 3);

/* CASAMENTO do nome digitado pelo gestor com o fornecedor da base (a mesma regra roda em Python no gerador do PT e no painel_proto.py):
   G genérico · L achado na mesma linha (área × conta) · B achado em outra conta/área · A apelido confirmado de fornecedor sem lançamento na janela ·
   N sem correspondência. Nome: a 1ª palavra de cada alternativa, inteira, na razão social (razão + contratos). Apelido (Central de de-para): a alternativa
   é igual à chave ou começa por ela ("ACME TELECOM" → "ACME"); apelido PENDENTE não casa (o nome segue N e leva o apelido, para mostrar a observação). */
function fmCasa(texto, naLinha, nomeN, AP) {
  if (FM_GENERICOS.has(fmNz(texto))) return { fk: 'G', fc: [] };
  const alts = String(texto || '').split('/').map(a => fmNz(a.split(' - ')[0])), todos = [];
  alts.forEach(a => AP.chaves.forEach(k => { if (a === k || a.startsWith(k + ' ')) todos.push(k); }));
  const ap = todos.filter(k => AP.por[k].situacao !== 'PENDENTE'), pend = todos.filter(k => AP.por[k].situacao === 'PENDENTE');
  const clAp = ap.flatMap(k => AP.por[k].clvl), tk = fmTokens(texto).map(p => new RegExp('\\b' + p + '\\b'));
  const acha = fs => fs.filter(cl => cl && tk.some(re => re.test(nomeN[cl] || ''))), uni = a => [...new Set(a)].sort();
  const fa = ap.join(' / ') || null, fn = fc => ap.length && fc.every(c => clAp.includes(c)) ? ap.map(k => AP.por[k].fornecedor).join(' / ') : null;
  const L = uni([...acha([...naLinha]), ...clAp.filter(c => naLinha.has(c))]);
  if (L.length) return { fk: 'L', fc: L, fa, fn: fn(L) };
  const B = uni([...acha(Object.keys(nomeN)), ...clAp.filter(c => c in nomeN)]);
  if (B.length) return { fk: 'B', fc: B, fa, fn: fn(B) };
  if (ap.length) { const fc = uni(clAp); return { fk: 'A', fc, fa, fn: fn(fc) }; }
  return { fk: 'N', fc: [], fa: pend.join(' / ') || null, fn: null };
}

function fmAgrega() {                                        // razão líquido por linha (área|conta) → fornecedor → [meses da janela]
  if (FM.agg && FM.rz === RAZAO) return FM.agg;
  const dic = D.meta.razao.dic, meses = [...new Set(RAZAO.map(r => r[0]))].sort(), im = {}; meses.forEach((m, i) => im[m] = i);
  const porLinha = new Map(), nome = {};
  for (const r of RAZAO) {
    const f = r[13] || '', k = dic.setor[r[11]] + '|' + r[4];
    let L = porLinha.get(k); if (!L) porLinha.set(k, L = new Map());
    let v = L.get(f); if (!v) L.set(f, v = Array(meses.length).fill(0));
    v[im[r[0]]] += r[6];
    if (f && dic.nome[r[14]]) nome[f] = dic.nome[r[14]];
  }
  FM.rz = RAZAO; return FM.agg = { porLinha, nome, meses };
}

function fmSimFolha() {                                      // benefícios do simulador de folha nas contas que têm benefício amarrado a fornecedor
  const F_ = typeof FOLHA !== 'undefined' && FOLHA ? FOLHA : null, proj = (F_ && F_.proj) || [], bf = {};
  ((F_ && F_.P && F_.P.beneficios) || []).forEach(b => { const f = (b.forn || []).filter(Boolean); if (f.length) bf[b.nome] = f.map(c => 'F' + c); });
  const cen = proj.some(p => p.cenario === 'GESTOR') ? 'GESTOR' : 'MODELO';   // cenário do gestor = quadro atual + movimentações da área
  const contas = new Set(proj.filter(p => bf[p.componente]).map(p => String(p.conta))), ben = new Map(), tie = {};
  for (const p of proj) {
    if (p.cenario !== cen || !contas.has(String(p.conta))) continue;
    const k = p.setor_final + '|' + p.conta; let m = ben.get(k); if (!m) ben.set(k, m = {});
    const a = m[p.componente] || (m[p.componente] = Array(12).fill(0)); for (let i = 0; i < 12; i++) a[i] += +p.m[i] || 0;
  }
  Object.entries(bf).forEach(([b, cls]) => cls.forEach(cl => (tie[cl] = tie[cl] || []).push(b)));
  return { ben, tie };
}

function fmMonta() {
  const A = fmAgrega(), fator = D.meta.fator || 3, tol = D.meta.tolerancia ?? 0.049, nM = A.meses.length, minRec = Math.ceil(nM * 0.75);
  const oc = D.meta.outro_contrato || {}, z12 = () => Array(12).fill(0), zM = () => Array(nM).fill(0), add = (a, b) => a.map((v, i) => v + (b[i] || 0));
  const nome = { ...A.nome }, ctPorLinha = new Map(), SIM = fmSimFolha();
  (CTR.rows || []).forEach(r => {
    if (r.excluido || r.natureza !== 'FIXO' || !r.clvl) return;
    const k = r.area + '|' + r.conta; let m = ctPorLinha.get(k); if (!m) ctPorLinha.set(k, m = new Map());
    (m.get(r.clvl) || m.set(r.clvl, []).get(r.clvl)).push(r);
    if (!nome[r.clvl] || (r.fornecedor || '').length > nome[r.clvl].length) nome[r.clvl] = r.fornecedor || r.clvl;   // o razão corta o nome em 40 letras
  });
  // casamento ao vivo do nome digitado pelo gestor (apelidos da Central de de-para); guardado enquanto razão, contratos, orçado e apelidos não mudam
  const apL = (typeof CEN !== 'undefined' && CEN.ap) || [], apRev = typeof CEN !== 'undefined' ? CEN.rev : 0, nomeN = {};
  for (const cl in nome) nomeN[cl] = fmNz(nome[cl]);
  const AP = { chaves: apL.map(a => a.id).sort(), por: Object.fromEntries(apL.map(a => [a.id, { ...a, clvl: (a.cnpjs || []).map(c => 'F' + c) }])) };
  if (FM.cOrc !== D.orcado || FM.cRz !== RAZAO || FM.cCt !== CTR.rows || FM.cRev !== apRev || !FM.casaDe) { FM.casaDe = new Map(); FM.cOrc = D.orcado; FM.cRz = RAZAO; FM.cCt = CTR.rows; FM.cRev = apRev; }
  FM.casa = o => { let z = FM.casaDe.get(o); if (!z) FM.casaDe.set(o, z = fmCasa(o.f, new Set((A.porLinha.get(o.s + '|' + o.c) || new Map()).keys()), nomeN, AP)); return z; };
  const ctM = cts => cts.reduce((a, r) => add(a, ctMeses(r)), z12());
  const gemDe = c => /^(3110301|3120101)/.test(c) ? (c.startsWith('3110301') ? '3120101' : '3110301') + c.slice(7) : null;   // custo ↔ despesa, mesma natureza
  const orcPor = {}; (D.orcado || []).forEach(o => (orcPor[o.s + '|' + o.c] = orcPor[o.s + '|' + o.c] || []).push(o));
  const vis = setoresVisiveis(), rows = [], comp = { CONTRATO: 0, GESTOR: 0, MODELO: 0, CONTA: 0, PCT: 0, SEM: 0 };
  for (const l of D.linhas) {
    if (!vis.has(l.s)) continue;
    const s = l.s, c = String(l.c), k = s + '|' + c, H = A.porLinha.get(k) || new Map(), CL = ctPorLinha.get(k) || new Map();
    const ctDe = f => CL.get(f) || [];
    const pct = l.me === '% FATURAMENTO', da = l.da, pa = l.pa || 0, histModel = Math.abs(l.mo - l.b * (1 + pa)) < 1;
    const simL = SIM.ben.get(k) || {}, simTot = soma(Object.values(simL), v => soma(v));   // benefícios do simulador de folha nesta conta e área
    const bens = fs => [...new Set([...fs].flatMap(f => (SIM.tie[f] || []).filter(b => simL[b])))].sort();
    const grupos = [];                                       // fornecedores nomeados pelo gestor (valem quando o final da linha é o valor dele)
    if ((da === 'GESTOR' || da === 'OUTRO') && Math.abs(l.vf) > 0.005 && !pct)
      (orcPor[k] || []).forEach(o => {
        const z = FM.casa(o), fk = z.fk; if (fk === 'G') return;
        const fc = z.fc, ch = fc.length ? fc.join('+') : (fk === 'A' ? 'A:' + fmNz(z.fn || o.f) : 'N:' + fmNz(o.f));
        let g = grupos.find(x => x.ch === ch); if (!g) grupos.push(g = { ch, nome: o.f, fs: fc, m: z12(), fk, fn: z.fn, fa: z.fa });
        g.m = add(g.m, o.m);
      });
    const usados = new Set(); grupos.forEach(g => { if (g.fk === 'L') g.fs.forEach(f => usados.add(f)); });
    const ocF = oc[k], LR = [], nomeadosFs = new Set(); let nomeado = z12();
    for (const g of grupos) {
      const r4 = g.fk === 'L' ? g.fs.reduce((a, f) => add(a, H.get(f) || zM()), zM()) : zM();
      let m = g.m.slice(); if (ocF && g.fs.includes(ocF)) m = add(m, ctM(ctDe(ocF)));
      LR.push({ fs: g.fs, nome: g.fs.length === 1 ? (nome[g.fs[0]] || g.fn || g.nome) : (g.fn || g.nome), gnome: g.nome, c, s, r: r4, o: m, og: 'GESTOR', fk: g.fk, fa: g.fa, cts: g.fs.flatMap(ctDe), l });
      if (g.fk !== 'N') { nomeado = add(nomeado, m); g.fs.forEach(f => nomeadosFs.add(f)); }   // nome sem correspondência NÃO sai do saldo da conta (pode ser um dos fornecedores dela)
    }
    if (ocF && da === 'OUTRO' && !usados.has(ocF) && !grupos.some(g => g.fs.includes(ocF))) {
      const cts = ctDe(ocF), m = ctM(cts);
      LR.push({ fs: [ocF], nome: nome[ocF] || ocF, c, s, r: H.get(ocF) || zM(), o: m, og: 'CONTRATO', cts, l });
      usados.add(ocF); nomeado = add(nomeado, m); nomeadosFs.add(ocF);
    }
    const saldo = l.mf.map((v, i) => v - nomeado[i]);
    let histNomeado = 0, histNT = 0; usados.forEach(f => { const h = soma(H.get(f) || []) * fator * (1 + pa); histNomeado += h; if (!bens([f]).length) histNT += h; });
    // conta de benefício da folha: o saldo precisa cobrir o SIMULADOR (menos os benefícios dos fornecedores nomeados); senão, o histórico
    const P = simTot > 0.005 ? { saldo, esperado: Math.max(0, simTot - soma(bens(nomeadosFs), b => soma(simL[b])) - histNT), espF: FM_SIMF }
      : { saldo, esperado: histModel ? l.mo - histNomeado : null, espF: 'histórico' };
    for (const [f, r4] of H) {
      if (!f || usados.has(f)) continue;
      const cts = ctDe(f), base = soma(r4) * fator * (1 + pa); let og, o;
      if (pct) { og = 'PCT'; o = null; }
      else if (da === 'CONTRATO' && cts.length) { og = 'CONTRATO'; o = ctM(cts); }
      else if (da === 'MODELO' || da === 'CONTRATO') {
        if (histModel && Math.abs(l.mo) > 0.005) { og = 'MODELO'; o = l.mm.map(v => base * v / l.mo); }
        else if (histModel) { og = 'MODELO'; o = z12(); }
        else { og = 'DRIVER'; o = null; }
      } else { og = 'CONTA'; o = null; }
      LR.push({ fs: [f], nome: nome[f] || f, c, s, r: r4, o, og, cts, l });
    }
    for (const [f, cts] of CL) {                             // contrato fixo com valor em 2027 e sem histórico na linha
      if (H.has(f) || usados.has(f) || grupos.some(g => g.fs.includes(f))) continue;
      const m = ctM(cts); if (Math.abs(soma(m)) < 0.005) continue;
      LR.push({ fs: [f], nome: nome[f] || f, c, s, r: zM(), o: da === 'CONTRATO' ? m : null, og: da === 'CONTRATO' ? 'CONTRATO' : 'CONTA', cts, l, soCt: true });
    }
    const gemC = gemDe(c), Hg = gemC ? A.porLinha.get(s + '|' + gemC) : null;
    for (const x of LR) {                                    // campos de base de cada linha do painel
      const r4 = x.r, rg = x.rg = Hg ? x.fs.reduce((a, f) => add(a, Hg.get(f) || zM()), zM()) : zM();
      x.nm = r4.filter((v, i) => Math.abs(v) > 0.005 || Math.abs(rg[i]) > 0.005).length; x.rec = x.nm >= minRec; x.nmc = r4.filter(v => Math.abs(v) > 0.005).length;
      x.jan = soma(r4); x.hist = x.jan * fator * (1 + pa);
      const ctm = x.cts.length ? ctM(x.cts) : null;
      x.ct = ctm ? soma(ctm) : null; x.esp = x.cts.length ? x.ct : (x.rec ? x.hist : null); x.espF = x.cts.length ? 'contrato' : (x.rec ? 'histórico' : '');
      x.nec = x.cts.length ? ctm : (x.rec ? Array(12).fill(x.hist / 12) : null);
      const bs = bens(x.fs); x.sim = false; x.simG = false; x.totG = 0;
      if (bs.length && soma(bs, b => soma(simL[b])) > 0.005) {   // benefício da folha: o esperado é o do simulador (quadro da área × valor por pessoa)
        const sf = bs.reduce((a, b) => add(a, simL[b]), z12());
        x.sim = true; x.simB = bs; x.esp = soma(sf); x.espF = FM_SIMF; x.nec = sf;
        x.simH = (x.jan + soma(rg)) * fator * (1 + pa);          // histórico anualizado (conta + gêmea de custo), para comparar com o simulador
      }
      x.tot = x.o ? soma(x.o) : null; x.cob = null; x.vazios = []; x.P = P;
      x.k = x.fs.length ? x.fs.join('+') : 'N:' + fmNz(x.nome);
      rows.push(x);
    }
    const idn = og => soma(LR.filter(x => x.og === og && x.fk !== 'N'), x => x.tot || 0);
    if (pct) comp.PCT += l.vf;
    else { const a = idn('CONTRATO'), b = idn('GESTOR'), m = idn('MODELO'); comp.CONTRATO += a; comp.GESTOR += b; comp.MODELO += m;
      comp[da === 'GESTOR' || da === 'OUTRO' ? 'CONTA' : 'SEM'] += l.vf - a - b - m; }
  }
  // benefício da folha lançado também na conta gêmea de custo (3110301): a parcela soma na cobertura da linha da conta do benefício
  const idx = new Map(); rows.forEach(x => { const q = x.k + '|' + x.s + '|' + x.c; (idx.get(q) || idx.set(q, []).get(q)).push(x); });
  rows.forEach(x => { if (x.sim) (idx.get(x.k + '|' + x.s + '|' + gemDe(x.c)) || []).forEach(y => { if (!y.o) return; x.totG += soma(y.o); y.simG = true; y.simDe = x.c; y.esp = null; y.espF = ''; y.nec = null; }); });
  for (const x of rows) {                                    // situação
    const l = x.l, P = x.P, saldo = P.saldo, ctt = x.ct;
    const dec = !!l.de, ctDec = x.cts.some(q => ['ENCERRA', 'NOVO', 'RENEGOCIA'].includes(q.acao || '') || q.mes_acao);
    const vaz = a => a.map((v, i) => v < 0.005 && v > -0.005 ? i : -1).filter(i => i >= 0);
    const cob = () => x.esp && x.esp > 0.005 ? (x.tot + x.totG) / x.esp : null;
    let sit;
    if (x.og === 'PCT' || x.og === 'DRIVER') sit = 'PCT';
    else if (x.fk === 'N') sit = 'SEM_COR';
    else if (!x.soCt && !(x.tot && Math.abs(x.tot) > 0.005) && (Math.abs(x.jan) < 0.005 || (x.og === 'CONTA' && x.jan < 0))) sit = 'AJUSTE';   // sem base líquida na janela
    else if (x.cts.length && Math.abs(ctt) < 0.005 && x.og !== 'GESTOR') sit = 'FORA';
    else if (x.og === 'CONTRATO' || x.og === 'GESTOR') {
      x.vazios = vaz(x.o); x.cob = cob();
      if (x.nm === 0) sit = Math.abs(x.tot) > 0.005 ? 'NOVO' : 'AJUSTE';
      else if (x.rec && x.vazios.length > 0 && x.vazios.length < 12) sit = x.og === 'CONTRATO' && ctDec ? 'FORA_P' : 'LAC_MES';
      else if (x.rec && Math.abs(x.tot) < 0.005) sit = dec ? 'FORA' : 'LAC_SEM';
      else if (x.cob != null && x.cob < 1 - tol) sit = 'ABAIXO';
      else sit = x.rec ? 'OK' : 'EVENTUAL';
    } else if (x.og === 'MODELO') {
      x.cob = cob();
      if (Math.abs(x.tot) < 0.005) sit = dec ? 'FORA' : (x.rec ? 'LAC_SEM' : 'EVENTUAL');
      else if (x.jan < -0.005) sit = 'EV_MOD';               // crédito (estorno) na janela projetado pelo modelo como recorrente
      else if ((x.cts.length || x.sim) && x.cob != null && x.cob < 1 - tol) sit = 'ABAIXO';
      else sit = x.rec ? 'OK' : 'EV_MOD';
    } else {                                                 // CONTA
      const st = soma(saldo), es = P.esperado;
      x.cob = es && es > 0.005 ? st / es : null; x.vazios = saldo.map((v, i) => v < 0.005 ? i : -1).filter(i => i >= 0);
      if (!x.rec && !x.soCt) sit = 'EVENTUAL';
      else if (st < 0.005) sit = dec && Math.abs(l.vf) < 0.005 ? 'FORA' : 'LAC_SEM';
      else if (x.cob != null && x.cob < 1 - tol) sit = x.vazios.length > 0 && x.vazios.length < 12 ? 'LAC_MES' : 'ABAIXO';
      else sit = 'OK';                                       // coberta no ano; mês sem saldo aparece na grade (tracejado vermelho) e no detalhe
    }
    x.sit = sit; x.g = FM_SIT[sit].g;
    x.simAc = !!(x.sim && x.rec && x.simH > x.esp * (1 + tol));   // histórico do benefício acima do que o simulador prevê para a área
    // quanto falta (para ordenar e para os cartões)
    x.falta = sit === 'LAC_SEM' ? (x.esp ?? x.hist) : sit === 'LAC_MES' ? (x.nec ? soma(x.vazios, i => x.nec[i]) : 0)
      : sit === 'ABAIXO' && x.esp != null && x.cob != null ? x.esp * (1 - x.cob) : 0;
  }
  const peso = {}; rows.forEach(x => peso[x.k] = (peso[x.k] || 0) + Math.max(Math.abs(x.esp || 0), Math.abs(x.tot || 0), Math.abs(x.hist || 0)));
  rows.forEach(x => x.peso = peso[x.k]);
  FM.rows = rows; FM.comp = comp; FM.tol = tol; FM.totFinal = soma(D.linhas.filter(l => vis.has(l.s)), l => l.vf);
  return rows;
}

/* ------------------------------------------------------------------ leitura em português (por que a linha está nesta situação) */
function fmLeitura(x) {
  const l = x.l, A = fmAgrega(), nM = A.meses.length, P = x.P, tolTxt = pc(FM.tol), mes = i => MESES[i] + '/27';
  const rec = `faturou em ${x.nm} de ${nM} meses da janela (${rs(x.jan)}${x.nmc !== x.nm ? `; ${x.nmc} nesta conta, o restante na conta gêmea de custo/despesa` : ''})`;
  const conta = P.esperado != null && P.esperado > 0.005 ? (P.espF === FM_SIMF ? `O saldo da conta sem fornecedor nomeado é ${rs(soma(P.saldo))} para ${rs(P.esperado)} previstos no simulador de folha para esta área (${pc(x.cob, 0)}).`
    : `O saldo da conta sem fornecedor nomeado é ${rs(soma(P.saldo))} para um histórico de ${rs(P.esperado)} a cobrir (${pc(x.cob, 0)}).`) : `O saldo da conta sem fornecedor nomeado é ${rs(soma(P.saldo))}.`;
  switch (x.sit) {
    case 'LAC_SEM': return x.og === 'MODELO' ? `Fornecedor recorrente — ${rec} — e a linha ficou com valor zero no orçado final.`
      : Math.abs(l.vf) < 0.005 ? `Fornecedor recorrente — ${rec} — e a conta não tem valor orçado para 2027 nesta área. Esperado pelo ${x.espF}: ${rs(x.esp ?? x.hist)}.`
      : `${x.soCt ? 'Contrato fixo com valor em 2027 e sem lançamento na janela' : `Fornecedor recorrente — ${rec}`}. Todo o orçado da conta (${rs(l.vf)}) está em outros fornecedores que o gestor nomeou: não sobra valor para este. Esperado pelo ${x.espF || 'histórico'}: ${rs(x.esp ?? x.hist)}.`;
    case 'LAC_MES': return x.o ? `Fornecedor recorrente — ${rec}. O orçado tem ${x.vazios.length} mês(es) sem valor: ${x.vazios.map(mes).join(', ')}.`
      : `Fornecedor recorrente — ${rec}. O gestor orçou a conta só em parte do ano (sem valor em ${x.vazios.map(mes).join(', ')}) e o total não cobre o histórico. ${conta}`;
    case 'ABAIXO': return x.o ? `Orçado ${rs(x.tot + x.totG)}${x.totG ? ` (${rs(x.tot)} nesta conta + ${rs(x.totG)} na conta gêmea de custo)` : ''} para um esperado de ${rs(x.esp)} pelo ${x.espF} — cobre ${pc(x.cob, 0)} (a tolerância do modelo é ${tolTxt}).${x.og !== 'MODELO' ? '' : x.sim ? ' A linha é decidida pelo modelo, que projeta o histórico da janela; o simulador calcula o benefício pelo quadro atual da área.' : ' A linha é decidida pelo modelo, que usa a média da janela inteira; o contrato usa a média dos meses com nota.'}`
      : `O gestor orçou a conta sem nomear fornecedores. ${conta} Este fornecedor precisa de ${rs(x.esp ?? x.hist)} no ano pelo ${x.espF}.`;
    case 'NOVO': return x.fk === 'A' ? `O gestor escreveu “${esc(x.gnome)}”, identificado como ${esc(x.nome)}. Tem valor em 2027 (${rs(x.tot)}) e nenhum lançamento deste fornecedor em jul–out/26.${fmApObs(x.fa)}`
      : x.fk === 'B' ? `O gestor orçou este fornecedor nesta conta (${rs(x.tot)}), mas o histórico dele em jul–out/26 está em outra conta ou área — conferir se a conta do orçado é a mesma do lançamento.`
      : `Tem valor em 2027 (${rs(x.tot)}) e nenhum lançamento em jul–out/26 nesta conta e área.`;
    case 'SEM_COR': return `O gestor escreveu “${esc(x.gnome)}” e não há fornecedor com esse nome na base (pode ser nome fantasia ou nome antigo). O valor (${rs(x.tot)}) continua contando no saldo da conta.${x.fa ? fmApObs(x.fa) : ' Para amarrar: pesquisar o nome nos históricos do razão do ano e confirmar o apelido do fornecedor.'}`;
    case 'EV_MOD': return x.jan < 0 ? `A base deste fornecedor na janela é um crédito (estorno) de ${rs(x.jan)}. A linha é decidida pelo MODELO, que o projeta como recorrente: ${rs(x.tot)} em 2027. Conferir se cabe normalizar (ajuste gerencial).`
      : `Só ${x.nm} mês(es) com lançamento na janela (${rs(x.jan)}), mas a linha é decidida pelo MODELO, que anualiza a janela (× ${D.meta.fator || 3}) e aplica ${pc(l.pa || 0)}: vira ${rs(x.tot)} em 2027. Se não for recorrente, cabe normalizar (ajuste gerencial).`;
    case 'OK': return x.og === 'CONTRATO' ? `Contrato fixo e linha decidida por contrato: ${rs(x.tot)} em 2027.`
      : x.og === 'GESTOR' ? `O gestor nomeou o fornecedor: ${rs(x.tot)} em 2027${x.cob != null ? ` (${pc(x.cob, 0)} do esperado pelo ${x.espF})` : ''}.`
      : x.og === 'MODELO' ? `Linha decidida pelo MODELO: histórico do fornecedor (${rs(x.jan)} na janela × ${D.meta.fator || 3}) + ${pc(l.pa || 0)} = ${rs(x.tot)}.${x.sim && x.cob != null ? ` ${x.totG ? `Com ${rs(x.totG)} da conta gêmea de custo, cobre` : 'Cobre'} ${pc(x.cob, 0)} do previsto no simulador de folha (${rs(x.esp)}).` : ''}`
      : `O gestor orçou a conta sem nomear fornecedores. ${conta} Este fornecedor está dentro desse valor.${x.vazios.length ? ` <b>Atenção:</b> a conta não tem valor em ${x.vazios.map(mes).join(', ')} — no acompanhamento mensal de 2027 esses meses vão aparecer acima do orçado.` : ''}`;
    case 'FORA': { const ctN = x.cts.find(q => /^N/.test(q.existe_2027 || '') || ctAcao(q) === 'ENCERRA');
      if (l.de && Math.abs(l.vf) < 0.005) return `A Controladoria decidiu esta linha com valor zero em 2027 (decisão ${esc(l.de)}${l.co ? ': ' + esc(l.co) : ''}).`;
      if (ctN) return `O contrato deste fornecedor nesta conta não existe em 2027: ${esc(ctN.existe_2027 || ctN.justificativa || 'encerrado')}.`;
      return `O contrato deste fornecedor nesta conta está com valor zero em 2027${x.cts[0] && x.cts[0].fonte_valor ? ' (' + esc(x.cts[0].fonte_valor) + ')' : ''}.`; }
    case 'FORA_P': return `Contrato com mudança decidida em 2027 (${esc(x.cts.map(q => (q.acao || 'ENCERRA') + (q.mes_acao ? ' no mês ' + q.mes_acao : '')).join('; '))})${x.cts[0] && x.cts[0].justificativa ? ': ' + esc(x.cts[0].justificativa) : ''}.`;
    case 'EVENTUAL': return `Só ${x.nm} mês(es) com lançamento na janela (${rs(x.jan)}): não é tratado como recorrente.`;
    case 'PCT': return `A linha é orçada por % do faturamento (regra do modelo): o valor não é definido por fornecedor.`;
    default: return `O histórico nesta conta soma zero (ou crédito) na janela — ajuste gerencial (reclassificação ou normalização) ou estorno. Não há base a cobrir.`;
  }
}

/* ------------------------------------------------------------------ tela */
function fmApObs(fa) {                                     // observação do(s) apelido(s) confirmado(s): quem confirmou e o que conferir
  const ap = {}; ((typeof CEN !== 'undefined' && CEN.ap) || []).forEach(a => ap[a.id] = a);
  return String(fa || '').split(' / ').map(k => ap[k]).filter(Boolean).map(a => ` <i>Apelido informado por ${esc(a.fonte || a.atualizado_por || 'Controladoria')}.${a.observacao ? ' ' + esc(a.observacao) : ''}</i>`).join('');
}
function fmCel(cls, txt, tit) { return `<td class="c"><span class="fm-c ${cls}"${tit ? ` title="${esc(tit)}"` : ''}>${txt}</span></td>`; }
function fmCels27(x) {
  const f = v => fmt(v, { zero: '0' }), tol = FM.tol;
  if (x.sit === 'PCT') return MESES.map(() => fmCel('vz', '%')).join('');
  if (x.sit === 'FORA' || x.sit === 'AJUSTE') return MESES.map(() => fmCel('vz', '—')).join('');
  if (x.o) {
    const cls = FM_OG[x.og].cel;
    return x.o.map((v, i) => Math.abs(v) >= 0.005 ? fmCel(cls, f(v), `${MESES[i]}/27 · ${FM_OG[x.og].t}: ${rs(v)}`)
      : x.sit === 'LAC_MES' || x.sit === 'LAC_SEM' ? fmCel('nl', '✕', `${MESES[i]}/27 · sem valor`) : fmCel('vz', x.sit === 'FORA_P' ? '—' : '·')).join('');
  }
  if (!x.nec) return MESES.map(() => fmCel('vz', '·')).join('');
  const parcial = x.cob != null && x.cob < 1 - tol;
  return x.nec.map((v, i) => {
    const sem = x.P.saldo[i] < 0.005, cls = sem ? 'nl' : parcial ? 'np' : 'nc';
    return fmCel(cls, Math.abs(v) < 0.005 ? '·' : f(v), `${MESES[i]}/27 · necessidade pelo ${x.espF}: ${rs(v)} · saldo da conta no mês: ${rs(x.P.saldo[i])}`);
  }).join('');
}
function fmFiltra() {
  const f = est.f, busca = fmNz(f.fmBusca || '');
  const base = FM.rows.filter(x => (!f.fmArea || x.s === f.fmArea) && (!busca || fmNz(`${x.nome} ${x.gnome || ''} ${x.fs.join(' ')} ${x.c} ${D.contaDesc[x.c] || ''}`).includes(busca)));
  let L = base;
  if (f.fmOg) L = L.filter(x => (x.og === 'DRIVER' ? 'PCT' : x.og) === f.fmOg && x.g !== 'aj');
  if (f.fmGrp) L = L.filter(x => x.g === f.fmGrp);
  else if (!f.fmOg && !busca) L = L.filter(x => !FM_FORA_PRINCIPAL.has(x.g));
  const ord = f.fmOrd || (f.fmGrp === 'lac' || f.fmGrp === 'abx' ? 'falta' : 'peso');
  L = L.slice().sort(ord === 'falta' ? (a, b) => b.falta - a.falta || b.peso - a.peso
    : ord === 'nome' ? (a, b) => a.nome.localeCompare(b.nome) || a.c.localeCompare(b.c) || a.s.localeCompare(b.s)
    : ord === 'conta' ? (a, b) => a.c.localeCompare(b.c) || a.s.localeCompare(b.s) || b.peso - a.peso
    : (a, b) => b.peso - a.peso || a.k.localeCompare(b.k) || Math.abs(b.esp || b.tot || b.hist || 0) - Math.abs(a.esp || a.tot || a.hist || 0));
  return { base, L };
}
function telaFornMes() {
  if (!RAZAO) { carregaRazao().then(() => est.tela === 'forn_mes' && desenha()).catch(e => $('tela').innerHTML = `<div class="aviso">${esc(e.message)}</div>`); return '<div class="status">Carregando o razão…</div>'; }
  if (CTR.versao !== est.versao) { setTimeout(() => ctCarrega().then(() => { if (est.tela === 'forn_mes') CTR.versao === est.versao ? desenha() : setTimeout(desenha, 250); }), 0); return '<div class="status">Carregando os contratos da versão ' + esc(est.versao) + '…</div>'; }
  if (typeof cenCarregaApelidos === 'function' && !CEN.apPronto) { cenCarregaApelidos().then(() => est.tela === 'forn_mes' && desenha()); return '<div class="status">Carregando os apelidos de fornecedor…</div>'; }
  fmMonta();
  const f = est.f, A = fmAgrega(), { base, L } = fmFiltra(); FM.vis = L;
  const apErro = typeof CEN !== 'undefined' ? CEN.apErro : null;
  const grp = g => base.filter(x => x.g === g), nForn = a => new Set(a.map(x => x.k)).size;
  const principal = base.filter(x => !FM_FORA_PRINCIPAL.has(x.g));
  const espTot = soma(principal, x => x.esp || 0), ident = FM.comp.CONTRATO + FM.comp.GESTOR + FM.comp.MODELO;
  const lac = grp('lac'), abx = grp('abx'), novo = grp('novo'), evm = grp('evm'), ok = grp('ok');
  const faltaAbx = (() => { const vistas = new Set(); let t = 0; abx.forEach(x => { if (x.o) t += x.falta; else { const k = x.s + '|' + x.c; if (!vistas.has(k) && x.P.esperado != null) { vistas.add(k); t += Math.max(0, x.P.esperado - soma(x.P.saldo)); } } }); return t; })();
  const kp = (k, lab, val, meta, cls = '') => `<button class="kpi ${cls} ${(f.fmGrp || '') === k ? 'sel' : ''}" data-fmcard="${k}"><div class="lab">${lab}</div><div class="val">${val}</div><div class="meta">${meta}</div></button>`;
  const segs = ['CONTRATO', 'GESTOR', 'MODELO', 'CONTA', 'PCT', 'SEM'].map(k => ({ k, v: FM.comp[k], p: div(FM.comp[k], FM.totFinal) || 0 }));
  const legTxt = { CONTRATO: 'Contrato', GESTOR: 'Gestor nomeou o fornecedor', MODELO: 'Modelo, por fornecedor', CONTA: 'Conta do gestor, sem fornecedor (inclui folha)', PCT: '% do faturamento', SEM: 'Modelo sem fornecedor (folha, provisões)' };
  const areas = [...new Set(FM.rows.map(x => x.s))].sort();
  const chip = (g, t) => { const n = grp(g).length; return `<button class="chip ${f.fmGrp === g ? 'on' : ''}" data-fmcard="${g}">${t}<small>${n}</small></button>`; };
  const nM = A.meses.length, h27 = MESES.map((m, i) => `<th class="n ${i ? '' : 'fm-d'}">${m}</th>`).join('');
  let ant = null; const nLin = {}; L.forEach(x => nLin[x.k] = (nLin[x.k] || 0) + 1);
  const linhas = L.slice(0, 400).map((x, i) => {
    const prim = x.k !== ant; ant = x.k;
    const sub = (x.fs.length === 1 ? x.fs[0].slice(1) : x.fs.length ? `${x.fs.length} CNPJs` : x.fk === 'A' ? 'CNPJ a localizar' : 'nome digitado pelo gestor') + (x.fa && x.gnome && x.fk !== 'N' ? ` · “${x.gnome}”` : '');
    const tipo = (x.cts[0] && x.cts[0].tipo_pj && x.cts[0].tipo_pj !== '—') ? ' · ' + x.cts[0].tipo_pj : '';
    const pad = x.r.map((v, j) => `<i class="${Math.abs(v) > 0.005 ? (v < 0 ? 'n' : 'p') : Math.abs(x.rg[j]) > 0.005 ? 'g' : ''}" title="${fmMes26(A.meses[j])}: ${rs(v)}${Math.abs(v) < 0.005 && Math.abs(x.rg[j]) > 0.005 ? ' · lançado na conta gêmea (custo/despesa): ' + rs(x.rg[j]) : ''}"></i>`).join('');
    const og = FM_OG[x.og], st = FM_SIT[x.sit];
    const totTxt = x.tot != null ? fmt(x.tot, { zero: '0' }) : x.og === 'CONTA' ? '<small class="fm-m">na conta</small>' : '—';
    const cobCls = x.cob == null ? '' : x.cob < 1 - FM.tol ? (x.cob < 0.005 ? 'down' : 'warn') : '';
    return `<tr class="clic ${prim ? 'fm-sep' : ''}" data-fm="${i}">
      <td class="fx fm-f">${prim ? `<div class="fm-n" title="${esc(x.nome)}">${esc(x.nome)}<small>${esc(sub)}${esc(tipo)}${nLin[x.k] > 1 ? ` · ${nLin[x.k]} linhas` : ''}</small></div>` : ''}
        <div class="fm-s" title="${esc(x.s)} · ${esc(x.c)} ${esc(D.contaDesc[x.c] || '')}">${prim ? '' : '<span class="fm-e">↳</span> '}<b>${esc(x.s)}</b> · ${esc(x.c)} ${esc(D.contaDesc[x.c] || '')}</div></td>
      <td class="nw"><span class="tag ${st.c}" title="${esc(st.tl)}">${esc(st.t)}</span><div class="fm-og" title="${esc(og.d)}"><i class="${x.og === 'CONTA' ? 'fm-hx' : ''}" style="${x.og === 'CONTA' ? '' : 'background:' + og.cor}"></i>${esc(og.t)}</div></td>
      <td class="n" title="${x.esp != null ? rs(x.esp) + ' · pelo ' + x.espF : ''}">${x.esp != null ? fmt(x.esp, { zero: '0' }) : '—'}${x.espF === 'contrato' ? '<sup class="fm-m" title="esperado = contrato">c</sup>' : x.espF === FM_SIMF ? '<sup class="fm-m" title="esperado = simulador de folha (benefício gerido pelo RH, rateado por área)">f</sup>' : ''}${x.simAc ? `<sup class="fm-up" title="histórico anualizado deste fornecedor nesta área: ${rs(x.simH)} — acima do simulador">▲</sup>` : ''}</td>
      <td class="n" title="${x.tot != null ? rs(x.tot) : ''}">${totTxt}</td>
      <td class="n ${cobCls}" title="${x.og === 'CONTA' ? (x.P.espF === FM_SIMF ? 'cobertura da conta: saldo sem fornecedor nomeado ÷ previsto no simulador de folha' : 'cobertura da conta: saldo sem fornecedor nomeado ÷ histórico que ele precisa cobrir') : x.totG ? 'orçado (conta + gêmea de custo) ÷ esperado' : 'orçado ÷ esperado'}">${x.cob != null ? pc(x.cob, 0) : '—'}</td>
      <td class="fm-d nw"><span class="fm-p">${pad}</span></td><td class="n" title="${rs(x.jan)} em ${x.nm} de ${nM} meses">${fmt(x.jan / nM)}</td>
      ${fmCels27(x).replace('<td class="c">', '<td class="c fm-d">')}</tr>`;
  }).join('');
  return `${cabecalho('Fornecedores × meses — orçado 2027', 'Cada linha é um fornecedor numa conta e numa área: à esquerda o que ele faturou de jul a out/26; à direita o que está orçado para ele em 2027, mês a mês, e de onde vem esse valor. Serve para achar <b>lacunas</b>: fornecedor recorrente sem orçado, mês sem valor, conta orçada abaixo do histórico.',
    `<div class="filtros" style="margin-left:auto"><span class="rot">Área</span><select id="fmArea"><option value="">Todas as visíveis</option>${areas.map(a => `<option ${a === f.fmArea ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
     <span class="rot">Ordem</span><select id="fmOrd">${[['peso', 'Maior fornecedor'], ['falta', 'Maior valor em falta'], ['nome', 'Nome'], ['conta', 'Conta']].map(([v, t]) => `<option value="${v}" ${(f.fmOrd || (f.fmGrp === 'lac' || f.fmGrp === 'abx' ? 'falta' : 'peso')) === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
     <input id="fmBusca" placeholder="Fornecedor, CNPJ ou conta" value="${esc(f.fmBusca || '')}" style="width:200px"></div>`)}
  ${apErro ? `<div class="aviso">${esc(apErro)}</div>` : ''}
  <div class="card"><h3>Quanto do orçado de 2027 tem fornecedor identificado <small>${rsC(FM.totFinal)} de despesas no orçado final · ${rsC(ident)} (${pc(div(ident, FM.totFinal))}) com fornecedor</small></h3>
    <div class="csub">Clique numa faixa para ver só os fornecedores daquela origem. A soma das faixas é o orçado final${f.fmArea ? '' : ' da empresa'}: nada fica de fora.</div>
    <div class="fm-barra">${segs.filter(s => s.v > 0.5).map(s => `<button class="${s.k === 'CONTA' ? 'fm-hx' : ''} ${f.fmOg === s.k ? 'sel' : ''}" style="width:${(s.p * 100).toFixed(2)}%;${s.k === 'CONTA' ? '' : 'background:' + FM_OG[s.k].cor}" ${s.k === 'SEM' ? 'disabled' : `data-fmog="${s.k}"`} title="${esc(legTxt[s.k])}: ${rs(s.v)} (${pc(s.p)})"></button>`).join('')}</div>
    <div class="legend" style="margin-top:9px">${segs.filter(s => s.v > 0.5).map(s => `<i><span class="sw ${s.k === 'CONTA' ? 'fm-hx' : ''}" style="${s.k === 'CONTA' ? '' : 'background:' + FM_OG[s.k].cor}"></span>${legTxt[s.k]} <b style="color:var(--ink)">${rsC(s.v)}</b> · ${pc(s.p)}</i>`).join('')}</div></div>
  <section class="kpis">
    ${kp('', 'Fornecedores no painel', nForn(principal), `${principal.length} linha(s) fornecedor × conta × área · esperado ${rsC(espTot)}`)}
    ${kp('lac', 'Lacunas', lac.length, `${nForn(lac)} fornecedor(es) · ${rsC(soma(lac, x => x.falta))} sem orçado (${pc(div(soma(lac, x => x.falta), espTot))} do esperado)`, 'k1')}
    ${kp('abx', 'Abaixo do esperado', abx.length, `${nForn(abx)} fornecedor(es) · faltam ${rsC(faltaAbx)} (${pc(div(faltaAbx, espTot))} do esperado)`, 'k3')}
    ${kp('novo', 'Novos e sem correspondência', novo.length, `${rsC(soma(novo, x => x.tot || 0))} orçado sem histórico (${pc(div(soma(novo, x => x.tot || 0), ident))} do identificado)`, 'k2')}
    ${kp('evm', 'Eventual projetado pelo modelo', evm.length, `${rsC(soma(evm, x => x.tot || 0))} em 2027 por anualização (${pc(div(soma(evm, x => x.tot || 0), FM.comp.MODELO))} do modelo por fornecedor)`, 'k3')}
    ${kp('ok', 'Cobertos', ok.length, `${nForn(ok)} fornecedor(es) · esperado ${rsC(soma(ok, x => x.esp || 0))} (${pc(div(soma(ok, x => x.esp || 0), espTot))})`, 'k4')}
  </section>
  <div class="card"><h3>${f.fmGrp ? esc({ lac: 'Lacunas', abx: 'Abaixo do esperado', novo: 'Novos e sem correspondência', evm: 'Eventual projetado pelo modelo', ok: 'Cobertos', ev: 'Eventuais', pct: '% do faturamento', fora: 'Fora de 2027 por decisão', aj: 'Sem base líquida na janela' }[f.fmGrp]) : 'Fornecedores recorrentes, novos e achados'}${f.fmOg ? ' · ' + esc(FM_OG[f.fmOg].t) : ''} <small>${L.length} linha(s) · ${nForn(L)} fornecedor(es)</small></h3>
    <div class="chips" style="margin:6px 0 10px"><span class="fm-m" style="font-size:11px">Fora da leitura principal:</span>${chip('ev', 'Eventuais')}${chip('pct', '% do faturamento')}${chip('fora', 'Fora de 2027 por decisão')}${chip('aj', 'Sem base líquida')}
      ${f.fmGrp || f.fmOg || f.fmBusca || f.fmArea ? '<button class="chip" id="fmLimpa">✕ limpar filtros</button>' : ''}</div>
    <div class="fm-leg"><span><i class="fm-c ct">12,3</i> contrato</span><span><i class="fm-c ge">12,3</i> gestor nomeou</span><span><i class="fm-c mo">12,3</i> modelo (histórico + inflação)</span>
      <span><i class="fm-c nc">12,3</i> necessidade coberta pela conta</span><span><i class="fm-c np">12,3</i> conta cobre só parte</span><span><i class="fm-c nl">12,3</i> sem orçado no mês</span><span><i class="fm-c nl">✕</i> mês sem valor</span>
      <span class="fm-m">Preenchido = valor orçado para o fornecedor. Tracejado = o gestor orçou a conta sem dizer o fornecedor: o número é a necessidade dele (contrato, simulador de folha ou histórico + inflação), não soma no orçado. Valores em ${uniTxt()}${est.uni === 'R$' ? ' — em R$ mil (seletor Unidade, no topo) a grade inteira cabe na tela' : ''}.</span></div>
    <div class="tw" style="margin-top:8px"><table class="t fm" id="fmTab"><thead>
      <tr><th class="fx" rowspan="2">Fornecedor · área · conta</th><th rowspan="2">Situação · de onde vem</th><th class="n" rowspan="2">Esperado<br>2027</th><th class="n" rowspan="2">Orçado<br>2027</th><th class="n" rowspan="2">Cober-<br>tura</th>
        <th colspan="2" class="fm-g fm-d" title="realizado no razão (CT2), líquido dos ajustes gerenciais">${fmMes26(A.meses[0]).split('/')[0]}–${fmMes26(A.meses[nM - 1])}</th><th colspan="12" class="fm-g fm-d">2027 — orçado mês a mês</th></tr>
      <tr class="g2"><th class="fm-d" title="um quadrado por mês da janela: escuro = teve lançamento">meses</th><th class="n" title="total da janela ÷ ${nM} (a média que o modelo projeta)">média/mês</th>${h27}</tr></thead><tbody>
      ${linhas || `<tr><td colspan="19" class="vazio">Nenhum fornecedor neste filtro.</td></tr>`}</tbody></table></div>
    ${L.length > 400 ? `<div class="csub" style="margin-top:8px">Mostrando 400 de ${L.length} linhas — use a busca, a área ou os cartões.</div>` : ''}
    <div class="csub" style="margin-top:8px">Clique numa linha para ver por que ela está nessa situação, o mês a mês da conta e os lançamentos. <b>Esperado</b> = contrato fixo (<sup>c</sup>), simulador de folha (<sup>f</sup> — benefícios geridos pelo RH e rateados por área: refeitório e VR; <span class="fm-up">▲</span> = o histórico está acima do simulador) ou histórico de jul–out/26 anualizado + inflação, só para quem faturou em pelo menos 3 dos 4 meses. <b>Cobertura</b> = orçado ÷ esperado; nas linhas “na conta”, é a da conta inteira.</div></div>`;
}
function posFornMes() {
  const f = est.f;
  const a = $('fmArea'); if (a) a.onchange = e => { f.fmArea = e.target.value || null; desenha(); };
  const o = $('fmOrd'); if (o) o.onchange = e => { f.fmOrd = e.target.value; desenha(); };
  const b = $('fmBusca'); if (b) b.onchange = e => { f.fmBusca = e.target.value; desenha(); };
  const lp = $('fmLimpa'); if (lp) lp.onclick = () => { f.fmGrp = f.fmOg = f.fmBusca = f.fmArea = null; desenha(); };
  document.querySelectorAll('#tela [data-fmcard]').forEach(x => x.onclick = () => { const k = x.dataset.fmcard; f.fmGrp = !k || f.fmGrp === k ? null : k; desenha(); });
  document.querySelectorAll('#tela [data-fmog]').forEach(x => x.onclick = () => { const k = x.dataset.fmog; f.fmOg = f.fmOg === k ? null : k; desenha(); });
  document.querySelectorAll('#fmTab tr[data-fm]').forEach(tr => tr.onclick = () => fmDetalhe(+tr.dataset.fm));
}

/* ------------------------------------------------------------------ detalhe (painel lateral) */
function fmDetalhe(i) {
  const x = FM.vis[i]; if (!x) return;
  const l = x.l, A = fmAgrega(), dic = D.meta.razao.dic, st = FM_SIT[x.sit], og = FM_OG[x.og], P = x.P, iS = dic.setor.indexOf(x.s);
  const lanc = RAZAO.filter(r => x.fs.includes(r[13]) && r[4] === x.c && r[11] === iS).sort((p, q) => p[0] - q[0] || Math.abs(q[6]) - Math.abs(p[6]));
  const outros = FM.rows.filter(y => y.l === l && y !== x).sort((p, q) => Math.abs(q.jan) + Math.abs(q.tot || 0) - Math.abs(p.jan) - Math.abs(p.tot || 0));
  const orcs = (D.orcado || []).filter(o => o.s === x.s && String(o.c) === x.c);
  const caixa = st.c === 'r' ? 'aviso' : st.c === 'g' ? 'ok-box' : 'info';
  const R$ = v => fmt(v, { uni: 'R$', dec: 0, zero: '0' });
  abrePainel(`<div class="pl-top"><div><h3>${esc(x.nome)}</h3><p>${esc(x.c)} ${esc(D.contaDesc[x.c] || '')} · ${esc(x.s)} · ${esc(x.fs.join(', ') || (x.fk === 'A' ? 'CNPJ a localizar' : 'nome digitado pelo gestor'))}${x.fa && x.gnome && x.fk !== 'N' ? ` · o gestor escreveu “${esc(x.gnome)}”` : ''}</p></div><button class="x" data-fecha>Fechar ✕</button></div>
   <div class="pl-corpo">
    <div class="${caixa}"><b>${esc(st.tl)}.</b> ${fmLeitura(x)}</div>
    ${x.sim ? `<div class="info"><b>Benefício da folha: ${esc(x.simB.join(' + '))}.</b> É gerido pelo RH e rateado por área: cada área paga o equivalente aos seus colaboradores. Por isso o esperado (${rs(x.esp)}) vem do <a href="#folha" data-fecha>simulador de folha</a> — quadro da área × valor por pessoa — e não do contrato nem do histórico. Histórico deste fornecedor nesta área, anualizado: ${rs(x.simH)}${x.simAc ? ` — <b>${pc(x.simH / x.esp - 1, 0)} acima do simulador</b>: conferir o quadro da área e o valor por pessoa do benefício` : ''}.</div>` : ''}
    ${x.simG ? `<div class="info"><b>Benefício da folha.</b> O simulador de folha prevê este benefício na conta de despesa (${esc(x.simDe)}); o orçado desta conta de custo entra na cobertura daquela linha.</div>` : ''}
    <div class="kpis"><div class="kpi k5"><div class="lab">Realizado jul–out/26</div><div class="val">${R$(x.jan)}</div><div class="meta">${x.nm} de ${A.meses.length} meses com lançamento</div></div>
      <div class="kpi k2"><div class="lab">Esperado 2027</div><div class="val">${x.esp != null ? R$(x.esp) : '—'}</div><div class="meta">${x.espF ? 'pelo ' + x.espF : 'não recorrente: sem expectativa'}</div></div>
      <div class="kpi k4"><div class="lab">Orçado 2027 (${esc(og.t)})</div><div class="val">${x.tot != null ? R$(x.tot) : 'na conta'}</div><div class="meta">${esc(og.d)}</div></div>
      <div class="kpi k3"><div class="lab">Cobertura</div><div class="val">${x.cob != null ? pc(x.cob, 0) : '—'}</div><div class="meta">${x.og === 'CONTA' ? (P.espF === FM_SIMF ? 'da conta inteira (saldo ÷ simulador de folha)' : 'da conta inteira (saldo ÷ histórico a cobrir)') : x.totG ? 'orçado (conta + gêmea de custo) ÷ esperado' : 'orçado ÷ esperado'}</div></div></div>
    <h4 style="margin:6px 0 -6px">Mês a mês em 2027 <small style="font-weight:400;color:var(--ink3)">— decisão da linha: ${esc(l.da)}${l.de ? ' (digitada pela Controladoria)' : ''} · orçado final da conta ${rs(l.vf)}</small></h4>
    <div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Linha</th>${MESES.map(m => `<th class="n">${m}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
      ${x.nec ? `<tr><td class="nw">Necessidade deste fornecedor (${esc(x.espF)})</td>${x.nec.map(v => tdN(v, { uni: 'R$' })).join('')}${tdN(soma(x.nec), { uni: 'R$' })}</tr>` : ''}
      ${x.o ? `<tr><td class="nw"><b>Orçado deste fornecedor</b></td>${x.o.map(v => tdN(v, { uni: 'R$' })).join('')}${tdN(x.tot, { uni: 'R$' })}</tr>` : ''}
      <tr><td class="nw">Orçado final da conta nesta área</td>${l.mf.map(v => tdN(v, { uni: 'R$' })).join('')}${tdN(l.vf, { uni: 'R$' })}</tr>
      ${l.da === 'GESTOR' || l.da === 'OUTRO' ? `<tr><td class="nw">Saldo da conta sem fornecedor nomeado</td>${P.saldo.map(v => tdN(v, { uni: 'R$', cls: v < 0.005 ? 'down' : '' })).join('')}${tdN(soma(P.saldo), { uni: 'R$' })}</tr>` : ''}
    </tbody></table></div>
    ${P.esperado != null && (l.da === 'GESTOR' || l.da === 'OUTRO') ? `<div class="csub">${P.espF === FM_SIMF ? 'Previsto no simulador de folha para esta conta e área, menos os benefícios dos fornecedores nomeados' : 'Histórico que o saldo da conta precisa cobrir (modelo da linha menos os fornecedores nomeados)'}: <b>${rs(P.esperado)}</b> · saldo <b>${rs(soma(P.saldo))}</b>.</div>` : ''}
    ${x.cts.length ? `<h4 style="margin:6px 0 -6px">Contrato(s) deste fornecedor nesta conta</h4><div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Contrato</th><th>Situação</th><th>Fim</th><th class="n">Valor mensal 2027</th><th>Ação</th><th>Reajuste</th><th class="n">Total 2027</th><th>Existe em 2027</th></tr></thead><tbody>
      ${x.cts.map(q => `<tr><td class="nw">${esc(q.contrato || q.origem || '—')}</td><td>${esc(q.situacao || '')}</td><td class="nw">${q.fim ? esc(q.fim.split('-').reverse().join('/')) : '—'}</td>${tdN(+q.valor_2027 || 0, { uni: 'R$', dec: 2 })}<td class="nw">${esc(ctAcao(q))}${q.mes_acao ? ' · mês ' + esc(q.mes_acao) : ''}</td><td class="nw">${q.mes_reajuste ? pc(q.pct_reajuste || 0) + ' em ' + MESES[q.mes_reajuste - 1] : '—'}</td>${tdN(soma(ctMeses(q)), { uni: 'R$' })}<td class="w"><small>${esc(q.existe_2027 || '')}</small></td></tr>`).join('')}
      </tbody></table></div><div class="csub">Alterar em <a href="#contratos" data-fecha>Contratos recorrentes</a>. O contrato só entra no orçado final quando a decisão da linha é CONTRATO.</div>` : ''}
    <h4 style="margin:6px 0 -6px">O que o gestor escreveu nesta conta <small style="font-weight:400;color:var(--ink3)">— ${orcs.length} linha(s) do orçamento enviado</small></h4>
    <div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Fornecedor digitado</th><th>Casamento</th><th>Recorrência</th><th class="n">Total 2027</th><th>Arquivo</th></tr></thead><tbody>
      ${orcs.map(o => { const z = FM.casa(o); return `<tr><td>${esc(o.f || '(em branco)')}</td><td>${{ L: '<span class="tag g">fornecedor desta conta</span>', B: '<span class="tag b">fornecedor de outra conta/área</span>', A: '<span class="tag b">apelido confirmado · sem lançamento na janela</span>', N: '<span class="tag y">sem correspondência</span>' }[z.fk] || '<span class="tag">genérico</span>'}${z.fc.some(c => A.nome[c]) ? ` <small style="color:var(--ink3)">${esc(z.fc.map(c => A.nome[c] || c).join(' · '))}</small>` : ''}${z.fa ? `<div style="font-size:11px;color:var(--ink3);margin-top:2px">“${esc(z.fa)}”${z.fn ? ' = ' + esc(z.fn) : ''}.${fmApObs(z.fa)}</div>` : ''}</td><td>${esc(o.rec || '')}</td>${tdN(o.tot, { uni: 'R$' })}<td class="w"><small>${esc(o.arq || '')}</small></td></tr>`; }).join('') || '<tr><td colspan="5" class="vazio">O gestor não orçou esta conta.</td></tr>'}
    </tbody></table></div>
    ${outros.length ? `<h4 style="margin:6px 0 -6px">Outros fornecedores desta conta nesta área <small style="font-weight:400;color:var(--ink3)">— ${outros.length}</small></h4>
    <div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Fornecedor</th><th>De onde vem</th><th class="n">Jul–out/26</th><th class="n">Meses</th><th class="n">Esperado 2027</th><th class="n">Orçado 2027</th><th>Situação</th></tr></thead><tbody>
      ${outros.slice(0, 40).map(y => `<tr><td>${esc(y.nome)}</td><td class="nw">${esc(FM_OG[y.og].t)}</td>${tdN(y.jan, { uni: 'R$' })}<td class="n">${y.nm}</td>${tdN(y.esp, { uni: 'R$' })}${y.tot != null ? tdN(y.tot, { uni: 'R$' }) : '<td class="n">na conta</td>'}<td class="nw"><span class="tag ${FM_SIT[y.sit].c}">${esc(FM_SIT[y.sit].tl)}</span></td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <h4 style="margin:6px 0 -6px">Lançamentos jul–out/26 <small style="font-weight:400;color:var(--ink3)">— ${lanc.length} · razão CT2, somente leitura (inclui ajustes gerenciais)</small></h4>
    <div class="tw solta" style="flex:none"><table class="t"><thead><tr><th>Mês</th><th>Dia</th><th>Lote/Doc</th><th>CC</th><th>Histórico</th><th class="n">D − C</th></tr></thead><tbody>
      ${lanc.slice(0, 200).map(r => `<tr><td class="nw">${fmMes26(r[0])}</td><td>${esc(r[1])}</td><td class="nw">${esc(r[2])}/${esc(r[3])}</td><td>${esc(r[5])}</td><td class="w">${esc(r[7])}</td>${tdN(r[6], { uni: 'R$', dec: 2 })}</tr>`).join('') || '<tr><td colspan="6" class="vazio">Sem lançamento na janela nesta conta e área.</td></tr>'}
    </tbody></table></div>
   </div>`);
}

/* ------------------------------------------------------------------ instalação (chamada pelo orcamento.js antes de inicia()) */
function instalaOrcFornecedores() {
  if (window.__orcFm) return; window.__orcFm = true;
  const g = MENU.find(x => x.g === 'orc');
  if (g && !g.itens.some(i => i.id === 'forn_mes')) {
    const it = { id: 'forn_mes', t: 'Fornecedores × meses', ico: '▦', r: CT_CEO };
    const p = g.itens.findIndex(i => i.id === 'contratos');
    g.itens.splice(p >= 0 ? p + 1 : g.itens.length, 0, it);
    ITENS[it.id] = { ...it, g: g.g, gt: g.t };
  }
  TELAS.forn_mes = telaFornMes; POS.forn_mes = posFornMes;
  const css = document.createElement('style');
  css.textContent = `
.fm-barra{display:flex;height:26px;border-radius:7px;overflow:hidden;background:var(--band);gap:2px}
.fm-barra button{border:none;height:100%;min-width:3px;padding:0;cursor:pointer;opacity:.92}
.fm-barra button:hover,.fm-barra button.sel{opacity:1;box-shadow:inset 0 0 0 2px var(--ink)}
.fm-barra button:disabled{cursor:default;box-shadow:none}
.fm-hx{background:repeating-linear-gradient(135deg,#9AA5B4 0 5px,#C4CCD6 5px 10px)}
.fm-leg{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:11.5px;color:var(--ink2);line-height:1.5}
.fm-leg span{display:inline-flex;align-items:center;gap:5px}
.fm-leg i.fm-c{font-style:normal;display:inline-block;min-width:34px}
.fm-m{color:var(--ink3)}
.fm-up{color:var(--neg);font-weight:700;margin-left:1px}
table.fm td{padding:4px 6px;vertical-align:middle}
table.fm td.c{padding:2px 1px}
table.fm th.fm-g{text-align:center}
table.fm .fm-d{border-left:2px solid var(--line)}
table.fm tr.fm-sep td{border-top:1px solid #D5DBE3}
table.fm tbody tr td{border-bottom:none}
.fm-f{min-width:230px;max-width:270px}
.fm-n{font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.fm-n small{font-weight:500;color:var(--ink3);font-size:10.5px;margin-left:6px}
.fm-s{font-size:11px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.fm-e{color:var(--ink3)}
.fm-og{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--ink2);font-weight:500;margin-top:3px}
.fm-og i{width:9px;height:9px;border-radius:2px;display:inline-block}
.fm-p{display:inline-flex;gap:2px;vertical-align:middle}
.fm-p i{width:9px;height:15px;border-radius:2px;background:#E3E7ED;display:inline-block}
.fm-p i.p{background:#5B6472}.fm-p i.n{background:var(--neg)}.fm-p i.g{background:#AEB7C4}
.fm-c{display:block;min-width:40px;height:22px;line-height:22px;border-radius:4px;text-align:right;padding:0 4px;font-size:10.5px;font-variant-numeric:tabular-nums;white-space:nowrap;border:1px solid transparent}
.fm-c.r{background:#EDF0F4;color:#3D4655}.fm-c.r.ng{color:var(--neg)}
.fm-c.ct{background:#DCE9FB;color:#173F78}.fm-c.ge{background:#DDF1E4;color:#14532D}.fm-c.mo{background:#D9EEF2;color:#0B5566}
.fm-c.nc{border:1px dashed #AEB7C4;color:#5B6472;background:var(--surface)}
.fm-c.np{border:1px dashed #D9A514;color:#8A5A00;background:#FFFBEA}
.fm-c.nl{border:1px dashed #D64545;color:#B42318;background:#FDECEA;font-weight:600}
.fm-c.vz{color:#C4CCD6;text-align:center}`;
  document.head.appendChild(css);
}
