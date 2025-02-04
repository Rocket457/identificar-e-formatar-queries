const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const sqlFormatter = require('sql-formatter');

console.log("Iniciando processamento...");

// Configurações
const EXTENSIONS_RELEVANTES = ['.sql', '.java', '.js', '.py'];
const OUTPUT_DIR = './queries_extraidas';
const DELIMITADOR = '---\n';

// Configuração do dialecto SQL
const dialecto = {
    language: 'mysql', // Altere para 'mysql', 'sqlite', etc., conforme necessário
    tabWidth: 4,
    linesBetweenQueries: 2
};

// Função para sanitizar nomes de arquivo
function sanitizarNome(nome) {
    return nome.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 50);
}

// Função para extrair informações de função baseada no idioma
function extrairFuncaoEComentario(conteudo, extensao) {
    let funcoes = [];
    
    switch (extensao) {
        case '.java':
            const regexJava = /(\/\*\*[\s\S]*?\*\/)?\s*((?:public|private|protected|static|final|abstract|synchronized)\s+)*([\w<>]+)\s+(\w+)\s*\([^)]*\)\s*\{/g;
            let matchJava;
            while ((matchJava = regexJava.exec(conteudo)) !== null) {
                funcoes.push({
                    comentario: matchJava[1] ? matchJava[1].replace(/\/\*\*|\*\//g, '').replace(/^\s*\*\s?/gm, '').trim() : '',
                    nome: matchJava[4] // Nome do método agora está no grupo 4
                });
            }
            break;

        case '.js':
            const regexJS = /(\/\*\*[\s\S]*?\*\/)?\s*(function\s+(\w+)|const\s+(\w+)\s*=\s*\([^)]*\)\s*=>)/g;
            let matchJS;
            while ((matchJS = regexJS.exec(conteudo)) !== null) {
                funcoes.push({
                    comentario: matchJS[1] ? matchJS[1].replace(/\/\*\*|\*\//g, '').replace(/^\s*\*\s?/gm, '').trim() : '',
                    nome: matchJS[3] || matchJS[4]
                });
            }
            break;

        case '.py':
            const regexPython = /def\s+(\w+)\s*\(.*?\):\s*("""[\s\S]*?"""|'''[\s\S]*?''')?/g;
            let matchPython;
            while ((matchPython = regexPython.exec(conteudo)) !== null) {
                funcoes.push({
                    comentario: matchPython[2] ? matchPython[2].replace(/"""|'''/g, '').trim() : '',
                    nome: matchPython[1]
                });
            }
            break;
    }

    return funcoes.length > 0 ? funcoes[funcoes.length - 1] : { nome: 'Global', comentario: '' };
}

// Função para pré-processar e limpar a query
function preProcessarQuery(query) {
    // Remove trechos problemáticos com """
    query = query.replace(/"{3}[\s\S]*?"{3}/g, '');
    
    // Remove concatenações e espaços complexos
    query = query
        .replace(/"\s*\+\s*"/g, ' ') // Concatenação de strings
        .replace(/\s*\\n\s*/g, ' ') // Quebras de linha escapadas
        .replace(/\s+/g, ' ') // Espaços múltiplos
        .trim();

    // Filtra caracteres inválidos
    return query.replace(/[^\w\s\(\)\.,=*<>!@#\$%\^&\[\]{};:?\-]/g, '');
}

// Função para validar a query
function validarQuery(query) {
    const palavrasChaveValidas = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 
        'CREATE', 'ALTER', 'DROP', 'FROM', 
        'WHERE', 'JOIN', 'INTO', 'VALUES'
    ];

    return palavrasChaveValidas.some(palavra => 
        query.toUpperCase().includes(palavra)
    );
}

// Função para extrair queries com contexto
function extrairQueriesComContexto(caminhoArquivo) {
    try {
        const conteudo = fs.readFileSync(caminhoArquivo, 'utf8');
        const extensao = path.extname(caminhoArquivo);
        const padraoSQL = /((?:"{3}[\s\S]*?"{3})?((?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s[\s\S]*?)(?=;|$))/gi;
        
        return Array.from(conteudo.matchAll(padraoSQL))
            .map(match => {
                const contextoAnterior = conteudo.substring(0, match.index);
                const { nome, comentario } = extrairFuncaoEComentario(contextoAnterior, extensao);
                const queryBruta = match[2] || match[1];
                
                return {
                    query: preProcessarQuery(queryBruta),
                    funcao: nome,
                    descricao: comentario
                };
            })
            .filter(({ query }) => validarQuery(query)); // Filtra queries inválidas
    } catch (erro) {
        console.error(`Erro no arquivo ${caminhoArquivo}: ${erro.message}`);
        return [];
    }
}

// Função para salvar queries em arquivos
async function salvarQueries(queries) {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const contador = new Map();
    
    for (const { query, funcao, descricao } of queries) {
        try {
            const nomeBase = sanitizarNome(funcao);
            let contagem = contador.get(nomeBase) || 1;
            
            while (fs.existsSync(path.join(OUTPUT_DIR, `${nomeBase}_${contagem}.sql`))) {
                contagem++;
            }
            
            const nomeArquivo = `${nomeBase}_${contagem}.sql`;
            const conteudoArquivo = `-- Função: ${funcao}\n-- Descrição: ${descricao || 'Sem descrição'}\n\n${
                sqlFormatter.format(query, dialecto) // Usa dialecto específico
            }\n`;
            
            fs.writeFileSync(path.join(OUTPUT_DIR, nomeArquivo), conteudoArquivo);
            contador.set(nomeBase, contagem + 1);
        } catch (erro) {
            console.error(`Query inválida na função ${funcao}: ${erro.message}`);
        }
    }
}

// Função principal
async function processarRepositorio(diretorio) {
    try {
        const arquivos = await glob(`${diretorio}/**/*.{${EXTENSIONS_RELEVANTES.map(e => e.substring(1)).join(',')}}`, { nodir: true });
        const todasQueries = [];
        
        for (const arquivo of arquivos) {
            const queries = extrairQueriesComContexto(arquivo);
            if (queries.length > 0) {
                console.log(`Encontradas ${queries.length} queries em: ${arquivo}`);
                todasQueries.push(...queries);
            }
        }
        
        await salvarQueries(todasQueries);
        console.log(`Processamento completo! Arquivos salvos em: ${path.resolve(OUTPUT_DIR)}`);
        
    } catch (erro) {
        console.error(`Erro geral: ${erro.message}`);
    }
}

// Execução
const DIRETORIO_REPOSITORIO = '../GitHub/OrdemDeServico/dao'; // Substitua pelo caminho do repositório
processarRepositorio(DIRETORIO_REPOSITORIO);