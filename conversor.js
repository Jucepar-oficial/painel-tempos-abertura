const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ANO_INICIAL = 2019;
const ANO_FINAL = 2026;
const metricas = ["cp_nome", "cp_endereco", "cp_total", "validacao", "registro", "total_oficial", "usuario_1", "usuario_2"];
const definicoes = {
  cp_nome: "Consulta Prévia de Nome", cp_endereco: "Consulta Prévia de Endereço",
  cp_total: "Consulta Prévia Total", validacao: "Validação Cadastral",
  registro: "Tempo de Registro", total_oficial: "Tempo Total de Abertura",
  usuario_1: "Tempo do Usuário 1", usuario_2: "Tempo do Usuário 2"
};
const idsCabecalho = {
  serial: "SERIAL",
  cp_nome: "QTDE HH VIABILIDADE NOME",
  cp_endereco: "QTDE HH VIABILIDADE END",
  cp_total: "QTDE HH VIABILIDADE TOTAL",
  usuario_1: "QTDE HH TRANSMISSAO",
  validacao: "QTDE HH LIBERACAO DBE",
  usuario_2: "QTDE HH RECEBIMENTO DBE",
  data_deferimento: "DATA DEFERIMENTO",
  registro: "QTDE HORAS DEFERIMENTO",
  municipio: "MUNICIPIO",
  uf: "UF",
  orgao: "TIPO ORGAO REGISTRO"
};

const $ = (id) => document.getElementById(id);
const seletorMes = $("conv-mes");
meses.forEach((nome, indice) => {
  const item = document.createElement("option");
  item.value = String(indice + 1).padStart(2, "0");
  item.textContent = nome;
  if (indice === 10) item.selected = true;
  seletorMes.append(item);
});

let arquivoSelecionado = null;
let pacoteGerado = null;
let manifestoAtual = null;
let manifestoGerado = null;

function normalizar(valor) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function limparTexto(valor) {
  return String(valor ?? "").toUpperCase().trim().replace(/\s+/g, " ");
}

function valorCelula(planilha, linha, coluna) {
  const celula = planilha[XLSX.utils.encode_cell({ r: linha - 1, c: coluna })];
  return celula ? celula.v : null;
}

function localizarCabecalho(planilha) {
  const referencia = XLSX.utils.decode_range(planilha["!ref"] || "A1:A1");
  const limite = Math.min(referencia.e.r + 1, 30);
  const candidatos = [];
  for (let linha = 1; linha <= limite; linha++) {
    const mapa = {};
    for (let coluna = 0; coluna <= referencia.e.c; coluna++) {
      const titulo = normalizar(valorCelula(planilha, linha, coluna));
      for (const [id, esperado] of Object.entries(idsCabecalho)) {
        if (titulo === esperado) mapa[id] = coluna;
      }
    }
    if (Object.keys(mapa).length === Object.keys(idsCabecalho).length) {
      const amostra = Array.from({ length: 8 }, (_, i) => normalizar(valorCelula(planilha, linha + i + 1, mapa.serial)));
      const registrosAbaixo = amostra.filter((valor) => /^[A-Z]{2}\d{5,}/.test(valor)).length;
      candidatos.push({ linha, mapa, registrosAbaixo });
    }
  }
  const escolhido = candidatos.sort((a, b) => b.registrosAbaixo - a.registrosAbaixo || b.linha - a.linha)[0];
  if (!escolhido || escolhido.registrosAbaixo === 0) throw new Error("Não foi possível localizar os cabeçalhos da base de dados da Redesim.");
  return escolhido;
}

function ultimaLinha(planilha, colunaSerial, cabecalho) {
  const referencia = XLSX.utils.decode_range(planilha["!ref"] || "A1:A1");
  for (let linha = referencia.e.r + 1; linha > cabecalho; linha--) {
    if (/^[A-Z]{2}\d{5,}/.test(normalizar(valorCelula(planilha, linha, colunaSerial)))) return linha;
  }
  throw new Error("Nenhum protocolo foi encontrado abaixo do cabeçalho.");
}

function numero(valor, nome, serial) {
  const convertido = Number(valor);
  if (!Number.isFinite(convertido)) throw new Error(`Valor inválido em ${nome} no protocolo ${serial}.`);
  return convertido;
}

function periodoData(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.valueOf())) return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, "0")}`;
  if (typeof valor === "number") {
    const data = XLSX.SSF.parse_date_code(valor);
    return data ? `${data.y}-${String(data.m).padStart(2, "0")}` : "";
  }
  const texto = String(valor ?? "").trim();
  let partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (partes) return `${partes[3]}-${partes[2]}`;
  partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return partes ? `${partes[1]}-${partes[2]}` : "";
}

function resumir(valores) {
  const soma = valores.reduce((total, valor) => total + valor, 0);
  return { media: +(soma / valores.length).toFixed(9) };
}

function chaveGrupo(escopo, uf, municipio, orgao) { return JSON.stringify([escopo, uf, municipio, orgao]); }

function agregar(registros) {
  const grupos = new Map();
  function adicionar(chave, registro) {
    if (!grupos.has(chave)) grupos.set(chave, { processos: 0, valores: Object.fromEntries(metricas.map((metrica) => [metrica, []])) });
    const grupo = grupos.get(chave);
    grupo.processos++;
    metricas.forEach((metrica) => grupo.valores[metrica].push(registro[metrica]));
  }
  registros.forEach((registro) => {
    const chaves = [
      chaveGrupo("BR", "BR", null, "TODOS"), chaveGrupo("BR", "BR", null, registro.orgao),
      chaveGrupo("UF", registro.uf, null, "TODOS"), chaveGrupo("UF", registro.uf, null, registro.orgao),
      chaveGrupo("MUN", registro.uf, registro.municipio, "TODOS"), chaveGrupo("MUN", registro.uf, registro.municipio, registro.orgao)
    ];
    chaves.forEach((chave) => adicionar(chave, registro));
  });
  return [...grupos.entries()].map(([chave, grupo]) => {
    const [escopo, uf, municipio, orgao] = JSON.parse(chave);
    return { escopo, uf, municipio, orgao, processos: grupo.processos, metricas: Object.fromEntries(metricas.map((metrica) => [metrica, resumir(grupo.valores[metrica])])) };
  });
}

function lerRegistros(planilha, competencia) {
  const { linha: linhaCabecalho, mapa } = localizarCabecalho(planilha);
  const fim = ultimaLinha(planilha, mapa.serial, linhaCabecalho);
  const registros = [], seriais = new Set(), periodos = {}, ufs = new Set(), orgaos = new Set();
  let duplicidades = 0, negativos = 0;
  for (let linha = linhaCabecalho + 1; linha <= fim; linha++) {
    const serial = normalizar(valorCelula(planilha, linha, mapa.serial));
    if (!/^[A-Z]{2}\d{5,}/.test(serial)) continue;
    if (seriais.has(serial)) duplicidades++; else seriais.add(serial);
    const registro = {
      serial,
      uf: limparTexto(valorCelula(planilha, linha, mapa.uf)),
      municipio: limparTexto(valorCelula(planilha, linha, mapa.municipio)),
      orgao: limparTexto(valorCelula(planilha, linha, mapa.orgao)) || "NÃO INFORMADO",
      cp_nome: numero(valorCelula(planilha, linha, mapa.cp_nome), "CP Nome", serial),
      cp_endereco: numero(valorCelula(planilha, linha, mapa.cp_endereco), "CP Endereço", serial),
      cp_total: numero(valorCelula(planilha, linha, mapa.cp_total), "CP Total", serial),
      usuario_1: numero(valorCelula(planilha, linha, mapa.usuario_1), "Tempo do Usuário 1", serial),
      validacao: numero(valorCelula(planilha, linha, mapa.validacao), "Validação Cadastral", serial),
      usuario_2: numero(valorCelula(planilha, linha, mapa.usuario_2), "Tempo do Usuário 2", serial),
      registro: numero(valorCelula(planilha, linha, mapa.registro), "Tempo de Registro", serial)
    };
    registro.total_oficial = registro.cp_total + registro.validacao + registro.registro;
    metricas.forEach((metrica) => { if (registro[metrica] < 0) negativos++; });
    const periodo = periodoData(valorCelula(planilha, linha, mapa.data_deferimento));
    periodos[periodo || "não identificado"] = (periodos[periodo || "não identificado"] || 0) + 1;
    ufs.add(registro.uf); orgaos.add(registro.orgao); registros.push(registro);
  }
  return {
    registros,
    validacao: {
      registros: registros.length, seriaisUnicos: seriais.size, duplicidades, ufs: ufs.size,
      tiposOrgao: [...orgaos].sort(), periodosDeferimento: periodos,
      periodoCompativel: periodos[competencia] === registros.length, valoresNegativos: negativos,
      linhaCabecalho, ultimaLinha: fim
    }
  };
}

function baixarArquivo(conteudo, nome) {
  const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = nome; link.click();
  URL.revokeObjectURL(link.href);
}

function validarManifesto(valor) {
  if (!valor || !Array.isArray(valor.periodos)) throw new Error("O arquivo selecionado não é um manifest.json válido do painel.");
  const ids = new Set();
  valor.periodos.forEach((periodo) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo?.id || "") || !periodo.rotulo || !periodo.arquivo) {
      throw new Error("O manifest.json contém um período incompleto ou inválido.");
    }
    if (ids.has(periodo.id)) throw new Error(`O manifest.json contém a competência ${periodo.id} mais de uma vez.`);
    ids.add(periodo.id);
  });
  return valor;
}

function atualizarManifesto() {
  const novoPeriodo = {
    id: pacoteGerado.periodo,
    rotulo: pacoteGerado.rotuloPeriodo,
    arquivo: `tempos-${pacoteGerado.periodo}.json`
  };
  const periodos = new Map(manifestoAtual.periodos.map((periodo) => [periodo.id, periodo]));
  periodos.set(novoPeriodo.id, novoPeriodo);
  return {
    ...manifestoAtual,
    versao: Math.max(2, Number(manifestoAtual.versao) || 0),
    atualizadoEm: new Date().toLocaleDateString("pt-BR"),
    periodos: [...periodos.values()].sort((a, b) => a.id.localeCompare(b.id))
  };
}

function mostrarResultado(validacao, competencia) {
  const resultado = $("conv-resultado");
  const aprovado = validacao.duplicidades === 0 && validacao.ufs === 27 && validacao.periodoCompativel && validacao.valoresNegativos === 0;
  const oab = pacoteGerado.grupos.find((grupo) => grupo.escopo === "BR" && grupo.orgao === "OAB");
  resultado.className = `resultado${aprovado ? "" : " erro"}`;
  resultado.innerHTML = `<h3>${aprovado ? "Planilha validada" : "Validação requer atenção"}</h3>
    <dl><div><dt>Processos</dt><dd>${validacao.registros.toLocaleString("pt-BR")}</dd></div><div><dt>UFs</dt><dd>${validacao.ufs}</dd></div><div><dt>Duplicidades</dt><dd>${validacao.duplicidades}</dd></div><div><dt>Processos OAB</dt><dd>${(oab?.processos || 0).toLocaleString("pt-BR")}</dd></div></dl>
    <p><b>Competência:</b> ${competencia} — ${validacao.periodoCompativel ? "todas as datas de deferimento conferem" : "há datas fora do período informado"}.</p>
    <p><b>Tipos de órgão:</b> ${validacao.tiposOrgao.join(", ")}.</p>
    <p><b>Períodos preservados:</b> ${manifestoGerado.periodos.length} competência(s), de ${manifestoGerado.periodos[0].rotulo} a ${manifestoGerado.periodos.at(-1).rotulo}.</p>
    <div class="acoes"><button id="conv-baixar" class="botao principal" type="button" ${aprovado ? "" : "disabled"}>Baixar dados do mês</button><button id="conv-baixar-manifesto" class="botao" type="button" ${aprovado ? "" : "disabled"}>Baixar manifest.json atualizado</button></div>`;
  $("conv-baixar").addEventListener("click", () => baixarArquivo(pacoteGerado, `tempos-${pacoteGerado.periodo}.json`));
  $("conv-baixar-manifesto").addEventListener("click", () => baixarArquivo(manifestoGerado, "manifest.json"));
}

async function processar() {
  if (!arquivoSelecionado) throw new Error("Selecione primeiro uma planilha da Redesim.");
  if (!manifestoAtual) throw new Error("Selecione também o arquivo dados/manifest.json da versão atual do painel.");
  const anoInformado = Number($("conv-ano").value);
  if (!Number.isInteger(anoInformado) || anoInformado < ANO_INICIAL || anoInformado > ANO_FINAL) {
    throw new Error(`Informe um ano entre ${ANO_INICIAL} e ${ANO_FINAL}.`);
  }
  const ano = String(anoInformado), mes = $("conv-mes").value, competencia = `${ano}-${mes}`;
  const botao = $("conv-gerar");
  botao.disabled = true; botao.textContent = "Processando…";
  try {
    const pasta = await arquivoSelecionado.arrayBuffer();
    const livro = XLSX.read(pasta, { type: "array", cellDates: true });
    const nomeAba = livro.SheetNames.find((nome) => normalizar(nome) === "DADOS");
    if (!nomeAba) throw new Error("A aba 'dados' não foi encontrada.");
    const { registros, validacao } = lerRegistros(livro.Sheets[nomeAba], competencia);
    pacoteGerado = {
      versao: 2, periodo: competencia, rotuloPeriodo: `${meses[Number(mes) - 1]} de ${ano}`,
      fonte: "Redesim — Estatísticas CNPJ", fonteUrl: "https://estatistica.redesim.gov.br/tempos-abertura",
      arquivoOrigem: arquivoSelecionado.name, geradoEm: new Date().toISOString(), unidade: "horas úteis",
      definicoes, validacao, orgaos: validacao.tiposOrgao, ufs: [...new Set(registros.map((registro) => registro.uf))].sort(),
      grupos: agregar(registros)
    };
    manifestoGerado = atualizarManifesto();
    mostrarResultado(validacao, competencia);
  } finally {
    botao.disabled = false; botao.textContent = "Validar planilha";
  }
}

$("conv-arquivo").addEventListener("change", (evento) => {
  arquivoSelecionado = evento.target.files[0] || null;
  $("arquivo-nome").textContent = arquivoSelecionado ? arquivoSelecionado.name : "Nenhum arquivo selecionado.";
  pacoteGerado = null; $("conv-resultado").className = "resultado oculto";
});

$("conv-manifesto").addEventListener("change", async (evento) => {
  const arquivo = evento.target.files[0] || null;
  manifestoAtual = null;
  manifestoGerado = null;
  $("manifesto-nome").textContent = arquivo ? arquivo.name : "Nenhum manifesto selecionado.";
  $("conv-resultado").className = "resultado oculto";
  if (!arquivo) return;
  try {
    manifestoAtual = validarManifesto(JSON.parse(await arquivo.text()));
    $("manifesto-nome").textContent = `${arquivo.name} — ${manifestoAtual.periodos.length} período(s) encontrado(s).`;
  } catch (erro) {
    $("manifesto-nome").textContent = erro.message;
  }
});

$("conv-gerar").addEventListener("click", () => {
  setTimeout(() => processar().catch((erro) => {
    const resultado = $("conv-resultado");
    resultado.className = "resultado erro";
    resultado.innerHTML = `<h3>Não foi possível gerar o arquivo</h3><p>${erro.message}</p>`;
    $("conv-gerar").disabled = false; $("conv-gerar").textContent = "Validar planilha";
  }), 50);
});
