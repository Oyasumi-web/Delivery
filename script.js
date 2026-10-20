/* ===== DADOS =====
   Tudo fica no localStorage (o "banco" do navegador).
   Cada pedido é um objeto assim:
   { id, data, cliente, valor, pagamento, obs, entrega, rua, numero, cep, status } */
const FORMAS = ["Dinheiro", "Débito", "Crédito", "Pix", "Convênio", "Ifood"];
const COLUNAS = ["Separado", "Retirado", "Entregando", "Concluído", "Cancelado"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

let pedidos = lerLista("pedidos_v1");
let exportados = lerLista("dias_exportados"); // dias que já tiveram planilha gerada
let editandoId = null;   // id do pedido sendo editado (null = pedido novo)
let rascunho = null;     // pedido esperando a resposta de "será entrega?"
let eEntrega = true;     // resposta da janela (Sim é o padrão)
let obsAbertas = [];     // observações abertas no relatório

function lerLista(chave) {
    try { return JSON.parse(localStorage.getItem(chave)) || []; }
    catch { return []; }
}

function guardar() {
    try {
        localStorage.setItem("pedidos_v1", JSON.stringify(pedidos));
        localStorage.setItem("dias_exportados", JSON.stringify(exportados));
    } catch { }
}

/* ===== FUNÇÕES AJUDANTES ===== */
function pegar(id) { return document.getElementById(id); }

function moeda(n) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function dataBR(iso) { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }

// Transforma "12,50" em 12.5
function lerValor(texto) {
    const n = parseFloat(texto.trim().replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? null : Math.round(n * 100) / 100;
}

// Impede que texto digitado vire código HTML
function esc(texto) {
    const d = document.createElement("div");
    d.textContent = texto;
    return d.innerHTML;
}

// Devolve o dia no formato 2026-10-15 (bom para ordenar e separar em pastas)
function diaDe(iso) {
    const d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function hoje() { return diaDe(new Date().toISOString()); }

function enderecoTexto(p) {
    if (!p.entrega) return "Retirada no balcão";
    return p.rua + ", " + p.numero + (p.cep ? " - CEP " + p.cep : "");
}

function totais(lista) {
    const porForma = {};
    FORMAS.forEach(function (f) { porForma[f] = 0; });
    let geral = 0;
    lista.forEach(function (p) { porForma[p.pagamento] += p.valor; geral += p.valor; });
    return { porForma: porForma, geral: geral };
}

/* ===== MENU: TROCA DE ABAS ===== */
document.querySelectorAll("nav button").forEach(function (botao) {
    botao.onclick = function () {
        document.querySelectorAll("nav button, section").forEach(function (e) { e.classList.remove("ativo", "ativa"); });
        botao.classList.add("ativo");
        pegar(botao.dataset.aba).classList.add("ativa");
    };
});

function irPara(aba) { document.querySelector('nav button[data-aba="' + aba + '"]').click(); }

/* ===== OLHO (observação) ===== */
pegar("olho").onclick = function () {
    const abrir = pegar("obsBox").hidden;
    mostrarObs(abrir);
    if (abrir) pegar("obs").focus();
};
pegar("obs").oninput = marcarOlho;

function mostrarObs(abrir) { pegar("obsBox").hidden = !abrir; marcarOlho(); }

function marcarOlho() { pegar("olho").classList.toggle("tem", pegar("obs").value.trim() !== ""); }

/* ===== FORMULÁRIO ===== */
pegar("enviar").onclick = function () {
    const cliente = pegar("cliente").value.trim();
    const valor = lerValor(pegar("valor").value);
    const pagamento = pegar("pagamento").value;
    const obs = pegar("obs").value.trim();

    if (!cliente) { pegar("erro").textContent = "Informe o nome do cliente."; return; }
    if (valor === null || valor <= 0) { pegar("erro").textContent = "Informe um valor maior que zero."; return; }

    if (editandoId) {
        // Editando: só atualiza os dados, não pergunta a entrega de novo
        const p = pedidos.find(function (x) { return x.id === editandoId; });
        Object.assign(p, { cliente: cliente, valor: valor, pagamento: pagamento, obs: obs });
        guardar(); limparForm(); renderizar();
    } else {
        // Pedido novo: guarda um rascunho e pergunta se é entrega
        rascunho = { cliente: cliente, valor: valor, pagamento: pagamento, obs: obs };
        abrirModal();
    }
};

pegar("cancelar").onclick = limparForm;

function limparForm() {
    editandoId = null;
    pegar("cliente").value = "";
    pegar("valor").value = "";
    pegar("pagamento").value = "Pix";
    pegar("obs").value = "";
    mostrarObs(false);
    pegar("erro").textContent = "";
    pegar("enviar").textContent = "Enviar pedido";
    pegar("cancelar").hidden = true;
}

// Devolve os dados do pedido para os campos
function editarNoForm(id) {
    const p = pedidos.find(function (x) { return x.id === id; });
    editandoId = id;
    pegar("cliente").value = p.cliente;
    pegar("valor").value = String(p.valor).replace(".", ",");
    pegar("pagamento").value = p.pagamento;
    pegar("obs").value = p.obs || "";
    mostrarObs(!!p.obs);
    pegar("enviar").textContent = "Salvar alterações";
    pegar("cancelar").hidden = false;
    irPara("pedidos");
    pegar("cliente").focus();
}

function excluir(id) {
    if (!confirm("Excluir este pedido?")) return;
    pedidos = pedidos.filter(function (p) { return p.id !== id; });
    if (editandoId === id) limparForm();
    guardar(); renderizar();
}

/* ===== JANELA "SERÁ ENTREGA?" ===== */
function abrirModal() {
    definirEntrega(true); // Sim é o padrão
    pegar("rua").value = "";
    pegar("numero").value = "";
    pegar("cep").value = "";
    pegar("erro_modal").textContent = "";
    pegar("modal").hidden = false;
}

function definirEntrega(sim) {
    eEntrega = sim;
    pegar("btn_sim").classList.toggle("marcado", sim);
    pegar("btn_nao").classList.toggle("marcado", !sim);
    pegar("campos_entrega").hidden = !sim; // só mostra os campos se for "Sim"
}

pegar("btn_sim").onclick = function () { definirEntrega(true); };
pegar("btn_nao").onclick = function () { definirEntrega(false); };
pegar("voltar").onclick = function () { pegar("modal").hidden = true; };

pegar("confirmar").onclick = function () {
    const rua = pegar("rua").value.trim();
    const numero = pegar("numero").value.trim();
    const cep = pegar("cep").value.trim(); // opcional

    if (eEntrega && (!rua || !numero)) {
        pegar("erro_modal").textContent = "Informe o nome da rua e o número.";
        return;
    }

    pedidos.push({
        id: Date.now(),
        data: new Date().toISOString(),
        cliente: rascunho.cliente,
        valor: rascunho.valor,
        pagamento: rascunho.pagamento,
        obs: rascunho.obs,
        entrega: eEntrega,
        rua: eEntrega ? rua : "",
        numero: eEntrega ? numero : "",
        cep: eEntrega ? cep : "",
        status: "Separado" // todo pedido novo começa na 1ª coluna
    });
    guardar();
    pegar("modal").hidden = true;
    limparForm();
    renderizar();
};

/* ===== DESENHAR AS TELAS ===== */
function renderizar() {
    renderUltimos();
    renderQuadro();
    renderArvore();
    renderRelatorio();
}

function renderUltimos() {
    const ultimos = pedidos.slice(-3).reverse();
    if (!ultimos.length) { pegar("ultimos").innerHTML = '<div class="vazio">Nenhum pedido enviado ainda.</div>'; return; }
    pegar("ultimos").innerHTML = ultimos.map(function (p) {
        return `<div class="ultimo">
            <div class="info"><strong>${esc(p.cliente)}</strong><br><small>${p.pagamento} · ${dataBR(p.data)}</small></div>
            <strong>${moeda(p.valor)}</strong>
            <button class="btn_ultimo" data-edit="${p.id}">Modificar</button>
            <button class="btn_ultimo del" data-del="${p.id}">Excluir</button>
        </div>`;
    }).join("");
}

pegar("ultimos").onclick = function (e) {
    if (e.target.dataset.edit) editarNoForm(+e.target.dataset.edit);
    if (e.target.dataset.del) excluir(+e.target.dataset.del);
};

/* ----- Quadro do entregador (arrastar e soltar) ----- */
function renderQuadro() {
    pegar("quadro").innerHTML = COLUNAS.map(function (coluna) {
        // Mostra só as entregas de hoje que estão nessa coluna
        const cartoes = pedidos.filter(function (p) {
            return p.entrega && p.status === coluna && diaDe(p.data) === hoje();
        }).map(function (p) {
            const botao = coluna !== "Concluído" ? `<button class="mini" data-avancar="${p.id}">Avançar ›</button>` : "";
            return `<div class="card_entrega" draggable="true" data-id="${p.id}">
                <strong>${esc(p.cliente)}</strong> · ${moeda(p.valor)}
                <small>${esc(enderecoTexto(p))}</small>${botao}
            </div>`;
        }).join("");
        return `<div class="coluna" data-coluna="${coluna}"><h3>${coluna}</h3>${cartoes || '<p class="vazio">Vazio</p>'}</div>`;
    }).join("");
}

function moverPedido(id, novoStatus) {
    pedidos.find(function (p) { return p.id === id; }).status = novoStatus;
    guardar(); renderizar();
}

const quadro = pegar("quadro");
// 1) ao começar a arrastar, guarda o id do cartão
quadro.ondragstart = function (e) {
    const cartao = e.target.closest(".card_entrega");
    if (cartao) e.dataTransfer.setData("text/plain", cartao.dataset.id);
};
// 2) o navegador só permite soltar se cancelarmos o comportamento padrão
quadro.ondragover = function (e) { e.preventDefault(); };
// 3) ao soltar, descobre a coluna e muda o status
quadro.ondrop = function (e) {
    e.preventDefault();
    const coluna = e.target.closest(".coluna");
    const id = +e.dataTransfer.getData("text/plain");
    if (coluna && id) moverPedido(id, coluna.dataset.coluna);
};
// Botão "Avançar" (útil no celular, onde arrastar é difícil)
quadro.onclick = function (e) {
    if (!e.target.dataset.avancar) return;
    const p = pedidos.find(function (x) { return x.id === +e.target.dataset.avancar; });
    moverPedido(p.id, COLUNAS[COLUNAS.indexOf(p.status) + 1]);
};

/* ----- Histórico em pastas: ano > mês > dia ----- */
function renderArvore() {
    if (!pedidos.length) { pegar("arvore").innerHTML = '<div class="vazio">Sem pedidos no histórico.</div>'; return; }

    // Agrupa: arvore["2026"]["10"]["2026-10-15"] = [pedidos...]
    const arvore = {};
    pedidos.forEach(function (p) {
        const dia = diaDe(p.data);
        const partes = dia.split("-");
        arvore[partes[0]] = arvore[partes[0]] || {};
        arvore[partes[0]][partes[1]] = arvore[partes[0]][partes[1]] || {};
        arvore[partes[0]][partes[1]][dia] = arvore[partes[0]][partes[1]][dia] || [];
        arvore[partes[0]][partes[1]][dia].push(p);
    });

    let html = "";
    Object.keys(arvore).sort().reverse().forEach(function (ano) {
        html += `<details class="pasta" open><summary>📁 ${ano}</summary>`;
        Object.keys(arvore[ano]).sort().reverse().forEach(function (mes) {
            html += `<details class="pasta"><summary>📁 ${MESES[+mes - 1]}</summary>`;
            Object.keys(arvore[ano][mes]).sort().reverse().forEach(function (dia) {
                const lista = arvore[ano][mes][dia];
                const linhas = lista.map(function (p) {
                    const hora = new Date(p.data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                    return `<tr><td>${hora}</td><td>${esc(p.cliente)}</td><td>${p.pagamento}</td><td>${moeda(p.valor)}</td>
                        <td class="lapis"><button data-lapis="${p.id}" title="Editar">✏️</button></td></tr>`;
                }).join("");
                html += `<details class="pasta"><summary>📄 ${dia.split("-").reverse().join("/")} — ${lista.length} pedido(s) — ${moeda(totais(lista).geral)}</summary>
                    <div class="tabela"><table>${linhas}</table></div></details>`;
            });
            html += "</details>";
        });
        html += "</details>";
    });
    pegar("arvore").innerHTML = html;
}

pegar("arvore").onclick = function (e) {
    if (e.target.dataset.lapis) editarNoForm(+e.target.dataset.lapis);
};

/* ----- Relatório (só o dia de hoje) ----- */
function renderRelatorio() {
    // Só mostra os pedidos de hoje → não acumula dias anteriores
    const deHoje = pedidos.filter(function (p) {
        return diaDe(p.data) === hoje();
    });

    const t = totais(deHoje);
    pegar("resumo").innerHTML = FORMAS.map(function (f) {
        return `<div><small>${f}</small><strong>${moeda(t.porForma[f])}</strong></div>`;
    }).join("") + `<div class="total"><small>Total geral</small><strong>${moeda(t.geral)}</strong></div>`;

    if (!deHoje.length) {
        pegar("corpo_relatorio").innerHTML = '<tr><td colspan="5" class="vazio">Sem pedidos hoje.</td></tr>';
        return;
    }

    pegar("corpo_relatorio").innerHTML = deHoje.slice().reverse().map(function (p) {
        const olho = p.obs ? `<button class="olho_rel" data-obs="${p.id}">👁️</button>` : "";
        const detalhe = p.obs && obsAbertas.includes(p.id)
            ? `<tr class="linha_obs"><td colspan="5"><strong>Observação:</strong> ${esc(p.obs)}</td></tr>` : "";
        return `<tr><td>${dataBR(p.data)}</td><td>${esc(p.cliente)}</td><td>${p.pagamento}</td><td>${moeda(p.valor)}</td><td>${olho}</td></tr>` + detalhe;
    }).join("");
}

pegar("corpo_relatorio").onclick = function (e) {
    const id = +e.target.dataset.obs;
    if (!id) return;
    obsAbertas = obsAbertas.includes(id) ? obsAbertas.filter(function (x) { return x !== id; }) : obsAbertas.concat(id);
    renderRelatorio();
};

/* ===== EXPORTAR PARA EXCEL =====
   Monta uma tabela HTML e salva como .xls (o Excel abre normalmente). */
function gerarPlanilha(lista, nomeArquivo) {
    const t = totais(lista);
    const linha = function (...c) { return "<tr>" + c.map(function (x) { return `<td>${x}</td>`; }).join("") + "</tr>"; };
    const num = function (n) { return String(n).replace(".", ","); };

    let html = "<table border='1'>" + linha("<b>Data</b>", "<b>Cliente</b>", "<b>Pagamento</b>", "<b>Valor (R$)</b>", "<b>Entrega</b>", "<b>Observação</b>");
    lista.forEach(function (p) {
        html += linha(dataBR(p.data), esc(p.cliente), p.pagamento, num(p.valor), esc(enderecoTexto(p)), esc(p.obs || ""));
    });
    html += linha("", "", "", "", "", "");
    FORMAS.forEach(function (f) { html += linha("", "", `<b>Total ${f}</b>`, num(t.porForma[f]), "", ""); });
    html += linha("", "", "<b>TOTAL GERAL</b>", `<b>${num(t.geral)}</b>`, "", "") + "</table>";

    const arquivo = new Blob(["\ufeff<meta charset='UTF-8'>" + html], { type: "application/vnd.ms-excel" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(arquivo);
    link.download = nomeArquivo + ".xls";
    link.click();
    URL.revokeObjectURL(link.href);
}

// Botão manual: exporta tudo e marca todos os dias como já exportados
pegar("exportar").onclick = function () {
    if (!pedidos.length) { alert("Não há pedidos para exportar."); return; }
    gerarPlanilha(pedidos, "relatorio-pedidos");
    pedidos.forEach(function (p) {
        if (!exportados.includes(diaDe(p.data))) exportados.push(diaDe(p.data));
    });
    guardar();
};

/* ===== FECHAMENTO AUTOMÁTICO DO DIA =====
   Se um dia terminou (ou já são 23:59) e ninguém gerou o relatório,
   o site baixa a planilha daquele dia sozinho. Só funciona com a página aberta
   (ou na próxima vez que ela for aberta, para os dias que ficaram para trás). */
function verificarFechamento() {
    const agora = new Date();
    const fimDoDia = agora.getHours() === 23 && agora.getMinutes() >= 59;
    const dias = [];
    pedidos.forEach(function (p) { if (!dias.includes(diaDe(p.data))) dias.push(diaDe(p.data)); });

    dias.forEach(function (dia) {
        const terminou = dia < hoje() || fimDoDia;
        if (terminou && !exportados.includes(dia)) {
            const doDia = pedidos.filter(function (p) { return diaDe(p.data) === dia; });
            gerarPlanilha(doDia, "pedidos-" + dia);
            exportados.push(dia);
            guardar();
        }
    });
}

/* ===== INÍCIO ===== */
renderizar();
verificarFechamento();
setInterval(verificarFechamento, 60000); // confere a cada 1 minuto