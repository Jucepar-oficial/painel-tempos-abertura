const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
const selecao = {
  periodo: parametros.get("periodo") || "",
  orgao: parametros.get("orgao") || "TODOS",
  uf: parametros.get("uf") || "PR",
  municipio: parametros.get("municipio") || ""
};

const nomesOrgao = {
  "TODOS": "Todos os órgãos", "ATO LEGAL": "Ato Legal", "JUNTA COMERCIAL": "Junta Comercial",
  "CARTÓRIO DE REGISTRO DE PJ": "Cartório de Registro de PJ", "NÃO INFORMADO": "Não informado", "OAB": "OAB"
};
const nomesUf = {
  AC:"Acre",AL:"Alagoas",AP:"Amapá",AM:"Amazonas",BA:"Bahia",CE:"Ceará",DF:"Distrito Federal",ES:"Espírito Santo",
  GO:"Goiás",MA:"Maranhão",MT:"Mato Grosso",MS:"Mato Grosso do Sul",MG:"Minas Gerais",PA:"Pará",PB:"Paraíba",
  PR:"Paraná",PE:"Pernambuco",PI:"Piauí",RJ:"Rio de Janeiro",RN:"Rio Grande do Norte",RS:"Rio Grande do Sul",
  RO:"Rondônia",RR:"Roraima",SC:"Santa Catarina",SP:"São Paulo",SE:"Sergipe",TO:"Tocantins"
};
const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const mesesCurtos = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const metricas = [
  { chave:"total_oficial", titulo:"Tempo Total de Abertura", curto:"Tempo total", descricao:"Soma da Consulta Prévia Total, da Validação Cadastral e do Tempo de Registro." },
  { chave:"cp_total", titulo:"Tempo de Consulta Prévia Total", curto:"CP Total", descricao:"Considera, em cada protocolo, a consulta prévia que terminou por último entre nome e endereço." },
  { chave:"cp_nome", titulo:"Tempo de Consulta Prévia de Nome", curto:"CP de Nome", descricao:"Tempo entre a solicitação e a conclusão da análise de nome pela Junta Comercial, OAB ou órgão competente." },
  { chave:"cp_endereco", titulo:"Tempo de Consulta Prévia de Endereço", curto:"CP de Endereço", descricao:"Tempo da análise locacional, normalmente sob responsabilidade da prefeitura do município da empresa." },
  { chave:"validacao", titulo:"Tempo de Validação Cadastral", curto:"Validação Cadastral", descricao:"Tempo utilizado na etapa de validação cadastral pelos órgãos participantes do processo de abertura." },
  { chave:"registro", titulo:"Tempo de Registro", curto:"Registro", descricao:"Tempo de análise do processo pelo órgão de registro, excluídos os períodos em exigência atribuídos ao usuário." }
];

let manifest;
let dadosAtual;
let dadosAnterior = null;
let periodoAnterior = null;
let serieAnual = new Map();

function escapar(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[caractere]);
}
function numero(valor, casas = 0) {
  return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function duracao(horas) {
  const segundos = Math.max(0, Math.round(Number(horas || 0) * 3600));
  const dias = Math.floor(segundos / 86400);
  const resto = segundos % 86400;
  const h = Math.floor(resto / 3600);
  const m = Math.floor((resto % 3600) / 60);
  const s = resto % 60;
  if (dias) return `${dias}d ${h}h ${m}min`;
  if (h) return `${h}h ${m}min ${s}s`;
  if (m) return `${m}min ${s}s`;
  return `${s}s`;
}
function variacao(atual, anterior) {
  if (anterior == null || anterior === 0) return null;
  return (atual - anterior) / anterior * 100;
}
function formatarVariacao(valor) {
  if (valor == null) return "—";
  const sinal = valor > 0 ? "+" : "";
  return `${sinal}${numero(valor, 1)}%`;
}
function ordinal(valor) { return valor ? `${valor}º` : "—"; }
function idAnterior(id) {
  const [ano, mes] = id.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 2, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2,"0")}`;
}
function localSelecionado() {
  if (selecao.municipio) return `${selecao.municipio}/${selecao.uf}`;
  if (selecao.uf === "BR") return "Brasil";
  return `${nomesUf[selecao.uf] || selecao.uf} (${selecao.uf})`;
}
function escopoAtual() {
  return selecao.municipio ? "MUN" : selecao.uf === "BR" ? "BR" : "UF";
}
function encontrarGrupo(dados, orgao = selecao.orgao, uf = selecao.uf, municipio = selecao.municipio) {
  const escopo = municipio ? "MUN" : uf === "BR" ? "BR" : "UF";
  return dados?.grupos.find((grupo) => grupo.escopo === escopo && grupo.uf === uf && (grupo.municipio || "") === municipio && grupo.orgao === orgao);
}
function gruposComparaveis(dados) {
  if (!dados) return [];
  if (selecao.municipio) return dados.grupos.filter((grupo) => grupo.escopo === "MUN" && grupo.uf === selecao.uf && grupo.orgao === selecao.orgao && grupo.processos > 0);
  return dados.grupos.filter((grupo) => grupo.escopo === "UF" && grupo.orgao === selecao.orgao && grupo.processos > 0);
}
function identificadorGrupo(grupo) {
  return grupo.escopo === "MUN" ? `${grupo.uf}|${grupo.municipio}` : grupo.uf;
}
function nomeGrupo(grupo) {
  return grupo.escopo === "MUN" ? grupo.municipio : `${nomesUf[grupo.uf] || grupo.uf} (${grupo.uf})`;
}
function ranking(dados, metrica, porVolume = false) {
  return gruposComparaveis(dados).sort((a,b) => porVolume ? b.processos - a.processos : a.metricas[metrica].media - b.metricas[metrica].media);
}
function posicaoSelecionada(lista) {
  if (selecao.uf === "BR" && !selecao.municipio) return null;
  const id = selecao.municipio ? `${selecao.uf}|${selecao.municipio}` : selecao.uf;
  const indice = lista.findIndex((grupo) => identificadorGrupo(grupo) === id);
  return indice >= 0 ? indice + 1 : null;
}
async function carregarJson(caminho) {
  const resposta = await fetch(caminho, { cache:"no-store" });
  if (!resposta.ok) throw new Error(`Não foi possível carregar ${caminho}.`);
  return resposta.json();
}
async function carregarDados(item) {
  return carregarJson(`dados/${item.arquivo}?v=${manifest.versao}`);
}
function cabecalhoPagina(subtitulo) {
  return `<header class="cabecalho-relatorio"><img src="imagens/jucepar-logo-horizontal.png" alt="Jucepar"><div class="identificacao"><small>Estado do Paraná · Secretaria da Indústria, Comércio e Serviços</small><strong>${escapar(subtitulo)}</strong></div></header>`;
}
function rodapePagina(numeroPagina, totalPaginas) {
  return `<footer class="rodape-pagina"><span>Fonte: Redesim - Estatísticas CNPJ · Dados agregados</span><span>${numeroPagina}/${totalPaginas}</span></footer>`;
}
function composicaoHtml(grupo) {
  const itens = [["cp_total","Consulta Prévia Total"],["validacao","Validação Cadastral"],["registro","Tempo de Registro"]];
  const maximo = Math.max(...itens.map(([chave]) => grupo.metricas[chave].media), .0001);
  return `<div class="composicao">${itens.map(([chave,rotulo]) => { const valor=grupo.metricas[chave].media; return `<div class="linha-composicao"><span>${rotulo}</span><b>${duracao(valor)}</b><div><i style="width:${Math.max(.7,valor/maximo*100)}%"></i></div></div>`; }).join("")}</div>`;
}
function resumoExecutivo(grupo) {
  const totalAnterior = encontrarGrupo(dadosAnterior)?.metricas.total_oficial.media ?? null;
  const rankTempo = posicaoSelecionada(ranking(dadosAtual,"total_oficial"));
  const rankVolume = posicaoSelecionada(ranking(dadosAtual,"total_oficial",true));
  const nacional = dadosAtual.grupos.find((item) => item.escopo === "BR" && item.uf === "BR" && item.orgao === selecao.orgao);
  const comparacao = variacao(grupo.metricas.total_oficial.media,totalAnterior);
  const avisos = (manifest.avisos || []).map((aviso) => `<li>${escapar(aviso)}</li>`).join("");
  const linhasResumo = metricas.map((metrica) => {
    const atual = grupo.metricas[metrica.chave].media;
    const anterior = encontrarGrupo(dadosAnterior)?.metricas?.[metrica.chave]?.media ?? null;
    return `<tr><td>${metrica.curto}</td><td><strong>${duracao(atual)}</strong></td><td>${anterior == null ? "—" : duracao(anterior)}</td><td>${formatarVariacao(variacao(atual,anterior))}</td></tr>`;
  }).join("");
  return `<section class="pagina-relatorio capa-executiva">${cabecalhoPagina("Relatório mensal de tempos de abertura")}
    <div class="titulo-pagina"><small>Painel mensal</small><h1>Tempos de Abertura de Empresas</h1><p>${escapar(dadosAtual.rotuloPeriodo)} · relatório gerado automaticamente a partir dos dados publicados pela Redesim.</p></div>
    <div class="faixa-recorte"><strong>${escapar(localSelecionado())}</strong><span>${escapar(nomesOrgao[selecao.orgao] || selecao.orgao)}</span></div>
    <div class="cards-resumo">
      <article class="card-resumo principal"><span>Tempo médio total</span><strong>${duracao(grupo.metricas.total_oficial.media)}</strong><small>Média em horas úteis</small></article>
      <article class="card-resumo"><span>Processos</span><strong>${numero(grupo.processos)}</strong><small>Protocolos considerados</small></article>
      <article class="card-resumo"><span>Posição por tempo</span><strong>${rankTempo ? ordinal(rankTempo) : "Brasil"}</strong><small>${selecao.municipio ? "Entre municípios com dados" : selecao.uf === "BR" ? "Referência nacional" : "Entre as UFs"}</small></article>
      <article class="card-resumo"><span>Posição por movimento</span><strong>${rankVolume ? ordinal(rankVolume) : "—"}</strong><small>${selecao.uf === "BR" ? `${numero(nacional?.processos || 0)} processos no Brasil` : "Volume de processos"}</small></article>
    </div>
    <div class="duas-colunas-relatorio">
      <div class="bloco"><h3>Leitura executiva</h3><p class="destaque-texto">O recorte apresentou tempo médio total de ${duracao(grupo.metricas.total_oficial.media)}, com ${numero(grupo.processos)} processos.</p><p>${totalAnterior == null ? "Não há competência imediatamente anterior publicada para comparação." : `Em relação a ${escapar(periodoAnterior.rotulo)}, a variação foi de ${formatarVariacao(comparacao)}. Valores negativos indicam redução do tempo.`}</p><p>No Brasil, o mesmo indicador foi de ${duracao(nacional?.metricas.total_oficial.media || 0)}, considerando ${numero(nacional?.processos || 0)} processos.</p></div>
      <div class="bloco"><h3>Composição do tempo oficial</h3>${composicaoHtml(grupo)}</div>
    </div>
    <table class="resumo-metricas"><thead><tr><th>Indicador</th><th>${escapar(dadosAtual.rotuloPeriodo)}</th><th>Competência anterior</th><th>Variação</th></tr></thead><tbody>${linhasResumo}</tbody></table>
    <div class="aviso-relatorio"><strong>Nota metodológica.</strong> O tempo total oficial corresponde à soma da Consulta Prévia Total, Validação Cadastral e Registro. CP Total considera a etapa que terminou por último entre nome e endereço. Tempos do usuário não integram o total oficial.${avisos ? `<ul>${avisos}</ul>` : ""}</div>
    ${rodapePagina(1,metricas.length+1)}</section>`;
}
function limitarRanking(lista) {
  if (lista.length <= 27) return lista;
  const selecionado = posicaoSelecionada(lista);
  const recorte = lista.slice(0,26);
  if (selecionado && selecionado > 26) recorte.push(lista[selecionado-1]);
  return recorte;
}
function graficoSerie(metrica) {
  const [anoTexto,mesTexto] = selecao.periodo.split("-");
  const limite = Number(mesTexto);
  const pontos = Array.from({length:limite},(_,indice) => {
    const id=`${anoTexto}-${String(indice+1).padStart(2,"0")}`;
    const grupo=encontrarGrupo(serieAnual.get(id));
    return {indice,mes:mesesCurtos[indice],valor:grupo?.metricas?.[metrica.chave]?.media ?? null};
  });
  const validos=pontos.filter((ponto)=>ponto.valor!=null);
  if(!validos.length) return `<div class="sem-dados">Não há dados para a evolução anual.</div>`;
  const w=700,h=165,m={e:48,d:16,t:28,b:30},wu=w-m.e-m.d,hu=h-m.t-m.b;
  const max=Math.max(...validos.map((p)=>p.valor),.01)*1.2;
  const x=(i)=>pontos.length===1?m.e+wu/2:m.e+i*wu/(pontos.length-1);
  const y=(v)=>m.t+hu-(v/max)*hu;
  const grade=Array.from({length:4},(_,i)=>{const v=max*(3-i)/3,py=m.t+hu*i/3;return `<line class="grade" x1="${m.e}" y1="${py}" x2="${w-m.d}" y2="${py}"/><text class="rotulo" x="${m.e-6}" y="${py+3}" text-anchor="end">${v<1?`${numero(v*60,0)}m`:`${numero(v,1)}h`}</text>`;}).join("");
  const trechos=[];let atual=[];pontos.forEach((p)=>{if(p.valor==null){if(atual.length)trechos.push(atual);atual=[];}else atual.push(p);});if(atual.length)trechos.push(atual);
  const linhas=trechos.map((trecho)=>`<polyline class="serie" points="${trecho.map((p)=>`${x(p.indice)},${y(p.valor)}`).join(" ")}"/>`).join("");
  const marcas=pontos.map((p)=>{const px=x(p.indice),mes=`<text class="rotulo" x="${px}" y="${h-8}" text-anchor="middle">${p.mes}</text>`;if(p.valor==null)return `${mes}<text class="ausente" x="${px}" y="${m.t+hu-6}" text-anchor="middle">—</text>`;const py=y(p.valor);return `${mes}<circle class="ponto" cx="${px}" cy="${py}" r="4"/><text class="valor" x="${px}" y="${Math.max(10,py-8)}" text-anchor="middle">${duracao(p.valor)}</text>`;}).join("");
  return `<div class="grafico-relatorio"><h3>Evolução de ${escapar(metrica.curto)} - ${escapar(localSelecionado())} - ${anoTexto}</h3><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolução mensal de ${escapar(metrica.curto)}">${grade}<line class="eixo" x1="${m.e}" y1="${m.t+hu}" x2="${w-m.d}" y2="${m.t+hu}"/>${linhas}${marcas}</svg></div>`;
}
function paginaMetrica(metrica,indicePagina) {
  const grupo=encontrarGrupo(dadosAtual);
  const grupoAnterior=encontrarGrupo(dadosAnterior);
  const lista=ranking(dadosAtual,metrica.chave);
  const listaAnterior=ranking(dadosAnterior,metrica.chave);
  const mapaAnterior=new Map(listaAnterior.map((item,indice)=>[identificadorGrupo(item),indice+1]));
  const posicao=posicaoSelecionada(lista);
  const posicaoAnterior=posicaoSelecionada(listaAnterior);
  const atual=grupo.metricas[metrica.chave].media;
  const anterior=grupoAnterior?.metricas?.[metrica.chave]?.media ?? null;
  const delta=variacao(atual,anterior);
  const linhas=limitarRanking(lista).map((item,indice)=>{
    const posicaoReal=lista.indexOf(item)+1;
    const selecionado=(selecao.municipio?identificadorGrupo(item)===`${selecao.uf}|${selecao.municipio}`:item.uf===selecao.uf)&&selecao.uf!=="BR";
    return `<tr class="${selecionado?"selecionado":""}"><td>${ordinal(posicaoReal)}</td><td>${escapar(nomeGrupo(item))}</td><td>${duracao(item.metricas[metrica.chave].media)}</td><td>${numero(item.processos)}</td><td>${ordinal(mapaAnterior.get(identificadorGrupo(item)))}</td></tr>`;
  }).join("");
  const universo=selecao.municipio?`municípios de ${selecao.uf}`:"unidades da Federação";
  const narrativa=posicao
    ? `Em ${escapar(dadosAtual.rotuloPeriodo)}, ${escapar(localSelecionado())} apresentou o <strong>${ordinal(posicao)} melhor resultado</strong> entre ${universo}, com ${duracao(atual)}. ${anterior==null?"Não há competência imediatamente anterior publicada para comparação.":`Na competência anterior, ocupava a ${ordinal(posicaoAnterior)} posição, com ${duracao(anterior)}; a variação do tempo foi de ${formatarVariacao(delta)}.`}`
    : `Em ${escapar(dadosAtual.rotuloPeriodo)}, o Brasil registrou ${duracao(atual)} neste indicador, considerando ${numero(grupo.processos)} processos.`;
  return `<section class="pagina-relatorio folha-metrica">${cabecalhoPagina(`Tempos médios - ${dadosAtual.rotuloPeriodo}`)}
    <div class="titulo-pagina"><small>Indicador ${indicePagina-1} de ${metricas.length}</small><h2>${escapar(metrica.titulo)}</h2></div>
    <p class="descricao-metrica">${escapar(metrica.descricao)}</p>
    <div class="metricas-faixa"><article class="mini-card principal"><span>Resultado atual</span><strong>${duracao(atual)}</strong><small>${escapar(localSelecionado())}</small></article><article class="mini-card"><span>Processos</span><strong>${numero(grupo.processos)}</strong><small>no recorte</small></article><article class="mini-card"><span>Posição atual</span><strong>${posicao?ordinal(posicao):"Brasil"}</strong><small>${posicao?`entre ${universo}`:"referência nacional"}</small></article><article class="mini-card"><span>Variação mensal</span><strong>${formatarVariacao(delta)}</strong><small>${anterior==null?"sem comparação":`anterior: ${duracao(anterior)}`}</small></article></div>
    <p class="narrativa">${narrativa}</p>
    <table class="tabela-ranking"><caption>Ranking de ${escapar(metrica.curto)} - ${escapar(dadosAtual.rotuloPeriodo)}</caption><thead><tr><th>RK</th><th>${selecao.municipio?"Município":"Estado / UF"}</th><th>Tempo médio</th><th>Processos</th><th>${periodoAnterior?escapar(periodoAnterior.rotulo.replace(/ de \d{4}$/,"")):"Mês anterior"}</th></tr></thead><tbody>${linhas}</tbody></table>
    ${graficoSerie(metrica)}${rodapePagina(indicePagina,metricas.length+1)}</section>`;
}
async function iniciar() {
  manifest=await carregarJson(`dados/manifest.json?v=${Date.now()}`);
  const item=manifest.periodos.find((periodo)=>periodo.id===selecao.periodo) || manifest.periodos.at(-1);
  if(!item) throw new Error("Nenhuma competência está disponível.");
  selecao.periodo=item.id;
  dadosAtual=await carregarDados(item);
  const grupo=encontrarGrupo(dadosAtual);
  if(!grupo) throw new Error(`Não há processos para ${localSelecionado()} no recorte selecionado.`);
  periodoAnterior=manifest.periodos.find((periodo)=>periodo.id===idAnterior(selecao.periodo)) || null;
  const [anoTexto,mesTexto]=selecao.periodo.split("-");
  const itensAno=manifest.periodos.filter((periodo)=>periodo.id.startsWith(`${anoTexto}-`)&&Number(periodo.id.slice(5))<=Number(mesTexto));
  const requisicoes=itensAno.map(async(periodo)=>[periodo.id,periodo.id===selecao.periodo?dadosAtual:await carregarDados(periodo)]);
  const carregados=await Promise.all(requisicoes);
  serieAnual=new Map(carregados);
  if(periodoAnterior){
    dadosAnterior=serieAnual.get(periodoAnterior.id) || await carregarDados(periodoAnterior);
  }
  document.title=`Relatório Tempos de Abertura - ${selecao.periodo} - ${selecao.municipio||selecao.uf}`;
  $("relatorio").innerHTML=resumoExecutivo(grupo)+metricas.map((metrica,indice)=>paginaMetrica(metrica,indice+2)).join("");
}

$("imprimir").addEventListener("click",()=>window.print());
$("voltar").addEventListener("click",()=>{ if(history.length>1) history.back(); else window.close(); });
iniciar().catch((erro)=>{
  console.error(erro);
  $("relatorio").innerHTML=`<div class="erro"><div><strong>Não foi possível preparar o relatório.</strong><p>${escapar(erro.message)}</p></div></div>`;
  $("imprimir").disabled=true;
});
