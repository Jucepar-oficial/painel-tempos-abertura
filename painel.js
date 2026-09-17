const estado = {
  manifest: null, dados: null, municipiosOficiais: null, periodo: "", orgao: "TODOS", uf: "BR", municipio: "",
  mostrarTodosMunicipios: false, metricaEvolucao: "total_oficial", cachePeriodos: new Map(), tokenEvolucao: 0
};
const $ = (id) => document.getElementById(id);

const nomesOrgao = {
  "TODOS": "Todos os órgãos",
  "ATO LEGAL": "Ato Legal",
  "JUNTA COMERCIAL": "Junta Comercial",
  "CARTÓRIO DE REGISTRO DE PJ": "Cartório de Registro de PJ",
  "NÃO INFORMADO": "Não informado",
  "OAB": "OAB"
};

const metricasCartoes = [
  ["total_oficial", "Tempo médio total", true],
  ["processos", "Processos", false],
  ["cp_total", "Consulta Prévia Total", false],
  ["registro", "Tempo de Registro", false],
  ["validacao", "Validação Cadastral", false],
  ["cp_nome", "CP de Nome", false],
  ["cp_endereco", "CP de Endereço", false]
];

const metricasEvolucao = [
  ["total_oficial", "Tempo total"],
  ["cp_total", "Consulta Prévia Total"],
  ["cp_nome", "CP de Nome"],
  ["cp_endereco", "CP de Endereço"],
  ["validacao", "Validação Cadastral"],
  ["registro", "Tempo de Registro"]
];

const mesesAbreviados = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function numero(valor, casas = 0) {
  return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function duracao(horas) {
  const segundos = Math.max(0, Math.round(Number(horas || 0) * 3600));
  const dias = Math.floor(segundos / 86400);
  const restoDia = segundos % 86400;
  const h = Math.floor(restoDia / 3600);
  const m = Math.floor((restoDia % 3600) / 60);
  const s = restoDia % 60;
  if (dias) return `${dias}d ${h}h ${m}min`;
  if (h) return `${h}h ${m}min ${s}s`;
  if (m) return `${m}min ${s}s`;
  return `${s}s`;
}

function horas(valor) {
  return `${numero(valor, 2)} h`;
}

function encontrarGrupo(dados, orgao = estado.orgao, uf = estado.uf, municipio = estado.municipio) {
  const escopo = municipio ? "MUN" : uf === "BR" ? "BR" : "UF";
  return dados?.grupos.find((grupo) =>
    grupo.escopo === escopo && grupo.uf === uf &&
    (grupo.municipio || "") === municipio && grupo.orgao === orgao
  );
}

function option(value, text) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = text;
  return element;
}

async function carregarManifesto() {
  const resposta = await fetch(`dados/manifest.json?v=${Date.now()}`, { cache: "no-store" });
  if (!resposta.ok) throw new Error("Não foi possível carregar a relação de períodos.");
  estado.manifest = await resposta.json();
  const respostaMunicipios = await fetch(`dados/municipios.json?v=${estado.manifest.versao}`, { cache: "no-store" });
  if (!respostaMunicipios.ok) throw new Error("Não foi possível carregar a relação oficial de municípios.");
  estado.municipiosOficiais = await respostaMunicipios.json();
  $("atualizacao").textContent = estado.manifest.atualizadoEm || "—";
  const avisos = $("avisos-periodos");
  if (Array.isArray(estado.manifest.avisos) && estado.manifest.avisos.length) {
    avisos.className = "aviso-periodos";
    avisos.innerHTML = `<strong>Períodos em validação</strong><ul>${estado.manifest.avisos.map((aviso) => `<li>${aviso}</li>`).join("")}</ul>`;
  } else {
    avisos.className = "aviso-periodos oculto";
    avisos.innerHTML = "";
  }
  const seletor = $("periodo");
  seletor.innerHTML = "";
  estado.manifest.periodos.forEach((periodo) => seletor.append(option(periodo.id, periodo.rotulo)));
  estado.periodo = estado.manifest.periodos.at(-1)?.id || "";
  seletor.value = estado.periodo;
  await carregarPeriodo();
}

async function carregarPeriodo() {
  const item = estado.manifest.periodos.find((periodo) => periodo.id === estado.periodo);
  if (!item) throw new Error("Período não encontrado.");
  $("status-dados").textContent = "Carregando dados";
  estado.dados = await carregarDadosPeriodo(item);
  estado.mostrarTodosMunicipios = false;
  $("competencia-topo").textContent = item.rotulo;
  preencherFiltros();
  atualizarPainel();
  $("status-dados").textContent = `${numero(estado.dados.validacao.registros)} processos disponíveis`;
}

async function carregarDadosPeriodo(item) {
  if (estado.cachePeriodos.has(item.id)) return estado.cachePeriodos.get(item.id);
  const resposta = await fetch(`dados/${item.arquivo}?v=${estado.manifest.versao}`, { cache: "no-store" });
  if (!resposta.ok) throw new Error(`Não foi possível carregar os dados de ${item.rotulo}.`);
  const dados = await resposta.json();
  estado.cachePeriodos.set(item.id, dados);
  return dados;
}

function preencherFiltros() {
  const orgao = $("orgao");
  orgao.innerHTML = "";
  orgao.append(option("TODOS", "Todos os órgãos"));
  estado.dados.orgaos.forEach((valor) => orgao.append(option(valor, nomesOrgao[valor] || valor)));
  orgao.value = estado.orgao;

  const uf = $("uf");
  uf.innerHTML = "";
  uf.append(option("BR", "Brasil"));
  estado.dados.ufs.forEach((valor) => uf.append(option(valor, valor)));
  uf.value = estado.uf;
  preencherMunicipios();
}

function preencherMunicipios() {
  const seletor = $("municipio");
  seletor.innerHTML = "";
  seletor.append(option("", "Todos os municípios"));
  if (estado.uf === "BR") {
    estado.municipio = "";
    seletor.disabled = true;
    return;
  }
  const municipios = [...new Set(estado.dados.grupos
    .filter((grupo) => grupo.escopo === "MUN" && grupo.uf === estado.uf && grupo.orgao === estado.orgao)
    .map((grupo) => grupo.municipio))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  municipios.forEach((valor) => seletor.append(option(valor, valor)));
  seletor.disabled = municipios.length === 0;
  if (!municipios.includes(estado.municipio)) estado.municipio = "";
  seletor.value = estado.municipio;
}

function grupoAtual(orgao = estado.orgao) {
  return encontrarGrupo(estado.dados, orgao);
}

function tituloRecorte() {
  const local = estado.municipio ? `${estado.municipio}/${estado.uf}` : estado.uf === "BR" ? "Brasil" : estado.uf;
  return `${local} · ${nomesOrgao[estado.orgao] || estado.orgao}`;
}

function renderRecorte(grupo) {
  const elemento = $("recorte");
  elemento.className = `recorte${estado.orgao === "OAB" ? " oab" : ""}`;
  elemento.innerHTML = `<strong>${tituloRecorte()}</strong><span>${numero(grupo.processos)} processos no período selecionado</span>`;
}

function renderIndicadores(grupo) {
  $("indicadores").innerHTML = metricasCartoes.map(([chave, titulo, principal]) => {
    if (chave === "processos") {
      return `<article class="indicador${estado.orgao === "OAB" ? " oab" : ""}"><span>${titulo}</span><strong>${numero(grupo.processos)}</strong><small>Protocolos considerados no recorte</small></article>`;
    }
    const metrica = grupo.metricas[chave];
    return `<article class="indicador${principal ? " principal" : ""}${estado.orgao === "OAB" && !principal ? " oab" : ""}"><span>${titulo}</span><strong>${duracao(metrica.media)}</strong><small>Média em horas úteis: ${horas(metrica.media)}</small></article>`;
  }).join("");
}

function renderBarras(id, grupo, chaves) {
  const maximo = Math.max(...chaves.map(([chave]) => grupo.metricas[chave].media), 0.0001);
  $(id).innerHTML = chaves.map(([chave, rotulo]) => {
    const valor = grupo.metricas[chave].media;
    return `<div class="barra"><p><span>${rotulo}</span><b>${duracao(valor)}</b></p><div><i style="width:${Math.max(0.5, valor / maximo * 100)}%"></i></div></div>`;
  }).join("");
}

function renderComparativoOrgaos() {
  const orgaos = estado.orgao === "TODOS" ? estado.dados.orgaos : [estado.orgao];
  const linhas = orgaos.map((orgao) => ({ orgao, grupo: grupoAtual(orgao) }));
  $("comparativo-orgaos").innerHTML = `<thead><tr><th>Tipo de órgão</th><th>Processos</th><th>CP Total</th><th>Validação</th><th>Registro</th><th>Tempo Total</th></tr></thead><tbody>${linhas.map(({ orgao, grupo }) => `<tr class="${orgao === "OAB" ? "destaque-oab" : ""}"><td>${nomesOrgao[orgao] || orgao}</td><td>${numero(grupo?.processos || 0)}</td><td>${grupo ? duracao(grupo.metricas.cp_total.media) : "—"}</td><td>${grupo ? duracao(grupo.metricas.validacao.media) : "—"}</td><td>${grupo ? duracao(grupo.metricas.registro.media) : "—"}</td><td>${grupo ? duracao(grupo.metricas.total_oficial.media) : "—"}</td></tr>`).join("")}</tbody>`;
}

function linhasRanking() {
  if (estado.uf === "BR") {
    return estado.dados.grupos.filter((grupo) => grupo.escopo === "UF" && grupo.orgao === estado.orgao);
  }
  return estado.dados.grupos.filter((grupo) => grupo.escopo === "MUN" && grupo.uf === estado.uf && grupo.orgao === estado.orgao && grupo.processos >= 10);
}

function chaveMunicipio(nome) {
  return String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function linhasDetalheMunicipal(ranking) {
  const ranqueados = ranking.map((grupo, indice) => ({ ...grupo, posicao: indice + 1 }));
  if (!estado.mostrarTodosMunicipios) return ranqueados.slice(0, 50);

  const todosComDados = estado.dados.grupos.filter((grupo) =>
    grupo.escopo === "MUN" && grupo.uf === estado.uf && grupo.orgao === estado.orgao
  );
  const nomesComDados = new Set(todosComDados.map((grupo) => chaveMunicipio(grupo.municipio)));
  const nomesRanqueados = new Set(ranking.map((grupo) => chaveMunicipio(grupo.municipio)));
  const abaixoDoMinimo = todosComDados
    .filter((grupo) => !nomesRanqueados.has(chaveMunicipio(grupo.municipio)))
    .sort((a, b) => a.metricas.total_oficial.media - b.metricas.total_oficial.media)
    .map((grupo) => ({ ...grupo, posicao: null }));
  const semProcessos = (estado.municipiosOficiais?.porUf?.[estado.uf] || [])
    .filter((nome) => !nomesComDados.has(chaveMunicipio(nome)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((nome) => ({ escopo: "MUN", uf: estado.uf, municipio: nome.toLocaleUpperCase("pt-BR"), orgao: estado.orgao, processos: 0, metricas: null, posicao: null }));

  return [...ranqueados, ...abaixoDoMinimo, ...semProcessos];
}

function formatarMetrica(grupo, metrica) {
  return grupo.metricas ? duracao(grupo.metricas[metrica].media) : "—";
}

function renderRanking() {
  const municipal = estado.uf !== "BR";
  const ranking = linhasRanking().sort((a, b) => a.metricas.total_oficial.media - b.metricas.total_oficial.media);
  const linhas = municipal ? linhasDetalheMunicipal(ranking) : ranking.map((grupo, indice) => ({ ...grupo, posicao: indice + 1 }));
  const botaoTodos = $("mostrar-todos-municipios");
  botaoTodos.className = municipal ? "botao" : "botao oculto";
  botaoTodos.textContent = estado.mostrarTodosMunicipios ? "Mostrar somente os 50 primeiros" : "Mostrar todos os municípios";
  botaoTodos.setAttribute("aria-expanded", String(estado.mostrarTodosMunicipios));
  $("ranking-titulo").textContent = municipal ? `Ranking dos municípios de ${estado.uf}` : "Ranking das unidades da Federação";
  $("tabela-titulo").textContent = municipal ? `Resumo dos municípios de ${estado.uf}` : "Resumo por unidade da Federação";
  $("ranking-info").textContent = municipal ? "Top 10 · mínimo de 10 processos" : "Top 10 · menor tempo médio total";
  $("nota-ranking").textContent = municipal
    ? estado.mostrarTodosMunicipios
      ? `Lista completa de ${numero(linhas.length)} municípios. Localidades com menos de 10 processos não recebem posição; sem processos, os tempos aparecem como “—”.`
      : "Exibindo até 50 municípios com pelo menos 10 processos. Use o botão acima para consultar a lista completa."
    : "Ranking calculado pelo menor tempo médio total oficial.";

  $("ranking-destaques").innerHTML = ranking.slice(0, 10).map((grupo, indice) => {
    const nome = municipal ? grupo.municipio : grupo.uf;
    const selecionado = estado.municipio === grupo.municipio || (!municipal && estado.uf === grupo.uf);
    return `<article class="cartao-ranking posicao-${indice + 1}${selecionado ? " selecionado" : ""}"><em>${indice + 1}º</em><h4>${nome}</h4><p>${numero(grupo.processos)} processos</p><div class="numero"><strong>${duracao(grupo.metricas.total_oficial.media)}</strong><small>tempo médio total</small></div></article>`;
  }).join("") || `<div class="estado-vazio">Não há localidades com pelo menos 10 processos para este recorte.</div>`;

  const corpo = linhas.map((grupo) => {
    const nome = municipal ? grupo.municipio : grupo.uf;
    const destaque = estado.municipio === grupo.municipio ? "destaque" : "";
    return `<tr class="${destaque}"><td>${grupo.posicao ? `${grupo.posicao}º` : "—"}</td><td>${nome}</td><td>${numero(grupo.processos)}</td><td>${formatarMetrica(grupo, "cp_nome")}</td><td>${formatarMetrica(grupo, "cp_endereco")}</td><td>${formatarMetrica(grupo, "cp_total")}</td><td>${formatarMetrica(grupo, "validacao")}</td><td>${formatarMetrica(grupo, "registro")}</td><td>${formatarMetrica(grupo, "total_oficial")}</td></tr>`;
  }).join("") || `<tr><td colspan="9"><div class="estado-vazio">Não há municípios com pelo menos 10 processos. Use “Mostrar todos os municípios” para consultar a lista completa.</div></td></tr>`;
  $("tabela-detalhes").innerHTML = `<thead><tr><th>Posição</th><th>${municipal ? "Município" : "UF"}</th><th>Processos</th><th>CP Nome</th><th>CP Endereço</th><th>CP Total</th><th>Validação</th><th>Registro</th><th>Tempo Total</th></tr></thead><tbody>${corpo}</tbody>`;
  return linhas;
}

function periodoAtual() {
  return estado.manifest?.periodos.find((periodo) => periodo.id === estado.periodo)?.rotulo || estado.periodo;
}

function renderControlesEvolucao() {
  $("evolucao-controles").innerHTML = metricasEvolucao.map(([chave, rotulo]) =>
    `<button type="button" data-metrica="${chave}" class="${chave === estado.metricaEvolucao ? "ativo" : ""}" aria-pressed="${chave === estado.metricaEvolucao}">${rotulo}</button>`
  ).join("");
}

function rotuloEixo(valor) {
  if (valor < 1) return `${numero(valor * 60, 0)} min`;
  return `${numero(valor, valor < 10 ? 1 : 0)} h`;
}

function trechosDaSerie(pontos) {
  const trechos = [];
  let atual = [];
  pontos.forEach((ponto) => {
    if (ponto.valor == null) {
      if (atual.length) trechos.push(atual);
      atual = [];
    } else {
      atual.push(ponto);
    }
  });
  if (atual.length) trechos.push(atual);
  return trechos;
}

function renderGraficoEvolucao(pontos, rotulo, ano) {
  const grafico = $("evolucao-grafico");
  const validos = pontos.filter((ponto) => ponto.valor != null);
  if (!validos.length) {
    grafico.innerHTML = `<div class="estado-vazio">Não há dados anuais para ${rotulo.toLowerCase()} neste recorte.</div>`;
    return;
  }

  const largura = 1120;
  const altura = 330;
  const margem = { esquerda: 72, direita: 28, topo: 42, base: 56 };
  const larguraUtil = largura - margem.esquerda - margem.direita;
  const alturaUtil = altura - margem.topo - margem.base;
  const maximo = Math.max(...validos.map((ponto) => ponto.valor), 0.01) * 1.18;
  const x = (indice) => pontos.length === 1 ? margem.esquerda + larguraUtil / 2 : margem.esquerda + indice * larguraUtil / (pontos.length - 1);
  const y = (valor) => margem.topo + alturaUtil - (valor / maximo) * alturaUtil;
  const grades = Array.from({ length: 5 }, (_, indice) => {
    const valor = maximo * (4 - indice) / 4;
    const posY = margem.topo + alturaUtil * indice / 4;
    return `<line class="grade" x1="${margem.esquerda}" y1="${posY}" x2="${largura - margem.direita}" y2="${posY}"/><text class="rotulo-eixo" x="${margem.esquerda - 10}" y="${posY + 4}" text-anchor="end">${rotuloEixo(valor)}</text>`;
  }).join("");
  const trechos = trechosDaSerie(pontos).map((trecho) =>
    `<polyline class="serie" points="${trecho.map((ponto) => `${x(ponto.indice)},${y(ponto.valor)}`).join(" ")}"/>`
  ).join("");
  const marcas = pontos.map((ponto) => {
    const posX = x(ponto.indice);
    const mes = `<text class="rotulo-eixo" x="${posX}" y="${altura - 22}" text-anchor="middle">${ponto.mes}</text>`;
    if (ponto.valor == null) return `${mes}<text class="mes-ausente" x="${posX}" y="${margem.topo + alturaUtil - 10}" text-anchor="middle">—</text>`;
    const posY = y(ponto.valor);
    return `${mes}<circle class="ponto" cx="${posX}" cy="${posY}" r="6"><title>${ponto.mes}/${ano}: ${duracao(ponto.valor)}</title></circle><text class="rotulo-valor" x="${posX}" y="${Math.max(18, posY - 12)}" text-anchor="middle">${duracao(ponto.valor)}</text>`;
  }).join("");

  grafico.innerHTML = `<svg viewBox="0 0 ${largura} ${altura}" role="img" aria-labelledby="titulo-svg-evolucao descricao-svg-evolucao"><title id="titulo-svg-evolucao">Evolução de ${rotulo} em ${ano}</title><desc id="descricao-svg-evolucao">Gráfico mensal em horas úteis, acompanhando os filtros selecionados.</desc>${grades}<line class="eixo" x1="${margem.esquerda}" y1="${margem.topo + alturaUtil}" x2="${largura - margem.direita}" y2="${margem.topo + alturaUtil}"/>${trechos}${marcas}</svg>`;
}

async function atualizarEvolucaoAnual() {
  const token = ++estado.tokenEvolucao;
  renderControlesEvolucao();
  $("evolucao-grafico").innerHTML = `<div class="carregando-grafico">Carregando evolução anual...</div>`;
  const [anoTexto, mesTexto] = estado.periodo.split("-");
  const ano = Number(anoTexto);
  const mesLimite = Number(mesTexto);
  const periodosAno = estado.manifest.periodos.filter((item) => item.id.startsWith(`${ano}-`) && Number(item.id.slice(5)) <= mesLimite);
  try {
    const dadosCarregados = await Promise.all(periodosAno.map(async (item) => [item.id, await carregarDadosPeriodo(item)]));
    if (token !== estado.tokenEvolucao) return;
    const porPeriodo = new Map(dadosCarregados);
    const pontos = Array.from({ length: mesLimite }, (_, indice) => {
      const id = `${ano}-${String(indice + 1).padStart(2, "0")}`;
      const grupo = encontrarGrupo(porPeriodo.get(id));
      return { indice, mes: mesesAbreviados[indice], id, valor: grupo?.metricas?.[estado.metricaEvolucao]?.media ?? null };
    });
    const rotulo = metricasEvolucao.find(([chave]) => chave === estado.metricaEvolucao)?.[1] || estado.metricaEvolucao;
    $("evolucao-recorte").textContent = `${tituloRecorte()} · ${ano}`;
    renderGraficoEvolucao(pontos, rotulo, ano);
    const ausentes = pontos.filter((ponto) => ponto.valor == null).map((ponto) => ponto.mes);
    $("evolucao-nota").textContent = ausentes.length
      ? `Sem dados publicados para o recorte em: ${ausentes.join(", ")}. As interrupções aparecem como lacunas na linha.`
      : `Série de janeiro a ${mesesAbreviados[mesLimite - 1]} de ${ano}, em horas úteis médias.`;
  } catch (erro) {
    if (token !== estado.tokenEvolucao) return;
    console.error(erro);
    $("evolucao-grafico").innerHTML = `<div class="estado-vazio">Não foi possível carregar a evolução anual.</div>`;
    $("evolucao-nota").textContent = "Os indicadores mensais atuais permanecem disponíveis.";
  }
}

function abrirRelatorio() {
  const parametros = new URLSearchParams({ periodo: estado.periodo, orgao: estado.orgao, uf: estado.uf });
  if (estado.municipio) parametros.set("municipio", estado.municipio);
  window.open(`relatorio.html?${parametros.toString()}`, "_blank", "noopener");
}

function renderEstadoVazio() {
  const mensagem = `Não há processos para ${tituloRecorte()} em ${periodoAtual()}.`;
  const mensagemCurta = "Não há dados para o recorte selecionado.";

  const recorte = $("recorte");
  recorte.className = `recorte${estado.orgao === "OAB" ? " oab" : ""}`;
  recorte.innerHTML = `<strong>${tituloRecorte()}</strong><span>0 processos no período selecionado</span>`;

  $("indicadores").innerHTML = `<div class="estado-vazio estado-vazio-principal"><strong>${mensagem}</strong><span>Altere a unidade da Federação ou selecione Brasil para consultar outros resultados.</span></div>`;
  $("composicao").innerHTML = `<div class="estado-vazio">${mensagemCurta}</div>`;
  $("consulta-previa").innerHTML = `<div class="estado-vazio">${mensagemCurta}</div>`;
  renderComparativoOrgaos();

  rankingAtual = renderRanking();
  $("baixar").disabled = true;
  $("gerar-relatorio").disabled = true;
  atualizarEvolucaoAnual();
}

let rankingAtual = [];
function atualizarPainel() {
  const grupo = grupoAtual();
  if (!grupo) {
    renderEstadoVazio();
    return;
  }
  $("baixar").disabled = false;
  $("gerar-relatorio").disabled = false;
  renderRecorte(grupo);
  renderIndicadores(grupo);
  renderBarras("composicao", grupo, [["cp_total", "Consulta Prévia Total"], ["validacao", "Validação Cadastral"], ["registro", "Tempo de Registro"]]);
  renderBarras("consulta-previa", grupo, [["cp_nome", "Consulta Prévia de Nome"], ["cp_endereco", "Consulta Prévia de Endereço"], ["cp_total", "Consulta Prévia Total"]]);
  renderComparativoOrgaos();
  rankingAtual = renderRanking();
  atualizarEvolucaoAnual();
}

function baixarCsv() {
  const municipal = estado.uf !== "BR";
  const cabecalho = ["Posição", municipal ? "Município" : "UF", "Processos", "CP Nome (h)", "CP Endereço (h)", "CP Total (h)", "Validação (h)", "Registro (h)", "Tempo Total (h)"];
  const linhas = rankingAtual.map((grupo) => [
    grupo.posicao || "", municipal ? grupo.municipio : grupo.uf, grupo.processos,
    grupo.metricas?.cp_nome.media ?? "", grupo.metricas?.cp_endereco.media ?? "", grupo.metricas?.cp_total.media ?? "",
    grupo.metricas?.validacao.media ?? "", grupo.metricas?.registro.media ?? "", grupo.metricas?.total_oficial.media ?? ""
  ]);
  const csv = [cabecalho, ...linhas].map((linha) => linha.map((valor) => `"${String(valor).replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tempos-${estado.periodo}-${estado.orgao.toLowerCase().replaceAll(" ", "-")}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function conectarEventos() {
  $("periodo").addEventListener("change", async (event) => { estado.periodo = event.target.value; await carregarPeriodo(); });
  $("orgao").addEventListener("change", (event) => { estado.orgao = event.target.value; estado.mostrarTodosMunicipios = false; preencherMunicipios(); atualizarPainel(); });
  $("uf").addEventListener("change", (event) => { estado.uf = event.target.value; estado.municipio = ""; estado.mostrarTodosMunicipios = false; preencherMunicipios(); atualizarPainel(); });
  $("municipio").addEventListener("change", (event) => { estado.municipio = event.target.value; estado.mostrarTodosMunicipios = false; atualizarPainel(); });
  $("limpar").addEventListener("click", () => { estado.orgao = "TODOS"; estado.uf = "BR"; estado.municipio = ""; estado.mostrarTodosMunicipios = false; preencherFiltros(); atualizarPainel(); });
  $("mostrar-todos-municipios").addEventListener("click", () => { estado.mostrarTodosMunicipios = !estado.mostrarTodosMunicipios; atualizarPainel(); });
  $("baixar").addEventListener("click", baixarCsv);
  $("gerar-relatorio").addEventListener("click", abrirRelatorio);
  $("evolucao-controles").addEventListener("click", (event) => {
    const botao = event.target.closest?.("button[data-metrica]");
    if (!botao) return;
    estado.metricaEvolucao = botao.dataset.metrica;
    atualizarEvolucaoAnual();
  });
}

conectarEventos();
carregarManifesto().catch((erro) => {
  console.error(erro);
  $("status-dados").textContent = "Falha ao carregar";
  $("indicadores").innerHTML = `<div class="caixa estado-vazio">${erro.message} Tente novamente mais tarde.</div>`;
});
