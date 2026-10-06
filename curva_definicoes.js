/* =====================================================================================
   CURVA DE VENDA × PREÇO — ARQUIVO ÚNICO DE DEFINIÇÕES (spec docs/ESPECIFICACAO_CURVA_VENDA_PRECO.md, §5 e §6)
   Alimenta o CÓDIGO (limites dos detectores, premissas) e a aba METODOLOGIA (textos).
   Mudou um limite aqui = mudou a regra E a explicação ao mesmo tempo. Nenhum dado de negócio neste arquivo.
   ===================================================================================== */
const CV_DEF = {
  versaoEspec: '1.2',
  versaoTela: '0.3',

  /* linhas do app de preços; as demais (Beleza, Digital, Informática, Kit Linha Lar, Telefonia…) aparecem juntas em
     "Outras", com a linha original no lugar do segmento (decisão Silvio 06/10/2026) */
  linhasApp: ['Áudio', 'Portáteis'],
  linhaOutras: 'Outras',

  limites: {
    degrauPct: 0.05,          // D1: mudança mínima de nível do preço médio
    degrauMesesMin: 3,        // D1: cada nível precisa durar pelo menos 3 meses
    consolidaPct: 0.03,       // D1: mês em que o preço já está a ±3% do nível novo = degrau consolidado
    pmPecasMin: 30,           // meses com menos peças não entram no cálculo do nível de preço
    comparaMeses: 3,          // D3/D4/D7: compara os últimos 3 meses fechados com os 3 anteriores
    variacaoPmMin: 0.02,      // D3: só explica variação de preço médio a partir de 2%
    contasTop: 5,             // D4: quantas contas mostrar
    armazemVenda: '40',       // D5: depósito de venda (Expedição) — a falta de estoque é medida nele
    mesesMediaVenda: 3,       // D5: venda média dos 3 meses anteriores
    coberturaCritica: 0.5,    // D5: cobertura no fim do mês abaixo de meio mês = falta de estoque
    coberturaCurta: 1.0,      // D5: abaixo de 1 mês = estoque curto
    devolMultiplo: 2,         // D6: devolução ≥ 2× a média dos 12 meses anteriores…
    devolMinPct: 0.05,        // D6: …e ≥ 5% do bruto
    devolBaseMeses: 12,
    refatPct: 0.8,            // D6: conta que devolve e é faturada de novo (≥ 80% das peças) no mesmo mês ou no seguinte
    tabelaSobePct: 0.03,      // D7: preço de lista subiu 3% ou mais…
    tabelaRepasseMax: 0.5,    // D7: …e o preço praticado acompanhou menos da metade
    concMaior: 0.30,          // D9: maior conta acima de 30% do volume
    concTop3: 0.60,           // D9: 3 maiores acima de 60%
    cautelaPecas: 30,         // D10
    cautelaNotas: 3           // D10
  },

  /* régua da skill margem (aplicada no ETL; repetida aqui só para a Metodologia de ADM/GERENTE) */
  premissasMargem: { impostos: 0.15, devolucao: 0.03, taxaCF: 0.018, prazoBase: 120, fatorCusto: 1.01, royaltyBoomvox: 0.03 },

  gravidades: { critico: 'Crítico', atencao: 'Atenção', leitura: 'Leitura', aviso: 'Aviso' },

  definicoes: [
    { nome: 'Venda', texto: 'Vendas normais: notas de saída que não são devolução nem beneficiamento, com operação que gera duplicata, de produto acabado ou mercadoria de revenda.', fonte: 'notas de saída (SD2/SF2), TES (SF4), cadastro do produto (SB1)' },
    { nome: 'Preço médio sem IPI', texto: 'Valor da mercadoria sem IPI dividido pelas peças. Nunca o valor bruto da nota, que inclui IPI.', fonte: 'D2_TOTAL ÷ D2_QUANT' },
    { nome: 'Preço de lista', texto: 'Preço unitário de tabela gravado na própria nota, antes do desconto. É a tabela que estava valendo para aquele cliente no dia da venda.', fonte: 'D2_PRUNIT' },
    { nome: 'Desconto sobre a lista', texto: '1 − preço praticado ÷ preço de lista.', fonte: 'notas de saída' },
    { nome: 'Custo unitário', texto: 'Custo médio da mercadoria na data da venda.', fonte: 'D2_CUSTO1 ÷ D2_QUANT' },
    { nome: 'Devoluções', texto: 'Notas de entrada de devolução do produto, pela data de digitação.', fonte: 'notas de entrada tipo D (SD1)' },
    { nome: 'Estoque no fim do mês', texto: 'Saldo de fechamento de cada mês, somado em todos os armazéns (o gráfico). A falta de estoque é medida só no depósito de venda (40 — Expedição).', fonte: 'saldos de fechamento (SB9) e saldo de hoje (SB2)' },
    { nome: 'Conta', texto: 'Grupo de vendas do cliente; cliente sem grupo aparece como ele mesmo.', fonte: 'cadastro de clientes (SA1) e grupos (ACY)' },
    { nome: 'Cobertura', texto: 'Estoque de hoje ÷ venda média dos últimos 3 meses fechados.', fonte: 'saldo de hoje e notas de saída' },
    { nome: 'Linha "Outras"', texto: 'Junta as linhas que não fazem parte do app de preços (Beleza, Digital, Informática, Kit Linha Lar, Telefonia e outras que surgirem). Dentro dela, o filtro de segmento mostra a linha original. A meta de margem é a geral.', fonte: 'cadastro do produto (SB1/SBM)' },
    { nome: 'Filiais', texto: 'A aba soma as filiais 010102 e 010103.', fonte: '' },
    { nome: 'Atualização', texto: 'Uma vez por dia útil, junto com a rotina do app de preços. Janela de 24 meses fechados + mês corrente (parcial). Antes de gravar, o total de peças e reais é conferido ao centavo com as notas de saída; se divergir, não grava.', fonte: '' }
  ],

  detectores: [
    { id: 'D1', nome: 'Degrau de preço', gravidade: 'atencao',
      procura: L => `Divide a série de preço médio em níveis (cada nível com pelo menos ${L.degrauMesesMin} meses) e marca a passagem de um nível para outro quando a diferença é de ${pct(L.degrauPct)} ou mais. O degrau "consolida" no primeiro mês em que o preço já está a ±${pct(L.consolidaPct)} do nível novo. Meses com menos de ${L.pmPecasMin} peças não entram no cálculo.`,
      exemplo: 'ACA 600 BAGVOX BLACK: transição jun–ago/25, consolidada em ago/25 (de R$ 352,73 para R$ 312,41, −11,4%), e degrau de fev/26 (para R$ 292,56, −6,4%), com fundo em abr/26 (R$ 276,87).',
      limitacoes: 'Usa a média ponderada pelas peças: troca de clientes também move o nível (o D3 separa preço de mistura). Promoções de um mês só não viram degrau.' },
    { id: 'D2', nome: 'O degrau funcionou?', gravidade: 'leitura',
      procura: L => 'Para cada degrau, compara o nível anterior com o novo: peças por mês e margem em R$ por mês (para o perfil Consulta, receita por mês). Vira "Atenção" se a margem em R$ por mês caiu, ou se subiu e no nível seguinte voltou para baixo do que era antes.',
      exemplo: 'BAGVOX: o volume mais que dobrou depois do corte de 2025 e a margem em R$ por mês subiu; depois do degrau de fev/26 a margem em R$ por mês caiu abaixo do nível anterior ao corte.',
      limitacoes: 'Antes e depois são os níveis inteiros do D1; outros fatores do período (estoque, sazonalidade) também agem.' },
    { id: 'D3', nome: 'Preço ou troca de clientes', gravidade: 'leitura',
      procura: L => `Compara os últimos ${L.comparaMeses} meses fechados com os ${L.comparaMeses} anteriores (e cada degrau com o nível anterior). Separa a variação do preço médio em efeito preço (as mesmas contas pagando mais ou menos) e efeito mistura (peso maior de contas que pagam mais ou menos). Só comenta variações a partir de ${pct(L.variacaoPmMin)}.`,
      exemplo: 'BAGVOX: desde mai/26 o preço médio subiu 3,1%, mas as mesmas contas pagaram 1,1% menos — a alta veio da troca de clientes.',
      limitacoes: 'Conta nova ou que saiu entra só no efeito mistura.' },
    { id: 'D4', nome: 'Contas que puxaram', gravidade: 'leitura',
      procura: L => `As ${L.contasTop} contas que mais mexeram em peças entre as mesmas janelas do D3 (e no degrau principal), com antes → depois.`,
      exemplo: 'BAGVOX: CVLB, Fujioka, Lojas Americanas e Armazém Paraíba.',
      limitacoes: 'Conta = grupo de vendas; cliente sem grupo aparece sozinho.' },
    { id: 'D5', nome: 'Falta de estoque', gravidade: 'critico',
      procura: L => `Cobertura do depósito de venda (${L.armazemVenda}) no fim de cada mês = saldo ÷ venda média dos ${L.mesesMediaVenda} meses anteriores. Abaixo de ${L.coberturaCritica.toLocaleString('pt-BR')} mês = falta de estoque (crítico); abaixo de ${L.coberturaCurta.toLocaleString('pt-BR')} mês = estoque curto. Também olha a cobertura de hoje.`,
      exemplo: 'BAGVOX: abr/26 (0,04 mês) e ago–set/26 (0,49 e 0,24 mês).',
      limitacoes: 'Saldo em outros armazéns (assistência, devolução em trânsito) não é estoque de venda — por isso o gráfico mostra o total, mas a falta é medida no depósito 40.' },
    { id: 'D6', nome: 'Devoluções fora do normal', gravidade: 'atencao',
      procura: L => `Devolução do período em peças ≥ ${L.devolMultiplo}× a média dos ${L.devolBaseMeses} meses anteriores e ≥ ${pct(L.devolMinPct)} do bruto. Aponta "cara de refaturamento" quando a mesma conta devolve e é faturada de novo (≥ ${pct(L.refatPct)} das peças) no mesmo mês ou no seguinte.`,
      exemplo: 'BAGVOX: em fev–set/26 as devoluções chegaram a cerca de 27% do bruto.',
      limitacoes: 'A data é a de digitação da devolução, não a da venda devolvida.' },
    { id: 'D7', nome: 'Tabela que não pegou', gravidade: 'atencao',
      procura: L => `O preço de lista (da nota) subiu ${pct(L.tabelaSobePct)} ou mais e o preço praticado acompanhou menos da metade: o desconto absorveu o aumento.`,
      exemplo: 'BAGVOX: a tabela subiu em jul–ago/26 e o desconto sobre a lista subiu junto, deixando o preço praticado no mesmo lugar.',
      limitacoes: 'Compara os primeiros meses depois da alta com os 3 meses anteriores.' },
    { id: 'D8', nome: 'Margem contra a meta', gravidade: 'atencao', soMargem: true,
      procura: L => 'Margem estimada do período contra a meta da linha/segmento. Abaixo do piso = crítico; abaixo da meta = atenção. Mostra o preço de equilíbrio: o preço que daria a meta com os custos e deduções do próprio período.',
      exemplo: 'BAGVOX (Áudio · Bateria, meta 35%): margem em torno de 10%.',
      limitacoes: 'Margem estimada pela régua da skill margem (não é a contábil). VPC = cadastro atual do cliente.' },
    { id: 'D9', nome: 'Concentração', gravidade: 'leitura',
      procura: L => `Maior conta acima de ${pct(L.concMaior)} das peças do período, ou as 3 maiores acima de ${pct(L.concTop3)}.`,
      exemplo: '', limitacoes: '' },
    { id: 'D10', nome: 'Cautela', gravidade: 'aviso',
      procura: L => `Mês corrente é parcial; meses com menos de ${L.cautelaPecas} peças ou menos de ${L.cautelaNotas} notas ficam marcados e não sustentam conclusão.`,
      exemplo: '', limitacoes: '' }
  ],

  formulaMargem: P => `Margem estimada (R$) = valor sem IPI × (1 − impostos ${pct(P.impostos)} − devolução ${pct(P.devolucao)} − royalty) − comissão da nota − frete da UF (tabela de frete por UF) − VPC do cadastro do cliente − custo financeiro − custo × ${P.fatorCusto.toLocaleString('pt-BR')}. Custo financeiro = valor × ${pct(P.taxaCF)} ao mês sobre o prazo real dos títulos da nota que passar de ${P.prazoBase} dias. Royalty de ${pct(P.royaltyBoomvox)} só na família Boomvox (licença R10).`
};
function pct(x){ return (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
