(function comparisonModule() {
  "use strict";

  const regioes = {
    N: { nome: "Norte", ufs: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"] },
    NE: { nome: "Nordeste", ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
    CO: { nome: "Centro-Oeste", ufs: ["DF", "GO", "MT", "MS"] },
    SE: { nome: "Sudeste", ufs: ["ES", "MG", "RJ", "SP"] },
    S: { nome: "Sul", ufs: ["PR", "RS", "SC"] }
  };
  const todasUfs = Object.values(regioes).flatMap((regiao) => regiao.ufs).sort();
  const metricas = [
    ["total_oficial", "Tempo total"],
    ["cp_total", "Consulta Prévia Total"],
    ["cp_nome", "CP de Nome"],
    ["cp_endereco", "CP de Endereço"],
    ["validacao", "Validação Cadastral"],
    ["registro", "Tempo de Registro"]
  ];
  const metricasBarras = [
    ["total_oficial", "Tempo médio total"],
    ["cp_total", "Consulta Prévia Total"],
    ["validacao", "Validação Cadastral"],
    ["registro", "Tempo de Registro"]
  ];
  const paleta = ["#006eb8", "#ef7d00", "#6f42c1", "#009ca6", "#d94f70", "#7b8794", "#9b6b1b", "#3e7cb1", "#8f5aa8"];
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const comparacao = {
    ufs: new Set(["PR"]),
    regiao: "CUSTOM",
    metrica: "total_oficial",
    token: 0
  };

  const porId = (id) => document.getElementById(id);
  const nomeOrgao = () => (typeof nomesOrgao !== "undefined" && nomesOrgao[estado.orgao]) || estado.orgao;
  const fmtNumero = (valor) => Number(valor || 0).toLocaleString("pt-BR");
  const fmtDuracao = (valor) => typeof duracao === "function" ? duracao(valor) : `${Number(valor || 0).toFixed(2)} h`;

  function grupoUf(dados, uf) {
    return dados?.grupos?.find((grupo) =>
      grupo.escopo === "UF" && grupo.uf === uf && grupo.orgao === estado.orgao
    );
  }

  function corUf(uf, indice) {
    return uf === "PR" ? "#008542" : paleta[indice % paleta.length];
  }

  function injetarInterface() {
    const filtro = document.querySelector(".filtros");
    if (!filtro || porId("comparacao-controles")) return;

    const rotuloUf = porId("uf")?.closest("label");
    if (rotuloUf?.firstChild?.nodeType === Node.TEXT_NODE) {
      rotuloUf.firstChild.textContent = "UF para detalhamento";
    }

    const controles = document.createElement("section");
    controles.id = "comparacao-controles";
    controles.className = "comparacao-controles";
    controles.setAttribute("aria-labelledby", "titulo-comparacao-controles");
    controles.innerHTML = `
      <div class="comparacao-controles-topo">
        <div>
          <strong id="titulo-comparacao-controles">Comparação geográfica</strong>
          <span>Escolha uma região ou marque as UFs que deseja comparar.</span>
        </div>
        <label>Região geográfica
          <select id="comparacao-regiao">
            <option value="CUSTOM">Seleção personalizada</option>
            <option value="N">Norte</option>
            <option value="NE">Nordeste</option>
            <option value="CO">Centro-Oeste</option>
            <option value="SE">Sudeste</option>
            <option value="S">Sul</option>
          </select>
        </label>
      </div>
      <div class="comparacao-acoes">
        <button type="button" class="botao" id="comparacao-todas">Selecionar todas</button>
        <button type="button" class="botao" id="comparacao-limpar">Limpar seleção</button>
        <span id="comparacao-resumo" aria-live="polite"></span>
      </div>
      <div id="comparacao-ufs" class="comparacao-ufs" role="group" aria-label="Unidades da Federação para comparação"></div>
      <p class="nota">O filtro acima controla somente os gráficos e a tabela comparativa. O filtro “UF para detalhamento” continua controlando municípios, rankings e o relatório mensal.</p>`;
    filtro.insertAdjacentElement("afterend", controles);

    const resultados = document.createElement("section");
    resultados.id = "comparacao-geografica";
    resultados.className = "caixa comparacao-geografica";
    resultados.setAttribute("aria-labelledby", "titulo-comparacao-geografica");
    resultados.innerHTML = `
      <div class="cabecalho-caixa">
        <div><small>Comparação geográfica</small><h3 id="titulo-comparacao-geografica">Desempenho das UFs selecionadas</h3></div>
        <span id="comparacao-recorte">—</span>
      </div>
      <div id="comparacao-vazio" class="estado-vazio oculto"></div>
      <div id="comparacao-conteudo">
        <div id="comparacao-barras" class="comparacao-barras"></div>
        <div class="comparacao-evolucao">
          <div class="comparacao-evolucao-topo">
            <div><small>Evolução anual comparativa</small><h4>Comportamento mensal por UF</h4></div>
            <div id="comparacao-metricas" class="evolucao-controles" role="group" aria-label="Métrica da comparação anual"></div>
          </div>
          <div id="comparacao-linhas" class="grafico-linha"></div>
          <p id="comparacao-nota" class="nota"></p>
        </div>
        <div class="tabela-wrap"><table id="comparacao-tabela"></table></div>
      </div>`;
    const indicadores = porId("indicadores");
    indicadores?.insertAdjacentElement("afterend", resultados);

    renderizarChips();
    conectarEventos();
  }

  function renderizarChips() {
    const area = porId("comparacao-ufs");
    if (!area) return;
    area.innerHTML = todasUfs.map((uf) => `
      <label class="uf-chip${uf === "PR" && comparacao.ufs.has("PR") ? " pr" : ""}">
        <input type="checkbox" value="${uf}" ${comparacao.ufs.has(uf) ? "checked" : ""}>
        <span>${uf}</span>
      </label>`).join("");
    atualizarResumo();
  }

  function atualizarResumo() {
    const lista = [...comparacao.ufs].sort();
    const resumo = porId("comparacao-resumo");
    if (resumo) resumo.textContent = lista.length ? `${lista.length} UF${lista.length > 1 ? "s" : ""}: ${lista.join(", ")}` : "Nenhuma UF selecionada";
  }

  function conectarEventos() {
    porId("comparacao-regiao").addEventListener("change", (event) => {
      comparacao.regiao = event.target.value;
      comparacao.ufs = new Set(regioes[comparacao.regiao]?.ufs || []);
      renderizarChips();
      atualizarComparacao();
    });
    porId("comparacao-todas").addEventListener("click", () => {
      comparacao.regiao = "CUSTOM";
      porId("comparacao-regiao").value = "CUSTOM";
      comparacao.ufs = new Set(todasUfs);
      renderizarChips();
      atualizarComparacao();
    });
    porId("comparacao-limpar").addEventListener("click", () => {
      comparacao.regiao = "CUSTOM";
      porId("comparacao-regiao").value = "CUSTOM";
      comparacao.ufs.clear();
      renderizarChips();
      atualizarComparacao();
    });
    porId("comparacao-ufs").addEventListener("change", (event) => {
      const alvo = event.target.closest('input[type="checkbox"]');
      if (!alvo) return;
      alvo.checked ? comparacao.ufs.add(alvo.value) : comparacao.ufs.delete(alvo.value);
      comparacao.regiao = "CUSTOM";
      porId("comparacao-regiao").value = "CUSTOM";
      renderizarChips();
      atualizarComparacao();
    });
    porId("comparacao-metricas").addEventListener("click", (event) => {
      const botao = event.target.closest("button[data-comparacao-metrica]");
      if (!botao) return;
      comparacao.metrica = botao.dataset.comparacaoMetrica;
      renderizarControlesMetricas();
      atualizarEvolucao();
    });

    ["periodo", "orgao"].forEach((id) => {
      porId(id)?.addEventListener("change", () => window.setTimeout(atualizarComparacao, 0));
    });
    porId("limpar")?.addEventListener("click", () => {
      comparacao.ufs = new Set(["PR"]);
      comparacao.regiao = "CUSTOM";
      porId("comparacao-regiao").value = "CUSTOM";
      renderizarChips();
      window.setTimeout(atualizarComparacao, 0);
    });

    const status = porId("status-dados");
    if (status) {
      new MutationObserver(() => {
        if (!status.textContent.includes("Carregando") && !status.textContent.includes("Falha")) atualizarComparacao();
      }).observe(status, { childList: true, subtree: true, characterData: true });
    }
  }

  function renderizarControlesMetricas() {
    const area = porId("comparacao-metricas");
    if (!area) return;
    area.innerHTML = metricas.map(([chave, rotulo]) => `
      <button type="button" data-comparacao-metrica="${chave}" class="${comparacao.metrica === chave ? "ativo" : ""}">${rotulo}</button>`
    ).join("");
  }

  function linhasAtuais() {
    return [...comparacao.ufs].sort().map((uf) => ({ uf, grupo: grupoUf(estado.dados, uf) }));
  }

  function renderizarBarras(linhas) {
    const area = porId("comparacao-barras");
    const ordemCores = linhas.map(({ uf }) => uf);
    area.innerHTML = metricasBarras.map(([chave, rotulo]) => {
      const ordenadas = [...linhas].sort((a, b) => {
        const valorA = a.grupo?.metricas?.[chave]?.media;
        const valorB = b.grupo?.metricas?.[chave]?.media;
        if (valorA == null && valorB == null) return a.uf.localeCompare(b.uf);
        if (valorA == null) return 1;
        if (valorB == null) return -1;
        return valorA - valorB || a.uf.localeCompare(b.uf);
      });
      const maximo = Math.max(0, ...ordenadas.map(({ grupo }) => grupo?.metricas?.[chave]?.media || 0));
      const itens = ordenadas.map(({ uf, grupo }) => {
        const valor = grupo?.metricas?.[chave]?.media;
        const largura = valor == null || !maximo ? 0 : Math.max(2, (valor / maximo) * 100);
        const indiceCor = ordemCores.indexOf(uf);
        return `<div class="comparacao-barra-linha${uf === "PR" ? " pr" : ""}">
          <strong>${uf}</strong>
          <div class="comparacao-trilho"><span style="width:${largura}%;background:${corUf(uf, indiceCor)}"></span></div>
          <em>${valor == null ? "—" : fmtDuracao(valor)}</em>
        </div>`;
      }).join("");
      return `<article class="comparacao-painel"><h4>${rotulo}<small>Menor → maior</small></h4>${itens}</article>`;
    }).join("");
  }

  function renderizarTabela(linhas) {
    const cabecalho = `<thead><tr><th>UF</th><th>Processos</th><th>CP Nome</th><th>CP Endereço</th><th>CP Total</th><th>Validação</th><th>Registro</th><th>Tempo total</th></tr></thead>`;
    const corpo = linhas.map(({ uf, grupo }) => {
      const valor = (chave) => grupo?.metricas?.[chave]?.media;
      const celula = (chave) => valor(chave) == null ? "—" : fmtDuracao(valor(chave));
      return `<tr class="${uf === "PR" ? "linha-pr" : ""}"><td><strong>${uf}</strong></td><td>${fmtNumero(grupo?.processos || 0)}</td><td>${celula("cp_nome")}</td><td>${celula("cp_endereco")}</td><td>${celula("cp_total")}</td><td>${celula("validacao")}</td><td>${celula("registro")}</td><td>${celula("total_oficial")}</td></tr>`;
    }).join("");
    porId("comparacao-tabela").innerHTML = `${cabecalho}<tbody>${corpo}</tbody>`;
  }

  function desenharGrafico(series, ano, mesLimite) {
    const area = porId("comparacao-linhas");
    const valores = series.flatMap((serie) => serie.pontos.map((ponto) => ponto.valor).filter((valor) => valor != null));
    if (!valores.length) {
      area.innerHTML = `<div class="estado-vazio">Não há dados para a comparação anual deste recorte.</div>`;
      return;
    }
    const largura = 1000;
    const altura = 390;
    const margem = { topo: 34, direita: 35, baixo: 54, esquerda: 70 };
    const larguraUtil = largura - margem.esquerda - margem.direita;
    const alturaUtil = altura - margem.topo - margem.baixo;
    const maximo = Math.max(...valores) * 1.12 || 1;
    const x = (indice) => margem.esquerda + (indice / Math.max(1, mesLimite - 1)) * larguraUtil;
    const y = (valor) => margem.topo + alturaUtil - (valor / maximo) * alturaUtil;
    const grades = Array.from({ length: 5 }, (_, indice) => {
      const valor = (maximo / 4) * indice;
      const py = y(valor);
      return `<line class="grade" x1="${margem.esquerda}" y1="${py}" x2="${largura - margem.direita}" y2="${py}"/><text class="rotulo-eixo" x="${margem.esquerda - 10}" y="${py + 4}" text-anchor="end">${numero(valor, 1)} h</text>`;
    }).join("");
    const rotulosX = Array.from({ length: mesLimite }, (_, indice) =>
      `<text class="rotulo-eixo" x="${x(indice)}" y="${altura - 18}" text-anchor="middle">${meses[indice]}</text>`
    ).join("");
    const desenhos = series.map((serie, indice) => {
      const segmentos = [];
      let atual = [];
      serie.pontos.forEach((ponto, pontoIndice) => {
        if (ponto.valor == null) {
          if (atual.length) segmentos.push(atual);
          atual = [];
        } else atual.push(`${x(pontoIndice)},${y(ponto.valor)}`);
      });
      if (atual.length) segmentos.push(atual);
      const cor = corUf(serie.uf, indice);
      const larguraLinha = serie.uf === "PR" ? 4.5 : 2.5;
      const polilinhas = segmentos.map((pontos) => `<polyline points="${pontos.join(" ")}" fill="none" stroke="${cor}" stroke-width="${larguraLinha}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
      const pontosSvg = serie.pontos.map((ponto, pontoIndice) => ponto.valor == null ? "" :
        `<circle cx="${x(pontoIndice)}" cy="${y(ponto.valor)}" r="${serie.uf === "PR" ? 4.5 : 3.2}" fill="${cor}"><title>${serie.uf} · ${meses[pontoIndice]}: ${fmtDuracao(ponto.valor)}</title></circle>`
      ).join("");
      return polilinhas + pontosSvg;
    }).join("");
    const legenda = series.map((serie, indice) =>
      `<span class="${serie.uf === "PR" ? "pr" : ""}"><i style="background:${corUf(serie.uf, indice)}"></i>${serie.uf}</span>`
    ).join("");
    area.innerHTML = `<div class="comparacao-legenda">${legenda}</div><svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Evolução anual comparativa em ${ano}">${grades}${rotulosX}<line class="eixo" x1="${margem.esquerda}" y1="${margem.topo + alturaUtil}" x2="${largura - margem.direita}" y2="${margem.topo + alturaUtil}"/>${desenhos}</svg>`;
  }

  async function atualizarEvolucao() {
    const token = ++comparacao.token;
    const [anoTexto, mesTexto] = estado.periodo.split("-");
    const ano = Number(anoTexto);
    const mesLimite = Number(mesTexto);
    const ufs = [...comparacao.ufs].sort();
    const area = porId("comparacao-linhas");
    if (!ufs.length || !estado.manifest) return;
    area.innerHTML = `<div class="carregando-grafico">Carregando comparação anual...</div>`;
    const periodos = estado.manifest.periodos.filter((item) => item.id.startsWith(`${ano}-`) && Number(item.id.slice(5)) <= mesLimite);
    try {
      const carregados = await Promise.all(periodos.map(async (item) => [item.id, await carregarDadosPeriodo(item)]));
      if (token !== comparacao.token) return;
      const mapa = new Map(carregados);
      const series = ufs.map((uf) => ({
        uf,
        pontos: Array.from({ length: mesLimite }, (_, indice) => {
          const id = `${ano}-${String(indice + 1).padStart(2, "0")}`;
          const grupo = grupoUf(mapa.get(id), uf);
          return { valor: grupo?.metricas?.[comparacao.metrica]?.media ?? null };
        })
      }));
      desenharGrafico(series, ano, mesLimite);
      const rotulo = metricas.find(([chave]) => chave === comparacao.metrica)?.[1];
      porId("comparacao-nota").textContent = `${rotulo} em horas úteis médias, de janeiro a ${meses[mesLimite - 1]} de ${ano}. Meses sem dados aparecem como lacunas.`;
    } catch (erro) {
      console.error(erro);
      if (token === comparacao.token) area.innerHTML = `<div class="estado-vazio">Não foi possível carregar a comparação anual.</div>`;
    }
  }

  function atualizarComparacao() {
    if (!porId("comparacao-geografica") || !estado?.dados || !estado?.periodo) return;
    renderizarControlesMetricas();
    atualizarResumo();
    const ufs = [...comparacao.ufs].sort();
    const vazio = porId("comparacao-vazio");
    const conteudo = porId("comparacao-conteudo");
    if (!ufs.length) {
      vazio.classList.remove("oculto");
      vazio.textContent = "Selecione pelo menos uma UF ou escolha uma região geográfica.";
      conteudo.classList.add("oculto");
      comparacao.token++;
      return;
    }
    vazio.classList.add("oculto");
    conteudo.classList.remove("oculto");
    const linhas = linhasAtuais();
    renderizarBarras(linhas);
    renderizarTabela(linhas);
    const item = estado.manifest?.periodos?.find((periodo) => periodo.id === estado.periodo);
    porId("comparacao-recorte").textContent = `${item?.rotulo || estado.periodo} · ${nomeOrgao()} · ${ufs.length} UF${ufs.length > 1 ? "s" : ""}`;
    atualizarEvolucao();
  }

  function iniciar() {
    injetarInterface();
    const aguardarDados = () => {
      if (typeof estado !== "undefined" && estado.dados) atualizarComparacao();
      else window.setTimeout(aguardarDados, 150);
    };
    aguardarDados();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
})();